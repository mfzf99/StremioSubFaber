const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const axios = require('axios');

const GeminiService = require('./gemini');
const { createTranslationProvider } = require('./translationProviderFactory');
const { sanitizeApiKeyForHeader } = require('../utils/security');
const { handleTranslationError, isCrazyRouterUpstreamExhaustion } = require('../utils/apiErrorHandler');
const { generateFileTranslationPage } = require('../utils/fileUploadPageGenerator');
const { generateEmbeddedSubtitlePage, generateAutoSubtitlePage } = require('../utils/toolboxPageGenerator');
const {
    getDefaultConfig,
    getModelSpecificDefaults,
    normalizeConfig,
    normalizeGeminiModelName
} = require('../utils/config');

const projectRoot = path.resolve(__dirname, '..', '..');

test('AQ authorization keys are preserved and sent through the runtime v1beta model client', async () => {
    const authKey = 'AQ.Ab8RN6_example-auth-key.with.dots_and-symbols';
    const originalGet = axios.get;
    let request = null;

    axios.get = async (url, options) => {
        request = { url, options };
        return {
            data: {
                models: [
                    {
                        name: 'models/gemini-3.7-flash',
                        displayName: 'Gemini 3.7 Flash',
                        supportedGenerationMethods: ['generateContent'],
                        inputTokenLimit: 1048576
                    }
                ]
            }
        };
    };

    try {
        assert.equal(sanitizeApiKeyForHeader(`  ${authKey}\r\n`), authKey);
        const service = new GeminiService(`  ${authKey}  `, 'gemini-3.7-flash');
        const models = await service.getAvailableModels({ silent: true, throwOnError: true });

        assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models');
        assert.equal(request.options.headers['x-goog-api-key'], authKey);
        assert.deepEqual(
            models.map((model) => model.name),
            ['gemini-3.7-flash']
        );

        const serverSource = fs.readFileSync(path.join(projectRoot, 'index.js'), 'utf8');
        assert.match(
            serverSource,
            /new GeminiService\(geminiApiKey\)[\s\S]{0,200}getAvailableModels\(\{ silent: true, throwOnError: true \}\)/
        );
        assert.doesNotMatch(serverSource, /generativelanguage\.googleapis\.com\/v1\/models/);
    } finally {
        axios.get = originalGet;
    }
});

// [SAMPLING GROUND TRUTH 2026-09-29] Deprecation begins at Gemini 3.6 (changelog
// 21 Jul 2026). Pre-3.6 models (3.0 preview / 3.1 / 3.5) are 3.x-LEGACY and STILL
// accept temperature/topP. 3.6+ are 3.x-STRICT and strip sampling. topK never sent.
test('Gemini 3.x-legacy (3.5) keeps sampling; 3.x-strict (3.7) strips it', () => {
    const legacy = new GeminiService('test-key', 'models/gemini-3.5-flash', {
        thinkingBudget: 1000,
        thinkingLevel: 'high',
        temperature: 0.5,
        topP: 0.95
    });
    assert.equal(legacy.model, 'gemini-3.5-flash');
    assert.equal(legacy.getModelFamily().family, '3.x-legacy');
    // LEGACY: sampling IS sent alongside thinkingLevel (fix — dulu di-strip senyap)
    assert.deepEqual(legacy.buildGenerationConfig(4096), {
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingLevel: 'high' },
        temperature: 0.5,
        topP: 0.95
    });
    // topK never sent even for legacy (nucleus sampling)
    assert.equal('topK' in legacy.buildGenerationConfig(4096), false);

    // gemini-3-flash-preview = 3.0 → legacy, keeps sampling
    const preview = new GeminiService('test-key', 'gemini-3-flash-preview', {
        thinkingLevel: 'low',
        temperature: 0.3,
        topP: 0.9
    });
    assert.equal(preview.getModelFamily().family, '3.x-legacy');
    assert.equal(preview.buildGenerationConfig(4096).temperature, 0.3);
    assert.equal(preview.buildGenerationConfig(4096).topP, 0.9);

    // STRICT 3.7: sampling stripped, thinking level kept
    const strict = new GeminiService('test-key', 'gemini-3.7-flash', {
        thinkingLevel: 'high',
        temperature: 0.5,
        topP: 0.95
    });
    assert.equal(strict.getModelFamily().family, '3.x-strict');
    assert.deepEqual(strict.buildGenerationConfig(4096), {
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingLevel: 'high' }
    });

    const disabled37 = new GeminiService('test-key', 'gemini-3.7-flash', { thinkingLevel: 'disabled' });
    assert.equal(disabled37.buildGenerationConfig(4096).thinkingConfig.thinkingLevel, 'low');

    const dated37 = new GeminiService('test-key', 'gemini-3.7-flash-001', { thinkingLevel: 'minimal' });
    assert.equal(dated37.buildGenerationConfig(4096).thinkingConfig.thinkingLevel, 'low');

    // -latest alias resolves to strict (points to newest 3.x) → sampling stripped
    const latestLite = new GeminiService('test-key', 'gemini-flash-lite-latest', {
        thinkingBudget: 0,
        thinkingLevel: 'minimal',
        temperature: 0.8
    });
    assert.equal(latestLite.isThinkingEnabled(), true);
    assert.deepEqual(latestLite.buildGenerationConfig(4096), {
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingLevel: 'minimal' }
    });
});

