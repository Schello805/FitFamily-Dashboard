#!/usr/bin/env python3
"""Remove obsolete update artifacts without touching shared application data."""

import argparse
import os
import re
import shutil
import stat
from pathlib import Path


def real_directory(path: Path) -> Path:
    metadata = path.lstat()
    if not stat.S_ISDIR(metadata.st_mode) or os.path.ismount(path):
        raise RuntimeError(f"Unsafe cleanup directory: {path}")
    return path.resolve(strict=True)


def safe_files(directory: Path, pattern: str) -> list[Path]:
    return [entry for entry in directory.iterdir()
            if re.fullmatch(pattern, entry.name) and stat.S_ISREG(entry.lstat().st_mode)]


def cleanup(app_dir: Path, state_dir: Path, apply: bool) -> list[Path]:
    app_dir = real_directory(app_dir)
    releases = real_directory(app_dir / "releases")
    backups = real_directory(app_dir / "backups")
    state_dir = real_directory(state_dir)
    current_link = app_dir / "current"
    if not current_link.is_symlink():
        raise RuntimeError("Active release link is missing")
    active = current_link.resolve(strict=True)
    if active.parent != releases or not (active / ".next" / "BUILD_ID").is_file():
        raise RuntimeError("Active release is outside releases or incomplete")

    completed = []
    failed = []
    for entry in releases.iterdir():
        if not stat.S_ISDIR(entry.lstat().st_mode) or os.path.ismount(entry):
            continue
        # Releases are created by mktemp. Leave unknown directories untouched.
        if not re.fullmatch(r"\.building\.[A-Za-z0-9]{8}", entry.name):
            continue
        if (entry / ".next" / "BUILD_ID").is_file():
            completed.append(entry)
        elif entry != active:
            failed.append(entry)
    completed.sort(key=lambda item: item.stat().st_mtime_ns, reverse=True)
    retained = {active}
    retained.update(item for item in completed if item != active and len(retained) < 3)
    obsolete = [item for item in completed if item not in retained] + failed

    snapshots = [entry for entry in state_dir.iterdir()
                 if re.fullmatch(r"pre-update\.[A-Za-z0-9]{8}", entry.name)
                 and stat.S_ISDIR(entry.lstat().st_mode) and not os.path.ismount(entry)]
    snapshots.sort(key=lambda item: item.stat().st_mtime_ns, reverse=True)
    obsolete.extend(snapshots[3:])

    update_backups = safe_files(backups, r"fitfamily-pre-update-[a-f0-9-]{36}\.db")
    update_backups.sort(key=lambda item: item.stat().st_mtime_ns, reverse=True)
    obsolete.extend(update_backups[3:])

    for entry in obsolete:
        print(f"{'REMOVE' if apply else 'WOULD REMOVE'} {entry}", flush=True)
        if apply:
            if stat.S_ISDIR(entry.lstat().st_mode):
                shutil.rmtree(entry)
            else:
                entry.unlink()
    return obsolete


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-dir", type=Path, default=Path("/opt/fitfamily"))
    parser.add_argument("--state-dir", type=Path, default=Path("/var/lib/fitfamily"))
    parser.add_argument("--apply", action="store_true", help="Delete listed artifacts; default is preview")
    args = parser.parse_args()
    cleanup(args.app_dir, args.state_dir, args.apply)
