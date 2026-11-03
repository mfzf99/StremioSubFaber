'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { normalizePromptSetup } = require('./trinity-key-state.js');

test('Prompt Setup defaults empty and unknown values to protected Setup A', () => {
    for (const value of ['', null, undefined, 'Z', ' setup-d ', 0]) {
        assert.equal(normalizePromptSetup(value), 'A');
    }
});

test('Prompt Setup accepts explicit A/B/C case-insensitively', () => {
    assert.equal(normalizePromptSetup('a'), 'A');
    assert.equal(normalizePromptSetup(' b '), 'B');
    assert.equal(normalizePromptSetup('c'), 'C');
});

test('Trinity UI parses and mounts one shared selector before the agent cards', () => {
    const file = path.join(__dirname, 'trinity-agents.js');
    const source = fs.readFileSync(file, 'utf8');
    new vm.Script(source, { filename: file });
    assert.match(source, /pContent\.appendChild\(toggleBar\);\s*pContent\.appendChild\(promptSetupBar\)/);
    assert.match(source, /var cardsWrap = createEl\('div', 'trinity-cards'\)/);
    assert.ok(
        source.indexOf('pContent.appendChild(promptSetupBar)') <
            source.indexOf("var cardsWrap = createEl('div', 'trinity-cards')")
    );
    assert.equal((source.match(/promptSetupBar\.id = 'trinityPromptSetup'/g) || []).length, 1);
});

test('Trinity save serializes canonical trinity.promptSetup without mixing it into agent slots', () => {
    const source = fs.readFileSync(path.join(__dirname, 'trinity-agents.js'), 'utf8');
    assert.match(source, /promptSetup: normalizePromptSetup\(\(\$\('trinityPromptSetupValue'\) \|\| \{\}\)\.value\)/);
    assert.doesNotMatch(source, /translation:\s*\{\s*promptSetup:/);
});

test('Trinity rehydration supports canonical and legacy setup values with A fallback', () => {
    const source = fs.readFileSync(path.join(__dirname, 'trinity-agents.js'), 'utf8');
    assert.match(
        source,
        /cfg\.trinity\.promptSetup \|\| \(cfg\.trinity\.translation && cfg\.trinity\.translation\.promptSetup\)/
    );
    assert.match(source, /promptSetupInput\.dispatchEvent\(new Event\('change', \{ bubbles: true \}\)\)/);
});
