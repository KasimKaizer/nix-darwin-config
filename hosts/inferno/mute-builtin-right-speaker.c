#include <CoreAudio/CoreAudio.h>
#include <CoreFoundation/CoreFoundation.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Apple HAL FourCC for the built-in speaker jack (this MacBook Air: 'ispk'). */
enum { kDataSourceInternalSpeakers = 'ispk' };

static const AudioObjectPropertyAddress kDevicesAddr = {
    kAudioHardwarePropertyDevices,
    kAudioObjectPropertyScopeGlobal,
    kAudioObjectPropertyElementMain};
static const AudioObjectPropertyAddress kPanAddr = {
    kAudioDevicePropertyStereoPan,
    kAudioObjectPropertyScopeOutput,
    kAudioObjectPropertyElementMain};
static const AudioObjectPropertyAddress kSourceAddr = {
    kAudioDevicePropertyDataSource,
    kAudioObjectPropertyScopeOutput,
    kAudioObjectPropertyElementMain};
static const AudioObjectPropertyAddress kStereoAddr = {
    kAudioDevicePropertyPreferredChannelsForStereo,
    kAudioObjectPropertyScopeOutput,
    kAudioObjectPropertyElementMain};
static const AudioObjectPropertyAddress kTransportAddr = {
    kAudioDevicePropertyTransportType,
    kAudioObjectPropertyScopeGlobal,
    kAudioObjectPropertyElementMain};

static AudioObjectID g_watched = kAudioObjectUnknown;

static Boolean contains_ci(const char *hay, const char *needle) {
  size_t n;
  const char *p;
  if (hay == NULL || needle == NULL)
    return FALSE;
  n = strlen(needle);
  if (n == 0)
    return TRUE;
  for (p = hay; *p != '\0'; p++) {
    size_t i = 0;
    while (i < n && p[i] != '\0') {
      char a = p[i];
      char b = needle[i];
      if (a >= 'A' && a <= 'Z')
        a = (char)(a - 'A' + 'a');
      if (b >= 'A' && b <= 'Z')
        b = (char)(b - 'A' + 'a');
      if (a != b)
        break;
      i++;
    }
    if (i == n)
      return TRUE;
  }
  return FALSE;
}

static Boolean is_internal_speakers(Boolean has_source, UInt32 source,
                                    const char *source_name) {
  if (contains_ci(source_name, "headphone"))
    return FALSE;
  if (has_source && source == (UInt32)kDataSourceInternalSpeakers)
    return TRUE;
  if (contains_ci(source_name, "speaker"))
    return TRUE;
  if (has_source)
    return FALSE;
  return TRUE;
}

/* Full left on built-in speakers (right driver off). Center on the headphone
   jack of the same device. Bluetooth/USB are never touched.
   AudioHardware.h: StereoPan 0.0 = full left, 0.5 = center. */
static Float32 pan_for_source(Boolean has_source, UInt32 source,
                              const char *source_name) {
  return is_internal_speakers(has_source, source, source_name) ? 0.0f : 0.5f;
}

static int self_test(void) {
  int failed = 0;
#define CHECK(cond)                                                            \
  do {                                                                         \
    if (!(cond)) {                                                             \
      fprintf(stderr, "self-test failed: %s\n", #cond);                        \
      failed = 1;                                                              \
    }                                                                          \
  } while (0)
  CHECK(is_internal_speakers(TRUE, kDataSourceInternalSpeakers,
                             "MacBook Air Speakers"));
  CHECK(!is_internal_speakers(TRUE, 'hdpn', "External Headphones"));
  CHECK(!is_internal_speakers(TRUE, 'hdpn', NULL));
  CHECK(is_internal_speakers(FALSE, 0, NULL));
  CHECK(!is_internal_speakers(TRUE, 'line', "Line Out"));
  CHECK(pan_for_source(TRUE, kDataSourceInternalSpeakers,
                       "MacBook Air Speakers") == 0.0f);
  CHECK(pan_for_source(TRUE, 'hdpn', "External Headphones") == 0.5f);
#undef CHECK
  if (failed)
    return 1;
  printf("self-test ok\n");
  return 0;
}

static OSStatus get_u32(AudioObjectID id, const AudioObjectPropertyAddress *addr,
                        UInt32 *out) {
  UInt32 size = sizeof(*out);
  return AudioObjectGetPropertyData(id, addr, 0, NULL, &size, out);
}

static char *copy_source_name(AudioObjectID id, UInt32 source) {
  AudioObjectPropertyAddress addr = {
      kAudioDevicePropertyDataSourceNameForIDCFString,
      kAudioObjectPropertyScopeOutput, kAudioObjectPropertyElementMain};
  CFStringRef name = NULL;
  AudioValueTranslation tr = {&source, sizeof(source), &name, sizeof(name)};
  UInt32 size = sizeof(tr);
  char *out;
  CFIndex n;
  if (!AudioObjectHasProperty(id, &addr))
    return NULL;
  if (AudioObjectGetPropertyData(id, &addr, 0, NULL, &size, &tr) != noErr ||
      name == NULL)
    return NULL;
  n = CFStringGetMaximumSizeForEncoding(CFStringGetLength(name),
                                        kCFStringEncodingUTF8) +
      1;
  out = malloc((size_t)n);
  if (out == NULL ||
      !CFStringGetCString(name, out, n, kCFStringEncodingUTF8)) {
    free(out);
    CFRelease(name);
    return NULL;
  }
  CFRelease(name);
  return out;
}

static AudioObjectID find_builtin_speakers(void) {
  UInt32 size = 0;
  AudioObjectID *devs;
  UInt32 n, i;
  AudioObjectID found = kAudioObjectUnknown;
  if (AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &kDevicesAddr, 0,
                                     NULL, &size) != noErr ||
      size == 0)
    return kAudioObjectUnknown;
  devs = malloc(size);
  if (devs == NULL)
    return kAudioObjectUnknown;
  if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &kDevicesAddr, 0,
                                 NULL, &size, devs) != noErr) {
    free(devs);
    return kAudioObjectUnknown;
  }
  n = size / sizeof(AudioObjectID);
  for (i = 0; i < n; i++) {
    UInt32 transport = 0;
    if (get_u32(devs[i], &kTransportAddr, &transport) != noErr)
      continue;
    if (transport != kAudioDeviceTransportTypeBuiltIn)
      continue;
    if (AudioObjectHasProperty(devs[i], &kStereoAddr) &&
        AudioObjectHasProperty(devs[i], &kPanAddr)) {
      found = devs[i];
      break;
    }
  }
  free(devs);
  return found;
}

