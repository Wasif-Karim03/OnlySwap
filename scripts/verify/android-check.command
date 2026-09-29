#!/usr/bin/env bash
# Reports whether this Mac can build and run the Android app (SDK, emulator,
# Java). Output: android-check.log (git-ignored). Installs nothing.
cd "$(dirname "$0")/../.." || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
{
  echo "== $(date)"
  echo "ANDROID_HOME=${ANDROID_HOME:-unset}"
  for d in "$HOME/Library/Android/sdk" /opt/homebrew/share/android-commandlinetools; do [ -d "$d" ] && echo "sdk dir: $d" && ls "$d"; done
  ls "$HOME/Library/Android/sdk/emulator/emulator" 2>/dev/null && "$HOME/Library/Android/sdk/emulator/emulator" -list-avds
  ls -d "/Applications/Android Studio.app" 2>/dev/null
  /usr/libexec/java_home -V 2>&1 | head -5
  which java adb 2>&1
  df -h / | tail -1
} > android-check.log 2>&1
