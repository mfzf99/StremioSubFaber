#!/usr/bin/env node
'use strict';

/**
 * proc-triage.js — READ-ONLY process triage (core protocol §11.5, step 1).
 *
 * Lists every node.exe process with its parent, start time, listening ports and a
 * classification, so a PID can be identified before anything is stopped. The MCP
 * servers share this image, which is why a name-addressed stop is never safe.
 *
 * It never stops, suspends or edits a process. It prints only a script marker —
 * never a raw command line or argument — so no secret can reach the transcript.
 */

const childProcess = require('child_process');

if (process.platform !== 'win32') {
    console.error('[proc-triage] Windows only: this triage reads Win32_Process and netstat.');
    process.exit(2);
}

const run = (file, args) =>
    childProcess.execFileSync(file, args, { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 });

const list = (value) => (Array.isArray(value) ? value : value ? [value] : []);

const all = list(
    JSON.parse(
        run('powershell.exe', [
            '-NoProfile',
            '-Command',
            'Get-CimInstance Win32_Process | Select-Object Name,ProcessId | ConvertTo-Json -Compress'
        ])
    )
);
const nodes = list(
    JSON.parse(
        run('powershell.exe', [
            '-NoProfile',
            '-Command',
            'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" | ' +
                'Select-Object ProcessId,ParentProcessId,CreationDate,CommandLine | ConvertTo-Json -Compress'
        ])
    )
);
const nameOf = new Map(all.map((p) => [Number(p.ProcessId), String(p.Name)]));

const portsOf = new Map();
for (const line of run('netstat', ['-ano', '-p', 'tcp']).split('\n')) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 5 && parts[3] === 'LISTENING') {
        const pid = Number(parts[4]);
        if (!portsOf.has(pid)) portsOf.set(pid, []);
        portsOf.get(pid).push(parts[1].replace(/^.*:/, ''));
    }
}

// The script a process runs, without any argument: the last path segments of the
// first script file, or the package an npx wrapper launches.
const markerOf = (commandLine) => {
    const npx = /\bnpx(?:-cli\.js)?"?\s+(?:-y\s+)?([\w@/-]+)/.exec(commandLine);
    if (npx) return `npx ${npx[1]}`;
    const script = /((?:[\w.@-]+[\\/]){0,2}[\w.@-]+\.(?:js|mjs|cjs))(?=["\s]|$)/.exec(commandLine);
    return script ? script[1] : '(no script marker)';
};

const RULES = [
    ['triage (this script)', /proc-triage/i],
    ['MCP server', /\bmcp\b|firecrawl|playwright|context7|crawl4ai|chrome-devtools/i],
    ['test runner', /--test\b|\.test\.js|\.spec\.js/i],
    ['lint/format', /\beslint\b|\bprettier\b/i],
    ['SubFaber server', /(?:^|[\s"\\/])index\.js(?=["\s]|$)|nodemon/i]
];
const classify = (commandLine) => {
    for (const [label, pattern] of RULES) if (pattern.test(commandLine)) return label;
    return 'unclassified';
};

const pad = (n) => String(n).padStart(2, '0');
const started = (value) => {
    const match = /\/Date\((\d+)\)\//.exec(String(value || ''));
    if (!match) return 'unknown';
    const d = new Date(Number(match[1]));
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${pad(d.getDate())}/${pad(
        d.getMonth() + 1
    )}`;
};

const rows = nodes.map((p) => {
    const commandLine = String(p.CommandLine || '');
    const ppid = Number(p.ParentProcessId);
    return {
        pid: Number(p.ProcessId),
        ppid,
        parent: nameOf.has(ppid) ? `${ppid} ${nameOf.get(ppid)}` : `${ppid} (exited)`,
        started: started(p.CreationDate),
        cls: classify(commandLine),
        ports: (portsOf.get(Number(p.ProcessId)) || []).join(',') || '-',
        marker: markerOf(commandLine)
    };
});

// A test runner spawns one worker per file; name them after the parent that owns them.
const classOf = new Map(rows.map((r) => [r.pid, r.cls]));
for (const r of rows) {
    if (r.cls === 'unclassified' && classOf.get(r.ppid) === 'test runner') r.cls = 'test worker';
}
rows.sort((a, b) => a.cls.localeCompare(b.cls) || a.pid - b.pid);

const summary = {};
for (const r of rows) {
    summary[r.cls] = (summary[r.cls] || 0) + 1;
    console.log(`[${r.cls}] pid=${r.pid} parent=${r.parent} start=${r.started} ports=${r.ports} marker=${r.marker}`);
}
console.log(`SUMMARY ${JSON.stringify(summary)}`);
