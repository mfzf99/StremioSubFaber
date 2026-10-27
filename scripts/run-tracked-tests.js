#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const TEST_ROOTS = ['src', 'public'];

function discoverTestFiles(relativeDirectory) {
    const absoluteDirectory = path.join(PROJECT_ROOT, relativeDirectory);
    const entries = fs.readdirSync(absoluteDirectory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const relativePath = path.posix.join(relativeDirectory, entry.name);
        if (entry.isDirectory()) {
            files.push(...discoverTestFiles(relativePath));
        } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
            files.push(relativePath);
        }
    }

    return files;
}

const testFiles = TEST_ROOTS.flatMap(discoverTestFiles).sort();
if (testFiles.length === 0) {
    console.error('[test:tracked] No *.test.js files found under src/ or public/.');
    process.exit(1);
}

console.log(`[test:tracked] Discovered ${testFiles.length} test files under ${TEST_ROOTS.join(' and ')}.`);
const result = spawnSync(process.execPath, ['--test', '--test-force-exit', ...testFiles], {
    cwd: PROJECT_ROOT,
    stdio: 'inherit'
});

if (result.error) {
    console.error(`[test:tracked] Failed to launch Node test runner: ${result.error.message}`);
    process.exit(1);
}

process.exit(result.status === null ? 1 : result.status);
