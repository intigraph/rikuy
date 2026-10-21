#!/usr/bin/env python3
"""Source-build admission controls; all Git/npm operations are private fakes."""
from contextlib import redirect_stderr, redirect_stdout
import io
import json
import os
import shutil
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
REVISION = 'a' * 40


class SourceInstall(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='rikuy-install-fixture-')
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.prefix = self.root / 'prefix'
        self.previous = self.prefix / 'share/rikuy/prior/index.html'
        self.previous.parent.mkdir(parents=True)
        self.previous.write_text('previous site')
        self.node = 'v22.0.0\n'
        self.build_output = True
        self.build_failure = False

    def output(self, args, **kwargs):
        return self.node if args[0] == 'node' else REVISION + '\n'

    def fake_run(self, args, **kwargs):
        if args[:2] == ['git', 'clone']:
            source = Path(args[-1])
            source.mkdir()
            (source / 'package.json').write_text(json.dumps({'name': 'rikuy', 'version': '0.1.0'}))
        elif args == ['npm', 'run', 'build']:
            if self.build_failure:
                raise subprocess.CalledProcessError(1, args)
            if self.build_output:
                dist = Path(kwargs['cwd']) / 'dist'
                dist.mkdir()
                (dist / 'index.html').write_text('fixture static site')

    def invoke(self):
        body = (ROOT / 'install.sh').read_text().split("<<'PYINSTALL'\n", 1)[1].rsplit('PYINSTALL', 1)[0]
        out, err = io.StringIO(), io.StringIO()
        status = 0
        with patch.dict(os.environ, {'HOME': str(self.root / 'home'), 'STACK_INSTALL_ROOT': str(self.prefix)}), \
             patch('sys.argv', ['install.sh']), patch('subprocess.run', side_effect=self.fake_run), \
             patch('subprocess.check_output', side_effect=self.output), redirect_stdout(out), redirect_stderr(err):
            try:
                exec(compile(body, str(ROOT / 'install.sh'), 'exec'), {'__name__': '__main__'})
            except SystemExit as error:
                status = error.code
        self.assertEqual(self.previous.read_text(), 'previous site')
        return status, out.getvalue(), err.getvalue()

    def test_installs_static_output_with_explicit_source_identity(self):
        result = self.invoke()
        self.assertEqual(result[0], 0, result)
        path = self.prefix / 'share/rikuy' / REVISION
        self.assertEqual((path / 'index.html').read_text(), 'fixture static site')
        identity = json.loads((path / '.source.json').read_text())
        self.assertEqual(identity['source_revision'], REVISION)
        self.assertIn('not a published release', identity['distribution'])

    def test_intact_reinstall_succeeds(self):
        self.assertEqual(self.invoke()[0], 0)
        self.assertEqual(self.invoke()[0], 0)

    def test_changed_installed_tree_refuses_success(self):
        for change in ('bytes', 'mode', 'directory-mode', 'extra', 'missing', 'file-link', 'marker-link', 'directory-link', 'root-link'):
            with self.subTest(change=change):
                self.assertEqual(self.invoke()[0], 0)
                destination = self.prefix / 'share/rikuy' / REVISION
                index = destination / 'index.html'
                if change == 'bytes':
                    index.write_text('tampered')
                elif change == 'mode':
                    index.chmod(0o700)
                elif change == 'directory-mode':
                    destination.chmod(0o700)
                elif change == 'extra':
                    (destination / 'extra').write_text('unexpected')
                elif change == 'missing':
                    index.unlink()
                elif change == 'file-link':
                    index.unlink()
                    index.symlink_to(self.previous)
                elif change == 'marker-link':
                    marker = destination / '.source.json'
                    saved = self.root / 'source-marker.json'
                    saved.write_bytes(marker.read_bytes())
                    marker.unlink()
                    marker.symlink_to(saved)
                elif change == 'directory-link':
                    (destination / 'linked').symlink_to(self.previous.parent, target_is_directory=True)
                else:
                    retained = destination.with_name('retained')
                    destination.rename(retained)
                    destination.symlink_to(retained, target_is_directory=True)
                result = self.invoke()
                self.assertNotEqual(result[0], 0, result)
                self.assertNotIn('Built Rikuy', result[1])
                if destination.is_symlink():
                    destination.unlink()
                    shutil.rmtree(retained)
                else:
                    shutil.rmtree(destination)

    def test_unsupported_node_preserves_prior_site(self):
        self.node = 'v18.0.0\n'
        self.assertNotEqual(self.invoke()[0], 0)

    def test_missing_build_asset_refuses_success(self):
        self.build_output = False
        result = self.invoke()
        self.assertNotEqual(result[0], 0)
        self.assertNotIn('Built Rikuy', result[1])

    def test_failed_build_refuses_success(self):
        self.build_failure = True
        result = self.invoke()
        self.assertNotEqual(result[0], 0)
        self.assertNotIn('Built Rikuy', result[1])


if __name__ == '__main__':
    unittest.main(verbosity=2)
