/**
 * User Sovereignty Params Regression (Trinity Total Unlock Fasa 1, Mandat Owner 2026-10-19)
 *
 * Mengunci kontrak KEDAULATAN PARAMETER PENGGUNA 100% (plans/trinity-user-sovereignty-params.md §5.1):
 *   S1  kimi-k3: nilai temp pengguna dihormati (bukan clamp fixed 1.0)
 *   S2  medan tidak set → TIDAK muncul dalam output sanitasi (sifar auto-fill)
 *   S3  applySmartModelPayload: rawEffort kosong → body tidak disentuh
 *   S4  kimi-k3 + 'disabled' → tiada reasoning_effort/thinking dihantar
 *   S5  pembina standard pintu: user temp 0.8 → body.temperature === 0.8 (PENYATUAN MUTLAK 2026-10-25)
 *   S6  pembina standard pintu: temp tidak set → tiada kunci temperature
 *   S7  Anthropic provider: temp 1.5 diterima tanpa clamp
 *   S8  getCappedMaxOutputTokens: 4096 → 4096 (bukan dipaksa 65536)
 *   S9  Gemini STRICT: descriptor temperature/topP wujud (UI boleh papar)
 *   S10 config normalizeTrinityAgentParams: params kosong → slot.params === null
 *   S11 DeepSeek + off → thinking.type:'disabled' + reasoning_effort:'none'
 *       (PEMURNIAN 2026-10-25 — enum rasmi DeepSeek semasa, mandat Owner)
 *
 * Keputusan Rasmi Owner §8: stream:true kekal invariant; siling API keras
 * kekal benteng; AGENT_TUNING_BASE kekal cadangan UI sahaja.
 */

const test = require('node:test');
const assert = require('node:assert');
const capabilities = require('./modelCapabilities');
const OpenAICompatibleProvider = require('../services/providers/openaiCompatible');
const AnthropicProvider = require('../services/providers/anthropic');

// ── S1: kimi-k3 nilai pengguna dihormati (K2) ──
test('S1 [TOTAL UNLOCK]: kimi-k3 temp pengguna 0.7 dihormati (bukan clamp fixed 1.0)', () => {
    const out = capabilities.sanitizeAgentParams('translation', { temperature: 0.7 }, 'custom', 'kimi-k3');
    assert.equal(out.temperature, 0.7, 'nilai pengguna dihantar apa adanya');
    assert.ok(
        !('fixed' in (capabilities.resolveCapabilityProfile('custom', 'kimi-k3').parameters.temperature || {})),
        'descriptor fixed telah dibebaskan'
    );
});

// ── S2: medan tidak set tidak diisi (K3) ──
test('S2 [TOTAL UNLOCK]: medan tidak set → TIDAK dihantar (sifar auto-fill lalai ejen)', () => {
    const out = capabilities.sanitizeAgentParams('inspector', { temperature: 0.5 }, 'custom', 'deepseek-v4-pro');
    assert.deepEqual(Object.keys(out), ['temperature'], 'hanya medan eksplisit pengguna hadir');
    const empty = capabilities.sanitizeAgentParams('translation', {}, 'custom', 'deepseek-v4-pro');
    assert.deepEqual(empty, {}, 'params kosong → output kosong (enjin tidak mencipta nilai)');
});

// ── S3: applySmartModelPayload explicit-only (K5) ──
test('S3 [TOTAL UNLOCK]: rawEffort kosong → applySmartModelPayload tidak menyentuh body', () => {
    const provider = new OpenAICompatibleProvider({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'deepseek-v4-pro'
    });
    const body = { model: 'deepseek-v4-pro', messages: [] };
    provider.applySmartModelPayload(body, 'deepseek-v4-pro', undefined);
    provider.applySmartModelPayload(body, 'deepseek-v4-pro', null);
    provider.applySmartModelPayload(body, 'deepseek-v4-pro', '');
    assert.deepEqual(
        body,
        { model: 'deepseek-v4-pro', messages: [] },
        'body 100% tidak disentuh (sifar parameter reasoning dicipta)'
    );
});

// ── S4: kimi-k3 'disabled' dihormati (K4) ──
test('S4 [TOTAL UNLOCK]: kimi-k3 + disabled → tiada reasoning parameter dipaksa', () => {
    const provider = new OpenAICompatibleProvider({ apiKey: 'k', baseUrl: 'https://x.example/v1', model: 'kimi-k3' });
    const body = { model: 'kimi-k3', messages: [] };
    provider.applySmartModelPayload(body, 'kimi-k3', 'disabled');
    assert.ok(!('reasoning_effort' in body), 'tiada reasoning_effort (bukan dipaksa low)');
    assert.ok(!('thinking' in body), 'tiada thinking');
    // GLM-5.3 juga
    const glmBody = { model: 'glm-5.3', messages: [] };
    provider.applySmartModelPayload(glmBody, 'glm-5.3', 'none');
    assert.ok(!('reasoning_effort' in glmBody), 'GLM-5.3 + none → tiada reasoning_effort');
});

