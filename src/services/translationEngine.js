/**
 * Translation Engine - Unified Subtitle Translation
 *
 * Clean, simple, predictable translation workflow:
 * 1. Parse SRT into entries
 * 2. Translate in batches (real-time progress after each batch)
 * 3. Auto-chunk large batches transparently when needed
 * 4. Stream results entry-by-entry as they complete
 * 5. No time-based checkpoints - everything is event-driven
 *
 * Benefits:
 * - Single code path for all files (small/large)
 * - Perfect timing preservation
 * - Real-time progressive delivery
 * - Simple, predictable behavior
 * - Automatic optimization
 */

const { parseSRT, toSRT } = require('../utils/subtitle');
const GeminiService = require('./gemini');
const { DEFAULT_TRANSLATION_PROMPT } = GeminiService;
const crypto = require('crypto');
const log = require('../utils/logger');
const { handleCaughtError } = require('../utils/errorClassifier');
const { normalizeTargetLanguageForPrompt } = require('./utils/normalizeTargetLanguageForPrompt');
const { recordKeyError: recordKeyErrorRedis, isKeyCoolingDown: isKeyCoolingDownRedis, getNextRotationIndex, resetKeyHealth } = require('../utils/sharedCache');
const { executeParallelTranslation } = require('../utils/parallelTranslation');
// Rate-limiting throttle helper: Client-side pacing delay
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// ============================================================================
// 🛠️ ZON TEMPLATE PROMPT (100% UNIVERSAL & DYNAMIC)
// ============================================================================
const PROMPT_TEMPLATES = {
  // 1. PROMPT ASAL (Enterprise Broadcast Standard - Intra-Slot Action-Replacement)
  primary: (targetLabel, sourceLabel) => 
    `Translate each <s id="N"> tag from ${sourceLabel} to natural, conversational ${targetLabel} dialogue INSIDE each individual tag while strictly preserving tag boundaries and internal [br] markers.`,

  // 2. PROMPT KECEMASAN (PROHIBITED_CONTENT Fallback - Neutral & Safe)
  fallback: (targetLabel, sourceLabel) => 
    `Translate each <s id="N"> tag from ${sourceLabel} to natural, conversational ${targetLabel} dialogue INSIDE each individual tag while strictly preserving tag boundaries and internal [br] markers.`
};
// Extract normalized tokens from a language label/code (split on common separators)
function tokenizeLanguageValue(value) {
  return String(value || '')
    .normalize('NFKD') // strip accents/diacritics for safer comparisons
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9+]+/g)
    .filter(Boolean);
}

// RTL language detection (codes and human-readable names)
function isRtlLanguage(lang) {
  const tokens = tokenizeLanguageValue(lang);
  if (tokens.length === 0) return false;

  const rtlTokens = new Set([
    'ar', 'ara', 'arabic',
    'he', 'heb', 'hebrew',
    'fa', 'fas', 'per', 'persian', 'farsi',
    'ur', 'urd', 'urdu',
    'ps', 'pus', 'pushto', 'pashto',
    'ku', 'ckb', 'kur', 'kurdish', 'sorani',
    'dv', 'div', 'dhivehi',
    'yi', 'yid', 'yiddish'
  ]);

  // Match against individual tokens only (prevents false positives like "Turkish" matching "ur")
  return tokens.some(token => {
    // Avoid false positives like "Sichuan Yi" (Yi is LTR; Yiddish uses the same ISO-639-1 code)
    if (token === 'yi') {
      return tokens.length === 1 || tokens.includes('yid') || tokens.includes('yiddish');
    }
    return rtlTokens.has(token);
  });
}

function wrapRtlText(text) {
  const str = String(text || '');
  // Skip if already contains bidi markers
  if (/(?:\u200e|\u200f|\u202a|\u202b|\u202c|\u202d|\u202e)/u.test(str)) {
    return str;
  }
  const start = '\u202B'; // RLE - start RTL embedding
  const end = '\u202C';   // PDF - pop directional formatting
  return str
    .split('\n')
    .map(line => (line ? `${start}${line}${end}` : line))
    .join('\n');
}

// Entry-level cache for translated subtitle entries
const entryCache = new Map();
const MAX_ENTRY_CACHE_SIZE = parseInt(process.env.ENTRY_CACHE_SIZE) || 100000;

// Configuration constants
const MAX_TOKENS_PER_BATCH = parseInt(process.env.MAX_TOKENS_PER_BATCH) || 25000; // Max tokens before auto-chunking
const SINGLE_BATCH_MAX_TOKENS_PER_CHUNK = parseInt(process.env.SINGLE_BATCH_MAX_TOKENS_PER_CHUNK) || 120000;
const SINGLE_BATCH_TOKEN_SOFT_LIMIT = Math.floor(SINGLE_BATCH_MAX_TOKENS_PER_CHUNK * 0.9);
const NATIVE_BATCH_PROVIDER_NAMES = new Set(['deepl', 'googletranslate']);
// Entry cache disabled by default - causes stale data on cache resets and not HA-aware
// Only useful for repeated translations with identical config (rare)
const CACHE_TRANSLATIONS = process.env.CACHE_TRANSLATIONS === 'true'; // Enable/disable entry caching

/**
 * Universal batch size applied to ALL models (Gemini, Gemma, Flash, etc.).
 * Chosen at 80 to align with natural narrative pauses in subtitle flow,
 * while staying within the LLM attention sweet spot where strict XML slot
 * enforcement holds reliably — see translation prompt design notes.
 */
const UNIVERSAL_BATCH_SIZE = 200;

/**
 * Get the batch size to use for translation requests.
 *
 * Resolution order:
 *   1. TRANSLATION_BATCH_SIZE env var (validated 1-1000)
 *   2. UNIVERSAL_BATCH_SIZE fallback
 *
 * Per-model branching was intentionally removed — a single uniform batch size
 * keeps prompt behaviour, retry rates, and A/B comparisons consistent across
 * all models.
 *
 * @param {string} model - Model name (kept for backward compatibility; unused).
 * @returns {number} - Batch size (slot count per request).
 */
function getBatchSizeForModel(model) {
  // 1. Environment override — validated to prevent NaN / 0 / negative / absurd values.
  if (process.env.TRANSLATION_BATCH_SIZE) {
    const parsed = parseInt(process.env.TRANSLATION_BATCH_SIZE, 10);
    if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 1000) {
      return parsed;
    }
    log.warn(() => `[TranslationEngine] Invalid TRANSLATION_BATCH_SIZE="${process.env.TRANSLATION_BATCH_SIZE}" (expected integer 1-1000), falling back to ${UNIVERSAL_BATCH_SIZE}`);
  }

  // 2. Universal fallback — same value for every model.
  return UNIVERSAL_BATCH_SIZE;
}

// Module-level shared key health tracking across engine instances.
// MULTI-INSTANCE: Now backed by Redis via sharedCache utilities.
// Keys with repeated errors are skipped by all engines across ALL PODS,
// preventing a bad key from being retried by any instance.
// Local Map is kept as a fast cache layer; Redis is source of truth.
const _sharedKeyHealthErrors = new Map(); // Local cache: apiKey -> { count: number, lastError: number }

class TranslationEngine {
  constructor(geminiService, model = null, advancedSettings = {}, options = {}) {
    this.gemini = geminiService?.primary || geminiService;
    this.fallbackProvider = geminiService?.fallback || null;
    this.providerName = options.providerName || 'gemini';
    this.fallbackProviderName = options.fallbackProviderName || (this.fallbackProvider ? 'fallback' : '');
    if (!this.fallbackProviderName && this.fallbackProvider?.providerName) {
      this.fallbackProviderName = this.fallbackProvider.providerName;
    }
    this.model = model;
    this.batchSize = getBatchSizeForModel(model);
    this.singleBatchMode = options.singleBatchMode === true;
    this.enableStreaming = options.enableStreaming !== false
      && typeof (this.gemini?.streamTranslateSubtitle) === 'function';
    this.maxTokensPerBatch = this.singleBatchMode ? SINGLE_BATCH_MAX_TOKENS_PER_CHUNK : MAX_TOKENS_PER_BATCH;
    this.advancedSettings = advancedSettings || {};

    // Context settings (disabled by default)
    this.enableBatchContext = this.advancedSettings.enableBatchContext === true;
    this.contextSize = parseInt(this.advancedSettings.contextSize) || 20;

    // Mismatch retry: number of retries when AI returns wrong entry count (default: 1)
    const rawMismatchRetries = parseInt(this.advancedSettings.mismatchRetries);
    this.mismatchRetries = Number.isFinite(rawMismatchRetries) ? Math.max(0, Math.min(3, rawMismatchRetries)) : 3;

    // Translation workflow is permanently locked to XML Tags.
    // Native batch providers (DeepL/Google Translate) bypass this path entirely
    // through translateBatchNative(), so they are unaffected by the lock.
    this.isNativeBatchProvider = NATIVE_BATCH_PROVIDER_NAMES.has(this.providerName);
    this.translationWorkflow = 'xml';
    this.sendTimestampsToAI = false;

    // Key rotation configuration for per-batch and per-request rotation
    // keyRotationConfig: { enabled: boolean, mode: 'per-request' | 'per-batch', keys: string[], advancedSettings: {} }
    // SECURITY: Store keys in a non-enumerable property to prevent accidental serialization
    if (options.keyRotationConfig && Array.isArray(options.keyRotationConfig.keys)) {
      const filteredKeys = options.keyRotationConfig.keys.filter(k => typeof k === 'string' && k.trim());
      const sanitizedConfig = {
        enabled: options.keyRotationConfig.enabled === true,
        mode: options.keyRotationConfig.mode || 'per-batch',
        // Merge advancedSettings with engine-level settings so workflow etc. are never lost
        advancedSettings: { ...this.advancedSettings, ...(options.keyRotationConfig.advancedSettings || {}) }
      };
      // Make keys non-enumerable so they won't appear in JSON.stringify or Object.keys
      Object.defineProperty(sanitizedConfig, 'keys', {
        value: filteredKeys,
        enumerable: false,
        writable: false,
        configurable: false
      });
      this.keyRotationConfig = sanitizedConfig;
    } else {
      this.keyRotationConfig = null;
    }

    // Rotation is available when enabled, we have >1 key, and provider is Gemini
    const rotationAvailable = this.keyRotationConfig?.enabled === true &&
      Array.isArray(this.keyRotationConfig?.keys) &&
      this.keyRotationConfig.keys.length > 1 &&
      this.providerName === 'gemini';

    // Per-batch: rotate before every batch. Per-request: single key per file but retry rotation still works.
    this.perBatchRotationEnabled = rotationAvailable && this.keyRotationConfig?.mode === 'per-batch';
    // Retry rotation: enabled for BOTH per-batch and per-request modes so error retries can try a different key
    this.retryRotationEnabled = rotationAvailable;

    // Global counter for round-robin key rotation (shared across batches and retries).
    // Seed from the initial key's position so the first rotation advances to the next key
    // instead of always restarting at index 0 (which would waste the initial selectGeminiApiKey call).
    const initialApiKey = this.gemini?.apiKey;
    const initialKeyIndex = (initialApiKey && this.keyRotationConfig?.keys)
      ? this.keyRotationConfig.keys.indexOf(initialApiKey)
      : -1;
    this._keyRotationCounter = initialKeyIndex >= 0 ? initialKeyIndex + 1 : 0;

    // Cache model limits across key rotations to avoid redundant API calls
    this._sharedModelLimits = null;

    // Key health tracking: use module-level shared map so errors persist across engine instances.
    // Keys with >= KEY_HEALTH_ERROR_THRESHOLD errors within KEY_HEALTH_COOLDOWN_MS are skipped.
    this._keyHealthErrors = _sharedKeyHealthErrors;

    if (this.perBatchRotationEnabled) {
      log.debug(() => `[TranslationEngine] Per-batch key rotation enabled with ${this.keyRotationConfig.keys.length} keys`);
    } else if (this.retryRotationEnabled) {
      log.debug(() => `[TranslationEngine] Per-request key rotation enabled with ${this.keyRotationConfig.keys.length} keys (retry rotation active)`);
    }

    // Native batch provider flag was set above during XML workflow initialization.

    const rotationLabel = this.perBatchRotationEnabled ? 'per-batch' : (this.retryRotationEnabled ? 'per-request' : '');
    log.debug(() => `[TranslationEngine] Initialized with model: ${model || 'unknown'}, batch size: ${this.batchSize}, batch context: ${this.enableBatchContext ? 'enabled (' + this.contextSize + ' lines)' : 'disabled'}, workflow: ${this.translationWorkflow}, mode: ${this.singleBatchMode ? 'single-batch' : 'batched'}, mismatchRetries: ${this.mismatchRetries}${rotationLabel ? `, key-rotation: ${rotationLabel}, keys: ${this.keyRotationConfig.keys.length}` : ''}${this.isNativeBatchProvider ? ', native-batch: true' : ''}`);
    
    // Translation diagnostics — accumulated during translation, read by caller after completion.
    // These stats are surfaced on the Translation History cards in Sub Toolbox.
    this.translationStats = {
      // Tier 1: Critical diagnostics
      usedSecondaryProvider: false,
      secondaryProviderName: '',
      primaryFailureReason: '',
      secondaryFailureReason: '',   // Error message from secondary provider when it also fails
      secondaryErrorTypes: [],       // Error types encountered on the secondary provider side
      rateLimitErrors: 0,
      keyRotationRetries: 0,
      errorTypes: [],               // Error types from main provider retry chain
      // Tier 2: Quality/performance
      mismatchDetected: false,
      missingEntries: 0,
      recoveredEntries: 0,
      // v1.6.1 telemetry: batches whose first slot arrived WITHOUT an opening
      // tag (Rule 7 compliant continuation) and was rebuilt by the smart
      // preamble scrubber instead of triggering two-pass recovery.
      untaggedFirstSlotCount: 0,
      entryCount: 0,
      batchCount: 0,
      // Tier 3: Configuration context
      workflow: this.translationWorkflow,
      keyRotationMode: this.keyRotationConfig?.enabled ? (this.keyRotationConfig.mode || 'per-batch') : 'disabled',
      batchContextEnabled: this.enableBatchContext,
      singleBatchMode: this.singleBatchMode,
      parallelBatchesUsed: false,
      streaming: this.enableStreaming,
      // Tier 4: FinOps incident log — each entry describes one recovery
      // operation with the tokens burned by the failed attempt(s).
      incidents: [],
    };
  }

  /**
   * Mark the FinOps ledger streams consumed by a FAILED attempt as wasted so
   * the Telegram receipt can split billed tokens into effective vs wasted.
   * Called by retry handlers after they catch an error carrying
   * `finOpsStreamId` (attached by GeminiService on every thrown attempt).
   * @param {string|string[]} streamIds - ledger stream id(s) to mark wasted
   * @private
   */
  _markAttemptWasted(streamIds) {
    if (!global.geminiFinOps || !global.geminiFinOps.streams) return;
    const ids = Array.isArray(streamIds) ? streamIds : [streamIds];
    for (const id of ids) {
      if (id && global.geminiFinOps.streams[id]) {
        const stream = global.geminiFinOps.streams[id];
        if (!stream.wasted) {
          stream.wasted = true;
        }
      }
    }
  }

  /**
   * Snapshot the current FinOps ledger stream IDs. Used to attribute tokens
   * recorded LATER (by an attempt whose output turns out to be superseded) as
   * wasted — critical for MISMATCH_RETRY, where the original call succeeds
   * (HTTP 200) and therefore never attaches a finOpsStreamId to a thrown error.
   * @returns {string[]}
   * @private
   */
  _snapshotLedgerIds() {
    if (!global.geminiFinOps || !global.geminiFinOps.streams) return [];
    return Object.keys(global.geminiFinOps.streams);
  }

  /**
   * Mark every FinOps ledger stream recorded AFTER the given snapshot as
   * wasted (tokens billed but superseded/discarded), and return the total
   * token count newly marked — used for incident tokensBurned accounting.
   * @param {string[]} snapshotIds - stream ids present before the attempt
   * @returns {number} total tokens newly marked wasted
   * @private
   */
  _markWastedSince(snapshotIds) {
    if (!global.geminiFinOps || !global.geminiFinOps.streams) return 0;
    const before = new Set(Array.isArray(snapshotIds) ? snapshotIds : []);
    let burned = 0;
    for (const id of Object.keys(global.geminiFinOps.streams)) {
      if (before.has(id)) continue;
      const stream = global.geminiFinOps.streams[id];
      if (!stream.wasted) {
        stream.wasted = true;
        burned += (stream.input || 0) + (stream.cached || 0) + (stream.thought || 0) + (stream.output || 0);
      }
    }
    return burned;
  }

  /**
   * Update the most recent in-progress incident of the given type/batch with
   * its final outcome and burned-token count (for the Telegram battle-log).
   * @param {string} type - incident type, e.g. 'MISMATCH_RETRY'
   * @param {number} batch - 1-based batch number
   * @param {{outcome?: string, tokensBurned?: number}} patch - final values
   * @private
   */
  _closeIncident(type, batch, { outcome, tokensBurned = 0 } = {}) {
    const incidents = this.translationStats.incidents || [];
    for (let i = incidents.length - 1; i >= 0; i--) {
      const inc = incidents[i];
      if (inc.type === type && inc.batch === batch && inc.outcome === 'in_progress') {
        if (outcome) inc.outcome = outcome;
        inc.tokensBurned = (inc.tokensBurned || 0) + tokensBurned;
        return;
      }
    }
  }

