/**
 * Shared Telegram FinOps Receipt Module
 * =====================================
 *
 * Single source of truth for the translation-cost receipt sent to Telegram.
 * Previously this logic (~300 lines) was duplicated between
 * src/handlers/subtitles.js and index.js, causing drift (e.g. finalUSD vs
 * totalUSD naming) and double-maintenance for pricing updates.
 *
 * Responsibilities:
 *  - Aggregate token usage from the global FinOps ledger (and drain it)
 *  - Match the used model to the pricing table (with Tier-2 long-context rates)
 *  - Fetch the live USD→MYR exchange rate (cached 15 min)
 *  - Fetch the CrazyRouter wallet balance (cached 5 min)
 *  - Compute retail/actual cost with the CrazyRouter 45% discount
 *  - Render the HTML cost section for the Telegram message
 *
 * Every helper is defensive: failures degrade to sensible fallbacks so a
 * notification is never lost because a side-lookup failed.
 */

const log = require('./logger');

// ── Pricing table (USD per 1M tokens) ────────────────────────────────────────
// Keep in sync with https://ai.google.dev/gemini-api/docs/pricing
const GEMINI_PRICING = {
    '3.8-flash': { input: 0.75, output: 3.75, cache: 0.075 },
    '3.7-flash': { input: 0.75, output: 3.75, cache: 0.075 },
    '3.6-flash': { input: 0.75, output: 3.75, cache: 0.075 },
    '3.5-flash': { input: 1.5, output: 9.0, cache: 0.15 },
    '3.5-flash-lite': { input: 0.3, output: 2.5, cache: 0.03 },
    '3.1-pro': { input: 2.0, output: 12.0, cache: 0.2, inputT2: 4.0, outputT2: 18.0, cacheT2: 0.4 },
    '3.1-flash-lite': { input: 0.25, output: 1.5, cache: 0.025 },
    '3-flash-preview': { input: 0.5, output: 3.0, cache: 0.05 },
    '2.5-pro': { input: 1.25, output: 10.0, cache: 0.125, inputT2: 2.5, outputT2: 15.0, cacheT2: 0.25 },
    '2.5-flash': { input: 0.3, output: 2.5, cache: 0.03 },
    '2.5-flash-lite': { input: 0.1, output: 0.4, cache: 0.01 },
    'gemma-4': { input: 0, output: 0, cache: 0 }
};

