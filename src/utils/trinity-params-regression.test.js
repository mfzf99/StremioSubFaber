// ─────────────────────────────────────────────────────────────────────────────
// [FASA 3 v3.9.46] TRINITY PARAMS — CAPABILITY MAP + SKEMA + MIGRASI + ISOLASI
// ─────────────────────────────────────────────────────────────────────────────
// Regression suite yang mengunci kontrak Fasa 3:
//   A. Capability map (src/utils/modelCapabilities.js) — entri ground truth
//      per-model (Gemini STRICT/LEGACY, Kimi fixed, Anthropic thinking lock,
//      DeepL no-sampling, OpenAI reasoning, legacy alias proksi).
//   B. Skema trinity.<agent>.params — 4 slot + sanitasi + deviasi→bypassCache.
//   C. Migrasi automatik advancedSettings/providerParameters → translation.
//   D. Pengasingan parameter translation vs secondary (tiada tumpang).
// Sumber kebenaran: plans/trinity-params-ground-truth-2026.md (§A/§B) +
// keputusan Owner 2026-10-15 (#1 reroute STRICT, #2 alias proksi, #3 lalai
// per-ejen diperakui).
// ─────────────────────────────────────────────────────────────────────────────

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeConfig } = require('./config');
const capabilities = require('./modelCapabilities');
const { resolveCapabilityProfile, getAgentDefaultParams, sanitizeAgentParams } = capabilities;

// ── A. CAPABILITY MAP ───────────────────────────────────────────────────────

test('[A1] Gemini 2.5 — full sampling + thinkingBudget int', () => {
    const p = resolveCapabilityProfile('gemini', 'gemini-2.5-flash');
    assert.equal(p.family, 'gemini-2.5');
    assert.ok('temperature' in p.parameters);
    assert.ok('topP' in p.parameters);
    assert.ok('thinkingBudget' in p.parameters);
    assert.ok(!('thinkingLevel' in p.parameters));
});

test('[A2] Gemini 3.x-strict (3.6+/3.5-flash-lite/4/-latest) — sampling stripped', () => {
    for (const model of [
        'gemini-3.6-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.8-flash',
        'gemini-4-argon',
        'gemini-flash-latest'
    ]) {
        const p = resolveCapabilityProfile('gemini', model);
        assert.equal(p.family, 'gemini-3.x-strict', `${model} mesti STRICT`);
        assert.ok(!('temperature' in p.parameters), `${model} tiada temperature`);
        assert.ok(!('topP' in p.parameters), `${model} tiada topP`);
        assert.ok('thinkingLevel' in p.parameters, `${model} ada thinkingLevel`);
    }
});

test('[A2b] KEPUTUSAN OWNER #1 — gemini-3.5-flash & gemini-3.7-flash STRICT (reroute)', () => {
    for (const model of ['gemini-3.5-flash', 'gemini-3.7-flash']) {
        const p = resolveCapabilityProfile('gemini', model);
        assert.equal(p.family, 'gemini-3.x-strict', `${model} reroute STRICT`);
        assert.ok(!('temperature' in p.parameters));
        assert.ok(p.notes.includes('server-reroute-stripped'), `${model} bawa nota reroute`);
    }
});