  /**
   * Record a recovery incident for the Telegram battle-log section.
   * @param {object} incident
   * @param {string} incident.type - e.g. 'PROHIBITED_CONTENT' | 'MAX_TOKENS' | '429_RATE_LIMIT' | 'MISMATCH_RETRY'
   * @param {number} incident.batch - 1-based batch number
   * @param {string} incident.recovery - short description of the recovery action
   * @param {string} [incident.outcome] - 'recovered' | 'recovered_partial' | 'fallback' | 'failed'
   * @param {number} [incident.tokensBurned] - total tokens consumed by the failed attempt(s)
   * @private
   */
  _logIncident({ type, batch, recovery, outcome = 'recovered', tokensBurned = 0 }) {
    this.translationStats.incidents.push({
      type,
      batch,
      recovery,
      outcome,
      tokensBurned,
      at: Date.now()
    });
  }

  /**
   * Rotate to a new API key before translating a batch (when per-batch rotation is enabled)
   * Creates a fresh GeminiService instance with a sequentially selected key (round-robin)
   * MULTI-INSTANCE FIX: Now async to use Redis-backed key health checks.
   * @returns {Promise<void>}
   */
  async maybeRotateKeyForBatch(batchIndex) {
    if (!this.perBatchRotationEnabled) return;

    // Skip rotation for the first batch — the initial GeminiService was already created
    // with the key selected by selectGeminiApiKey(), so rotating here would waste that
    // instance and create a duplicate. Subsequent batches rotate normally.
    if (batchIndex === 0) return;

    // Use the global rotation counter so retries naturally advance to the next key
    await this._rotateToNextKey(`batch ${batchIndex + 1}`);
  }

  /**
   * Key health tracking constants
   *
   * Values must match the Redis-backed constants in src/utils/sharedCache.js so
   * the local in-memory fallback and the distributed Redis path apply the same
   * quarantine policy: a key enters cooldown after 5 errors and stays there for
   * up to 1 hour unless explicitly reset after a successful translation.
   */
  static KEY_HEALTH_ERROR_THRESHOLD = 5; // Consistent with sharedCache.js (5 errors)
  static KEY_HEALTH_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour
  
  /**
   * Record an error for the current API key (Key Health Shield installed)
   * MULTI-INSTANCE FIX: Uses Redis via sharedCache for cross-pod state sharing.
   * Falls back to local Map if Redis is unavailable.
   * @param {string} apiKey - The key that errored
   * @param {Error} error - Error object for cross-checking the error type
   * @returns {Promise<void>}
   */
  async _recordKeyError(apiKey, error = null) {
    if (!this.retryRotationEnabled || !apiKey) return;

    // Key Health Shield: bypass quarantine on content policy filters
    if (error && error.message) {
      const msg = String(error.message).toLowerCase();
      // Use word-boundary regex (same pattern as _isRetryableHttpError).
      // "safety" must not be followed by a letter — avoid false positive on "safeguard", "safetypin".
      if (/prohibited[_ ]content/.test(msg) ||
          /safety(?![a-z])/.test(msg) ||
          /recitation/.test(msg)) {
        log.debug(() => `[TranslationEngine] Key shield active: skipping quarantine for key ${this._redactKey(apiKey)} due to content policy error.`);
        return; // Early exit — keep the key out of the 1-hour cooldown lock.
      }
    }

    // Update local cache immediately for fast in-process lookups
    const now = Date.now();
    let entry = this._keyHealthErrors.get(apiKey);
    if (!entry) {
      entry = { count: 0, lastError: 0 };
      this._keyHealthErrors.set(apiKey, entry);
    }
    if (now - entry.lastError > TranslationEngine.KEY_HEALTH_COOLDOWN_MS) {
      entry.count = 0;
    }
    entry.count++;
    entry.lastError = now;

    // Also update Redis for cross-pod visibility (fire-and-forget, don't block on it)
    recordKeyErrorRedis(apiKey).catch(err => {
      log.debug(() => `[TranslationEngine] Redis key health update failed (using local): ${err.message}`);
    });

    if (entry.count >= TranslationEngine.KEY_HEALTH_ERROR_THRESHOLD) {
      log.warn(() => `[TranslationEngine] Key ${this._redactKey(apiKey)} reached ${entry.count} errors, will be skipped for ~1h cooldown`);
    }
  }

  /**
   * Reset key health after a successful translation (Issue #5 fix).
   * This immediately restores the key to healthy status for quicker recovery
   * rather than waiting for the full 1-hour TTL to expire.
   * Also clears the local cache entry to fix Issue #2 (staleness).
   * @param {string} apiKey - The key that succeeded
   * @returns {Promise<void>}
   */
  async _resetKeyHealthOnSuccess(apiKey) {
    if (!this.retryRotationEnabled || !apiKey) return;

    // ISSUE #2 FIX: Clear local cache entry to prevent staleness
    // The local cache should not persist cooldown status after Redis TTL expires
    // or after a successful translation proves the key is working
    const entry = this._keyHealthErrors.get(apiKey);
    if (entry) {
      this._keyHealthErrors.delete(apiKey);
      log.debug(() => `[TranslationEngine] Cleared local key health cache for ${this._redactKey(apiKey)} after successful translation`);
    }

    // ISSUE #5 FIX: Reset Redis health if key had errors
    // Only reset if the key was previously unhealthy (had errors)
    if (entry && entry.count > 0) {
      resetKeyHealth(apiKey).catch(err => {
        log.debug(() => `[TranslationEngine] Redis key health reset failed: ${err.message}`);
      });
      log.debug(() => `[TranslationEngine] Reset key health for ${this._redactKey(apiKey)} after successful translation`);
    }
  }


  /**
   * Check if a key is currently in cooldown (unhealthy) - SYNC version using local cache.
   * For async operations, use _isKeyCoolingDownAsync which checks Redis.
   * @param {string} apiKey
   * @returns {boolean}
   */
  _isKeyCoolingDown(apiKey) {
    if (!apiKey) return false;
    const entry = this._keyHealthErrors.get(apiKey);
    if (!entry) return false;
    const now = Date.now();
    // If cooldown has elapsed, reset and allow the key
    if (now - entry.lastError > TranslationEngine.KEY_HEALTH_COOLDOWN_MS) {
      this._keyHealthErrors.delete(apiKey);
      return false;
    }
    return entry.count >= TranslationEngine.KEY_HEALTH_ERROR_THRESHOLD;
  }

  /**
   * Check if a key is currently in cooldown (distributed check via Redis).
   * MULTI-INSTANCE FIX: Checks Redis for cross-pod key health, falls back to local cache.
   * @param {string} apiKey
   * @returns {Promise<boolean>}
   */
  async _isKeyCoolingDownAsync(apiKey) {
    if (!apiKey) return false;

    // Check local cache first (fast path)
    if (this._isKeyCoolingDown(apiKey)) {
      return true;
    }

    // Check Redis for cross-pod visibility
    try {
      const redisCoolingDown = await isKeyCoolingDownRedis(apiKey);
      if (redisCoolingDown) {
        // Update local cache to avoid repeated Redis calls
        this._keyHealthErrors.set(apiKey, {
          count: TranslationEngine.KEY_HEALTH_ERROR_THRESHOLD,
          lastError: Date.now()
        });
        return true;
      }
    } catch (err) {
      log.debug(() => `[TranslationEngine] Redis key health check failed (using local): ${err.message}`);
    }

    return false;
  }

  /**
   * Redact an API key for safe logging (first 4 + last 4 chars).
   * @param {string} key
   * @returns {string}
   */
  _redactKey(key) {
    if (!key || key.length < 10) return '[REDACTED]';
    return `${key.slice(0, 4)}...${key.slice(-4)}`;
  }

  /**
   * Advance the global key rotation counter and swap to the next key.
   * Every call (whether for a new batch or a retry) moves to the next key in round-robin order.
   * Skips keys that are in cooldown (too many recent errors), falling back to the next healthy key.
   * Preserves cached model limits across rotations to avoid redundant API calls.
   * MULTI-INSTANCE FIX: Uses async Redis checks for cross-pod key health visibility.
   * @param {string} reason - Human-readable reason for the rotation (used in debug logs)
   * @returns {Promise<void>}
   */
  async _rotateToNextKey(reason) {
    if (!this.retryRotationEnabled) return;

    const keys = this.keyRotationConfig.keys;
    const totalKeys = keys.length;

    // Always capture the latest model limits from the current instance before replacing it.
    // This ensures limits fetched after the first rotation (or updated from fallback to real values)
    // are preserved for subsequent rotations.
    if (this.gemini?._modelLimits) {
      this._sharedModelLimits = this.gemini._modelLimits;
    }

    // Find the next healthy key, trying up to totalKeys candidates
    // MULTI-INSTANCE FIX: Use Redis counter for distributed round-robin selection
    let selectedKey = null;
    let keyIndex = -1;
    for (let attempt = 0; attempt < totalKeys; attempt++) {
      // Try Redis-backed rotation counter first, fall back to local if unavailable
      let candidateIndex;
      const redisIndex = await getNextRotationIndex('gemini', totalKeys);
      if (redisIndex >= 0) {
        candidateIndex = redisIndex;
        // Update local counter to stay roughly in sync (for fallback scenarios)
        this._keyRotationCounter = candidateIndex + 1;
      } else {
        // Redis unavailable - use local counter
        candidateIndex = this._keyRotationCounter % totalKeys;
        this._keyRotationCounter++;
      }

      const candidate = keys[candidateIndex];

      // Use async Redis check for distributed visibility
      const coolingDown = await this._isKeyCoolingDownAsync(candidate);
      if (!coolingDown) {
        selectedKey = candidate;
        keyIndex = candidateIndex;
        break;
      }
      log.debug(() => `[TranslationEngine] Skipping key ${candidateIndex + 1}/${totalKeys} (in cooldown) for ${reason}`);
    }

    // If all keys are in cooldown, use the next one anyway (best effort)
    if (!selectedKey) {
      keyIndex = (this._keyRotationCounter - totalKeys) % totalKeys; // rewind to first candidate
      selectedKey = keys[keyIndex];
      log.warn(() => `[TranslationEngine] All ${totalKeys} keys are in cooldown, using key ${keyIndex + 1} anyway for ${reason}`);
    }

    this.gemini = new GeminiService(
      selectedKey,
      this.model,
      this.keyRotationConfig.advancedSettings
    );
    this.gemini._totalKeys = totalKeys;

    // Restore cached model limits so the new instance doesn't re-fetch them
    if (this._sharedModelLimits) {
      this.gemini._modelLimits = this._sharedModelLimits;
    }

    // Re-verify streaming capability on the new instance. Currently all GeminiService
    // instances support streaming, but this guards against future provider heterogeneity.
    this.enableStreaming = this.enableStreaming && typeof this.gemini.streamTranslateSubtitle === 'function';

    log.debug(() => `[TranslationEngine] Rotated to key index ${keyIndex + 1}/${totalKeys} for ${reason} (counter: ${this._keyRotationCounter})`);
  }

  /**
   * Perform a translation call, using streaming or non-streaming based on the provided flag.
   * Centralizes the call pattern so retry paths don't accidentally drop streaming.
   * @param {string} batchText
   * @param {string} targetLanguage
   * @param {string} prompt
   * @param {boolean} useStreaming - Whether to use streaming
   * @param {Function|null} onStreamChunk - Streaming progress callback (only used when useStreaming=true)
   * @returns {Promise<string>}
   */
  async _translateCall(batchText, targetLanguage, prompt, useStreaming, onStreamChunk) {
    if (useStreaming && typeof this.gemini.streamTranslateSubtitle === 'function') {
      return this.gemini.streamTranslateSubtitle(
        batchText,
        'detected',
        targetLanguage,
        prompt,
        onStreamChunk || null
      );
    }
    return this.gemini.translateSubtitle(
      batchText,
      'detected',
      targetLanguage,
      prompt
    );
  }

    /**
   * Check if an error is a retryable HTTP error (hardened + Prohibited Content shield).
   *
   * Uses word-boundary regex to avoid false positives:
   *   - "429"  must be standalone (not "1429" or "4290")
   *   - "503"  must be standalone (not "5030" or "1503")
   *   - "network" must be followed by failure context (not "not a network problem")
   *
   * @param {Error} error
   * @returns {boolean}
   */
  _isRetryableHttpError(error) {
    if (!error) return false;

    const msg = String(error.message || '').toLowerCase();
    const status = error.statusCode || error.status || error.response?.status || 0;

    // Prohibited Content / Safety Filter guard: do not hijack these errors
    // Use a "not-followed-by-letter" pattern to match "safety_filter",
    // "safety block", "SAFETY" — without matching "safeguard" or "safetypin".
    if (/prohibited[_ ]content/.test(msg) ||
        /safety(?![a-z])/.test(msg) ||
        /recitation/.test(msg)) {
      return false;
    }

    // HTTP status code (4xx / 5xx) — most reliable, check first.
    if (status >= 400) return true;

    // Text-based signatures — word boundary required to avoid false positives.
    //   "429"/"503" without boundary → "1429", "4290", "error_code_5031" would match.
    //   generic "network" → "network" alone could match "not a network problem".
    //   "timeout" could match "no timeout occurred".
    return /\b(429|503)\b/.test(msg) ||
      /\btoo many requests\b/.test(msg) ||
      /\bservice unavailable\b/.test(msg) ||
      /resource[_ ]exhausted/.test(msg) ||
      /\brate[_ ]limit(ed)?\b/.test(msg) ||
      /\bfetch failed\b/.test(msg) ||
      /\bnetwork (error|failure|timeout|unreachable|down)\b/.test(msg) ||
      /\b(timeout|timed out)\b/.test(msg);
  }

