#!/usr/bin/env bash
# Decides which platforms an EAS Update on $CHANNEL can reach. Writes
# platform=android, platform=ios or platform=all to $GITHUB_OUTPUT, or
# platform= (empty) when no installed build could run the update.
#
# A build runs an update only when their runtime versions match. app.json uses
# the fingerprint policy, so a change to native code or native config (app.json,
# eas.json, a config plugin, a package with native code) gives a new runtime
# version. Builds made before that change cannot run updates made after it, so
# publishing one reaches no phone. This script leaves such a platform out and
# says why in the job log.
#
# Needs: eas (signed in through EXPO_TOKEN), jq, and `npm ci` already run.
# Optional: CHANNEL (default preview).
set -euo pipefail

channel=${CHANNEL:-preview}
output=${GITHUB_OUTPUT:-/dev/stdout}
matched=()

# Prints how many finished builds on the channel match the extra filters.
count_builds() {
  eas build:list --json --channel "$channel" --status finished --limit 1 "$@" | jq 'length'
}

for platform in android ios; do
  # The same command eas update uses to work out the runtime version.
  runtime=$(npx expo-updates runtimeversion:resolve --platform "$platform" | jq -r '.runtimeVersion')
  matching=$(count_builds --platform "$platform" --runtime-version "$runtime")
  if [ "$matching" -gt 0 ]; then
    echo "$platform: a finished $channel build has runtime version $runtime, so this update can reach it."
    matched+=("$platform")
    continue
  fi

  any=$(count_builds --platform "$platform")
  if [ "$any" -gt 0 ]; then
    echo "::warning title=No $platform update published::Native code or config changed since the last $channel build. The runtime version is now $runtime and no $platform build has it, so no installed app could run this update. Run 'eas build --profile $channel --platform $platform', install it, then rerun this workflow."
  else
    echo "$platform: there are no finished $channel builds, so there is nothing to update."
  fi
done

case ${#matched[@]} in
  0) platform="" ;;
  1) platform=${matched[0]} ;;
  *) platform=all ;;
esac

if [ -z "$platform" ]; then
  echo "No update will be published."
fi
echo "platform=$platform" >> "$output"