// [SAMPLING EDGE CASE 2026-09-29] The boundary is the GA date (21 Jul 2026),
// NOT the version number. Two minor-5 models split:
//   gemini-3.5-flash (GA 19 May 2026)      → LEGACY (sampling accepted)
//   gemini-3.5-flash-lite (GA 21 Jul 2026) → STRICT (stripped, same day as 3.6)
test('Gemini 3.5-flash-lite is STRICT (GA on deprecation day) but 3.5-flash is LEGACY', () => {
    const flashLite = new GeminiService('test-key', 'gemini-3.5-flash-lite', {
        thinkingLevel: 'low',
        temperature: 0.5,
        topP: 0.95
    });
    assert.equal(flashLite.getModelFamily().family, '3.x-strict', '3.5-flash-lite must be STRICT');
    const liteCfg = flashLite.buildGenerationConfig(4096);
    assert.equal('temperature' in liteCfg, false, '3.5-flash-lite strips temperature');
    assert.equal('topP' in liteCfg, false, '3.5-flash-lite strips topP');

    const flash = new GeminiService('test-key', 'gemini-3.5-flash', {
        thinkingLevel: 'low',
        temperature: 0.5,
        topP: 0.95
    });
    assert.equal(flash.getModelFamily().family, '3.x-legacy', '3.5-flash must stay LEGACY');
    const flashCfg = flash.buildGenerationConfig(4096);
    assert.equal(flashCfg.temperature, 0.5, '3.5-flash keeps temperature');
    assert.equal(flashCfg.topP, 0.95, '3.5-flash keeps topP');

    // 3.1 flash-lite is pre-boundary → still legacy (keeps sampling)
    const lite31 = new GeminiService('test-key', 'gemini-3.1-flash-lite', {
        thinkingLevel: 'low',
        temperature: 0.4
    });
    assert.equal(lite31.getModelFamily().family, '3.x-legacy', '3.1-flash-lite stays LEGACY (pre-boundary)');
    assert.equal(lite31.buildGenerationConfig(4096).temperature, 0.4);
});

test('Gemini 3 translation and structured-output paths send the current request shape', async () => {
    const originalPost = axios.post;
    let requestBody = null;
    const service = new GeminiService('AQ.test-key', 'gemini-3.7-flash', {
        thinkingLevel: 'medium',
        enableJsonOutput: true,
        maxRetries: 0
    });
    service.getModelLimits = async () => ({ inputTokenLimit: 1048576, outputTokenLimit: 65536 });

    axios.post = async (url, body) => {
        assert.match(url, /\/v1beta\/models\/gemini-3\.7-flash:generateContent$/);
        requestBody = body;
        return {
            data: {
                candidates: [
                    {
                        finishReason: 'STOP',
                        content: { parts: [{ text: '{"entries":["Olá"]}' }] }
                    }
                ]
            }
        };
    };

    try {
        const output = await service.translateSubtitle('Hello', 'English', 'Portuguese');
        assert.equal(output, '{"entries":["Olá"]}');
        assert.equal(requestBody.generationConfig.responseMimeType, 'application/json');
        assert.deepEqual(requestBody.generationConfig.thinkingConfig, { thinkingLevel: 'medium' });
        assert.equal('thinkingBudget' in requestBody.generationConfig.thinkingConfig, false);
        assert.equal('temperature' in requestBody.generationConfig, false);
        assert.equal('topK' in requestBody.generationConfig, false);
        assert.equal('topP' in requestBody.generationConfig, false);
    } finally {
        axios.post = originalPost;
    }
});