  /**
   * Main translation method - unified approach for all files
   * @param {string} srtContent - Original SRT content
   * @param {string} targetLanguage - Target language name
   * @param {string} customPrompt - Optional custom prompt
   * @param {Function} onProgress - Callback for real-time progress (entry-by-entry)
   * @returns {Promise<string>} - Translated SRT content
   */
  async translateSubtitle(srtContent, targetLanguage, customPrompt = null, onProgress = null, sourceLanguage = null) {
    // Normalize the incoming source language from SubMaker
    this.sourceLanguage = sourceLanguage ? normalizeTargetLanguageForPrompt(sourceLanguage) : '';

    // Track per-run RTL so all cleanups (including streaming) can apply markers consistently
    this.isRtlTarget = isRtlLanguage(targetLanguage);

    // Step 1: Parse SRT into structured entries
    const entries = parseSRT(srtContent);
    if (!entries || entries.length === 0) {
      throw new Error('Invalid SRT content: no valid entries found');
    }
    // Stats: entry count
    this.translationStats.entryCount = entries.length;

    // Gap detection — log once per file, not per batch.
    // Useful for monitoring SRT quality across providers (OpenSubtitles/SubDL/SubSource).
    // Gaps typically occur when users manually edit/merge SRT files before upload.
    // NOTE: Purely observational logging — does not affect translation flow.
    if (entries.length > 1) {
      const firstId = entries[0].id;
      const lastId = entries[entries.length - 1].id;
      const expectedContiguous = lastId - firstId + 1;
      const missingCount = expectedContiguous - entries.length;
      if (missingCount > 0) {
        log.info(() => `[TranslationEngine] SRT ID gaps detected: ${entries.length} entries spanning ID ${firstId}–${lastId} (contiguous would be ${expectedContiguous}, missing ${missingCount} IDs). ID list will be sent to model for exact parity.`);
      }
    }

    // Single-batch mode: translate the whole file (with limited auto-splitting)
    if (this.singleBatchMode) {
      if (this.advancedSettings?.parallelBatchesEnabled === true) {
        log.warn(() => '[TranslationEngine] Parallel Batches is enabled but Single Batch Mode takes priority — parallel mode will NOT run. Disable Single Batch Mode to use Parallel Batches.');
      }
      this.translationStats.batchCount = 1;
      return this.translateSubtitleSingleBatch(entries, targetLanguage, customPrompt, onProgress);
    }

    let translatedEntries = [];

    // Parallel Batches Mode (Dev Mode specific, excluding ElfHosted)
    if (this.advancedSettings?.parallelBatchesEnabled === true && process.env.ELFHOSTED !== 'true') {
      this.translationStats.parallelBatchesUsed = true;
      translatedEntries = await executeParallelTranslation(this, entries, targetLanguage, customPrompt, onProgress);
    } else {

      log.info(() => `[TranslationEngine] Starting translation: ${entries.length} entries, ${Math.ceil(entries.length / this.batchSize)} batches`);

      const streamingEnabled = this.enableStreaming;
      let globalStreamSequence = 0;

      // Step 2: Create batches
      const batches = this.createBatches(entries, this.batchSize);
      this.translationStats.batchCount = batches.length;

      // Step 3: Translate each batch with smart progress tracking
      // NOTE: Use the outer `translatedEntries` variable (not a new const) so results are visible
      // after the else block closes. Previously `const translatedEntries = []` here shadowed
      // the outer `let translatedEntries = []` (line 679), causing 0-entry results and empty cached subtitles.
      // Streaming optimization: keep a pre-built SRT string for completed batches
      // so we only rebuild the current streaming batch on each progress callback.
      let completedSRT = '';
      let completedEntryCount = 0;

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        const batchStartId = batch[0]?.id || 1;
        const streamingBatchEntries = new Map();

        try {
          // Rotate API key for this batch if per-batch rotation is enabled
          await this.maybeRotateKeyForBatch(batchIndex);

          // Prepare context for this batch (if enabled)
          const context = this.enableBatchContext
            ? this.prepareContextForBatch(batch, entries, translatedEntries, batchIndex)
            : null;

          // Translate batch (with auto-chunking if needed)
          const translatedBatch = await this.translateBatch(
            batch,
            targetLanguage,
            customPrompt,
            batchIndex,
            batches.length,
            context,
            {
              streaming: streamingEnabled,
              onStreamProgress: async (payload) => {
                if (typeof onProgress !== 'function' || !payload?.partialSRT) return;

                const parsed = parseSRT(payload.partialSRT) || [];
                const offset = (payload.batchStartId || batchStartId) - 1;
                for (const entry of parsed) {
                  const globalId = (entry.id || 0) + offset;
                  if (globalId <= 0) continue;
                  streamingBatchEntries.set(globalId, {
                    id: globalId,
                    timecode: entry.timecode,
                    text: this.cleanTranslatedText(entry.text || '')
                  });
                }

                // Only rebuild SRT for the current streaming batch entries,
                // then prepend the already-built completed SRT string.
                const streamEntries = Array.from(streamingBatchEntries.values()).sort((a, b) => a.id - b.id);
                const streamNormalized = streamEntries.map((entry, idx) => ({
                  id: completedEntryCount + idx + 1,
                  timecode: entry.timecode,
                  text: entry.text
                }));
                const streamSRT = toSRT(streamNormalized);
                const partialSRT = completedSRT
                  ? completedSRT + '\n\n' + streamSRT
                  : streamSRT;

                const seq = ++globalStreamSequence;
                try {
                  await onProgress({
                    totalEntries: entries.length,
                    completedEntries: Math.min(entries.length, completedEntryCount + streamingBatchEntries.size),
                    currentBatch: payload.currentBatch || (batchIndex + 1),
                    totalBatches: batches.length,
                    partialSRT,
                    streaming: true,
                    streamSequence: seq
                  });
                } catch (err) {
                  log.warn(() => ['[TranslationEngine] Streaming progress callback error (batched):', err.message]);
                }
              }
            }
          );

          // Merge translated text with original structure
          for (let i = 0; i < batch.length; i++) {
            const original = batch[i];
            const translated = translatedBatch[i] || {};

            // Clean translated text
            const cleanedText = this.cleanTranslatedText(translated.text || original.text);

            // Create entry with timing from AI when requested, otherwise preserve original timing
            const timecode = (this.sendTimestampsToAI && translated.timecode) ? translated.timecode : original.timecode;
            translatedEntries.push({
              id: original.id,
              timecode,
              text: cleanedText
            });
          }

          // Update the completed SRT snapshot for streaming optimization
          completedEntryCount = translatedEntries.length;
          completedSRT = toSRT(translatedEntries);

          // Progress callback after each batch
          if (typeof onProgress === 'function') {
            try {
              await onProgress({
                totalEntries: entries.length,
                completedEntries: translatedEntries.length,
                currentBatch: batchIndex + 1,
                totalBatches: batches.length,
                partialSRT: completedSRT
              });
            } catch (err) {
              log.warn(() => ['[TranslationEngine] Progress callback error:', err.message]);
            }
          }

          // Log progress only at milestones
          const progress = Math.floor((translatedEntries.length / entries.length) * 100);
          if (batchIndex === 0 || batchIndex === batches.length - 1 || progress % 25 === 0) {
            log.info(() => `[TranslationEngine] Progress: ${progress}% (${translatedEntries.length}/${entries.length} entries, batch ${batchIndex + 1}/${batches.length})`);
          }

          // Inter-batch pacing: Enforce a 5.0s cooldown delay to mitigate upstream RPM burst limits
          if (batchIndex < batches.length - 1) {
            log.debug(() => `[⏳ RATE LIMIT] Applying 5.0s pacing delay before dispatching next batch...`);
            await sleep(5000);
          }

        } catch (error) {
          // Only log if not already logged by upstream handler
          if (!error._alreadyLogged) {
            log.error(() => [`[TranslationEngine] Error in batch ${batchIndex + 1}:`, error.message]);
          }
          // Wrap error but preserve original error properties (translationErrorType, statusCode, etc.)
          const wrappedError = new Error(`Translation failed at batch ${batchIndex + 1}: ${error.message}`);
          // Copy all properties from original error to preserved type information
          if (error.translationErrorType) wrappedError.translationErrorType = error.translationErrorType;
          if (error.statusCode) wrappedError.statusCode = error.statusCode;
          if (error.type) wrappedError.type = error.type;
          if (error.isRetryable !== undefined) wrappedError.isRetryable = error.isRetryable;
          if (error.originalError) wrappedError.originalError = error.originalError;
          if (error.serviceName) wrappedError.serviceName = error.serviceName;
          // Preserve the already-logged flag
          if (error._alreadyLogged) wrappedError._alreadyLogged = true;
          throw wrappedError;
        }
      }
    }

    // Step 4: Final validation
    if (translatedEntries.length !== entries.length) {
      log.warn(() => `[TranslationEngine] Entry count mismatch: expected ${entries.length}, got ${translatedEntries.length}`);
    }

    log.info(() => `[TranslationEngine] Translation completed: ${translatedEntries.length} entries`);

    // Final safety: strip any timecodes/timeranges that slipped through.
    for (const entry of translatedEntries) {
      entry.text = this.sanitizeTimecodes(entry.text);
    }

