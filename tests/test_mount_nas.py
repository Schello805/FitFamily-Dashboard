import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace

sys.dont_write_bytecode = True

spec = importlib.util.spec_from_file_location('nas', Path(__file__).resolve().parents[1] / 'scripts/mount-nas.py')
nas = importlib.util.module_from_spec(spec)
spec.loader.exec_module(nas)
DATA = dict(server='192.168.1.100', share='backup/family', username='family', password='test-secret', mountPath=nas.TARGET)


class PersistentNasTests(unittest.TestCase):
    def test_saved_configuration_is_private_and_boot_service_is_enabled(self):
        original_lstat = os.lstat
        def root_lstat(path, *args, **kwargs):
            fields = list(original_lstat(path, *args, **kwargs))
            fields[4] = 0
            return os.stat_result(fields)
        with tempfile.TemporaryDirectory() as temporary:
            directory = os.path.realpath(temporary)
            units = directory + '/units'
            os.mkdir(units)
            with patch.object(nas, 'STORE', directory + '/nas'), patch.object(nas, 'CONFIG', directory + '/nas/connection.json'), patch.object(nas, 'UNIT_DIRECTORY', units), patch.object(nas.os, 'lstat', side_effect=root_lstat), patch.object(nas.subprocess, 'run') as run:
                nas.persist(DATA)
                self.assertEqual(os.stat(nas.CONFIG).st_mode & 0o777, 0o600)
                self.assertEqual(os.stat(nas.STORE).st_mode & 0o777, 0o700)
                self.assertEqual(nas.saved_configuration(), DATA)
                unit = Path(units, 'fitfamily-nas.service').read_text()
                self.assertIn('ExecStart=/usr/local/libexec/fitfamily-mount --restore', unit)
                self.assertIn('Restart=on-failure', unit)
                run.assert_any_call(['/usr/bin/systemctl', 'enable', 'fitfamily-nas.service'], check=True, capture_output=True, timeout=10)
                os.chmod(nas.CONFIG, 0o644)
                with self.assertRaises(ValueError):
                    nas.saved_configuration()

    def test_status_never_returns_password(self):
        with patch.object(nas.os, 'geteuid', return_value=0), patch.object(nas, 'saved_configuration', return_value=DATA), patch.object(nas.sys, 'argv', ['helper']), patch.object(nas.sys, 'stdin', io.StringIO('{"action":"status"}')), patch.object(nas.sys, 'stdout', new_callable=io.StringIO) as output:
            nas.main()
            result = json.loads(output.getvalue())
            self.assertTrue(result['configured'])
            self.assertEqual(result['share'], DATA['share'])
            self.assertNotIn('password', result)
            self.assertNotIn(DATA['password'], output.getvalue())

    def test_boot_restores_saved_connection(self):
        with patch.object(nas.os, 'geteuid', return_value=0), patch.object(nas.sys, 'argv', ['helper', '--restore']), patch.object(nas, 'saved_configuration', return_value=DATA), patch.object(nas, 'worker') as worker:
            nas.main()
            worker.assert_called_once_with(DATA, restore=True)

    def test_empty_password_reuses_saved_password_only_for_same_connection(self):
        for server, expected in [(DATA['server'], DATA['password']), ('192.168.1.101', '')]:
            incoming = {key: value for key, value in DATA.items() if key != 'password'}
            incoming['server'] = server
            with patch.object(nas.os, 'geteuid', return_value=0), patch.object(nas.sys, 'argv', ['helper']), patch.object(nas.sys, 'stdin', io.StringIO(json.dumps(incoming))), patch.object(nas.sys, 'stdout', new_callable=io.StringIO), patch.object(nas, 'saved_configuration', return_value=DATA), patch.object(nas.subprocess, 'run', return_value=SimpleNamespace(returncode=0, stdout='{}')) as run:
                nas.main()
                sent = json.loads(run.call_args.kwargs['input'])
                self.assertEqual(sent['password'], expected)

    def test_failed_mount_does_not_replace_saved_connection(self):
        guest = {**DATA, 'username': '', 'password': ''}
        with patch.object(nas.os.path, 'realpath', side_effect=lambda path: path), patch.object(nas.os, 'makedirs'), patch.object(nas.os, 'stat', return_value=SimpleNamespace(st_uid=0, st_mode=0o755)), patch.object(nas.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=997, pw_gid=997)), patch.object(nas.subprocess, 'run', side_effect=[SimpleNamespace(returncode=1), subprocess.CalledProcessError(1, 'mount')]), patch.object(nas, 'persist') as persist:
            with self.assertRaises(subprocess.CalledProcessError):
                nas.mount_and_save(guest)
            persist.assert_not_called()

    def test_restore_keeps_an_existing_mount(self):
        guest = {**DATA, 'username': '', 'password': ''}
        with patch.object(nas.os.path, 'realpath', side_effect=lambda path: path), patch.object(nas.os, 'makedirs'), patch.object(nas.os, 'stat', return_value=SimpleNamespace(st_uid=0, st_mode=0o755)), patch.object(nas.pwd, 'getpwnam', return_value=SimpleNamespace(pw_uid=997, pw_gid=997)), patch.object(nas.subprocess, 'run', return_value=SimpleNamespace(returncode=0)) as run, patch.object(nas, 'persist') as persist:
            nas.mount_and_save(guest, restore=True)
            self.assertEqual(run.call_count, 1)
            persist.assert_not_called()


if __name__ == '__main__':
    unittest.main()