// ── [A2 FIX 2026-11-14] Non-Gemini official provider pricing (USD / 1M) ──────
// Ground truth: plans/provider-pricing-ground-truth-2026.md (official pages,
// collected 2026-11-14). Semantics per Owner decision: Retail Value estimated
// at the model's OFFICIAL provider rates, door-agnostic (same principle as
// CrazyRouter using official Gemini rates). DeepSeek = peak rates (conservative
// ceiling; off-peak is half). Unlisted models (rootsys -mod variants, hy3,
// ...) return null → the receipt renders an explicit "unpriced model" N/A
// instead of silently falling back to Gemini flash-lite rates.
const PROVIDER_PRICING = {
    // DeepSeek (api-docs.deepseek.com) — peak, cache-hit under `cache`
    'deepseek-v4-pro': { input: 1.32, output: 3.96, cache: 0.044 },
    'deepseek-flash': { input: 0.3, output: 1.2, cache: 0.006 },
    'deepseek-v4.1-flash': { input: 0.3, output: 1.2, cache: 0.006 },
    // Moonshot / Kimi (platform.kimi.ai) — cache-read under `cache`
    'kimi-k3': { input: 2.0, output: 10.0, cache: 0.2 },
    'kimi-k3.1-pro': { input: 3.0, output: 15.0, cache: 0.3 },
    'kimi-k3.1-pro-highspeed': { input: 4.0, output: 20.0, cache: 0.4 },
    'kimi-k2.6': { input: 0.95, output: 4.0, cache: 0.095 },
    'kimi-k2.7-code': { input: 0.95, output: 4.0, cache: 0.095 },
    // Z.ai / GLM (z.ai/model-api)
    'glm-5.3': { input: 1.4, output: 4.4, cache: 0.26 },
    'glm-5.3-flashx': { input: 0.37, output: 1.25, cache: 0.075 },
    'glm-5.3-flash': { input: 0.37, output: 1.25, cache: 0.075 },
    // OpenAI (developers.openai.com) — standard speed, short context
    'gpt-6-astra': { input: 10.0, output: 50.0, cache: 1.0 },
    'gpt-6.1-sol': { input: 2.0, output: 10.0, cache: 0.1 },
    'gpt-6.1-terra': { input: 1.0, output: 5.0, cache: 0.05 },
    'gpt-6-luna': { input: 0.1, output: 0.5, cache: 0.01 },
    'gpt-6-sol': { input: 2.0, output: 10.0, cache: 0.2 },
    'gpt-5.6-sol': { input: 4.0, output: 20.0, cache: 0.4 },
    'gpt-5.6-terra': { input: 2.0, output: 12.0, cache: 0.2 },
    'gpt-5.6-luna': { input: 0.2, output: 1.2, cache: 0.02 },
    'gpt-5.5': { input: 5.0, output: 30.0, cache: 0.5 },
    'gpt-5.4': { input: 2.5, output: 15.0, cache: 0.25 },
    'gpt-5.4-mini': { input: 0.75, output: 4.5, cache: 0.075 },
    // Anthropic (platform.claude.com) — cache-read under `cache`
    'claude-fable-5.2': { input: 8.0, output: 40.0, cache: 0.2 },
    'claude-opus-5.5': { input: 4.0, output: 20.0, cache: 0.2 },
    'claude-opus-5': { input: 5.0, output: 25.0, cache: 0.5 },
    'claude-sonnet-5.5': { input: 2.0, output: 10.0, cache: 0.1 },
    'claude-sonnet-5': { input: 2.0, output: 10.0, cache: 0.2 },
    'claude-sonnet-4.6': { input: 3.0, output: 15.0, cache: 0.3 },
    'claude-haiku-5.5': { input: 0.1, output: 0.5, cache: 0.01 },
    'claude-haiku-4.5': { input: 1.0, output: 5.0, cache: 0.1 }
};

const DEFAULT_PRICING_KEY = '3.5-flash-lite';
const TIER2_PROMPT_THRESHOLD = 200000; // tokens — long-context pricing kicks in
const CRAZYROUTER_DISCOUNT = 0.55; // pay 55% of retail via CrazyRouter proxy
const CRAZYROUTER_QUOTA_PER_USD = 500000; // internal quota-to-USD divisor
const FALLBACK_USD_MYR = 4.4;

// ── Small in-memory caches for external lookups ─────────────────────────────
let exchangeRateCache = { value: null, fetchedAt: 0 };
let walletCache = { value: null, fetchedAt: 0 };
const EXCHANGE_RATE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const WALLET_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Look up pricing rates for a model, including Tier-2 long-context rates for
 * pro models when the prompt exceeded the threshold.
 * @param {string} usedModel - model identifier (lower-cased internally)
 * @param {number} totalPromptSize - input + cached tokens for tier detection
 * @returns {{input: number, output: number, cache: number}}
 */
function resolvePricing(usedModel, totalPromptSize) {
    const model = String(usedModel || '').toLowerCase();

    // [A2 2026-11-14] Exact-name routing for non-Gemini provider models first
    // (the gateway serves exact ids like `deepseek-v4-pro`; aliasing e.g.
    // kimi-k3 → kimi-k3-1 happens server-side, so the REQUESTED name is the
    // stable key). Unknown non-Gemini models → null (explicit "unpriced"
    // receipt) — never a silent Gemini-rate fallback.
    if (PROVIDER_PRICING[model]) {
        const p = PROVIDER_PRICING[model];
        return { input: p.input, output: p.output, cache: p.cache };
    }

    // Gemini family (historical substring routing, Tier-2 aware).
    // Order matters: check the most specific keys first.
    const checks = [
        ['3.8-flash', '3.8-flash'],
        ['3.7-flash', '3.7-flash'],
        ['3.6-flash', '3.6-flash'],
        ['3.5-flash-lite', '3.5-flash-lite'],
        ['3.5-flash', '3.5-flash'],
        ['3.1-pro', '3.1-pro'],
        ['3.1-flash-lite', '3.1-flash-lite'],
        ['3-flash-preview', '3-flash-preview'],
        ['3-flash', '3-flash-preview'],
        ['2.5-pro', '2.5-pro'],
        ['2.5-flash-lite', '2.5-flash-lite'],
        ['2.5-flash', '2.5-flash'],
        ['gemma-4', 'gemma-4'],
        ['gemma', 'gemma-4'] // all Gemma is free-tier
    ];

    for (const [needle, key] of checks) {
        if (model.includes(needle)) {
            const entry = GEMINI_PRICING[key];
            const isT2 = totalPromptSize > TIER2_PROMPT_THRESHOLD;
            if (isT2 && entry.inputT2 !== undefined) {
                return { input: entry.inputT2, output: entry.outputT2, cache: entry.cacheT2 };
            }
            return { input: entry.input, output: entry.output, cache: entry.cache };
        }
    }

    // [A2 2026-11-14] Only models that are recognizably Gemini/Gemma keep the
    // legacy flash-lite fallback (future Gemini names must stay priced);
    // every other unknown model is honestly unpriced (N/A receipt) — never
    // silently billed at Gemini rates.
    if (/gemini|gemma/.test(model)) {
        const fallback = GEMINI_PRICING[DEFAULT_PRICING_KEY];
        return { input: fallback.input, output: fallback.output, cache: fallback.cache };
    }
    return null;
}