static void apply_pan(int verbose) {
  AudioObjectID id = find_builtin_speakers();
  Boolean has_source;
  UInt32 source = 0;
  char *source_name = NULL;
  Float32 target, current = 0.5f;
  UInt32 size;
  OSStatus err;
  if (id == kAudioObjectUnknown)
    return;
  has_source = AudioObjectHasProperty(id, &kSourceAddr);
  if (has_source) {
    UInt32 src_size = 0;
    if (AudioObjectGetPropertyDataSize(id, &kSourceAddr, 0, NULL, &src_size) ==
            noErr &&
        src_size >= sizeof(UInt32)) {
      get_u32(id, &kSourceAddr, &source);
      source_name = copy_source_name(id, source);
    }
  }
  target = pan_for_source(has_source, source, source_name);
  size = sizeof(current);
  err = AudioObjectGetPropertyData(id, &kPanAddr, 0, NULL, &size, &current);
  if (err == noErr && fabsf(current - target) < 0.01f) {
    if (verbose)
      fprintf(stderr, "mute-builtin-right-speaker: pan %.3f source=%s\n",
              current, source_name ? source_name : "(none)");
    free(source_name);
    return;
  }
  err = AudioObjectSetPropertyData(id, &kPanAddr, 0, NULL, sizeof(target),
                                   &target);
  if (verbose || err != noErr) {
    fprintf(stderr,
            "mute-builtin-right-speaker: pan %.3f -> %.3f source=%s err=%d\n",
            current, target, source_name ? source_name : "(none)", err);
  }
  free(source_name);
}

static OSStatus on_change(AudioObjectID object, UInt32 n,
                          const AudioObjectPropertyAddress *addrs,
                          void *data);

static void watch_speakers(void) {
  AudioObjectID id = find_builtin_speakers();
  if (id == g_watched)
    return;
  if (g_watched != kAudioObjectUnknown) {
    AudioObjectRemovePropertyListener(g_watched, &kPanAddr, on_change, NULL);
    AudioObjectRemovePropertyListener(g_watched, &kSourceAddr, on_change, NULL);
  }
  g_watched = id;
  if (id == kAudioObjectUnknown)
    return;
  AudioObjectAddPropertyListener(id, &kPanAddr, on_change, NULL);
  if (AudioObjectHasProperty(id, &kSourceAddr))
    AudioObjectAddPropertyListener(id, &kSourceAddr, on_change, NULL);
}

static void apply_and_watch(void) {
  apply_pan(0);
  watch_speakers();
}

static OSStatus on_change(AudioObjectID object, UInt32 n,
                          const AudioObjectPropertyAddress *addrs, void *data) {
  (void)object;
  (void)n;
  (void)addrs;
  (void)data;
  apply_and_watch();
  return noErr;
}

static void on_timer(CFRunLoopTimerRef timer, void *info) {
  (void)timer;
  (void)info;
  apply_and_watch();
}

static int run_daemon(void) {
  apply_and_watch();
  AudioObjectAddPropertyListener(kAudioObjectSystemObject, &kDevicesAddr,
                                 on_change, NULL);
  CFRunLoopAddTimer(
      CFRunLoopGetCurrent(),
      CFRunLoopTimerCreate(kCFAllocatorDefault, CFAbsoluteTimeGetCurrent() + 15,
                           15.0, 0, 0, on_timer, NULL),
      kCFRunLoopDefaultMode);
  CFRunLoopRun();
  return 0;
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--self-test") == 0)
    return self_test();
  if (argc == 2 && strcmp(argv[1], "--once") == 0) {
    apply_pan(1);
    return 0;
  }
  if (argc != 1) {
    fprintf(stderr, "usage: %s [--once|--self-test]\n", argv[0]);
    return 2;
  }
  return run_daemon();
}
