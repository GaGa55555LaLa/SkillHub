#!/usr/bin/env python3
"""Reads a SkillHub download_skill JSON response from stdin and writes the
files to <dest_root>/<suggested_dir_name>/. See ../SKILL.md for why
suggested_dir_name (not name) is used as the folder name.
"""
import json
import os
import sys


def main() -> None:
    if len(sys.argv) != 2:
        print("Usage: write_files.py <dest_root>", file=sys.stderr)
        sys.exit(1)
    dest_root = sys.argv[1]

    data = json.load(sys.stdin)
    dir_name = data["suggested_dir_name"]
    target = os.path.abspath(os.path.join(dest_root, dir_name))

    for f in data["files"]:
        path = os.path.abspath(os.path.join(target, f["path"]))
        if not (path == target or path.startswith(target + os.sep)):
            raise ValueError(f"refusing to write outside target dir: {f['path']!r}")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as out:
            out.write(f["content"])

    print(f"Installed '{data['name']}' to {target}")


if __name__ == "__main__":
    main()