/**
 * Fetch the live USD→MYR exchange rate, cached for 15 minutes.
 * @returns {Promise<{rate: number, indicator: string}>}
 */
async function fetchExchangeRate() {
    const now = Date.now();
    if (exchangeRateCache.value !== null && now - exchangeRateCache.fetchedAt < EXCHANGE_RATE_TTL_MS) {
        return exchangeRateCache.value;
    }

    try {
        const axios = require('axios');
        const exResponse = await axios.get('https://open.er-api.com/v6/latest/USD', { timeout: 3000 });
        if (exResponse.data?.rates?.MYR) {
            const rate = exResponse.data.rates.MYR;
            const result = { rate, indicator: `📈 Live RM${rate.toFixed(2)}` };
            exchangeRateCache = { value: result, fetchedAt: now };
            return result;
        }
    } catch (err) {
        log.debug(() => `[FinOps] Live exchange rate unavailable, using fallback: ${err.message}`);
    }

    const result = { rate: FALLBACK_USD_MYR, indicator: '🔒 Fixed Rate' };
    // Negative-cache the fallback briefly so a slow API doesn't get hammered
    // on every translation while it is down.
    exchangeRateCache = { value: result, fetchedAt: now - EXCHANGE_RATE_TTL_MS + 60 * 1000 };
    return result;
}

/**
 * Fetch the CrazyRouter wallet balance in USD, cached for 5 minutes.
 * @returns {Promise<number|null>} balance in USD, or null when unavailable
 */
async function fetchCrazyRouterWalletUSD() {
    const now = Date.now();
    if (walletCache.value !== null && now - walletCache.fetchedAt < WALLET_TTL_MS) {
        return walletCache.value;
    }

    if (!process.env.CRAZYROUTER_ACCESS_TOKEN || !process.env.CRAZYROUTER_USER_ID) {
        return null;
    }

    try {
        const axios = require('axios');
        const walletRes = await axios.get('https://crazyrouter.com/api/user/self', {
            headers: {
                Authorization: `Bearer ${process.env.CRAZYROUTER_ACCESS_TOKEN}`,
                'New-Api-User': process.env.CRAZYROUTER_USER_ID
            },
            timeout: 5000
        });
        if (walletRes?.data?.success && walletRes?.data?.data) {
            const quota = walletRes.data.data.quota || 0;
            const balanceUSD = quota / CRAZYROUTER_QUOTA_PER_USD;
            walletCache = { value: balanceUSD, fetchedAt: now };
            return balanceUSD;
        }
    } catch (err) {
        log.debug(() => `[FinOps] CrazyRouter wallet lookup failed: ${err.message}`);
    }

    // Negative-cache briefly on failure
    walletCache = { value: null, fetchedAt: now - WALLET_TTL_MS + 60 * 1000 };
    return null;
}