// ── S11: DeepSeek off → wire-value rasmi 'none' (PEMURNIAN 2026-10-25) ──
test('S11 [PEMURNIAN]: DeepSeek + off → thinking disabled + reasoning_effort "none" (enum rasmi)', () => {
    const provider = new OpenAICompatibleProvider({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'deepseek-v4-pro'
    });
    // Varian input semantik 'disabled' (warisan UI)
    const bodyA = { model: 'deepseek-v4-pro', messages: [] };
    provider.applySmartModelPayload(bodyA, 'deepseek-v4-pro', 'disabled');
    assert.deepEqual(bodyA.thinking, { type: 'disabled' }, 'suis thinking.type disabled kekal');
    assert.equal(bodyA.reasoning_effort, 'none', 'reasoning_effort mesti "none" (BUKAN "disabled")');
    // Varian input semantik 'none' (rasmi)
    const bodyB = { model: 'deepseek-v4.1-flash', messages: [] };
    provider.applySmartModelPayload(bodyB, 'deepseek-v4.1-flash', 'none');
    assert.deepEqual(bodyB.thinking, { type: 'disabled' }, 'varian none → thinking disabled');
    assert.equal(bodyB.reasoning_effort, 'none', 'varian none → reasoning_effort none');
    // Usaha aktif kekal tidak berubah (low/high/max terus)
    const bodyC = { model: 'deepseek-flash', messages: [] };
    provider.applySmartModelPayload(bodyC, 'deepseek-flash', 'max');
    assert.deepEqual(bodyC.thinking, { type: 'enabled' }, 'effort aktif → thinking enabled');
    assert.equal(bodyC.reasoning_effort, 'max', 'effort aktif dihantar terus');
});

// ── S5 + S6: conditional temperature pada pembina standard (K1, PENYATUAN MUTLAK 2026-10-25) ──
test('S5 [TOTAL UNLOCK]: pembina standard menghantar temp eksplisit pengguna (stream:true)', () => {
    const provider = new OpenAICompatibleProvider({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'deepseek-v4-pro',
        temperature: 0.8,
        topP: 0.9
    });
    const { body } = provider.buildChatRequest('p', true, {});
    assert.equal(body.temperature, 0.8, 'temp pengguna dihantar');
    assert.equal(body.top_p, 0.9, 'top_p pengguna dihantar');
    assert.equal(body.stream, true, 'stream:true kekal invariant pengangkutan (Keputusan Owner §8.1)');
    assert.ok(body.max_tokens > 0, 'PENYATUAN: max_tokens standard kini dihantar (pembina pintu tunggal)');
});

test('S6 [TOTAL UNLOCK]: pembina standard tanpa temp → tiada kunci temperature', () => {
    const provider = new OpenAICompatibleProvider({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'deepseek-v4-pro'
    });
    const { body } = provider.buildChatRequest('p', true, {});
    assert.ok(!('temperature' in body), 'medan tidak diset → kunci TIDAK dihantar (pelayan guna lalai asal)');
    assert.ok(!('top_p' in body), 'top_p turut tidak dihantar');
    assert.equal(body.stream, true, 'stream kekal');
});

// ── S7: Anthropic tanpa clamp (K6) ──
test('S7 [TOTAL UNLOCK]: Anthropic temp 1.5 diterima tanpa clamp constructor', () => {
    const provider = new AnthropicProvider({
        apiKey: 'k',
        baseUrl: 'https://x.example',
        model: 'claude-sonnet-4',
        temperature: 1.5
    });
    assert.equal(provider.temperature, 1.5, 'nilai mentah pengguna disimpan (tiada clamp 0-2)');
});

// ── S8: getCappedMaxOutputTokens hormati had pengguna (K9) ──
test('S8 [TOTAL UNLOCK]: maxOutputTokens 4096 dihormati (bukan dipaksa 65536)', () => {
    const provider = new OpenAICompatibleProvider({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'deepseek-v4-pro',
        maxOutputTokens: 4096
    });
    assert.equal(provider.getCappedMaxOutputTokens(), 4096, 'had pengguna dihormati');
    // Benteng siling keras vendor kekal (Keputusan Owner §8.2)
    const over = new OpenAICompatibleProvider({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'deepseek-v4-pro',
        maxOutputTokens: 999999
    });
    assert.equal(over.getCappedMaxOutputTokens(), 131072, 'siling mutlak vendor 131072 kekal sebagai benteng');
});

// ── S9: Gemini STRICT descriptor wujud (K8) ──
test('S9 [TOTAL UNLOCK]: Gemini STRICT profile mengisytiharkan temperature/topP untuk UI', () => {
    const profile = capabilities.resolveCapabilityProfile('gemini-native', 'gemini-3.6-flash');
    assert.ok(profile.parameters.temperature, 'descriptor temperature wujud');
    assert.ok(profile.parameters.topP, 'descriptor topP wujud');
    assert.ok(
        profile.parameters.temperature.uiHint === 'server-strips-for-this-model',
        'uiHint menandakan pelayan mengabaikan'
    );
});

// ── S10: config params kosong → null ──
test('S10 [TOTAL UNLOCK]: normalizeConfig params ejen kosong → slot.params === null', () => {
    // Ujian unit terhadap kontrak normalizeTrinityAgentParams melalui medan
    // kebergantungan minimum — guna getEffectiveConfig path yang sama seperti
    // suite trinity-params B1 (normalisasi penuh konfigurasi).
    const { normalizeConfig } = require('./config');
    const cfg = normalizeConfig({
        trinity: {
            mode: 'pro',
            translation: { params: {} },
            preflight: { params: {} },
            inspector: { params: {} }
        }
    });
    assert.equal(cfg.trinity.translation.params, null, 'params kosong → null (bukan objek lalai)');
    assert.equal(cfg.trinity.preflight.params, null, 'preflight params kosong → null');
    assert.equal(cfg.trinity.inspector.params, null, 'inspector params kosong → null');
});
