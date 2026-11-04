#!/bin/sh
# Rikuy has no published release package: build a public source snapshot.
set -eu
exec python3 - "$@" <<'PYINSTALL'
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile


def site_identity(root, installed=False):
    """Compare the entire static tree without following symbolic links."""
    result = {}
    def visit(path):
        metadata = path.lstat()
        relative = str(path.relative_to(root))
        if stat.S_ISLNK(metadata.st_mode):
            raise ValueError('static site contains a symbolic link')
        if stat.S_ISDIR(metadata.st_mode):
            result[relative] = ('directory', stat.S_IMODE(metadata.st_mode))
            for child in path.iterdir():
                visit(child)
        elif stat.S_ISREG(metadata.st_mode):
            if relative == '.source.json':
                if not installed:
                    raise ValueError('build uses reserved source identity filename')
                return
            result[relative] = ('file', stat.S_IMODE(metadata.st_mode),
                                hashlib.sha256(path.read_bytes()).hexdigest())
        else:
            raise ValueError('static site contains an unsupported entry')
    visit(root)
    return result


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
        expected = site_identity(source / 'dist')
        releases = prefix / 'share/rikuy'
        releases.mkdir(parents=True, exist_ok=True)
        lock = releases / '.install-lock'
        lock.mkdir()
        try:
            destination = releases / revision
            identity = {'package_version': package['version'], 'source_revision': revision,
                        'distribution': 'source build; not a published release'}
            if destination.exists() or destination.is_symlink():
                if site_identity(destination, installed=True) != expected:
                    raise ValueError('installed static site bytes or modes differ')
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
