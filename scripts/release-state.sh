#!/usr/bin/env bash
# This file is installed root-owned beside the update worker.
activate_release() {
  local app_dir="$1" release="$2" operation="$3"
  [[ "$release" == "$app_dir/releases/"* && -d "$release" && -f "$release/.next/BUILD_ID" ]] || return 1
  [[ ! -e "$app_dir/current" || -L "$app_dir/current" ]] || return 1
  ln -s "$release" "$app_dir/.current-$operation"
  /usr/bin/python3 -c 'import os,sys; os.replace(sys.argv[1],sys.argv[2])' "$app_dir/.current-$operation" "$app_dir/current"
}

restore_release() {
  local app_dir="$1" previous="$2" operation="$3"
  [[ -d "$previous" && -f "$previous/.next/BUILD_ID" ]] || return 1
  ln -s "$previous" "$app_dir/.current-rollback-$operation"
  /usr/bin/python3 -c 'import os,sys; os.replace(sys.argv[1],sys.argv[2])' "$app_dir/.current-rollback-$operation" "$app_dir/current"
}

# Only refresh the fixed helper allowlist from the root-owned, frozen release.
# Stage all files first; restore the old bytes if any replacement fails.
refresh_release_helpers() {
  /usr/bin/python3 - "$1" "$2" <<'PY'
import os, pathlib, re, shutil, stat, sys, tempfile, urllib.request
release = pathlib.Path(sys.argv[1])
revision = sys.argv[2]
destination = pathlib.Path('/usr/local/libexec')
helpers = {
    'update.sh': ('fitfamily-update', 0o755),
    'release-state.sh': ('fitfamily-release-state', 0o644),
    'request-update.sh': ('fitfamily-update-request', 0o755),
    'mount-nas.py': ('fitfamily-mount', 0o755),
    'restore-db.sh': ('fitfamily-restore', 0o755),
}
if os.geteuid() != 0 or not str(release).startswith('/opt/fitfamily/releases/') or not re.fullmatch('[a-f0-9]{40}', revision):
    raise RuntimeError('Untrusted helper release')
for directory in [release, release / 'scripts', destination, *release.parents, *destination.parents]:
    metadata = directory.lstat()
    if not stat.S_ISDIR(metadata.st_mode) or metadata.st_uid != 0 or metadata.st_mode & 0o022:
        raise RuntimeError('Untrusted helper directory: ' + str(directory))
for source in helpers:
    metadata = (release / 'scripts' / source).lstat()
    if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0 or metadata.st_mode & 0o022:
        raise RuntimeError('Untrusted helper source: ' + source)
    # npm install/build ran as the service user and could have edited these files.
    # Ownership alone is insufficient: compare against the fixed GitHub commit
    # over HTTPS before installing any of their bytes as privileged code.
    url = 'https://raw.githubusercontent.com/Schello805/FitFamily-Dashboard/' + revision + '/scripts/' + source
    with urllib.request.urlopen(url, timeout=15) as response:
        trusted = response.read(1024 * 1024 + 1)
    if len(trusted) > 1024 * 1024 or trusted != (release / 'scripts' / source).read_bytes():
        raise RuntimeError('Helper differs from trusted GitHub revision: ' + source)
with tempfile.TemporaryDirectory(prefix='.fitfamily-helpers-', dir=destination) as work:
    work = pathlib.Path(work)
    replaced = []
    for source, (name, mode) in helpers.items():
        target = destination / name
        metadata = target.lstat()
        if not stat.S_ISREG(metadata.st_mode) or metadata.st_uid != 0 or metadata.st_mode & 0o022:
            raise RuntimeError('Untrusted installed helper: ' + name)
        shutil.copy2(target, work / (name + '.old'))
        shutil.copyfile(release / 'scripts' / source, work / name)
        os.chmod(work / name, mode)
    try:
        for name, _ in helpers.values():
            os.replace(work / name, destination / name)
            replaced.append(name)
    except BaseException:
        for name in reversed(replaced):
            os.replace(work / (name + '.old'), destination / name)
        raise
PY
}
