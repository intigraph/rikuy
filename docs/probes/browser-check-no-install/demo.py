#!/usr/bin/env python3
"""Compare actual base/head shell scripts using inert package-command fixtures."""
import os
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[3]
with tempfile.TemporaryDirectory() as directory:
    fixture = Path(directory)
    commands = fixture / 'bin'
    commands.mkdir()
    for name in ('npm', 'npx', 'sudo'):
        command = commands / name
        command.write_text(f'#!/bin/sh\necho "{name} $*" >> "$TRACE"\nexit '
                           + ('0' if name == 'npm' else '99') + '\n')
        command.chmod(0o700)
    env = dict(os.environ, PATH=f'{commands}:{os.environ["PATH"]}', HOME=directory,
               TRACE=str(fixture / 'trace'),
               PLAYWRIGHT_BROWSERS_PATH=str(fixture / 'missing-browser-cache'))
    env.pop('RIKUY_BROWSER_EXECUTABLE', None)
    base = subprocess.check_output(
        ['git', 'show', '1ad4a395e8a7085549b52295b9d9d2f6f38ece1d:scripts/check-today-browser.sh'],
        cwd=root, text=True)
    for label, source in [('base 1ad4a395', base), ('candidate',
                          (root / 'scripts/check-today-browser.sh').read_text())]:
        (fixture / 'trace').write_text('')
        result = subprocess.run(['sh'], input=source, cwd=root, env=env,
                                capture_output=True, text=True)
        print(label, flush=True)
        print('Input: no override; empty cache; inert package-command fixtures.', flush=True)
        print(f'exit={result.returncode}', flush=True)
        print((fixture / 'trace').read_text().strip(), flush=True)
        print(result.stderr.strip(), flush=True)
        assert result.returncode == (99 if label.startswith('base') else 1)
