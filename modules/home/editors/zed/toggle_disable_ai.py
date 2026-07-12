#!/usr/bin/env python3
"""Flip the "disable_ai" boolean in the live Zed settings file.

Bound to cmd-: / cmd-shift-; via keymap.json + tasks.json. Operates on the
mutable copy at ~/.config/zed/settings.json; the change is reset to the repo
baseline on the next `nixswitch`. @ZED_DIR@ is expanded at build time.
"""

import re
import sys
from pathlib import Path

settings_path = Path("@ZED_DIR@/settings.json")
text = settings_path.read_text()
pattern = r"(\"disable_ai\"\s*:\s*)(true|false)"
match = re.search(pattern, text)
if not match:
    sys.exit("disable_ai setting not found in " + str(settings_path))
new_value = "false" if match.group(2) == "true" else "true"
updated = text[: match.start(2)] + new_value + text[match.end(2) :]
settings_path.write_text(updated)
print("disable_ai: " + new_value)