test('legacy numeric thinking budgets and sampling controls remain unchanged for Gemini 2.x', () => {
    const service = new GeminiService('test-key', 'gemini-2.5-flash', {
        thinkingBudget: 1000,
        temperature: 0.5,
        topP: 0.9
    });

    assert.deepEqual(service.buildGenerationConfig(4096), {
        maxOutputTokens: 4096,
        temperature: 0.5,
        topP: 0.9,
        thinkingConfig: { thinkingBudget: 1000 }
    });
});

test('saved model IDs and Gemini 3.x defaults normalize without breaking old configs', () => {
    assert.equal(normalizeGeminiModelName(' models/gemini-3.7-flash '), 'gemini-3.7-flash');
    assert.equal(normalizeGeminiModelName('gemini-3.1-flash-lite-preview'), 'gemini-3.1-flash-lite');
    assert.equal(normalizeGeminiModelName('gemini-3-pro-preview'), 'gemini-3-flash-preview');

    const defaults = getDefaultConfig('gemini-3.6-flash');
    assert.equal(defaults.geminiModel, 'gemini-3.6-flash');
    assert.equal(defaults.advancedSettings.thinkingBudget, -1);
    assert.equal(defaults.advancedSettings.thinkingLevel, 'high');

    const oldFlashDefaults = getModelSpecificDefaults('gemini-3-flash-preview');
    for (const model of ['gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.7-flash', 'gemini-3.8-flash-preview']) {
        assert.deepEqual(getModelSpecificDefaults(model), oldFlashDefaults);
    }
    const oldLiteDefaults = getModelSpecificDefaults('gemini-3.1-flash-lite');
    for (const model of ['gemini-3.5-flash-lite', 'gemini-3.8-flash-lite-preview']) {
        assert.deepEqual(getModelSpecificDefaults(model), oldLiteDefaults);
    }

    const normalized = normalizeConfig({
        geminiApiKey: 'AQ.saved.key',
        geminiModel: 'models/gemini-3.5-flash-lite',
        advancedSettings: {
            enabled: true,
            geminiModel: 'models/gemini-3.7-flash',
            thinkingLevel: 'HIGH'
        }
    });
    assert.equal(normalized.geminiApiKey, 'AQ.saved.key');
    assert.equal(normalized.geminiModel, 'gemini-3.5-flash-lite');
    assert.equal(normalized.advancedSettings.geminiModel, 'gemini-3.7-flash');
    assert.equal(normalized.advancedSettings.thinkingLevel, 'high');
});

test('base-model selections apply their cloned runtime defaults without enabling advanced overrides', async () => {
    const flashConfig = getDefaultConfig('gemini-3.6-flash');
    flashConfig.geminiApiKey = 'AQ.test-key';
    flashConfig.advancedSettings.enabled = false;

    const currentFlash = await createTranslationProvider(flashConfig);
    assert.equal(currentFlash.provider.model, 'gemini-3.6-flash');
    assert.equal(currentFlash.provider.thinkingBudget, -1);
    assert.equal(currentFlash.provider.thinkingLevel, 'high');
    assert.equal(currentFlash.provider.temperature, 0.5);

    const legacyFlashConfig = getDefaultConfig('gemini-2.5-flash');
    legacyFlashConfig.geminiApiKey = 'legacy-test-key';
    legacyFlashConfig.advancedSettings.enabled = false;

    const legacyFlash = await createTranslationProvider(legacyFlashConfig);
    assert.equal(legacyFlash.provider.model, 'gemini-2.5-flash');
    assert.equal(legacyFlash.provider.thinkingBudget, -1);
    assert.equal(legacyFlash.provider.thinkingLevel, '');
    assert.equal(legacyFlash.provider.temperature, 0.5);
});

