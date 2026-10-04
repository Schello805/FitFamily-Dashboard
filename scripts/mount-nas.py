#!/usr/bin/python3
"""Root-owned fixed-target NAS helper; never accepts executable/command paths."""
import json
import fcntl
import os
import pwd
import re
import subprocess
import sys
import tempfile
import uuid

TARGET = '/mnt/nas/fitfamily'
STORE = '/var/lib/fitfamily/nas'
CONFIG = STORE + '/connection.json'
UNIT_DIRECTORY = '/etc/systemd/system'

def ensure_store():
    os.makedirs(STORE, mode=0o700, exist_ok=True)
    metadata = os.lstat(STORE)
    if os.path.realpath(STORE) != STORE or metadata.st_uid != 0 or metadata.st_mode & 0o077:
        raise ValueError('NAS-Konfigurationsverzeichnis ist nicht sicher.')

def saved_configuration():
    if not os.path.exists(CONFIG):
        return None
    directory = os.lstat(STORE)
    if os.path.realpath(STORE) != STORE or directory.st_uid != 0 or directory.st_mode & 0o077:
        raise ValueError('NAS-Konfigurationsverzeichnis ist nicht sicher.')
    metadata = os.lstat(CONFIG)
    if os.path.islink(CONFIG) or metadata.st_uid != 0 or metadata.st_mode & 0o077:
        raise ValueError('NAS-Konfiguration ist nicht sicher gespeichert.')
    with open(CONFIG) as stream:
        return json.load(stream)