test('[A3] Gemini 3.x-legacy (3.0/3.1) — sampling diterima + nota syor 1.0', () => {
    for (const model of ['gemini-3-flash-preview', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite']) {
        const p = resolveCapabilityProfile('gemini', model);
        assert.equal(p.family, 'gemini-3.x-legacy', `${model} LEGACY`);
        assert.ok('temperature' in p.parameters);
        assert.ok(p.notes.includes('google-recommends-temperature-1.0'));
    }
});

test('[A4] Kimi K3 — temp FIXED 1.0 / topP FIXED 0.95 (nilai lain di-clamp balik)', () => {
    const p = resolveCapabilityProfile('moonshot', 'kimi-k3');
    assert.equal(p.family, 'kimi-fixed-sampling');
    const sanitized = sanitizeAgentParams('translation', { temperature: 0.3, topP: 0.8 }, 'moonshot', 'kimi-k3');
    assert.equal(sanitized.temperature, 1.0, 'temp dikunci 1.0');
    assert.equal(sanitized.topP, 0.95, 'topP dikunci 0.95');
});

test('[A5] Anthropic thinking — temp bebas 0–1; nota kunci thinking', () => {
    const p = resolveCapabilityProfile('anthropic', 'claude-sonnet-4-5');
    assert.ok('thinkingBudget' in p.parameters);
    assert.ok(p.notes.includes('thinking-locks-temperature-1.0'));
});

test('[A6] DeepL — hanya modelType/formality/preserveFormatting (tiada sampling)', () => {
    const p = resolveCapabilityProfile('deepl', 'deepl');
    assert.ok(!('temperature' in p.parameters));
    assert.ok(!('topP' in p.parameters));
    const sanitized = sanitizeAgentParams('translation', { temperature: 0.5, formality: 'more' }, 'deepl', 'deepl');
    assert.ok(!('temperature' in sanitized), 'sampling dibuang senyap');
    assert.equal(sanitized.formality, 'more');
});

test('[A7] OpenAI o-series/gpt-5/5.1 — tiada sampling; reasoning_effort sah', () => {
    for (const model of ['o3', 'gpt-5', 'gpt-5.1-chat']) {
        const p = resolveCapabilityProfile('openai', model);
        assert.ok(!('temperature' in p.parameters), `${model} tiada sampling`);
        assert.ok('reasoningEffort' in p.parameters);
    }
    const modern = resolveCapabilityProfile('openai', 'gpt-5.5');
    assert.ok('temperature' in modern.parameters, 'gpt-5.5+ sokong sampling semula');
});

test('[A8] KEPUTUSAN OWNER #2 — ID model legasi proksi dipetakan tanpa ralat', () => {
    // deepseek-chat RETIRED di DeepSeek rasmi, tetapi proksi pihak ketiga masih
    // menggunakannya sebagai alias — mesti resolve kepada profil generik pintu.
    for (const [door, model] of [
        ['custom', 'deepseek-chat'],
        ['custom', 'gpt-4o'],
        ['custom', 'llama-3.3-70b-versatile'],
        ['openai-compatible', 'some-unknown-model']
    ]) {
        const p = resolveCapabilityProfile(door, model);
        assert.ok(p && p.family, `${door}/${model} mesti resolve tanpa throw`);
        assert.ok(!('topK' in p.parameters), 'topK haram (v1.6.0)');
    }
});

test('[A9] Custom door — keupayaan ikut nama model (gemini/claude/kimi/glm/deepseek)', () => {
    assert.equal(resolveCapabilityProfile('custom', 'gemini-3.6-flash').family, 'gemini-3.x-strict');
    assert.equal(resolveCapabilityProfile('custom', 'claude-opus-4-5').family, 'anthropic-thinking');
    assert.equal(resolveCapabilityProfile('custom', 'kimi-k3').family, 'kimi-fixed-sampling');
    assert.equal(resolveCapabilityProfile('custom', 'glm-5.3').family, 'glm');
    assert.equal(resolveCapabilityProfile('custom', 'deepseek-flash').family, 'deepseek-thinking');
});

// ── A-B. LALAI PER-EJEN (KEPUTUSAN OWNER #3) ────────────────────────────────

test('[AD1] Lalai optimum per-ejen — preflight/inspector deterministik, translation kreatif terkawal', () => {
    const pre = getAgentDefaultParams('preflight', 'openai-compatible', 'gpt-5.5');
    assert.equal(pre.temperature, 0.0);
    const tr = getAgentDefaultParams('translation', 'openai-compatible', 'gpt-5.5');
    assert.equal(tr.temperature, 0.3);
    const insp = getAgentDefaultParams('inspector', 'openai-compatible', 'gpt-5.5');
    assert.equal(insp.temperature, 0.0);
    // Secondary mengikut profil translation (sandaran).
    const sec = getAgentDefaultParams('secondary', 'openai-compatible', 'gpt-5.5');
    assert.equal(sec.temperature, 0.3);
});

test('[AD2] Lalai ejen hanya medan yang disokong model (STRICT tiada temperature)', () => {
    const tr = getAgentDefaultParams('translation', 'gemini', 'gemini-3.6-flash');
    assert.ok(!('temperature' in tr), 'STRICT: tiada temperature dalam lalai');
    assert.ok('thinkingLevel' in tr);
    assert.equal(tr.thinkingLevel, 'low', 'translation → thinkingLevel low');
});

// ── B. SKEMA trinity.<agent>.params ─────────────────────────────────────────

test('[B1] normalizeConfig — 4 slot ejen wujud + params dielakkan (passthrough) apabila kosong', () => {
    const cfg = normalizeConfig({ trinity: { mode: 'pro', translation: { provider: 'gemini' } } });
    for (const slot of ['preflight', 'translation', 'secondary', 'inspector']) {
        assert.ok(cfg.trinity[slot] && typeof cfg.trinity[slot] === 'object', `slot ${slot} wujud`);
    }
    assert.equal(cfg.__trinityParamsDeviated, undefined, 'tiada params → tiada deviasi');
});

test('[B2] Sanitasi params — clamp julat + buang parameter tidak disokong', () => {
    const cfg = normalizeConfig({
        trinity: {
            mode: 'pro',
            translation: {
                provider: 'gemini',
                model: 'gemini-2.5-flash',
                params: { temperature: 9, topP: 0.9, reasoningEffort: 'high' }
            }
        }
    });
    const params = cfg.trinity.translation.params;
    assert.equal(params.temperature, 2, 'clamp max 2');
    assert.equal(params.topP, 0.9);
    assert.ok(!('reasoningEffort' in params), 'reasoningEffort tidak disokong Gemini → dibuang');
});

test('[B3] AUTO-FORCE BYPASS CACHE — params menyimpang → bypassCache true', () => {
    const cfg = normalizeConfig({
        trinity: {
            mode: 'pro',
            translation: { provider: 'gemini', model: 'gemini-2.5-flash', params: { temperature: 0.4 } }
        }
    });
    assert.equal(cfg.__trinityParamsDeviated, true);
    assert.equal(cfg.bypassCache, true, 'deviasi params memaksa bypass cache');
});

test('[B4] Params pada nilai lalai ejen → TIADA bypass dipaksa', () => {
    const defaults = getAgentDefaultParams('translation', 'gemini', 'gemini-2.5-flash');
    const cfg = normalizeConfig({
        trinity: {
            mode: 'pro',
            translation: { provider: 'gemini', model: 'gemini-2.5-flash', params: defaults }
        }
    });
    assert.notEqual(cfg.__trinityParamsDeviated, true, 'lalai = bukan deviasi');
});

// ── C. MIGRASI AUTOMATIK ────────────────────────────────────────────────────

test('[C1] advancedSettings lama → trinity.translation.params (tanpa kehilangan data)', () => {
    const cfg = normalizeConfig({
        advancedSettings: { enabled: false, temperature: 0.7, topP: 0.9, maxOutputTokens: 8192 },
        trinity: { mode: 'pro', translation: { provider: 'gemini', model: 'gemini-3-flash-preview' } }
    });
    const params = cfg.trinity.translation.params;
    assert.equal(params.temperature, 0.7);
    assert.equal(params.topP, 0.9);
    assert.equal(params.maxOutputTokens, 8192);
    assert.equal(cfg.trinity.translation.__paramsMigrated, true, 'bendera migrasi sekali sahaja');
});

test('[C2] providerParameters.<main> lama → trinity.translation.params', () => {
    const cfg = normalizeConfig({
        mainProvider: 'deepseek',
        providers: { deepseek: { enabled: true, apiKey: 'sk-x', model: 'deepseek-flash' } },
        providerParameters: { deepseek: { temperature: 0.6, topP: 0.9 } },
        trinity: { mode: 'pro', translation: { provider: 'deepseek', model: 'deepseek-flash' } }
    });
    const params = cfg.trinity.translation.params;
    assert.equal(params.temperature, 0.6);
    assert.equal(params.topP, 0.9);
});

test('[C3] Migrasi TIDAK menimpa params sedia ada (pengguna baharu lebih prioriti)', () => {
    const cfg = normalizeConfig({
        advancedSettings: { temperature: 0.9 },
        trinity: {
            mode: 'pro',
            translation: { provider: 'gemini', model: 'gemini-2.5-flash', params: { temperature: 0.2 } }
        }
    });
    assert.equal(cfg.trinity.translation.params.temperature, 0.2, 'params eksplisit kekal');
});

// ── D. PENGASINGAN PARAMETER ANTARA EJEN ────────────────────────────────────

test('[D1] Secondary params terasing — TIDAK menumpang parameter main provider', () => {
    const cfg = normalizeConfig({
        trinity: {
            mode: 'pro',
            translation: { provider: 'gemini', model: 'gemini-2.5-flash', params: { temperature: 0.1 } },
            secondary: { provider: 'deepseek', model: 'deepseek-flash', params: { temperature: 0.8 } }
        }
    });
    assert.equal(cfg.trinity.translation.params.temperature, 0.1, 'translation kekal 0.1');
    assert.equal(cfg.trinity.secondary.params.temperature, 0.8, 'secondary bebas 0.8');
});

test('[D2] Preflight/Inspector params wujud berasingan + sanitasi berbeza ikut provider', () => {
    const cfg = normalizeConfig({
        trinity: {
            mode: 'pro',
            preflight: { provider: 'moonshot', model: 'kimi-k3', params: { temperature: 0.5 } },
            inspector: {
                provider: 'custom',
                model: 'gpt-5.1-chat',
                params: { temperature: 0.5, reasoningEffort: 'high' }
            }
        }
    });
    // Kimi K3 fixed → clamp 1.0.
    assert.equal(cfg.trinity.preflight.params.temperature, 1.0);
    // gpt-5.1 reasoning-only → temperature dibuang, reasoningEffort kekal.
    assert.ok(!('temperature' in cfg.trinity.inspector.params));
    assert.equal(cfg.trinity.inspector.params.reasoningEffort, 'high');
});

test('[D3] Deviasi pada mana-mana ejen (termasuk preflight/inspector) → bypassCache', () => {
    const cfg = normalizeConfig({
        trinity: {
            mode: 'pro',
            inspector: { provider: 'openai-compatible', model: 'gpt-5.5', params: { temperature: 0.7 } }
        }
    });
    assert.equal(cfg.__trinityParamsDeviated, true);
    assert.equal(cfg.bypassCache, true);
});

// ── F. AGENT B — GOD-TIER DEFAULT + OVERRIDE PARAMS ────────────────────────

test('[F1] agentB.preflightParams/inspectorParams null tanpa params Trinity (god-tier 4-kunci kekal)', () => {
    const cfg = normalizeConfig({
        trinity: {
            mode: 'pro',
            preflight: { provider: 'moonshot', model: 'kimi-k3' },
            inspector: { provider: 'openai', model: 'gpt-5.5' }
        }
    });
    assert.equal(cfg.agentB.preflightParams, null);
    assert.equal(cfg.agentB.inspectorParams, null);
});

test('[F2] agentB membawa params tersanitasi apabila pengguna menetapkannya', () => {
    const cfg = normalizeConfig({
        trinity: {
            mode: 'pro',
            inspector: { provider: 'openai', model: 'gpt-5.5', params: { temperature: 0.1, topP: 0.9 } },
            preflight: { provider: 'moonshot', model: 'kimi-k3', params: { temperature: 0.5 } }
        }
    });
    // kimi-k3: clamp balik 1.0 (fixed).
    assert.equal(cfg.agentB.preflightParams.temperature, 1.0);
    assert.equal(cfg.agentB.inspectorParams.temperature, 0.1);
    assert.equal(cfg.agentB.inspectorParams.topP, 0.9);
});

test('[F3] AgentBInspector: tanpa params → muatan 4-kunci god-tier 1:1 (kontrak PAYLOAD-GODTIER)', () => {
    const { AgentBInspector } = require('../services/agentBInspector');
    const inspector = new AgentBInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'deepseek-v4-pro',
        preflightModel: 'kimi-k3'
    });
    const { body } = inspector.buildChatRequest('p', true, {});
    assert.deepEqual(Object.keys(body).sort(), ['messages', 'model', 'stream', 'temperature']);
    assert.equal(body.temperature, 0.0);
    assert.equal(body.stream, true);
});

