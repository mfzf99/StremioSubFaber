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
  '3.5-flash': { input: 1.50, output: 9.00, cache: 0.15 },
  '3.5-flash-lite': { input: 0.30, output: 2.50, cache: 0.03 },
  '3.1-pro': { input: 2.00, output: 12.00, cache: 0.20, inputT2: 4.00, outputT2: 18.00, cacheT2: 0.40 },
  '3.1-flash-lite': { input: 0.25, output: 1.50, cache: 0.025 },
  '3-flash-preview': { input: 0.50, output: 3.00, cache: 0.05 },
  '2.5-pro': { input: 1.25, output: 10.00, cache: 0.125, inputT2: 2.50, outputT2: 15.00, cacheT2: 0.25 },
  '2.5-flash': { input: 0.30, output: 2.50, cache: 0.03 },
  '2.5-flash-lite': { input: 0.10, output: 0.40, cache: 0.01 },
  'gemma-4': { input: 0, output: 0, cache: 0 }
};

const DEFAULT_PRICING_KEY = '3.5-flash-lite';
const TIER2_PROMPT_THRESHOLD = 200000; // tokens — long-context pricing kicks in
const CRAZYROUTER_DISCOUNT = 0.55; // pay 55% of retail via CrazyRouter proxy
const CRAZYROUTER_QUOTA_PER_USD = 500000; // internal quota-to-USD divisor
const FALLBACK_USD_MYR = 4.40;

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

  const fallback = GEMINI_PRICING[DEFAULT_PRICING_KEY];
  return { input: fallback.input, output: fallback.output, cache: fallback.cache };
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
        'Authorization': `Bearer ${process.env.CRAZYROUTER_ACCESS_TOKEN}`,
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
 * Build the 💰 cost section HTML for the Telegram receipt.
 *
 * @param {object} params
 * @param {string} params.usedModel - model actually used for translation
 * @param {boolean} params.isCrazyRouter - true when the active key is a CrazyRouter `sk-` proxy key
 * @returns {Promise<{costSection: string, finalUSD: number, retailUSD: number,
 *                    walletBalanceUSD: number|null}>}
 */
async function buildCostSection({ usedModel, isCrazyRouter }) {
  // 1. Aggregate all token usage recorded during this translation
  const { inputTokens, cachedTokens, thoughtTokens, baseOutputTokens, wastedTokens } = drainFinOpsLedger();

  const outputTokens = baseOutputTokens + thoughtTokens; // thought billed as output
  const totalPromptSize = inputTokens + cachedTokens;
  const totalTokens = totalPromptSize + outputTokens;
  const effectiveTokens = totalTokens - wastedTokens;

  // 2. Resolve per-token pricing for this model (incl. Tier-2 long context)
  const { input: rateInput, output: rateOutput, cache: rateCache } = resolvePricing(usedModel, totalPromptSize);

  // 3. Live exchange rate (cached)
  const { rate: kadarTukaranMYR, indicator: rateIndicator } = await fetchExchangeRate();

  // 4. Cost math
  const costInput = (inputTokens / 1000000) * rateInput;
  const costCache = (cachedTokens / 1000000) * rateCache;
  const costOutput = (outputTokens / 1000000) * rateOutput;
  const retailUSD = costInput + costCache + costOutput;
  const finalUSD = isCrazyRouter ? retailUSD * CRAZYROUTER_DISCOUNT : retailUSD;

  const totalMYR = finalUSD * kadarTukaranMYR;
  const retailMYR = retailUSD * kadarTukaranMYR;

  // 5. Wallet balance (cached; only for CrazyRouter)
  let walletBalanceUSD = null;
  if (isCrazyRouter) {
    walletBalanceUSD = await fetchCrazyRouterWalletUSD();
  }

  // 6. Render
  const fmt = (num) => (num || 0).toLocaleString();
  let cleanModelName = String(usedModel || '').replace('gemini-', '').replace('-preview', '');
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
  tokenBreakdown += `  ├ <b>Output:</b> ${fmt(baseOutputTokens)}\n` +
                    `  ├ <b>Total Billed:</b> ±${fmt(totalTokens)} tokens\n`;
  if (wastedTokens > 0) {
    tokenBreakdown += `  │   ├ ✅ <b>Effective:</b> ${fmt(effectiveTokens)}\n`;
    tokenBreakdown += `  │   └ 🔥 <b>Wasted (retries):</b> ${fmt(wastedTokens)} ⚠️\n`;
  }

  const walletSection = walletBalanceUSD !== null
    ? `  └ <b>Wallet Balance:</b> RM ${(walletBalanceUSD * kadarTukaranMYR).toFixed(2)} ($${walletBalanceUSD.toFixed(2)}) 💳\n`
    : '';

  let costSection = `\n💰 <b>API Cost Estimate (${cleanModelName}):</b>\n` + tokenBreakdown;

  if (isCrazyRouter) {
    costSection += `  ├ <b>Retail Price:</b> $${retailUSD.toFixed(5)} (RM ${retailMYR.toFixed(4)})\n` +
                   `  ├ <b>Discount:</b> 45% (CrazyRouter Proxy) 📉\n`;
    if (walletSection) {
      costSection += `  ├ <b>Actual Cost:</b> $${finalUSD.toFixed(2)} (RM ${totalMYR.toFixed(2)} | <i>${rateIndicator}</i>)\n` + walletSection;
    } else {
      costSection += `  └ <b>Actual Cost:</b> $${finalUSD.toFixed(2)} (RM ${totalMYR.toFixed(2)} | <i>${rateIndicator}</i>)\n`;
    }
  } else {
    costSection += `  └ <b>Retail Value:</b> $${finalUSD.toFixed(2)} (RM ${totalMYR.toFixed(2)} | <i>${rateIndicator}</i>)\n`;
  }

  return { costSection, finalUSD, retailUSD, walletBalanceUSD };
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
    'PROHIBITED_CONTENT': '⛔',
    'MAX_TOKENS': '⏳',
    '429_RATE_LIMIT': '⏳',
    'MISMATCH_RETRY': '💥',
    'EMPTY_STREAM': '🌫️'
  };
  const OUTCOME_LABELS = {
    recovered: '✅ recovered',
    recovered_partial: '🟡 partially recovered',
    fallback: '🛟 fallback provider',
    failed: '❌ not recovered',
    in_progress: '✅ recovered'
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

module.exports = {
  GEMINI_PRICING,
  resolvePricing,
  fetchExchangeRate,
  fetchCrazyRouterWalletUSD,
  drainFinOpsLedger,
  buildCostSection,
  renderIncidentSection
};