def persist(data):
    ensure_store()
    fd, temporary = tempfile.mkstemp(dir=STORE)
    try:
        with os.fdopen(fd, 'w') as stream:
            json.dump(data, stream)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, CONFIG)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    unit = '''[Unit]
Description=FitFamily NAS-Verbindung
After=network-online.target
Wants=network-online.target
ConditionPathExists=/var/lib/fitfamily/nas/connection.json

[Service]
Type=oneshot
ExecStart=/usr/local/libexec/fitfamily-mount --restore
RemainAfterExit=yes
Restart=on-failure
RestartSec=30

[Install]
WantedBy=multi-user.target
'''
    unit_path = UNIT_DIRECTORY + '/fitfamily-nas.service'
    fd, temporary = tempfile.mkstemp(dir=UNIT_DIRECTORY, prefix='.fitfamily-nas-')
    try:
        with os.fdopen(fd, 'w') as stream:
            stream.write(unit)
        os.chmod(temporary, 0o644)
        os.replace(temporary, unit_path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    subprocess.run(['/usr/bin/systemctl', 'daemon-reload'], check=True, capture_output=True, timeout=10)
    subprocess.run(['/usr/bin/systemctl', 'enable', 'fitfamily-nas.service'], check=True, capture_output=True, timeout=10)

def configuration():
    data = json.loads(sys.stdin.read(16385))
    if not isinstance(data, dict):
        raise ValueError('Ungültige NAS-Konfiguration.')
    server = str(data.get('server', '')).strip()
    share = str(data.get('share', '')).strip().replace('\\', '/').strip('/')
    username = str(data.get('username', '')).strip()
    password = str(data.get('password', ''))
    if not re.fullmatch(r'[A-Za-z0-9._:-]{1,253}', server):
        raise ValueError('Ungültige Serveradresse.')
    if not share or any(not part or part in ('.', '..') or any(c in part for c in ',\n\r\x00') for part in share.split('/')):
        raise ValueError('Ungültige Freigabe.')
    if any(c in username + password for c in '\n\r\x00'):
        raise ValueError('Ungültige Zugangsdaten.')
    if data.get('mountPath', TARGET) != TARGET:
        raise ValueError('NAS-Freigaben dürfen nur unter /mnt/nas/fitfamily eingehängt werden.')
    return dict(server=server, share=share, username=username, password=password, mountPath=TARGET)

def worker(data, restore=False):
    ensure_store()
    fd = os.open(STORE + '/mount.lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        mount_and_save(data, restore)

def mount_and_save(data, restore=False):
    for directory in ('/mnt', '/mnt/nas', TARGET):
        if os.path.realpath(directory) != directory:
            raise ValueError('Der NAS-Einhängepfad darf keine symbolischen Links enthalten.')
        os.makedirs(directory, mode=0o755, exist_ok=True)
    parent = os.stat('/mnt/nas')
    if parent.st_uid != 0 or parent.st_mode & 0o022:
        raise ValueError('/mnt/nas muss root gehören und darf nicht allgemein beschreibbar sein.')
    account = pwd.getpwnam('fitfamily')
    parts = data['share'].split('/')
    options = ['rw', 'nosuid', 'nodev', 'noexec', 'file_mode=0660', 'dir_mode=0770', f'uid={account.pw_uid}', f'gid={account.pw_gid}']
    if len(parts) > 1:
        options.append('prefixpath=' + '/'.join(parts[1:]))
    credentials = None
    try:
        if data['username']:
            fd, credentials = tempfile.mkstemp(prefix='fitfamily-cifs-', dir='/run')
            with os.fdopen(fd, 'w') as stream:
                stream.write('username=' + data['username'] + '\npassword=' + data['password'] + '\n')
            options.append('credentials=' + credentials)
        else:
            options.append('guest')
        mounted = subprocess.run(['/usr/bin/findmnt', '--mountpoint', TARGET, '--noheadings'], capture_output=True).returncode == 0
        if restore and mounted:
            return
        if mounted:
            subprocess.run(['/bin/umount', TARGET], check=True, capture_output=True, timeout=10)
        subprocess.run(['/bin/mount', '-t', 'cifs', '-o', ','.join(options), '//' + data['server'] + '/' + parts[0], TARGET], check=True, capture_output=True, timeout=25)
    finally:
        if credentials:
            os.unlink(credentials)
    if not restore:
        persist(data)
    print(json.dumps(dict(ok=True, path=TARGET)))

def main():
  try:
    if os.geteuid() != 0:
        raise ValueError('Dieser Helfer benötigt root.')
    if sys.argv[1:] == ['--restore']:
        data = saved_configuration()
        if data:
            worker(data, restore=True)
        return
    raw = sys.stdin.read(16385)
    incoming = json.loads(raw)
    if not sys.argv[1:] and isinstance(incoming, dict) and incoming.get('action') == 'status':
        saved = saved_configuration()
        print(json.dumps(dict(configured=bool(saved), **({key: saved[key] for key in ('server', 'share', 'username')} if saved else {}))))
        return
    import io
    sys.stdin = io.StringIO(raw)
    data = configuration()
    saved = saved_configuration()
    if 'password' not in incoming and saved and all(data[key] == saved[key] for key in ('server', 'share', 'username')):
        data['password'] = saved['password']
    if sys.argv[1:] == ['--worker']:
        worker(data)
    elif not sys.argv[1:]:
        # Mount in the host namespace, so service restarts and backup jobs see it.
        result = subprocess.run(['/usr/bin/systemd-run', '--wait', '--pipe', '--quiet', '--collect', '--unit=fitfamily-nas-' + str(uuid.uuid4()), '/usr/local/libexec/fitfamily-mount', '--worker'], input=json.dumps(data), text=True, capture_output=True, timeout=80)
        if result.returncode:
            raise ValueError('NAS konnte nicht eingehängt werden. Prüfe Adresse, Freigabe, Zugangsdaten und ob das vorhandene Laufwerk noch verwendet wird.')
        print(result.stdout.strip())
    else:
        raise ValueError('Ungültige Helferargumente.')
  except Exception as error:
    # Never include subprocess arguments or credentials in returned errors.
    print(json.dumps(dict(ok=False, error=str(error) if isinstance(error, ValueError) else 'NAS konnte nicht sicher eingehängt werden.')), file=sys.stderr)
    sys.exit(1)

if __name__ == '__main__':
    main()
