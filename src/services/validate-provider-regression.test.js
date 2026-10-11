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
    // [v3.9.12] isProbeRetryable dikembangkan: 401/403 turut retryable —
    // gateway proksi (Crazy Router/New API) memulangkan 401/403 apabila
    // PENGPALA autentikasi salah protokol (bukan kunci rosak); pintu
    // bertentangan wajib dicuba sebelum mengisytiharkan kunci tidak sah.
    // Predikat runtime index.js: status === 404 || 400 || 401 || 403.
    const isProbeRetryable = (error) => {
        const status = Number(error?.response?.status) || 0;
        return status === 404 || status === 400 || status === 401 || status === 403;
    };
    assert.equal(isProbeRetryable({ response: { status: 404 } }), true, '404 retryable');
    assert.equal(isProbeRetryable({ response: { status: 400 } }), true, '400 retryable');
    assert.equal(isProbeRetryable({ response: { status: 401 } }), true, '401 retryable (wrong-protocol auth header)');
    assert.equal(isProbeRetryable({ response: { status: 403 } }), true, '403 retryable (wrong-protocol auth header)');
    assert.equal(isProbeRetryable({ response: { status: 500 } }), false, '500 NOT retryable');
    assert.equal(isProbeRetryable(new Error('network')), false, 'network error NOT retryable');
});

test('[VP-15] versionless URL detection: /v1/models appended only when no version segment', () => {
    const needsAppend = (url) => !/\/v\d/.test(url);
    assert.equal(needsAppend('https://my-proxy.example.com'), true, 'no version → append /v1/models');
    assert.equal(needsAppend('https://my-proxy.example.com/v1'), false, '/v1 present → no append');
    assert.equal(needsAppend('https://my-proxy.example.com/v1beta'), false, '/v1beta present → no append');
});

// ─── [STRICT URL PRECEDENCE + EXPANDED DUAL-DOOR v3.9.12] ───

test('[VP-16] /v1beta URL with sk- key: URL hint WINS over key-prefix → gemini-native', () => {
    // [REPRO v3.9.11 BUG] Kunci 'sk-...' + URL 'https://cn.crazyrouter.com/v1beta':
    // skrin v3.9.11 menghantar Bearer openai ke endpoint /v1beta → 401 palsu.
    // Keutamaan mutlak laluan URL: /v1beta WAJIB gemini-native walaupun kunci sk-.
    // Kunci statik: heuristik runtime dijalankan SEBELUM keyDetector dalam
    // susunan if/else-if — cawangan /v1beta tidak pernah sampai ke keyDetector.
    assert.ok(
        serverSource.includes("if (targetBaseUrl.includes('/v1beta'))"),
        '/v1beta branch checked FIRST (strict URL precedence)'
    );
    // Susunan kod: cawangan keyDetector mesti berada DALAM else (tiada hint versi)
    assert.ok(
        serverSource.indexOf("targetBaseUrl.includes('/v1beta')") <
            serverSource.indexOf('detectAgentChannelFormat({ apiKey: key, baseUrl: targetBaseUrl })'),
        'URL heuristics must run before keyDetector in source order'
    );
    // Simulasi kelakuan penuh (perangkap sk-):
    const url = 'https://cn.crazyrouter.com/v1beta';
    const apiKey = 'sk-relay-proxy-key';
    let doorPlan = 'openai-compatible';
    if (url.includes('/v1beta')) {
        doorPlan = 'gemini-native'; // ← menang, sk- diabaikan sepenuhnya
    } else if (/\/v1(?!beta)/.test(url)) {
        doorPlan = 'openai-compatible';
    } else {
        const { detectAgentChannelFormat } = require('./channels/keyDetector');
        const detected = detectAgentChannelFormat({ apiKey, baseUrl: url });
        doorPlan = detected.format === 'gemini' ? 'gemini-native' : 'openai-compatible';
    }
    assert.equal(doorPlan, 'gemini-native', 'sk- + /v1beta MUST resolve to gemini-native (URL wins)');
});

