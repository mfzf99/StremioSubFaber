'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const trinitySource = fs.readFileSync(path.join(__dirname, 'trinity-agents.js'), 'utf8');
const keyStateSource = fs.readFileSync(path.join(__dirname, 'trinity-key-state.js'), 'utf8');
const trinityCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'trinity-agents.css'), 'utf8');

test('Trinity source and key-state module parse without the retired setup helper', () => {
    new vm.Script(trinitySource, { filename: 'trinity-agents.js' });
    new vm.Script(keyStateSource, { filename: 'trinity-key-state.js' });
    const keyState = require('./trinity-key-state.js');
    assert.equal(keyState.normalizePromptSetup, undefined);
});

test('Trinity mounts one Basic/Pro control directly before the agent cards', () => {
    assert.match(trinitySource, /var toggleBar = createEl\('div', 'trinity-mode-bar'\)/);
    assert.match(trinitySource, /pContent\.appendChild\(toggleBar\);\s*parentCard\.appendChild\(pContent\)/);
    assert.match(trinitySource, /var cardsWrap = createEl\('div', 'trinity-cards'\)/);
    assert.ok(
        trinitySource.indexOf('pContent.appendChild(toggleBar)') <
            trinitySource.indexOf("var cardsWrap = createEl('div', 'trinity-cards')")
    );
    assert.match(trinitySource, /seg\.appendChild\(modeBtn\(MODE_BASIC, 'Basic Mode'/);
    assert.match(trinitySource, /seg\.appendChild\(modeBtn\(MODE_PRO, 'Pro Mode'/);
});

test('No prompt-setup selector, label, hidden state, or selector CSS remains', () => {
    for (const source of [trinitySource, keyStateSource, trinityCss]) {
        assert.doesNotMatch(source, /trinityPromptSetup|promptSetupBar|PROMPT_SETUP_DESCRIPTIONS|trinity-prompt-setup/);
        assert.doesNotMatch(source, /A — Baseline|B — Natural Cadence|C — Invisible Editor/);
    }
});

test('Trinity save and rehydration preserve agent settings without serializing setup IDs', () => {
    assert.doesNotMatch(trinitySource, /promptSetup\s*:/);
    assert.match(
        trinitySource,
        /var storedMode = \(cfg\.trinity && cfg\.trinity\.mode\) \|\| cfg\.mode \|\| MODE_BASIC;/
    );
    assert.match(trinitySource, /var prevTrinity = \(getEffectiveConfig\(\) \|\| \{\}\)\.trinity \|\| \{\};/);
    assert.match(trinitySource, /translation:\s*\{\}/);
    assert.match(trinitySource, /preflight:\s*\{\}/);
    assert.match(trinitySource, /inspector:\s*\{\}/);
});
