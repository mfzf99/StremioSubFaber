/**
 * Regression — Trinity-wide prompt setup bundle (Mandat Owner 2026-11-03)
 *
 * Satu resolver memilih prompt Agent Preflight, Agent Translation dan Agent
 * Inspector. Setup A kekal verbatim dan semua ejen menerima bundle yang sama.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const setupA = require('./prompts/trinity/setups/setupA');
const setupB = require('./prompts/trinity/setups/setupB');
const {
    DEFAULT_TRINITY_PROMPT_SETUP_ID,
    FALLBACK_TRINITY_PROMPT_SETUP_ID,
    getTrinitySetup,
    listTrinitySetups
} = require('./prompts/trinity/setups');
const { PREFLIGHT_STATIC_TEMPLATE } = require('./prompts/trinity/preflight/core');
const { TRANSLATION_SYSTEM_TEMPLATE } = require('./prompts/trinity/translation/core');
const { INSPECTOR_INSTRUCTION } = require('./prompts/trinity/inspector/core');
const { buildPreflightPrompt } = require('./subfaberPreflight');
const { AgentInspector, buildInspectionPayload } = require('./agentInspector');
const TranslationEngine = require('./translationEngine');
const { normalizeConfig } = require('../utils/config');

test('[TRINITY-SETUP-1] Setup A menyimpan ketiga-tiga prompt byte-identical dengan export core', () => {
    assert.equal(setupA.preflightTemplate, PREFLIGHT_STATIC_TEMPLATE);
    assert.equal(setupA.translationTemplate, TRANSLATION_SYSTEM_TEMPLATE);
    assert.equal(setupA.inspectorInstruction, INSPECTOR_INSTRUCTION);
    assert.ok(setupA.preflightTemplate.includes('${honorificMatrix}'));
    assert.ok(setupA.translationTemplate.includes('${targetSpecificRules}'));
    assert.ok(setupA.inspectorInstruction.includes('UNTRANSLATED'));
});

test('[TRINITY-SETUP-2] Resolver default, case-insensitive, fallback dan senarai tidak mendedahkan prompt', () => {
    assert.equal(DEFAULT_TRINITY_PROMPT_SETUP_ID, 'A');
    assert.equal(FALLBACK_TRINITY_PROMPT_SETUP_ID, 'A');
    assert.equal(getTrinitySetup(''), setupA);
    assert.equal(getTrinitySetup(' a '), setupA);
    assert.equal(getTrinitySetup('unknown'), setupA);
    assert.deepEqual(listTrinitySetups()[0], { id: 'A', label: setupA.label });
    assert.deepEqual(listTrinitySetups()[1], { id: 'B', label: setupB.label });
});

test('[TRINITY-SETUP-3] Builder Preflight dan Inspector membaca prompt daripada bundle yang disuntik', () => {
    const custom = {
        ...setupA,
        preflightTemplate:
            'PREFLIGHT CUSTOM ${src} ${tgt} ${honorificMatrix} ${canonicalAddressMatrix} ${creditsExample}',
        inspectorInstruction: 'INSPECTOR CUSTOM'
    };
    const preflight = buildPreflightPrompt('Dialogue', 'Malay', 'English', 'openai', custom);
    assert.ok(preflight.includes('PREFLIGHT CUSTOM English Malay'));
    const inspection = buildInspectionPayload(
        [{ id: 1, text: 'Hello' }],
        [{ index: 0, text: 'Helo' }],
        null,
        null,
        custom
    );
    assert.ok(inspection.prompt.startsWith('INSPECTOR CUSTOM\n'));
});

test('[TRINITY-SETUP-4] AgentInspector dan TranslationEngine menyelesaikan id setup yang sama', () => {
    const inspector = new AgentInspector({ promptSetup: 'a' });
    const engine = new TranslationEngine(
        { translateSubtitle: async () => '', estimateTokenCount: () => 10 },
        'gemini-2.5-flash',
        {},
        { promptSetup: 'A' }
    );
    assert.equal(inspector.promptSetup.id, 'A');
    assert.equal(engine.promptSetup.id, inspector.promptSetup.id);
    assert.equal(engine.promptSetup.translationTemplate, setupA.translationTemplate);
});

test('[TRINITY-SETUP-5] Env kanonik didahulukan dan env Translation legasi kekal disokong', () => {
    const previousCanonical = process.env.TRINITY_PROMPT_SETUP;
    const previousLegacy = process.env.TRINITY_TRANSLATION_PROMPT_SETUP;
    try {
        process.env.TRINITY_PROMPT_SETUP = 'unknown-canonical';
        process.env.TRINITY_TRANSLATION_PROMPT_SETUP = 'unknown-legacy';
        const inspector = new AgentInspector({});
        assert.equal(inspector.promptSetup.id, 'A');
        delete process.env.TRINITY_PROMPT_SETUP;
        const legacyInspector = new AgentInspector({});
        assert.equal(legacyInspector.promptSetup.id, 'A');
    } finally {
        if (previousCanonical === undefined) delete process.env.TRINITY_PROMPT_SETUP;
        else process.env.TRINITY_PROMPT_SETUP = previousCanonical;
        if (previousLegacy === undefined) delete process.env.TRINITY_TRANSLATION_PROMPT_SETUP;
        else process.env.TRINITY_TRANSLATION_PROMPT_SETUP = previousLegacy;
    }
});

test('[TRINITY-SETUP-6] Config kanonik dan legasi bukan-A memaksa bypass cache', () => {
    const canonical = normalizeConfig({ trinity: { promptSetup: 'B' } });
    const legacy = normalizeConfig({ trinity: { translation: { promptSetup: 'c' } } });
    const baseline = normalizeConfig({ trinity: { promptSetup: 'A' } });
    assert.equal(canonical.bypassCache, true);
    assert.equal(legacy.bypassCache, true);
    assert.notEqual(baseline.bypassCache, true);
});

test('[TRINITY-SETUP-7] Config kanonik mengatasi slot Translation legasi untuk keputusan bypass', () => {
    const cfg = normalizeConfig({
        trinity: { promptSetup: 'A', translation: { promptSetup: 'B' } }
    });
    assert.notEqual(cfg.bypassCache, true);
});
