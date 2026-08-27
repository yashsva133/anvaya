#!/usr/bin/env python3
"""Check db/sql_editor_parts/*.sql against db/migrations/*.sql.

Each part file must be exactly:

    header comments (with one `- db/migrations/<name>` line per migration)
    -- >>> BEGIN db/migrations/<name>
    <byte-for-byte content of db/migrations/<name>>
    -- >>> BEGIN ... / -- <<< END ...
    -- <<< END db/migrations/<last name>

so an edit to any migration silently diverging from the paste-and-run parts is
caught before an operator runs the stale part. This is the parts/ counterpart
of resplice_schema.py, which does the same job for the single-file build.

Usage: python3 db/harness/resplice_parts.py [--check]
  --check   exit non-zero on drift; write nothing (the parts are checked, not
            regenerated, so their hand-written headers stay authoritative).
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
PARTS = ROOT / "db" / "sql_editor_parts"
MIGRATIONS = ROOT / "db" / "migrations"

BLOCK_RE = re.compile(
    r"-- >>> BEGIN db/migrations/(?P<name>.+?)\n"
    r"(?P<body>.*?)"
    r"-- <<< END db/migrations/(?P=name)\n?",
    re.S,
)
HEADER_LIST_RE = re.compile(r"^--\s+- db/migrations/(.+)$", re.M)


def check_part(part: pathlib.Path) -> list[str]:
    errors: list[str] = []
    text = part.read_text()

    blocks = BLOCK_RE.findall(text)
    if not blocks:
        return [f"{part.name}: no '>>> BEGIN db/migrations/<name>' blocks found"]

    listed = [m.removesuffix(".sql") for m in HEADER_LIST_RE.findall(text)]
    names = [name for name, _ in blocks]
    if listed != [n.removesuffix(".sql") for n in names]:
        errors.append(
            f"{part.name}: header lists {listed} but file contains blocks {names}"
        )

    ordered = sorted(p.name for p in MIGRATIONS.glob("*.sql"))
    for name, body in blocks:
        if name not in ordered:
            errors.append(f"{part.name}: block references unknown migration {name}")
            continue
        migration = (MIGRATIONS / name).read_text().rstrip("\n")
        if migration != body.rstrip("\n"):
            a, b = migration.split("\n"), body.rstrip("\n").split("\n")
            where = "line counts differ ({} vs {})".format(len(a), len(b))
            for i, (x, y) in enumerate(zip(a, b)):
                if x != y:
                    where = f"first differing line {i + 1}"
                    break
            errors.append(
                f"{part.name}: block {name} has drifted from db/migrations/{name} ({where})"
            )
    return errors


def main() -> None:
    parts = sorted(PARTS.glob("0*.sql"))
    if not parts:
        sys.exit(f"no part files found in {PARTS}")

    errors = [e for part in parts for e in check_part(part)]
    if errors:
        for e in errors:
            print(e)
        sys.exit("sql_editor_parts are OUT OF SYNC with db/migrations/")

    total = sum(len(BLOCK_RE.findall(p.read_text())) for p in parts)
    print(f"all {len(parts)} sql_editor_parts match db/migrations/ ({total} blocks)")


if __name__ == "__main__":
    main()
