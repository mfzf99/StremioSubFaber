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

test('Trinity mounts NO Basic/Pro control — the agent cards are mounted directly', () => {
    // [PHASE C] Togol Basic/Pro dibuang daripada UI (runtime tunggal Basic).
    // Bekas kad dipasang terus ke kad agent; tiada bar/segmen togol.
    assert.doesNotMatch(trinityCode, /trinity-mode-bar/, 'bar togol Basic/Pro mesti dibuang');
    assert.doesNotMatch(trinityCode, /toggleBar/, 'bar togol Basic/Pro tidak lagi dibina');
    assert.doesNotMatch(trinityCode, /modeBtn/, 'kawalan togol Basic/Pro tidak lagi dibina');
    assert.doesNotMatch(trinityCode, /Basic Mode/, 'label "Basic Mode" tidak lagi wujud');
    assert.doesNotMatch(trinityCode, /Pro Mode/, 'label "Pro Mode" tidak lagi wujud');
    // Kad agent kekal dipasang terus pada bekas kad.
    assert.match(trinitySource, /var cardsWrap = createEl\('div', 'trinity-cards'\)/);
    assert.match(trinitySource, /pContent\.appendChild\(cardsWrap\);/);
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
