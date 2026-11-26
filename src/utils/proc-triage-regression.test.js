'use strict';

/**
 * proc-triage-regression.test.js — pins the contract of scripts/proc-triage.js.
 *
 * PT-1 / PT-2 are static because the property they pin is static: the triage must
 * stay read-only, so no termination API may appear in its source and it may launch
 * only the two listers it needs. PT-3 is behavioural: the script runs and either
 * reports a summary that matches its own rows (Windows) or fails loudly (elsewhere)
 * instead of pretending the machine is clean.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SCRIPT = path.join(__dirname, '..', '..', 'scripts', 'proc-triage.js');
const source = fs.readFileSync(SCRIPT, 'utf8');

test('[PT-1] proc-triage stays read-only: no termination API appears in its source', () => {
    const forbidden = [/Stop-Process/i, /taskkill/i, /process\.kill/, /\.kill\s*\(/, /killall/i, /pkill/i];
    for (const pattern of forbidden) {
        assert.equal(pattern.test(source), false, `proc-triage.js must not match ${pattern}`);
    }
});

test('[PT-2] proc-triage launches only execFileSync, and only the two read-only listers', () => {
    const used = [...source.matchAll(/childProcess\.(\w+)\(/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(used)], ['execFileSync']);

    const launched = [...source.matchAll(/\brun\(\s*'([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual([...new Set(launched)].sort(), ['netstat', 'powershell.exe']);
});

test('[PT-3] proc-triage ends with a summary that matches its rows, or fails loudly off Windows', () => {
    const out = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', timeout: 60000 });

    if (process.platform !== 'win32') {
        assert.notEqual(out.status, 0, 'off Windows the triage must not report a clean machine');
        assert.match(out.stderr, /Windows only/);
        return;
    }

    assert.equal(out.status, 0, out.stderr);
    const lines = out.stdout.trim().split(/\r?\n/);
    const last = lines[lines.length - 1];
    assert.match(last, /^SUMMARY \{.*\}$/, 'the last line must be the machine-readable summary');

    const summary = JSON.parse(last.slice('SUMMARY '.length));
    const listed = lines.filter((line) => /^\[.+\] pid=\d+ /.test(line));
    const total = Object.values(summary).reduce((sum, count) => sum + count, 0);
    assert.equal(listed.length, total, 'the summary must count exactly the rows it printed');
    assert.ok(listed.length > 0, 'the triage runs under node.exe, so it always lists at least itself');

    for (const line of lines) {
        assert.doesNotMatch(line, /\s-[A-Za-z]{1,2}\S*\s/, `arguments must not be printed: ${line}`);
    }
});
