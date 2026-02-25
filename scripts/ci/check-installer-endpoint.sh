#!/usr/bin/env bash
set -euo pipefail

URL="$1"
EXPECTED_SHEBANG='#!/usr/bin/env bash'

if [[ -z "$URL" ]]; then
  echo "usage: $0 <installer-url>" >&2
  exit 1
fi

tmp_file="$(mktemp)"
cleanup() {
  rm -f "$tmp_file"
}
trap cleanup EXIT

curl --retry 3 --retry-delay 2 --retry-all-errors -fsSL "$URL" -o "$tmp_file"

first_line="$(head -n 1 "$tmp_file" || true)"
if [[ "$first_line" != "$EXPECTED_SHEBANG" ]]; then
  echo "Installer endpoint returned unexpected content for ${URL}" >&2
  echo "Expected first line: ${EXPECTED_SHEBANG}" >&2
  echo "Actual first line: ${first_line}" >&2
  exit 1
fi

if ! grep -q '^set -euo pipefail' "$tmp_file"; then
  echo "Installer endpoint script is missing strict shell flags for ${URL}" >&2
  exit 1
fi

echo "Installer endpoint check passed for ${URL}"
