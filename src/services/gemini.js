const axios = require('axios');
const { sanitizeApiKeyForHeader } = require('../utils/security');
const { handleTranslationError, logApiError } = require('../utils/apiErrorHandler');
const { httpAgent, httpsAgent } = require('../utils/httpAgents');
const log = require('../utils/logger');
const { resolveLanguageDisplayName } = require('../utils/languageResolver');
const { normalizeTargetLanguageForPrompt } = require('./utils/normalizeTargetLanguageForPrompt');
const {
  getProviderAuthFailureCacheKey,
  hasCachedProviderAuthFailure,
  cacheProviderAuthFailure,
  clearCachedProviderAuthFailure
} = require('../utils/providerAuthFailureCache');

// Use v1beta endpoint - v1 endpoint doesn't support /models/{model} operations
const GEMINI_API_URL = process.env.GEMINI_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';

function normalizeGeminiModelId(model) {
  return String(model || '').trim().replace(/^models\//, '');
}

function isGemini3Model(model) {
  const modelId = normalizeGeminiModelId(model);
  return /^gemini-3(?:[.-]|$)/i.test(modelId) || /^gemini-(?:flash|flash-lite|pro)-latest$/i.test(modelId);
}

// Jadual Pemetaan Rasmi Google Dokumen untuk Thinking Level & Tahap Disokong
const MODEL_THINKING_PROFILES = {
  'gemini-3.7-flash': { default: 'medium', levels: ['low', 'medium', 'high'] },
  'gemini-3.6-flash': { default: 'medium', levels: ['minimal', 'low', 'medium', 'high'] },
  'gemini-3.5-flash-lite': { default: 'minimal', levels: ['minimal', 'low', 'medium', 'high'] },
  'gemini-3.1-pro-preview': { default: 'high', levels: ['low', 'medium', 'high'] },
  'gemini-3.1-flash-lite-image': { default: 'minimal', levels: ['minimal', 'high'] },
  'gemini-3-flash-preview': { default: 'high', levels: ['minimal', 'low', 'medium', 'high'] },
  'gemini-3-pro-preview': { default: 'high', levels: ['low', 'high'] },
  'gemini-3.5-flash': { default: 'medium', levels: ['minimal', 'low', 'medium', 'high'] },
  'gemini-2.5-pro': { default: 'medium', levels: ['low', 'medium', 'high'] },
  'gemini-2.5-flash': { default: 'medium', levels: ['low', 'medium', 'high'] },
  'gemini-2.5-flash-lite': { default: 'disabled', levels: ['low', 'medium', 'high'] }
};

function getModelThinkingProfile(modelName) {
  const normalized = normalizeGeminiModelId(modelName).toLowerCase();
  for (const [key, profile] of Object.entries(MODEL_THINKING_PROFILES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return profile;
    }
  }
  return { default: 'medium', levels: ['minimal', 'low', 'medium', 'high'] };
}

function getFallbackOutputTokenLimit(model) {
  const modelName = normalizeGeminiModelId(model).toLowerCase();
  if (modelName.includes('2.0') || modelName.includes('-flash-001') || modelName.includes('-flash-lite-001')) {
    return 8192;
  }
  if (modelName.includes('2.5') || isGemini3Model(modelName)) {
    return 65536;
  }
  return 8192;
}

// Normalize human-readable target language names for Gemini prompts
function normalizeTargetName(name) {
  const raw = String(name || '').trim();
  if (!raw) return 'target language';

  const resolved = resolveLanguageDisplayName(raw) || raw;
  return normalizeTargetLanguageForPrompt(resolved);
}

function getGeminiErrorMessage(error) {
  const dataError = error?.response?.data?.error;
  if (typeof dataError === 'string') {
    return dataError;
  }
  if (dataError && typeof dataError === 'object') {
    return dataError.message || JSON.stringify(dataError);
  }
  return String(error?.response?.data?.message || error?.message || '');
}

function isGeminiAuthFailure(error) {
  const status = error?.response?.status || error?.statusCode;
  if (status === 401 || status === 403) {
    return true;
  }
  if (status !== 400) {
    return false;
  }

  const message = getGeminiErrorMessage(error).toLowerCase();
  return message.includes('api key') && (
    message.includes('invalid') ||
    message.includes('not valid') ||
    message.includes('permission') ||
    message.includes('authentication')
  );
}

// Default translation prompt (base - thinking rules added conditionally)
const DEFAULT_TRANSLATION_PROMPT = `Translate the following subtitles while:

1. Preserving the timing and structure exactly as given
2. Maintaining natural dialogue flow and colloquialisms appropriate to the target language
3. Keeping the same number of lines and line breaks
4. Preserving any formatting tags or special characters
5. Ensuring translations are contextually accurate for film/TV dialogue
6. Using at most 2 lines per subtitle and at most 42 characters per line (CPL <= 42)
7. For Malay (ms/my/mya/zsm): use natural Bahasa Melayu Malaysia, keep common English loanwords used in daily speech (okay, confirm, check, settle, try, call, parking, boss, etc.), and choose self-reference based on context: default saya/awak, close aku/kau, formal saya/anda. Strictly avoid Indonesianisms (bisa, banget, gimana, cewek/cowok, kalian, ngomong, kok, dong, sih). Never translate literally word-by-word.

Translate to {target_language}.

Do NOT include acknowledgements, explanations, notes or alternative translations.

Output ONLY the translated content, nothing else.`;

class GeminiService {
  constructor(apiKey, model = '', advancedSettings = {}) {
    this.apiKey = typeof apiKey === 'string' ? apiKey.trim() : apiKey;
    this.authFailureCacheKey = getProviderAuthFailureCacheKey('gemini', this.apiKey);
    this.model = normalizeGeminiModelId(model || process.env.GEMINI_MODEL || 'gemini-flash-lite-latest');
    this.isGemmaModel = String(this.model).toLowerCase().includes('gemma');
    this.isGemini3Model = typeof isGemini3Model === 'function' ? isGemini3Model(this.model) : String(this.model).toLowerCase().includes('gemini-3');

    // Auto-detect key type (Google Direct vs CrazyRouter Proxy)
    this.keyType = this.detectKeyType(this.apiKey);

    if (this.keyType === 'crazyrouter') {
      this.baseUrl = process.env.CRAZYROUTER_API_BASE || 'https://cn.crazyrouter.com/v1beta';
    } else {
      this.baseUrl = process.env.GEMINI_API_BASE || GEMINI_API_URL;
    }

    // FinOps Usage Ledger
    this.usageStats = {
      inputTokens: 0,
      outputTokens: 0,
      thoughtTokens: 0,
      cachedTokens: 0
    };

    // Output limits & timeouts
    this.maxOutputTokens = advancedSettings.maxOutputTokens
      || parseInt(process.env.GEMINI_MAX_OUTPUT_TOKENS, 10)
      || 65536;

    const timeoutSeconds = advancedSettings.translationTimeout
      || parseInt(process.env.GEMINI_TRANSLATION_TIMEOUT, 10)
      || 720;
    this.timeout = timeoutSeconds * 1000;

    this.maxRetries = advancedSettings.maxRetries !== undefined
      ? advancedSettings.maxRetries
      : (process.env.GEMINI_MAX_RETRIES !== undefined ? parseInt(process.env.GEMINI_MAX_RETRIES, 10) : 3);

    // Thinking Level Rasmi Mengikut Model.
    // Empty string is a valid legacy value for Gemini 2.x models (thinking
    // disabled via budget path), so only fall back when the caller did NOT
    // provide a string at all.
    const modelProfile = getModelThinkingProfile(this.model);
    const rawThinkingLevel = typeof advancedSettings.thinkingLevel === 'string'
      ? advancedSettings.thinkingLevel.trim().toLowerCase()
      : undefined;
    this.thinkingLevel = rawThinkingLevel !== undefined
      ? rawThinkingLevel
      : (process.env.GEMINI_THINKING_LEVEL ? process.env.GEMINI_THINKING_LEVEL.trim().toLowerCase() : modelProfile.default);

    // Universal 1:1 Sampling Defaults (Temperature: 0.2, Top-P: 0.95 | Pure Nucleus Sampling)
    this.temperature = advancedSettings.temperature !== undefined
      ? advancedSettings.temperature
      : (process.env.GEMINI_TEMPERATURE !== undefined ? parseFloat(process.env.GEMINI_TEMPERATURE) : 0.2);

    this.topP = advancedSettings.topP !== undefined
      ? advancedSettings.topP
      : (process.env.GEMINI_TOP_P !== undefined ? parseFloat(process.env.GEMINI_TOP_P) : 0.95);

    // Legacy sampling controls kept for Gemini 2.x / non-3.x models.
    this.topK = advancedSettings.topK !== undefined
      ? advancedSettings.topK
      : (process.env.GEMINI_TOP_K !== undefined ? parseFloat(process.env.GEMINI_TOP_K) : undefined);

    this.thinkingBudget = advancedSettings.thinkingBudget !== undefined
      ? advancedSettings.thinkingBudget
      : (process.env.GEMINI_THINKING_BUDGET !== undefined ? parseInt(process.env.GEMINI_THINKING_BUDGET, 10) : undefined);

    if (this.isGemmaModel) {
      this.maxOutputTokens = 8192;
      this.gemmaRetryConfig = {
        maxRetries: 2,
        baseDelay: 8000
      };
    }

    this.enableJsonOutput = advancedSettings.enableJsonOutput === true;
  }

  detectKeyType(apiKey) {
    if (!apiKey) return 'google';
    const key = String(apiKey).trim();
    if (key.startsWith('sk-')) return 'crazyrouter';
    return 'google';
  }

  getAuthHeaders() {
    const sanitizedKey = sanitizeApiKeyForHeader(this.apiKey) || '';
    if (this.keyType === 'crazyrouter') {
      return { 'Authorization': `Bearer ${sanitizedKey}`, 'Content-Type': 'application/json' };
    }
    return { 'x-goog-api-key': sanitizedKey, 'Content-Type': 'application/json' };
  }

  updateUsageStats(usage, streamId = 'default') {
    if (!usage) return;

    if (!global.geminiFinOps) {
      global.geminiFinOps = { streams: {} };
    }

    const input = usage.promptTokenCount || 0;
    const cached = usage.cachedContentTokenCount || 0;
    const thought = usage.thoughtsTokenCount || usage.thoughtTokenCount || 0;
    const textOut = usage.candidatesTokenCount || 0;

    global.geminiFinOps.streams[streamId] = {
      input,
      cached,
      thought,
      output: textOut
    };
  }

  getEffectiveThinkingLevel() {
    if (this.isGemmaModel) return 'disabled';
    const profile = getModelThinkingProfile(this.model);
    const supportedLevels = new Set(profile.levels);
    if (supportedLevels.has(this.thinkingLevel)) {
      return this.thinkingLevel;
    }
    return profile.default;
  }

  isThinkingEnabled() {
    const level = this.getEffectiveThinkingLevel();
    return level && level !== 'disabled' && level !== 'off';
  }

  buildGenerationConfig(maxOutputTokens) {
    // Gemini 3.x models reject legacy sampling parameters (temperature, topK,
    // topP) and numeric thinking budgets. Send only the current request shape.
    if (this.isGemini3Model) {
      const profile = getModelThinkingProfile(this.model);
      const requestedLevel = String(this.thinkingLevel || '').trim().toLowerCase();
      let effectiveLevel = requestedLevel;

      // Gemini 3.x requires a supported level. Disabled/off and unsupported
      // values (e.g. "minimal" on a model that only supports low/medium/high)
      // are mapped to "low" per the current API contract.
      if (!effectiveLevel || effectiveLevel === 'disabled' || effectiveLevel === 'off') {
        effectiveLevel = 'low';
      } else if (!profile.levels.includes(effectiveLevel)) {
        effectiveLevel = 'low';
      }

      return {
        maxOutputTokens,
        thinkingConfig: { thinkingLevel: effectiveLevel }
      };
    }

    // Legacy Gemini 2.x / Gemma path keeps numeric sampling controls.
    const generationConfig = {
      maxOutputTokens,
      temperature: this.temperature,
      topP: this.topP
    };
    if (this.topK !== undefined) {
      generationConfig.topK = this.topK;
    }
    if (this.thinkingBudget !== undefined) {
      generationConfig.thinkingConfig = { thinkingBudget: this.thinkingBudget };
    }
    return generationConfig;
  }

  isPrefillSupported() {
    if (this.isGemmaModel) return false;

    const modelNameLower = String(this.model).toLowerCase();
    const matchVer = modelNameLower.match(/gemini-(\d+(?:\.\d+)?)/);
    if (matchVer) {
      const geminiVersion = parseFloat(matchVer[1]);
      return geminiVersion <= 3.1;
    }

    return false;
  }

  async getAvailableModels(options = {}) {
    const silent = !!options.silent;
    const throwOnError = options.throwOnError === true;
    if (await hasCachedProviderAuthFailure(this.authFailureCacheKey)) {
      log.warn(() => '[Gemini] Fetch models blocked: cached invalid API key detected');
      return [];
    }

    try {
      const response = await axios.get(`${this.baseUrl}/models`, {
        headers: this.getAuthHeaders(),
        timeout: 10000,
        httpAgent,
        httpsAgent
      });

      if (!response.data || !response.data.models) {
        return [];
      }

      const models = response.data.models
        .filter(model => model.supportedGenerationMethods?.includes('generateContent'))
        .map(model => ({
          name: model.name.replace('models/', ''),
          displayName: model.displayName || model.name,
          description: model.description || '',
          maxTokens: model.inputTokenLimit || 30000
        }));

      await clearCachedProviderAuthFailure(this.authFailureCacheKey);
      return models;

    } catch (error) {
      if (isGeminiAuthFailure(error)) {
        await cacheProviderAuthFailure(this.authFailureCacheKey);
      }
      if (!silent) {
        logApiError(error, 'Gemini', 'Fetch models', { skipResponseData: true });
      }
      if (throwOnError) {
        throw error;
      }
      return [];
    }
  }

  async getModelLimits() {
    if (this._modelLimits) {
      return this._modelLimits;
    }

    const modelName = String(this.model).toLowerCase();

    // 🚀 INTERCEPT UNTUK PROXY CRAZYROUTER (1:1 DENGAN GOOGLE DIRECT)
    if (this.keyType === 'crazyrouter') {
      let outputLimit = 8192;
      if (modelName.includes('2.5') || modelName.includes('gemini-3') || modelName.includes('gemini-4')) {
        outputLimit = 65535;
      }
      const limits = {
        inputTokenLimit: undefined,
        outputTokenLimit: outputLimit
      };
      log.debug(() => `[Gemini] CrazyRouter proxy bypass applied for ${this.model}. Output limit forced to: ${limits.outputTokenLimit}`);

      const thinkingDisplay = `thinkingLevel=${this.getEffectiveThinkingLevel()}`;
      log.debug(() => `[Gemini] API config (Bypass Mode): temperature=${this.temperature}, topP=${this.topP}, ${thinkingDisplay}, maxOutputTokens=${this.maxOutputTokens}, timeout=${this.timeout / 1000}s, maxRetries=${this.maxRetries}`);

      this._modelLimits = limits;
      return limits;
    }

    // 🌐 LALUAN GOOGLE DIRECT SDK
    try {
      const response = await axios.get(`${this.baseUrl}/models/${this.model}`, {
        headers: this.getAuthHeaders(),
        timeout: this.timeout || 10000,
        httpAgent,
        httpsAgent
      });

      const data = response.data || {};
      const limits = {
        inputTokenLimit: data.inputTokenLimit,
        outputTokenLimit: data.outputTokenLimit
      };

      if (!limits.outputTokenLimit) {
        limits.outputTokenLimit = typeof getFallbackOutputTokenLimit === 'function'
          ? getFallbackOutputTokenLimit(this.model)
          : ((modelName.includes('2.5') || modelName.includes('gemini-3') || modelName.includes('gemini-4')) ? 65536 : 8192);
      }

      log.debug(() => `[Gemini] Model: ${this.model}, Output limit: ${limits.outputTokenLimit}, Input limit: ${limits.inputTokenLimit || 'unlimited'}`);

      const thinkingDisplay = `thinkingLevel=${this.getEffectiveThinkingLevel()}`;
      const generationControls = `temperature=${this.temperature}, topP=${this.topP}, ${thinkingDisplay}`;

      log.debug(() => `[Gemini] API config: ${generationControls}, maxOutputTokens=${this.maxOutputTokens}, timeout=${this.timeout / 1000}s, maxRetries=${this.maxRetries}${this._totalKeys ? `, keys=${this._totalKeys}` : ''}`);

      this._modelLimits = limits;
      return limits;
    } catch (error) {
      log.warn(() => ['[Gemini] Could not fetch model limits, using conservative defaults:', error.message]);
      const limits = {
        inputTokenLimit: undefined,
        outputTokenLimit: typeof getFallbackOutputTokenLimit === 'function'
          ? getFallbackOutputTokenLimit(this.model)
          : ((modelName.includes('2.5') || modelName.includes('gemini-3') || modelName.includes('gemini-4')) ? 65536 : 8192)
      };
      log.debug(() => `[Gemini] Fallback limits for ${this.model}: ${limits.outputTokenLimit} output tokens`);
      this._modelLimits = limits;
      return limits;
    }
  }

  getDefaultModels() {
    return [];
  }

  async retryWithBackoff(fn, maxRetries = null, baseDelay = 3000) {
    const useGemmaConfig = this.isGemmaModel && this.gemmaRetryConfig;
    const effectiveMaxRetries = maxRetries !== null ? maxRetries :
      (useGemmaConfig ? this.gemmaRetryConfig.maxRetries : this.maxRetries);
    const effectiveBaseDelay = useGemmaConfig ? this.gemmaRetryConfig.baseDelay : baseDelay;

    for (let attempt = 0; attempt <= effectiveMaxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const isLastAttempt = attempt === effectiveMaxRetries;
        const isTimeout = error.message.includes('timeout') || error.code === 'ECONNABORTED';
        const isNetworkError = error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND';
        const isSocketHangup = error.message.includes('socket hang up') || error.code === 'ECONNRESET';
        const isRateLimit = error.response?.status === 429 || error.statusCode === 429;
        const isServiceUnavailable = error.response?.status === 503 || error.statusCode === 503;
        const isMarkedRetryable = error.isRetryable === true;

        const isRetryable = isTimeout || isNetworkError || isSocketHangup || isRateLimit || isServiceUnavailable || isMarkedRetryable;

        if (isLastAttempt || !isRetryable) {
          throw error;
        }

        const delay = useGemmaConfig
          ? effectiveBaseDelay * Math.pow(3, attempt)
          : effectiveBaseDelay * Math.pow(2, attempt);
        // Apply jitter so multiple instances hitting the same rate-limit or
        // network window do not retry at exactly the same instant (thundering
        // herd). Range: 0.8x – 1.2x of the computed backoff.
        const jitteredDelay = Math.max(50, Math.round(delay * (0.8 + Math.random() * 0.4)));
        const errorType = isRateLimit ? '429 rate limit' :
          isServiceUnavailable ? '503 service unavailable' :
            isSocketHangup ? 'socket hang up' :
              isTimeout ? 'timeout' :
                isMarkedRetryable ? 'transient error (OTHER)' : 'network error';
        log.debug(() => `[Gemini] Attempt ${attempt + 1} failed (${errorType}), retrying in ${jitteredDelay}ms...`);
        await new Promise(resolve => setTimeout(resolve, jitteredDelay));
      }
    }
  }

  buildUserPrompt(subtitleContent, targetLanguage, customPrompt = null) {
    const normalizedTarget = normalizeTargetName(targetLanguage);

    let systemPrompt = (customPrompt || DEFAULT_TRANSLATION_PROMPT)
      .replace('{target_language}', normalizedTarget);

    const thinkingEnabled = this.isThinkingEnabled();

    if (thinkingEnabled) {
      const universalReasoningChain = '';

      if (systemPrompt.includes('<input>')) {
        systemPrompt = systemPrompt.replace('<input>', `${universalReasoningChain}\n\n<input>`);
      } else if (systemPrompt.includes('Do NOT include acknowledgements')) {
        systemPrompt = systemPrompt.replace(/(Do NOT include acknowledgements[^\n]+)\n/, `$1\n\n${universalReasoningChain}\n`);
      } else if (systemPrompt.includes('Output ONLY')) {
        systemPrompt = systemPrompt.replace(/\n(Output ONLY)/, `\n\n${universalReasoningChain}\n\n$1`);
      } else {
        systemPrompt = `${systemPrompt}\n\n${universalReasoningChain}`;
      }
    }

    let userPrompt;
    if (systemPrompt.includes('<input>') || systemPrompt.includes('INPUT (')) {
      userPrompt = systemPrompt;
    } else {
      userPrompt = `${systemPrompt}\n\nContent to translate:\n\n${subtitleContent}`;
    }

    return { userPrompt, systemPrompt, normalizedTarget };
  }

  async countTokensForTranslation(subtitleContent, targetLanguage, customPrompt = null) {
    if (this.keyType === 'crazyrouter') {
      return null;
    }

    const { userPrompt } = this.buildUserPrompt(subtitleContent, targetLanguage, customPrompt);

    try {
      const response = await axios.post(
        `${this.baseUrl}/models/${this.model}:countTokens`,
        {
          contents: [{
            parts: [{ text: userPrompt }]
          }]
        },
        {
          headers: this.getAuthHeaders(),
          timeout: 10000,
          httpAgent,
          httpsAgent
        }
      );

      if (response.data && typeof response.data.totalTokens === 'number') {
        return response.data.totalTokens;
      }

      log.warn(() => '[Gemini] Token count response missing totalTokens, falling back to estimate');
      return null;
    } catch (error) {
      logApiError(error, 'Gemini', 'Count tokens', { skipResponseData: true });
      return null;
    }
  }

  async translateSubtitle(subtitleContent, sourceLanguage, targetLanguage, customPrompt = null) {
    return this.retryWithBackoff(async () => {
      try {
        const { userPrompt } = this.buildUserPrompt(subtitleContent, targetLanguage, customPrompt);

        const estimatedSubtitleTokens = this.estimateTokenCount(subtitleContent);

        const limits = await this.getModelLimits();
        const modelOutputCap = typeof limits.outputTokenLimit === 'number' ? limits.outputTokenLimit : this.maxOutputTokens;
        const safetyMargin = Math.floor(modelOutputCap * 0.05);

        const availableForOutput = Math.max(1024, Math.min(this.maxOutputTokens, modelOutputCap - safetyMargin));

        let estimatedOutputTokens;
        if (this.isThinkingEnabled()) {
          estimatedOutputTokens = availableForOutput;
        } else {
          estimatedOutputTokens = Math.floor(Math.min(
            availableForOutput,
            Math.max(8192, estimatedSubtitleTokens * 3.5)
          ));
        }

        const generationConfig = this.buildGenerationConfig(estimatedOutputTokens);

        if (this.enableJsonOutput && (this.isGemini3Model || !generationConfig.thinkingConfig)) {
          generationConfig.responseMimeType = 'application/json';
        }

        const safetySettings = [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
        ];

        let contents = [];
        if (this.isPrefillSupported()) {
          let processedUserPrompt = userPrompt;
          let modelPrefill = "Task confirmed. Executing the strictly isolated raw data pipe localization stream now.\n";

          if (userPrompt.endsWith('<s id="')) {
            processedUserPrompt = userPrompt.slice(0, -7);
            modelPrefill += '<s id="';
          }

          contents = [
            {
              role: "user",
              parts: [{ text: processedUserPrompt }]
            },
            {
              role: "model",
              parts: [{ text: modelPrefill }]
            }
          ];
        } else {
          contents = [
            {
              role: "user",
              parts: [{ text: userPrompt }]
            }
          ];
        }

        const response = await axios.post(
          `${this.baseUrl}/models/${this.model}:generateContent`,
          {
            contents,
            generationConfig,
            safetySettings
          },
          {
            headers: this.getAuthHeaders(),
            timeout: this.timeout,
            httpAgent,
            httpsAgent
          }
        );

        if (!response.data) {
          log.warn(() => '[Gemini] No data in response');
          throw new Error('No data returned from Gemini API');
        }

        if (!response.data.candidates || response.data.candidates.length === 0) {
          const pf = response.data.promptFeedback || {};
          const blockReason = pf.blockReason || null;
          const safetyRatings = pf.safetyRatings || null;

          const truncatedResponse = (() => {
            try {
              const serialized = JSON.stringify(response.data, null, 2);
              const MAX_LEN = 2000;
              return serialized.length > MAX_LEN
                ? `${serialized.slice(0, MAX_LEN)}... [truncated]`
                : serialized;
            } catch (err) {
              return '[unserializable Gemini response]';
            }
          })();

          log.warn(() => ['[Gemini] No candidates in response (truncated):', truncatedResponse]);

          if (blockReason || safetyRatings) {
            const err = new Error(`PROHIBITED_CONTENT: ${blockReason || 'SAFETY'}`);
            err.translationErrorType = 'PROHIBITED_CONTENT';
            throw err;
          }

          throw new Error('No response candidates from Gemini API');
        }

        const candidate = response.data.candidates[0];
        const aggregatedText = candidate?.content?.parts?.map(p => (p && typeof p.text === 'string') ? p.text : '').join('') || '';

        if (candidate.finishReason && candidate.finishReason !== 'STOP') {
          log.warn(() => ['[Gemini] Unusual finish reason:', candidate.finishReason]);

          if (candidate.finishReason === 'SAFETY' || candidate.finishReason === 'PROHIBITED_CONTENT') {
            const err = new Error(`PROHIBITED_CONTENT: ${candidate.finishReason}`);
            err.translationErrorType = 'PROHIBITED_CONTENT';
            throw err;
          } else if (candidate.finishReason === 'RECITATION') {
            throw new Error('Translation blocked due to recitation concerns');
          } else if (candidate.finishReason === 'MAX_TOKENS') {
            log.warn(() => '[Gemini] MAX_TOKENS reached - translation may be incomplete');

            if (aggregatedText.length < subtitleContent.length * 0.3) {
              throw new Error('Translation exceeded maximum token limit with minimal output');
            }

            log.warn(() => '[Gemini] Continuing with partial translation due to MAX_TOKENS');
          } else {
            const err = new Error(`Translation stopped with reason: ${candidate.finishReason}`);
            err.isRetryable = true;
            throw err;
          }
        }

        if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
          log.warn(() => ['[Gemini] No content in candidate:', JSON.stringify(candidate, null, 2)]);
          throw new Error('No content in response candidate');
        }

        if (!candidate.content.parts[0].text && aggregatedText.length === 0) {
          log.warn(() => ['[Gemini] No text in content parts:', JSON.stringify(candidate.content.parts, null, 2)]);
          throw new Error('No text in response content');
        }

        const translatedText = aggregatedText.length > 0 ? aggregatedText : candidate.content.parts[0].text;
        return this.cleanTranslatedSubtitle(translatedText);

      } catch (error) {
        const normalized = handleTranslationError(error, 'Gemini', { skipResponseData: true });
        throw normalized;
      }
    });
  }

  async streamTranslateSubtitle(subtitleContent, sourceLanguage, targetLanguage, customPrompt = null, onChunk = null) {
    return this.retryWithBackoff(async () => {
      try {
        const { userPrompt } = this.buildUserPrompt(subtitleContent, targetLanguage, customPrompt);

        const estimatedSubtitleTokens = this.estimateTokenCount(subtitleContent);

        const limits = await this.getModelLimits();
        const modelOutputCap = typeof limits.outputTokenLimit === 'number' ? limits.outputTokenLimit : this.maxOutputTokens;
        const safetyMargin = Math.floor(modelOutputCap * 0.05);

        const availableForOutput = Math.max(1024, Math.min(this.maxOutputTokens, modelOutputCap - safetyMargin));

        let estimatedOutputTokens;
        if (this.isThinkingEnabled()) {
          estimatedOutputTokens = availableForOutput;
        } else {
          estimatedOutputTokens = Math.floor(Math.min(
            availableForOutput,
            Math.max(8192, estimatedSubtitleTokens * 3.5)
          ));
        }

        const generationConfig = this.buildGenerationConfig(estimatedOutputTokens);

        if (this.enableJsonOutput && (this.isGemini3Model || !generationConfig.thinkingConfig)) {
          generationConfig.responseMimeType = 'application/json';
        }

        const safetySettings = [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'OFF' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'OFF' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'OFF' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'OFF' },
        ];

        let contents = [];
        if (this.isPrefillSupported()) {
          let processedUserPrompt = userPrompt;
          let modelPrefill = "Task confirmed. Executing the strictly isolated raw data pipe localization stream now.\n";

          if (userPrompt.endsWith('<s id="')) {
            processedUserPrompt = userPrompt.slice(0, -7);
            modelPrefill += "<s id=\"";
          }

          contents = [
            {
              role: "user",
              parts: [{ text: processedUserPrompt }]
            },
            {
              role: "model",
              parts: [{ text: modelPrefill }]
            }
          ];
        } else {
          contents = [
            {
              role: "user",
              parts: [{ text: userPrompt }]
            }
          ];
        }

        const response = await axios.post(
          `${this.baseUrl}/models/${this.model}:streamGenerateContent`,
          {
            contents,
            generationConfig,
            safetySettings
          },
          {
            headers: {
              ...this.getAuthHeaders(),
              'Accept': 'text/event-stream'
            },
            params: { alt: 'sse' },
            timeout: this.timeout,
            httpAgent,
            httpsAgent,
            responseType: 'stream'
          }
        );

        const contentType = (response.headers && (response.headers['content-type'] || response.headers['Content-Type'])) || '';

        return await new Promise((resolve, reject) => {
          let buffer = '';
          let aggregated = '';
          let finishReason = null;
          let blockReason = null;
          let safetyRatings = null;
          let rawStream = '';
          let streamDone = false;
          let parseFailed = false;

          const processPayload = (payloadStr) => {
            if (!payloadStr || !payloadStr.trim()) return;
            const trimmed = payloadStr.trim();
            if (trimmed === '[DONE]' || trimmed === 'data: [DONE]') {
              streamDone = true;
              return;
            }
            const cleaned = trimmed.startsWith('data:')
              ? trimmed.slice(5).trim()
              : trimmed;
            if (!cleaned || cleaned === '[DONE]') {
              if (cleaned === '[DONE]') streamDone = true;
              return;
            }
            let data;
            try {
              data = JSON.parse(cleaned);
            } catch (_) {
              parseFailed = true;
              return;
            }

            if (data.usageMetadata) {
              if (!processPayload.streamId) processPayload.streamId = 'batch_' + Date.now() + Math.random();
              this.updateUsageStats(data.usageMetadata, processPayload.streamId);
            }

            if (data.promptFeedback) {
              blockReason = data.promptFeedback.blockReason || blockReason;
              if (Array.isArray(data.promptFeedback.safetyRatings) && data.promptFeedback.safetyRatings.length > 0) {
                safetyRatings = data.promptFeedback.safetyRatings;
              }
            }

            const candidate = data?.candidates?.[0];
            if (candidate && candidate.finishReason) {
              finishReason = candidate.finishReason;
            }
            if (candidate && Array.isArray(candidate.safetyRatings) && candidate.safetyRatings.length > 0) {
              safetyRatings = candidate.safetyRatings;
            }

            const parts = candidate?.content?.parts || [];
            const chunkText = parts.map(p => (p && typeof p.text === 'string') ? p.text : '').join('');
            if (chunkText) {
              aggregated += chunkText;
              const cleanedAgg = this.cleanTranslatedSubtitle(aggregated);
              if (typeof onChunk === 'function') {
                try { onChunk(cleanedAgg); } catch (_) { }
              }
            }
          };

          response.data.on('data', (chunk) => {
            try {
              const chunkStr = chunk.toString('utf8');
              rawStream += chunkStr;
              buffer += chunkStr;
              if (streamDone) return;

              // SSE events are separated by a blank line (double newline). Keep
              // buffering until we see that boundary so multi-line JSON payloads
              // are never passed to JSON.parse in pieces. A single newline
              // followed by "data: " is also accepted as a fallback boundary for
              // providers that do not emit the SSE blank line faithfully.
              while (buffer) {
                let boundary = null;
                let boundaryIndex = buffer.indexOf('\r\n\r\n');
                if (boundaryIndex !== -1) {
                  boundary = '\r\n\r\n';
                } else {
                  boundaryIndex = buffer.indexOf('\n\n');
                  if (boundaryIndex !== -1) {
                    boundary = '\n\n';
                  } else {
                    const altIndex = buffer.search(/\r?\ndata:\s*/);
                    if (altIndex !== -1) {
                      boundaryIndex = altIndex;
                      boundary = buffer.slice(boundaryIndex).startsWith('\r\n') ? '\r\n' : '\n';
                    } else {
                      break;
                    }
                  }
                }

                const eventBlock = buffer.slice(0, boundaryIndex);
                buffer = buffer.slice(boundaryIndex + boundary.length);
                const eventLines = eventBlock.split(/\r?\n/);
                for (const line of eventLines) {
                  const trimmed = line.trim();
                  if (!trimmed) continue;
                  if (trimmed.startsWith('data:')) {
                    processPayload(trimmed);
                  } else if (trimmed.startsWith('event:') || trimmed.startsWith('id:') || trimmed.startsWith('retry:')) {
                    // SSE control fields; ignore for Gemini payloads.
                    continue;
                  } else {
                    processPayload(trimmed);
                  }
                }
              }
            } catch (err) {
              log.warn(() => ['[Gemini] Stream chunk processing failed:', err.message]);
            }
          });

          response.data.on('end', () => {
            try {
              if (buffer && buffer.trim()) {
                processPayload(buffer);
              }

              // Run recovery when we have no parsed text OR when any SSE payload
              // failed to parse (partial JSON corruption / multi-line split). This
              // keeps the stream usable even if only a subset of chunks were parsed.
              if ((!aggregated || parseFailed) && rawStream.trim()) {
                try {
                  const recovered = this.recoverStreamPayload(rawStream);
                  if (recovered.text) {
                    const priorLength = aggregated.length;
                    // Prefer the recovered text when it contains more content
                    // than what normal parsing managed to extract.
                    if (recovered.text.length > aggregated.length) {
                      aggregated = recovered.text;
                    }
                    finishReason = finishReason || recovered.finishReason;
                    blockReason = blockReason || recovered.blockReason;
                    safetyRatings = safetyRatings || recovered.safetyRatings;
                    log.debug(() => `[Gemini] Stream parsed via fallback (${recovered.payloadCount} payloads, content-type=${contentType || 'unknown'}, prior=${priorLength}, recovered=${recovered.text.length})`);
                  } else if (contentType && !contentType.includes('text/event-stream')) {
                    log.warn(() => `[Gemini] Streaming response was '${contentType}' with no text; check API base/alt=sse config`);
                  }
                } catch (recoverErr) {
                  log.warn(() => ['[Gemini] Stream recovery parse failed:', recoverErr.message]);
                }
              }

              const cleaned = this.cleanTranslatedSubtitle(aggregated);

              if (!cleaned && (blockReason || safetyRatings)) {
                const reason = blockReason || 'SAFETY';
                const err = new Error(`PROHIBITED_CONTENT: ${reason}`);
                err.translationErrorType = 'PROHIBITED_CONTENT';
                reject(err);
                return;
              }

              if (finishReason && finishReason !== 'STOP') {
                if (finishReason === 'SAFETY' || finishReason === 'RECITATION' || finishReason === 'PROHIBITED_CONTENT') {
                  const err = new Error(finishReason === 'RECITATION'
                    ? 'RECITATION: Translation blocked due to recitation concerns'
                    : `PROHIBITED_CONTENT: ${finishReason}`);
                  err.translationErrorType = 'PROHIBITED_CONTENT';
                  reject(err);
                  return;
                }

                if (finishReason === 'MAX_TOKENS') {
                  if (cleaned.length < subtitleContent.length * 0.3) {
                    const err = new Error('MAX_TOKENS: Translation exceeded maximum token limit with minimal output');
                    err.translationErrorType = 'MAX_TOKENS';
                    reject(err);
                    return;
                  }
                  log.warn(() => '[Gemini] MAX_TOKENS reached in stream - continuing with partial translation');
                } else {
                  const err = new Error(`Translation stopped with reason: ${finishReason}`);
                  err.isRetryable = true;
                  reject(err);
                  return;
                }
              }

              if (!cleaned) {
                reject(new Error('No content returned from Gemini stream'));
                return;
              }

              resolve(cleaned);
            } catch (err) {
              reject(err);
            }
          });

          response.data.on('error', (err) => reject(err));
        });

      } catch (error) {
        const normalized = handleTranslationError(error, 'Gemini', { skipResponseData: true });
        throw normalized;
      }
    });
  }

  cleanTranslatedSubtitle(text) {
    let cleaned = text.replace(/```srt\n?/g, '').replace(/```\n?/g, '');
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    cleaned = cleaned.trim();
    return cleaned;
  }

  estimateTokenCount(text) {
    if (!text) return 0;

    let cjkCount = 0;
    let otherCount = 0;
    for (const char of text) {
      const codePoint = char.codePointAt(0);
      const isCjk = (codePoint >= 0x2E80 && codePoint <= 0x9FFF) // CJK radicals, Kangxi, ideographs
        || (codePoint >= 0x3400 && codePoint <= 0x4DBF) // CJK Ext A
        || (codePoint >= 0xF900 && codePoint <= 0xFAFF) // CJK Compatibility Ideographs
        || (codePoint >= 0x20000 && codePoint <= 0x2EBEF); // CJK Ext B+
      const isEmoji = (codePoint >= 0x1F000 && codePoint <= 0x1FAFF)
        || (codePoint >= 0x2600 && codePoint <= 0x27BF);

      if (isCjk || isEmoji) {
        cjkCount += 1;
      } else {
        otherCount += 1;
      }
    }

    // Latin text averages ~3-4 chars/token. CJK/emoji characters are usually
    // 1-2 tokens each, so underestimating them can cause MAX_TOKENS truncation.
    // Use ~1.25 tokens per CJK/emoji codepoint and keep the old heuristic for
    // the rest, then add the existing 10% safety margin.
    const approx = (otherCount / 3) + (cjkCount * 1.25);
    return Math.ceil(Math.ceil(approx) * 1.1);
  }

  recoverStreamPayload(rawStream) {
    const result = {
      text: '',
      finishReason: null,
      blockReason: null,
      safetyRatings: null,
      payloadCount: 0
    };

    if (!rawStream || typeof rawStream !== 'string') {
      return result;
    }

    const processPayload = (payloadStr) => {
      if (!payloadStr) return;
      let data;
      try {
        data = JSON.parse(payloadStr);
      } catch (_) {
        return;
      }

      if (data.usageMetadata) {
        if (!processPayload.streamId) processPayload.streamId = 'recv_' + Date.now() + Math.random();
        this.updateUsageStats(data.usageMetadata, processPayload.streamId);
      }

      const candidate = data?.candidates?.[0];
      if (data?.promptFeedback?.blockReason) {
        result.blockReason = result.blockReason || data.promptFeedback.blockReason;
      }
      if (Array.isArray(data?.promptFeedback?.safetyRatings) && data.promptFeedback.safetyRatings.length > 0) {
        result.safetyRatings = result.safetyRatings || data.promptFeedback.safetyRatings;
      }
      if (candidate) {
        if (candidate.finishReason && !result.finishReason) {
          result.finishReason = candidate.finishReason;
        }
        if (Array.isArray(candidate.safetyRatings) && candidate.safetyRatings.length > 0 && !result.safetyRatings) {
          result.safetyRatings = candidate.safetyRatings;
        }
        const parts = candidate?.content?.parts || [];
        const chunkText = parts.map(p => (p && typeof p.text === 'string') ? p.text : '').join('');
        if (chunkText) {
          result.text += chunkText;
        }
      }

      result.payloadCount += 1;
    };

    const blocks = rawStream.split(/\r?\n\r?\n/);
    for (const block of blocks) {
      const cleaned = block.split(/\r?\n/).map(line => line.replace(/^data:\s*/, '').trim()).filter(Boolean).join('');
      processPayload(cleaned);
    }

    if (result.payloadCount === 0) {
      const lines = rawStream.split(/\r?\n/);
      for (const line of lines) {
        const cleaned = line.replace(/^data:\s*/, '').trim();
        processPayload(cleaned);
      }
    }

    if (result.payloadCount === 0 && rawStream.includes('}{')) {
      const pieces = rawStream.split(/}\s*(?=\{)/).map((piece, idx, arr) => {
        if (idx < arr.length - 1) return piece + '}';
        return piece;
      });
      for (let i = 0; i < pieces.length; i++) {
        let segment = pieces[i];
        if (segment && segment[0] !== '{') segment = `{${segment}`;
        processPayload(segment.trim());
      }
    }

    return result;
  }
}

module.exports = GeminiService;
module.exports.DEFAULT_TRANSLATION_PROMPT = DEFAULT_TRANSLATION_PROMPT;
module.exports.__testing = {
  getGeminiErrorMessage,
  isGeminiAuthFailure
};
