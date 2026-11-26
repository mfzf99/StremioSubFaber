#!/usr/bin/env node
'use strict';

/**
 * floor-guard.js — diff-scoped enforcement of the CONSTRAINTS.md floor.
 *
 * Adapted from the reference guard shipped with the `constraint-driven-development`
 * skill (Addy Osmani, agent-skills, MIT). Contract kept identical; the patterns are
 * scoped to this repository:
 *   - only `*.js` / `*.mjs` / `*.cjs` lines are scanned for suppressions, stubs and
 *     skips, so prose that merely mentions `eslint-disable` is not a violation;
 *   - an intentional empty catch is allowed when its own line carries an
 *     `// intentional:` reason.
 *
 * Usage: node scripts/floor-guard.js [--base <ref>]   (default base: origin/main)
 * Exit 0 clean · 1 at least one floor violation · 2 the guard could not run.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ARGV = process.argv.slice(2);
const option = (name) => {
    const i = ARGV.indexOf(name);
    return i > -1 ? ARGV[i + 1] : null;
};
// Two ways to name the change under review:
//   --base <ref>        the working tree (tracked edits + untracked files) against a merge base —
//                       the local pre-commit case, where nothing is committed yet;
//   --committed <a>..<b> the committed range a..b — the CI case, where the working tree equals b
//                       and a working-tree diff would be empty, making the guard pass vacuously.
const base = option('--base') || 'origin/main';
const committed = option('--committed');

// `git diff --no-index` exits 1 whenever the two sides differ, which is the normal case for a
// new file, so that output is kept. Any other failure is null, and null never reads as clean.
const git = (args, { diffExit = false } = {}) => {
    try {
        return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
        return diffExit && e.status === 1 && typeof e.stdout === 'string' ? e.stdout : null;
    }
};
const bail = (msg) => {
    console.error('floor-guard: ' + msg);
    process.exit(2);
};

// Run from the top of the work tree so the diff and the untracked list cover the whole tree.
const top = git(['rev-parse', '--show-toplevel'])?.trim();
if (!top) bail('not inside a git work tree');
process.chdir(top);

const diffOf = () => {
    if (committed) {
        // Committed range: every change is already in history, so there are no untracked files.
        const range = /^(\S+)\.\.(\S+)$/.exec(committed);
        if (!range) bail('--committed expects the form <base>..<head>');
        const tracked = git(['diff', '--unified=0', `${range[1]}...${range[2]}`, '--']);
        if (tracked === null) bail(`could not diff ${range[1]}...${range[2]}`);
        return tracked;
    }
    // Merge base; bail to exit 2 rather than pretending a shallow/rootless clone is clean.
    const mergeBase = git(['merge-base', base, 'HEAD'])?.trim();
    if (!mergeBase) bail('no merge base against ' + base);

    // Unified diff plus untracked files (git diff alone cannot see new files).
    const tracked = git(['diff', '--unified=0', mergeBase, '--']);
    if (tracked === null) bail('could not diff against ' + mergeBase);
    const untrackedFiles = git(['ls-files', '--others', '--exclude-standard']);
    if (untrackedFiles === null) bail('could not list untracked files');
    const untracked = untrackedFiles
        .split('\n')
        .filter(Boolean)
        .map((f) => {
            const d = git(['diff', '--no-index', '--unified=0', '/dev/null', f], { diffExit: true });
            if (d === null) bail('could not diff untracked file ' + f);
            return d;
        })
        .join('\n');
    return tracked + '\n' + untracked;
};
const diff = diffOf();

// Walk the diff. `---` and `+++` are file headers only between a file's `diff` line and its
// first `@@` hunk; inside a hunk every line is content. Each `@@ -old +new @@` header sets the
// line numbers, so a finding can name its location without repeating the line's text.
const added = [];
const removed = [];
const deleted = [];
const pathOf = (s) => s.replace(/^[ab]\//, '').replace(/\t$/, '');
let file = '';
let oldFile = '';
let inHeader = false;
let oldLine = 0;
let newLine = 0;
for (const line of diff.split('\n')) {
    if (line.startsWith('diff ')) inHeader = true;
    else if (line.startsWith('@@')) {
        inHeader = false;
        const m = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
        if (m) {
            oldLine = Number(m[1]);
            newLine = Number(m[2]);
        }
    } else if (inHeader) {
        if (line.startsWith('--- ')) oldFile = pathOf(line.slice(4));
        else if (line.startsWith('+++ ')) {
            const newFile = pathOf(line.slice(4));
            file = newFile === '/dev/null' ? oldFile : newFile;
            if (newFile === '/dev/null') deleted.push(file);
        }
    } else if (line.startsWith('+')) added.push({ file, line: newLine++, text: line.slice(1) });
    else if (line.startsWith('-')) removed.push({ file, oldPath: oldFile, line: oldLine++, text: line.slice(1) });
    else if (line.startsWith(' ')) {
        oldLine++;
        newLine++;
    }
}

// A tracked exemption is a path in `.constraintsignore` (one glob per line, `#` starts a comment),
// so a genuine exception is a reviewed file rather than a loosened rule. A missing file exempts
// nothing; an unreadable one fails the guard instead of silently exempting everything.
const constraintsIgnorePath = path.join(top, '.constraintsignore');
let exempt = () => false;
if (fs.existsSync(constraintsIgnorePath)) {
    const patterns = fs
        .readFileSync(constraintsIgnorePath, 'utf8')
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#'));
    exempt = (file) => patterns.some((glob) => minimatch(file, glob));
}

// A finding carries the file and line, never the line's text: a suppressed line is often the
// one holding a secret-like value, and the report ends up in terminals and agent logs.
const findings = [];
const flag = (rule, where) => findings.push({ rule, where });
const at = (l) => `${l.file}:${l.line}`;
const atBase = (l) => `${l.oldPath}:${l.line} (removed)`;
const isCode = (f) => /\.(?:js|mjs|cjs)$/.test(f);
const isTest = (f) => /\.(test|spec)\.|_test\.|test_/.test(f);
const isConstraints = (f) => /CONSTRAINTS\.md$/.test(f);

// 1. Silenced checker.
const SUPPRESSIONS =
    /@ts-ignore|@ts-nocheck|eslint-disable|biome-ignore|# *noqa|# *type: *ignore|istanbul ignore|nosemgrep|gitleaks:allow|Stryker disable/;
// 4. Unfinished work. An empty catch with an `// intentional:` reason on the same line is allowed.
const EMPTY_CATCH = /catch\s*(\(\w*\))?\s*\{\s*\}/;
const STUBS = /throw new (Error|NotImplemented).*[Nn]ot implemented|\bTODO\b|\bpass\s*# *stub/;
// 2. A test made easier (added skips).
const SKIPS = /\.(skip|todo)\b|\bxit\(|\bxdescribe\(|@pytest\.mark\.skip|t\.Skip\(/;
const INTENTIONAL = /\/\/\s*intentional:/;

// `*` matches within one path segment, `**` across segments: the two shapes a path list needs.
function minimatch(value, glob) {
    const source = glob
        .split('**')
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*'))
        .join('.*');
    return new RegExp(`^${source}$`).test(value);
}

for (const l of added) {
    if (!isCode(l.file) || exempt(l.file)) continue;
    const { text } = l;
    if (SUPPRESSIONS.test(text)) flag('silenced-checker', at(l));
    if (STUBS.test(text)) flag('unfinished-work', at(l));
    if (EMPTY_CATCH.test(text) && !INTENTIONAL.test(text)) flag('unfinished-work', at(l));
    if (SKIPS.test(text)) flag('test-made-easier', at(l));
}
// A new exception row needs an Owner decision. `--approve-exceptions W1,W2` records that decision
// for exactly this run: the named IDs pass and are echoed, anything else is still flagged, and the
// approval leaves no trace once the rows are committed (they are then no longer "added").
const approvedExceptions = new Set(
    (option('--approve-exceptions') || '')
        .split(',')
        .map((id) => id.trim().toUpperCase())
        .filter(Boolean)
);
const approvalEcho = [];
for (const l of added) {
    const row = /^\| *((?:W|E)\d+) *\|/.exec(l.text);
    if (isConstraints(l.file) && row) {
        if (approvedExceptions.has(row[1].toUpperCase())) approvalEcho.push(row[1].toUpperCase());
        else flag('new-exception', at(l));
    }
}

// 2b. A test file deleted, or assertions removed from a test file that still exists. Git shows
// an edited line as one removal plus one addition, so line-by-line pairing cannot tell a
// rewritten assertion from a dropped one. The guard therefore counts assertions per file: a test
// file that ends with fewer assertions than it had is a weakening, whatever the line pairing.
for (const f of deleted) if (isTest(f)) flag('test-deleted', `${f} (file deleted)`);
const ASSERTION = /\b(?:assert(?:\.\w+|\()|expect\(|should\b)/;
const isLiveTestLine = (l) => isCode(l.file) && isTest(l.file) && !deleted.includes(l.file) && !exempt(l.file);
const delta = new Map();
for (const l of added) {
    if (isLiveTestLine(l) && ASSERTION.test(l.text)) {
        delta.set(l.file, (delta.get(l.file) || 0) + 1);
    }
}
for (const l of removed) {
    if (isLiveTestLine(l) && ASSERTION.test(l.text)) {
        delta.set(l.file, (delta.get(l.file) || 0) - 1);
    }
}
for (const l of removed) {
    if (!isLiveTestLine(l) || !ASSERTION.test(l.text)) continue;
    if (delta.get(l.file) < 0) flag('assertion-removed', atBase(l));
}

// 1b/2c. A rule in CONSTRAINTS.md weakened or removed. A rule is a floor bullet or a table row,
// identified by the bullet's text before its first colon or by the row's first cell. Each number
// carries a direction read from the words around it; a number whose direction cannot be read is
// reported whenever it changes, because staying quiet is the wrong default.
const ruleKey = (t) => {
    const s = t.trim();
    if (s.startsWith('|'))
        return (
            s
                .split('|')
                .map((c) => c.trim())
                .filter(Boolean)[0] ?? ''
        );
    if (/^[-*] /.test(s)) return s.slice(2).split(':')[0].trim();
    return null; // prose, headings, dates: not a rule
};
const isException = (t) => /^\| *(W|E)\d+ *\|/.test(t.trim());
const MIN_BEFORE = /(>=|>|≥|at least|minimum|\bmin\b|no less than|not fall|not drop)\s*$/;
const MAX_BEFORE = /(<=|<|≤|at most|maximum|\bmax\b|no more than|under|below|not grow|not exceed)\s*$/;
// The direction may sit in the very next cell (`903 | must not fall`) or after one short word
// (`903 or more`). `\S*` is greedy and would swallow the cell separator, so the separator is
// matched on its own first and the "one short word" alternative second.
const DIRECTION_AFTER =
    /^\s*(?:\|\s*)?(?:\S{1,12}\s+)?(must not fall|must not drop|must not grow|must not exceed|or more|or higher|or less|or lower)\b/;
const MIN_AFTER = new RegExp(
    DIRECTION_AFTER.source.replace(
        '(must not fall|must not drop|must not grow|must not exceed|or more|or higher|or less|or lower)',
        '(must not fall|must not drop|or more|or higher)'
    )
);
const MAX_AFTER = new RegExp(
    DIRECTION_AFTER.source.replace(
        '(must not fall|must not drop|must not grow|must not exceed|or more|or higher|or less|or lower)',
        '(must not grow|must not exceed|or less|or lower)'
    )
);
const thresholds = (t) => {
    const out = [];
    // A version label (`v3.43.0`, `3.41.3`) or a date (`2027-02-27`) is metadata, not a threshold:
    // its digits would otherwise be read as extra values and paired against the wrong direction.
    const scrubbed = t
        .replace(/\(\s*v?\d+(?:\.\d+){2}\s*\)/g, ' ')
        .replace(/\(\s*\d{4}-\d{2}-\d{2}\s*\)/g, ' ')
        .replace(/\bv?\d+(?:\.\d+){2}\b/g, ' ')
        .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ');
    const re = /\d+(?:\.\d+)?/g;
    let m;
    while ((m = re.exec(scrubbed))) {
        const before = scrubbed.slice(Math.max(0, m.index - 24), m.index).toLowerCase();
        const after = scrubbed.slice(m.index + m[0].length, m.index + m[0].length + 40).toLowerCase();
        const dir =
            MIN_BEFORE.test(before) || MIN_AFTER.test(after)
                ? 'min'
                : MAX_BEFORE.test(before) || MAX_AFTER.test(after)
                  ? 'max'
                  : null;
        out.push({ n: Number(m[0]), dir });
    }
    return out;
};
const removedRules = removed.filter((l) => isConstraints(l.file) && ruleKey(l.text) !== null);
const addedRules = added.filter((l) => isConstraints(l.file) && ruleKey(l.text) !== null);
for (const r of removedRules) {
    const a = addedRules.find((x) => ruleKey(x.text) === ruleKey(r.text));
    if (!a) {
        if (!isException(r.text)) flag('rule-removed', atBase(r)); // dropping an exception tightens
        continue;
    }
    const before = thresholds(r.text);
    const after = thresholds(a.text);
    let verdict = null;
    for (const dir of ['min', 'max', null]) {
        const was = before.filter((x) => x.dir === dir);
        const now = after.filter((x) => x.dir === dir);
        was.forEach((b, i) => {
            const n = now[i];
            if (verdict) return;
            if (!n) verdict = 'threshold-removed';
            else if (n.n === b.n) return;
            else if (dir === 'min' ? n.n < b.n : dir === 'max' ? n.n > b.n : true) {
                verdict = dir ? 'threshold-loosened' : 'threshold-changed';
            }
        });
    }
    if (verdict) flag(verdict, `${atBase(r)} -> ${at(a)}`);
}

if (findings.length === 0) {
    console.log(
        'floor-guard: clean' + (approvalEcho.length ? ` (Owner-approved exceptions: ${approvalEcho.join(', ')})` : '')
    );
    process.exit(0);
}
console.error('floor-guard: ' + findings.length + ' floor violation(s):');
for (const f of findings) console.error(`  [${f.rule}] ${f.where}`);
console.error('\nEach is a move that lowers the bar. Fix the code, or route it through a tracked exception.');
process.exit(1);
