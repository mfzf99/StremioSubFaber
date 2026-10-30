/**
 * Regression — Prompt Setup Registry Agent Translation (Mandat Owner 2026-10-30)
 *
 * Kontrak yang dikunci:
 *   1. Setup A ialah backup VERBATIM templat statik prompt batch Agent
 *      Translation (Finale v3.25.1) — byte-identical dengan export SSOT
 *      core.js (TRANSLATION_SYSTEM_TEMPLATE). Sifar perubahan teks runtime
 *      untuk laluan default.
 *   2. Registry: default (kosong) → 'A'; id tidak dikenali → fail-safe
 *      fallback 'A' (bukan crash); id case-insensitive.
 *   3. TranslationEngine: options.promptSetup → env TRINITY_TRANSLATION_
 *      PROMPT_SETUP → default 'A'; prompt batch default IDENTIK dengan
 *      pra-registry (interpolasi label + few-shot pack kekal berfungsi).
 *   4. normalizeConfig: trinity.translation.promptSetup passthrough;
 *      setup bukan-A → bypassCache dipaksa (kunci cache tiada diskriminator
 *      prompt — eksperimen A/B mesti tidak makan hasil cache setup lain).
 *
 * Rujukan: docs/SESSION_LEDGER.md (blok v3.25.10), SSOT §10.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const core = require('./prompts/trinity/translation/core');
const setupA = require('./prompts/trinity/translation/setups/setupA');
const {
    getTranslationSetup,
    listTranslationSetups,
    DEFAULT_TRANSLATION_PROMPT_SETUP_ID
} = require('./prompts/trinity/translation/setups');
const TranslationEngine = require('./translationEngine');
const { normalizeConfig } = require('../utils/config');

// ── 1. Setup A — backup verbatim SSOT ──────────────────────────────────────

test('[SETUP-A1] Setup A byte-identical dengan TRANSLATION_SYSTEM_TEMPLATE core (backup verbatim)', () => {
    assert.equal(setupA.template, core.TRANSLATION_SYSTEM_TEMPLATE, 'templat mesti === byte-identical');
    assert.ok(setupA.template.length > 0, 'templat tidak kosong');
});

test('[SETUP-A2] Setup A membawa kontrak id/label yang betul', () => {
    assert.equal(setupA.id, 'A');
    assert.ok(typeof setupA.label === 'string' && setupA.label.includes('Setup A'), 'label mesti dinamakan Setup A');
});

test('[SETUP-A3] Setup A kekal kunci frasa ZON TERKUNCI (CCR/ULP/TPM assertion literal)', () => {
    const t = setupA.template;
    assert.ok(t.includes('keep slot/ID parity sacred'), 'frasa kunci parity');
    assert.ok(t.includes('a native speaker would actually say'), 'frasa kunci native');
    assert.ok(t.includes('ANTI-MERGE'), 'label jenayah ANTI-MERGE');
    assert.ok(t.includes('ANTI-SHIFT'), 'label jenayah ANTI-SHIFT');
    assert.ok(t.includes('ANTI-PHANTOM'), 'label jenayah ANTI-PHANTOM');
    assert.ok(t.includes('ANTI-DROP'), 'label jenayah ANTI-DROP');
    assert.ok(t.includes('ANTI-UNTRANSLATED'), 'label jenayah ANTI-UNTRANSLATED');
    assert.ok(t.includes('Never calque'), 'frasa kunci anti-calque');
    assert.ok(t.includes('## Output Format'), 'seksyen Output Format');
    assert.ok(t.includes('ZERO translator notes'), 'klausa zero translator notes');
    // Placeholder interpolasi wajib kekal untuk semua setup.
    assert.ok(t.includes('${sourceLabel}'), 'placeholder sourceLabel');
    assert.ok(t.includes('${targetLabel}'), 'placeholder targetLabel');
    assert.ok(t.includes('${targetLabelShort}'), 'placeholder targetLabelShort');
    assert.ok(t.includes('${targetSpecificRules}'), 'placeholder targetSpecificRules');
    assert.ok(t.includes('${fewShot}'), 'placeholder fewShot');
});

// ── 2. Registry — resolver + fail-safe fallback ────────────────────────────

test('[REG-1] Default (kosong/null/undefined) → Setup A', () => {
    assert.equal(getTranslationSetup('').id, 'A');
    assert.equal(getTranslationSetup(null).id, 'A');
    assert.equal(getTranslationSetup(undefined).id, 'A');
    assert.equal(DEFAULT_TRANSLATION_PROMPT_SETUP_ID, 'A');
});

test('[REG-2] Id tidak dikenali → fail-safe fallback A (bukan crash)', () => {
    assert.equal(getTranslationSetup('Z').id, 'A');
    assert.equal(getTranslationSetup('B').id, 'A', 'B belum berdaftar → fallback A');
    assert.equal(getTranslationSetup('nonsense').id, 'A');
});

test('[REG-3] Id case-insensitive (a → A)', () => {
    assert.equal(getTranslationSetup('a').id, 'A');
});

test('[REG-4] listTranslationSetups — A sentiasa pertama + tiada templat didedahkan', () => {
    const list = listTranslationSetups();
    assert.ok(Array.isArray(list) && list.length >= 1);
    assert.equal(list[0].id, 'A');
    for (const entry of list) {
        assert.equal('template' in entry, false, 'senarai tidak didedahkan templat');
    }
});

// ── 3. TranslationEngine — resolusi setup per-instance ─────────────────────

function makeEngine(options) {
    const provider = { translateSubtitle: async () => '', estimateTokenCount: () => 10 };
    return new TranslationEngine(provider, 'gemini-2.5-flash', {}, options || {});
}

test('[ENGINE-1] Engine default → Setup A (sifar perubahan laluan legasi)', () => {
    const engine = makeEngine();
    assert.equal(engine.promptSetup.id, 'A');
    assert.equal(engine.promptSetup.template, core.TRANSLATION_SYSTEM_TEMPLATE);
});

test('[ENGINE-2] options.promptSetup tidak dikenali → fallback A + prompt IDENTIK default', () => {
    const engineDefault = makeEngine();
    const engineUnknown = makeEngine({ promptSetup: 'Z' });
    assert.equal(engineUnknown.promptSetup.id, 'A');
    const pDefault = engineDefault.createXmlBatchPrompt('<s id="1">Hello.</s>', 'Malay', null, 1, null, 0, 1);
    const pUnknown = engineUnknown.createXmlBatchPrompt('<s id="1">Hello.</s>', 'Malay', null, 1, null, 0, 1);
    assert.equal(pUnknown, pDefault, 'prompt fallback mesti identik dengan default');
});

test('[ENGINE-3] Prompt batch default kekal kontrak penuh (interpolasi + few-shot BM)', () => {
    const engine = makeEngine();
    engine.sourceLanguage = 'English';
    const prompt = engine.createXmlBatchPrompt('<s id="1">Hello.</s>', 'Malay', null, 1, null, 0, 1);
    assert.ok(prompt.includes('## Role'), 'seksyen Role hadir');
    assert.ok(prompt.includes('Bahasa Melayu Malaysia'), 'specificRules BM diinterpolasi');
    assert.ok(prompt.includes('Awak ikut kami,'), 'few-shot BM diinterpolasi');
    assert.ok(prompt.includes('## Output Format'), 'seksyen Output Format hadir');
    assert.ok(!prompt.includes('${targetLabel}'), 'tiada placeholder tertinggal');
    assert.ok(!prompt.includes('${fewShot}'), 'tiada placeholder few-shot tertinggal');
});

test('[ENGINE-4] Env TRINITY_TRANSLATION_PROMPT_SETUP — fallback bila options kosong', () => {
    const prev = process.env.TRINITY_TRANSLATION_PROMPT_SETUP;
    try {
        process.env.TRINITY_TRANSLATION_PROMPT_SETUP = 'Z';
        const engine = makeEngine();
        assert.equal(engine.promptSetup.id, 'A', 'env tidak dikenali → fallback A');
        // options.promptSetup mengatasi env.
        const engineOpt = makeEngine({ promptSetup: 'A' });
        assert.equal(engineOpt.promptSetup.id, 'A');
    } finally {
        if (prev === undefined) delete process.env.TRINITY_TRANSLATION_PROMPT_SETUP;
        else process.env.TRINITY_TRANSLATION_PROMPT_SETUP = prev;
    }
});

// ── 4. normalizeConfig — passthrough + bypass cache setup bukan-A ──────────

test('[CFG-1] trinity.translation.promptSetup passthrough kekal (slot tidak dibuang)', () => {
    const cfg = normalizeConfig({ trinity: { mode: 'pro', translation: { provider: 'gemini', promptSetup: 'B' } } });
    assert.equal(cfg.trinity.translation.promptSetup, 'B', 'passthrough penuh blok trinity');
});

test('[CFG-2] Setup bukan-A → bypassCache dipaksa (prompt-setup reason)', () => {
    const cfg = normalizeConfig({ trinity: { mode: 'pro', translation: { provider: 'gemini', promptSetup: 'B' } } });
    assert.equal(cfg.bypassCache, true, 'eksperimen B mesti bypass cache');
});

test('[CFG-3] Setup A / kosong → TIADA bypass dipaksa oleh prompt-setup', () => {
    const cfgA = normalizeConfig({ trinity: { mode: 'pro', translation: { provider: 'gemini', promptSetup: 'A' } } });
    assert.notEqual(cfgA.bypassCache, true, 'setup A tidak mencetus bypass');
    const cfgNone = normalizeConfig({ trinity: { mode: 'pro', translation: { provider: 'gemini' } } });
    assert.notEqual(cfgNone.bypassCache, true, 'tanpa setup tidak mencetus bypass');
});

test('[CFG-4] Setup lowercase bukan-A (cth "b") turut mencetus bypass', () => {
    const cfg = normalizeConfig({ trinity: { mode: 'pro', translation: { provider: 'gemini', promptSetup: 'b' } } });
    assert.equal(cfg.bypassCache, true, 'normalisasi case-insensitive pada reason bypass');
});
