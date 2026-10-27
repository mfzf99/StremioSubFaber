'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const quickSetupSource = fs.readFileSync(path.join(__dirname, 'quick-setup.js'), 'utf8');

function readQuickSetupOpenSubtitlesConfig() {
    const blockMatch = quickSetupSource.match(
        /subtitleProviders:\s*\{[\s\S]*?opensubtitles:\s*\{([\s\S]*?)\n\s{16}\},/
    );
    assert.ok(blockMatch, 'Quick Setup OpenSubtitles block must exist');

    const enabledMatch = blockMatch[1].match(/enabled:\s*(true|false)/);
    assert.ok(enabledMatch, 'Quick Setup OpenSubtitles enabled flag must be explicit');
    return {
        enabled: enabledMatch[1] === 'true',
        authSelection: blockMatch[1].includes("state.openSubsAuth ? 'auth' : 'v3'")
    };
}

test('Quick Setup marks the auto-enabled OpenSubtitles provider enabled in its payload', () => {
    const config = readQuickSetupOpenSubtitlesConfig();
    assert.equal(config.enabled, true);
    assert.equal(config.authSelection, true);
});

test('Quick Setup safe update propagates the OpenSubtitles provider object without disabling it', () => {
    assert.match(quickSetupSource, /opensubtitles:\s*qsConfig\.subtitleProviders\.opensubtitles/);
    assert.doesNotMatch(
        quickSetupSource,
        /opensubtitles:\s*qsConfig\.subtitleProviders\.opensubtitles[\s\S]{0,160}enabled:\s*false/
    );
});

test('Quick Setup markup and summary keep the auto-enabled provider contract', () => {
    const markup = fs.readFileSync(path.join(__dirname, '..', 'partials', 'quick-setup.html'), 'utf8');
    assert.match(markup, /qs-source-item qs-source-fixed/);
    assert.match(markup, /data-i18n="config\.quickSetup\.step2\.autoEnabled"/);
    assert.match(quickSetupSource, /state\.openSubsAuth\s*\?/);
});