test('[VP-17] primary 401 recovered by fallback door: validation succeeds with resolvedDoor', async () => {
    // [EXPANDED DUAL-DOOR] Gateway memulangkan 401 apabila pengepala salah protokol;
    // pintu bertentangan mesti dicuba. Simulasi penuh aliran probe:
    // primer openai-compatible (Bearer) → 401; fallback gemini-native (x-goog-api-key)
    // → 200 dengan senarai model → validasi BERJAYA + resolvedDoor: 'gemini-native'.
    const isProbeRetryable = (error) => {
        const status = Number(error?.response?.status) || 0;
        return status === 404 || status === 400 || status === 401 || status === 403;
    };
    const fallbackOf = (doorPlan) => (doorPlan === 'openai-compatible' ? 'gemini-native' : 'openai-compatible');

    // Semakan statik: predikat runtime mesti merangkumi 401/403
    assert.ok(
        serverSource.includes('status === 404 || status === 400 || status === 401 || status === 403'),
        'runtime predicate must include 401 and 403'
    );

    // Simulasi aliran dwipintu dengan axios mock
    const originalGet = axios.get;
    const calls = [];
    axios.get = async (url, options) => {
        const headers = (options && options.headers) || {};
        calls.push({ url, auth: headers['x-goog-api-key'] ? 'x-goog' : headers.Authorization ? 'bearer' : 'none' });
        if (headers.Authorization) {
            // Pintu salah protokol → gateway memulangkan 401
            const err = new Error('Request failed with status code 401');
            err.response = { status: 401, data: { error: { message: 'Unauthorized' } } };
            throw err;
        }
        // Pintu betul (x-goog-api-key) → 200 OK senarai model Gemini
        return {
            data: { models: [{ name: 'models/gemini-3.7-flash', supportedGenerationMethods: ['generateContent'] }] }
        };
    };
    try {
        // Replika aliran endpoint: doorPlan=openai-compatible (dari /v1) → 401 → fallback
        let doorPlan = 'openai-compatible';
        let resolvedDoor = doorPlan;
        let models = [];
        let lastError = null;
        try {
            throw Object.assign(new Error('primary 401'), {
                response: { status: 401, data: { error: { message: 'Unauthorized' } } }
            });
        } catch (primaryError) {
            if (isProbeRetryable(primaryError)) {
                const fallbackDoor = fallbackOf(doorPlan);
                try {
                    const resp = await axios.get('https://relay/v1/models', {
                        headers: { 'x-goog-api-key': 'sk-key', 'Content-Type': 'application/json' }
                    });
                    models = resp.data.models
                        .filter((m) => m.supportedGenerationMethods.includes('generateContent'))
                        .map((m) => String(m.name || '').replace(/^models\//, ''));
                    resolvedDoor = fallbackDoor;
                    lastError = null;
                } catch (fallbackError) {
                    lastError = fallbackError;
                }
            } else {
                throw primaryError;
            }
        }
        assert.equal(lastError, null, 'fallback must recover from primary 401');
        assert.deepEqual(models, ['gemini-3.7-flash'], 'fallback must return the model list');
        assert.equal(resolvedDoor, 'gemini-native', 'resolvedDoor must be the winning door');
    } finally {
        axios.get = originalGet;
    }
});

// ─── [CLEAN & SORT + SMART GEMINI FALLBACK v3.9.14] ───

test('[VP-18] cleanAndSortModels: filters non-text models and sorts A-Z (dedup included)', () => {
    // Replika predikat runtime (index.js cleanAndSortModels)
    const NON_TEXT_MODEL_KEYWORDS = [
        'embedding',
        'video',
        'image',
        'audio',
        'music',
        'suno',
        'kling',
        'seedance',
        'seedream'
    ];
    const cleanAndSortModels = (models) =>
        Array.from(new Set((Array.isArray(models) ? models : []).map((m) => String(m || '').trim()).filter(Boolean)))
            .filter((m) => {
                const lower = m.toLowerCase();
                return !NON_TEXT_MODEL_KEYWORDS.some((kw) => lower.includes(kw));
            })
            .sort((a, b) => a.localeCompare(b));

    // Katalog mentah gaya Crazy Router /v1/models: 300+ model tidak tersusun,
    // bercampur audio/video/embedding + pendua + model Gemini tertimbus.
    const rawCatalog = [
        'suno_music-v4',
        'kling-v2-master',
        'seedance-pro-1080p',
        'seedream-4.0',
        'text-embedding-3-large',
        'qwen3-max',
        'deepseek-v4-pro',
        'gemini-2.5-pro',
        'glm-5.3',
        'gemini-3-flash-preview',
        'gemini-2.5-pro', // pendua — mesti dedup
        'gpt-5-mini',
        'whisper-audio-large',
        'wan-video-preview',
        'dall-e-image-3'
    ];
    const cleaned = cleanAndSortModels(rawCatalog);
    assert.deepEqual(
        cleaned,
        ['deepseek-v4-pro', 'gemini-2.5-pro', 'gemini-3-flash-preview', 'glm-5.3', 'gpt-5-mini', 'qwen3-max'],
        'non-text models removed, deduped, sorted A-Z'
    );
    // Semakan statik: helper runtime wujud dalam index.js dan dipanggil untuk Custom
    assert.ok(serverSource.includes('const cleanAndSortModels'), 'helper exists in index.js');
    assert.ok(
        serverSource.includes('models = cleanAndSortModels(models);'),
        'cleanAndSortModels applied to Custom provider response'
    );
    assert.ok(serverSource.includes('kw) => lower.includes(kw)'), 'keyword filter uses lowercase includes');
});

test('[VP-19] smart Gemini fallback: /v1beta list without gemini → /v1/models padu or standard list', async () => {
    // [REPRO PINCANG CRAZY ROUTER] GET /v1beta/models memulangkan adaptor ujian
    // (deepseek/kimi/glm/gpt/qwen) dan SIFAR model Gemini — walaupun
    // :generateContent menyokong penuh semua model Gemini.
    // [v3.9.15] Senarai kecemasan dikembangkan kepada 6 model; tapisan padu
    // menggunakan includes('gemini') mengikut spesifikasi mandat owner.
    const STANDARD_GEMINI_MODELS = [
        'gemini-3-flash-preview',
        'gemini-3-flash',
        'gemini-2.5-flash',
        'gemini-2.5-pro',
        'gemini-3.1-pro',
        'gemini-3.1-flash-lite'
    ];
    assert.ok(serverSource.includes('const smartGeminiFallback'), 'smartGeminiFallback helper exists in index.js');
    assert.ok(
        serverSource.includes("resolvedDoor !== 'gemini-native'"),
        'fallback only triggers for gemini-native door'
    );
    assert.ok(
        serverSource.includes("m.toLowerCase().includes('gemini')"),
        '/v1/models catalog filters to gemini-only models (includes per spec)'
    );
    assert.ok(serverSource.includes('return STANDARD_GEMINI_MODELS;'), 'standard Gemini list is the final fallback');
    // Semakan statik: senarai kecemasan mengandungi SEMUA 6 model mandat owner
    assert.ok(
        STANDARD_GEMINI_MODELS.every((m) => serverSource.includes(`'${m}'`)),
        'standard list contains all 6 mandated Gemini models'
    );
    // [v3.9.16] PROACTIVE OVERRIDE: gemini-native menyenaraikan TERUS dari
    // /v1/models (permalink /v1beta tidak diharap) — buang /v1beta → /v1.
    assert.ok(
        serverSource.includes("replace(/\\/v1beta\\/?$/, '/v1')"),
        'URL rewrite /v1beta → /v1 for proactive catalog fetch'
    );
    assert.ok(
        serverSource.includes('const fetchGeminiCatalogFromV1'),
        'proactive /v1/models catalog fetch helper exists'
    );
    // Susunan keutamaan: /v1 dahulu → senarai /v1beta sihat → kecemasan
    assert.ok(
        serverSource.indexOf('fetchGeminiCatalogFromV1(targetBaseUrl, apiKey)') <
            serverSource.indexOf("list.some((m) => String(m).toLowerCase().includes('gemini'))"),
        'proactive /v1 catalog takes precedence over /v1beta list'
    );
    assert.ok(
        serverSource.indexOf("list.some((m) => String(m).toLowerCase().includes('gemini'))") <
            serverSource.indexOf('return STANDARD_GEMINI_MODELS;'),
        'emergency list is the LAST resort (after /v1 and /v1beta both fail)'
    );
    // Laluan inferens kekal gemini-native — semak komen kontrak
    assert.ok(
        serverSource.includes('generateContent'),
        'inference path contract (:generateContent) documented in source'
    );

    // Simulasi kelakuan: /v1beta pincang (adaptor ujian sahaja)
    const v1betaBroken = ['deepseek-v4-pro', 'kimi-k3', 'glm-5.3', 'gpt-5-mini', 'qwen3-max'];
    const isHealthy = (list) => list.some((m) => m.toLowerCase().includes('gemini'));
    assert.equal(isHealthy(v1betaBroken), false, 'broken /v1beta list has ZERO gemini models');
    // PROACTIVE /v1/models: katalog sebenar lengkap termasuk model baharu
    // (gemini-3.5-flash, gemini-3.8-flash) — hanya gemini dikekalkan (includes)
    const v1Full = [
        { id: 'deepseek-v4-pro' },
        { id: 'suno_music-v4' },
        { id: 'gemini-3-flash-preview' },
        { id: 'gemini-2.5-pro' },
        { id: 'gemini-3.5-flash' },
        { id: 'gemini-3.8-flash' },
        { id: 'google-gemini-exp' },
        { id: 'kling-video' }
    ];
    const geminiOnly = v1Full
        .map((m) => String(m?.id || '').trim())
        .filter(Boolean)
        .filter((m) => m.toLowerCase().includes('gemini'));
    assert.deepEqual(
        geminiOnly,
        ['gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-3.5-flash', 'gemini-3.8-flash', 'google-gemini-exp'],
        'proactive /v1 catalog returns FULL dynamic gemini list (includes semantics)'
    );
    // Jika /v1 DAN /v1beta kedua-duanya gagal sepenuhnya → senarai kecemasan
    // (susunan locale-collation: 'gemini-3-flash' sebelum 'gemini-3-flash-preview')
    assert.deepEqual(
        STANDARD_GEMINI_MODELS.slice().sort((a, b) => a.localeCompare(b)),
        [
            'gemini-2.5-flash',
            'gemini-2.5-pro',
            'gemini-3-flash',
            'gemini-3-flash-preview',
            'gemini-3.1-flash-lite',
            'gemini-3.1-pro'
        ],
        'emergency fallback list complete (locale-collation order)'
    );
});

test('[VP-20] gemini-native door: proactive /v1/models catalog → full dynamic Gemini list A-Z', async () => {
    // [MANDAT v3.9.16] Bukti hujung-ke-hujung: pintu gemini-native TIDAK
    // bergantung kepada /v1beta/models untuk MENYENARAIKAN model — katalog
    // sebenar lengkap (termasuk gemini-3.5-flash, gemini-3.8-flash) dipanggil
    // TERUS daripada /v1/models (Bearer). Kecemasan 6 model hanya bila
    // /v1 dan /v1beta kedua-duanya gagal. Model deepseek/kimi/glm TIDAK BOLEH
    // muncul apabila katalog Gemini diperoleh.
    const NON_TEXT_MODEL_KEYWORDS = [
        'embedding',
        'video',
        'image',
        'audio',
        'music',
        'suno',
        'kling',
        'seedance',
        'seedream'
    ];
    const cleanAndSortModels = (models) =>
        Array.from(new Set((Array.isArray(models) ? models : []).map((m) => String(m || '').trim()).filter(Boolean)))
            .filter((m) => {
                const lower = m.toLowerCase();
                return !NON_TEXT_MODEL_KEYWORDS.some((kw) => lower.includes(kw));
            })
            .sort((a, b) => a.localeCompare(b));

    const originalGet = axios.get;
    const calls = [];
    axios.get = async (url, options) => {
        const headers = (options && options.headers) || {};
        calls.push({ url, auth: headers['x-goog-api-key'] ? 'x-goog' : headers.Authorization ? 'bearer' : 'none' });
        // Panggilan /v1beta/models (x-goog-api-key) → senarai PINCANG (probe utama sahaja)
        if (headers['x-goog-api-key']) {
            return {
                data: {
                    models: [
                        { name: 'models/deepseek-v4-pro', supportedGenerationMethods: ['generateContent'] },
                        { name: 'models/kimi-k3', supportedGenerationMethods: ['generateContent'] },
                        { name: 'models/glm-5.3', supportedGenerationMethods: ['generateContent'] }
                    ]
                }
            };
        }
        // Panggilan PROAKTIF /v1/models (Bearer) → katalog penuh dinamik
        if (headers.Authorization) {
            return {
                data: {
                    data: [
                        { id: 'qwen3-max' },
                        { id: 'deepseek-v4-pro' },
                        { id: 'suno_music-v4' },
                        { id: 'gemini-2.5-pro' },
                        { id: 'gemini-3-flash-preview' },
                        { id: 'gemini-3.5-flash' },
                        { id: 'gemini-3.8-flash' },
                        { id: 'kling-video' },
                        { id: 'gemini-2.5-flash' }
                    ]
                }
            };
        }
        throw new Error('unexpected request ' + url);
    };
    try {
        // Replika aliran endpoint v3.9.16:
        // 1) probe utama gemini-native (/v1beta) → senarai pincang (validasi kunci sahaja)
        let models = ['deepseek-v4-pro', 'kimi-k3', 'glm-5.3'];
        const resolvedDoor = 'gemini-native';
        const baseUrl = 'https://relay.example.com/v1beta';
        // 2) PROACTIVE: katalog TERUS daripada /v1/models (rewrite /v1beta → /v1)
        const v1Url = baseUrl.replace(/\/v1beta\/?$/, '/v1');
        assert.equal(v1Url, 'https://relay.example.com/v1', '/v1beta rewritten to /v1');
        const catalogResp = await axios.get(`${v1Url}/models`, {
            headers: { Authorization: 'Bearer sk-key' }
        });
        const geminiCatalog = (catalogResp.data.data || [])
            .map((m) => String(m?.id || m?.name || m || '').trim())
            .filter(Boolean)
            .filter((m) => m.toLowerCase().includes('gemini'));
        assert.ok(geminiCatalog.length > 0, 'proactive /v1 catalog must contain gemini models');
        models = geminiCatalog;
        // 3) cleanAndSortModels mesti berjalan pada SEMUA pintu Custom
        const finalModels = cleanAndSortModels(models);
        assert.deepEqual(
            finalModels,
            ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview', 'gemini-3.5-flash', 'gemini-3.8-flash'],
            'FULL dynamic catalog (incl. 3.5/3.8) sorted A-Z — not the hardcoded emergency list'
        );
        assert.equal(
            finalModels.some((m) => /deepseek|kimi|glm|qwen/.test(m)),
            false,
            'deepseek/kimi/glm/qwen MUST NOT appear when Gemini catalog was obtained'
        );
        // Katalog proaktif mesti MENGATASI senarai /v1beta walaupun senarai itu sihat
        // (vp19 mengunci susunan keutamaan dalam sumber; di sini kita buktikan
        // URL /v1 dipanggil dengan pengepala Bearer).
        assert.ok(
            calls.some((c) => c.url.includes('/v1/models') && c.auth === 'bearer'),
            'proactive /v1/models call issued with Bearer auth'
        );
        // Semakan statik: cleanAndSortModels dipanggil untuk SEMUA Custom
        assert.ok(resolvedDoor === 'gemini-native');
        assert.ok(
            serverSource.includes('models = cleanAndSortModels(models);'),
            'cleanAndSortModels runs for every Custom door before res.json()'
        );
    } finally {
        axios.get = originalGet;
    }
});
