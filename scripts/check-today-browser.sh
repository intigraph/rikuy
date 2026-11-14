#!/bin/sh
# Invoked by both existing CI entrypoints; browser failures are fatal.
set -eu
npm ci --ignore-scripts
if [ -z "${RIKUY_BROWSER_EXECUTABLE:-}" ]; then
    npx --no-install playwright install --with-deps chromium
fi
npm run test:browser