/**
 * Drain the global FinOps ledger: sum all recorded streams and reset it.
 * The ledger is written by GeminiService.updateUsageStats() for every API
 * attempt — successful, blocked or retried alike — so this total reflects
 * the true billed token consumption.
 *
 * Streams flagged `wasted` by TranslationEngine._markAttemptWasted() are
 * summed separately so the Telegram receipt can split billed tokens into
 * effective (produced output) vs wasted (burned by failed retries).
 * @returns {{inputTokens: number, cachedTokens: number, thoughtTokens: number,
 *            baseOutputTokens: number, wastedTokens: number}}
 */
function drainFinOpsLedger() {
    let inputTokens = 0;
    let cachedTokens = 0;
    let thoughtTokens = 0;
    let baseOutputTokens = 0;
    let wastedTokens = 0;

    const ledger = global.geminiFinOps || { streams: {} };
    for (const streamId in ledger.streams) {
        const batch = ledger.streams[streamId];
        const inp = batch.input || 0;
        const cac = batch.cached || 0;
        const tho = batch.thought || 0;
        const out = batch.output || 0;

        inputTokens += inp;
        cachedTokens += cac;
        thoughtTokens += tho;
        baseOutputTokens += out;

        if (batch.wasted) {
            wastedTokens += inp + cac + tho + out;
        }
    }

    // Reset for the next translation job
    global.geminiFinOps = { streams: {} };

    return { inputTokens, cachedTokens, thoughtTokens, baseOutputTokens, wastedTokens };
}

/**
 * Resolve the active translation credential without mixing the official Gemini
 * pool with a custom provider. Crazy Router custom slots may use either the
 * OpenAI-compatible or Gemini-native door, so the active base URL—not the door
 * or an unrelated Gemini key—determines the billing route.
 *
 * @param {object} config normalized user configuration
 * @param {string} providerName provider selected by translationProviderFactory
 * @param {string} selectedGeminiKey key selected for the official Gemini path
 * @returns {{isCrazyRouter: boolean, activeApiKey: string}}
 */
function resolveActiveFinOpsRoute(config, providerName, selectedGeminiKey = '') {
    const normalizedProvider = String(providerName || 'gemini').toLowerCase();
    if (normalizedProvider === 'custom' || normalizedProvider === 'custom_secondary') {
        const customConfig = config?.providers?.[normalizedProvider] || {};
        const activeApiKey = String(customConfig.apiKey || '').trim();
        let hostname = '';
        try {
            hostname = new URL(String(customConfig.baseUrl || '').trim()).hostname.toLowerCase();
        } catch (_) {
            // Invalid/missing custom URL cannot be identified as Crazy Router.
        }
        return {
            isCrazyRouter: hostname === 'crazyrouter.com' || hostname.endsWith('.crazyrouter.com'),
            activeApiKey
        };
    }

    return {
        isCrazyRouter: normalizedProvider === 'gemini' && String(selectedGeminiKey).trim().startsWith('sk-'),
        activeApiKey: String(selectedGeminiKey || '').trim()
    };
}

/**
 * Build the 💰 cost section HTML for the Telegram receipt.
 *
 * @param {object} params
 * @param {string} params.usedModel - model actually used for translation
 * @param {boolean} params.isCrazyRouter - true when the active key is a CrazyRouter `sk-` proxy key
 * @returns {Promise<{costSection: string, finalUSD: number, retailUSD: number,
 *                    walletBalanceUSD: number|null}>}
 */
