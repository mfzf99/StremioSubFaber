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

// ═══ [NAIK TARAF ASSERTION — TRINITY TOTAL UNLOCK FASA 1, Mandat Owner 2026-10-19] ═══
// AUDIT: Sebelum Total Unlock, keluarga STRICT menyembunyikan descriptor
// temperature/topP (UI tidak papar medan). Keputusan Rasmi Owner (K8):
// descriptor DIISYHTARKAN semula dengan uiHint — nilai pengguna dihantar
// (SEND-ALL); pelayan putuskan sendiri. Assertion dinaik taraf selari.
test('[A2] Gemini 3.x-strict (3.6+/3.5-flash-lite/4/-latest) — sampling diisytihar dengan uiHint (TOTAL UNLOCK)', () => {
    for (const model of [
        'gemini-3.6-flash',
        'gemini-3.5-flash-lite',
        'gemini-3.8-flash',
        'gemini-4-argon',
        'gemini-flash-latest'
    ]) {
        const p = resolveCapabilityProfile('gemini', model);
        assert.equal(p.family, 'gemini-3.x-strict', `${model} mesti STRICT`);
        assert.ok('temperature' in p.parameters, `${model} isytihar temperature (uiHint)`);
        assert.ok('topP' in p.parameters, `${model} isytihar topP (uiHint)`);
        assert.equal(
            p.parameters.temperature.uiHint,
            'server-strips-for-this-model',
            `${model} uiHint menandakan pelayan mengabaikan`
        );
        assert.ok('thinkingLevel' in p.parameters, `${model} ada thinkingLevel`);
    }
});

