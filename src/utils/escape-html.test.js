/**
 * Canonical escapeHtml SSOT unit test (Mandat P1 F4, 2026-11-10)
 *
 * One helper kanonik di `src/utils/escapeHtml.js` menggantikan 6 implementasi
 * ad-hoc yang bercanggah. Ujian ini mengunci kontrak:
 *   - Escape `&`, `<`, `>`, `"` (petik berkembar) dan `'` (petik tunggal).
 *   - `null`/`undefined` → '' (bukan 'null'/'undefined').
 *   - Angka `0` kekal '0' (tidak dipadam seperti `if (!text) return ''`).
 *   - Nombor lain, boolean, dan string kosong tidak terjejas.
 *   - Tiada page generator boleh mendefinisikan escapeHtml sendiri.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { escapeHtml } = require('./escapeHtml');

const projectRoot = path.join(__dirname, '..', '..');

// Entity strings are assembled from char codes so this file never carries a
// literal entity sequence that a transport layer could normalise.
const AMP = String.fromCharCode(38);
const ENT_AMP = AMP + 'amp;';
const ENT_LT = AMP + 'lt;';
const ENT_GT = AMP + 'gt;';
const ENT_QUOT = AMP + 'quot;';
const ENT_SQUOTE = AMP + '#39;';
const ENT_SQUOTE_ALT = AMP + '#039;';

const GENERATORS = [
    'src/utils/configurePageGenerator.js',
    'src/utils/fileUploadPageGenerator.js',
    'src/utils/historyPageGenerator.js',
    'src/utils/smdbPageGenerator.js',
    'src/utils/syncPageGenerator.js',
    'src/utils/toolboxPageGenerator.js'
];

test('[F4-SSOT] No page generator defines its own escapeHtml — all delegate to the SSOT', () => {
    for (const rel of GENERATORS) {
        const src = fs.readFileSync(path.join(projectRoot, rel), 'utf8');
        assert.ok(
            !/^function escapeHtml\s*\(/m.test(src),
            `${rel} must not define a local escapeHtml — delegate to src/utils/escapeHtml.js`
        );
        assert.ok(
            src.includes("require('./escapeHtml')"),
            `${rel} must import the canonical escapeHtml from ./escapeHtml`
        );
    }
});

test('[F4-SSOT] Inline escapeHtmlClient copies use the canonical guard and single-quote entity', () => {
    for (const rel of ['src/utils/syncPageGenerator.js', 'src/utils/toolboxPageGenerator.js']) {
        const src = fs.readFileSync(path.join(projectRoot, rel), 'utf8');
        const occurrences = src.match(/const escapeHtmlClient = \(value\) => \{/g) || [];
        assert.ok(occurrences.length > 0, `${rel} must contain an inline escapeHtmlClient`);
        for (const match of src.matchAll(/const escapeHtmlClient = \(value\) => \{[\s\S]*?\n[ \t]*\};/g)) {
            const block = match[0];
            assert.ok(
                block.includes('value === null || value === undefined'),
                `${rel} inline client must use the canonical null/undefined guard`
            );
            assert.ok(!block.includes(ENT_SQUOTE), `${rel} inline client must not use the legacy single-quote entity`);
            assert.ok(
                block.includes(ENT_SQUOTE_ALT),
                `${rel} inline client must use the canonical single-quote entity`
            );
        }
    }
});

test('escapeHtml escapes ampersand, angle brackets, double and single quotes', () => {
    const input =
        String.fromCharCode(60) +
        'a href="x"' +
        String.fromCharCode(62) +
        'Link' +
        String.fromCharCode(60) +
        '/a' +
        String.fromCharCode(62);
    const expected = ENT_LT + 'a href=' + ENT_QUOT + 'x' + ENT_QUOT + ENT_GT + 'Link' + ENT_LT + '/a' + ENT_GT;
    assert.equal(escapeHtml(input), expected);

    const obrien = escapeHtml("O'Brien & Co " + String.fromCharCode(60) + 'tag' + String.fromCharCode(62));
    assert.ok(obrien.includes(ENT_SQUOTE_ALT), 'single quote escaped');
    assert.ok(obrien.includes(ENT_AMP), 'ampersand escaped');
    assert.ok(obrien.includes(ENT_LT) && obrien.includes(ENT_GT), 'angle brackets escaped');

    assert.equal(escapeHtml(`He said "hi"`), 'He said ' + ENT_QUOT + 'hi' + ENT_QUOT);
    assert.equal(escapeHtml(`It's a "test"`), 'It' + ENT_SQUOTE_ALT + 's a ' + ENT_QUOT + 'test' + ENT_QUOT);

    const out = escapeHtml(
        String.fromCharCode(60) +
            'script' +
            String.fromCharCode(62) +
            "alert('xss')" +
            String.fromCharCode(60) +
            '/script' +
            String.fromCharCode(62)
    );
    assert.ok(
        !out.includes(String.fromCharCode(60)) && !out.includes(String.fromCharCode(62)) && !out.includes("'"),
        'no raw angle brackets or single quote'
    );
    assert.ok(out.includes(ENT_LT) && out.includes(ENT_GT) && out.includes(ENT_SQUOTE_ALT));
});

test('escapeHtml handles null and undefined as empty string', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
});

test('escapeHtml preserves numeric 0 and other numbers/booleans', () => {
    assert.equal(escapeHtml(0), '0', 'numeric zero must not be dropped');
    assert.equal(escapeHtml(42), '42');
    assert.equal(escapeHtml(3.14), '3.14');
    assert.equal(escapeHtml(-1), '-1');
    assert.equal(escapeHtml(true), 'true');
    assert.equal(escapeHtml(false), 'false');
});

test('escapeHtml keeps plain strings and empty string unchanged', () => {
    assert.equal(escapeHtml(''), '');
    assert.equal(escapeHtml('Hello world'), 'Hello world');
    assert.equal(escapeHtml('00:00:01,000'), '00:00:01,000');
});

test('escapeHtml escapes ampersand before other characters (no bypass)', () => {
    // `&` must be escaped first so a later `<` becomes < and the
    // pre-existing entity in user input becomes &lt; (correct, not a bug).
    const alreadyEscaped = escapeHtml(ENT_LT);
    assert.equal(alreadyEscaped, ENT_AMP + 'lt;');
    assert.equal(escapeHtml('a & b'), 'a ' + ENT_AMP + ' b');
});
