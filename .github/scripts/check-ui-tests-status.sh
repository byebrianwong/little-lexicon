#!/usr/bin/env bash
# Passes only when Chromatic's "UI Tests" commit status on $SHA is success.
#
# The Chromatic CLI's exit code is not enough on its own. When TurboSnap
# bypasses a build (no story's files changed), the CLI exits 0 without
# looking at any tests, even when an earlier build on the branch still has
# changes waiting for review or is still running. Chromatic does carry that
# earlier build's result over to the "UI Tests" status it posts on the
# commit, so this script reads that status instead.
#
# Needs: GH_TOKEN (with statuses: read), GITHUB_REPOSITORY, SHA.
# Optional: TIMEOUT_SECONDS (default 300), INTERVAL_SECONDS (default 10).
set -euo pipefail

timeout=${TIMEOUT_SECONDS:-300}
interval=${INTERVAL_SECONDS:-10}
deadline=$((SECONDS + timeout))

fail() {
  echo "::error title=Chromatic UI Tests::$1"
  exit 1
}

while true; do
  # The combined status holds the newest status for each context.
  if ! status=$(gh api "repos/$GITHUB_REPOSITORY/commits/$SHA/status" \
    --jq '.statuses[] | select(.context == "UI Tests") | [.state, .description, .target_url] | @tsv'); then
    echo "::warning::Could not read the commit status for $SHA. Trying again."
    status=""
  fi
  IFS=$'\t' read -r state description url <<< "$status"

  case "$state" in
    success)
      echo "UI Tests passed: $description ($url)"
      exit 0
      ;;
    failure | error)
      fail "UI Tests is $state: $description. See $url"
      ;;
  esac

  # Still pending. A build that is running will finish, but one waiting for
  # review will not, so stop early when Chromatic says so. This can only make
  # the step fail sooner. Passing always needs the status to be success.
  if [[ "$description" == *"must be accepted"* ]]; then
    fail "$description. The build it comes from may be an earlier one on this branch. Review it at $url, then re-run this job."
  fi

  if ((SECONDS >= deadline)); then
    if [[ -z "$state" ]]; then
      fail "Chromatic posted no UI Tests status on $SHA within ${timeout}s."
    fi
    fail "UI Tests was still pending after ${timeout}s: $description. See $url"
  fi

  echo "UI Tests is ${state:-not posted yet}${description:+ ($description)}. Checking again in ${interval}s."
  sleep "$interval"
done
