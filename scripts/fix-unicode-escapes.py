"""
Replace literal `\\uXXXX` escape sequences (6 characters: backslash,
'u', 4 hex) with the actual Unicode character. JSX text content does
not interpret these escapes — they would otherwise render as the
literal six characters. Run once after a code import that left them
behind.
"""
import re
import sys

FILES = [
    r"C:/projects/fuelyn/apps/web/src/components/stations/PriceStats.tsx",
    r"C:/projects/fuelyn/apps/web/src/components/notifications/PriceAlertSettings.tsx",
    r"C:/projects/fuelyn/apps/web/src/app/station/[id]/page.tsx",
]

# Match backslash + 'u' + 4 hex digits. Note the doubled backslash in the
# raw string: r"\\u" is regex "\u" which matches a literal backslash
# followed by literal 'u'.
ESCAPE_RE = re.compile(r"\\u([0-9A-Fa-f]{4})")

# Cleanup pattern for the leftover \u from a prior failed run that
# replaced only the hex part. Backslash-u directly in front of an
# already-decoded character.
LEFTOVER_RE = re.compile(r"\\u(?=[üöäÜÖÄßØø€—])")


def replace_escape(m: re.Match) -> str:
    return chr(int(m.group(1), 16))


def main() -> int:
    total_changes = 0
    for path in FILES:
        try:
            with open(path, "r", encoding="utf-8") as fh:
                original = fh.read()
        except FileNotFoundError:
            print(f"skip (missing): {path}")
            continue

        fixed = ESCAPE_RE.sub(replace_escape, original)
        fixed = LEFTOVER_RE.sub("", fixed)

        if fixed != original:
            with open(path, "w", encoding="utf-8", newline="\n") as fh:
                fh.write(fixed)
            n_changes = sum(1 for _ in ESCAPE_RE.finditer(original)) + \
                        sum(1 for _ in LEFTOVER_RE.finditer(original))
            total_changes += n_changes
            print(f"fixed ({n_changes} escapes): {path}")
        else:
            print(f"no-op: {path}")

    print(f"\nTotal escapes replaced: {total_changes}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