test('[A2b] KEPUTUSAN OWNER #1 — gemini-3.5-flash & gemini-3.7-flash STRICT (reroute)', () => {
    for (const model of ['gemini-3.5-flash', 'gemini-3.7-flash']) {
        const p = resolveCapabilityProfile('gemini', model);
        assert.equal(p.family, 'gemini-3.x-strict', `${model} reroute STRICT`);
        assert.ok('temperature' in p.parameters, 'descriptor diisytihar (TOTAL UNLOCK)');
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

// ═══ [NAIK TARAF ASSERTION — TRINITY TOTAL UNLOCK FASA 1, Mandat Owner 2026-10-19] ═══
// AUDIT: Sebelum Total Unlock, kimi-k3 clamp `fixed` temp 1.0 / topP 0.95
// secara senyap. Keputusan Rasmi Owner (K2): nilai pengguna dihantar apa
// adanya; 1.0/0.95 kekal CADANGAN lalai sahaja. Assertion dinaik taraf.
test('[A4] Kimi K3 — nilai pengguna dihormati; 1.0/0.95 cadangan sahaja (TOTAL UNLOCK)', () => {
    const p = resolveCapabilityProfile('moonshot', 'kimi-k3');
    assert.equal(p.family, 'kimi-fixed-sampling');
    assert.equal(p.parameters.temperature.uiHint, 'ground-truth-suggests-1.0', 'uiHint cadangan (bukan kunci)');
    const sanitized = sanitizeAgentParams('translation', { temperature: 0.3, topP: 0.8 }, 'moonshot', 'kimi-k3');
    assert.equal(sanitized.temperature, 0.3, 'nilai pengguna dihantar apa adanya');
    assert.equal(sanitized.topP, 0.8, 'topP pengguna dihantar apa adanya');
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

test('[SEND-ALL v3.10.5] Penalty diisytiharkan dalam SEMUA profil bersampling (UI parity)', () => {
    // Mandat Owner (2026-10-16): Model Parameters Trinity mesti papar kelima-lima
    // parameter (Thinking/Temperature/Top-P/presence/frequency). Backend profile
    // MENGISYTIHARKAN penalty supaya sanitizeAgentParams tidak membuang nilai
    // dari UI secara senyap — selari dengan trinity-agents.js (mpParam(-2, 2, 0)).
    const SAMPLING_CASES = [
        ['gemini', 'gemini-2.5-flash'],
        ['gemini', 'gemini-3-flash-preview'],
        ['gemini', 'gemini-3.1-pro-preview'],
        ['gemini', 'gemma-3-27b-it'],
        ['anthropic', 'claude-sonnet-4-5'],
        ['anthropic', 'claude-3-5-haiku-latest'],
        ['moonshot', 'kimi-k3'],
        ['moonshot', 'kimi-k2.5'],
        ['openai', 'gpt-5.5'],
        ['openai', 'gpt-4o'],
        ['custom', 'glm-4.6'],
        ['custom', 'some-unknown-model'],
        ['openai-compatible', 'whatever']
    ];
    for (const [provider, model] of SAMPLING_CASES) {
        const p = resolveCapabilityProfile(provider, model);
        assert.ok('frequencyPenalty' in p.parameters, `${provider}/${model} mesti isytihar frequencyPenalty`);
        assert.ok('presencePenalty' in p.parameters, `${provider}/${model} mesti isytihar presencePenalty`);
        assert.equal(p.parameters.frequencyPenalty.min, -2);
        assert.equal(p.parameters.frequencyPenalty.max, 2);
        assert.equal(p.parameters.presencePenalty.default, 0);
    }
    // Profil TIADA-sampling kekal bersih (penalty tidak diisytihar).
    // [SEND-ALL 2026-10-16] 'custom/deepseek-chat' DIPINDAH ke SAMPLING_CASES —
    // DeepSeek kini profil generik pintu openai-compatible (sampling penuh).
    const NO_SAMPLING_CASES = [
        ['deepl', ''],
        ['openai', 'o3'],
        ['openai', 'gpt-5.1']
    ];
    for (const [provider, model] of NO_SAMPLING_CASES) {
        const p = resolveCapabilityProfile(provider, model);
        assert.ok(!('frequencyPenalty' in p.parameters), `${provider}/${model} TIDAK isytihar frequencyPenalty`);
        assert.ok(!('presencePenalty' in p.parameters), `${provider}/${model} TIDAK isytihar presencePenalty`);
    }
});

test('[SEND-ALL v3.10.5] sanitizeAgentParams meluluskan + clamp penalty (-2..2)', () => {
    const clean = sanitizeAgentParams(
        'translation',
        { frequencyPenalty: 0.5, presencePenalty: -0.5 },
        'gemini',
        'gemini-3-flash-preview'
    );
    assert.equal(clean.frequencyPenalty, 0.5, 'frequencyPenalty sah melulus');
    assert.equal(clean.presencePenalty, -0.5, 'presencePenalty sah melulus');
    const clamped = sanitizeAgentParams(
        'translation',
        { frequencyPenalty: 9, presencePenalty: -9 },
        'gemini',
        'gemini-2.5-flash'
    );
    assert.equal(clamped.frequencyPenalty, 2, 'frequencyPenalty clamp ke max 2');
    assert.equal(clamped.presencePenalty, -2, 'presencePenalty clamp ke min -2');
    // Profil tanpa sampling — penalty dibuang senyap (kontrak kekal).
    const dropped = sanitizeAgentParams('translation', { frequencyPenalty: 0.5 }, 'openai', 'o3');
    assert.ok(!('frequencyPenalty' in dropped), 'penalty dibuang pada profil no-sampling');
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
    // [SEND-ALL 2026-10-16] DeepSeek kini jatuh ke profil generik pintu
    // openai-compatible — sampling penuh (temp/topP/penalties/reasoningEffort).
    const ds = resolveCapabilityProfile('custom', 'deepseek-flash');
    assert.equal(ds.family, 'openai-compatible-generic');
    assert.ok('temperature' in ds.parameters, 'DeepSeek: temperature mesti terbuka');
    assert.ok('topP' in ds.parameters, 'DeepSeek: topP mesti terbuka');
    assert.ok(!('topK' in ds.parameters), 'topK haram (v1.6.0)');
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

// ═══ [NAIK TARAF ASSERTION — TRINITY TOTAL UNLOCK FASA 1, K8] ═══
// AUDIT: Sebelum Total Unlock, STRICT menyembunyikan temperature daripada
// lalai ejen. Kini descriptor diisytihar (uiHint) — cadangan UI wujud, nilai
// pengguna dihantar. thinkingLevel kekal sebagai cadangan ejen.
test('[AD2] Lalai ejen mengandungi descriptor STRICT (temperature diisytihar + uiHint)', () => {
    const tr = getAgentDefaultParams('translation', 'gemini', 'gemini-3.6-flash');
    assert.ok('temperature' in tr, 'STRICT: temperature kini dalam cadangan lalai (TOTAL UNLOCK)');
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
    // ═══ [NAIK TARAF ASSERTION — TOTAL UNLOCK FASA 1, K2] ═══
    // Kimi K3 fixed-clamp dimansuhkan — nilai pengguna 0.5 dihantar apa adanya.
    assert.equal(cfg.trinity.preflight.params.temperature, 0.5, 'kimi-k3 nilai pengguna dihormati');
    // gpt-5.1 reasoning-only → temperature dibuang (bukan keupayaan model),
    // reasoningEffort kekal — ini validasi kebolehlaksanaan, bukan kunci nilai.
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

// ── F. AGENT INSPECTOR — GOD-TIER DEFAULT + OVERRIDE PARAMS ────────────────────────

test('[F1] agentInspector.preflightParams/inspectorParams null tanpa params Trinity (god-tier 4-kunci kekal)', () => {
    const cfg = normalizeConfig({
        trinity: {
            mode: 'pro',
            preflight: { provider: 'moonshot', model: 'kimi-k3' },
            inspector: { provider: 'openai', model: 'gpt-5.5' }
        }
    });
    assert.equal(cfg.agentInspector.preflightParams, null);
    assert.equal(cfg.agentInspector.inspectorParams, null);
});

test('[F2] agentInspector membawa params tersanitasi apabila pengguna menetapkannya', () => {
    const cfg = normalizeConfig({
        trinity: {
            mode: 'pro',
            inspector: { provider: 'openai', model: 'gpt-5.5', params: { temperature: 0.1, topP: 0.9 } },
            preflight: { provider: 'moonshot', model: 'kimi-k3', params: { temperature: 0.5 } }
        }
    });
    // ═══ [NAIK TARAF ASSERTION — TOTAL UNLOCK FASA 1, K2] ═══
    // kimi-k3: nilai pengguna dihormati (fixed-clamp dimansuhkan).
    assert.equal(cfg.agentInspector.preflightParams.temperature, 0.5, 'kimi-k3 0.5 dihantar apa adanya');
    assert.equal(cfg.agentInspector.inspectorParams.temperature, 0.1);
    assert.equal(cfg.agentInspector.inspectorParams.topP, 0.9);
});

// ═══ [NAIK TARAF ASSERTION — TRINITY TOTAL UNLOCK FASA 1, Mandat Owner 2026-10-19, K1] ═══
// AUDIT: Sebelum Total Unlock, muatan god-tier membawa temperature 0.0
// hardcoded walaupun pengguna tidak menetapkan apa-apa. Keputusan Rasmi
// Owner: medan tidak diset → kunci TIDAK dihantar (pelayan guna lalai
// asalnya). stream:true KEKAL (invariant pengangkutan, Keputusan §8.1).
test('[F3] AgentInspector: tanpa params → muatan god-tier sifar-penciptaan (TOTAL UNLOCK)', () => {
    const { AgentInspector } = require('../services/agentInspector');
    const inspector = new AgentInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'deepseek-v4-pro',
        preflightModel: 'kimi-k3'
    });
    const { body } = inspector.buildChatRequest('p', true, {});
    assert.deepEqual(Object.keys(body).sort(), ['messages', 'model', 'stream'], 'kunci sifar-penciptaan nilai');
    assert.ok(!('temperature' in body), 'tiada temperature dicipta enjin');
    assert.equal(body.stream, true, 'stream:true kekal invariant pengangkutan');
});

test('[F4] AgentInspector: params eksplisit diinjek sebagai kunci tambahan; model/messages/stream terpelihara', () => {
    const { AgentInspector } = require('../services/agentInspector');
    const inspector = new AgentInspector({
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

test('[F5] AgentInspector: preflightParams diguna semasa Fasa 0 (toggle dalam runPreflightPass finally)', () => {
    const { AgentInspector } = require('../services/agentInspector');
    const inspector = new AgentInspector({
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

// ── E. [TRINITY→PROVIDER BRIDGE v3.9.49] — insiden 404 MODEL_NOT_FOUND ──────
// Punca: kad Agent Translation (satu-satunya UI enjin utama sejak v3.9.32)
// menyimpan kredential dalam trinity.translation tanpa jambatan kepada
// mainProvider/providers → createTranslationProvider() sentiasa membina
// GeminiService sambil geminiModel tercemar model provider lain
// (deepseek-v4-pro) → 404 pada endpoint Google.
// Jambatan normalizeConfig() kini menjadikan trinity.translation sumber
// kebenaran utama ruting enjin.

test('[E1] Bridge: trinity.translation custom/rootsys → mainProvider=custom, bukan gemini', () => {
    const cfg = normalizeConfig({
        trinity: {
            translation: {
                apiKey: 'sk-rootsys-test',
                provider: 'custom',
                door: 'openai-compatible',
                baseUrl: 'https://rootsys.cloud/v1',
                model: 'deepseek-v4-pro',
                isCustom: true,
                enabled: true
            }
        }
    });
    assert.equal(cfg.mainProvider, 'custom', 'mainProvider MESTI custom, bukan gemini');
    assert.equal(cfg.multiProviderEnabled, true, 'multiProviderEnabled MESTI true');
    const entry = cfg.providers?.custom;
    assert.ok(entry, 'providers.custom wujud');
    assert.equal(entry.enabled, true);
    assert.equal(entry.apiKey, 'sk-rootsys-test');
    assert.equal(entry.model, 'deepseek-v4-pro');
    assert.equal(entry.baseUrl, 'https://rootsys.cloud/v1');
});

test('[E2] Bridge: provider=gemini → tiada perubahan laluan legasi', () => {
    const cfg = normalizeConfig({
        geminiApiKey: 'AIzaTest',
        geminiModel: 'gemini-3-flash-preview',
        trinity: {
            translation: {
                apiKey: 'AIzaTest',
                provider: 'gemini',
                model: 'gemini-3-flash-preview',
                enabled: true
            }
        }
    });
    assert.equal(cfg.mainProvider, 'gemini');
    assert.equal(cfg.multiProviderEnabled, false);
    const customEntry = cfg.providers?.custom;
    assert.ok(
        !customEntry || customEntry.enabled !== true || !customEntry.model,
        'providers.custom TIDAK dijangkiti kredential Trinity'
    );
});

test('[E3] Bridge: slot custom tidak lengkap (tiada baseUrl) → kekal laluan legasi gemini', () => {
    const cfg = normalizeConfig({
        geminiApiKey: 'AIzaTest',
        trinity: {
            translation: {
                apiKey: 'sk-x',
                provider: 'custom',
                baseUrl: '',
                model: 'deepseek-v4-pro',
                enabled: true
            }
        }
    });
    assert.equal(cfg.mainProvider, 'gemini', 'slot tidak layak → jangan rampas mainProvider');
    assert.equal(cfg.multiProviderEnabled, false);
});

test('[E4] Bridge: provider rasmi bukan-gemini (openai) → dirute terus', () => {
    const cfg = normalizeConfig({
        trinity: {
            translation: {
                apiKey: 'sk-openai-test',
                provider: 'openai',
                model: 'gpt-5-mini',
                enabled: true
            }
        }
    });
    assert.equal(cfg.mainProvider, 'openai');
    assert.equal(cfg.multiProviderEnabled, true);
    assert.equal(cfg.providers?.openai?.apiKey, 'sk-openai-test');
    assert.equal(cfg.providers?.openai?.model, 'gpt-5-mini');
    assert.equal(cfg.providers?.openai?.baseUrl, undefined, 'openai rasmi tiada baseUrl');
});

test('[E5] Bridge: entri providers.custom sedia ada TIDAK ditimpa oleh jambatan', () => {
    const cfg = normalizeConfig({
        providers: {
            custom: {
                enabled: true,
                apiKey: 'sk-eksplisit-lama',
                baseUrl: 'https://lama.example/v1',
                model: 'model-lama'
            }
        },
        trinity: {
            translation: {
                apiKey: 'sk-trinity-baru',
                provider: 'custom',
                baseUrl: 'https://rootsys.cloud/v1',
                model: 'deepseek-v4-pro',
                isCustom: true,
                enabled: true
            }
        }
    });
    // Nilai eksplisit sedia ada menang — jambatan tidak merampas kredential
    // yang pengguna tetapkan melalui konfigurasi providers langsung.
    assert.equal(cfg.mainProvider, 'custom');
    assert.equal(cfg.providers.custom.apiKey, 'sk-eksplisit-lama');
    assert.equal(cfg.providers.custom.baseUrl, 'https://lama.example/v1');
    assert.equal(cfg.providers.custom.model, 'model-lama');
});

test('[E6] Bridge: door gemini-native pada custom dikekalkan dalam entri provider', () => {
    const cfg = normalizeConfig({
        trinity: {
            translation: {
                apiKey: 'sk-proxy-g',
                provider: 'custom',
                door: 'gemini-native',
                baseUrl: 'https://proxy.example/v1',
                model: 'gemini-3.6-flash',
                isCustom: true,
                enabled: true
            }
        }
    });
    assert.equal(cfg.mainProvider, 'custom');
    assert.equal(cfg.providers.custom.door, 'gemini-native');
});

test('[E8] Bridge END-TO-END: custom MAIN + door gemini-native (Crazy Router) → GeminiService v1beta, BUKAN OpenAICompatible', async () => {
    const { createTranslationProvider } = require('../services/translationProviderFactory');
    const cfg = normalizeConfig({
        trinity: {
            translation: {
                apiKey: 'sk-crazyrouter-key',
                provider: 'custom',
                door: 'gemini-native',
                baseUrl: 'https://cn.crazyrouter.com/v1beta',
                model: 'gemini-3-flash',
                isCustom: true,
                enabled: true
            }
        }
    });
    const built = await createTranslationProvider(cfg);
    assert.equal(built.providerName, 'custom', 'providerName MESTI custom');
    assert.equal(built.model, 'gemini-3-flash', 'model kekal gemini-3-flash');
    const providerCtor = built.provider?.constructor?.name;
    assert.equal(
        providerCtor,
        'GeminiService',
        `enjin MESTI GeminiService untuk door gemini-native (dapat: ${providerCtor})`
    );
    assert.equal(built.provider?.baseUrl, 'https://cn.crazyrouter.com/v1beta', 'baseUrl proksi v1beta dikekalkan');
    assert.notEqual(providerCtor, 'OpenAICompatibleProvider', 'SAMA SEKALI BUKAN OpenAICompatibleProvider');
});

test('[E9] BASIC-MODE PURITY: agentInspector null → TIADA panggilan pre-flight kepada Agent Translation (formula 4+50+2 tulen)', async () => {
    const TranslationEngine = require('../services/translationEngine');
    let agentACalls = 0;
    const providerA = {
        model: 'gemini-3-flash',
        translateSubtitle: async () => {
            agentACalls++;
            return '';
        }
    };
    const engine = new TranslationEngine(providerA, 'gemini-3-flash', {}, { agentInspector: null });
    const entries = Array.from({ length: 60 }, (_, i) => ({
        id: i + 1,
        startTime: '00:00:01,000',
        endTime: '00:00:02,000',
        text: `line ${i + 1}`
    }));
    const srt = entries.map((e) => `${e.id}\n${e.startTime} --> ${e.endTime}\n${e.text}\n`).join('\n');
    await engine.translateSubtitle(srt, 'Malay', 'English', '');
    assert.equal(engine.preflightContext, null, 'Basic Mode (agentInspector null) MESTI tanpa pre-flight context');
    assert.equal(
        engine.translationStats.agentInspectorUsed,
        false,
        'agentInspectorUsed kekal false — Agent Inspector tidak digunakan'
    );
    assert.equal(engine.translationStats.subfaberContextUsed, undefined, 'konteks pre-flight tidak wujud');
});

test('[E10] BASIC-MODE PURITY: _logAgentInspectorFileSummary senyap bila Agent Inspector tidak pernah hidup (0/0 coverage)', () => {
    const TranslationEngine = require('../services/translationEngine');
    const provider = { model: 'm', translateSubtitle: async () => '' };
    const engine = new TranslationEngine(provider, 'm', {}, { agentInspector: null });
    // Stats seolah-olah Agent Inspector tidak pernah menyentuh fail ini.
    engine.translationStats.agentInspectorBatchesInspected = 0;
    engine.translationStats.agentInspectorBatchesSkippedAfterOpen = 0;
    engine.translationStats.agentInspectorCircuitOpened = false;
    // Spy log.debug: fungsi mesti return TANPA memanggil log.
    let called = false;
    const origDebug = require('../utils/logger').debug;
    require('../utils/logger').debug = () => {
        called = true;
    };
    try {
        engine._logAgentInspectorFileSummary();
    } finally {
        require('../utils/logger').debug = origDebug;
    }
    assert.equal(called, false, 'FILE SUMMARY TIDAK boleh dicetak bila Agent Inspector tidak hidup');
});

// ── F. [PROXY-403 RESILIENCE v3.9.52] — insiden run keenam 2026-10-15 ────────
// Job mati sekelip mata akibat 403 Crazy Router (kuota route transient —
// batch 1-3 berjaya dengan kunci sama sebelum 403). Kelulusan Owner: 401/403
// daripada baseUrl PROKSI retryable (backoff 3s/6s/12s); googleapis.com
// kekal mati segera (kunci AIza salah tidak akan pulih).

test('[F1] PROXY-403: 403 daripada baseUrl proksi → RETRY backoff, bukan mati segera', async () => {
    const GeminiService = require('../services/gemini');
    const svc = new GeminiService('sk-crazyrouter-key', 'gemini-3-flash', {
        baseUrl: 'https://cn.crazyrouter.com/v1beta'
    });
    let attempts = 0;
    const delays = [];
    const origSetTimeout = global.setTimeout;
    global.setTimeout = (fn, ms) => {
        delays.push(ms);
        return origSetTimeout(fn, 0); // pantas untuk ujian
    };
    try {
        await svc.retryWithBackoff(
            async () => {
                attempts++;
                if (attempts < 3) {
                    throw Object.assign(new Error('Request failed with status code 403'), {
                        response: { status: 403 }
                    });
                }
                return 'OK';
            },
            3,
            3000
        );
    } finally {
        global.setTimeout = origSetTimeout;
    }
    assert.equal(attempts, 3, '403 proksi MESTI dicuba semula sehingga berjaya');
    assert.equal(delays.length, 2, 'dua backoff berlaku (3s & 6s lalai, dipantaskan)');
});

test('[F2] PROXY-403: 403 daripada endpoint Google rasmi → MATI SEGERA (tiada retry)', async () => {
    const GeminiService = require('../services/gemini');
    const svc = new GeminiService('AIza-invalid-key', 'gemini-3-flash', {});
    let attempts = 0;
    await assert.rejects(
        () =>
            svc.retryWithBackoff(
                async () => {
                    attempts++;
                    throw Object.assign(new Error('Request failed with status code 403'), {
                        response: { status: 403 }
                    });
                },
                3,
                3000
            ),
        (err) => err.response?.status === 403
    );
    assert.equal(attempts, 1, '403 googleapis.com tidak boleh di-retry — kunci salah kekal salah');
});

test('[F3] PROXY-403: 401 proksi turut retryable (proksi kadang guna 401 untuk keadaan transient)', async () => {
    const GeminiService = require('../services/gemini');
    const svc = new GeminiService('sk-rootsys-key', 'deepseek-v4-pro', {
        baseUrl: 'https://rootsys.cloud/v1beta'
    });
    let attempts = 0;
    await svc.retryWithBackoff(
        async () => {
            attempts++;
            if (attempts === 1) {
                throw Object.assign(new Error('Request failed with status code 401'), {
                    response: { status: 401 }
                });
            }
            return 'OK';
        },
        2,
        3000
    );
    assert.equal(attempts, 2, '401 proksi dicuba semula');
});

test('[E7] Bridge END-TO-END: createTranslationProvider membina OpenAICompatibleProvider rootsys, BUKAN GeminiService', async () => {
    const { createTranslationProvider } = require('../services/translationProviderFactory');
    const cfg = normalizeConfig({
        trinity: {
            translation: {
                apiKey: 'sk-rootsys-e2e',
                provider: 'custom',
                door: 'openai-compatible',
                baseUrl: 'https://rootsys.cloud/v1',
                model: 'deepseek-v4-pro',
                isCustom: true,
                enabled: true
            }
        }
    });
    const built = await createTranslationProvider(cfg);
    assert.equal(built.providerName, 'custom', 'providerName MESTI custom');
    assert.equal(built.model, 'deepseek-v4-pro', 'model kekal deepseek-v4-pro');
    const providerCtor = built.provider?.constructor?.name;
    assert.equal(
        providerCtor,
        'OpenAICompatibleProvider',
        `enjin MESTI OpenAICompatibleProvider (dapat: ${providerCtor})`
    );
    assert.equal(built.provider?.baseUrl, 'https://rootsys.cloud/v1', 'baseUrl menghala ke rootsys');
    assert.notEqual(providerCtor, 'GeminiService', 'SAMA SEKALI BUKAN GeminiService');
});
