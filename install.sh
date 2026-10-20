#!/bin/sh
# Rikuy has no published release package: build a public source snapshot.
set -eu
exec python3 - "$@" <<'PYINSTALL'
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile


def install():
    if len(sys.argv) != 1:
        raise ValueError('no positional arguments; set STACK_INSTALL_ROOT to choose the private prefix')
    major = int(subprocess.check_output(['node', '--version'], text=True).strip().lstrip('v').split('.')[0])
    if major < 22:
        raise ValueError('Node 22 or newer is required')
    prefix = Path(os.environ.get('STACK_INSTALL_ROOT', str(Path.home() / '.local'))).expanduser().absolute()
    with tempfile.TemporaryDirectory(prefix='rikuy-source-') as temporary:
        source = Path(temporary) / 'source'
        subprocess.run(['git', 'clone', '--depth', '1', '--branch', 'main',
                        'https://github.com/scbrown/rikuy.git', str(source)], check=True, timeout=180)
        revision = subprocess.check_output(['git', '-C', str(source), 'rev-parse', 'HEAD'], text=True).strip()
        package = json.loads((source / 'package.json').read_text())
        if package['name'] != 'rikuy':
            raise ValueError('unexpected source package')
        subprocess.run(['npm', 'run', 'build'], cwd=source, check=True, timeout=180)
        if not (source / 'dist/index.html').is_file():
            raise ValueError('source build did not produce dist/index.html')
        releases = prefix / 'share/rikuy'
        releases.mkdir(parents=True, exist_ok=True)
        lock = releases / '.install-lock'
        lock.mkdir()
        try:
            destination = releases / revision
            identity = {'package_version': package['version'], 'source_revision': revision,
                        'distribution': 'source build; not a published release'}
            if destination.exists():
                if json.loads((destination / '.source.json').read_text()) != identity:
                    raise ValueError('existing source identity differs')
            else:
                with tempfile.TemporaryDirectory(prefix='.candidate-', dir=releases) as candidate:
                    staged = Path(candidate) / 'site'
                    shutil.copytree(source / 'dist', staged)
                    (staged / '.source.json').write_text(json.dumps(identity) + '\n')
                    staged.rename(destination)
            print('Built Rikuy ' + package['version'] + ' from source ' + revision)
            print('Static site: ' + str(destination))
            print('No release package was claimed and no web server or deployment was started.')
        finally:
            lock.rmdir()


try:
    install()
except (OSError, ValueError, KeyError, subprocess.SubprocessError) as error:
    print('Install refused: ' + str(error), file=sys.stderr)
    sys.exit(1)
PYINSTALL
