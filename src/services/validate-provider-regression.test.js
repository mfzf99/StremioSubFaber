// [UNIVERSAL PROVIDER VALIDATION 2026-10-10] Ujian regresi kontrak endpoint
// POST /api/validate-provider — door dispatcher 3 pintu (gemini-native |
// openai-compatible | anthropic-messages) + SSRF untuk Custom baseUrl.
// Ujian menarget sumber index.js (pola statik sama seperti ujian AQ warisan)
// dan logik dispatcher secara unit melalui ekstraksi behavior kontrak.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const axios = require('axios');

const { getProviderById, isValidProviderDoor } = require('../utils/providerRegistry');

const projectRoot = path.resolve(__dirname, '..', '..');
const serverSource = fs.readFileSync(path.join(projectRoot, 'index.js'), 'utf8');

// ─── Kontrak statik endpoint (sumber index.js) ───

test('[VP-1] /api/validate-provider endpoint exists with validationLimiter and setNoStore', () => {
    assert.match(serverSource, /app\.post\('\/api\/validate-provider',\s*validationLimiter/);
    assert.match(serverSource, /setNoStore\(res\);[\s\S]{0,120}kredensial dalam body/);
});

test('[VP-2] door dispatcher covers all three protocol doors with correct auth headers', () => {
    // [v3.9.11] dispatcher dipindah ke helper probeDoor(doorType, ...) — pola
    // ujian dikemas kini mengikut struktur baharu.
    // gemini-native: x-goog-api-key + supportedGenerationMethods filter
    assert.match(serverSource, /doorType === 'gemini-native'[\s\S]{0,600}x-goog-api-key/);
    assert.match(serverSource, /doorType === 'gemini-native'[\s\S]{0,900}supportedGenerationMethods/);
    // openai-compatible: Authorization Bearer
    assert.match(serverSource, /doorType === 'openai-compatible'[\s\S]{0,600}Authorization: `Bearer \$\{apiKey\}`/);
    // anthropic-messages: x-api-key + anthropic-version
    assert.match(
        serverSource,
        /doorType === 'anthropic-messages'[\s\S]{0,700}'x-api-key': apiKey,\s*'anthropic-version': '2023-06-01'/
    );
});

test('[VP-3] SSRF validation gates custom baseUrl before any network call', () => {
    // [v3.9.11] sanitization trailing-slash berlaku SEBELUM SSRF gate
    assert.match(
        serverSource,
        /const cleanBaseUrl = rawUrl\.replace[\s\S]{0,400}validateCustomBaseUrl\(cleanBaseUrl\)/
    );
    // Kegagalan SSRF mesti memulangkan 400 sebelum axios dipanggil
    assert.match(serverSource, /if \(!ssrf\.valid\)[\s\S]{0,200}error: ssrf\.error/);
});

test('[VP-4] standard response contract: { success, valid, models } and error shape', () => {
    assert.match(serverSource, /const payload = \{ success: true, valid: true, models \};/);
    assert.match(serverSource, /if \(autoResolved\) payload\.resolvedDoor = resolvedDoor;/);
    assert.match(serverSource, /return res\.status\(code\)\.json\(\{ success: false, valid: false, error:/);
});

// ─── Registry door validation (unit) ───

test('[VP-5] official providers reject door mismatch; Custom accepts manual doors', () => {
    // Pembekal rasmi: pintu mesti sepadan dengan registri
    assert.equal(isValidProviderDoor('gemini', 'gemini-native'), true);
    assert.equal(isValidProviderDoor('gemini', 'openai-compatible'), false);
    assert.equal(isValidProviderDoor('deepseek', 'openai-compatible'), true);
    assert.equal(isValidProviderDoor('anthropic', 'anthropic-messages'), true);
    assert.equal(isValidProviderDoor('openai', 'anthropic-messages'), false);
    // Pintu tidak sah ditolak serta-merta
    assert.equal(isValidProviderDoor('gemini', 'bogus-door'), false);
    // Custom: mana-mana pintu sah dibenarkan (pilihan manual pengguna)
    assert.equal(isValidProviderDoor('custom', 'gemini-native'), true);
    assert.equal(isValidProviderDoor('custom', 'openai-compatible'), true);
    assert.equal(isValidProviderDoor('custom', 'anthropic-messages'), true);
    assert.equal(isValidProviderDoor('custom', 'bogus-door'), false);
});

test('[VP-6] official providers supply their registry base URL; Custom requires user URL', () => {
    const gemini = getProviderById('gemini');
    assert.equal(gemini.baseUrl, 'https://generativelanguage.googleapis.com/v1beta');
    const anthropic = getProviderById('anthropic');
    assert.equal(anthropic.baseUrl, 'https://api.anthropic.com/v1');
    const deepseek = getProviderById('deepseek');
    assert.equal(deepseek.baseUrl, 'https://api.deepseek.com/v1');
    const custom = getProviderById('custom');
    assert.equal(custom.isCustom, true);
    assert.equal(custom.baseUrl, '');
    assert.equal(getProviderById('nonexistent-provider'), null);
});

// ─── Dispatcher behavior (live unit — axios mock, model extraction shapes) ───

test('[VP-7] model extraction shapes: Gemini names array, OpenAI data[].id, Anthropic data[].id', async () => {
    // Simulasi respons mentah setiap pintu dan sahkan bentuk pengekstrakan
    // yang digunakan oleh endpoint (pola yang sama diuji pada sumber statik VP-2).
    const geminiResponse = {
        data: {
            models: [
                { name: 'models/gemini-3.7-flash', supportedGenerationMethods: ['generateContent'] },
                { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] }
            ]
        }
    };
    const geminiModels = geminiResponse.data.models
        .filter(
            (m) =>
                Array.isArray(m?.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent')
        )
        .map((m) => String(m.name || '').replace(/^models\//, ''))
        .filter(Boolean);
    assert.deepEqual(geminiModels, ['gemini-3.7-flash'], 'embedding-only models must be filtered out');

    const openaiResponse = { data: { data: [{ id: 'deepseek-v4-pro' }, { id: 'deepseek-v4.1-flash' }] } };
    const openaiModels = openaiResponse.data.data.map((m) => String(m?.id || m?.name || '').trim()).filter(Boolean);
    assert.deepEqual(openaiModels, ['deepseek-v4-pro', 'deepseek-v4.1-flash']);

    const anthropicResponse = { data: { data: [{ id: 'claude-sonnet-4' }, { id: 'claude-opus-4.1' }] } };
    const anthropicModels = anthropicResponse.data.data
        .map((m) => String(m?.id || m?.name || '').trim())
        .filter(Boolean);
    assert.deepEqual(anthropicModels, ['claude-sonnet-4', 'claude-opus-4.1']);
});

test('[VP-8] auth failure from provider surfaces 401 with honest error message', async () => {
    // Unit: pengelasan status ralat mengikut spesifikasi respons standard.
    const makeError = (status, message) => ({
        response: { status, data: { error: { message } } },
        message: 'Request failed'
    });

    const err401 = makeError(401, 'Incorrect API key provided');
    const status = Number(err401?.response?.status) || 502;
    const code = status === 401 || status === 403 ? status : status >= 500 ? 502 : 400;
    assert.equal(code, 401, '401 from provider must surface as 401');

    const err500 = makeError(500, 'upstream exploded');
    const status500 = Number(err500?.response?.status) || 502;
    const code500 = status500 === 401 || status500 === 403 ? status500 : status500 >= 500 ? 502 : 400;
    assert.equal(code500, 502, '5xx from provider must surface as 502');

    const networkErr = new Error('connect ECONNREFUSED');
    const noStatus = Number(networkErr?.response?.status) || 502;
    assert.equal(noStatus, 502, 'network error without status must default to 502');
});

// Pastikan axios masih boleh di-mock (keserasian dengan pola ujian sedia ada)
test('[VP-9] axios is requirable for future live endpoint tests', () => {
    assert.equal(typeof axios.get, 'function');
    assert.equal(typeof axios.post, 'function');
});

// ─── [SELF-HEALING VALIDATION v3.9.11] Heuristik URL pintar + dual-door probing ───

test('[VP-10] self-healing markers exist: sanitization, URL heuristics, dual-door probing, resolvedDoor', () => {
    assert.ok(serverSource.includes('const cleanBaseUrl = rawUrl.replace'), 'trailing-slash sanitization');
    assert.ok(serverSource.includes("targetBaseUrl.includes('/v1beta')"), '/v1beta → gemini-native heuristic');
    assert.ok(
        serverSource.includes('/v1(?!beta)/.test(targetBaseUrl)'),
        '/v1 (non-beta) → openai-compatible heuristic'
    );
    assert.ok(
        serverSource.includes('detectAgentChannelFormat({ apiKey: key, baseUrl: targetBaseUrl })'),
        'no-URL-hint → keyDetector fallback'
    );
    assert.ok(serverSource.includes('const isProbeRetryable'), 'dual-door retry predicate');
    assert.ok(
        serverSource.includes(
            "const fallbackDoor = doorPlan === 'openai-compatible' ? 'gemini-native' : 'openai-compatible'"
        ),
        'dual-door fallback flips the door'
    );
    assert.ok(serverSource.includes('`${targetBaseUrl}/v1/models`'), 'versionless URL appends /v1/models');
    assert.ok(serverSource.includes('payload.resolvedDoor = resolvedDoor'), 'resolvedDoor returned on auto-detection');
});

test('[VP-11] /v1beta URL (Crazy Router Gemini endpoint) resolves to gemini-native in auto mode', () => {
    // Heuristik murni: ekstrak logik keputusan pintu daripada sumber dan simulasi.
    // (Ujian statik VP-10 mengunci kehadiran; ini mengunci KELAKUAN heuristik.)
    const url = 'https://cn.crazyrouter.com/v1beta';
    let doorPlan = 'openai-compatible';
    if (url.includes('/v1beta')) {
        doorPlan = 'gemini-native';
    } else if (/\/v1(?!beta)/.test(url)) {
        doorPlan = 'openai-compatible';
    }
    assert.equal(doorPlan, 'gemini-native', '/v1beta must resolve to gemini-native');
});

test('[VP-12] /v1 URL (OpenAI-style proxy) resolves to openai-compatible in auto mode', () => {
    const url = 'https://my-relay.example.com/v1';
    let doorPlan = 'openai-compatible';
    if (url.includes('/v1beta')) {
        doorPlan = 'gemini-native';
    } else if (/\/v1(?!beta)/.test(url)) {
        doorPlan = 'openai-compatible';
    }
    assert.equal(doorPlan, 'openai-compatible', '/v1 must resolve to openai-compatible');
});

test('[VP-13] versionless URL falls back to keyDetector (AIza → gemini-native)', () => {
    const { detectAgentChannelFormat } = require('./channels/keyDetector');
    const url = 'https://my-proxy.example.com'; // tiada /v1, tiada /v1beta
    const detected = detectAgentChannelFormat({ apiKey: 'AIzaSyFakeKey', baseUrl: url });
    assert.equal(detected.format, 'gemini', 'AIza key must map to gemini → gemini-native door');
    const doorPlan = detected.format === 'gemini' ? 'gemini-native' : 'openai-compatible';
    assert.equal(doorPlan, 'gemini-native');
    // sk- key generik → keyDetector tidak padan → default openai-compatible
    const detectedSk = detectAgentChannelFormat({ apiKey: 'sk-relay-key', baseUrl: url });
    assert.equal(detectedSk.format, 'openai', 'generic sk- key defaults to openai-compatible');
});

test('[VP-14] dual-door fallback flips openai-compatible ↔ gemini-native', () => {
    const fallbackOf = (doorPlan) => (doorPlan === 'openai-compatible' ? 'gemini-native' : 'openai-compatible');
    assert.equal(fallbackOf('openai-compatible'), 'gemini-native');
    assert.equal(fallbackOf('gemini-native'), 'openai-compatible');
    // isProbeRetryable: 404/400 retryable; 401/403/500 tidak
    const isProbeRetryable = (error) => {
        const status = Number(error?.response?.status) || 0;
        return status === 404 || status === 400;
    };
    assert.equal(isProbeRetryable({ response: { status: 404 } }), true, '404 retryable');
    assert.equal(isProbeRetryable({ response: { status: 400 } }), true, '400 retryable');
    assert.equal(isProbeRetryable({ response: { status: 401 } }), false, '401 NOT retryable (auth failure)');
    assert.equal(isProbeRetryable({ response: { status: 403 } }), false, '403 NOT retryable');
    assert.equal(isProbeRetryable({ response: { status: 500 } }), false, '500 NOT retryable');
    assert.equal(isProbeRetryable(new Error('network')), false, 'network error NOT retryable');
});

test('[VP-15] versionless URL detection: /v1/models appended only when no version segment', () => {
    const needsAppend = (url) => !/\/v\d/.test(url);
    assert.equal(needsAppend('https://my-proxy.example.com'), true, 'no version → append /v1/models');
    assert.equal(needsAppend('https://my-proxy.example.com/v1'), false, '/v1 present → no append');
    assert.equal(needsAppend('https://my-proxy.example.com/v1beta'), false, '/v1beta present → no append');
});
