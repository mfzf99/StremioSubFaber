const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readWorkspaceFile(relativePath) {
    return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function listWorkspaceFiles(relativeDirectory) {
    const absoluteDirectory = path.join(process.cwd(), relativeDirectory);
    const files = [];
    for (const entry of fs.readdirSync(absoluteDirectory, { withFileTypes: true })) {
        const relativePath = path.posix.join(relativeDirectory, entry.name);
        if (entry.isDirectory()) files.push(...listWorkspaceFiles(relativePath));
        else if (entry.isFile()) files.push(relativePath);
    }
    return files;
}

test('manifest name is environment independent and never carries legacy hosting branding', () => {
    const { buildManifest } = require('./config');
    const config = {
        uiLanguage: 'en',
        sourceLanguages: ['eng'],
        targetLanguages: ['msa'],
        geminiApiKey: 'test-key',
        providers: {}
    };

    const previous = process.env.ELFHOSTED;
    try {
        process.env.ELFHOSTED = 'true';
        const legacy = buildManifest(config);
        delete process.env.ELFHOSTED;
        const baseline = buildManifest(config);

        assert.equal(legacy.name, baseline.name);
        assert.ok(legacy.name.length > 0, 'manifest name must not be empty');
        assert.doesNotMatch(legacy.name, /elfhosted/i);
    } finally {
        if (previous === undefined) delete process.env.ELFHOSTED;
        else process.env.ELFHOSTED = previous;
    }
});

test('addon manifest route always returns the canonical SubFaber addon name', () => {
    const source = readWorkspaceFile('index.js');

    assert.doesNotMatch(source, /ELFHOSTED/);
    assert.match(source, /const addonName = 'SubFaber - Netflix-Grade Subtitle Engine';/);
});

test('legacy hosting env no longer gates parallel batch translation', () => {
    const source = readWorkspaceFile('src/services/translationEngine.js');

    assert.doesNotMatch(source, /ELFHOSTED/);
    assert.match(source, /if \(this\.advancedSettings\?\.parallelBatchesEnabled === true\) \{/);
});

test('legacy hosting env no longer changes Redis byte limits', () => {
    const StorageAdapter = require('../storage/StorageAdapter');
    const baseline = StorageAdapter.getSizeLimits({});
    const legacy = StorageAdapter.getSizeLimits({ ELFHOSTED: 'true' });

    assert.deepEqual(legacy, baseline);
    assert.equal(baseline.session, 512 * 1024 * 1024);
    assert.equal(baseline.translation, 768 * 1024 * 1024);
    assert.equal(baseline.smdb, 640 * 1024 * 1024);
});

test('legacy hosting domain is no longer auto-allowed in the CORS wildcard allowlist', () => {
    const source = readWorkspaceFile('index.js');

    assert.doesNotMatch(source, /\.elfhosted\.com/);
    assert.match(source, /for \(const suffix of \['\.midnightignite\.me', '\.fortheweak\.cloud', '\.nhyira\.dev'\]\)/);
    assert.match(source, /ALLOWED_ORIGIN_WILDCARD_SUFFIXES/);
});

test('no live runtime source reads the legacy hosting env flag', () => {
    const runtimeFiles = listWorkspaceFiles('src').filter((file) => file.endsWith('.js') && !file.endsWith('.test.js'));
    const offenders = runtimeFiles.filter((file) => /ELFHOSTED/.test(readWorkspaceFile(file)));

    assert.deepEqual(offenders, [], `legacy env flag still referenced in: ${offenders.join(', ')}`);
});

test('public UI copy no longer mentions the legacy hosting provider', () => {
    const source = readWorkspaceFile('public/partials/main.html');

    assert.doesNotMatch(source, /elfhosted/i);
});