test('Configure and Toolbox pages expose current Gemini choices and model-aware controls', async () => {
    const html = fs.readFileSync(path.join(projectRoot, 'public', 'partials', 'main.html'), 'utf8');
    // Single-Picker: dropdown bermula kosong & disabled. Model diisi secara dinamik
    // oleh populateGeminiModelDropdowns() selepas validasi API key.
    assert.match(html, /id="geminiModel"/);
    assert.match(html, /disabled/);
    assert.match(html, /Enter and validate API key to select model/);
    assert.doesNotMatch(html, /value="gemini-3-pro-preview"/);
    assert.match(html, /id="advancedThinkingLevel"/);

    const uploadPage = generateFileTranslationPage(
        'tt-test',
        'test-config',
        getDefaultConfig('gemini-3.7-flash'),
        'test.srt'
    );
    assert.match(uploadPage, /id="advancedThinkingLevel"/);
    assert.match(uploadPage, /thinkingLevel: usesThinkingLevel \? thinkingLevel : undefined/);
    assert.match(uploadPage, /function getGeminiModelFamilyDefaults/);
    // Single-Picker: applyGeminiModelDefaults kini dipanggil dengan model dari config.
    // Fungsi ini wujud dalam halaman yang dijana untuk morphing parameter.
    assert.match(uploadPage, /applyGeminiModelDefaults/);

    const toolboxConfig = getDefaultConfig('gemini-3.7-flash');
    toolboxConfig.geminiApiKey = 'AQ.test-key';
    toolboxConfig.multiProviderEnabled = true;
    toolboxConfig.mainProvider = 'gemini';
    const [embeddedPage, autoPage] = await Promise.all([
        generateEmbeddedSubtitlePage('test-config', '', '', toolboxConfig),
        generateAutoSubtitlePage('test-config', '', '', toolboxConfig)
    ]);
    assert.match(embeddedPage, /Gemini \(gemini-3\.7-flash\)/);
    assert.match(autoPage, /Gemini \(gemini-3\.7-flash\)/);

    for (const page of [uploadPage, embeddedPage, autoPage]) {
        for (const match of page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
            if (match[1].trim()) new vm.Script(match[1]);
        }
    }
});

// ─── Fasa 5: Kunci Ground Truth — family-aware payload & schema regression ───

test('[GT-1] gemini-3.8-flash strips sampling and maps disabled -> low (not minimal)', () => {
    const service = new GeminiService('test-key', 'gemini-3.8-flash', { thinkingLevel: 'disabled' });
    const cfg = service.buildGenerationConfig(4096);
    assert.equal('temperature' in cfg, false);
    assert.equal('topP' in cfg, false);
    assert.equal('topK' in cfg, false);
    assert.equal('frequencyPenalty' in cfg, false);
    assert.equal('presencePenalty' in cfg, false);
    assert.equal(cfg.thinkingConfig.thinkingLevel, 'low'); // BUKAN 'minimal' — elak ralat API 3.7/3.8
});

test('[GT-2] profile matching: 3.5-flash-lite default minimal vs 3.5-flash default medium', () => {
    const lite = new GeminiService('test-key', 'gemini-3.5-flash-lite', {});
    assert.equal(lite.buildGenerationConfig(4096).thinkingConfig.thinkingLevel, 'minimal');
    const flash = new GeminiService('test-key', 'gemini-3.5-flash', {});
    assert.equal(flash.buildGenerationConfig(4096).thinkingConfig.thinkingLevel, 'medium');
});

test('[GT-3] gemini-2.5-pro clamps thinkingBudget 0 -> 128', () => {
    const service = new GeminiService('test-key', 'gemini-2.5-pro', { thinkingBudget: 0 });
    assert.equal(service.buildGenerationConfig(4096).thinkingConfig.thinkingBudget, 128);
});