async function buildCostSection({
    usedModel,
    isCrazyRouter,
    walletFetcher = fetchCrazyRouterWalletUSD,
    exchangeRateFetcher = fetchExchangeRate
}) {
    // 1. Aggregate all token usage recorded during this translation
    const { inputTokens, cachedTokens, thoughtTokens, baseOutputTokens, wastedTokens } = drainFinOpsLedger();

    const outputTokens = baseOutputTokens + thoughtTokens; // thought billed as output
    const totalPromptSize = inputTokens + cachedTokens;
    const totalTokens = totalPromptSize + outputTokens;
    const effectiveTokens = totalTokens - wastedTokens;

    // 2. Resolve per-token pricing for this model (incl. Tier-2 long context).
    // [A2 2026-11-14] Unpriced non-Gemini models resolve to null → render an
    // explicit N/A receipt instead of invented dollars.
    const rates = resolvePricing(usedModel, totalPromptSize);
    const unpriced = rates === null;

    // 3. Live exchange rate (cached)
    const { rate: kadarTukaranMYR, indicator: rateIndicator } = await exchangeRateFetcher();

    // 4. Cost math (skipped for unpriced models)
    let retailUSD = 0;
    let finalUSD = 0;
    let totalMYR = 0;
    let retailMYR = 0;
    if (!unpriced) {
        const costInput = (inputTokens / 1000000) * rates.input;
        const costCache = (cachedTokens / 1000000) * rates.cache;
        const costOutput = (outputTokens / 1000000) * rates.output;
        retailUSD = costInput + costCache + costOutput;
        finalUSD = isCrazyRouter ? retailUSD * CRAZYROUTER_DISCOUNT : retailUSD;
        totalMYR = finalUSD * kadarTukaranMYR;
        retailMYR = retailUSD * kadarTukaranMYR;
    }

    // 5. Wallet balance (cached; only for CrazyRouter)
    let walletBalanceUSD = null;
    if (isCrazyRouter) {
        walletBalanceUSD = await walletFetcher();
    }

    // 6. Render
    const fmt = (num) => (num || 0).toLocaleString();
    let cleanModelName = String(usedModel || '')
        .replace('gemini-', '')
        .replace('-preview', '');
    if (totalPromptSize > TIER2_PROMPT_THRESHOLD && String(usedModel).includes('pro')) {
        cleanModelName += ' (Tier 2)';
    }

    let tokenBreakdown = `  ├ <b>Input:</b> ${fmt(inputTokens)}`;
    if (cachedTokens > 0) {
        tokenBreakdown += ` <i>(Cached: ${fmt(cachedTokens)})</i>`;
    }
    tokenBreakdown += `\n`;
    if (thoughtTokens > 0) {
        tokenBreakdown += `  ├ <b>Thought:</b> ${fmt(thoughtTokens)}\n`;
    }
    tokenBreakdown +=
        `  ├ <b>Output:</b> ${fmt(baseOutputTokens)}\n` + `  ├ <b>Total Billed:</b> ±${fmt(totalTokens)} tokens\n`;
    if (wastedTokens > 0) {
        tokenBreakdown += `  │   ├ ✅ <b>Effective:</b> ${fmt(effectiveTokens)}\n`;
        tokenBreakdown += `  │   └ 🔥 <b>Wasted (retries):</b> ${fmt(wastedTokens)} ⚠️\n`;
    }

    const walletSection =
        walletBalanceUSD !== null
            ? `  └ <b>Wallet Balance:</b> RM ${(walletBalanceUSD * kadarTukaranMYR).toFixed(2)} ($${walletBalanceUSD.toFixed(2)}) 💳\n`
            : '';

    let costSection = `\n💰 <b>API Cost Estimate (${cleanModelName}):</b>\n` + tokenBreakdown;

    if (unpriced) {
        // [A2 2026-11-14] Honest N/A: token counts above are real; the model
        // has no official rate on file (e.g. rootsys -mod variants), so no
        // dollar figure is invented. finalUSD=null signals callers (cost-per-
        // entry line renders $0-equivalent N/A) that no price exists.
        costSection += `  └ <b>Retail Value:</b> N/A (unpriced model — no official rate on file)\n`;
    } else if (isCrazyRouter) {
        costSection +=
            `  ├ <b>Retail Price:</b> $${retailUSD.toFixed(5)} (RM ${retailMYR.toFixed(4)})\n` +
            `  ├ <b>Discount:</b> 45% (CrazyRouter Proxy) 📉\n`;
        if (walletSection) {
            costSection +=
                `  ├ <b>Actual Cost:</b> $${finalUSD.toFixed(2)} (RM ${totalMYR.toFixed(2)} | <i>${rateIndicator}</i>)\n` +
                walletSection;
        } else {
            costSection += `  └ <b>Actual Cost:</b> $${finalUSD.toFixed(2)} (RM ${totalMYR.toFixed(2)} | <i>${rateIndicator}</i>)\n`;
        }
    } else {
        costSection += `  └ <b>Retail Value:</b> $${finalUSD.toFixed(2)} (RM ${totalMYR.toFixed(2)} | <i>${rateIndicator}</i>)\n`;
    }

    return { costSection, finalUSD: unpriced ? null : finalUSD, retailUSD, walletBalanceUSD };
}

