/**
 * Key Detector — unit tests (Tri-Door Surgery Fasa A, 2026-10-10)
 * plans/tri-door-provider-surgery-plan.md — kelulusan owner:
 *   1. Prefix kuat: AIza→gemini, sk-ant-→anthropic
 *   2. 'sk-' generik TIDAK cukup untuk memilih vendor — tunggu baseUrl/model
 *   3. Override manual sentiasa menang ke atas autodetect
 *   4. Default selamat = openai-compatible bila tiada padanan
 *   5. Keputusan ber-source ('override'|'key-prefix'|'baseUrl'|'model'|'default')
 *      untuk logging yang telus
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
    detectAgentChannelFormat,
    normalizeFormatOverride,
    detectFromApiKey,
    detectFromBaseUrl,
    detectFromModel,
    FORMAT_GEMINI,
    FORMAT_OPENAI,
    FORMAT_ANTHROPIC
} = require('./channels/keyDetector');

// ── 1. Prefix kuat API key ──

test('KeyDetector: AIza prefix → gemini (source key-prefix)', () => {
    const r = detectAgentChannelFormat({ apiKey: 'AIzaSyD-1234567890abcdef' });
    assert.equal(r.format, FORMAT_GEMINI);
    assert.equal(r.source, 'key-prefix');
});

// [v3.9.19] Format kunci Google AI Studio terkini (2024+): "AQ.Ab8…" —
// dipersetujui mandat owner (VP-22). Tanpa cawangan ini, kunci AQ. pada
// Custom versionless jatuh ke default openai (pintu salah).
test('KeyDetector: AQ. prefix (Google AI Studio new format) → gemini (source key-prefix)', () => {
    // Bentuk berbintik — "AQ.Ab8RN6…" (sebenar daripada AI Studio)
    const dotted = detectAgentChannelFormat({ apiKey: 'AQ.Ab8RN6IYXHkQ1vXyZ0aBcD' });
    assert.equal(dotted.format, FORMAT_GEMINI, 'AQ. dotted key must map to gemini');
    assert.equal(dotted.source, 'key-prefix');
    // Bentuk tanpa bintik — "AQAb8RN6…" (varian warisan)
    const plain = detectAgentChannelFormat({ apiKey: 'AQAb8RN6IYXHkQ1vXyZ0aBcD' });
    assert.equal(plain.format, FORMAT_GEMINI, 'AQ (no dot) key must map to gemini');
    assert.equal(plain.source, 'key-prefix');
    // Pengesanan tidak merosakkan format sedia ada:
    const legacy = detectFromApiKey('AIzaSyD-1234567890abcdef');
    assert.equal(legacy, FORMAT_GEMINI, 'AIza still detected');
    const anthropic = detectFromApiKey('sk-ant-api03-xxxxxxxxxxxx');
    assert.equal(anthropic, FORMAT_ANTHROPIC, 'sk-ant- still detected');
    const genericSk = detectFromApiKey('sk-relay-key');
    assert.equal(genericSk, null, 'generic sk- still falls through to baseUrl/model');
    // Rentetan berkaitan AQ yang TIDAK sah tidak dipadankan secara rawak
    assert.equal(detectFromApiKey('AQX-no-dot-suffix!'), null, 'malformed AQ-like string is not gemini');
});

test('KeyDetector: sk-ant- prefix → anthropic (source key-prefix)', () => {
    const r = detectAgentChannelFormat({ apiKey: 'sk-ant-api03-xxxxxxxxxxxx' });
    assert.equal(r.format, FORMAT_ANTHROPIC);
    assert.equal(r.source, 'key-prefix');
});

test('KeyDetector: sk- generik TIDAK memilih vendor sendiri (null)', () => {
    assert.equal(detectFromApiKey('sk-rootsys-abcdef'), null);
    assert.equal(detectFromApiKey('sk-deepseek'), null);
});

// ── 2. baseUrl hint ──

test('KeyDetector: baseUrl generativelanguage → gemini', () => {
    assert.equal(detectFromBaseUrl('https://generativelanguage.googleapis.com/v1beta'), FORMAT_GEMINI);
});

test('KeyDetector: baseUrl anthropic → anthropic', () => {
    assert.equal(detectFromBaseUrl('https://api.anthropic.com/v1'), FORMAT_ANTHROPIC);
});

test('KeyDetector: baseUrl api.openai.com / deepseek / moonshot / openrouter → openai', () => {
    assert.equal(detectFromBaseUrl('https://api.openai.com/v1'), FORMAT_OPENAI);
    assert.equal(detectFromBaseUrl('https://api.deepseek.com/v1'), FORMAT_OPENAI);
    assert.equal(detectFromBaseUrl('https://api.moonshot.cn/v1'), FORMAT_OPENAI);
    assert.equal(detectFromBaseUrl('https://openrouter.ai/api/v1'), FORMAT_OPENAI);
});

test('KeyDetector: sk- generik + baseUrl deepseek → openai (source baseUrl)', () => {
    const r = detectAgentChannelFormat({ apiKey: 'sk-xyz', baseUrl: 'https://api.deepseek.com/v1' });
    assert.equal(r.format, FORMAT_OPENAI);
    assert.equal(r.source, 'baseUrl');
});

// ── 3. Model hint (paling lemah, hanya sebagai pengukuhan) ──

test('KeyDetector: model gemini-* → gemini (source model)', () => {
    const r = detectAgentChannelFormat({ model: 'gemini-3.7-flash' });
    assert.equal(r.format, FORMAT_GEMINI);
    assert.equal(r.source, 'model');
});

test('KeyDetector: model claude-* → anthropic (source model)', () => {
    const r = detectAgentChannelFormat({ model: 'claude-sonnet-4' });
    assert.equal(r.format, FORMAT_ANTHROPIC);
    assert.equal(r.source, 'model');
});

// ── 4. Keutamaan: override > key-prefix > baseUrl > model > default ──

test('KeyDetector: override manual MENANG ke atas prefix kuat', () => {
    // Key anthropic tetapi override gemini → gemini (owner keputusan mutlak)
    const r = detectAgentChannelFormat({
        apiKey: 'sk-ant-api03-xxxx',
        baseUrl: 'https://api.anthropic.com/v1',
        override: 'gemini'
    });
    assert.equal(r.format, FORMAT_GEMINI);
    assert.equal(r.source, 'override');
});

test('KeyDetector: key-prefix MENANG ke atas baseUrl bertentangan', () => {
    const r = detectAgentChannelFormat({
        apiKey: 'AIzaSyABC', // gemini
        baseUrl: 'https://api.deepseek.com/v1' // openai
    });
    assert.equal(r.format, FORMAT_GEMINI);
    assert.equal(r.source, 'key-prefix');
});

test('KeyDetector: baseUrl MENANG ke atas model bertentangan', () => {
    const r = detectAgentChannelFormat({
        baseUrl: 'https://api.anthropic.com/v1', // anthropic
        model: 'gemini-2.5-flash' // gemini
    });
    assert.equal(r.format, FORMAT_ANTHROPIC);
    assert.equal(r.source, 'baseUrl');
});

// ── 5. Default selamat + hygiene input ──

test('KeyDetector: tiada hint langsung → openai-compatible (kelulusan owner #3)', () => {
    const r = detectAgentChannelFormat({});
    assert.equal(r.format, FORMAT_OPENAI);
    assert.equal(r.source, 'default');
});

test('KeyDetector: input kosong/undefined selamat (tiada throw)', () => {
    assert.doesNotThrow(() => detectAgentChannelFormat());
    assert.doesNotThrow(() => detectAgentChannelFormat(null));
    assert.doesNotThrow(() => detectAgentChannelFormat({ apiKey: null, baseUrl: undefined }));
});

test('KeyDetector: key trim + case-insensitive prefix', () => {
    const r = detectAgentChannelFormat({ apiKey: '  aiza-legacy-key  ' });
    // 'aiza' tanpa huruf besar A-I-Z-a pada awalan tidak sepadan AIza — jatuh ke default
    assert.equal(r.format, FORMAT_OPENAI);
    assert.equal(r.source, 'default');
});

// ── 6. normalizeFormatOverride ──

test('KeyDetector: override "auto"/kosong/null → null (tiada override)', () => {
    assert.equal(normalizeFormatOverride('auto'), null);
    assert.equal(normalizeFormatOverride(''), null);
    assert.equal(normalizeFormatOverride(null), null);
    assert.equal(normalizeFormatOverride(undefined), null);
    assert.equal(normalizeFormatOverride('   '), null);
});

test('KeyDetector: override sah dinormalize lowercase; nilai tidak sah → null', () => {
    assert.equal(normalizeFormatOverride('GEMINI'), 'gemini');
    assert.equal(normalizeFormatOverride(' Anthropic '), 'anthropic');
    assert.equal(normalizeFormatOverride('openai'), 'openai');
    assert.equal(normalizeFormatOverride('bogus'), null);
    assert.equal(normalizeFormatOverride('gemini-native'), null);
});

// ── 7. Integrasi kontrak agentChannel ──

test('KeyDetector: resolveChannelFormat melalui agentChannel kekal konsisten', () => {
    const { resolveChannelFormat, defaultChannelFormat } = require('./channels/agentChannel');
    assert.deepEqual(resolveChannelFormat({ apiKey: 'AIzaSyX' }), { format: 'gemini', source: 'key-prefix' });
    assert.equal(defaultChannelFormat(), FORMAT_OPENAI);
});