test('[GT-4] gemini-2.5-flash allows thinkingBudget 0 (disable)', () => {
    const service = new GeminiService('test-key', 'gemini-2.5-flash', { thinkingBudget: 0 });
    assert.equal(service.buildGenerationConfig(4096).thinkingConfig.thinkingBudget, 0);
});

test('[GT-5] systemInstruction is sent as top-level field, not inside contents', async () => {
    const originalPost = axios.post;
    let requestBody = null;
    const service = new GeminiService('AQ.test-key', 'gemini-2.5-flash', { maxRetries: 0 });
    service.getModelLimits = async () => ({ inputTokenLimit: 1048576, outputTokenLimit: 65536 });

    axios.post = async (url, body) => {
        requestBody = body;
        return {
            data: {
                candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'Olá' }] } }]
            }
        };
    };

    try {
        await service.translateSubtitle('Hello', 'English', 'Portuguese');
        assert.ok(requestBody.systemInstruction, 'systemInstruction should exist at top level');
        assert.ok(Array.isArray(requestBody.systemInstruction.parts), 'systemInstruction.parts should be an array');
        assert.equal(typeof requestBody.systemInstruction.parts[0].text, 'string');
        // contents must not carry the system instruction role
        const roles = requestBody.contents.map((c) => c.role);
        assert.ok(!roles.includes('system'), 'contents should not contain a system role entry');
    } finally {
        axios.post = originalPost;
    }
});

test('[GT-6] normalizeConfig drops topK permanently but preserves thinkingBudget', () => {
    const normalized = normalizeConfig({
        geminiApiKey: 'AQ.saved.key',
        geminiModel: 'gemini-2.5-flash',
        advancedSettings: {
            enabled: true,
            topK: 25,
            topKEnabled: true,
            thinkingBudget: 2048,
            frequencyPenalty: 0.5,
            presencePenalty: -0.5
        }
    });
    // v1.6.0: topK telah dibuang sepenuhnya — nilai lama mesti diabaikan senyap.
    assert.equal('topK' in normalized.advancedSettings, false, 'topK must be dropped');
    assert.equal('topKEnabled' in normalized.advancedSettings, false, 'topKEnabled must be dropped');
    assert.equal(normalized.advancedSettings.thinkingBudget, 2048, 'thinkingBudget must be preserved');
});

// ─── CrazyRouter: honest upstream errors (A) + unavailable-model warnings (B) ───

test('[CR-A1] provider_account_exhausted 403 surfaces honest upstream reason, not "Authentication failed"', () => {
    const upstreamError = {
        response: {
            status: 403,
            data: {
                error: {
                    message:
                        'The upstream provider account for this route has run out of credit. Retry to use another route.',
                    type: 'new_api_error',
                    code: 'provider_account_exhausted'
                }
            }
        },
        message: 'Request failed with status code 403'
    };

    assert.equal(isCrazyRouterUpstreamExhaustion(upstreamError), true);

    let thrown = null;
    try {
        handleTranslationError(upstreamError, 'Gemini', { skipResponseData: true });
    } catch (err) {
        thrown = err;
    }
    assert.ok(thrown, 'handleTranslationError should throw');
    assert.equal(thrown.type, 'upstream_quota');
    assert.equal(thrown.translationErrorType, 'UPSTREAM_QUOTA');
    assert.equal(thrown.isRetryable, false);
    assert.match(thrown.message, /run out of credit/i);
    assert.doesNotMatch(thrown.message, /Authentication failed/i);
});

test('[CR-A2] genuine 403 auth failure still classified as authentication (not upstream_quota)', () => {
    const authError = {
        response: { status: 403, data: { error: { message: 'API key not valid. Please pass a valid API key.' } } },
        message: 'Request failed with status code 403'
    };

    assert.equal(isCrazyRouterUpstreamExhaustion(authError), false);

    let thrown = null;
    try {
        handleTranslationError(authError, 'Gemini', { skipResponseData: true });
    } catch (err) {
        thrown = err;
    }
    assert.ok(thrown, 'handleTranslationError should throw');
    assert.equal(thrown.type, 'authentication');
    assert.equal(thrown.translationErrorType, '403');
    assert.match(thrown.message, /Authentication failed/i);
});

