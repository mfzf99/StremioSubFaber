'use strict';

/**
 * floor-guard-regression.test.js — pins scripts/floor-guard.js against a throwaway git repo.
 *
 * The guard is a commit gate, so it is proven the way a gate must be: a deliberately weakened
 * change must FAIL (FG-2..FG-5), a clean change must PASS (FG-6), and the guard must never
 * report a clean result when it cannot actually run (FG-7).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');

const GUARD = path.join(__dirname, '..', '..', 'scripts', 'floor-guard.js');
const GIT = ['-c', 'user.name=probe', '-c', 'user.email=probe@localhost', '-c', 'commit.gpgsign=false'];

const write = (root, rel, text) => {
    const target = path.join(root, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text);
};
const git = (root, args) =>
    execFileSync('git', [...GIT, ...args], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const guard = (root) => spawnSync(process.execPath, [GUARD, '--base', 'HEAD'], { cwd: root, encoding: 'utf8' });

function makeRepo(t) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'subfaber-floor-guard-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    git(root, ['init', '-q']);
    write(root, 'src/ok.js', "'use strict';\nconst ok = () => 1;\nmodule.exports = { ok };\n");
    write(
        root,
        'src/ok.test.js',
        "'use strict';\nconst test = require('node:test');\nconst assert = require('node:assert');\n" +
            "const { ok } = require('./ok');\ntest('ok returns 1', () => {\n    assert.equal(ok(), 1);\n});\n"
    );
    write(root, 'README.md', 'Never write `/* eslint-disable no-undef */` in source.\n');
    git(root, ['add', 'src/ok.js', 'src/ok.test.js', 'README.md']);
    git(root, ['commit', '-q', '-m', 'base']);
    return root;
}

const rulesOf = (out) => [...out.matchAll(/^\s*\[(\S+)\]/gm)].map((m) => m[1]).sort();

test('[FG-1] the guard source carries no suppression or stub of its own', () => {
    const source = fs.readFileSync(GUARD, 'utf8');
    assert.doesNotMatch(source, /\/\/\s*eslint-disable/);
    assert.doesNotMatch(source, /\bTODO\b/);
});

test('[FG-2] a new eslint-disable in a tracked file fails', (t) => {
    const root = makeRepo(t);
    write(
        root,
        'src/ok.js',
        "'use strict';\n/* eslint-disable no-undef */\nconst ok = () => 1;\nmodule.exports = { ok };\n"
    );
    const out = guard(root);
    assert.equal(out.status, 1, out.stderr);
    assert.deepEqual(rulesOf(out.stderr), ['silenced-checker']);
    assert.match(out.stderr, /src\/ok\.js:2/);
});

test('[FG-3] an empty catch fails, but passes when its line states an intentional reason', (t) => {
    const root = makeRepo(t);
    const body = (line) =>
        "'use strict';\nconst attempt = () => {\n    try {\n        return JSON.parse('{');\n    } " +
        line +
        '\n};\nmodule.exports = { attempt };\n';
    write(root, 'src/ok.js', body('catch (e) {}'));
    const bad = guard(root);
    assert.equal(bad.status, 1, bad.stderr);
    assert.deepEqual(rulesOf(bad.stderr), ['unfinished-work']);

    write(root, 'src/ok.js', body('catch (e) {} // intentional: a malformed batch is skipped, not fatal'));
    assert.equal(guard(root).status, 0);
});

test('[FG-4] a skipped test, a deleted test file and a removed assertion each fail', (t) => {
    const root = makeRepo(t);
    write(root, 'src/ok.js', "'use strict';\nconst ok = () => 1;\nmodule.exports = { ok };\n");
    write(
        root,
        'src/ok.test.js',
        "'use strict';\nconst test = require('node:test');\nconst assert = require('node:assert');\n" +
            "const { ok } = require('./ok');\ntest.skip('ok returns 1', () => {\n    assert.equal(ok(), 1);\n});\n"
    );
    write(root, 'src/extra.test.js', "'use strict';\nconst test = require('node:test');\ntest('extra', () => {});\n");
    git(root, ['add', 'src/extra.test.js']);
    git(root, ['commit', '-q', '-m', 'add extra']);
    fs.rmSync(path.join(root, 'src/extra.test.js'));
    write(
        root,
        'src/ok.test.js',
        "'use strict';\nconst test = require('node:test');\nconst { ok } = require('./ok');\n" +
            "test.skip('ok returns 1', () => {\n    ok();\n});\n"
    );
    const out = guard(root);
    assert.equal(out.status, 1, out.stderr);
    const rules = rulesOf(out.stderr);
    for (const rule of ['assertion-removed', 'test-deleted', 'test-made-easier']) {
        assert.ok(rules.includes(rule), `expected a [${rule}] finding, got ${rules.join(', ')}`);
    }
});

test('[FG-4b] an assertion rewritten in place is not a weakening', (t) => {
    const root = makeRepo(t);
    write(root, 'src/ok.js', "'use strict';\nconst ok = () => 2;\nmodule.exports = { ok };\n");
    write(
        root,
        'src/ok.test.js',
        "'use strict';\nconst test = require('node:test');\nconst assert = require('node:assert');\n" +
            "const { ok } = require('./ok');\ntest('ok returns 2', () => {\n    assert.equal(ok(), 2);\n});\n"
    );
    const out = guard(root);
    assert.equal(out.status, 0, out.stderr);
    assert.doesNotMatch(out.stderr, /assertion-removed/);
});

test('[FG-4c] a test file that ends with fewer assertions than it had is a weakening', (t) => {
    const root = makeRepo(t);
    write(
        root,
        'src/ok.test.js',
        "'use strict';\nconst test = require('node:test');\nconst { ok } = require('./ok');\n" +
            "test('ok returns 1', () => {\n    ok();\n});\n"
    );
    const out = guard(root);
    assert.equal(out.status, 1, out.stderr);
    assert.deepEqual(rulesOf(out.stderr), ['assertion-removed']);
    assert.match(out.stderr, /src\/ok\.test\.js:\d+ \(removed\)/);
});

test('[FG-4d] a replaced assertion is not a weakening even when its line also moves', (t) => {
    const root = makeRepo(t);
    write(
        root,
        'src/ok.test.js',
        "'use strict';\nconst test = require('node:test');\nconst assert = require('node:assert');\n" +
            "// the value is now read through a helper\ntest('ok returns 1', () => {\n" +
            '    assert.equal(Number(ok()), 1);\n});\n'
    );
    const out = guard(root);
    assert.equal(out.status, 0, out.stderr);
});

test('[FG-5] a new untracked file is scanned, and prose is not', (t) => {
    const root = makeRepo(t);
    write(root, 'src/new.js', "'use strict';\n// TODO implement later\nmodule.exports = {};\n");
    write(root, 'docs/NOTE.md', 'Do not add `/* eslint-disable */` or `.skip`.\n');
    const out = guard(root);
    assert.equal(out.status, 1, out.stderr);
    assert.deepEqual(rulesOf(out.stderr), ['unfinished-work']);
    assert.match(out.stderr, /src\/new\.js:2/);
    assert.doesNotMatch(out.stderr, /NOTE\.md/);
});

test('[FG-6] a clean change passes and prints "clean"', (t) => {
    const root = makeRepo(t);
    write(root, 'src/ok.js', "'use strict';\nconst ok = () => 2;\nmodule.exports = { ok };\n");
    write(
        root,
        'src/ok.test.js',
        "'use strict';\nconst test = require('node:test');\nconst assert = require('node:assert');\n" +
            "const { ok } = require('./ok');\ntest('ok returns 2', () => {\n    assert.equal(ok(), 2);\n});\n" +
            "test('ok is a function', () => {\n    assert.equal(typeof ok, 'function');\n});\n"
    );
    const out = guard(root);
    assert.equal(out.status, 0, out.stderr);
    assert.match(out.stdout, /floor-guard: clean/);
});

test('[FG-8] a `.constraintsignore` entry exempts added lines but never a deleted test file', (t) => {
    const root = makeRepo(t);
    write(root, 'src/bad.js', "'use strict';\n/* eslint-disable no-undef */\n// TODO later\nmodule.exports = {};\n");
    const out = guard(root);
    assert.equal(out.status, 1, out.stderr);
    assert.deepEqual(rulesOf(out.stderr), ['silenced-checker', 'unfinished-work']);

    write(root, '.constraintsignore', '# reviewed\nsrc/bad.js\n');
    const exempted = guard(root);
    assert.equal(exempted.status, 0, exempted.stderr);

    fs.rmSync(path.join(root, 'src/ok.test.js'));
    const deletedToo = guard(root);
    assert.equal(deletedToo.status, 1, deletedToo.stderr);
    assert.deepEqual(rulesOf(deletedToo.stderr), ['test-deleted']);
});

test('[FG-9] --committed reviews a committed range instead of an empty working tree', (t) => {
    const root = makeRepo(t);
    write(
        root,
        'src/ok.js',
        "'use strict';\n/* eslint-disable no-undef */\nconst ok = () => 1;\nmodule.exports = { ok };\n"
    );
    git(root, ['add', 'src/ok.js']);
    git(root, ['commit', '-q', '-m', 'weaken']);

    // The working tree is clean, so a working-tree diff would be empty and pass vacuously.
    assert.equal(guard(root).status, 0);

    const committed = spawnSync(process.execPath, [GUARD, '--committed', 'HEAD~1..HEAD'], {
        cwd: root,
        encoding: 'utf8'
    });
    assert.equal(committed.status, 1, committed.stderr);
    assert.deepEqual(rulesOf(committed.stderr), ['silenced-checker']);

    const malformed = spawnSync(process.execPath, [GUARD, '--committed', 'not-a-range'], {
        cwd: root,
        encoding: 'utf8'
    });
    assert.equal(malformed.status, 2);
});

test('[FG-11] raising a "must not fall" value that carries a version label is not a loosening', (t) => {
    const root = makeRepo(t);
    const header = '# Constraints\n\n## Measured, not yet enforced\n\n| Metric | Today | Direction |\n|---|---|---|\n';
    write(root, 'CONSTRAINTS.md', header + '| Test count | 877 (v3.41.3) | must not fall |\n');
    git(root, ['add', 'CONSTRAINTS.md']);
    git(root, ['commit', '-q', '-m', 'constraints']);

    // Raising a floor is tightening. The version label must not be mistaken for extra thresholds.
    write(root, 'CONSTRAINTS.md', header + '| Test count | 903 (v3.43.0) | must not fall |\n');
    const raised = guard(root);
    assert.equal(raised.status, 0, raised.stderr);
    assert.doesNotMatch(raised.stderr, /threshold/);

    // Lowering the same value is still caught.
    write(root, 'CONSTRAINTS.md', header + '| Test count | 800 (v3.43.0) | must not fall |\n');
    const lowered = guard(root);
    assert.equal(lowered.status, 1, lowered.stderr);
    assert.deepEqual(rulesOf(lowered.stderr), ['threshold-loosened']);
});

test('[FG-10] a new exception row needs an explicit approval naming its exact ID', (t) => {
    const root = makeRepo(t);
    const row = '| W9 | Floor: example | `src/x.js` | reason | @owner | 2027-01-01 |\n';
    write(
        root,
        'CONSTRAINTS.md',
        '# Constraints\n\n## Exceptions\n\n| ID | Rule | Path | Reason | Owner | Expires |\n|----|------|------|--------|-------|---------|\n'
    );
    git(root, ['add', 'CONSTRAINTS.md']);
    git(root, ['commit', '-q', '-m', 'constraints']);
    write(root, 'CONSTRAINTS.md', fs.readFileSync(path.join(root, 'CONSTRAINTS.md'), 'utf8') + row);

    assert.equal(guard(root).status, 1);
    assert.deepEqual(rulesOf(guard(root).stderr), ['new-exception']);

    const run = (args) =>
        spawnSync(process.execPath, [GUARD, '--base', 'HEAD', ...args], { cwd: root, encoding: 'utf8' });
    assert.equal(run(['--approve-exceptions', 'W1']).status, 1, 'a different ID is not approved');
    const approved = run(['--approve-exceptions', 'w9']);
    assert.equal(approved.status, 0, approved.stderr);
    assert.match(approved.stdout, /Owner-approved exceptions: W9/);
});

test('[FG-7] a guard that cannot find its base exits 2 and never reports clean', (t) => {
    const root = makeRepo(t);
    const out = spawnSync(process.execPath, [GUARD, '--base', 'no-such-ref'], { cwd: root, encoding: 'utf8' });
    assert.equal(out.status, 2);
    assert.match(out.stderr, /no merge base/);
    assert.doesNotMatch(out.stdout, /clean/);
});
