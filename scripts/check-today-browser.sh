#!/bin/sh
# Invoked by both existing CI entrypoints; browser failures are fatal.
# Dependency provisioning belongs to the explicit CI setup, never a test run.
set -eu
npm ci --ignore-scripts
node --input-type=module <<'JS'
import { accessSync, constants } from 'node:fs';
import { chromium } from 'playwright';
const browser = process.env.RIKUY_BROWSER_EXECUTABLE || chromium.executablePath();
try {
    accessSync(browser, constants.X_OK);
} catch {
    console.error('Browser unavailable: set RIKUY_BROWSER_EXECUTABLE to an installed browser or provision Playwright Chromium before running tests. Browser checks never install system packages.');
    process.exit(1);
}
JS
npm run test:browser