// [PROVIDER PURGE 2026-10-10] GeminiService kini 100% Google Gemini Native.
// Ujian warisan CR-B1..B4 (pengesanan proksi 'sk-' + warnIfModelUnavailable)
// digantikan dengan kontrak native: key 'sk-' TIDAK lagi dilayan sebagai
// proksi dalam perkhidmatan rasmi — ia hanya sah melalui Custom Provider.

test('[CR-B1] sk- keys are no longer routed to a proxy: native baseUrl + x-goog-api-key header', async () => {
    const originalGet = axios.get;
    let request = null;

    axios.get = async (url, options) => {
        request = { url, options };
        return {
            data: {
                models: [
                    {
                        name: 'models/gemini-3.6-flash',
                        displayName: 'Gemini 3.6 Flash',
                        supportedGenerationMethods: ['generateContent']
                    }
                ]
            }
        };
    };

    try {
        const service = new GeminiService('sk-relay-style-key', 'gemini-3.6-flash', { maxRetries: 0 });
        assert.equal(
            service.baseUrl,
            'https://generativelanguage.googleapis.com/v1beta',
            'sk- key must use the official Google endpoint'
        );
        assert.equal('keyType' in service, false, 'keyType auto-detection must be fully removed');
        assert.equal(
            typeof service.getCrazyRouterAvailableModels,
            'undefined',
            'proxy model fetch must be removed from the native service'
        );
        assert.equal(
            typeof service.warnIfModelUnavailable,
            'undefined',
            'proxy availability warning must be removed from the native service'
        );

        await service.getAvailableModels({ silent: true, throwOnError: true });
        assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models');
        assert.equal(
            request.options.headers['x-goog-api-key'],
            'sk-relay-style-key',
            'native service always sends x-goog-api-key'
        );
        assert.equal('Authorization' in request.options.headers, false, 'Bearer proxy header must not be sent');
    } finally {
        axios.get = originalGet;
    }
});

test('[CR-B2] gemini.js source contains no hardcoded Crazy Router logic', () => {
    const source = fs.readFileSync(path.join(projectRoot, 'src', 'services', 'gemini.js'), 'utf8');
    assert.doesNotMatch(source, /crazyrouter/i, 'no crazyrouter references allowed in the native service');
    assert.doesNotMatch(source, /cn\.crazyrouter\.com/, 'no hardcoded proxy URL allowed');
    assert.doesNotMatch(source, /detectKeyType/, 'key-type detection must be purged');
    assert.doesNotMatch(source, /CRAZYROUTER_API_BASE/, 'proxy env override must be purged');
});

test('[CR-B3] providerRoute tagging is removed from translation error paths', async () => {
    const originalPost = axios.post;
    const service = new GeminiService('sk-relay-style-key', 'gemini-2.5-flash', { maxRetries: 0 });
    service.getModelLimits = async () => ({ inputTokenLimit: 1048576, outputTokenLimit: 65536 });

    axios.post = async () => {
        const err = new Error('Request failed with status code 401');
        err.response = { status: 401, data: { error: { message: 'API key not valid.' } } };
        throw err;
    };

    try {
        let thrown = null;
        try {
            await service.translateSubtitle('Hello', 'English', 'Portuguese');
        } catch (err) {
            thrown = err;
        }
        assert.ok(thrown, 'translation should throw');
        assert.equal(thrown.providerRoute, undefined, 'providerRoute proxy tagging must be removed');
    } finally {
        axios.post = originalPost;
    }
});

test('[CR-B4] countTokensForTranslation runs for all keys (no proxy bypass)', async () => {
    const originalPost = axios.post;
    let called = false;

    axios.post = async (url) => {
        assert.match(url, /:countTokens$/);
        called = true;
        return { data: { totalTokens: 42 } };
    };

    try {
        const service = new GeminiService('sk-relay-style-key', 'gemini-2.5-flash', { maxRetries: 0 });
        const total = await service.countTokensForTranslation('Hello', 'en', 'Translate this');
        assert.equal(total, 42);
        assert.equal(called, true, 'countTokens must not be bypassed for any key shape');
    } finally {
        axios.post = originalPost;
    }
});

