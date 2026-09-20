const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const axios = require('axios');

const GeminiService = require('./gemini');
const { createTranslationProvider } = require('./translationProviderFactory');
const { sanitizeApiKeyForHeader } = require('../utils/security');
const {
  handleTranslationError,
  isCrazyRouterUpstreamExhaustion
} = require('../utils/apiErrorHandler');
const { generateFileTranslationPage } = require('../utils/fileUploadPageGenerator');
const {
  generateEmbeddedSubtitlePage,
  generateAutoSubtitlePage
} = require('../utils/toolboxPageGenerator');
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
        models: [{
          name: 'models/gemini-3.7-flash',
          displayName: 'Gemini 3.7 Flash',
          supportedGenerationMethods: ['generateContent'],
          inputTokenLimit: 1048576
        }]
      }
    };
  };

  try {
    assert.equal(sanitizeApiKeyForHeader(`  ${authKey}\r\n`), authKey);
    const service = new GeminiService(`  ${authKey}  `, 'gemini-3.7-flash');
    const models = await service.getAvailableModels({ silent: true, throwOnError: true });

    assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models');
    assert.equal(request.options.headers['x-goog-api-key'], authKey);
    assert.deepEqual(models.map(model => model.name), ['gemini-3.7-flash']);

    const serverSource = fs.readFileSync(path.join(projectRoot, 'index.js'), 'utf8');
    assert.match(serverSource, /new GeminiService\(geminiApiKey\)[\s\S]{0,200}getAvailableModels\(\{ silent: true, throwOnError: true \}\)/);
    assert.doesNotMatch(serverSource, /generativelanguage\.googleapis\.com\/v1\/models/);
  } finally {
    axios.get = originalGet;
  }
});

test('Gemini 3.x uses thinking levels without legacy sampling fields', () => {
  const service = new GeminiService('test-key', 'models/gemini-3.5-flash', {
    thinkingBudget: 1000,
    thinkingLevel: 'high',
    temperature: 0.5,
    topK: 40,
    topP: 0.95
  });

  assert.equal(service.model, 'gemini-3.5-flash');
  assert.deepEqual(service.buildGenerationConfig(4096), {
    maxOutputTokens: 4096,
    thinkingConfig: { thinkingLevel: 'high' }
  });

  const disabled37 = new GeminiService('test-key', 'gemini-3.7-flash', { thinkingLevel: 'disabled' });
  assert.equal(disabled37.buildGenerationConfig(4096).thinkingConfig.thinkingLevel, 'low');

  const dated37 = new GeminiService('test-key', 'gemini-3.7-flash-001', { thinkingLevel: 'minimal' });
  assert.equal(dated37.buildGenerationConfig(4096).thinkingConfig.thinkingLevel, 'low');

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
        candidates: [{
          finishReason: 'STOP',
          content: { parts: [{ text: '{"entries":["Olá"]}' }] }
        }]
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
    topK: 20,
    topP: 0.9
  });

  assert.deepEqual(service.buildGenerationConfig(4096), {
    maxOutputTokens: 4096,
    temperature: 0.5,
    topK: 20,
    topP: 0.9,
    thinkingConfig: { thinkingBudget: 1000 }
  });
});

test('saved model IDs and Gemini 3.x defaults normalize without breaking old configs', () => {
  assert.equal(normalizeGeminiModelName(' models/gemini-3.7-flash '), 'gemini-3.7-flash');
  assert.equal(normalizeGeminiModelName('gemini-3.1-flash-lite-preview'), 'gemini-3.1-flash-lite');
  assert.equal(normalizeGeminiModelName('gemini-3-pro-preview'), 'gemini-flash-lite-latest');

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
  const requiredModels = [
    'gemini-2.5-flash-lite',
    'gemini-2.5-flash',
    'gemini-3-flash-preview',
    'gemini-3.1-flash-lite',
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.6-flash',
    'gemini-3.7-flash'
  ];

  for (const model of requiredModels) {
    assert.match(html, new RegExp(`value=["']${model}["']`));
  }
  assert.match(html, /id="advancedThinkingLevel"/);
  assert.doesNotMatch(html, /value="gemini-3-pro-preview"/);

  const uploadPage = generateFileTranslationPage(
    'tt-test',
    'test-config',
    getDefaultConfig('gemini-3.7-flash'),
    'test.srt'
  );
  assert.match(uploadPage, /id="advancedThinkingLevel"/);
  assert.match(uploadPage, /thinkingLevel: usesThinkingLevel \? thinkingLevel : undefined/);
  assert.match(uploadPage, /function getGeminiModelFamilyDefaults/);
  assert.match(uploadPage, /applyGeminiModelDefaults\(advancedModel\.value\)/);

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
    const roles = requestBody.contents.map(c => c.role);
    assert.ok(!roles.includes('system'), 'contents should not contain a system role entry');
  } finally {
    axios.post = originalPost;
  }
});

