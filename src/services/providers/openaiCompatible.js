const axios = require('axios');
const { handleTranslationError, logApiError } = require('../../utils/apiErrorHandler');
const { httpAgent, httpsAgent } = require('../../utils/httpAgents');
const log = require('../../utils/logger');
const { sanitizeApiKeyForHeader } = require('../../utils/security');
const { DEFAULT_TRANSLATION_PROMPT, composeDefaultTranslationPrompt } = require('../gemini');
const { splitStructuredPrompt } = require('../utils/structuredPrompt');
const { resolveBackoffBaseMs, sleepRetryBackoff } = require('./retryBackoff');
const { findISO6391ByName, getLanguageName, toISO6391, toISO6392 } = require('../../utils/languages');
const { resolveLanguageDisplayName } = require('../../utils/languageResolver');
const { normalizeTargetLanguageForPrompt } = require('../utils/normalizeTargetLanguageForPrompt');
const {
    getProviderAuthFailureCacheKey,
    hasCachedProviderAuthFailure,
    cacheProviderAuthFailure,
    clearCachedProviderAuthFailure
} = require('../../utils/providerAuthFailureCache');

// ═══ MANDAT OPERASI MUTLAK v3 2026-09-27 (pembetulan Project Owner) ═══
// [AUDIT-WARISAN 2026-09-29] env AGENT_INSPECTOR_MAX_TOKENS → constant
// AGENT_INSPECTOR_BEAST_MAX_TOKENS kini LALAI SAHAJA (legacy-only, no-op):
// muatan universal [PAYLOAD-GODTIER] 4-kunci TIDAK membawa max_tokens
// langsung (pencetus overthinking + istilah kritikal tergugur — siling
// token dikendalikan oleh lalai pelayan). Nilai masih di-parse dan
// disimpan ke this.beastMaxTokens untuk keserasian warisan, tetapi TIDAK
// dibaca oleh sebarang laluan aktif. Sejarah v3: 131072 (128K).
const parseAgentInspectorMaxTokens = (raw, fallback) => {
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const AGENT_INSPECTOR_BEAST_MAX_TOKENS = parseAgentInspectorMaxTokens(process.env.AGENT_INSPECTOR_MAX_TOKENS, 131072);
// [UPSTREAM-RESILIENCE 2026-09-29] Parser tetapan stall-watchdog aliran SSE.
// Menerima 0 EKSPLISIT (melumpuhkan watchdog) — dibezakan daripada nilai
// hilang/tak sah yang jatuh ke fallback. Integer ms >= 0 sahaja.
const parseStreamStallMs = (raw, fallback) => {
    if (raw === undefined || raw === null || String(raw).trim() === '') return fallback;
    const parsed = parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

/**
 * Universal OpenAI-Compatible Provider Wrapper
 * 100% Full Parity with Gemini Engine & 28-Model Smart Payload Registry.
 */
class OpenAICompatibleProvider {
    constructor(options = {}) {
        this.apiKey = options.apiKey || '';
        this.model = options.model || '';
        this.baseUrl = (options.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
        this.providerName = options.providerName || 'custom';
        this.authFailureCacheKey = getProviderAuthFailureCacheKey(this.providerName, this.apiKey);
        this.headers = options.headers || {};
        // [TRINITY TOTAL UNLOCK FASA 1 — Mandat Owner 2026-10-19] Lalai 0.2/0.95
        // DIGUGURKAN — undefined apabila pengguna tidak set; enjin menghantar
        // HANYA nilai eksplisit (pelayan guna lalai asalnya sendiri).
        this.temperature = options.temperature !== undefined ? options.temperature : undefined;
        this.maxOutputTokens = options.maxOutputTokens || 65536;
        this.topP = options.topP !== undefined ? options.topP : undefined;
        // [PENYATUAN MUTLAK 2026-10-25 — Mandat Owner] beastMaxTokens (dead
        // store warisan laluan god-tier) MANSUH. Siling token kini tunggal
        // melalui maxOutputTokens (getCappedMaxOutputTokens) bagi SEMUA ejen.
        this.presencePenalty = options.presencePenalty;
        // [MANDAT OWNER 2026-10-16 — SEND-ALL DOCTRINE] frequencyPenalty kini
        // diserialisasi kepada pintu openai-compatible (dahulu gap: dinormalisasi
        // config tetapi tidak pernah dihantar).
        this.frequencyPenalty = options.frequencyPenalty;
        this.reasoningEffort = this.normalizeReasoningEffort(options.reasoningEffort);
        // [PARITI-RETRY 2026-10-09] Backoff exponential antara percubaan retry —
        // formula 1:1 dengan Gemini retryWithBackoff (3s → 6s → 12s, jitter 0.8x-
        // 1.2x). Forensik log live: 3 retry dalam 37ms gagal pulih 502 transient.
        // 0 eksplisit = melumpuhkan (test/CI).
        this.retryBackoffBaseMs = resolveBackoffBaseMs(options.retryBackoffBaseMs);
        const timeoutSeconds = options.translationTimeout !== undefined ? options.translationTimeout : 120;
        this.translationTimeout = Math.max(5000, parseInt(timeoutSeconds * 1000, 10) || 120000);
        this.maxRetries = Number.isFinite(parseInt(options.maxRetries, 10))
            ? Math.max(0, parseInt(options.maxRetries, 10))
            : 2;
        this.enableJsonOutput = options.enableJsonOutput === true;
        // [PENYATUAN MUTLAK 2026-10-25 — Mandat Owner] Flag universalPayload
        // (laluan 4-kunci god-tier) MANSUH — SEMUA ejen (Translation,
        // Preflight, Inspector) kini melalui buildChatRequest() standard
        // yang sama. Format muatan ditentukan oleh PROTOKOL PINTU, bukan ejen.
        // [UPSTREAM-RESILIENCE v2 2026-09-29] DUA watchdog aliran SSE berasingan:
        //
        //   1. FIRST-BYTE (TTFT) — masa sehingga token PERTAMA tiba. Forensik
        //      run kedua S01E31: attempt 1 gagal kerana kimi-k3 masuk silent-
        //      reasoning dan gateway RESET sambungan pada ~44s SEBELUM token
        //      pertama; attempt 2 (TTFT-laju) BERJAYA 304s. Punca kegagalan =
        //      variance TTFT vs had idle gateway (~44s). Watchdog first-byte
        //      LALAI 35000ms (35s) — DI BAWAH had gateway supaya KITA abort
        //      dulu (bersih, retryable) sebelum gateway reset separuh jalan.
        //      Digabung dengan retry×5 + backoff: setiap retry cuba tangkap
        //      tetingkap TTFT-laju.
        //
        //   2. INTER-CHUNK STALL — jeda antara chunk SELEPAS token pertama.
        //      LALAI 75000ms (75s), longgar supaya aliran sihat-tapi-lambat
        //      (attempt 2 yang mencurah chunk sepanjang 304s) TIDAK di-abort.
        //
        // Kedua-dua 0 = dilumpuhkan. Env: OPENAI_COMPAT_FIRST_BYTE_MS,
        // OPENAI_COMPAT_STREAM_STALL_MS. Timer first-byte aktif dari mula;
        // sebaik token pertama tiba, ia bertukar kepada timer inter-chunk.
        this.firstByteTimeoutMs = parseStreamStallMs(
            options.firstByteTimeoutMs !== undefined
                ? options.firstByteTimeoutMs
                : process.env.OPENAI_COMPAT_FIRST_BYTE_MS,
            35000
        );
        this.streamStallTimeoutMs = parseStreamStallMs(
            options.streamStallTimeoutMs !== undefined
                ? options.streamStallTimeoutMs
                : process.env.OPENAI_COMPAT_STREAM_STALL_MS,
            75000
        );
        this._ssrfLookup = options.ssrfLookup || null;
        if (this._ssrfLookup) {
            const http = require('http');
            const https = require('https');
            this._ssrfHttpAgent = new http.Agent({ keepAlive: true, lookup: this._ssrfLookup });
            this._ssrfHttpsAgent = new https.Agent({ keepAlive: true, lookup: this._ssrfLookup });
        }
    }

    normalizeReasoningEffort(value) {
        const allowed = ['disabled', 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'no_think'];
        const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
        return allowed.includes(normalized) ? normalized : undefined;
    }

    getHttpAgents() {
        if (this._ssrfLookup) {
            return { httpAgent: this._ssrfHttpAgent, httpsAgent: this._ssrfHttpsAgent };
        }
        return { httpAgent, httpsAgent };
    }

    isCfTranslationModel() {
        const model = String(this.model || '').toLowerCase();
        return model.includes('m2m100') || model.includes('nllb-200');
    }

    /**
     * Pengesan keluarga model Kimi/Moonshot AI (case-insensitive).
     * [AUDIT 2026-09-29] Dakwaan lama "pelayan Kimi K3 mengunci sampling
     * secara dalaman → HTTP 400" sudah LAPUK — disahkan melalui curl pada
     * 2026-09-28: pelayan Kimi K3 TIDAK lagi mengunci temperature.
     * [MANDAT OWNER 2026-10-18 — PEMBEDAHAN PENGASINGAN PARAMETER]
     * applyFrontierModelRules() & isGlmFull53Model() DIPADAM sebagai dead
     * code (gate pemanggilan telah digugurkan oleh SEND-ALL DOCTRINE
     * 2026-10-16) — jebakan masa hadapan dihapuskan. Sampling Agent
     * Translation kini 100% nilai konfigurasi pengguna.
     * @param {string} [modelName] - Override nama model (lalai model aktif)
     * @returns {boolean}
     */
    isKimiModel(modelName = this.model) {
        return String(modelName || '')
            .toLowerCase()
            .includes('kimi');
    }

    normalizeCfModelId() {
        const raw = String(this.model || '').trim();
        const lower = raw.toLowerCase();
        if (lower.startsWith('@cf/')) return raw;
        if (lower.startsWith('meta/')) return `@cf/${raw}`;
        return `@cf/meta/${raw}`;
    }

    normalizeTargetName(name) {
        const raw = String(name || '').trim();
        if (!raw) return 'target language';

        const code = this.normalizeLanguageCode(raw);
        const variantDisplay = this.variantNameFromCode(code);
        if (variantDisplay) return normalizeTargetLanguageForPrompt(variantDisplay);

        const displayFromUi = resolveLanguageDisplayName(code) || resolveLanguageDisplayName(raw);
        if (displayFromUi) {
            return normalizeTargetLanguageForPrompt(this.normalizeVariantDisplayName(displayFromUi));
        }

        const nameFromCode = getLanguageName(code) || getLanguageName(code.replace(/-/g, ''));
        if (nameFromCode) {
            return normalizeTargetLanguageForPrompt(this.normalizeVariantDisplayName(nameFromCode));
        }

        if (/^[a-z]{2}$/i.test(code)) {
            const iso2 = toISO6392(code);
            if (Array.isArray(iso2) && iso2.length > 0) {
                const display = getLanguageName(iso2[0].code2);
                if (display) {
                    return normalizeTargetLanguageForPrompt(this.normalizeVariantDisplayName(display));
                }
            }
        }

        return normalizeTargetLanguageForPrompt(this.normalizeVariantDisplayName(raw) || raw);
    }

    normalizeVariantDisplayName(name) {
        const n = String(name || '').trim();
        if (!n) return '';
        const rules = [
            [/^brazilian portuguese$/i, 'Portuguese (Brazilian)'],
            [/^portuguese\s*\(brazil(ian)?\)$/i, 'Portuguese (Brazilian)'],
            [/^portuguese\s*\(portugal\)$/i, 'Portuguese (Portugal)'],
            [/^european portuguese$/i, 'Portuguese (Portugal)'],
            [/^portuguese$/i, 'Portuguese (Portugal)'],
            [/^spanish\s*\(latin america\)$/i, 'Spanish (Latin America)'],
            [/^latin american spanish$/i, 'Spanish (Latin America)'],
            [/^spanish$/i, 'Spanish (Spain)'],
            [/^chinese\s*\(traditional\)$/i, 'Chinese (Traditional)'],
            [/^chinese\s*\(simplified\)$/i, 'Chinese (Simplified)'],
            [/^chinese$/i, 'Chinese (Simplified)']
        ];
        for (const [re, out] of rules) {
            if (re.test(n)) return out;
        }
        return n;
    }

    variantNameFromCode(code) {
        const normalized = String(code || '').toLowerCase();
        switch (normalized) {
            case 'pt-br':
                return 'Portuguese (Brazilian)';
            case 'pt-pt':
                return 'Portuguese (Portugal)';
            case 'es-419':
                return 'Spanish (Latin America)';
            case 'zh-hant':
                return 'Chinese (Traditional)';
            case 'zh-hans':
                return 'Chinese (Simplified)';
            default:
                return null;
        }
    }

    normalizeCfLanguage(code) {
        const normalized = this.normalizeLanguageCode(code);
        if (!normalized || normalized === 'detected' || normalized === 'auto') return '';
        const base = normalized.split('-')[0];
        return base || normalized;
    }

    buildCfTranslationRequest(subtitleContent, sourceLanguage, targetLanguage) {
        const modelId = this.normalizeCfModelId();
        const url = `${this.baseUrl.replace(/\/v1$/, '')}/run/${modelId}`;
        const targetLang = this.normalizeCfLanguage(targetLanguage) || 'en';
        const sourceLang = this.normalizeCfLanguage(sourceLanguage);

        const body = {
            text: subtitleContent || '',
            target_lang: targetLang
        };

        if (sourceLang) body.source_lang = sourceLang;
        if (this.temperature !== undefined) body.temperature = this.temperature;
        if (this.topP !== undefined) body.top_p = this.topP;
        if (this.maxOutputTokens) body.max_tokens = this.maxOutputTokens;

        return { body, url };
    }

    /**
     * 🧠 ENJIN PINTAR BINA PAYLOAD (28-Model Registry & Behavior Engine)
     * Menyusun struktur JSON body mengikut spesifikasi rasmi setiap model.
     * [AUDIT 2026-09-29] MASIH AKTIF — BUKAN warisan: dipanggil oleh
     * buildChatRequest (laluan warisan) bagi SEMUA provider terjemahan kilang
     * (openai/xai/deepseek/mistral/openrouter/cfworkers/custom) — iaitu enjin
     * terjemahan utama (Agent Translation). Laluan Agent Inspector (universalPayload=true)
     * TIDAK melalui kaedah ini (builder 4-kunci god-tier return awal).
     * Oleh itu JANGAN tandakan @deprecated.
     *
     * [MANDAT OWNER 2026-10-18 — PEMBEDAHAN PENGASINGAN PARAMETER PINTU
     * OPENAI-COMPATIBLE] Hierarki USER-FIRST + reasoning minimum Translation:
     *   1. reasoningEffort EKSPLISIT pengguna (config UI) sentiasa dihormati
     *      (prinsip SEND-ALL) — rawEffort dipakai apa adanya.
     *   2. [TOTAL UNLOCK FASA 1 — K5] Tanpa nilai eksplisit: body TIDAK
     *      disentuh (model guna lalai semula jadi pelayan) — enjin dilarang
     *      mencipta nilai reasoning.
     *   3. Keluarga yang menyokong pematian (DeepSeek semua model / GLM-5.2 /
     *      GLM-5.1 / Hunyuan / MiniMax / GPT-reasoning) menghantar
     *      thinking disabled/no_think/none.
     *   4. Keluarga ALWAYS-ON (GLM-5.3, Kimi-k3): 'disabled' pengguna
     *      dihormati sebagai SENYAP TOTAL (tiada parameter reasoning
     *      dihantar — biar lalai pelayan), BUKAN dipaksa 'low'.
     *
     * [GROUND TRUTH RASMI 2026-10-25 — Firecrawl MCP live scrape, direkod
     *  plans/ground-truth/openai-compatible-official-api-ground-truth.md]
     *   - DeepSeek (SEMUA model berkongsi setup sama — v4-pro / v4-flash /
     *     v4.1-flash): reasoning_effort enum rasmi 'none'/'low'/'high'/'max',
     *     lalai pelayan 'high'; boleh OFF penuh (thinking.type disabled +
     *     reasoning_effort 'none' — "none disables thinking mode"). Pemetaan
     *     vendor: minimal→low, medium/xhigh→high, ultra→max. Rujukan:
     *     https://api-docs.deepseek.com/guides/thinking_mode
     *   - GLM-5.3 (docs.z.ai/guides/capabilities/thinking): reasoning_effort
     *     HANYA 'low'/'high'/'max', lalai 'max'; input lain = ERROR;
     *     thinking.type disabled = ERROR (forced thinking).
     *   - Kimi K3/K3.1-pro (platform.kimi.ai use-thinking-models +
     *     use-reasoning-effort): top-level reasoning_effort 'low'/'high'/'max',
     *     lalai 'max'; parameter thinking TIDAK wujud (sentiasa ON).
     */
    applySmartModelPayload(body, modelName, rawEffort) {
        const m = String(modelName || '').toLowerCase();
        // [TRINITY TOTAL UNLOCK FASA 1 — Mandat Owner 2026-10-19, K5] Tiada nilai
        // reasoning EKSPLISIT pengguna → JANGAN sentuh body sama sekali (model guna
        // lalai semula jadi pelayan). Enjin dilarang mencipta nilai reasoning.
        if (rawEffort === undefined || rawEffort === null || String(rawEffort).trim() === '') {
            return;
        }
        const effort = String(rawEffort).trim().toLowerCase();
        const isDisable = effort === 'disabled' || effort === 'none' || effort === 'no_think';

        // 1. DEEPSEEK FAMILY (deepseek-v4-pro, deepseek-v4-flash)
        if (m.includes('deepseek')) {
            if (isDisable) {
                // [PEMURNIAN 2026-10-25 — Mandat Owner] Enum rasmi semasa
                // reasoning_effort ialah 'none' (bukan 'disabled') — hantar
                // kedua-dua suis: thinking.type disabled + effort 'none'.
                body.thinking = { type: 'disabled' };
                body.reasoning_effort = 'none';
            } else {
                body.thinking = { type: 'enabled' };
                let mapped = 'low';
                if (effort === 'max') mapped = 'max';
                else if (effort === 'high' || effort === 'xhigh' || effort === 'medium') mapped = 'high';
                body.reasoning_effort = mapped;
            }
            return;
        }

        // 2. GLM / ZHIPU AI FAMILY
        if (m.includes('glm')) {
            if (m.includes('5.3')) {
                // [TOTAL UNLOCK FASA 1 — K4] GLM-5.3 selalu-on, TETAPI nilai
                // pengguna dihormati: 'disabled' → JANGAN hantar parameter
                // reasoning langsung (biar model guna lalai semula jadinya),
                // BUKAN dipaksa 'low'. Usaha lain dipetakan mengikut dialect vendor.
                if (isDisable) {
                    return;
                }
                let mapped = 'low';
                if (effort === 'max') mapped = 'max';
                else if (effort === 'high' || effort === 'xhigh' || effort === 'medium') mapped = 'high';
                body.reasoning_effort = mapped;
            } else if (m.includes('5.2')) {
                // GLM-5.2: Boleh disabled, effort cuma ada high / max
                if (isDisable) {
                    body.thinking = { type: 'disabled' };
                } else {
                    body.thinking = { type: 'enabled' };
                    body.reasoning_effort = effort === 'max' || effort === 'xhigh' ? 'max' : 'high';
                }
            } else if (m.includes('5.1')) {
                // GLM-5.1: Tiada reasoning_effort langsung
                if (isDisable) {
                    body.thinking = { type: 'disabled' };
                } else {
                    body.thinking = { type: 'enabled' };
                }
            }
            return;
        }

        // 3. KIMI / MOONSHOT AI FAMILY
        if (m.includes('kimi')) {
            if (m.includes('k3')) {
                // [TOTAL UNLOCK FASA 1 — K4] Kimi-k3 selalu-on, TETAPI 'disabled'
                // pengguna dihormati: JANGAN hantar parameter (bukan paksa 'low').
                if (isDisable) {
                    return;
                }
                let mapped = 'low';
                if (effort === 'max') mapped = 'max';
                else if (effort === 'high' || effort === 'xhigh' || effort === 'medium') mapped = 'high';
                body.reasoning_effort = mapped;
            }
            // Kimi-k2.7: Auto-managed, jangan hantar sebarang thinking parameter
            return;
        }

        // 4. CLAUDE / ANTHROPIC FAMILY (Claude 4.6, 4.7, 4.8, 5)
        if (m.includes('claude')) {
            body.thinking = { type: 'adaptive' };
            let mapped = 'low';
            if (effort === 'max') mapped = 'max';
            else if (effort === 'high') mapped = 'high';
            else if (effort === 'medium') mapped = 'medium';
            else if (effort === 'xhigh') {
                mapped = m.includes('4.6') ? 'high' : 'xhigh'; // 4.6 tidak sokong xhigh
            }
            body.output_config = { effort: mapped };
            return;
        }

        // 5. TENCENT HUNYUAN (Hy3)
        if (m.includes('hy3') || m.includes('hunyuan')) {
            const mapped = isDisable ? 'no_think' : effort === 'high' || effort === 'max' ? 'high' : 'low';
            if (!body.extra_body) body.extra_body = {};
            body.extra_body.chat_template_kwargs = { reasoning_effort: mapped };
            return;
        }

        // 6. MINIMAX (MiniMax-M3)
        if (m.includes('minimax')) {
            if (isDisable) {
                body.thinking = { type: 'disabled' };
            } else {
                body.thinking = { type: 'adaptive' };
            }
            return;
        }

        // 7. GPT-5.6 / OPENAI GENERIC REASONING MODELS
        if (this.isOpenAIReasoningModel(m)) {
            if (isDisable) {
                body.reasoning_effort = 'none';
            } else {
                let mapped = 'low';
                if (effort === 'max') mapped = 'max';
                else if (effort === 'xhigh') mapped = 'xhigh';
                else if (effort === 'high') mapped = 'high';
                else if (effort === 'medium') mapped = 'medium';
                body.reasoning_effort = mapped;
            }
        }
    }

    buildChatRequest(userPrompt, stream = false, meta = {}) {
        const disableStructuredOutput = meta?.disableStructuredOutput === true;
        const isCfRun = this.isCfWorkersRunModel();
        const isCfTranslation = isCfRun && this.isCfTranslationModel();
        const isOpenAI = this.providerName === 'openai';
        const useResponsesApi = this.shouldUseOpenAIResponsesApi();

        if (isCfTranslation) {
            const { body, url } = this.buildCfTranslationRequest(
                meta.subtitleContent,
                meta.sourceLanguage,
                meta.targetLanguage
            );
            return { body, url, isCfRun: true, isCfTranslation: true };
        }

        const cappedMaxTokens = this.getCappedMaxOutputTokens();
        const isReasoning = this.isOpenAIReasoningModel();

        // 🎯 1:1 Pariti Mutlak dengan Gemini — DAN [FASA H 2026-10-07] pemisahan
        // saluran system/user (varian G1 Fasa G, ground truth empirikal kimi-k3):
        // bila pemanggil membawa meta.systemPrompt (prompt bersempadan
        // SUBFABER_PROMPT_BOUNDARY — Pre-Flight Agent Inspector, atau Agent Translation fallback
        // melalui splitStructuredPrompt), arahan STATIK dihantar sebagai mesej
        // system (bobot arahan lebih tinggi: terms Jaccard 0.47→0.72, null
        // spread 20pt→7pt) dan hanya data DINAMIK sebagai mesej user. Tanpa
        // systemPrompt (prompt warisan / inspection) — satu mesej user sahaja
        // (tingkah laku sedia ada dipelihara).
        const systemPrompt = typeof meta?.systemPrompt === 'string' ? meta.systemPrompt.trim() : '';
        const messages = systemPrompt
            ? [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: userPrompt }
              ]
            : [
                  {
                      role: 'user',
                      content: userPrompt
                  }
              ];

        // [PENYATUAN MUTLAK 2026-10-25 — Mandat Owner] Laluan 2b (PAYLOAD-GODTIER
        // 4-kunci universalPayload) MANSUH sepenuhnya. SEMUA ejen Trinity
        // (Translation, Preflight, Inspector) kini melalui pembina standard di
        // bawah — format muatan HANYA ditentukan oleh PROTOKOL PINTU
        // OpenAI-compatible (model, messages, max_tokens/max_completion_tokens,
        // temperature, top_p, penalti, reasoning_effort, thinking,
        // response_format). Kesahan JSON Inspector melalui response_format
        // rasmi (json_schema/json_object), bukan cantasan rahsia parameter.
        // Siling masa kekal diuruskan lapisan axios (translationTimeout).
        const body = isCfRun
            ? { prompt: userPrompt, stream }
            : isOpenAI && useResponsesApi
              ? {
                    model: this.model,
                    input: userPrompt,
                    max_output_tokens: cappedMaxTokens,
                    stream
                }
              : {
                    model: this.model,
                    messages,
                    // [PENYATUAN MUTLAK 2026-10-25] max_completion_tokens HANYA
                    // untuk model reasoning OpenAI rasmi; max_tokens bagi yang
                    // lain. Kunci tidak berkaitan tidak dihantar langsung
                    // (sebelum ini tersekat sebagai undefined — kebocoran kunci
                    // kosong ke muatan provider kompatibel).
                    ...(isOpenAI && isReasoning
                        ? { max_completion_tokens: cappedMaxTokens }
                        : { max_tokens: cappedMaxTokens }),
                    stream
                };

        // 🚀 Terapkan parameter thinking/reasoning pintar mengikut spesifikasi model
        if (!isCfRun) {
            this.applySmartModelPayload(body, this.model, this.reasoningEffort);
        }

        // [PENYATUAN MUTLAK 2026-10-25 — Mandat Owner] meta.responseFormat
        // (dibina oleh wrapper prompt Trinity daripada skema kanonik —
        // json_schema strict) diaktifkan sebagai response_format pada tahap
        // API DI DALAM pembina standard. Ini parameter pintu sah (standard
        // rasmi OpenAI), bukan tampalan ejen — SEMUA ejen (Translation,
        // Preflight, Inspector) melalui laluan tunggal ini, stream mahupun
        // non-stream.
        if (!isCfRun && meta?.responseFormat && !body.response_format) {
            body.response_format = meta.responseFormat;
        }

        if (!isCfRun && this.enableJsonOutput && !disableStructuredOutput) {
            if (this.providerName === 'deepseek') {
                body.response_format = { type: 'json_object' };
            } else if (isOpenAI && useResponsesApi) {
                body.text = { format: this.buildResponsesJsonSchemaFormat() };
            } else {
                body.response_format = this.buildChatJsonSchemaResponseFormat();
            }
        }

        if (isCfRun) {
            if (this.temperature !== undefined) body.temperature = this.temperature;
            if (this.topP !== undefined) body.top_p = this.topP;
            if (this.maxOutputTokens) body.max_tokens = cappedMaxTokens;
        } else {
            // [MANDAT OWNER 2026-10-16 — SEND-ALL DOCTRINE] Gate omitSampling &
            // applyFrontierModelRules DIGUGURKAN — semua parameter sampling wajib
            // dihantar; pelayan provider tentukan sendiri (terima/abaikan/400).
            // Histori: omit untuk gpt-5* + peraturan frontier kimi/glm (drop/lock)
            // pernah aktif — doktrin pemerhatian empirikal Owner mengatasi.
            if (this.temperature !== undefined && !useResponsesApi) {
                body.temperature = this.temperature;
            }
            if (this.topP !== undefined) {
                body.top_p = this.topP;
            }
            if (this.presencePenalty !== undefined && !useResponsesApi) {
                body.presence_penalty = this.presencePenalty;
            }
            if (this.frequencyPenalty !== undefined && !useResponsesApi) {
                body.frequency_penalty = this.frequencyPenalty;
            }
        }

        const url = isCfRun
            ? `${this.baseUrl.replace(/\/v1$/, '')}/run/${this.model}`
            : isOpenAI && useResponsesApi
              ? `${this.baseUrl}/responses`
              : `${this.baseUrl}/chat/completions`;

        return { body, url, isCfRun, isCfTranslation: false, useResponsesApi };
    }

    shouldUseOpenAIResponsesApi() {
        if (this.providerName !== 'openai') return false;
        const model = String(this.model || '')
            .trim()
            .toLowerCase();
        return /^gpt-5(?:\.\d+)?-pro(?:$|-)/.test(model);
    }

    shouldOmitOpenAISamplingParams() {
        // [MANDAT OWNER 2026-10-16 — SEND-ALL DOCTRINE] Sentiasa false: parameter
        // sampling tidak lagi digugurkan untuk mana-mana model. Kaedah dikekalkan
        // (kontrak publik dipanggil test suite lama) sebagai no-op eksplisit.
        return false;
    }

    isOpenAIReasoningModel(modelName = this.model) {
        const model = String(modelName || '')
            .trim()
            .toLowerCase();
        return (
            model.includes('deepseek') ||
            model.includes('kimi') ||
            model.includes('glm') ||
            model.includes('claude') ||
            model.includes('minimax') ||
            model.includes('hy3') ||
            model.includes('hunyuan') ||
            model.includes('reasoner') ||
            model.includes('thinking') ||
            model.startsWith('o1') ||
            model.startsWith('o3') ||
            /^gpt-5(?:[\.-]|$)/.test(model)
        );
    }

    buildSubtitleEntriesJsonSchema() {
        return {
            type: 'object',
            properties: {
                entries: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'integer' },
                            text: { type: 'string' }
                        },
                        required: ['id', 'text'],
                        additionalProperties: false
                    }
                }
            },
            required: ['entries'],
            additionalProperties: false
        };
    }

    buildChatJsonSchemaResponseFormat() {
        return {
            type: 'json_schema',
            json_schema: {
                name: 'subtitle_entries',
                strict: true,
                schema: this.buildSubtitleEntriesJsonSchema()
            }
        };
    }

    buildResponsesJsonSchemaFormat() {
        return {
            type: 'json_schema',
            name: 'subtitle_entries',
            strict: true,
            schema: this.buildSubtitleEntriesJsonSchema()
        };
    }

    getCappedMaxOutputTokens() {
        // [TRINITY TOTAL UNLOCK FASA 1 — Mandat Owner 2026-10-19, K9]
        // Math.max(raw, 65536) paksa-naik DIGUGURKAN — had yang diminta pengguna
        // dihormati 100%. Kekal hanya benteng siling mutlak vendor (Keputusan
        // Rasmi Owner §8.2): clamp atas 131072 + clamp bawah 1 (nilai sah
        // minimum; 65536 kekal sebagai LALAI apabila pengguna tidak menetapkan).
        const raw = Number.isFinite(Number(this.maxOutputTokens)) ? Number(this.maxOutputTokens) : 65536;
        return Math.max(1, Math.min(Math.floor(raw), 131072));
    }

    buildUserPrompt(subtitleContent, targetLanguage, customPrompt = null) {
        const normalizedTarget = this.normalizeTargetName(targetLanguage);
        // [UNIVERSAL-FIX] Fallback prompt lalai kini TARGET-CONDITIONAL —
        // peraturan khusus-Malay hanya apabila sasaran ialah Malay; lain neutral.
        let systemPrompt = (customPrompt || composeDefaultTranslationPrompt(targetLanguage)).replace(
            '{target_language}',
            normalizedTarget
        );

        // [PROMPT REBUILD v2 2026-09-29] Structured split: bila SubFaber Agent Translation
        // prompt (dengan SUBFABER_PROMPT_BOUNDARY) mengalir ke provider ini sebagai
        // fallback, pisahkan STATIK (system) daripada DINAMIK (user) supaya arahan
        // tidak dihantar dua kali dan sempadan tidak bocor ke prompt hidup.
        const structured = splitStructuredPrompt(systemPrompt);
        if (structured) {
            return {
                userPrompt: structured.user,
                systemPrompt: structured.system,
                normalizedTarget,
                subtitleContent,
                isSelfContained: true
            };
        }

        let userPrompt;
        let isSelfContained = false;

        if (
            systemPrompt.includes('<input>') ||
            systemPrompt.includes('INPUT (') ||
            systemPrompt.includes('=== ENTRIES TO TRANSLATE ===') ||
            systemPrompt.includes('entries_to_translate')
        ) {
            userPrompt = systemPrompt;
            isSelfContained = true;
        } else {
            userPrompt = `Content to translate:\n\n${subtitleContent}`;
        }

        return { userPrompt, systemPrompt, normalizedTarget, subtitleContent, isSelfContained };
    }

    estimateTokenCount(text) {
        if (!text) return 0;
        const str = String(text);
        try {
            const { countTokens } = require('gpt-tokenizer');
            return countTokens(str);
        } catch (_) {
            const approx = Math.ceil(str.length / 3);
            return Math.ceil(approx * 1.1);
        }
    }

    getAuthHeaders() {
        const sanitizedKey = sanitizeApiKeyForHeader(this.apiKey) || '';
        if (!sanitizedKey) {
            return { ...this.headers };
        }
        return {
            Authorization: `Bearer ${sanitizedKey}`,
            'x-api-key': sanitizedKey,
            ...this.headers
        };
    }

    isCfWorkersRunModel() {
        return this.providerName === 'cfWorkers';
    }

    shouldUseAuthFailureCache() {
        return this.providerName !== 'custom' && !!this.authFailureCacheKey;
    }

    isAuthFailure(error) {
        const status = error?.response?.status || error?.statusCode || error?.status;
        return status === 401 || status === 403;
    }

    normalizeLanguageCode(code) {
        const raw = String(code || '').trim();
        if (!raw) return 'en';

        const fromName = findISO6391ByName(raw);
        if (fromName) return this.normalizeLanguageCode(fromName);

        let cleaned = raw.toLowerCase().replace(/[\s_]/g, '-');
        const variantMap = {
            pob: 'pt-br',
            ptbr: 'pt-br',
            'pt-br': 'pt-br',
            ptbrazil: 'pt-br',
            'pt-brazil': 'pt-br',
            'pt-pt': 'pt-pt',
            pt_portugal: 'pt-pt',
            spn: 'es-419',
            'es-419': 'es-419',
            es_la: 'es-419',
            'es-la': 'es-419',
            'es-latam': 'es-419',
            zht: 'zh-hant',
            'zh-hant': 'zh-hant',
            'zh-tw': 'zh-hant',
            zhs: 'zh-hans',
            'zh-hans': 'zh-hans',
            'zh-cn': 'zh-hans'
        };
        if (variantMap[cleaned]) return variantMap[cleaned];

        cleaned = cleaned.replace(/-tr$/, '');
        if (/^[a-z]{3}$/.test(cleaned)) {
            const iso1 = toISO6391(cleaned);
            if (iso1) cleaned = iso1.toLowerCase();
        }

        cleaned = cleaned.replace(/[^a-z-]/g, '');
        if (/^[a-z]{2}(-[a-z0-9]{2,})?$/.test(cleaned)) return cleaned;
        if (/^[a-z]{2}$/.test(cleaned)) return cleaned;

        return cleaned.slice(0, 2) || 'en';
    }

    async getAvailableModels() {
        if (this.shouldUseAuthFailureCache() && (await hasCachedProviderAuthFailure(this.authFailureCacheKey))) {
            log.warn(() => `[${this.providerName}] Fetch models blocked: cached invalid API key detected`);
            return [];
        }

        try {
            const isCfWorkers = this.providerName === 'cfWorkers';
            const baseModelsUrl = isCfWorkers
                ? `${this.baseUrl.replace(/\/v1$/, '')}/models`
                : `${this.baseUrl}/models`;

            const agents = this.getHttpAgents();
            const requestConfig = {
                headers: this.getAuthHeaders(),
                timeout: 10000,
                httpAgent: agents.httpAgent,
                httpsAgent: agents.httpsAgent
            };

            let response;
            if (isCfWorkers) {
                const searchUrl = `${this.baseUrl.replace(/\/v1$/, '')}/models/search`;
                try {
                    response = await axios.get(searchUrl, requestConfig);
                } catch (_) {
                    response = await axios.get(baseModelsUrl, requestConfig);
                }
            } else {
                response = await axios.get(baseModelsUrl, requestConfig);
            }

            const data = response.data || {};
            const modelsRaw = Array.isArray(data?.data)
                ? data.data
                : Array.isArray(data?.models)
                  ? data.models
                  : Array.isArray(data?.result)
                    ? data.result
                    : Array.isArray(data?.result?.models)
                      ? data.result.models
                      : undefined;

            const models = Array.isArray(modelsRaw)
                ? modelsRaw
                      .map((m) => {
                          const isCf = this.providerName === 'cfWorkers';
                          const name = isCf ? m.name || m.slug || m.id || m.model : m.id || m.name || m.model;
                          const displayName = m.display_name || m.displayName || m.name || m.slug || m.id || m.model;
                          return {
                              name,
                              displayName,
                              description: m.description || '',
                              maxTokens: m.max_tokens || m.maxTokens || undefined
                          };
                      })
                      .filter((m) => !!m.name)
                : [];

            if (this.shouldUseAuthFailureCache()) {
                await clearCachedProviderAuthFailure(this.authFailureCacheKey);
            }
            return models;
        } catch (error) {
            if (this.shouldUseAuthFailureCache() && this.isAuthFailure(error)) {
                await cacheProviderAuthFailure(this.authFailureCacheKey);
            }
            logApiError(error, this.providerName, 'Fetch models', { skipResponseData: true });
            return [];
        }
    }

    isStructuredOutputUnsupportedError(error) {
        if (!error) return false;
        const status = error?.response?.status || error?.status || error?.statusCode || 0;
        const msg = String(
            error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || ''
        ).toLowerCase();
        const requestIssue =
            status === 400 || status === 404 || status === 405 || status === 415 || status === 422 || status === 501;
        const mentionsStructuredMode =
            msg.includes('response_format') ||
            msg.includes('json_schema') ||
            msg.includes('json_object') ||
            msg.includes('unknown parameter') ||
            msg.includes('unsupported') ||
            msg.includes('does not support');
        return requestIssue && mentionsStructuredMode;
    }

    async translateSubtitle(subtitleContent, sourceLanguage, targetLanguage, customPrompt = null, requestOptions = {}) {
        // [PENYATUAN MUTLAK 2026-10-25 — Mandat Owner] Gate streaming
        // universalPayload MANSUH. Ejen yang memerlukan SSE (cth. Agent
        // Inspector laluan rootsys/Caddy — kelulusan owner #4) menghala
        // TERUS kepada streamTranslateSubtitle() sebagai pilihan pengangkutan
        // milik channel; pembina muatan kekal buildChatRequest() standard
        // tunggal bagi SEMUA ejen. Sifar laluan khas ejen di lapisan provider.
        const promptData = this.buildUserPrompt(subtitleContent, targetLanguage, customPrompt);

        let lastError;
        let disableStructuredOutput = requestOptions?.disableStructuredOutput === true;
        let structuredDowngradeUsed = disableStructuredOutput;

        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                const { body, url, isCfRun, useResponsesApi } = this.buildChatRequest(promptData.userPrompt, false, {
                    subtitleContent,
                    sourceLanguage,
                    targetLanguage,
                    systemPrompt: promptData.systemPrompt,
                    isSelfContained: promptData.isSelfContained,
                    disableStructuredOutput,
                    // [TRINITY FASA 3] Turunkan responseFormat (json_schema strict
                    // mazhab rasmi OpenAI tunggal) daripada wrapper kepada builder.
                    responseFormat: requestOptions?.responseFormat
                });

                const agents = this.getHttpAgents();
                const response = await axios.post(url, body, {
                    headers: this.getAuthHeaders(),
                    timeout: this.translationTimeout,
                    httpAgent: agents.httpAgent,
                    httpsAgent: agents.httpsAgent
                });

                let text;
                if (isCfRun) {
                    text =
                        response.data?.result?.translated_text ||
                        response.data?.result?.output ||
                        response.data?.result?.response ||
                        response.data?.result;
                } else if (useResponsesApi) {
                    text = this.extractResponsesText(response.data);
                } else {
                    text = this.extractChatMessageText(response.data?.choices?.[0]?.message);
                }

                if (!text) {
                    // Unthrottle Mandat §C (2026-09-26): log raw pada DEBUG supaya
                    // respons berhenti di sini mudah disiasat (cth: reasoning sahaja).
                    log.debug(
                        () =>
                            `[${this.providerName}] Empty extraction — raw response (first 800 chars): ${JSON.stringify(response.data || {}).slice(0, 800)}`
                    );
                    throw new Error('No translation returned from API');
                }

                return this.cleanTranslatedSubtitle(text);
            } catch (error) {
                lastError = error;
                if (
                    this.enableJsonOutput &&
                    !disableStructuredOutput &&
                    !structuredDowngradeUsed &&
                    this.isStructuredOutputUnsupportedError(error)
                ) {
                    structuredDowngradeUsed = true;
                    disableStructuredOutput = true;
                    log.warn(() => [
                        `[${this.providerName}] Structured output not supported by this model, retrying without response_format`
                    ]);
                    continue;
                }
                if (attempt < this.maxRetries) {
                    log.warn(() => [
                        `[${this.providerName}] Retry ${attempt + 1}/${this.maxRetries} after error:`,
                        error.message
                    ]);
                    // [PARITI-RETRY] Backoff 1:1 Gemini — menunggu 3s/6s/12s
                    // (jittered) sebelum meluru semula, memberi window pemulihan
                    // kepada gateway yang mengalami 502/503 transient.
                    await sleepRetryBackoff(attempt, this.retryBackoffBaseMs);
                    continue;
                }
                handleTranslationError(error, this.providerName, { skipResponseData: true });
            }
        }

        if (lastError) throw lastError;
    }

    async streamTranslateSubtitle(
        subtitleContent,
        sourceLanguage,
        targetLanguage,
        customPrompt = null,
        onPartial = null,
        requestOptions = {}
    ) {
        const promptData = this.buildUserPrompt(subtitleContent, targetLanguage, customPrompt);
        const request = this.buildChatRequest(promptData.userPrompt, true, {
            subtitleContent,
            sourceLanguage,
            targetLanguage,
            systemPrompt: promptData.systemPrompt,
            isSelfContained: promptData.isSelfContained,
            disableStructuredOutput: requestOptions?.disableStructuredOutput === true,
            // [TRINITY FASA 3] Turunkan responseFormat (json_schema strict)
            // daripada wrapper kepada builder — laluan stream (Inspector).
            responseFormat: requestOptions?.responseFormat
        });

        if (request.isCfTranslation || request.useResponsesApi) {
            const full = await this.translateSubtitle(
                subtitleContent,
                sourceLanguage,
                targetLanguage,
                customPrompt,
                requestOptions
            );
            if (typeof onPartial === 'function') {
                try {
                    await onPartial(full);
                } catch (_) {}
            }
            return full;
        }

        const { body, url, isCfRun } = request;

        const executeStream = async () => {
            const agents = this.getHttpAgents();
            const response = await axios.post(url, body, {
                headers: this.getAuthHeaders(),
                timeout: this.translationTimeout,
                httpAgent: agents.httpAgent,
                httpsAgent: agents.httpsAgent,
                responseType: 'stream'
            });

            return await new Promise((resolve, reject) => {
                let buffer = '';
                let aggregated = '';
                let finishReason = null;
                let rawStream = '';

                // [UPSTREAM-RESILIENCE v2 2026-09-29] Watchdog DUA-FASA:
                //   Fasa A (first-byte/TTFT): timer firstByteMs berjalan sehingga
                //     token PERTAMA tiba. Abort awal jika TTFT melebihi had gateway
                //     (~44s forensik) supaya KITA yang tutup sambungan (bersih,
                //     retryable) sebelum gateway reset separuh jalan.
                //   Fasa B (inter-chunk): sebaik token pertama tiba, timer bertukar
                //     kepada stallMs (longgar) yang di-RESET setiap chunk — aliran
                //     sihat-tapi-lambat (304s dengan chunk berkala) tidak di-abort.
                // 0 pada mana-mana had = fasa itu dilumpuhkan. settled guard
                // menghalang resolve/reject berganda.
                const firstByteMs = Number(this.firstByteTimeoutMs) || 0;
                const stallMs = Number(this.streamStallTimeoutMs) || 0;
                let settled = false;
                let firstChunkSeen = false;
                let stallTimer = null;
                const clearStallTimer = () => {
                    if (stallTimer) {
                        clearTimeout(stallTimer);
                        stallTimer = null;
                    }
                };
                const fireStall = (ms, phase) => {
                    if (settled) return;
                    settled = true;
                    log.warn(() => [
                        `[${this.providerName}] Stream ${phase} — no data for ${ms}ms, aborting for retry`
                    ]);
                    try {
                        response.data.destroy();
                    } catch (_) {
                        /* abaikan */
                    }
                    const err = new Error(`Stream ${phase}: no data received within ${ms}ms`);
                    err.code = 'ECONNABORTED';
                    err.streamStall = true;
                    reject(err);
                };
                const armStallTimer = () => {
                    clearStallTimer();
                    // Sebelum token pertama → had first-byte; selepas itu → had inter-chunk.
                    const ms = firstChunkSeen ? stallMs : firstByteMs;
                    if (ms <= 0) return; // fasa berkaitan dilumpuhkan
                    const phase = firstChunkSeen ? 'stalled' : 'first-byte timeout';
                    stallTimer = setTimeout(() => fireStall(ms, phase), ms);
                    if (typeof stallTimer.unref === 'function') stallTimer.unref();
                };
                const safeResolve = (value) => {
                    if (settled) return;
                    settled = true;
                    clearStallTimer();
                    resolve(value);
                };
                const safeReject = (err) => {
                    if (settled) return;
                    settled = true;
                    clearStallTimer();
                    reject(err);
                };

                const processPayload = (payloadStr) => {
                    if (!payloadStr || !payloadStr.trim()) return;
                    const cleaned = payloadStr.trim().startsWith('data:')
                        ? payloadStr.trim().slice(5).trim()
                        : payloadStr.trim();
                    if (!cleaned || cleaned === '[DONE]') return;

                    let data;
                    try {
                        data = JSON.parse(cleaned);
                    } catch (_) {
                        return;
                    }

                    if (isCfRun && (data.finished || data.done === true)) {
                        finishReason = finishReason || 'stop';
                    }

                    const choice = data?.choices?.[0];
                    if (choice?.finish_reason) {
                        finishReason = choice.finish_reason;
                    }

                    const chunkText = isCfRun ? this.extractCfChunkText(data) : this.extractChunkText(choice);

                    if (chunkText) {
                        aggregated += chunkText;
                        const cleanedAgg = this.cleanTranslatedSubtitle(aggregated);
                        if (cleanedAgg && typeof onPartial === 'function') {
                            try {
                                onPartial(cleanedAgg);
                            } catch (_) {}
                        }
                    }
                };

                // Lengan watchdog awal — menutup tetingkap first-byte (TTFT).
                armStallTimer();

                response.data.on('data', (chunk) => {
                    if (settled) return;
                    // Token pertama tiba → tukar fasa watchdog ke had inter-chunk
                    // (longgar) untuk baki aliran; sebelum ini had first-byte (ketat).
                    firstChunkSeen = true;
                    // Reset watchdog: chunk tiba → sambungan hidup semula.
                    armStallTimer();
                    try {
                        const str = chunk.toString('utf8');
                        rawStream += str;
                        buffer += str;
                        const parts = buffer.split(/\r?\n/);
                        buffer = parts.pop();
                        parts.forEach(processPayload);
                    } catch (err) {
                        log.warn(() => [`[${this.providerName}] Stream chunk processing failed:`, err.message]);
                    }
                });

                response.data.on('end', () => {
                    if (settled) return;
                    clearStallTimer();
                    try {
                        if (buffer && buffer.trim()) {
                            processPayload(buffer);
                        }

                        if (!aggregated && rawStream.trim()) {
                            const recovered = this.recoverStreamPayload(rawStream, isCfRun);
                            aggregated = recovered.text || aggregated;
                            finishReason = finishReason || recovered.finishReason;
                        }

                        const cleaned = this.cleanTranslatedSubtitle(aggregated);

                        if (!cleaned) {
                            if (finishReason === 'content_filter') {
                                const err = new Error('PROHIBITED_CONTENT: content_filter');
                                err.translationErrorType = 'PROHIBITED_CONTENT';
                                safeReject(err);
                                return;
                            }
                            safeReject(new Error('No content returned from stream'));
                            return;
                        }

                        safeResolve(cleaned);
                    } catch (err) {
                        safeReject(err);
                    }
                });

                response.data.on('error', (err) => safeReject(err));
            });
        };

        let lastError;
        let fallbackUsed = false;
        for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
            try {
                return await executeStream();
            } catch (error) {
                lastError = error;

                const status = error?.response?.status;
                const rawErr = String(
                    error?.response?.data?.error?.message || error?.response?.data?.message || error?.message || ''
                ).toLowerCase();

                const looksUnsupported =
                    status === 404 ||
                    status === 405 ||
                    status === 501 ||
                    (status === 400 &&
                        (rawErr.includes('stream') || rawErr.includes('sse') || rawErr.includes('event-stream'))) ||
                    (error.message && /stream/i.test(error.message));

                if (!fallbackUsed && looksUnsupported) {
                    fallbackUsed = true;
                    log.warn(() => [`[${this.providerName}] Streaming not supported, falling back to non-stream`]);
                    const full = await this.translateSubtitle(
                        subtitleContent,
                        sourceLanguage,
                        targetLanguage,
                        customPrompt,
                        requestOptions
                    );
                    if (typeof onPartial === 'function') {
                        try {
                            await onPartial(full);
                        } catch (_) {}
                    }
                    return full;
                }

                if (attempt < this.maxRetries) {
                    log.warn(() => [
                        `[${this.providerName}] Stream retry ${attempt + 1}/${this.maxRetries} after error:`,
                        error.message
                    ]);
                    // [PARITI-RETRY] Backoff 1:1 Gemini — inilah titik forensik 502
                    // rootsys.cloud (3 retry dalam 37ms); kini 3s/6s/12s jittered.
                    await sleepRetryBackoff(attempt, this.retryBackoffBaseMs);
                    continue;
                }
                handleTranslationError(error, this.providerName, { skipResponseData: true });
            }
        }

        if (lastError) throw lastError;
    }

    async countTokensForTranslation() {
        return null;
    }

    extractChunkText(choice) {
        if (!choice) return '';
        const delta = choice.delta || {};
        if (typeof delta.content === 'string') return delta.content;
        if (typeof delta.text === 'string') return delta.text;
        if (choice.message?.content && typeof choice.message.content === 'string') {
            return choice.message.content;
        }
        return '';
    }

    extractCfChunkText(payload) {
        if (!payload || typeof payload !== 'object') return '';
        if (typeof payload.response === 'string') return payload.response;
        if (payload.result) {
            if (typeof payload.result.response === 'string') return payload.result.response;
            if (typeof payload.result.output === 'string') return payload.result.output;
        }
        return '';
    }

    /**
     * Unthrottle Mandat §C (2026-09-26): Ekstraksi respons chat tahan lasak
     * bagi endpoint reasoning-models (GLM/Zhipu dsb.). Turutan fallback:
     *   1. choice.message.content            — jawapan akhir standard.
     *   2. choice.message.reasoning_content  — sesetengah endpoint menukar
     *      reasoning GLM kepada medan ini; JSON/fenced-block dibuang
     *      sebelum digunakan.
     *   3. Stringified message                — content mungkin berpagar
     *      markdown atau bertindih dalam medan lain; blok JSON/fenced pertama
     *      diekstrak dengan selamat.
     * @param {Object|undefined} message - choice.message payload
     * @returns {string} teks yang diekstrak ('' jika tiada)
     */
    extractChatMessageText(message) {
        if (!message || typeof message !== 'object') return '';

        // 1. Laluan standard: content
        const content = typeof message.content === 'string' ? message.content.trim() : '';
        if (content) return content;

        // 2. Reasoning-only endpoint: reasoning_content membawa jawapan
        const reasoning = typeof message.reasoning_content === 'string' ? message.reasoning_content.trim() : '';
        if (reasoning) {
            const extracted = this.extractStructuredBlock(reasoning);
            if (extracted) return extracted;
            return reasoning;
        }

        // 3. Fallback terakhir (Mandat §C): imbas rekursif nilai string mesej
        //    (RAW — bukan stringify, kerana stringify melepaskan braces dalam
        //    string dan memusnahkan struktur JSON terbenam) dan tarik blok
        //    JSON / fenced markdown pertama yang wujud dalam mana-mana medan.
        const stringValues = [];
        const collect = (obj, depth) => {
            if (!obj || typeof obj !== 'object' || depth > 3) return;
            for (const value of Object.values(obj)) {
                if (typeof value === 'string' && value.trim()) {
                    stringValues.push(value);
                } else if (value && typeof value === 'object') {
                    collect(value, depth + 1);
                }
            }
        };
        collect(message, 0);
        for (const raw of stringValues) {
            const extracted = this.extractStructuredBlock(raw);
            if (extracted) return extracted;
        }

        return '';
    }

    /**
     * Ekstrak blok berstruktur pertama daripada teks mentah: samaada blok
     * berpagar markdown (\x60\x60\x60 ... \x60\x60\x60) atau objek JSON
     * seimbang { ... }. Pulangkan kandungan dalamnya, dibersihkan.
     * @param {string} raw - teks mentah
     * @returns {string} blok yang diekstrak ('' jika tiada)
     */
    extractStructuredBlock(raw) {
        const text = String(raw || '');
        if (!text) return '';

        // Fenced markdown block (hex escapes — konvensyen projek)
        const fenceMatch = text.match(new RegExp('\\x60\\x60\\x60[a-z]*\\r?\\n?([\\s\\S]*?)\\x60\\x60\\x60', 'i'));
        if (fenceMatch && fenceMatch[1] && fenceMatch[1].trim()) {
            return fenceMatch[1].trim();
        }

        // JSON object seimbang pertama: scan dari '{' sehingga '}' dengan
        // pengiraan kedalaman (tahan string nested + braces dalam string).
        const start = text.indexOf('{');
        if (start === -1) return '';
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let i = start; i < text.length; i++) {
            const ch = text[i];
            if (escaped) {
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                if (inString) escaped = true;
                continue;
            }
            if (ch === '"') {
                inString = !inString;
                continue;
            }
            if (inString) continue;
            if (ch === '{') depth++;
            else if (ch === '}') {
                depth--;
                if (depth === 0) {
                    const candidate = text.slice(start, i + 1);
                    // Mesti nampak seperti objek JSON sebenar — bukan bracket dalam prosa
                    if (candidate.includes(':')) return candidate;
                    return '';
                }
            }
        }
        return '';
    }

    cleanTranslatedSubtitle(text) {
        let cleaned = String(text || '');
        cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
        cleaned = cleaned.replace(/<think>[\s\S]*$/gi, '');
        cleaned = cleaned.replace(/```[a-z]*\n?/gi, '').replace(/```/g, '');
        cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        return cleaned.trim();
    }

    extractResponsesText(payload) {
        if (!payload || typeof payload !== 'object') return '';
        const direct = payload.output_text;
        if (typeof direct === 'string' && direct.trim()) return direct;

        const output = Array.isArray(payload.output) ? payload.output : [];
        const collect = [];
        for (const item of output) {
            if (!item || !Array.isArray(item.content)) continue;
            for (const part of item.content) {
                if (!part) continue;
                if (typeof part === 'string') collect.push(part);
                else if (typeof part.text === 'string') collect.push(part.text);
                else if (typeof part.output_text === 'string') collect.push(part.output_text);
            }
        }
        return collect.join('');
    }

    recoverStreamPayload(rawStream, isCfRun = false) {
        const result = { text: '', finishReason: null, payloadCount: 0 };
        if (!rawStream || typeof rawStream !== 'string') return result;

        const processPayload = (payloadStr) => {
            if (!payloadStr) return;
            let data;
            try {
                data = JSON.parse(payloadStr);
            } catch (_) {
                return;
            }

            if (isCfRun) {
                const chunkText = this.extractCfChunkText(data);
                if (chunkText) result.text += chunkText;
                result.payloadCount += 1;
                return;
            }

            const choice = data?.choices?.[0];
            if (choice?.finish_reason && !result.finishReason) {
                result.finishReason = choice.finish_reason;
            }
            const chunkText = this.extractChunkText(choice);
            if (chunkText) result.text += chunkText;
            result.payloadCount += 1;
        };

        const blocks = rawStream.split(/\r?\n\r?\n/);
        for (const block of blocks) {
            const cleaned = block
                .split(/\r?\n/)
                .map((line) => line.replace(/^data:\s*/, '').trim())
                .filter(Boolean)
                .join('');
            processPayload(cleaned);
        }

        return result;
    }
}

module.exports = OpenAICompatibleProvider;