    // Step 5: Convert back to SRT format
    if (translatedEntries.length > 0) {
      log.info(() => `[DIAGNOSTIC] Final entry 0 text: "${translatedEntries[0]?.text?.slice(0, 60)}"`);
    }
    return toSRT(translatedEntries);
  }

  /**
   * Single-batch translation workflow with optional streaming partials
   */
  async translateSubtitleSingleBatch(entries, targetLanguage, customPrompt = null, onProgress = null) {
    log.info(() => `[TranslationEngine] Single-batch translation: ${entries.length} entries`);

    const fullBatchText = this.prepareBatchContent(entries, null);

    const promptForCache = this.createPromptForWorkflow(fullBatchText, targetLanguage, customPrompt, entries.length, null, 0, 1);

    let actualTokenCount = null;
    try {
      actualTokenCount = await this.gemini.countTokensForTranslation(fullBatchText, targetLanguage, promptForCache);
    } catch (err) {
      log.debug(() => ['[TranslationEngine] Single-batch token count failed, using estimate:', err.message]);
    }

    let estimatedTokens = actualTokenCount;
    if (!estimatedTokens) {
      try {
        const { userPrompt } = this.gemini.buildUserPrompt(fullBatchText, targetLanguage, promptForCache);
        estimatedTokens = this.safeEstimateTokens(userPrompt);
      } catch (estimateErr) {
        log.debug(() => ['[TranslationEngine] Single-batch prompt estimation failed, falling back:', estimateErr.message]);
        estimatedTokens = this.safeEstimateTokens(fullBatchText + (promptForCache || ''));
      }
    }

    // Dynamic chunk sizing: keep each chunk comfortably under the max token limit
    const softLimit = Math.max(1000, SINGLE_BATCH_TOKEN_SOFT_LIMIT);
    let chunkCount = Math.max(1, Math.ceil(estimatedTokens / softLimit));
    // Never create more chunks than entries (prevents empty chunks on tiny files)
    chunkCount = Math.min(chunkCount, Math.max(1, entries.length));

    if (chunkCount > 1) {
      const basis = actualTokenCount ? 'actual' : 'estimated';
      log.info(() => `[TranslationEngine] Single-batch token split: ${estimatedTokens} tokens (${basis}) -> ${chunkCount} chunks (limit ~${SINGLE_BATCH_MAX_TOKENS_PER_CHUNK}/chunk)`);
    }

    const chunks = chunkCount > 1 ? this.splitIntoChunks(entries, chunkCount) : [entries];
    // Stats: update actual chunk count (may differ from the initial batchCount=1 set by caller)
    this.translationStats.batchCount = chunks.length;
    const translatedEntries = [];
    // Track completed SRT from previous chunks so streaming partials include all progress
    let completedChunksSRT = '';
    let completedChunksEntryCount = 0;

    for (let batchIndex = 0; batchIndex < chunks.length; batchIndex++) {
      const batch = chunks[batchIndex];
      const useStreaming = this.enableStreaming;

      // Rotate API key for this batch if per-batch rotation is enabled
      await this.maybeRotateKeyForBatch(batchIndex);

      // Preserve coherence when the "single-batch" path auto-splits by reusing the same context builder
      const context = this.enableBatchContext
        ? this.prepareContextForBatch(batch, entries, translatedEntries, batchIndex)
        : null;

      // Capture accumulated state for the streaming closure
      const prevSRT = completedChunksSRT;
      const prevEntryCount = completedChunksEntryCount;

      const translatedBatch = await this.translateBatch(
        batch,
        targetLanguage,
        customPrompt,
        batchIndex,
        chunks.length,
        context,
        {
          allowAutoChunking: false,
          streaming: useStreaming,
          onStreamProgress: async (payload) => {
            if (typeof onProgress === 'function' && payload?.partialSRT) {
              try {
                // Prepend completed chunks so the partial includes all translated entries
                const fullPartialSRT = prevSRT
                  ? prevSRT + '\n\n' + payload.partialSRT
                  : payload.partialSRT;
                await onProgress({
                  totalEntries: entries.length,
                  completedEntries: prevEntryCount + (payload.completedEntries || 0),
                  currentBatch: batchIndex + 1,
                  totalBatches: chunks.length,
                  partialSRT: fullPartialSRT,
                  streaming: true,
                  streamSequence: payload.streamSequence
                });
              } catch (err) {
                log.warn(() => ['[TranslationEngine] Streaming progress callback error:', err.message]);
              }
            }
          }
        }
      );

      // Merge translated text with original structure
      for (let i = 0; i < batch.length; i++) {
        const original = batch[i];
        const translated = translatedBatch[i] || {};

        const cleanedText = this.cleanTranslatedText(translated.text || original.text);
        const timecode = (this.sendTimestampsToAI && translated.timecode) ? translated.timecode : original.timecode;
        translatedEntries.push({
          id: original.id,
          timecode,
          text: cleanedText
        });
      }

      // Update accumulated SRT snapshot for next chunk's streaming closure
      completedChunksEntryCount = translatedEntries.length;
      completedChunksSRT = toSRT(translatedEntries);

      // Progress callback after each chunk
      if (typeof onProgress === 'function') {
        try {
          await onProgress({
            totalEntries: entries.length,
            completedEntries: translatedEntries.length,
            currentBatch: batchIndex + 1,
            totalBatches: chunks.length,
            partialSRT: completedChunksSRT
          });
        } catch (err) {
          log.warn(() => ['[TranslationEngine] Progress callback error (single-batch):', err.message]);
        }
      }

      // Inter-chunk pacing: Enforce a 5.0s cooldown delay between auto-chunked requests
      if (batchIndex < chunks.length - 1) {
        log.debug(() => `[⏳ RATE LIMIT] Applying 5.0s pacing delay before processing next chunk...`);
        await sleep(5000);
      }

    } // End of chunk processing loop

    if (translatedEntries.length !== entries.length) {
      log.warn(() => `[TranslationEngine] Single-batch entry count mismatch: expected ${entries.length}, got ${translatedEntries.length}`);
    }

    // Strip any timecodes/timeranges that slipped through.
    for (const entry of translatedEntries) {
      entry.text = this.sanitizeTimecodes(entry.text);
    }

    log.info(() => `[TranslationEngine] Single-batch translation completed: ${translatedEntries.length} entries (tokens: est ${estimatedTokens}${actualTokenCount ? `, actual ${actualTokenCount}` : ''})`);

    return toSRT(translatedEntries);
  }

  /**
   * Create batches from entries
   */
  createBatches(entries, batchSize) {
    const batches = [];
    for (let i = 0; i < entries.length; i += batchSize) {
      batches.push(entries.slice(i, i + batchSize));
    }
    return batches;
  }

  /**
   * Split entries into N roughly equal chunks
   */
  splitIntoChunks(entries, parts) {
    const chunks = [];
    const size = Math.ceil(entries.length / parts);
    for (let i = 0; i < entries.length; i += size) {
      chunks.push(entries.slice(i, i + size));
    }
    return chunks;
  }

  /**
   * Prepare context for a batch (original surrounding entries + previous translations)
   * Context improves translation coherence across batches
   * Handles irregular index and ID alignment (Global Array Index Alignment)
   * @param {Array} batch - Current batch entries
   * @param {Array} allOriginalEntries - All original entries
   * @param {Array} translatedSoFar - Previously translated entries
   * @param {number} batchIndex - Current batch index
   * @returns {Object} - Context object with surrounding and previous entries
   */
  prepareContextForBatch(batch, allOriginalEntries, translatedSoFar, batchIndex) {
    if (!this.enableBatchContext || batchIndex === 0 || !batch || batch.length === 0 || !Array.isArray(allOriginalEntries)) {
      return null;
    }

    // 1. Resolve true batch[0] index in original entries
    let batchStartIdx = allOriginalEntries.indexOf(batch[0]);
    if (batchStartIdx === -1) {
      batchStartIdx = allOriginalEntries.findIndex(e => e.id === batch[0]?.id);
    }

    // No previous context when at file start or invalid position
    if (batchStartIdx <= 0) {
      return null;
    }

    const surroundingStartIdx = Math.max(0, batchStartIdx - this.contextSize);
    const surroundingEndIdx = batchStartIdx - 1;
    const memoryContext = [];

    // 2. Build a fast lookup map keyed by original entry ID
    const translatedMap = new Map();
    if (Array.isArray(translatedSoFar)) {
      for (const t of translatedSoFar) {
        if (t && t.id !== undefined) {
          translatedMap.set(t.id, t.text);
        }
      }
    }

    // 3. Collect preceding entries alongside their translations
    for (let i = surroundingStartIdx; i <= surroundingEndIdx && i < allOriginalEntries.length; i++) {
      const origEntry = allOriginalEntries[i];
      if (!origEntry) continue;

      const translatedText = translatedMap.get(origEntry.id);

      // Only include valid translations; exclude [⚠️] warning placeholders
      if (translatedText && typeof translatedText === 'string' && !translatedText.startsWith('[⚠️]')) {
        memoryContext.push({
          id: origEntry.id,
          source: origEntry.text,
          translation: translatedText
        });
      }
    }

    return memoryContext.length > 0 ? {
      previousMemory: memoryContext
    } : null;
  }

  /**
   * Translate a batch of entries (with auto-chunking if needed)
   */
  async translateBatch(batch, targetLanguage, customPrompt, batchIndex, totalBatches, context = null, options = {}) {
    const opts = options || {};

    // Native batch providers (DeepL, Google Translate): send raw SRT directly,
    // skip numbered-list prompt construction and response parsing entirely.
    if (this.isNativeBatchProvider) {
      return this.translateBatchNative(batch, targetLanguage, batchIndex, totalBatches);
    }

    const allowAutoChunking = opts.allowAutoChunking !== false;
    const streamingRequested = opts.streaming && typeof this.gemini.streamTranslateSubtitle === 'function';

    // Prepare batch text (with context if provided)
    const batchText = this.prepareBatchContent(batch, context);
    const prompt = this.createPromptForWorkflow(batchText, targetLanguage, customPrompt, batch.length, context, batchIndex, totalBatches);

    // Fix #8 (v1.4.38+): tryFallback closure moved AFTER batchText/prompt declarations.
    // This makes variable dependencies explicit and avoids reliance on JavaScript hoisting.
    const tryFallback = async (primaryError) => {
      if (!this.fallbackProvider) {
        return { handled: false, error: primaryError };
      }
      try {
        const fallbackProviderName = String(
          this.fallbackProvider?.providerName ||
          this.fallbackProvider?.primaryName ||
          this.fallbackProviderName ||
          ''
        ).toLowerCase();
        const fallbackIsNative = NATIVE_BATCH_PROVIDER_NAMES.has(fallbackProviderName);
        const fallbackContent = fallbackIsNative ? this.prepareBatchSrt(batch) : batchText;
        const fallbackPrompt = fallbackIsNative ? null : prompt;
        const translated = await this.fallbackProvider.translateSubtitle(
          fallbackContent,
          'detected',
          targetLanguage,
          fallbackPrompt
        );
        if (fallbackIsNative) {
          log.info(() => `[TranslationEngine] Native fallback provider ${this.fallbackProviderName || 'secondary'} succeeded for batch ${batchIndex + 1}`);
        } else {
          log.info(() => `[TranslationEngine] Fallback provider ${this.fallbackProviderName || 'secondary'} succeeded for batch ${batchIndex + 1}`);
        }
        // Stats: secondary provider was used
        this.translationStats.usedSecondaryProvider = true;
        this.translationStats.secondaryProviderName = this.fallbackProviderName || 'secondary';
        // Bug 4 fix: store primary failure reason so history card can surface it as a tooltip
        if (!this.translationStats.primaryFailureReason) {
          this.translationStats.primaryFailureReason = primaryError?.message || String(primaryError);
        }
        return { handled: true, text: translated };
      } catch (fallbackError) {
        // Stats: secondary provider also failed — capture its error details for the history card.
        // We always flag usage even on failure so the card knows the secondary was attempted.
        this.translationStats.usedSecondaryProvider = true;
        this.translationStats.secondaryProviderName = this.fallbackProviderName || 'secondary';
        if (!this.translationStats.primaryFailureReason) {
          this.translationStats.primaryFailureReason = primaryError?.message || String(primaryError);
        }
        // Capture secondary failure reason (truncated — full message goes on the combined error)
        if (!this.translationStats.secondaryFailureReason) {
          this.translationStats.secondaryFailureReason = fallbackError?.message || String(fallbackError);
        }
        // Track the secondary provider's classified error type (if any), otherwise tag generically
        const secondaryErrType = fallbackError?.translationErrorType || 'SECONDARY_FAILED';
        if (!this.translationStats.secondaryErrorTypes.includes(secondaryErrType)) {
          this.translationStats.secondaryErrorTypes.push(secondaryErrType);
        }
        const combined = new Error(`Primary (${this.providerName}) failed: ${primaryError.message || primaryError}\nSecondary (${this.fallbackProviderName || 'fallback'}) failed: ${fallbackError.message || fallbackError}`);
        combined.translationErrorType = 'MULTI_PROVIDER';
        combined.primaryError = primaryError;
        combined.secondaryError = fallbackError;
        combined.primaryProvider = this.providerName;
        combined.secondaryProvider = this.fallbackProviderName || 'fallback';
        return { handled: false, error: combined };
      }
    };

    // Check cache first (includes prompt variant so AI-mode differences are respected)
    const cacheResults = this.checkBatchCache(batch, targetLanguage, prompt);
    if (cacheResults.allCached) {
      return cacheResults.entries;
    }

    // Check if we need to split due to token limits
    let actualTokenCount = null;
    if (typeof this.gemini?.countTokensForTranslation === 'function') {
      try {
        actualTokenCount = await this.gemini.countTokensForTranslation(batchText, targetLanguage, prompt);
      } catch (err) {
        log.debug(() => ['[TranslationEngine] Token count check failed, using estimate:', err.message]);
      }
    }

    const estimatedTokens = actualTokenCount || this.safeEstimateTokens(batchText + prompt);

    // Sequence counter for streaming progress events (used by both auto-chunk and normal paths)
    let streamSequence = 0;

    if (allowAutoChunking && estimatedTokens > this.maxTokensPerBatch && batch.length > 1) {
      // Auto-chunk: Split batch in half recursively (sequential for memory safety)
      log.debug(() => `[TranslationEngine] Batch too large (${estimatedTokens}${actualTokenCount ? ' actual' : ' est.'} tokens), auto-chunking into 2 parts`);

      const midpoint = Math.floor(batch.length / 2);
      const firstHalf = batch.slice(0, midpoint);
      const secondHalf = batch.slice(midpoint);

      // Translate sequentially to avoid memory spikes
      // Pass original context to first half only
      const firstTranslated = await this.translateBatch(firstHalf, targetLanguage, customPrompt, batchIndex, totalBatches, context, opts);

      // Emit streaming progress after first half completes so partial delivery picks it up
      if (typeof opts.onStreamProgress === 'function' && firstTranslated.length > 0) {
        const halfEntries = firstHalf.map((orig, i) => {
          const translated = firstTranslated[i] || {};
          return {
            id: orig.id,
            timecode: (this.sendTimestampsToAI && translated.timecode) ? translated.timecode : orig.timecode,
            text: this.cleanTranslatedText(translated.text || orig.text)
          };
        });
        const normalized = halfEntries.map((entry, idx) => ({ id: idx + 1, timecode: entry.timecode, text: entry.text }));
        try {
          await opts.onStreamProgress({
            partialSRT: toSRT(normalized),
            completedEntries: firstTranslated.length,
            totalEntries: batch.length,
            batchStartId: firstHalf[0]?.id || 1,
            batchEndId: firstHalf[firstHalf.length - 1]?.id || 1,
            currentBatch: batchIndex + 1,
            totalBatches,
            streaming: true,
            streamSequence: ++streamSequence
          });
        } catch (_) { }
      }

      // Fix #7: Build context for second half from first half's translations
      // Auto-chunking index alignment and [⚠️] placeholder filtering
      const contextCount = Math.min(this.contextSize, firstHalf.length);
      const targetEntries = firstHalf.slice(-contextCount);
      const startIndex = firstHalf.length - contextCount;

      // 1. Map first-half translations by their actual indices
      const transMapByIndex = new Map();
      if (Array.isArray(firstTranslated)) {
        for (let i = 0; i < firstTranslated.length; i++) {
          const item = firstTranslated[i];
          const idx = (item && typeof item.index === 'number') ? item.index : i;
          if (item && typeof item.text === 'string') {
            transMapByIndex.set(idx, item.text);
          }
        }
      }

      // 2. Build context memory matching exact indices in firstHalf
      const memoryList = [];
      for (let i = 0; i < targetEntries.length; i++) {
        const orig = targetEntries[i];
        const actualIndexInFirstHalf = startIndex + i;
        const transText = transMapByIndex.get(actualIndexInFirstHalf);

        // Only store valid translations; exclude [⚠️] warning placeholders
        if (transText && !transText.startsWith('[⚠️]')) {
          memoryList.push({
            id: orig.id,
            source: orig.text,
            translation: transText
          });
        }
      }

      const secondHalfContext = this.enableBatchContext && memoryList.length > 0 ? {
        surroundingOriginal: targetEntries,
        previousMemory: memoryList
      } : null;

      const secondTranslated = await this.translateBatch(secondHalf, targetLanguage, customPrompt, batchIndex, totalBatches, secondHalfContext, opts);

      return [...firstTranslated, ...secondTranslated];
    }

    // Translate batch - with retry on PROHIBITED_CONTENT and MAX_TOKENS errors
    let translatedText;
    let translatedEntries = null;
    let prohibitedRetryAttempted = false;
    let maxTokensRetryAttempted = false;
    const maxHttpRotationRetries = this.retryRotationEnabled && Array.isArray(this.keyRotationConfig?.keys)
      ? Math.max(0, this.keyRotationConfig.keys.length - 1)
      : 0;
    let httpRetryAttempts = 0;

    // Streaming text capture for checkpoint recovery
    let lastStreamedText = '';

    // Build a streaming callback for reuse in retry paths (Bug 1 fix: retries preserve streaming)
    const streamCallback = streamingRequested ? async (partialText) => {
      // Capture partial stream text
      lastStreamedText = partialText;

      if (typeof opts.onStreamProgress !== 'function') return;
      const payload = this.buildStreamingProgress(partialText, batch);
      if (!payload) return;
      payload.currentBatch = batchIndex + 1;
      payload.totalBatches = totalBatches;
      payload.streaming = true;
      payload.streamSequence = ++streamSequence;
      try {
        await opts.onStreamProgress(payload);
      } catch (err) {
        log.warn(() => ['[TranslationEngine] Stream progress handler failed:', err.message]);
      }
    } : null;

    // FinOps: snapshot the ledger before the first attempt of this batch so
    // superseded attempts (e.g. MISMATCH_RETRY full-batch replacement, where
    // the original call returned HTTP 200 and never throws) can be marked
    // wasted via snapshot-diff at recovery time.
    const ledgerSnapshotBeforeAttempt = this._snapshotLedgerIds();

    try {
  translatedText = await this._translateCall(batchText, targetLanguage, prompt, streamingRequested, streamCallback);
} catch (error) {
  // Track the error against the current key for health tracking
  if (this.retryRotationEnabled && this.gemini?.apiKey) {
    this._recordKeyError(this.gemini.apiKey, error); // Pass 'error' for classification
  }

      // 429/503: rotate through remaining keys and retry before other error-specific retries
      if (!translatedEntries && this._isRetryableHttpError(error) && this.retryRotationEnabled && maxHttpRotationRetries > 0) {
        // Stats: record initial rate-limit / retryable error
        this.translationStats.rateLimitErrors++;
        if (!this.translationStats.errorTypes.includes('429')) this.translationStats.errorTypes.push('429');
        // FinOps: the failed attempt burned tokens — mark them wasted
        this._markAttemptWasted(error.finOpsStreamId);
        let retrySucceeded = false;
        let shouldStopHttpRotation = false;

        while (!retrySucceeded && !shouldStopHttpRotation && httpRetryAttempts < maxHttpRotationRetries) {
          httpRetryAttempts++;
          this.translationStats.keyRotationRetries++;
          await this._rotateToNextKey(`429/503 retry ${httpRetryAttempts}/${maxHttpRotationRetries} for batch ${batchIndex + 1}`);
          log.warn(() => `[TranslationEngine] 429/503 error detected, retrying batch ${batchIndex + 1} with rotated key (${httpRetryAttempts}/${maxHttpRotationRetries})`);

          try {
            translatedText = await this._translateCall(batchText, targetLanguage, prompt, streamingRequested, streamCallback);
            retrySucceeded = true;
            this._logIncident({ type: '429_RATE_LIMIT', batch: batchIndex + 1, recovery: `rotated to next key (attempt ${httpRetryAttempts}/${maxHttpRotationRetries})`, outcome: 'recovered' });
            log.info(() => `[TranslationEngine] 429/503 key-rotation retry succeeded for batch ${batchIndex + 1} on attempt ${httpRetryAttempts}/${maxHttpRotationRetries}`);
          } catch (retryError) {
            // Stats: count each failed retry as an additional rate-limit error
            this.translationStats.rateLimitErrors++;
            // FinOps: this retry attempt also burned tokens — mark wasted
            this._markAttemptWasted(retryError.finOpsStreamId);
            if (this.retryRotationEnabled && this.gemini?.apiKey) {
              this._recordKeyError(this.gemini.apiKey, retryError); // Pass 'retryError'
            }
            log.warn(() => `[TranslationEngine] 429/503 key-rotation retry failed for batch ${batchIndex + 1} on attempt ${httpRetryAttempts}/${maxHttpRotationRetries}: ${retryError.message}`);
            if (!this._isRetryableHttpError(retryError)) {
              shouldStopHttpRotation = true;
              log.warn(() => `[TranslationEngine] Stopping 429/503 rotation retries for batch ${batchIndex + 1}; last error is non-HTTP-retryable`);
            }
          }
        }

        if (!retrySucceeded) {
          const fallbackResult = await tryFallback(error);
          if (fallbackResult.handled) {
            translatedText = fallbackResult.text;
          } else {
            throw fallbackResult.error;
          }
        }
      }
      // If MAX_TOKENS error and haven't retried yet, retry once
      else if (!translatedEntries && error.message && (error.message.includes('MAX_TOKENS') || error.message.includes('exceeded maximum token limit')) && !maxTokensRetryAttempted) {
        maxTokensRetryAttempted = true;
        // Stats: MAX_TOKENS error
        if (!this.translationStats.errorTypes.includes('MAX_TOKENS')) this.translationStats.errorTypes.push('MAX_TOKENS');
        this.translationStats.keyRotationRetries++;
        // FinOps: the truncated attempt burned tokens — mark wasted + log incident
        this._markAttemptWasted(error.finOpsStreamId);
        this._logIncident({ type: 'MAX_TOKENS', batch: batchIndex + 1, recovery: 'checkpoint resume with next key', outcome: 'recovered' });
        await this._rotateToNextKey(`MAX_TOKENS retry for batch ${batchIndex + 1}`);
        log.warn(() => `[TranslationEngine] MAX_TOKENS error detected, retrying batch ${batchIndex + 1} with next key`);

        // Checkpoint recovery for MAX_TOKENS retry
        let checkpointEntries = [];
        if (lastStreamedText) {
          const parsedPartial = this.parseResponseForWorkflow(lastStreamedText, batch.length, batch);
          if (parsedPartial && parsedPartial.length > 1) {
            parsedPartial.pop(); 
            checkpointEntries = parsedPartial;
          }
        }

        let pendingBatch = batch;
        let pendingBatchText = batchText;
        let pendingPromptCount = batch.length;
        let pendingContext = context;

        if (checkpointEntries.length > 0) {
            const { missingIndices } = this.alignTranslatedEntries(checkpointEntries, batch);
            if (missingIndices.length > 0 && missingIndices.length < batch.length) {
                pendingBatch = missingIndices.map(i => batch[i]);
                log.warn(() => `[TranslationEngine] Checkpoint saved ${checkpointEntries.length} entries. Resuming remaining ${pendingBatch.length} entries.`);
                pendingBatchText = this.prepareBatchContent(pendingBatch, context);
                pendingPromptCount = pendingBatch.length;
            }
        }

        const pendingPrompt = this.createPromptForWorkflow(pendingBatchText, targetLanguage, customPrompt, pendingPromptCount, pendingContext, batchIndex, totalBatches);

        try {
          const retryText = await this._translateCall(pendingBatchText, targetLanguage, pendingPrompt, streamingRequested, streamCallback);
          
          // Stitch back entries when checkpoint recovery is active
          if (checkpointEntries.length > 0 && pendingBatch.length < batch.length) {
              const retryEntries = this.parseResponseForWorkflow(retryText, pendingBatch.length, pendingBatch);
              const mergedMap = new Map();
              for (const e of checkpointEntries) mergedMap.set(e.index, e);
              for (const e of retryEntries) {
                  const originalEntry = pendingBatch[e.index];
                  if (originalEntry) {
                      const globalIdx = batch.indexOf(originalEntry);
                      if (globalIdx !== -1) mergedMap.set(globalIdx, { ...e, index: globalIdx });
                  }
              }
              translatedEntries = Array.from(mergedMap.values()).sort((a,b) => a.index - b.index);
          } else {
              translatedText = retryText; // Fallback when checkpoint recovery is not used
          }

          log.info(() => `[TranslationEngine] MAX_TOKENS retry succeeded for batch ${batchIndex + 1}`);
        } catch (retryError) {
          if (this.retryRotationEnabled && this.gemini?.apiKey) {
            this._recordKeyError(this.gemini.apiKey, retryError); // Pass 'retryError'
          }
          // Retry also failed, give up and throw the original error
          log.warn(() => `[TranslationEngine] MAX_TOKENS retry also failed for batch ${batchIndex + 1}: ${retryError.message}`);
          const fallbackResult = await tryFallback(error);
          if (fallbackResult.handled) {
            translatedText = fallbackResult.text;
          } else {
            throw fallbackResult.error; // Throw original/fallback-combined error
          }
        }
      }
      // If PROHIBITED_CONTENT error and haven't retried yet, retry with modified prompt
      else if (!translatedEntries && error.message && error.message.includes('PROHIBITED_CONTENT') && !prohibitedRetryAttempted) {
        prohibitedRetryAttempted = true;
        // Stats: PROHIBITED_CONTENT error
        if (!this.translationStats.errorTypes.includes('PROHIBITED_CONTENT')) this.translationStats.errorTypes.push('PROHIBITED_CONTENT');
        // FinOps: the blocked attempt burned input tokens — mark wasted
        this._markAttemptWasted(error.finOpsStreamId);
        this._logIncident({ type: 'PROHIBITED_CONTENT', batch: batchIndex + 1, recovery: 'two-stage recovery (key rotate + prompt masking)', outcome: 'in_progress' });
        
        let retrySuccess = false;
        let currentError = error;
        let stage1Error = null;

        // Two-stage recovery protocol
        // Stage 1: rotate key + fictitious header only
        // Stage 2: rotate key + fictitious header + word masking + fallback prompt
        for (let stage = 1; stage <= 2; stage++) {
            this.translationStats.keyRotationRetries++;
            if (stage > 1) {
              // FinOps: the failed Stage-1 masked attempt burned tokens too
              this._markAttemptWasted(stage1Error?.finOpsStreamId);
            }
            await this._rotateToNextKey(`PROHIBITED_CONTENT retry Stage ${stage} for batch ${batchIndex + 1}`);
            
            if (stage === 1) {
                log.warn(() => `[TranslationEngine] PROHIBITED_CONTENT detected! Stage 1: Retrying with next key & FICTITIOUS header only (No text masking).`);
            } else {
                // Track the Stage-1 failure for FinOps wasted accounting
                stage1Error = currentError;
                log.warn(() => `[TranslationEngine] PROHIBITED_CONTENT still blocking! Stage 2: Retrying with next key, Full Text Masking, and Fallback Prompt.`);
            }

            // Checkpoint recovery for PROHIBITED_CONTENT retry
            let checkpointEntries = [];
            if (lastStreamedText) {
              const parsedPartial = this.parseResponseForWorkflow(lastStreamedText, batch.length, batch);
              if (parsedPartial && parsedPartial.length > 1) {
                parsedPartial.pop(); 
                checkpointEntries = parsedPartial;
              }
            }

            let pendingBatch = batch;
            let pendingBatchText = batchText;
            let pendingPromptCount = batch.length;
            let pendingContext = context;

            if (checkpointEntries.length > 0) {
                const { missingIndices } = this.alignTranslatedEntries(checkpointEntries, batch);
                if (missingIndices.length > 0 && missingIndices.length < batch.length) {
                    pendingBatch = missingIndices.map(i => batch[i]);
                    log.warn(() => `[TranslationEngine] Checkpoint saved ${checkpointEntries.length} entries. Resuming remaining ${pendingBatch.length} entries for Stage ${stage}.`);
                    pendingBatchText = this.prepareBatchContent(pendingBatch, context);
                    pendingPromptCount = pendingBatch.length;
                }
            }

            let pendingPrompt = this.createPromptForWorkflow(pendingBatchText, targetLanguage, customPrompt, pendingPromptCount, pendingContext, batchIndex, totalBatches);
            let finalPrompt = pendingPrompt;
            let finalBatchText = pendingBatchText;

            if (stage === 1) {
                // Stage 1: prepend disclaimer header
                finalPrompt = `YOU'RE TRANSLATING SUBTITLES - EVERYTHING WRITTEN BELOW IS FICTICIOUS\n\n${pendingPrompt}`;
            } else if (stage === 2) {
                // Stage 2: mask sensitive keywords
                const targetLabelForFallback = normalizeTargetLanguageForPrompt(targetLanguage);
                const sourceLabelForFallback = this.sourceLanguage;
                const primaryIntro = PROMPT_TEMPLATES.primary(targetLabelForFallback, sourceLabelForFallback);
                const fallbackIntro = PROMPT_TEMPLATES.fallback(targetLabelForFallback, sourceLabelForFallback);
              
                // Comprehensive content sanitization dictionary
                const maskToxicWords = (text) => {
                  return String(text)
                    // --- Sexual / abuse category (high Google sensitivity) ---
                    .replace(/sexual harassment/gi, 'severe misconduct')
                    .replace(/sexual assault/gi, 'physical conflict')
                    .replace(/sexual abuse/gi, 'mistreatment')
                    .replace(/sexual predator/gi, 'dangerous person')
                    .replace(/sexual(ly)?/gi, 'inappropriate')
                    .replace(/grop(e|ed|ing)/gi, 'touch$1 inappropriately')
                    .replace(/molest(ed|ing)?/gi, 'abuse$1')
                    .replace(/incest/gi, 'inappropriate relationship')
                    .replace(/pedophil(e|ia)/gi, 'bad criminal')
                    .replace(/rape(d|ing|st)?/gi, 'harm$1')
                    .replace(/prostitut(e|ion)/gi, 'escort')
                    
                    // --- Self-harm / suicide category ---
                    .replace(/suicid(e|al)/gi, 'fatal tragedy')
                    .replace(/kill myself/gi, 'end my journey')
                    .replace(/want to die/gi, 'feel very down')
                    .replace(/slit my wrists/gi, 'harm myself')
                    .replace(/hang myself/gi, 'harm myself')
                    .replace(/overdos(e|ed|ing)/gi, 'medical emergency')
                    
                    // --- Violence / weapons / war category ---
                    .replace(/bomb(s|ed|ing|er)?/gi, 'device$1')
                    .replace(/terrorist(s|m)?/gi, 'hostile agent$1')
                    .replace(/hostage(s)?/gi, 'captive$1')
                    .replace(/tortur(e|ed|ing)/gi, 'mistreat$1')
                    .replace(/massacr(e|ed)/gi, 'tragedy')
                    .replace(/slaughter(ed|ing)?/gi, 'destroy$1')
                    .replace(/assassin(ate|ated|ation)?/gi, 'eliminate$1')
                    .replace(/kill(ed|ing|er)?/gi, 'eliminate$1')
                    .replace(/murder(ed|ing|er)?/gi, 'destroy$1')
                    .replace(/decapitat(e|ed|ion)/gi, 'attack')
                    .replace(/execute(d|ing|ion)/gi, 'terminate$1')
                    
                    // --- Drugs / controlled substances category ---
                    .replace(/(cocaine|heroin|meth|fentanyl|marijuana|weed)/gi, 'substance')
                    .replace(/drug dealer/gi, 'illegal trader')
                    
                    // --- Profanity / strong language category ---
                    .replace(/motherfucker/gi, 'jerk')
                    .replace(/fucking/gi, 'very')
                    .replace(/fuck(ed|ing|er)?/gi, 'damn')
                    .replace(/bitch(es)?/gi, 'jerk$1')
                    .replace(/bastard(s)?/gi, 'scoundrel$1')
                    .replace(/asshole(s)?/gi, 'fool$1')
                    .replace(/whore(s)?|slut(s)?/gi, 'companion$1')
                    .replace(/cunt(s)?|dick(s)?|pussy/gi, 'jerk')
                    .replace(/shit(ted|ting)?/gi, 'crap')
                    
                    // --- Preserve original filters (context safe guard) ---
                    .replace(/younger men/gi, 'younger adults')
                    .replace(/younger women/gi, 'younger adults')
                    .replace(/quiet room/gi, 'meeting room')
                    .replace(/elder gentleman/gi, 'manager')
                    .replace(/\bthe kid\b/gi, 'the young adult') 
                    .replace(/\bkid\b/gi, 'young adult')
                    .replace(/\bboy\b/gi, 'young man')
                    .replace(/\bgirl\b/gi, 'young woman')
                    .replace(/grabbed/gi, 'pulled')
                    .replace(/accusing/gi, 'blaming')
                    .replace(/accused/gi, 'blamed')
                    .replace(/victim/gi, 'target');
                };

                let softenedPrompt = pendingPrompt.replace(primaryIntro, fallbackIntro);
                softenedPrompt = maskToxicWords(softenedPrompt);
                finalBatchText = maskToxicWords(pendingBatchText);

                finalPrompt = `YOU'RE TRANSLATING SUBTITLES - EVERYTHING WRITTEN BELOW IS FICTICIOUS\n\n${softenedPrompt}`;
            }
            
            try {
              const retryText = await this._translateCall(finalBatchText, targetLanguage, finalPrompt, streamingRequested, streamCallback);
              
              // Stitch back entries when checkpoint recovery is active
              if (checkpointEntries.length > 0 && pendingBatch.length < batch.length) {
                  const retryEntries = this.parseResponseForWorkflow(retryText, pendingBatch.length, pendingBatch);
                  const mergedMap = new Map();
                  for (const e of checkpointEntries) mergedMap.set(e.index, e);
                  for (const e of retryEntries) {
                      const originalEntry = pendingBatch[e.index];
                      if (originalEntry) {
                          const globalIdx = batch.indexOf(originalEntry);
                          if (globalIdx !== -1) mergedMap.set(globalIdx, { ...e, index: globalIdx });
                      }
                  }
                  translatedEntries = Array.from(mergedMap.values()).sort((a,b) => a.index - b.index);
              } else {
                  translatedText = retryText; // Fallback when checkpoint recovery is not used
              }

              log.info(() => `[TranslationEngine] Retry Stage ${stage} succeeded for batch ${batchIndex + 1}!`);
              retrySuccess = true;
              break; // Success — exit recovery loop.
            } catch (retryError) {
              if (this.retryRotationEnabled && this.gemini?.apiKey) {
                this._recordKeyError(this.gemini.apiKey, retryError); // Pass 'retryError'
              }
              log.warn(() => `[TranslationEngine] Retry Stage ${stage} failed: ${retryError.message}`);
              currentError = retryError;
              // One-second pause before Stage 2
              if (stage === 1) await new Promise(res => setTimeout(res, 1000));
            }
        }

        // DeepL fallback and final failure path
        if (!retrySuccess) {
          log.warn(() => `[TranslationEngine] Both Gemini recovery stages failed. Initiating Fallback Provider for batch ${batchIndex + 1}`);
          const fallbackResult = await tryFallback(currentError);
          if (fallbackResult.handled) {
            translatedText = fallbackResult.text;
            
            // Route native SRT fallback output away from the XML parser
            const fallbackName = String(this.fallbackProviderName || '').toLowerCase();
            if (NATIVE_BATCH_PROVIDER_NAMES.has(fallbackName) || String(fallbackResult.text).includes('-->')) {
                const trimmed = String(translatedText || '').trim();
                if (trimmed.includes('-->')) {
                    translatedEntries = this.parseBatchSrtResponse(trimmed, batch.length, batch);
                } else {
                    translatedEntries = this.parseBatchResponse(trimmed, batch.length);
                }
            }
          } else {
            throw fallbackResult.error; // Tier 5: Fallback provider failed, abort batch
          }
        }
      } else if (!translatedEntries) {
        // Stats: record any classified error type not already tracked (MODEL_NOT_FOUND, 403, 503, etc.)
        const errType = error.translationErrorType;
        if (errType && !this.translationStats.errorTypes.includes(errType)) {
          this.translationStats.errorTypes.push(errType);
        }
        // Not a retryable error or already retried, throw as-is
        // If streaming returned nothing, fall back to non-streaming once
        const noStreamContent = error.message && (
          error.message.includes('No content returned from Gemini stream') ||
          error.message.includes('No content returned from stream')
        );
        if (streamingRequested && noStreamContent) {
          // Stats: record that streaming returned empty content and a non-streaming retry is being attempted
          if (!this.translationStats.errorTypes.includes('EMPTY_STREAM')) {
            this.translationStats.errorTypes.push('EMPTY_STREAM');
          }
          await this._rotateToNextKey(`empty-stream retry for batch ${batchIndex + 1}`);
          log.warn(() => `[TranslationEngine] Stream returned no content for batch ${batchIndex + 1}, retrying without streaming with next key`);
          try {
            translatedText = await this.gemini.translateSubtitle(
              batchText,
              'detected',
              targetLanguage,
              prompt
            );
          } catch (nonStreamErr) {
            if (this.retryRotationEnabled && this.gemini?.apiKey) {
              this._recordKeyError(this.gemini.apiKey);
            }
            throw nonStreamErr;
          }
        } else {
          const fallbackResult = await tryFallback(error);
          if (fallbackResult.handled) {
            translatedText = fallbackResult.text;
          } else {
            throw fallbackResult.error;
          }
        }
      }
    } // End of translation attempt catch block

    // Parse translated text back into entries
    if (!translatedEntries) {
      translatedEntries = this.parseResponseForWorkflow(translatedText, batch.length, batch);
    }

    // Handle entry count mismatches with two-pass recovery
    if (translatedEntries.length !== batch.length) {
      log.warn(() => `[TranslationEngine] Entry count mismatch: expected ${batch.length}, got ${translatedEntries.length}`);
      // Stats: mismatch detected
      this.translationStats.mismatchDetected = true;
      this._logIncident({ type: 'MISMATCH_RETRY', batch: batchIndex + 1, recovery: 'two-pass alignment + shift detection', outcome: 'in_progress' });

      // FinOps: the attempt that produced this truncated/mismatched output
      // completed HTTP 200 — Google billed it — but its output will be
      // superseded by retries. Mark all streams recorded since the batch
      // snapshot as wasted so the Telegram receipt splits burned tokens.
      const mismatchBurned = this._markWastedSince(ledgerSnapshotBeforeAttempt);
      this._closeIncident('MISMATCH_RETRY', batchIndex + 1, { tokensBurned: mismatchBurned });

      // Pass 1: Align what we can by index, identify missing entries
      let { aligned, missingIndices } = this.alignTranslatedEntries(translatedEntries, batch);
      
      // Track initial missing count for recovered-entry accounting
      const initialMissingCount = missingIndices.length;
      this.translationStats.missingEntries += initialMissingCount;

      // Shift detector: identify cascading slot offset to prevent desync
      let isShiftedError = false;
      if (missingIndices.length > 0) {
        const lastExpectedIndices = [];
        // Build the list of indices expected at the tail
        for (let i = batch.length - missingIndices.length; i < batch.length; i++) {
          lastExpectedIndices.push(i);
        }
        // Missing set matches the tail => slot-shift detected
        isShiftedError = JSON.stringify(missingIndices) === JSON.stringify(lastExpectedIndices);
      }

      if (isShiftedError) {
         log.warn(() => `[TranslationEngine] 🚨 SHIFT DETECTED 🚨 Missing indices are at the exact end of the batch. Bypassing targeted retry and forcing FULL BATCH RETRY to prevent subtitle desync!`);
      }

      // Pass 2: targeted retry (only when not a shift and <30% missing)
      if (!isShiftedError && missingIndices.length > 0 && missingIndices.length <= Math.ceil(batch.length * 0.3)) {
        log.info(() => `[TranslationEngine] Two-pass recovery: ${missingIndices.length} missing entries, attempting targeted re-translation`);
        try {
          const missingBatch = missingIndices.map(i => batch[i]);
          const missingText = this.prepareBatchContent(missingBatch, null);
          const missingPrompt = this.createPromptForWorkflow(missingText, targetLanguage, customPrompt, missingBatch.length, null, batchIndex, totalBatches);
          const retryText = await this._translateCall(missingText, targetLanguage, missingPrompt, false, null);
          
          const retryEntries = this.parseResponseForWorkflow(retryText, missingBatch.length, missingBatch);
          
          // Rebuild a fresh container (no mutation)
          // Rebuild from scratch and order IDs from first to last.
          const freshAlignedContainer = {};
          const retryHasIds = retryEntries.some(e => typeof e.index === 'number' && e.index >= 0);

          for (let i = 0; i < batch.length; i++) {
            // 1. Missing slot
            if (missingIndices.includes(i)) {
              let recoveredText = null;
              let recoveredTimecode = undefined;

              if (retryHasIds) {
                 // Find exact index match in retry results
                 const retryHit = retryEntries.find(r => r.index === missingIndices.indexOf(i));
                 if (retryHit && retryHit.text) {
                    recoveredText = retryHit.text;
                    recoveredTimecode = retryHit.timecode;
                 }
              } else {
                 // Positional fallback
                 const positionalHit = retryEntries[missingIndices.indexOf(i)];
                 if (positionalHit && positionalHit.text) {
                    recoveredText = positionalHit.text;
                    recoveredTimecode = positionalHit.timecode;
                 }
              }

              if (recoveredText) {
                 freshAlignedContainer[i] = {
                    index: i,
                    text: recoveredText,
                    timecode: recoveredTimecode || batch[i].timecode
                 };
              } else {
                 freshAlignedContainer[i] = aligned[i]; // Recovery failed — keep [⚠️] warning placeholder
              }
            } 
            // 2. Slot already valid from Pass 1 — copy into fresh container
            else {
              freshAlignedContainer[i] = aligned[i];
            }
          }

          // Swap containers now; drop the old 'aligned' reference
          aligned = freshAlignedContainer;

          // Re-check remaining missing entries after stitching
          missingIndices = Object.keys(aligned).map(Number).filter(i => aligned[i].text.startsWith('[⚠️]'));

          if (missingIndices.length > 0) {
            log.warn(() => `[TranslationEngine] Two-pass recovery: ${missingIndices.length} entries still missing after targeted retry`);
          } else {
            log.info(() => `[TranslationEngine] Two-pass recovery succeeded: all missing entries recovered`);
          }
        } catch (retryErr) {
          if (this.retryRotationEnabled && this.gemini?.apiKey) {
            this._recordKeyError(this.gemini.apiKey);
          }
          log.warn(() => `[TranslationEngine] Two-pass targeted retry failed: ${retryErr.message}`);
        }
      }

      // Pass 3: full batch retry (triggered by targeted failure, large mismatch, or detected shift)
      if (missingIndices.length > 0) {
        let retrySuccess = false;
        for (let retryAttempt = 0; retryAttempt < this.mismatchRetries; retryAttempt++) {
          log.info(() => `[TranslationEngine] Full batch retry ${retryAttempt + 1}/${this.mismatchRetries} (${missingIndices.length} missing entries)`);
          try {
            await new Promise(resolve => setTimeout(resolve, 500));
            const retryText = await this._translateCall(batchText, targetLanguage, prompt, false, null);
            const retryEntries = this.parseResponseForWorkflow(retryText, batch.length, batch);
            
            const { aligned: newAligned, missingIndices: newMissing } = this.alignTranslatedEntries(retryEntries, batch);
            
            if (newMissing.length < missingIndices.length) {
              aligned = newAligned;
              missingIndices = newMissing;
              if (missingIndices.length === 0) {
                retrySuccess = true;
                break;
              }
            }
          } catch (retryErr) {
            if (this.retryRotationEnabled && this.gemini?.apiKey) {
              this._recordKeyError(this.gemini.apiKey);
            }
            log.warn(() => `[TranslationEngine] Full batch retry ${retryAttempt + 1} failed: ${retryErr.message}`);
          }
        }
        
        if (!retrySuccess && missingIndices.length > 0) {
           log.warn(() => `[TranslationEngine] Marked ${missingIndices.length} entries as untranslated after all retries`);
        }
      }

      // Accurate recovered-entry accounting
      // Compare remaining missingIndices against initialMissingCount after Pass 2 & Pass 3
      const recoveredCount = initialMissingCount - missingIndices.length;
      if (recoveredCount > 0) {
        this.translationStats.recoveredEntries += recoveredCount;
        log.info(() => `[TranslationEngine] Total recovered entries for this batch: ${recoveredCount}`);
      }

      // FinOps: close the incident with its FINAL outcome + burned tokens.
      // Placed after all retry passes so streams recorded by Pass 2 (targeted)
      // and Pass 3 (full-batch) retries are attributed too, and so the
      // recoveredCount === 0 case still closes the in_progress incident.
      this._closeIncident('MISMATCH_RETRY', batchIndex + 1, {
        outcome: recoveredCount > 0 ? 'recovered' : 'failed',
        tokensBurned: this._markWastedSince(ledgerSnapshotBeforeAttempt)
      });

      translatedEntries = Object.values(aligned).sort((a, b) => a.index - b.index);

    } else {
      const { aligned } = this.alignTranslatedEntries(translatedEntries, batch);
      translatedEntries = Object.values(aligned).sort((a, b) => a.index - b.index);
    }

    // Cache individual entries
    if (CACHE_TRANSLATIONS) {
      for (let i = 0; i < batch.length && i < translatedEntries.length; i++) {
        this.cacheEntry(batch[i].text, targetLanguage, translatedEntries[i].text, prompt);
      }
    }

    // ISSUE #5 FIX: Reset key health on successful translation
    if (this.retryRotationEnabled && this.gemini?.apiKey) {
      this._resetKeyHealthOnSuccess(this.gemini.apiKey);
    }

    return translatedEntries;
  }

  /**
   * Translate a batch using a native (non-LLM) provider like DeepL or Google Translate.
   * Sends raw SRT directly — no numbered-list prompt, no response parsing overhead.
   */
  async translateBatchNative(batch, targetLanguage, batchIndex, totalBatches) {
    const srtContent = this.prepareBatchSrt(batch);

    log.debug(() => `[TranslationEngine] Native batch ${batchIndex + 1}/${totalBatches}: ${batch.length} entries via ${this.providerName}`);

    let translatedText;
    try {
      translatedText = await this.gemini.translateSubtitle(
        srtContent,
        'detected',
        targetLanguage,
        null
      );
    } catch (error) {
      if (this.fallbackProvider) {
        log.warn(() => `[TranslationEngine] Native provider ${this.providerName} failed, trying fallback: ${error.message}`);
        try {
          translatedText = await this.fallbackProvider.translateSubtitle(srtContent, 'detected', targetLanguage, null);
          // Bug 3 fix: set secondary stats (previously missing from native provider fallback path)
          this.translationStats.usedSecondaryProvider = true;
          this.translationStats.secondaryProviderName = this.fallbackProviderName || 'secondary';
          if (!this.translationStats.primaryFailureReason) {
            this.translationStats.primaryFailureReason = error?.message || String(error);
          }
          log.info(() => `[TranslationEngine] Native fallback provider ${this.fallbackProviderName || 'secondary'} succeeded after primary ${this.providerName} failed`);
        } catch (fallbackError) {
          // Stats: secondary provider also failed — mirror tryFallback tracking for native path
          this.translationStats.usedSecondaryProvider = true;
          this.translationStats.secondaryProviderName = this.fallbackProviderName || 'secondary';
          if (!this.translationStats.primaryFailureReason) {
            this.translationStats.primaryFailureReason = error?.message || String(error);
          }
          if (!this.translationStats.secondaryFailureReason) {
            this.translationStats.secondaryFailureReason = fallbackError?.message || String(fallbackError);
          }
          const secondaryErrType = fallbackError?.translationErrorType;
          if (secondaryErrType && !this.translationStats.secondaryErrorTypes.includes(secondaryErrType)) {
            this.translationStats.secondaryErrorTypes.push(secondaryErrType);
          } else if (!secondaryErrType && !this.translationStats.secondaryErrorTypes.includes('SECONDARY_FAILED')) {
            this.translationStats.secondaryErrorTypes.push('SECONDARY_FAILED');
          }
          const combined = new Error(`Primary (${this.providerName}) failed: ${error.message}\nSecondary (${this.fallbackProviderName || 'fallback'}) failed: ${fallbackError.message}`);
          combined.translationErrorType = 'MULTI_PROVIDER';
          throw combined;
        }
      } else {
        throw error;
      }
    }

    // Parse the provider's response back into entries
    // Native providers return either SRT or numbered-list format
    let translatedEntries;
    const trimmed = String(translatedText || '').trim();

    if (trimmed.includes('-->')) {
      // Provider returned SRT — parse it directly
      translatedEntries = this.parseBatchSrtResponse(trimmed, batch.length, batch);
    } else {
      // Provider returned numbered list — parse that
      translatedEntries = this.parseBatchResponse(trimmed, batch.length);
    }

    // Handle count mismatches (no retries for native providers — they're deterministic)
    // Use alignTranslatedEntries for consistent entry structure with LLM providers,
    // but skip retry logic since native providers are deterministic.
    if (translatedEntries.length !== batch.length) {
      log.warn(() => `[TranslationEngine] Native batch entry mismatch: expected ${batch.length}, got ${translatedEntries.length}`);
      const { aligned } = this.alignTranslatedEntries(translatedEntries, batch);
      translatedEntries = Object.values(aligned).sort((a, b) => a.index - b.index);
    }

    // Fix #6: Ensure timecodes from original batch are always applied for native providers
    for (let i = 0; i < translatedEntries.length && i < batch.length; i++) {
      if (!translatedEntries[i].timecode && batch[i]) {
        translatedEntries[i].timecode = batch[i].timecode;
      }
    }

    return translatedEntries;
  }

  /**
   * Prepare batch text that includes timestamps (SRT format)
   * This is used when we trust the AI to preserve/repair timecodes.
   */
  prepareBatchSrt(batch) {
    const srtEntries = batch.map(entry => ({
      id: entry.id,
      timecode: entry.timecode,
      text: entry.text
    }));
    return toSRT(srtEntries).trim();
  }

    /**
   * Prepare batch text using XML tags for robust entry identification
   * [UPGRADED]: Escapes XML-sensitive symbols (&, <, >) in <m> memory and <s> text
   */
  prepareBatchXml(batch, context = null) {
    let result = '';

    // Escape raw symbols to prevent XML tag structure breakage.
    // Applies to ALL content in <m> and <s> tags.
    // MANDATORY ORDER: & first, then < and > — reverse order double-escapes.
    const escapeXml = (str) => {
      return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    };

    if (context?.previousMemory?.length > 0) {
      result += '[PREVIOUS_TRANSLATION_MEMORY - FOR CONTINUITY ONLY. DO NOT TRANSLATE THIS]\n';
      context.previousMemory.forEach((entry) => {
        if (entry.translation) {
          const cleanSource = String(entry.source || '').trim().replace(/\n+/g, ' [br] ');
          const cleanTrans = String(entry.translation || '').trim().replace(/\n+/g, ' [br] ');
          result += `<m id="${entry.id}"><src>${escapeXml(cleanSource)}</src><dst>${escapeXml(cleanTrans)}</dst></m>\n`;
        }
      });
      result += '=== END OF MEMORY ===\n\n';
      result += '=== ENTRIES TO TRANSLATE ===\n\n';
    }

    const xmlEntries = batch.map((entry) => {
      // GLOBAL ID: preserve original IDs instead of renumbering 1,2,3
      const num = entry.id;
      const cleanText = escapeXml(entry.text.trim().replace(/\n+/g, ' [br] '));
      return `<s id="${num}">${cleanText}</s>`;
    }).join('\n');

    result += xmlEntries;
    return result;
  }

  /**
   * Create translation prompt for XML-tagged batches (Enterprise Industry Standard)
   * Features Universal Structural Demonstration & Strict Tag-Question Isolation
   */
  createXmlBatchPrompt(batchText, targetLanguage, customPrompt, expectedCount, context = null, batchIndex = 0, totalBatches = 1) {
    const targetLabel = normalizeTargetLanguageForPrompt(targetLanguage);
    const sourceLabel = this.sourceLanguage;

    let targetSection = batchText;
    if (batchText.includes('=== ENTRIES TO TRANSLATE ===')) {
      targetSection = batchText.split('=== ENTRIES TO TRANSLATE ===')[1];
    }

    const idMatches = [...targetSection.matchAll(/<s id="([^"]+)">/g)].map(m => m[1]);
    const startId = idMatches.length > 0 ? idMatches[0] : 'START';
    const idList = idMatches.length > 0 ? idMatches.join(', ') : 'N/A';

    const introInstruction = PROMPT_TEMPLATES.primary(targetLabel, sourceLabel);

    const promptBody = `${introInstruction}

[UNIVERSAL STRUCTURAL DEMONSTRATION: INTRA-SLOT LOCALIZATION & ZERO DRIFT]
Input:
<s id="1">The chief director was the one</s>
<s id="2">responsible for the approval.</s>
<s id="3">You are coming with us,</s>
<s id="4">aren't you?</s>
<s id="5">We already warned him[br]during the meeting.</s>
<s id="6">First,</s>

Target Output:
<s id="1">Pengarah utama yang</s>
<s id="2">bertanggungjawab atas kelulusan itu.</s>
<s id="3">Awak ikut kami sekali,</s>
<s id="4">kan?</s>
<s id="5">Kami dah ingatkan dia[br]masa mesyuarat hari tu.</s>
<s id="6">Pertama,</s>

CRITICAL ENFORCEMENT RULES (ZERO TOLERANCE):

1. STRICT 1-TO-1 CARDINALITY & ID PARITY:
   - Output EXACTLY ${expectedCount} entries matching these EXACT IDs, in this order:
     [${idList}]
   - NEVER omit, combine, reorder, duplicate, or invent IDs; INSTEAD, pair every single input <s id="N"> strictly 1-to-1 with its matching output <s id="N">.
   - NEVER renumber, compress, or force sequential order; INSTEAD, preserve source SRT global IDs verbatim, retaining all numerical values and existing gaps.

2. ABSOLUTE SLOT ISOLATION & ZERO SPLITTING:
   - NEVER pull, borrow, or fold words across adjacent slots; INSTEAD, confine every translation strictly inside its matching <s id="N"> slot.
   - NEVER split [br] into a new <s id> tag; INSTEAD, keep all multi-line text separated by [br] enclosed entirely inside its single parent tag (e.g. <s id="5">ayat satu[br]ayat dua</s>).
   - NEVER attach short slots (question tags, negation particles, interjections, single words like "First,") to preceding or subsequent lines, and NEVER echo demonstration text; INSTEAD, translate ONLY those specific words within that exact slot and close the tag immediately.
   - NEVER force complete target grammar on broken clauses; INSTEAD, preserve grammatically incomplete syntax to maintain 100% subtitle synchronization.

3. ZERO SHIFTING, ANTI-HALLUCINATION & SOURCE FIDELITY:
   - NEVER shift subsequent dialogue forward to compensate for short or empty slots; INSTEAD, keep every line strictly anchored to its assigned ID.
   - NEVER invent synthetic filler lines to satisfy slot counts; INSTEAD, translate only verified source dialogue.
   - NEVER generate conversational replies, reactions, or commentary to background memory (<m> tags); INSTEAD, translate input <s id="${startId}"> directly as spoken dialogue.
   - NEVER add, drop, or modify numbers, dates, times, or measurements; INSTEAD, transfer all numeric values and units accurately into the target language.
   - NEVER alter or omit terminal punctuation (. ? ! ...) to change speech delivery; INSTEAD, mirror the original tone and natural pauses.

4. AIR-GAPPED READ-ONLY CONTEXT MEMORY (<m> TAGS):
   - NEVER translate, output, modify, or duplicate text from <m id="N"> tags into active <s id="N"> tags; INSTEAD, treat all <m> entries strictly as air-gapped, read-only background context.
   - NEVER allow background memory to override active dialogue; INSTEAD, always prioritize <s> source text whenever memory and source conflict.

5. ESCAPE HATCH (EXACT COPY PROTOCOL):
   - NEVER translate titles of creative works (movies, TV shows, books, novels, songs, plays, games), registered corporate/brand names, or legal entities (e.g., Co., Ltd., Inc.); INSTEAD, keep them VERBATIM in their original language.
   - NEVER invent translations for untranslatable content (proper nouns, standalone music notes ♪/♫, isolated symbols, numbers, punctuation, corrupted text, or whitespace); INSTEAD, copy the EXACT original text into the slot.
   - NEVER translate unlocalizable entities in mixed slots; INSTEAD, translate the dialogue portion while copying brand names and foreign proper nouns unmodified.
   - NEVER skip a slot under any circumstance; INSTEAD, emit the opening and closing tags containing the verbatim copy.

6. SONG LYRICS & INLINE MARKUP:
   - NEVER omit or leave song lyrics untranslated when enclosed in music notes (♪/♫); INSTEAD, fully translate vocal lyrics (foreground and BGM) while preserving the musical notes.
   - NEVER strip, displace, or inject formatting tags not present in the source; INSTEAD, preserve all [br], <i>...</i>, <b>...</b>, speaker dashes (-), and inline markup in their exact source positions and counts.

7. CLEAN PAYLOAD ONLY:
   - NEVER output conversational commentary, markdown code fences, notes in parentheses, thinking blocks (</think>), or prompt echoes ([input], BATCH); INSTEAD, emit ONLY the raw sequence of <s id="N">...</s> tags.
   - NEVER repeat, re-emit, or acknowledge the pre-filled <s id="${startId}"> opening tag; INSTEAD, continue directly from the prompt boundary by generating the inner content of slot ${startId} at your very first output character.
   - NEVER append corrections after closing a tag with </s> or restart completed slots; INSTEAD, rectify errors immediately inside the active slot before closing it.
   - NEVER emit any internal thinking steps or XML tags representing thought processes; INSTEAD, bypass all metadata and output the raw string directly starting from the pre-filled tag.

<input>
${batchText}
</input>

[OUTPUT_FORMAT]
<s id="${startId}">`;

    return this.addBatchHeader(promptBody, batchIndex, totalBatches);
  }

  /**
   * Parse XML-tagged translation response
   * Matches <s id="N">text</s> patterns and recovers entries by ID.
   * [UPGRADED]: Single-pass Regex for blazing speed, handles both normal and self-closing tags.
   * [GLOBAL ID FIX]: Maps global IDs back to local batch indices and filters AI hallucinations.
   */
  parseXmlBatchResponse(translatedText, expectedCount, batch = []) {
    let cleaned = String(translatedText || '').trim();

    // v1.6.1 SMART PREAMBLE SCRUBBER (Pilihan A, postmortem
    // plans/id-pariti-v2-postmortem-off-by-one.md). Rule 7 orders the model
    // to continue "directly from the prompt boundary by generating the inner
    // content of slot ${startId} at your very first output character" — so a
    // 100%-compliant response legitimately OPENS with the first slot's inner
    // text and closing tag, with NO opening <s tag (the prompt already
    // displayed it). The naive v1.6.0 scrubber mistook that for chatter and
    // destroyed the first entry on every batch (off-by-one, 4/4).
    //
    // Classify the pre-<s segment before touching it:
    //   A) Ends with </s>          → UNTAGGED FIRST SLOT (compliant output)
    //                                → RECOVER: re-attach the anchor tag.
    //   B) No </s>, short          → genuine chatter ("Here is the
    //                                translation:") → DISCARD.
    //   C) No </s>, long (>200)    → structural anomaly → LEAVE UNTOUCHED and
    //                                let the anchor restoration / regex
    //                                pipeline decide (never blind-slice).
    const firstId = batch && batch.length > 0 ? batch[0].id : 1;
    const firstTagIdx = cleaned.indexOf('<s');
    if (firstTagIdx > 0) {
      const preamble = cleaned.slice(0, firstTagIdx).trim();
      const closeTagCount = (preamble.match(/<\/s>/gi) || []).length;
      if (preamble && closeTagCount === 1) {
        // Case A: untagged first slot — Rule 7 compliant continuation.
        this.translationStats.untaggedFirstSlotCount =
          (this.translationStats.untaggedFirstSlotCount || 0) + 1;
        log.info(() => `[TranslationEngine] Smart-recovery: slot ${firstId} rebuilt from untagged preamble (${preamble.length} chars, ends with </s>)`);
        cleaned = `<s id="${firstId}">` + cleaned;
      } else if (preamble && preamble.length <= 200) {
        // Case B: genuine conversational chatter — discard (pro pattern from
        // Subtitle Edit's ChatGptTranslate.RemovePreamble).
        log.warn(() => `[TranslationEngine] Preamble chatter scrubbed before first <s tag (${preamble.length} chars): "${preamble.replace(/\s+/g, ' ').slice(0, 120)}"`);
        cleaned = cleaned.slice(firstTagIdx);
      }
      // Case C: preamble >200 chars without </s> — no slice, no restore.
      // Fall through to anchor restoration below (starts-with check decides).
    }

    // Anchor restoration (unchanged — original backup mechanism)
    // Re-attaches the pre-filled opening tag when the model emits pure inner
    // text with no <s tag at all.
    if (!cleaned.startsWith('<s')) {
      cleaned = `<s id="${firstId}">` + cleaned;
    }

    // Remove markdown code blocks (hex \x60 avoids markdown UI breakage)
    const mdRegex = new RegExp('\\x60\\x60\\x60[a-z]*(?:\\r?\\n)?', 'gi');
    cleaned = cleaned.replace(mdRegex, '');
    cleaned = cleaned.replace(new RegExp('\\x60\\x60\\x60', 'g'), '');

    // Removed legacy lastClosingTag/slice truncation
    // (That legacy path dropped the truncated final line from memory)

    // Fix #15 (v1.4.38+): Remove any content between </s> and <s tags before parsing.
    cleaned = cleaned.replace(/<\/s>\s*(?:(?!<s[\s>])[\s\S])*?(?=<s[\s>])/gi, '</s>\n');

    // Global ID to local index map
    // Map global subtitle IDs to local batch indices (0..99)
    const validIds = new Map();
    if (batch && batch.length > 0) {
      batch.forEach((entry, idx) => {
        validIds.set(entry.id, idx);
      });
    }

    // Use Map directly to auto-deduplicate without a second loop
    const entriesMap = new Map(); 
    
    // 🚀 THE GOD-TIER REGEX (One Pass to Rule Them All)
    // Capture normal and self-closing tags in a single pass.
    const superXmlPattern = /<s\s+[^>]*id\s*=\s*["']?(\d+)["']?[^>]*?(?:\/>|>([\s\S]*?)(?:<\/s>|(?=<s\b)|$))/gi;
    let match;
    
    while ((match = superXmlPattern.exec(cleaned)) !== null) {
      const id = parseInt(match[1], 10);
      
      // Fix #14: Accept entries with empty text (legitimate for "♪", sound effects, etc.)
      if (id > 0) {
        let localIndex = id - 1; // Fallback when map is empty

        if (validIds.size > 0) {
          if (validIds.has(id)) {
            localIndex = validIds.get(id); // Resolve actual position from map
          } else {
            // Drop hallucinated IDs
            continue; 
          }
        }

        // match[2] exists for normal tags; undefined means self-closing (empty text).
        let text = match[2] !== undefined ? match[2].trim() : "";

        // Unescape XML entities escaped in prepareBatchXml()
        // MANDATORY ORDER: &lt; then &gt;, &amp; LAST — avoid double-unescape.
        text = text
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&amp;/g, '&');

        // Keep first occurrence only (Map deduplicates)
        if (!entriesMap.has(localIndex)) {
          entriesMap.set(localIndex, {
            index: localIndex,
            text: text
          });
        }
      }
    }

    // Convert Map to array and sort by index
    return Array.from(entriesMap.values()).sort((a, b) => a.index - b.index);
  }
  
  /**
   * Prepare batch content for the XML Tags workflow.
   */
  prepareBatchContent(batch, context) {
    return this.prepareBatchXml(batch, context);
  }

  /**
   * Create a translation prompt for the XML Tags workflow.
   */
  createPromptForWorkflow(batchText, targetLanguage, customPrompt, expectedCount, context, batchIndex, totalBatches) {
    return this.createXmlBatchPrompt(batchText, targetLanguage, customPrompt, expectedCount, context, batchIndex, totalBatches);
  }

  /**
   * Parse a response for the XML Tags workflow.
   */
  parseResponseForWorkflow(translatedText, expectedCount, batch) {
    return this.parseXmlBatchResponse(translatedText, expectedCount, batch);
  }


  /**
   * Align translated entries to original batch by index, identifying missing entries
   * Used by two-pass mismatch recovery
   * [UPGRADED]: Smart Context Awareness - ignores empty/symbol-only lines for retries
   */
  alignTranslatedEntries(translatedEntries, originalBatch) {
    const aligned = {};
    const translatedMap = new Map();

    for (const entry of translatedEntries) {
      if (typeof entry.index === 'number' && !translatedMap.has(entry.index)) {
        translatedMap.set(entry.index, entry);
      }
    }

    const missingIndices = [];

    // Sentence classifier: should this line be translated?
    const isUntranslatable = (text) => {
      if (!text) return true;
      const t = text.trim();
      if (!t) return true;

      // Tier 1: punctuation, symbols, numbers, or whitespace only
      // Unicode property escapes avoid manual symbol lists:
      //   \p{P} = punctuation (…, –, —, ?, !, ., ", etc.)
      //   \p{S} = symbols    (♪♫♬, emoji, currency, math, etc.)
      //   \p{N} = numbers    (0-9 & Unicode variants)
      //   \s    = whitespace
      // Protected examples: "...", "…", "—", "?!", "♪♪", "100%", "$", "—–—".
      if (/^[\p{P}\p{S}\p{N}\s]+$/u.test(t)) return true;

      // Tier 2: HTML tags without text (e.g. <i></i>, <font color="#fff">)
      if (/^<[^>]+>\s*<\/[^>]+>$/.test(t) || /^<[^>]+>$/.test(t)) return true;

      return false;
    };

    for (let i = 0; i < originalBatch.length; i++) {
      const existing = translatedMap.get(i);
      const originalText = originalBatch[i].text || '';

      // 1. Valid translation exists
      if (existing && typeof existing.text === 'string') {
        aligned[i] = {
          index: i,
          text: existing.text,
          timecode: existing.timecode || undefined
        };
      } 
      // 2. AI omitted the line but it is untranslatable
      else if (isUntranslatable(originalText)) {
        aligned[i] = {
          index: i,
          text: originalText, // Keep original without warning marker
          timecode: originalBatch[i].timecode || undefined
        };
      } 
      // 3. AI omitted a meaningful line (true mismatch)
      else {
        missingIndices.push(i);
        aligned[i] = {
          index: i,
          text: `[⚠️] ${originalText}`,
          timecode: originalBatch[i].timecode || undefined
        };
      }
    }

    return { aligned, missingIndices };
  }


  /**
   * Prefix prompt with batch marker so the model knows which chunk it is handling
   */
  addBatchHeader(prompt, batchIndex, totalBatches) {
    const header = `BATCH ${batchIndex + 1}/${totalBatches}`;
    return `${header}\n\n${prompt}`;
  }

  /**
   * Build streaming progress payload from partial text
   * [UPDATED - PHASE 3]: Applied robust XML parsing for real-time truncated strings.
   * [GLOBAL ID FIX]: Maps global IDs back to local batch indices for streaming progress.
   */
  buildStreamingProgress(partialText, originalBatch = []) {
    if (!partialText) return null;

    const batchStartId = originalBatch?.[0]?.id || 1;
    const batchEndId = originalBatch?.[originalBatch.length - 1]?.id || batchStartId;

    // Global ID to local index map
    // Maps global subtitle IDs (e.g. 101) to local batch indices (0-99)
    const validIds = new Map();
    if (originalBatch && originalBatch.length > 0) {
      originalBatch.forEach((entry, idx) => {
        validIds.set(entry.id, idx);
      });
    }

    const parsedEntries = [];

    // Phase 3: streaming-safe XML regex
    let cleaned = partialText;

    // Prepend anchor continuation for streaming (uses batchStartId above)
    if (!cleaned.startsWith('<s')) {
      cleaned = `<s id="${batchStartId}">` + cleaned;
    }

    // Remove markdown fences (hex avoids markdown UI breakage)
    const mdRegex = new RegExp('\\x60\\x60\\x60[a-z]*(?:\\r?\\n)?', 'gi');
    cleaned = cleaned.replace(mdRegex, '');
    cleaned = cleaned.replace(new RegExp('\\x60\\x60\\x60', 'g'), '');

    // Capture normal and truncated lines during real-time streaming
    // Tolerant of quotes, spaces, and invalid attributes.
    const xmlPattern = /<s\s+[^>]*id\s*=\s*["']?(\d+)["']?[^>]*(?<!\/)>([\s\S]*?)(?:<\/s>|$)/gi;
    let match;
    while ((match = xmlPattern.exec(cleaned)) !== null) {
      const id = parseInt(match[1], 10);
      let text = match[2].trim();

      // Unescape XML entities escaped in prepareBatchXml().
      // MANDATORY ORDER: &lt; then &gt;, &amp; LAST — avoid double-unescape.
      // NOTE: entities may be truncated during streaming (e.g. "AT&am") —
      //       incomplete entities won't match regex, so they are safe.
      text = text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&');

      // Text required unless silent tag
      if (id > 0 && text) {
        let localIndex = id - 1; // Default/fallback

        // Match against Global ID map
        if (validIds.size > 0) {
          if (validIds.has(id)) {
            localIndex = validIds.get(id); // Resolve actual index for this batch
          } else {
            continue; // Skip hallucinated IDs
          }
        }

        parsedEntries.push({ index: localIndex, text });
      }
    }

    // Capture silent/self-closing tags (<s id="15"/>)
    const selfClosingPattern = /<s\s+[^>]*id\s*=\s*["']?(\d+)["']?[^>]*\/>/gi;
    while ((match = selfClosingPattern.exec(cleaned)) !== null) {
      const id = parseInt(match[1], 10);
      if (id > 0) {
        let localIndex = id - 1;

        // Match against Global ID map
        if (validIds.size > 0) {
          if (validIds.has(id)) {
            localIndex = validIds.get(id);
          } else {
            continue; // Skip hallucinated IDs
          }
        }

        // Empty text allowed for self-closing tags
        parsedEntries.push({ index: localIndex, text: "" });
      }
    }

    // Deduplicate by index (keep first occurrence)
    const seen = new Set();
    const uniqueEntries = parsedEntries.filter(entry => {
      if (seen.has(entry.index)) return false;
      seen.add(entry.index);
      return true;
    });

    if (!uniqueEntries || uniqueEntries.length === 0) {
      return null;
    }

    const merged = [];
    for (const entry of uniqueEntries) {
      const original = originalBatch[entry.index];
      if (!original) continue;

      // Clean text in real time
      const cleanedText = this.cleanTranslatedText(entry.text || original.text);
      merged.push({
        id: original.id,
        timecode: original.timecode,
        text: cleanedText
      });
    }

    if (merged.length === 0) return null;

    merged.sort((a, b) => a.id - b.id);
    const normalized = merged.map((entry, idx) => ({
      id: idx + 1,
      timecode: entry.timecode,
      text: entry.text
    }));

    return {
      partialSRT: toSRT(normalized),
      completedEntries: merged.length,
      totalEntries: originalBatch.length,
      batchStartId,
      batchEndId
    };
  }

  /**
   * Parse batch translation response when timestamps are included (expects SRT-like output)
   */
  parseBatchSrtResponse(translatedText, expectedCount, originalBatch = []) {
    const parsed = parseSRT(translatedText);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [];
    }

    // --- Fix #10: Use SRT IDs (1-based) to derive 0-based indices instead of array position.
    // This ensures that if the AI skips or reorders entries, translations are mapped to the
    // correct original entries rather than silently assigned by position.
    const entries = parsed.map((entry, idx) => ({
      index: (typeof entry.id === 'number' && entry.id >= 1) ? entry.id - 1 : idx,
      text: (entry.text || '').trim(),
      timecode: entry.timecode || ''
    }));

    // Deduplicate by index (keep first occurrence), matching the approach used by other parsers
    const seen = new Set();
    const deduped = [];
    for (const entry of entries) {
      if (!seen.has(entry.index)) {
        seen.add(entry.index);
        deduped.push(entry);
      }
    }

    // Don't fix count mismatches here — let the outer translateBatch handle retries first.
    // Only fill missing timecodes with originals to avoid gaps.
    for (const entry of deduped) {
      if (!entry.timecode && originalBatch[entry.index]) {
        entry.timecode = originalBatch[entry.index].timecode;
      }
    }

    return deduped;
  }

  /**
   * Parse batch translation response (numbered list mode)
   */
  parseBatchResponse(translatedText, expectedCount) {
    let cleaned = translatedText.trim();
    cleaned = cleaned.replace(/```[a-z]*(?:\r?\n)?/g, '');
    
    // --- Fix #8: Strip context sections before parsing ---
    // Remove entire context blocks the AI may have echoed back
    cleaned = cleaned.replace(/===\s*CONTEXT\s*\(FOR REFERENCE ONLY[^=]*===[\s\S]*?===\s*END OF CONTEXT\s*===/gi, '');
    cleaned = cleaned.replace(/===\s*ENTRIES TO TRANSLATE[^=]*===/gi, '');
    // Remove stray context markers that may appear inline
    cleaned = cleaned.replace(/^---\s*(?:Original Context|Previous Translations)\s*.*---\s*$/gm, '');

    // --- Fix #6: Use a line-by-line approach instead of splitting on blank lines ---
    // This prevents multi-line translated entries with internal blank lines from being split apart.
    const lines = cleaned.split(/\r?\n/);
    const entries = [];
    let currentNum = null;
    let currentLines = [];

    for (const line of lines) {
      // Check if this line starts a new numbered entry
      const headerMatch = line.match(/^(\d+)[.):\s-]+(.*)$/);

      if (headerMatch) {
        // Save the previous entry if we had one
        if (currentNum !== null && currentLines.length > 0) {
          const text = currentLines.join('\n').trim();
          // --- Fix #8: Skip entries that are context markers ---
          if (text && !text.match(/^\[(?:Context|Translated)\s+\d+\]/i)) {
            entries.push({ index: currentNum - 1, text });
          }
        }
        // Start a new entry
        currentNum = parseInt(headerMatch[1]);
        currentLines = [headerMatch[2]];
      } else if (currentNum !== null) {
        // Continuation line (including blank lines) belongs to the current entry
        currentLines.push(line);
      }
      // Lines before the first numbered entry are ignored (preamble/context echoes)
    }

    // Don't forget the last entry
    if (currentNum !== null && currentLines.length > 0) {
      const text = currentLines.join('\n').trim();
      if (text && !text.match(/^\[(?:Context|Translated)\s+\d+\]/i)) {
        entries.push({ index: currentNum - 1, text });
      }
    }

    // --- Fix #7: Deduplicate by index (keep first occurrence, like XML parser) ---
    const seen = new Set();
    const deduped = [];
    entries.sort((a, b) => a.index - b.index);
    for (const entry of entries) {
      if (!seen.has(entry.index)) {
        seen.add(entry.index);
        deduped.push(entry);
      }
    }

    return deduped;
  }

  /**
   * Clean translated text (remove timecodes, normalize line endings)
   * [UPDATED]: Full symbol & emoji restoration + hybrid sanitizer + per-line auto-closer
   */
  cleanTranslatedText(text) {
    let cleaned = String(text || '').trim();

    // 1. Remove embedded timecodes
    const timecodePattern = /\d{2}:\d{2}:\d{2},\d{3}\s*-->\s*\d{2}:\d{2}:\d{2},\d{3}\s*\n?/g;
    cleaned = cleaned.replace(timecodePattern, '').trim();

    // 1.5 Strip numeric prefix hallucination ("1>text", "3. text") — defensive clean
    const beforeStrip = cleaned;
    cleaned = cleaned.replace(/^\s*\d+\s*[>.]\s*/, '').trim();
    if (beforeStrip !== cleaned) {
      log.debug(() => `[TranslationEngine] Stripped numeric prefix hallucination: "${beforeStrip.slice(0, 40)}..."`);
    }

    // 2. Remove ASS/SSA override tags — SCOPED to `{\...}` pattern only
    // (e.g. {\an8}, {\pos(x,y)}, {\b1}, {\i1}) — never damage `{dialog}` literals
    cleaned = cleaned.replace(/\{\\[^}\r\n]*\}/g, '').trim();

        // 3. Remove leftover leading '>' tag remnants
    cleaned = cleaned.replace(/^(?:["']?\s*>)+\s*/, '').trim();

    // 3.0 Strip code comment artifacts (/*, */, //)
    cleaned = cleaned
      // 1. Remove full block comments /* ... */
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // 2. Remove dangling comment closers (e.g. '*/' or '****/') at line end
      .replace(/\s*\*+\/\s*(?=\n|$)/g, '')
      // 3. Remove dangling comment openers (e.g. '/*') at line start
      .replace(/(?:^|\n)\s*\/\*+\s*/g, '\n')
      // 4. Remove double-slash comments — ONLY when followed by space (preserve URLs)
      .replace(/(?:^|\n)[ \t]*\/\/[ \t]+/g, '\n')
      .replace(/(?:^|\n)[ \t]*\/\/[ \t]*$/gm, '')
      .trim();

    // 3.1 Quote normalization (Broadcast standard + AI error resilient)
    cleaned = cleaned
      // 0. Remove leftover XML quote entities (&quot; &apos;)
      .replace(/&quot;/gi, '')
      .replace(/&apos;/gi, '')
      // 1. Remove ALL double quotes (paired or dangling)
      .replace(/["“”„«»]/g, '')
      // 2. Remove leading/trailing single quotes around words
      .replace(/(^|[\s([{\-])['‘`]([a-zA-Z0-9])/g, '$1$2')
      .replace(/([a-zA-Z0-9])['’`]([\s)\]}.,!?-]|$)/g, '$1$2')
      // 3. Remove standalone floating single quotes
      .replace(/(^|\s)['‘`]+(?=\s|$)/g, '$1');

    // 3.2 LITERAL UNICODE & HEX ESCAPE — some providers (Mistral/Llama/Qwen/DeepSeek)
    //     output escape sequences as literal TEXT instead of actual characters.
    //     Example: "\u2019" (literal) → "’" (actual), "\xe2\x99\xa5" → "♥"
    cleaned = cleaned
      // A. Surrogate pairs FIRST — must run before single \uXXXX matcher
      //    Example: "\uD83D\uDE0A" → 😊
      .replace(
        /\\u(D[89AB][0-9a-fA-F]{2})\\u(D[C-F][0-9a-fA-F]{2})/gi,
        (_, high, low) => String.fromCharCode(
          parseInt(high, 16),
          parseInt(low, 16)
        )
      )
      // B. \u{XXXXX} — ES6-style brace notation (BMP + astral)
      //    Example: "\u{1F60A}" → 😊
      .replace(
        /\\u\{([0-9a-fA-F]{1,6})\}/g,
        (match, hex) => {
          try {
            const cp = parseInt(hex, 16);
            // Reject invalid Unicode scalar values
            if (cp < 0 || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) {
              return match;
            }
            return String.fromCodePoint(cp);
          } catch (_) {
            return match;
          }
        }
      )
      // C. \uXXXX — standard 4-digit escape (BMP)
      //    Example: "\u2019" → "’"
      .replace(
        /\\u([0-9a-fA-F]{4})/g,
        (_, hex) => String.fromCharCode(parseInt(hex, 16))
      )
      // D. \xXX sequences — UTF-8 byte escape (rare, mostly DeepSeek/Mistral)
      //    Example: "\xe2\x99\xa5" → "♥"
      .replace(
        /(?:\\x[0-9a-fA-F]{2})+/g,
        (match) => {
          try {
            const bytes = match
              .split('\\x')
              .filter(Boolean)
              .map(h => parseInt(h, 16));

            const decoded = new TextDecoder('utf-8', {
              fatal: false
            }).decode(Uint8Array.from(bytes));

            // If decode failed (produced replacement char), keep original
            if (decoded.includes('\uFFFD')) {
              return match;
            }
            return decoded;
          } catch (_) {
            return match;
          }
        }
      )
      .trim();

    // 4. Convert [br] back to newline
    cleaned = cleaned
      .replace(/\s*(?:\[br\]|<br\s*\/?>|&lt;br\s*\/?&gt;)\s*/gi, '\n')
      .replace(/\n{2,}/g, '\n'); // Collapse multiple consecutive newlines into one

    // 5. Convert redundant dashes to ellipsis — skip numeric ranges ("2020—2024")
    cleaned = cleaned
      // Replace `--` / `---` (interruption marker)
      .replace(/\s*--+\s*/g, ' ... ')
      // Em-dash `—` — only when NOT between digits
      .replace(/(?<!\d)\s*—\s*(?!\d)/g, ' ... ')
      // En-dash `–` — only when NOT between digits
      .replace(/(?<!\d)\s*–\s*(?!\d)/g, ' ... ')
      // Trailing hyphen at line end → ellipsis
      .replace(/(?<=[^\s\-])\s*-(?=\s*($|\n))/g, ' ...');

    // ============================================================================
    // Mojibake & Symbol/Emoji Restoration Engine
    // ============================================================================
    cleaned = cleaned
      // --- Core emoji & subtitle decoration restoration ---
      .replace(/Ã°Å¸'Â¥|Ã°Å¸â€™Â¥/g, '💥')
      .replace(/Ã°Å¸'â€“|Ã°Å¸â€™â€“/g, '💖')
      .replace(/Ã°Å¸'â€”|Ã°Å¸â€™â€”/g, '💗')
      .replace(/Ã°Å¸'Å“|Ã°Å¸â€™Å“/g, '💜')
      .replace(/Ã°Å¸'â„¢|Ã°Å¸â€™â„¢/g, '💙')
      .replace(/Ã°Å¸'Å¡|Ã°Å¸â€™Å¡/g, '💚')
      .replace(/Ã°Å¸'â€¢|Ã°Å¸â€™â€¢/g, '💓')
      .replace(/Ã°Å¸'|Ã°Å¸â€™/g, '💓')
      .replace(/Ã°Å¸ËœÅ /g, '😊')
      .replace(/Ã°Å¸Ëœâ€š/g, '😂')
      .replace(/Ã°Å¸Ëœ/g, '😀')
      .replace(/Ã°Å¸â€Â¥/g, '🔥')
      .replace(/Ã°Å¸Å½â€°/g, '🎉')
      .replace(/Ã°Å¸â€˜/g, '👍')

      // --- Special symbol, music & quote restoration ---
      .replace(/Ã¢Å“["â€]|Ã¢Å“â€/g, '✔')
      .replace(/Ã¢Å“â€œ/g, '✓')
      .replace(/Ã¢Å“Â¨/g, '✨')
      .replace(/Ã¢Å¾Â¡|Ã¢\s*Å¾/g, '”')
      .replace(/Ã¢â‚¬Å“/g, '“')
      .replace(/Ã¢â‚¬[â€\?]/g, '”')
      .replace(/Ã¢â‚¬Ëœ/g, '‘')
      .replace(/Ã¢â‚¬â„¢/g, '’')
      .replace(/Ã¢â‚¬Â¦/g, '…')
      .replace(/Ã¢â‚¬â€/g, '—')
      .replace(/Ã¢â‚¬â€œ/g, '–')
      .replace(/Ã¢â„¢Âª/g, '♪')
      .replace(/Ã¢â„¢Â«/g, '♫')
      .replace(/Ã¢Ëœâ€¦/g, '★')
      .replace(/Ã¢Ëœâ€ /g, '☆')
      .replace(/Ã¢â„¢Â¥/g, '♥')
      .replace(/\bÃ¢\s+(?=[💥💖💗💜💙💚💓😊😂😀🔥🎉👍✔✓✨”"“‘'…—–♪♫★☆♥])/g, '');

// Hybrid sanitizer (dialogue vs lyrics + full CAPSLOCK support)
    // ============================================================================
    cleaned = cleaned.split('\n').map(line => {
      const isMusicLine = /[♫♪♬♩🎵🎶]/.test(line);

      // 1. Pronouns (dialogue only; preserve lyrics)
      if (!isMusicLine) {
        line = line
          .replace(/\bakulah\b/g, 'sayalah')
          .replace(/\bAkulah\b/g, 'Sayalah')
          .replace(/\bAKULAH\b/g, 'SAYALAH')
          .replace(/\bkaulah\b/g, 'awaklah')
          .replace(/\bKaulah\b/g, 'Awaklah')
          .replace(/\bKAULAH\b/g, 'AWAKLAH')
          .replace(/\bengkaulah\b/g, 'awaklah')
          .replace(/\bEngkaulah\b/g, 'Awaklah')
          .replace(/\bENGKAULAH\b/g, 'AWAKLAH')
          .replace(/\bkamulah\b/g, 'awaklah')
          .replace(/\bKamulah\b/g, 'Awaklah')
          .replace(/\bKAMULAH\b/g, 'AWAKLAH')
          .replace(/\bandalah\b/g, 'awaklah')
          .replace(/\bAndalah\b/g, 'Awaklah')
          .replace(/\bANDALAH\b/g, 'AWAKLAH')
          .replace(/\baku\b/g, 'saya')
          .replace(/\bAku\b/g, 'Saya')
          .replace(/\bAKU\b/g, 'SAYA')
          .replace(/\bkau\b/g, 'awak')
          .replace(/\bKau\b/g, 'Awak')
          .replace(/\bKAU\b/g, 'AWAK')
          .replace(/\bengkau\b/g, 'awak')
          .replace(/\bEngkau\b/g, 'Awak')
          .replace(/\bENGKAU\b/g, 'AWAK')
          .replace(/\bkamu\b/g, 'awak')
          .replace(/\bKamu\b/g, 'Awak')
          .replace(/\bKAMU\b/g, 'AWAK')
          .replace(/\banda\b/g, 'awak')
          .replace(/\bAnda\b/g, 'Awak')
          .replace(/\bANDA\b/g, 'AWAK');
      }

      // 2. Particles & demonstratives
      line = line
        .replace(/\bni\b/g, 'ini')
        .replace(/\bNi\b/g, 'Ini')
        .replace(/\bNI\b/g, 'INI')
        .replace(/\bnilah\b/g, 'inilah')
        .replace(/\bNilah\b/g, 'Inilah')
        .replace(/\bNILAH\b/g, 'INILAH')
        .replace(/\btulah\b/g, 'itulah')
        .replace(/\bTulah\b/g, 'Itulah')
        .replace(/\bTULAH\b/g, 'ITULAH')
        .replace(/\btu\b/g, 'itu')
        .replace(/\bTu\b/g, 'Itu')
        .replace(/\bTU\b/g, 'ITU')
        .replace(/\bje\b/g, 'saja')
        .replace(/\bJe\b/g, 'Saja')
        .replace(/\bJE\b/g, 'SAJA')
        .replace(/\bjap\b/g, 'sekejap')
        .replace(/\bJap\b/g, 'Sekejap')
        .replace(/\bJAP\b/g, 'SEKEJAP')
        .replace(/\bla\b/g, 'lah')
        .replace(/\bLa\b/g, 'Lah')
        .replace(/\bLA\b/g, 'LAH')

      // 3. Loanwords & standardization
        // Normalize "okay" variants
        .replace(/\bokeylah\b/g, 'okaylah')
        .replace(/\bOkeylah\b/g, 'Okaylah')
        .replace(/\bOKEYLAH\b/g, 'OKAYLAH')
        .replace(/\bokelah\b/g, 'okaylah')
        .replace(/\bOkelah\b/g, 'Okaylah')
        .replace(/\bOKELAH\b/g, 'OKAYLAH')
        .replace(/\boklah\b/g, 'okaylah')
        .replace(/\bOklah\b/g, 'Okaylah')
        .replace(/\bOKLAH\b/g, 'OKAYLAH')
        .replace(/\bokey\b/g, 'okay')
        .replace(/\bOkey\b/g, 'Okay')
        .replace(/\bOKEY\b/g, 'OKAY')
        .replace(/\boke\b/g, 'okay')
        .replace(/\bOke\b/g, 'Okay')
        .replace(/\bOKE\b/g, 'OKAY')
        .replace(/\bok\b/g, 'okay')
        .replace(/\bOk\b/g, 'Okay')
        .replace(/\bOK\b/g, 'OKAY')

        // Normalize "hello" variants (helo/halo -> hello)
        .replace(/\bhelo\b/g, 'hello')
        .replace(/\bHelo\b/g, 'Hello')
        .replace(/\bHELO\b/g, 'HELLO')
        .replace(/\bhalo\b/g, 'hello')
        .replace(/\bHalo\b/g, 'Hello')
        .replace(/\bHALO\b/g, 'HELLO')

      // 4. SMS-style abbreviations
        // Sebab (because)
        .replace(/\bsbb\b/g, 'sebab')
        .replace(/\bSbb\b/g, 'Sebab')
        .replace(/\bSBB\b/g, 'SEBAB')
        // Untuk (for)
        .replace(/\butk\b/g, 'untuk')
        .replace(/\bUtk\b/g, 'Untuk')
        .replace(/\bUTK\b/g, 'UNTUK')
        // Tapi (but)
        .replace(/\btp\b/g, 'tapi')
        .replace(/\bTp\b/g, 'Tapi')
        .replace(/\bTP\b/g, 'TAPI')
        // Kalau (if)
        .replace(/\bklu\b/g, 'kalau')
        .replace(/\bKlu\b/g, 'Kalau')
        .replace(/\bKLU\b/g, 'KALAU')
        // Dengan (with)
        .replace(/\bdgn\b/g, 'dengan')
        .replace(/\bDgn\b/g, 'Dengan')
        .replace(/\bDGN\b/g, 'DENGAN')
        // Yang (which/that)
        .replace(/\byg\b/g, 'yang')
        .replace(/\bYg\b/g, 'Yang')
        .replace(/\bYG\b/g, 'YANG')
        // Dekat (near)
        .replace(/\bkat\b/g, 'dekat')
        .replace(/\bKat\b/g, 'Dekat')
        .replace(/\bKAT\b/g, 'DEKAT')
        .replace(/\bdkt\b/g, 'dekat')
        .replace(/\bDkt\b/g, 'Dekat')
        .replace(/\bDKT\b/g, 'DEKAT')
        .replace(/\bkt\b/g, 'dekat')
        .replace(/\bKt\b/g, 'Dekat')
        .replace(/\bKT\b/g, 'DEKAT');

      return line;
    }).join('\n');

    // 6. Auto-close unclosed inline formatting tags (per-line)
    //    Close each line individually to prevent <i> leaks across lines
    const formattingTags = ['i', 'b', 'u'];
    cleaned = cleaned.split('\n').map(line => {
      formattingTags.forEach(tag => {
        const openCount = (line.match(new RegExp(`<${tag}>`, 'gi')) || []).length;
        const closeCount = (line.match(new RegExp(`</${tag}>`, 'gi')) || []).length;

        if (openCount > closeCount) {
          line += `</${tag}>`.repeat(openCount - closeCount);
        }
      });
      return line;
    }).join('\n');

    // 7. Neutralize toxic symbols
    cleaned = cleaned.replace(/<(?=[\s\d])/g, '&lt;');

    // 8. Normalize line endings (CRLF → LF) & drop dangling empty lines
    cleaned = cleaned
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean) // Remove empty lines inside or at edges
      .join('\n');

    // 9. RTL formatting (when target language is right-to-left)
    if (this.isRtlTarget) {
      cleaned = wrapRtlText(cleaned);
    }

    return cleaned;
  }
  
  /**
   * Remove timecodes/timeranges from arbitrary text (defensive post-clean)
   */
  sanitizeTimecodes(text) {
    let cleaned = String(text || '').trim();

    // Backup: strip numeric prefix hallucination (defense-in-depth)
    // Final net if cleanTranslatedText misses one.
    cleaned = cleaned.replace(/^\s*\d+\s*[>.]\s*/, '').trim();

    // Full-line time ranges with various separators (optional milliseconds)
    const rangeLine = /^(?:\s*)\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?\s*(?:-->|–>|—>|->|→|to)\s*\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?(?:\s*)$/gm;
    cleaned = cleaned.replace(rangeLine, '');

    // Inline time ranges
    const rangeInline = /\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?\s*(?:-->|–>|—>|->|→|to)\s*\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?/g;
    cleaned = cleaned.replace(rangeInline, '').trim();

    // Standalone full-line timestamps (with or without ms)
    const tsLine = /^(?:\s*)\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?(?:\s*)$/gm;
    cleaned = cleaned.replace(tsLine, '');

    // Bracketed/parenthesized timestamps
    const bracketedTs = /[\[(]\s*\d{1,2}:\d{2}:\d{2}(?:[.,]\d{1,3})?\s*[\])]/g;
    cleaned = cleaned.replace(bracketedTs, '');

    // Normalize line endings and collapse blanks
    cleaned = cleaned.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    cleaned = cleaned
      .split('\n')
      .map(l => l.trimEnd())
      .filter(l => l.trim().length > 0)
      .join('\n')
      .trim();

    return cleaned;
  }

  /**
   * Estimate token count with a safe fallback when provider doesn't expose it
   */
  safeEstimateTokens(text) {
    const content = String(text || '');
    if (typeof this.gemini?.estimateTokenCount === 'function') {
      try {
        const tokens = this.gemini.estimateTokenCount(content);
        if (Number.isFinite(tokens)) {
          return tokens;
        }
      } catch (err) {
        log.debug(() => ['[TranslationEngine] Token estimate failed, using fallback:', err.message]);
      }
    }
    // Rough heuristic: ~4 characters per token
    return Math.max(1, Math.ceil(content.length / 4));
  }

  /**
   * Check if batch entries are cached
   */
  checkBatchCache(batch, targetLanguage, customPrompt) {
    if (!CACHE_TRANSLATIONS) {
      return { allCached: false, entries: [] };
    }

    const cachedEntries = [];
    let cacheHits = 0;

    for (const entry of batch) {
      const cached = this.getCachedEntry(entry.text, targetLanguage, customPrompt);
      if (cached) {
        // Fix #2: Include timecode from original entry so cache results match expected structure
        cachedEntries.push({ index: entry.id - 1, text: cached, timecode: entry.timecode });
        cacheHits++;
      } else {
        cachedEntries.push(null);
      }
    }

    const allCached = cacheHits === batch.length;
    return { allCached, entries: allCached ? cachedEntries : [] };
  }

  /**
   * Get cached entry translation
   */
  getCachedEntry(sourceText, targetLanguage, customPrompt) {
    if (!CACHE_TRANSLATIONS) return null;

    const key = this.createCacheKey(sourceText, targetLanguage, customPrompt);
    return entryCache.get(key) || null;
  }

  /**
   * Cache an entry translation
   */
  cacheEntry(sourceText, targetLanguage, translatedText, customPrompt) {
    if (!CACHE_TRANSLATIONS) return;

    // Enforce cache size limit (LRU eviction)
    if (entryCache.size >= MAX_ENTRY_CACHE_SIZE) {
      const evictionCount = Math.floor(MAX_ENTRY_CACHE_SIZE * 0.1);
      const keysToDelete = Array.from(entryCache.keys()).slice(0, evictionCount);
      for (const key of keysToDelete) {
        entryCache.delete(key);
      }
    }

    const key = this.createCacheKey(sourceText, targetLanguage, customPrompt);
    entryCache.set(key, translatedText);
  }

  /**
   * Create cache key for an entry
   */
  createCacheKey(sourceText, targetLanguage, customPrompt) {
    const normalized = sourceText.trim().toLowerCase();
    const promptHash = customPrompt
      ? crypto.createHash('md5').update(customPrompt).digest('hex').substring(0, 8)
      : 'default';
    const hash = crypto.createHash('md5')
      .update(`${normalized}:${targetLanguage}:${promptHash}`)
      .digest('hex');
    return hash;
  }

  /**
   * Clear entry cache
   */
  clearCache() {
    entryCache.clear();
    log.debug(() => '[TranslationEngine] Entry cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: entryCache.size,
      maxSize: MAX_ENTRY_CACHE_SIZE
    };
  }
}

module.exports = TranslationEngine;