test('[F4] AgentBInspector: params eksplisit diinjek sebagai kunci tambahan; model/messages/stream terpelihara', () => {
    const { AgentBInspector } = require('../services/agentBInspector');
    const inspector = new AgentBInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'deepseek-v4-pro',
        inspectorParams: { temperature: 0.2, topP: 0.9 }
    });
    const { body } = inspector.buildChatRequest('p', true, {});
    assert.equal(body.temperature, 0.2, 'temperature eksplisit menimpa god-tier 0.0');
    assert.equal(body.topP, 0.9);
    assert.equal(body.stream, true, 'kunci asas stream kekal');
    assert.ok(Array.isArray(body.messages));
});

test('[F5] AgentBInspector: preflightParams diguna semasa Fasa 0 (toggle dalam runPreflightPass finally)', () => {
    const { AgentBInspector } = require('../services/agentBInspector');
    const inspector = new AgentBInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'deepseek-v4-pro',
        preflightModel: 'kimi-k3',
        preflightParams: { topP: 0.7 },
        inspectorParams: { topP: 0.9 }
    });
    // Laluan semakan (lalai) → inspectorParams.
    assert.equal(inspector.buildChatRequest('p', true, {}).body.topP, 0.9);
    // Simulasi toggle Fasa 0 (seperti runPreflightPass).
    inspector.__activeAgentParams = inspector.preflightParams;
    assert.equal(inspector.buildChatRequest('p', true, {}).body.topP, 0.7);
});

// ── E. KONSISTENSI getModelFamily ↔ CAPABILITY MAP ──────────────────────────

test('[E1] getModelFamily(gemini.js) selari dengan capability map untuk sempadan kritikal', () => {
    const { getModelFamily } = require('../services/gemini');
    for (const model of [
        'gemini-2.5-flash',
        'gemini-3-flash-preview',
        'gemini-3.1-pro-preview',
        'gemini-3.5-flash', // reroute STRICT (Owner #1)
        'gemini-3.5-flash-lite',
        'gemini-3.6-flash',
        'gemini-3.7-flash', // reroute STRICT (Owner #1)
        'gemini-3.8-flash'
    ]) {
        const family = getModelFamily(model).family;
        const profile = resolveCapabilityProfile('gemini', model).family;
        const expected =
            family === '3.x-strict'
                ? 'gemini-3.x-strict'
                : family === '3.x-legacy'
                  ? 'gemini-3.x-legacy'
                  : family === '2.5'
                    ? 'gemini-2.5'
                    : null;
        if (expected) {
            assert.equal(profile, expected, `${model}: getModelFamily=${family} selari capability map=${profile}`);
        }
    }
});