/**
 * Render the 🚨 incident-report section for the Telegram receipt.
 * Only rendered when at least one recovery incident was recorded.
 *
 * @param {Array<{type: string, batch: number, recovery: string, outcome: string, tokensBurned?: number}>} incidents
 * @param {number} rateUSD_MYR - live exchange rate for token-burn cost estimates
 * @returns {string} HTML section (may be empty)
 */
function renderIncidentSection(incidents, rateUSD_MYR = FALLBACK_USD_MYR) {
    if (!Array.isArray(incidents) || incidents.length === 0) return '';

    const ICONS = {
        PROHIBITED_CONTENT: '⛔',
        MAX_TOKENS: '⏳',
        '429_RATE_LIMIT': '⏳',
        MISMATCH_RETRY: '💥',
        EMPTY_STREAM: '🌫️'
    };
    const OUTCOME_LABELS = {
        recovered: '✅ recovered',
        recovered_partial: '🟡 partially recovered',
        fallback: '🛟 fallback provider',
        failed: '❌ not recovered',
        // [MONKEY-H4 2026-11-15] Taksonomi tertutup dipetakan kepada label
        // manusia — string dalaman tidak lagi bocor ke resit Telegram, dan
        // insiden in_progress TIDAK lagi dipaparkan palsu sebagai 'recovered'
        // (kejujuran telemetri; laluan D1 menjamin insiden ditutup sebelum
        // laporan dihantar, jadi in_progress di sini hanyalah sisa
        // pra-penutupan yang dilabel jujur).
        unrecovered: '❌ not recovered',
        failed_structural: '❌ not recovered (structural mismatch)',
        'unsalvageable — best result kept': '🟡 best result kept',
        'unsalvageable — structural mismatch on retry': '❌ retry discarded (structural mismatch)',
        'retry failed — original kept': '❌ not recovered (retry failed)',
        in_progress: '⏳ still closing…'
    };

    let section = `\n🚨 <b>Incident Report</b> — ${incidents.length} ${incidents.length === 1 ? 'recovery' : 'recoveries'}:\n`;
    for (const inc of incidents) {
        const icon = ICONS[inc.type] || '⚠️';
        section += `${icon} <b>${inc.type}</b> @ batch ${inc.batch}\n`;
        section += `  ├ <i>${inc.recovery}</i>\n`;
        if (inc.tokensBurned > 0) {
            const costUSD = (inc.tokensBurned / 1000000) * 0.5; // rough estimate at mid-tier rates
            section += `  ├ 🔥 Burned: ${inc.tokensBurned.toLocaleString()} tokens (~$${costUSD.toFixed(4)})\n`;
        }
        const outcome = OUTCOME_LABELS[inc.outcome] || inc.outcome;
        section += `  └ ${outcome}\n`;
    }
    return section;
}

/**
 * Resolve the registry metadata (API keys, model, wallet USD) attached to a
 * completed-translation Telegram report.
 *
 * [v3.41.3 — KUNCI no-undef] Sebelum ini, logik yang sama disalin ke dalam
 * index.js (xEmbed) dan src/handlers/subtitles.js (terjemahan biasa) sebagai
 * rantaian `typeof nama !== 'undefined'`. Kedua-dua salinan merujuk nama yang
 * TIDAK wujud dalam skop masing-masing (config, userConfig, message, ...) dan
 * menyembunyikannya dengan `typeof`. Rantaian itu kini digantikan oleh fungsi
 * tulen ini: setiap sumber ialah SIFAT objek argumen, jadi tiada nama yang
 * tidak diisytiharkan dirujuk langsung.
 *
 * Kontrak tingkah laku (dipeterai oleh ND-5):
 *  - Sumber yang tiada mesti kekal `undefined` — bukan null, bukan [].
 *  - Urutan keutamaan tidak berubah (lihat setiap langkah di bawah).
 *  - Fungsi ini TULEN: tiada kesan sampingan, tiada bacaan global.
 *
 * @param {object} sources setiap kunci ialah nama yang "mungkin wujud" dalam
 *   skop pemanggil. Pemanggil yang tidak mempunyai sesebuah sumber cuma
 *   jangan hantar kunci itu.
 * @returns {{detectedKeys: Array, detectedModel: string, detectedWalletUSD: number}}
 */
