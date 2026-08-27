#!/usr/bin/env python3
"""Re-splice db/anvaya_schema.sql from db/migrations/*.sql.

anvaya_schema.sql is the single-file build: the same content as db/migrations/,
concatenated between "-- >>>> <file>" banners. Any migration edit must be
reflected there, or the two builds silently diverge.

Usage: python3 db/harness/resplice_schema.py [--check]
  --check   exit non-zero if anvaya_schema.sql is out of sync; write nothing.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SCHEMA = ROOT / "db" / "anvaya_schema.sql"
MIGRATIONS = ROOT / "db" / "migrations"
BANNER = "-- " + "=" * 76
MARKER = "-- >>>> "


def content_lines(path: pathlib.Path) -> list[str]:
    """File content as lines, without the empty element produced by the final newline."""
    parts = path.read_text().split("\n")
    if parts and parts[-1] == "":
        parts.pop()
    return parts


def splice() -> str:
    current = SCHEMA.read_text().split("\n")
    marks = [i for i, l in enumerate(current) if l.startswith(MARKER)]
    if not marks:
        sys.exit(f"no '{MARKER.strip()}' markers found in {SCHEMA}")

    # Everything above the first block's banner is the file header.
    out = current[: marks[0] - 1]

    names = [current[i][len(MARKER):] for i in marks]
    ordered = [p.name for p in sorted(MIGRATIONS.glob("*.sql"))]
    if names != ordered:
        sys.exit(f"marker order {names} != migration order {ordered}")

    for pos, name in enumerate(names):
        out += [BANNER, MARKER + name, BANNER, ""]
        out += content_lines(MIGRATIONS / name)
        if pos + 1 < len(names):
            out.append("")

    return "\n".join(out) + "\n"


def main() -> None:
    generated = splice()
    current = SCHEMA.read_text()
    if "--check" in sys.argv:
        if generated == current:
            print("anvaya_schema.sql is byte-for-byte in sync with db/migrations/")
            return
        a, b = current.split("\n"), generated.split("\n")
        for i, (x, y) in enumerate(zip(a, b)):
            if x != y:
                print(f"OUT OF SYNC at line {i + 1}\n  schema.sql: {x!r}\n  migrations: {y!r}")
                break
        else:
            print(f"OUT OF SYNC: {len(a)} lines vs {len(b)}")
        sys.exit(1)

    SCHEMA.write_text(generated)
    print(f"re-spliced {SCHEMA.relative_to(ROOT)} from {len(names_of())} migrations")


def names_of() -> list[str]:
    return [p.name for p in sorted(MIGRATIONS.glob("*.sql"))]


if __name__ == "__main__":
    main()
