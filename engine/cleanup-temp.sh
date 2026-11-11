#!/bin/sh
# Remove only stale runtime temporary/result files. Model and dependency volumes
# are deliberately outside these roots and are never touched by this cleaner.
set -eu

TEMP_ROOT="${MITA_TEMP_ROOT:-${TMPDIR:-/tmp/manga-indo-temp}}"
RESULT_ROOT="${MITA_RESULT_ROOT:-/app/result}"
RETENTION_MINUTES="${MITA_RETENTION_MINUTES:-1440}"
CLEANUP_INTERVAL_SECONDS="${MITA_CLEANUP_INTERVAL_SECONDS:-900}"
CLEANUP_ONCE="${MITA_CLEANUP_ONCE:-0}"

case "$RETENTION_MINUTES" in
  ''|*[!0-9]*) echo "MITA_RETENTION_MINUTES must be a positive integer." >&2; exit 2 ;;
esac
case "$CLEANUP_INTERVAL_SECONDS" in
  ''|*[!0-9]*) echo "MITA_CLEANUP_INTERVAL_SECONDS must be a positive integer." >&2; exit 2 ;;
esac

mkdir -p "$TEMP_ROOT" "$RESULT_ROOT"

cleanup_root() {
  root="$1"
  label="$2"
  [ -d "$root" ] || return 0

  deleted_files="$(find "$root" -xdev -type f -mmin "+$RETENTION_MINUTES" -print -delete 2>/dev/null | wc -l | tr -d '[:space:]')"
  deleted_dirs="$(find "$root" -xdev -depth -mindepth 1 -type d -empty -mmin "+$RETENTION_MINUTES" -print -delete 2>/dev/null | wc -l | tr -d '[:space:]')"

  if [ "${deleted_files:-0}" -gt 0 ] || [ "${deleted_dirs:-0}" -gt 0 ]; then
    printf '24-hour cleanup: %s: removed %s files and %s empty folders.\n' "$label" "${deleted_files:-0}" "${deleted_dirs:-0}"
  fi
}

cleanup_expired_files() {
  cleanup_root "$TEMP_ROOT" "temporary workspace"
  cleanup_root "$RESULT_ROOT" "translation results"
}

# Run once immediately on container startup, then repeat every 15 minutes.
cleanup_expired_files

if [ "$CLEANUP_ONCE" = "1" ]; then
  exit 0
fi

while :; do
  sleep "$CLEANUP_INTERVAL_SECONDS"
  cleanup_expired_files
done
