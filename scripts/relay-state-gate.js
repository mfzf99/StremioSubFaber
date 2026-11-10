#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const RELAY_PATH = path.resolve(__dirname, '..', '.tmp', 'RELAY_STATE.md');
const MAX_BYTES = 4096;
const REQUIRED_FIELDS = [
    'Mandate:',
    'Current Phase:',
    'Active Invariants:',
    'Uncommitted Diffs:',
    'Test Baseline:',
    'Evidence:',
    'Open Hypotheses:',
    'Next Immediate Step:',
    'Recovery:'
];

if (!fs.existsSync(RELAY_PATH)) {
    console.error('[relay-gate] Missing .tmp/RELAY_STATE.md.');
    process.exit(1);
}

const content = fs.readFileSync(RELAY_PATH);
if (content.length > MAX_BYTES) {
    console.error(`[relay-gate] .tmp/RELAY_STATE.md is ${content.length} bytes; hard limit is ${MAX_BYTES}.`);
    process.exit(1);
}

const lines = content.toString('utf8').split(/\r?\n/);
if (lines[0] !== '# RELAY_STATE v2') {
    console.error('[relay-gate] First line must be exactly "# RELAY_STATE v2".');
    process.exit(1);
}

const fields = lines.filter((line) => line.trim() !== '');
const missing = REQUIRED_FIELDS.filter((field) => !fields.some((line) => line.startsWith(field)));
if (missing.length > 0) {
    console.error(`[relay-gate] Missing or non-canonical fields: ${missing.join(', ')}`);
    process.exit(1);
}

if (fields.length !== REQUIRED_FIELDS.length + 1) {
    console.error('[relay-gate] Relay must contain only the heading and nine single-line fields.');
    process.exit(1);
}

console.log(`[relay-gate] PASS: Relay State v2, ${content.length}/${MAX_BYTES} bytes, nine canonical fields.`);