test('[GT-6] normalizeConfig preserves topK and thinkingBudget (no aggressive deletion)', () => {
  const normalized = normalizeConfig({
    geminiApiKey: 'AQ.saved.key',
    geminiModel: 'gemini-2.5-flash',
    advancedSettings: {
      enabled: true,
      topK: 25,
      thinkingBudget: 2048,
      frequencyPenalty: 0.5,
      presencePenalty: -0.5
    }
  });
  assert.equal(normalized.advancedSettings.topK, 25, 'topK must be preserved');
  assert.equal(normalized.advancedSettings.thinkingBudget, 2048, 'thinkingBudget must be preserved');
});

// ─── CrazyRouter: honest upstream errors (A) + unavailable-model warnings (B) ───

test('[CR-A1] provider_account_exhausted 403 surfaces honest upstream reason, not "Authentication failed"', () => {
  const upstreamError = {
    response: {
      status: 403,
      data: {
        error: {
          message: 'The upstream provider account for this route has run out of credit. Retry to use another route.',
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

test('[CR-B1] CrazyRouter unavailable model triggers warn; available model does not', async () => {
  const log = require('../utils/logger');
  const originalPost = axios.post;
  const originalGet = axios.get;
  const originalWarn = log.warn;
  const warnings = [];

  log.warn = (fn) => { warnings.push(typeof fn === 'function' ? fn() : String(fn)); };

  axios.get = async (url) => {
    if (String(url).endsWith('/v1/models')) {
      return { data: { data: [{ id: 'gemini-3.6-flash' }, { id: 'gemini-2.5-flash' }] } };
    }
    throw new Error('unexpected GET ' + url);
  };

  try {
    const unavailable = new GeminiService('sk-test-key', 'gemini-3-flash-preview', { maxRetries: 0 });
    await unavailable.warnIfModelUnavailable();
    assert.equal(warnings.length, 1, 'expected one unavailable-model warning');
    assert.match(String(warnings[0]), /NOT listed among the models callable/i);

    warnings.length = 0;
    const available = new GeminiService('sk-test-key', 'gemini-3.6-flash', { maxRetries: 0 });
    await available.warnIfModelUnavailable();
    assert.equal(warnings.length, 0, 'no warning expected for a callable model');
  } finally {
    log.warn = originalWarn;
    axios.get = originalGet;
    axios.post = originalPost;
  }
});

test('[CR-B2] model availability check is a no-op for Google Direct and when disabled', async () => {
  const direct = new GeminiService('AQ.test-key', 'gemini-3.6-flash', { maxRetries: 0 });
  const ids = await direct.getCrazyRouterAvailableModels();
  assert.equal(ids, null, 'Google Direct should skip CrazyRouter model fetch');
  // warnIfModelUnavailable resolves without side effects for Google Direct
  await direct.warnIfModelUnavailable();

  process.env.GEMINI_DISABLE_MODEL_AVAILABILITY_CHECK = 'true';
  try {
    const cr = new GeminiService('sk-test-key', 'gemini-3-flash-preview', { maxRetries: 0 });
    await cr.warnIfModelUnavailable();
    assert.equal(cr._crazyRouterModelIds, undefined, 'disabled check must not fetch the model list');
  } finally {
    delete process.env.GEMINI_DISABLE_MODEL_AVAILABILITY_CHECK;
  }
});