function resolveTelegramRegistryMeta(sources = {}) {
    const pick = (key) => (Object.prototype.hasOwnProperty.call(sources, key) ? sources[key] : undefined);
    const keyList = (value) => {
        if (Array.isArray(value)) return value;
        return undefined;
    };

    // ── Kunci API (urutan asal dikekalkan) ──────────────────────────────────
    let detectedKeys = [];
    const activeApiKey = pick('activeApiKey');
    if (activeApiKey) {
        detectedKeys = [activeApiKey];
    }

    // config → userConfig → geminiApiKeys / geminiApiKey / apiKey
    for (const name of ['config', 'userConfig']) {
        if (detectedKeys.length > 0) break;
        const candidate = pick(name);
        if (candidate === undefined) continue;
        const list = keyList(candidate?.geminiApiKeys);
        if (list) detectedKeys = list;
        else if (candidate?.geminiApiKey) detectedKeys = [candidate.geminiApiKey];
        else if (candidate?.apiKey) detectedKeys = [candidate.apiKey];
    }

    if (detectedKeys.length === 0) {
        const list = keyList(pick('geminiApiKeys'));
        if (list) detectedKeys = list;
        else if (pick('geminiApiKey')) detectedKeys = [pick('geminiApiKey')];
        else if (pick('apiKey')) detectedKeys = [pick('apiKey')];
    }

    // ── Model (Sumber A → B → C → lalai) ────────────────────────────────────
    let detectedModel = '';

    // Sumber A: enjin terjemahan yang sedang berjalan.
    // Tingkah laku asal: `typeof x !== 'undefined' && x?.model` — iaitu
    // "bukan undefined DAN bukan null DAN ada model".
    const translationEngine = pick('translationEngine');
    if (translationEngine !== undefined && translationEngine?.model) {
        detectedModel = translationEngine.model;
    } else {
        const geminiService = pick('geminiService');
        if (geminiService !== undefined && geminiService?.model) {
            detectedModel = geminiService.model;
        }
    }

    // Sumber B: objek konfigurasi pengguna.
    for (const name of ['config', 'userConfig']) {
        if (detectedModel) break;
        const candidate = pick(name);
        if (candidate === undefined) continue;
        detectedModel = candidate?.advancedSettings?.geminiModel || candidate?.geminiModel;
    }

    // Sumber C: imbas regex daripada sebarang teks laporan yang wujud.
    // KEANEHAN DIPETERAI (lihat ND-5b): laporan sebenar ialah
    // `🧠 <b>Engine:</b> <model>`, dan `[^\w]*` melangkau `</b>` lalu
    // menangkap huruf "b" — bukan nama model. Dikekalkan sepenuhnya kerana
    // mandat ialah tingkah laku TIDAK berubah.
    if (!detectedModel) {
        const candidateTexts = [
            pick('teleMsg'),
            pick('telegramMessage'),
            pick('message'),
            pick('caption'),
            pick('text'),
            pick('walletSection')
        ]
            .map((value) => (value === undefined ? '' : value))
            .join('\n');

        const engineMatch = candidateTexts.match(/Engine:[^\w]*([a-zA-Z0-9._-]+)/i);
        if (engineMatch && engineMatch[1]) {
            detectedModel = engineMatch[1];
        }
    }

    if (!detectedModel) {
        detectedModel = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
    }

    // ── Baki dompet USD ─────────────────────────────────────────────────────
    let detectedWalletUSD = 0;
    const allCandidateTexts = [pick('teleMsg'), pick('telegramMessage'), pick('message'), pick('walletSection')]
        .map((value) => (value === undefined ? '' : value))
        .join('\n');

    const walletMatch = allCandidateTexts.match(/Wallet Balance:[^\$]*\$([0-9.]+)/i);
    if (walletMatch && walletMatch[1]) {
        detectedWalletUSD = parseFloat(walletMatch[1]);
    }

    return { detectedKeys, detectedModel, detectedWalletUSD };
}

module.exports = {
    GEMINI_PRICING,
    resolvePricing,
    resolveActiveFinOpsRoute,
    fetchExchangeRate,
    fetchCrazyRouterWalletUSD,
    drainFinOpsLedger,
    buildCostSection,
    renderIncidentSection,
    resolveTelegramRegistryMeta
};
