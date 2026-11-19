/**
 * [OWNER MANDATE 2026-11-20 — SEND-ALL v2 for Gemini native doors]
 *
 * Contract: for BOTH the official Gemini door and Gemini via custom/proxy
 * (Crazy Router) using the gemini-native door, the wire MUST always carry:
 * temperature, topP, thinkingLevel, frequencyPenalty and presencePenalty.
 * Even explicit 0.0 penalties MUST be sent — "not set" is no longer a valid
 * state for this door because the Owner wants the request to be explicit.
 *
 * Red-first: this suite was written BEFORE production edits and observed
 * failing against the pre-change code (suppression of penalties for
 * 3.x-strict + omission when unset).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const GeminiService = require('./gemini');
const geminiChannel = require('./channels/geminiChannel');

const LEGACY_MODELS = ['gemini-3-flash-preview', 'gemini-3.1-pro-preview'];
const STRICT_MODELS = ['gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.5-flash-lite', 'gemini-3.5-flash'];

test('[SEND-ALL v2] GeminiService: legacy families always emit temperature/topP/penalties (0.0 honored)', () => {
    for (const model of [...LEGACY_MODELS, 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']) {
        const svc = new GeminiService('fake-key', model, { frequencyPenalty: 0, presencePenalty: 0 });
        const cfg = svc.buildGenerationConfig(4096);
        assert.equal(cfg.frequencyPenalty, 0, `${model} wajib hantar frequencyPenalty 0`);
        assert.equal(cfg.presencePenalty, 0, `${model} wajib hantar presencePenalty 0`);
        assert.notEqual(cfg.temperature, undefined, `${model} wajib hantar temperature`);
        assert.notEqual(cfg.topP, undefined, `${model} wajib hantar topP`);
    }
});

test('[SEND-ALL v2] GeminiService: 3.x-strict families also emit penalties (suppression removed)', () => {
    for (const model of STRICT_MODELS) {
        const svc = new GeminiService('fake-key', model, {
            thinkingLevel: 'low',
            temperature: 0.4,
            topP: 0.9,
            frequencyPenalty: 0,
            presencePenalty: 0
        });
        const cfg = svc.buildGenerationConfig(4096);
        assert.equal(cfg.frequencyPenalty, 0, `${model} STRICT tidak lagi menindas frequencyPenalty`);
        assert.equal(cfg.presencePenalty, 0, `${model} STRICT tidak lagi menindas presencePenalty`);
        assert.equal(cfg.temperature, 0.4, `${model} temperature kekal dihantar`);
        assert.equal(cfg.topP, 0.9, `${model} topP kekal dihantar`);
        assert.ok(cfg.thinkingConfig && cfg.thinkingConfig.thinkingLevel, `${model} thinkingLevel kekal`);
    }
});

test('[SEND-ALL v2] GeminiService: penalties default to 0.0 when not provided (no undefined omit)', () => {
    for (const model of [...LEGACY_MODELS, ...STRICT_MODELS, 'gemini-2.5-flash']) {
        const svc = new GeminiService('fake-key', model, {});
        const cfg = svc.buildGenerationConfig(4096);
        assert.equal(cfg.frequencyPenalty, 0, `${model} lalai frequencyPenalty 0 (bukan omit)`);
        assert.equal(cfg.presencePenalty, 0, `${model} lalai presencePenalty 0 (bukan omit)`);
    }
});

test('[SEND-ALL v2] geminiChannel (custom/proxy native door): request body always carries all five', () => {
    const bare = geminiChannel.buildRequest({ model: 'gemini-3-flash-preview', userPrompt: 'x' });
    const gc = bare.body.generationConfig;
    assert.notEqual(gc.temperature, undefined, 'channel: temperature wajib');
    assert.notEqual(gc.topP, undefined, 'channel: topP wajib');
    assert.ok(gc.thinkingConfig && gc.thinkingConfig.thinkingLevel, 'channel: thinkingLevel wajib');
    assert.equal(gc.frequencyPenalty, 0, 'channel: frequencyPenalty 0 wajib');
    assert.equal(gc.presencePenalty, 0, 'channel: presencePenalty 0 wajib');

    const strict = geminiChannel.buildRequest({ model: 'gemini-3.8-flash', userPrompt: 'x' });
    const sgc = strict.body.generationConfig;
    assert.equal(sgc.frequencyPenalty, 0, 'channel strict: frequencyPenalty 0 wajib');
    assert.equal(sgc.presencePenalty, 0, 'channel strict: presencePenalty 0 wajib');

    const tuned = geminiChannel.buildRequest({
        model: 'gemini-3-flash-preview',
        userPrompt: 'x',
        advancedSettings: { frequencyPenalty: 0.7, presencePenalty: -0.4 }
    });
    assert.equal(tuned.body.generationConfig.frequencyPenalty, 0.7);
    assert.equal(tuned.body.generationConfig.presencePenalty, -0.4);
});
