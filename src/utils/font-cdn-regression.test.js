/**
 * Font-CDN Ban Regression (Mandat P0 F1, 2026-11-10)
 *
 * Invariant: `docs/PROVIDER_CONTRACTS_REFERENCE.md` §9 and the core protocol
 * forbid any font or icon CDN. The audit found Google Fonts `<link>` tags in
 * 5 tracked files (7 link blocks) and CSP allow-list entries for
 * fonts.googleapis.com / fonts.gstatic.com.
 *
 * This test asserts:
 *   1. No Google Fonts (or any external font CDN) stylesheet <link> remains in
 *      any page generator / HTML template.
 *   2. index.js CSP directives no longer allow-list Google Fonts domains.
 *   3. No webfont family name ('Inter', 'Space Grotesk', 'JetBrains Mono')
 *      survives in a font-family declaration anywhere under src/ or public/ —
 *      an unloaded webfont name is dead CSS; the native stack must be used.
 *   4. The stylesheets that carried the webfont stacks now declare a native
 *      system stack (system-ui / ui-monospace).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..', '..');

const FONT_CDN_PATTERN = /fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net\/.*font|use\.typekit\.net/i;

const FILES_WITH_LINKS = [
    'public/configure.html',
    'src/utils/historyPageGenerator.js',
    'src/utils/smdbPageGenerator.js',
    'src/utils/syncPageGenerator.js',
    'src/utils/toolboxPageGenerator.js'
];

const STYLESHEETS_WITH_SANS_STACK = [
    'public/css/configure.css',
    'public/css/quick-setup.css',
    'public/css/subfaber-theme.css'
];

// Stylesheets that declare code / monospace typography must use the native
// ui-monospace stack (never an unloaded webfont name).
const STYLESHEETS_WITH_MONO_STACK = [
    'public/css/configure.css',
    'public/css/quick-setup.css',
    'public/css/rootify.css',
    'public/css/app-shell.css'
];

const WEBFONT_FAMILY_PATTERN = /font-family\s*:[^;}]*['"](Inter|Space Grotesk|JetBrains Mono)['"]/i;

function collectFiles(dir, results = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.git') continue;
            collectFiles(full, results);
        } else if (/\.(css|js|html)$/.test(entry.name) && !entry.name.endsWith('.test.js')) {
            results.push(full);
        }
    }
    return results;
}

test('[F1-A] No Google Fonts / external font-CDN stylesheet links remain', () => {
    for (const rel of FILES_WITH_LINKS) {
        const src = fs.readFileSync(path.join(projectRoot, rel), 'utf8');
        assert.ok(
            !FONT_CDN_PATTERN.test(src),
            `${rel} must not reference an external font CDN (fonts.googleapis.com / fonts.gstatic.com)`
        );
    }
});

test('[F1-B] index.js CSP no longer allow-lists Google Fonts domains', () => {
    const src = fs.readFileSync(path.join(projectRoot, 'index.js'), 'utf8');
    assert.ok(!src.includes('fonts.googleapis.com'), 'index.js must not allow-list fonts.googleapis.com in CSP');
    assert.ok(!src.includes('fonts.gstatic.com'), 'index.js must not allow-list fonts.gstatic.com in CSP');
});

test('[F1-C] No unloaded webfont family name survives in any font-family declaration', () => {
    const files = [...collectFiles(path.join(projectRoot, 'src')), ...collectFiles(path.join(projectRoot, 'public'))];
    const offenders = [];
    for (const file of files) {
        const src = fs.readFileSync(file, 'utf8');
        if (WEBFONT_FAMILY_PATTERN.test(src)) {
            offenders.push(path.relative(projectRoot, file).replace(/\\/g, '/'));
        }
    }
    assert.deepEqual(
        offenders,
        [],
        `font-family must not name unloaded webfonts ('Inter' / 'Space Grotesk' / 'JetBrains Mono'): ${offenders.join(', ')}`
    );
});

test('[F1-D] Stylesheets declare a native system font stack', () => {
    for (const rel of STYLESHEETS_WITH_SANS_STACK) {
        const src = fs.readFileSync(path.join(projectRoot, rel), 'utf8');
        assert.ok(/font-family\s*:[^;}]*system-ui/i.test(src), `${rel} must declare a native sans stack (system-ui)`);
    }
    for (const rel of STYLESHEETS_WITH_MONO_STACK) {
        const src = fs.readFileSync(path.join(projectRoot, rel), 'utf8');
        assert.ok(
            /font-family\s*:[^;}]*ui-monospace/i.test(src),
            `${rel} must declare a native mono stack (ui-monospace)`
        );
    }
});
