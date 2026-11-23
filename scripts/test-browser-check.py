#!/usr/bin/env python3
"""Exercise the real shell entrypoint with private, copied process fixtures."""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


class BrowserCheck(unittest.TestCase):
    def run_case(self, *, override=False, cached=False, executable=True):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "scripts").mkdir()
            shutil.copyfile(Path(__file__).with_name("check-today-browser.sh"),
                            root / "scripts/check-today-browser.sh")
            package = root / "node_modules/playwright"
            package.mkdir(parents=True)
            (package / "package.json").write_text(
                '{"type":"module","exports":"./index.js"}')
            browser = root / "browser"
            (package / "index.js").write_text(
                f'export const chromium = {{ executablePath: () => {str(browser)!r} }};')
            if cached or override:
                browser.write_text("#!/bin/sh\nexit 0\n")
                browser.chmod(0o700 if executable else 0o600)
            commands = root / "bin"
            commands.mkdir()
            for name in ("npm", "npx", "sudo"):
                command = commands / name
                command.write_text(
                    f'#!/bin/sh\nprintf "{name} %s\\n" "$*" >> "$TRACE"\n'
                    + ("exit 0\n" if name == "npm" else "exit 99\n"))
                command.chmod(0o700)
            env = dict(os.environ, PATH=f"{commands}:{os.environ['PATH']}",
                       TRACE=str(root / "trace"))
            env.pop("RIKUY_BROWSER_EXECUTABLE", None)
            if override:
                env["RIKUY_BROWSER_EXECUTABLE"] = str(browser)
            result = subprocess.run(["sh", "scripts/check-today-browser.sh"],
                                    cwd=root, env=env, capture_output=True, text=True)
            trace = (root / "trace").read_text().splitlines()
            self.assertEqual(trace[0], "npm ci --ignore-scripts")
            self.assertFalse(any(line.startswith(("npx ", "sudo ")) for line in trace))
            return result, trace

    def test_missing_browser_refuses_without_install_or_tests(self):
        result, trace = self.run_case()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Browser unavailable", result.stderr)
        self.assertEqual(len(trace), 1)

    def test_explicit_browser_runs_tests(self):
        result, trace = self.run_case(override=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(trace[-1], "npm run test:browser")

    def test_existing_cached_browser_runs_tests(self):
        result, trace = self.run_case(cached=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(trace[-1], "npm run test:browser")

    def test_nonexecutable_browser_refuses(self):
        result, trace = self.run_case(override=True, executable=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(len(trace), 1)


if __name__ == "__main__":
    unittest.main()
