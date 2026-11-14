'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const trinitySource = fs.readFileSync(path.join(__dirname, 'trinity-agents.js'), 'utf8');
const keyStateSource = fs.readFileSync(path.join(__dirname, 'trinity-key-state.js'), 'utf8');
const trinityCss = fs.readFileSync(path.join(__dirname, '..', 'css', 'trinity-agents.css'), 'utf8');

/**
 * [PHASE C] Buang komen sebelum semakan "ketiadaan" — komen [PHASE C] memang
 * menyenaraikan nama pemilih yang telah dibuang, jadi pemeriksaan ketiadaan
 * mesti dijalankan pada kod sebenar, bukan pada teks komen.
 */
function stripJsComments(source) {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
const trinityCode = stripJsComments(trinitySource);

test('Trinity source and key-state module parse without the retired setup helper', () => {
    new vm.Script(trinitySource, { filename: 'trinity-agents.js' });
    new vm.Script(keyStateSource, { filename: 'trinity-key-state.js' });
    const keyState = require('./trinity-key-state.js');
    assert.equal(keyState.normalizePromptSetup, undefined);
});

test('Trinity mounts an accessible Basic/Pro segmented control above persistent agent cards', () => {
    assert.match(trinityCode, /var toggleBar = createEl\('div', 'trinity-mode-bar'\)/);
    assert.match(trinityCode, /var toggleInput = createEl\('input'\)/);
    assert.match(trinityCode, /toggleInput\.id = 'trinityModeToggle'/);
    assert.match(trinityCode, /var seg = createEl\('div', 'trinity-segmented'\)/);
    assert.match(trinityCode, /seg\.setAttribute\('role', 'radiogroup'\)/);
    assert.match(trinityCode, /function modeBtn\(modeKey, label, hint\)/);
    assert.match(trinityCode, /b\.setAttribute\('role', 'radio'\)/);
    assert.match(trinityCode, /Basic Mode/);
    assert.match(trinityCode, /Pro Mode/);
    assert.match(trinityCode, /function syncSegmented\(\)/);
    assert.match(trinityCode, /aria-checked/);
    assert.match(trinitySource, /var cardsWrap = createEl\('div', 'trinity-cards'\)/);
    assert.match(trinitySource, /pContent\.appendChild\(toggleBar\);/);
    assert.match(trinitySource, /pContent\.appendChild\(cardsWrap\);/);
});

test('No prompt-setup selector, label, hidden state, or selector CSS remains', () => {
    for (const source of [trinitySource, keyStateSource, trinityCss]) {
        assert.doesNotMatch(source, /trinityPromptSetup|promptSetupBar|PROMPT_SETUP_DESCRIPTIONS|trinity-prompt-setup/);
        assert.doesNotMatch(source, /A — Baseline|B — Natural Cadence|C — Invisible Editor/);
    }
});

test('Trinity save serializes the selected mode and rehydration preserves all agent settings', () => {
    assert.doesNotMatch(trinitySource, /promptSetup\s*:/);
    assert.match(
        trinitySource,
        /var storedMode = \(cfg\.trinity && cfg\.trinity\.mode\) \|\| cfg\.mode \|\| MODE_BASIC;/
    );
    assert.match(trinitySource, /return storedMode === MODE_PRO \? MODE_PRO : MODE_BASIC;/);
    assert.match(trinitySource, /function resolveSelectedMode\(\)/);
    assert.match(trinitySource, /var mode = resolveSelectedMode\(\);/);
    assert.match(trinitySource, /mode:\s*mode/);
    assert.match(trinitySource, /var prevTrinity = \(getEffectiveConfig\(\) \|\| \{\}\)\.trinity \|\| \{\};/);
    assert.match(trinitySource, /translation:\s*\{\}/);
    assert.match(trinitySource, /preflight:\s*\{\}/);
    assert.match(trinitySource, /inspector:\s*\{\}/);
    assert.match(trinitySource, /function snapshotVisibleAgentState\(targetCfg\)/);
    assert.match(trinitySource, /params: mpCollectDeviatedParams\(agent\.key\)/);
});
