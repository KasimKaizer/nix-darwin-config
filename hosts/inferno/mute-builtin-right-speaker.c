#include <CoreAudio/CoreAudio.h>
#include <CoreFoundation/CoreFoundation.h>
#include <dispatch/dispatch.h>
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

/* Apple HAL FourCC values used by this MacBook Air's output device. */
enum {
  kDataSourceInternalSpeakers = 'ispk',
  kDataSourceHeadphones = 'hdpn',
  kReapplyDelayMilliseconds = 250,
  kReapplyLeewayMilliseconds = 25,
};

static const AudioObjectPropertyAddress kDevicesAddr = {
    kAudioHardwarePropertyDevices, kAudioObjectPropertyScopeGlobal,
    kAudioObjectPropertyElementMain};
static const AudioObjectPropertyAddress kPanAddr = {
    kAudioDevicePropertyStereoPan, kAudioObjectPropertyScopeOutput,
    kAudioObjectPropertyElementMain};
static const AudioObjectPropertyAddress kSourceAddr = {
    kAudioDevicePropertyDataSource, kAudioObjectPropertyScopeOutput,
    kAudioObjectPropertyElementMain};
static const AudioObjectPropertyAddress kStereoAddr = {
    kAudioDevicePropertyPreferredChannelsForStereo,
    kAudioObjectPropertyScopeOutput, kAudioObjectPropertyElementMain};
static const AudioObjectPropertyAddress kTransportAddr = {
    kAudioDevicePropertyTransportType, kAudioObjectPropertyScopeGlobal,
    kAudioObjectPropertyElementMain};

static AudioObjectID g_watched = kAudioObjectUnknown;
static Boolean g_watching_source = FALSE;
static Boolean g_retry_used = FALSE;
static dispatch_queue_t g_work_queue;
static dispatch_source_t g_reapply_timer;

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
  if (has_source && source == (UInt32)kDataSourceHeadphones)
    return FALSE;
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

static Boolean source_is_classifiable(Boolean has_source, UInt32 source,
                                      const char *source_name) {
  return !has_source || source == (UInt32)kDataSourceInternalSpeakers ||
         source == (UInt32)kDataSourceHeadphones || source_name != NULL;
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
  CHECK(!is_internal_speakers(TRUE, kDataSourceHeadphones,
                              "External Headphones"));
  CHECK(!is_internal_speakers(TRUE, kDataSourceHeadphones, NULL));
  CHECK(is_internal_speakers(FALSE, 0, NULL));
  CHECK(!is_internal_speakers(TRUE, 'line', "Line Out"));
  CHECK(source_is_classifiable(TRUE, kDataSourceInternalSpeakers, NULL));
  CHECK(source_is_classifiable(TRUE, kDataSourceHeadphones, NULL));
  CHECK(source_is_classifiable(TRUE, kDataSourceHeadphones,
                               "External Headphones"));
  CHECK(source_is_classifiable(FALSE, 0, NULL));
  CHECK(pan_for_source(TRUE, kDataSourceInternalSpeakers,
                       "MacBook Air Speakers") == 0.0f);
  CHECK(pan_for_source(TRUE, kDataSourceHeadphones, "External Headphones") ==
        0.5f);
#undef CHECK
  if (failed)
    return 1;
  printf("self-test ok\n");
  return 0;
}

static OSStatus get_u32(AudioObjectID id,
                        const AudioObjectPropertyAddress *addr, UInt32 *out) {
  UInt32 size = sizeof(*out);
  return AudioObjectGetPropertyData(id, addr, 0, NULL, &size, out);
}

