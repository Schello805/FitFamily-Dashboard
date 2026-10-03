#!/usr/bin/python3
"""Root-owned fixed-target NAS helper; never accepts executable/command paths."""
import json
import os
import pwd
import re
import subprocess
import sys
import tempfile
import uuid

TARGET = '/mnt/nas/fitfamily'

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

def worker(data):
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
        if mounted:
            subprocess.run(['/bin/umount', TARGET], check=True, capture_output=True, timeout=10)
        subprocess.run(['/bin/mount', '-t', 'cifs', '-o', ','.join(options), '//' + data['server'] + '/' + parts[0], TARGET], check=True, capture_output=True, timeout=25)
    finally:
        if credentials:
            os.unlink(credentials)
    print(json.dumps(dict(ok=True, path=TARGET)))

def main():
  try:
    if os.geteuid() != 0:
        raise ValueError('Dieser Helfer benötigt root.')
    data = configuration()
    if sys.argv[1:] == ['--worker']:
        worker(data)
    elif not sys.argv[1:]:
        # Mount in the host namespace, so service restarts and backup jobs see it.
        result = subprocess.run(['/usr/bin/systemd-run', '--wait', '--pipe', '--quiet', '--collect', '--unit=fitfamily-nas-' + str(uuid.uuid4()), '/usr/local/libexec/fitfamily-mount', '--worker'], input=json.dumps(data), text=True, capture_output=True, timeout=45)
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
