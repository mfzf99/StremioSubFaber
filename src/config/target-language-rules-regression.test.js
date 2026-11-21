'use strict';

/**
 * [TARGET-LANGUAGE-RULES 2026-11-21 — Mandat Owner] Kontrak placeholder ke-5
 * ${targetLanguageRules}: malay pack membawa rules khusus BM (verbatim Owner),
 * generic pack string kosong (kontrak neutral 433-bahasa), enjin
 * menginterpolasi token pada templat eksperimen sandbox, dan sandbox
 * (resolver + hash8) merangkumi medan ketiga malayTargetLanguageRules.
 *
 * Suite ini ditulis RED-FIRST sebelum sebarang edit produksi (§4.1).
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');

const { getLanguagePack, malayPack, genericPack } = require('../services/prompts/languagePacks');
const { TRANSLATION_SYSTEM_TEMPLATE } = require('../services/prompts/trinity/translation/core');

const fixtures = path.join(__dirname, 'fixtures');

// ── 1. Medan pack ─────────────────────────────────────────────────────────

test('TLR-1: malay pack membawa targetLanguageRules verbatim Owner', () => {
    assert.equal(typeof malayPack.targetLanguageRules, 'string');
    assert.ok(malayPack.targetLanguageRules.length > 0, 'rules mesti bukan string kosong');
    // Pin verbatim kandungan Owner (Mandat 2026-11-21).
    assert.ok(malayPack.targetLanguageRules.includes('natural Malaysian Malay'));
    assert.ok(malayPack.targetLanguageRules.includes('(tak, dah, boleh, kereta, telefon)'));
    assert.ok(malayPack.targetLanguageRules.includes('NEVER Indonesian (nggak, udah, bisa, mobil, ponsel)'));
    assert.ok(malayPack.targetLanguageRules.includes('"kita" if listener is included, "kami" if excluded'));
    assert.ok(malayPack.targetLanguageRules.includes('saya/awak, aku/kau, kinship terms'));
});

test('TLR-2: generic pack targetLanguageRules = string kosong (neutral 433-bahasa)', () => {
    assert.equal(genericPack.targetLanguageRules, '');
    assert.equal(getLanguagePack('Japanese').targetLanguageRules, '');
    assert.equal(getLanguagePack('Vietnamese').targetLanguageRules, '');
});

test('TLR-3: medan MONKEY lama kekal dibuang; specificRules tidak kembali', () => {
    for (const pack of [malayPack, genericPack]) {
        for (const field of [
            'honorificMatrix',
            'canonicalAddressMatrix',
            'creditsExample',
            'specificRules',
            'notLockedGuidance'
        ]) {
            assert.equal(pack[field], undefined, `${pack.code}.${field} mesti kekal dibuang`);
        }
    }
});

// ── 2. Templat official ───────────────────────────────────────────────────

test('TLR-4: templat official core.js TIDAK memakai token baharu (VERBATIM Owner)', () => {
    assert.ok(!TRANSLATION_SYSTEM_TEMPLATE.includes('${targetLanguageRules}'));
    // Token klasik kekal.
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('${sourceLabel}'));
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('${fewShot}'));
});

// ── 3. Enjin — interpolasi token ke-5 pada wayar eksperimen ───────────────

test('TLR-5: enjin menginterpolasi ${targetLanguageRules} (Malay → rules; lain → kosong)', () => {
    const TranslationEngine = require('../services/translationEngine');
    const { __setPromptSandboxForTests, __resetPromptSandboxForTests } = require('../config/promptSandbox');

    const experimental =
        'X ${sourceLabel} -> ${targetLabel} ${targetLabelShort} RULES[${targetLanguageRules}] FS ${fewShot} END';
    // Override DIPASANG SEBELUM new — enjin snapshot pasangan efektif dalam
    // constructor (kontrak v3.38.0: satu pilihan per instance).
    __setPromptSandboxForTests({
        enabled: true,
        translationSystemTemplate: experimental,
        malayFewShot: 'FS',
        malayTargetLanguageRules: 'SBX-RULES-X'
    });
    let engine;
    try {
        engine = new TranslationEngine({}, 'gemini-2.5-flash', {}, { trinityMode: 'basic', trinityChannel: 'gemini' });
        engine.sourceLanguage = 'English';
        // createXmlBatchPrompt synchronous — memulangkan string system+BOUNDARY+user.
        const wire = engine.createXmlBatchPrompt('<s id="1">hello</s>', 'Malay', null, 1);
        assert.ok(wire.includes('RULES[SBX-RULES-X]'), 'Malay: rules eksperimen tersuntik');
        assert.ok(!wire.includes('${targetLanguageRules}'), 'sifar residu token pada wayar');

        // Sasaran generik: sandbox aktif tapi bukan Malay → rules pack generik
        // ('' — token digugurkan bersih, bukan bocor literal).
        const wireGeneric = engine.createXmlBatchPrompt('<s id="1">hello</s>', 'Japanese', null, 1);
        assert.ok(wireGeneric.includes('RULES[]'), 'generic: token digugurkan bersih (string kosong)');
        assert.ok(!wireGeneric.includes('${targetLanguageRules}'), 'generic: sifar residu token');
        assert.ok(!wireGeneric.includes('SBX-RULES-X'), 'rules eksperimen BM tidak bocor ke sasaran generik');
    } finally {
        __resetPromptSandboxForTests();
    }
});

// ── 4. Resolver sandbox — medan ketiga + hash8 3-tuple ────────────────────

test('TLR-6: resolvePromptSandbox menerima malayTargetLanguageRules dan hash8 = 3-tuple', () => {
    const {
        resolvePromptSandbox,
        __setPromptSandboxForTests,
        __resetPromptSandboxForTests
    } = require('../config/promptSandbox');
    __setPromptSandboxForTests({
        enabled: true,
        translationSystemTemplate: 'T ${sourceLabel} ${targetLabel} ${fewShot}',
        malayFewShot: 'FS',
        malayTargetLanguageRules: 'RULES-X'
    });
    try {
        const out = resolvePromptSandbox({
            officialTemplate: 'OFFICIAL',
            officialMalayFewShot: 'OFF-FS',
            officialMalayTargetLanguageRules: 'OFF-RULES'
        });
        assert.equal(out.malayTargetLanguageRules, 'RULES-X');
        const crypto = require('node:crypto');
        const expected = crypto
            .createHash('sha256')
            .update(JSON.stringify(['T ${sourceLabel} ${targetLabel} ${fewShot}', 'FS', 'RULES-X']), 'utf8')
            .digest('hex')
            .slice(0, 8);
        assert.equal(out.hash8, expected, 'hash8 = SHA-256([template, fewShot, rules]) 8-hex');
    } finally {
        __resetPromptSandboxForTests();
    }
});

test('TLR-7: resolvePromptSandbox fall-back per-medan untuk rules sahaja', () => {
    const {
        resolvePromptSandbox,
        __setPromptSandboxForTests,
        __resetPromptSandboxForTests
    } = require('../config/promptSandbox');
    __setPromptSandboxForTests({
        enabled: true,
        translationSystemTemplate: 'T ${sourceLabel} ${targetLabel} ${fewShot}',
        malayFewShot: 'FS',
        malayTargetLanguageRules: null
    });
    try {
        const out = resolvePromptSandbox({
            officialTemplate: 'OFFICIAL',
            officialMalayFewShot: 'OFF-FS',
            officialMalayTargetLanguageRules: 'OFF-RULES'
        });
        assert.equal(out.malayTargetLanguageRules, 'OFF-RULES', 'null rules = official');
        assert.equal(out.template, 'T ${sourceLabel} ${targetLabel} ${fewShot}');
    } finally {
        __resetPromptSandboxForTests();
    }
});

// ── 5. Live store — persist + sanitize + amaran placeholder ───────────────

test('TLR-8: validateRow menerima malayTargetLanguageRules dan memberi fieldErrors mesra', () => {
    const { validateRow } = require('../services/promptSandboxLiveStore');
    const ok = validateRow({
        enabled: true,
        translationSystemTemplate: 'T ${sourceLabel} ${targetLabel} ${fewShot}',
        malayFewShot: 'FS',
        malayTargetLanguageRules: 'RULES'
    });
    assert.equal(ok.fieldErrors.length, 0);

    const bad = validateRow({
        enabled: true,
        translationSystemTemplate: 'T ${sourceLabel} ${targetLabel} ${fewShot}',
        malayFewShot: 'FS',
        malayTargetLanguageRules: '   '
    });
    assert.ok(
        bad.fieldErrors.some((e) => e.field === 'malayTargetLanguageRules'),
        'rules kosong/whitespace = fieldError mesra'
    );
});

// ── 6. Fail UI — struktur panel ───────────────────────────────────────────

test('TLR-9: sandbox.html membawa kotak ke-3 + placeholder guide 5 token', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'sandbox.html'), 'utf8');
    assert.ok(html.includes('id="malayTargetLanguageRules"'), 'textarea kotak rules hadir');
    assert.ok(html.includes('${targetLanguageRules}</code> — target language rules'), 'guide menyenaraikan token ke-5');
    assert.ok(html.includes('id="rules-count"'), 'counter aksara kotak rules hadir');
    assert.ok(html.includes('id="rules-error"'), 'field-error kotak rules hadir');
});

test('TLR-10: sandbox-panel.js memasang wiring kotak rules', () => {
    const js = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'js', 'sandbox-panel.js'), 'utf8');
    for (const needle of [
        "'malayTargetLanguageRules'",
        "'rules-count'",
        "'rules-error'",
        'malayTargetLanguageRules:'
    ]) {
        assert.ok(js.includes(needle), `panel JS mesti memasang ${needle}`);
    }
});

// fixtures helper (tidak wajib digunakan oleh suite lain)
if (!fs.existsSync(fixtures)) fs.mkdirSync(fixtures, { recursive: true });