static char *copy_source_name(AudioObjectID id, UInt32 source) {
  AudioObjectPropertyAddress addr = {
      kAudioDevicePropertyDataSourceNameForIDCFString,
      kAudioObjectPropertyScopeOutput, kAudioObjectPropertyElementMain};
  CFStringRef name = NULL;
  AudioValueTranslation tr = {
      &source, sizeof(source), &name,
      sizeof(name)}; // NOLINT(bugprone-sizeof-expression)
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
  if (out == NULL || !CFStringGetCString(name, out, n, kCFStringEncodingUTF8)) {
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

static Boolean apply_pan(int verbose) {
  AudioObjectID id = find_builtin_speakers();
  Boolean has_source;
  UInt32 source = 0;
  char *source_name = NULL;
  Float32 target, current = 0.5f;
  UInt32 size;
  OSStatus err;
  if (id == kAudioObjectUnknown)
    return FALSE;
  has_source = AudioObjectHasProperty(id, &kSourceAddr);
  if (has_source) {
    UInt32 src_size = 0;
    err = AudioObjectGetPropertyDataSize(id, &kSourceAddr, 0, NULL, &src_size);
    if (err != noErr || src_size < sizeof(source)) {
      fprintf(stderr,
              "mute-builtin-right-speaker: cannot read data source err=%d "
              "size=%u\n",
              err, src_size);
      return FALSE;
    }
    err = get_u32(id, &kSourceAddr, &source);
    if (err != noErr) {
      fprintf(stderr,
              "mute-builtin-right-speaker: cannot read data source err=%d\n",
              err);
      return FALSE;
    }
    source_name = copy_source_name(id, source);
    if (!source_is_classifiable(has_source, source, source_name)) {
      fprintf(stderr, "mute-builtin-right-speaker: cannot classify data "
                      "source; leaving pan unchanged\n");
      return FALSE;
    }
  }
  target = pan_for_source(has_source, source, source_name);
  size = sizeof(current);
  err = AudioObjectGetPropertyData(id, &kPanAddr, 0, NULL, &size, &current);
  if (err != noErr) {
    fprintf(stderr, "mute-builtin-right-speaker: cannot read pan err=%d\n",
            err);
    free(source_name);
    return FALSE;
  }
  if (fabsf(current - target) < 0.01f) {
    if (verbose)
      fprintf(stderr, "mute-builtin-right-speaker: pan %.3f source=%s\n",
              current, source_name ? source_name : "(none)");
    free(source_name);
    return TRUE;
  }
  err = AudioObjectSetPropertyData(id, &kPanAddr, 0, NULL, sizeof(target),
                                   &target);
  if (verbose || err != noErr) {
    fprintf(stderr,
            "mute-builtin-right-speaker: pan %.3f -> %.3f source=%s err=%d\n",
            current, target, source_name ? source_name : "(none)", err);
  }
  free(source_name);
  return err == noErr;
}

static OSStatus on_change(AudioObjectID object, UInt32 n,
                          const AudioObjectPropertyAddress *addrs, void *data);

static Boolean add_listener(AudioObjectID id,
                            const AudioObjectPropertyAddress *addr,
                            const char *name) {
  OSStatus err = AudioObjectAddPropertyListener(id, addr, on_change, NULL);
  if (err == noErr)
    return TRUE;
  fprintf(stderr, "mute-builtin-right-speaker: cannot watch %s err=%d\n", name,
          err);
  return FALSE;
}

static void unwatch_speakers(void) {
  if (g_watched == kAudioObjectUnknown)
    return;
  AudioObjectRemovePropertyListener(g_watched, &kPanAddr, on_change, NULL);
  if (g_watching_source)
    AudioObjectRemovePropertyListener(g_watched, &kSourceAddr, on_change, NULL);
  g_watched = kAudioObjectUnknown;
  g_watching_source = FALSE;
}

static Boolean watch_speakers(void) {
  AudioObjectID id = find_builtin_speakers();
  if (id == g_watched)
    return TRUE;
  unwatch_speakers();
  if (id == kAudioObjectUnknown)
    return FALSE;
  if (!add_listener(id, &kPanAddr, "pan"))
    return FALSE;
  if (AudioObjectHasProperty(id, &kSourceAddr)) {
    if (!add_listener(id, &kSourceAddr, "data source")) {
      AudioObjectRemovePropertyListener(id, &kPanAddr, on_change, NULL);
      return FALSE;
    }
    g_watching_source = TRUE;
  }
  g_watched = id;
  return TRUE;
}

static Boolean apply_and_watch(void) {
  Boolean watching = watch_speakers();
  Boolean applied = apply_pan(0);
  return watching && applied;
}

static void arm_reapply_timer_after(UInt64 delay_milliseconds) {
  dispatch_source_set_timer(
      g_reapply_timer,
      dispatch_time(DISPATCH_TIME_NOW, delay_milliseconds * NSEC_PER_MSEC),
      DISPATCH_TIME_FOREVER, kReapplyLeewayMilliseconds * NSEC_PER_MSEC);
}

static void arm_reapply_timer(void *data) {
  (void)data;
  /* Repeated notifications reset this one-shot deadline, so the source has
     250 ms to settle without polling while the audio topology is idle. */
  g_retry_used = FALSE;
  arm_reapply_timer_after(kReapplyDelayMilliseconds);
}

static void retry_after_unsettled_state(void) {
  if (g_retry_used)
    return;
  g_retry_used = TRUE;
  arm_reapply_timer_after(kReapplyDelayMilliseconds);
}

static void on_reapply_timer(void *data) {
  (void)data;
  if (!apply_and_watch())
    retry_after_unsettled_state();
}

static void schedule_reapply(void) {
  dispatch_async_f(g_work_queue, NULL, arm_reapply_timer);
}

static OSStatus on_change(AudioObjectID object, UInt32 n,
                          const AudioObjectPropertyAddress *addrs, void *data) {
  (void)object;
  (void)n;
  (void)addrs;
  (void)data;
  schedule_reapply();
  return noErr;
}

static void initial_apply_and_watch(void *data) {
  (void)data;
  if (!apply_and_watch())
    retry_after_unsettled_state();
}

static int run_daemon(void) {
  OSStatus err;

  g_work_queue = dispatch_queue_create("mute-builtin-right-speaker",
                                       DISPATCH_QUEUE_SERIAL);
  if (g_work_queue == NULL) {
    fprintf(stderr, "mute-builtin-right-speaker: cannot create work queue\n");
    return 1;
  }
  g_reapply_timer =
      dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, g_work_queue);
  if (g_reapply_timer == NULL) {
    fprintf(stderr, "mute-builtin-right-speaker: cannot create timer\n");
    return 1;
  }
  dispatch_source_set_event_handler_f(g_reapply_timer, on_reapply_timer);
  dispatch_source_set_timer(g_reapply_timer, DISPATCH_TIME_FOREVER,
                            DISPATCH_TIME_FOREVER, 0);
  dispatch_activate(g_reapply_timer);

  /* Register before the first scan so an early topology change is not lost. */
  err = AudioObjectAddPropertyListener(kAudioObjectSystemObject, &kDevicesAddr,
                                       on_change, NULL);
  if (err != noErr) {
    fprintf(stderr,
            "mute-builtin-right-speaker: cannot watch audio devices err=%d\n",
            err);
    return 1;
  }
  dispatch_async_f(g_work_queue, NULL, initial_apply_and_watch);

  /* Legacy CoreAudio listeners are delivered through the main CF run loop. */
  CFRunLoopRun();
  return 0;
}

int main(int argc, char **argv) {
  if (argc == 2 && strcmp(argv[1], "--self-test") == 0)
    return self_test();
  if (argc == 2 && strcmp(argv[1], "--once") == 0)
    return apply_pan(1) ? 0 : 1;
  if (argc != 1) {
    fprintf(stderr, "usage: %s [--once|--self-test]\n", argv[0]);
    return 2;
  }
  return run_daemon();
}