// ─── Model Filtering & Whitelist Sanitizer (dropdown translation) ───

test('[WF-1] whitelist sanitizer keeps only core text families, sorted Lite > Flash > Pro with descending versions', () => {
    const { sanitizeGeminiModelCatalog } = GeminiService;
    const mixedCatalog = [
        // Bukan keluarga Gemini / khusus / eksperimental — WAJIB ditolak
        { name: 'models/gemma-4-26b-it', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/lyria-002', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/imagen-4.0-generate-001', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-computer-use-preview', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-flash-preview-tts', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-flash-native-audio-latest', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-robotics-er-1.5-preview', supportedGenerationMethods: ['generateContent'] },
        { name: 'tunedModels/my-tuned-model-abc', supportedGenerationMethods: ['generateContent'] },
        // Bukan generateContent — ditolak serta-merta (capabilities check)
        { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
        // Model teks teras — WAJIB dikekalkan & disusun
        { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3-flash-preview', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-flash-lite-latest', supportedGenerationMethods: ['generateContent'] },
        { name: 'models/gemini-flash-latest', supportedGenerationMethods: ['generateContent'] }
    ];

    const sanitized = sanitizeGeminiModelCatalog(mixedCatalog);
    assert.deepEqual(
        sanitized.map((m) => m.name),
        [
            'gemini-flash-lite-latest', // Alias -latest: generasi terkini → teratas tier Lite
            'gemini-2.5-flash-lite',
            'gemini-flash-latest', // Alias -latest: teratas tier Flash
            'gemini-3.8-flash',
            'gemini-3-flash-preview', // canonical sebelum '-preview'
            'gemini-2.5-flash',
            'gemini-2.5-pro'
        ]
    );
});

test('[WF-2] provider registry exposes the 16 official providers with correct doors and base URLs', () => {
    const { getOfficialProviders } = require('../utils/providerRegistry');
    const providers = getOfficialProviders();
    assert.equal(providers.length, 16, 'registry must list exactly 16 providers (15 official + Custom)');

    assert.deepEqual(
        providers.map((p) => [p.id, p.door]),
        [
            ['gemini', 'gemini-native'],
            ['openai', 'openai-compatible'],
            ['anthropic', 'anthropic-messages'],
            ['deepseek', 'openai-compatible'],
            ['groq', 'openai-compatible'],
            ['mistral', 'openai-compatible'],
            ['xai', 'openai-compatible'],
            ['openrouter', 'openai-compatible'],
            ['together', 'openai-compatible'],
            ['cerebras', 'openai-compatible'],
            ['sambanova', 'openai-compatible'],
            ['perplexity', 'openai-compatible'],
            ['moonshot', 'openai-compatible'],
            ['zhipu', 'openai-compatible'],
            ['qwen', 'openai-compatible'],
            ['custom', 'openai-compatible']
        ]
    );

    const byId = Object.fromEntries(providers.map((p) => [p.id, p]));
    assert.equal(byId.gemini.baseUrl, 'https://generativelanguage.googleapis.com/v1beta');
    assert.equal(byId.openai.baseUrl, 'https://api.openai.com/v1');
    assert.equal(byId.anthropic.baseUrl, 'https://api.anthropic.com/v1');
    assert.equal(byId.deepseek.baseUrl, 'https://api.deepseek.com/v1');
    assert.equal(byId.groq.baseUrl, 'https://api.groq.com/openai/v1');
    assert.equal(byId.mistral.baseUrl, 'https://api.mistral.ai/v1');
    assert.equal(byId.xai.baseUrl, 'https://api.x.ai/v1');
    assert.equal(byId.openrouter.baseUrl, 'https://openrouter.ai/api/v1');
    assert.equal(byId.together.baseUrl, 'https://api.together.xyz/v1');
    assert.equal(byId.cerebras.baseUrl, 'https://api.cerebras.ai/v1');
    assert.equal(byId.sambanova.baseUrl, 'https://api.sambanova.ai/v1');
    assert.equal(byId.perplexity.baseUrl, 'https://api.perplexity.ai');
    assert.equal(byId.moonshot.baseUrl, 'https://api.moonshot.cn/v1');
    assert.equal(byId.zhipu.baseUrl, 'https://open.bigmodel.cn/api/paas/v4');
    assert.equal(byId.qwen.baseUrl, 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1');

    // Hanya entri Custom yang isCustom — pintu manual + Base URL bebas.
    assert.equal(byId.custom.isCustom, true);
    assert.equal(byId.custom.baseUrl, '');
    for (const p of providers.filter((x) => x.id !== 'custom')) {
        assert.equal(p.isCustom, false, `${p.id} must not be custom`);
    }

    // Registry snapshot tidak boleh dimutasi dari luar (immutable contract).
    providers[0].label = 'TAMPERED';
    assert.equal(getOfficialProviders()[0].label, 'Google Gemini');
});

test('[WF-3] whitelist predicate rejects blacklisted/foreign/tuned models and accepts sanctioned forms', () => {
    const { isWhitelistedGeminiTextModel } = GeminiService;
    for (const rejected of [
        'gemma-4-26b-it', // bukan keluarga Gemini
        'gemini-nano-1', // Nano
        'gemini-antigravity-1', // eksperimental
        'gemini-deep-research-1', // Deep Research
        'lyria-002', // muzik
        'gemini-2.5-flash-tts', // TTS
        'gemini-omni-flashing', // omnimodal
        'gemini-2.5-computer-use-preview', // computer-use
        'gemini-robotics-er-1.5-preview', // robotik
        'gemini-2.0-flash-vision', // visi sahaja
        'imagen-4.0-generate-001', // imej
        'tunedModels/my-tuned-model', // tuning persendirian
        'gemini-2.5-flash-preview-09-2025' // suffix bertarikh TIDAK dibenarkan
    ]) {
        assert.equal(isWhitelistedGeminiTextModel(rejected), false, `should reject: ${rejected}`);
    }
    for (const accepted of [
        'gemini-2.5-flash-lite',
        'gemini-3.5-flash-lite',
        'gemini-flash-lite-latest',
        'gemini-2.5-flash',
        'gemini-3-flash',
        'gemini-3.8-flash',
        'gemini-3-flash-preview',
        'gemini-flash-latest',
        'gemini-2.5-pro',
        'gemini-3.1-pro-preview',
        'gemini-pro-latest'
    ]) {
        assert.equal(isWhitelistedGeminiTextModel(accepted), true, `should accept: ${accepted}`);
    }
});

test('[WF-4] getAvailableModels applies whitelist sanitizer to the Google catalog', async () => {
    const originalGet = axios.get;
    axios.get = async () => ({
        data: {
            models: [
                {
                    name: 'models/gemini-2.5-flash',
                    displayName: 'Gemini 2.5 Flash',
                    supportedGenerationMethods: ['generateContent']
                },
                {
                    name: 'models/gemma-4-31b-it',
                    displayName: 'Gemma 4 31B',
                    supportedGenerationMethods: ['generateContent']
                },
                { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
                {
                    name: 'models/gemini-2.5-flash-lite',
                    displayName: 'Gemini 2.5 Flash-Lite',
                    supportedGenerationMethods: ['generateContent']
                }
            ]
        }
    });

    try {
        const { resetProviderAuthFailureCache } = require('../utils/providerAuthFailureCache');
        const sharedCache = require('../utils/sharedCache');
        const originalGetShared = sharedCache.getShared;
        const originalSetShared = sharedCache.setShared;
        const originalDeleteShared = sharedCache.deleteShared;
        sharedCache.getShared = async () => null;
        sharedCache.setShared = async () => true;
        sharedCache.deleteShared = async () => true;
        resetProviderAuthFailureCache();

        const service = new GeminiService('test-key', 'gemini-2.5-flash');
        const models = await service.getAvailableModels({ silent: true });
        assert.deepEqual(
            models.map((m) => m.name),
            ['gemini-2.5-flash-lite', 'gemini-2.5-flash']
        );

        sharedCache.getShared = originalGetShared;
        sharedCache.setShared = originalSetShared;
        sharedCache.deleteShared = originalDeleteShared;
        resetProviderAuthFailureCache();
    } finally {
        axios.get = originalGet;
    }
});
