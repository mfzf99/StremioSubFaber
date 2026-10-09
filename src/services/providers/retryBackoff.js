/**
 * Retry Backoff Helper (Pariti Universal Provider 2026-10-09)
 *
 * Ground truth forensik: log live owner 2026-10-09 (rootsys.cloud, deepseek-v4-pro,
 * SRT 648 entry / 13 batch) — batch 10 gagal HTTP 502 transient dan gelung retry
 * OpenAICompatibleProvider meluru 3 percubaan dalam 37ms (TIADA delay). Gemini
 * mempunyai retryWithBackoff() ber-exponential backoff 3s → 6s → 12s + jitter
 * 0.8x–1.2x (anti thundering-herd) — provider lain tiada. Mandat owner: SEMUA
 * LLM mesti kongsi setup 1:1 dengan main provider Gemini.
 *
 * Modul ini ialah SATU sumber kebenaran bagi formula backoff (dipakai oleh
 * openaiCompatible.js, anthropic.js, deepl.js). Ia TIDAK menukar bilangan retry
 * (maxRetries kekal dikawal provider masing-masing) — hanya menambah DELAY
 * antara percubaan, selari formula Gemini.
 *
 * Formula (1:1 gemini.js retryWithBackoff):
 *   delay = baseDelay * 2^attempt   (3000ms → 6000ms → 12000ms ...)
 *   jitter = 0.8 + random()*0.4     (0.8x–1.2x, floor 50ms)
 *
 * Keutamaan konfigurasi (pariti kontrak Gemini — advancedSettings > env > lalai):
 *   1. options.retryBackoffBaseMs (pemanggil terus)
 *   2. process.env.PROVIDER_RETRY_BACKOFF_BASE_MS (global override)
 *   3. 3000 (lalai = Gemini)
 */

const DEFAULT_BACKOFF_BASE_MS = 3000;
const ENV_OVERRIDE_KEY = 'PROVIDER_RETRY_BACKOFF_BASE_MS';

/**
 * Baca siling asas backoff mengikut keutamaan konfigurasi.
 * Nilai 0 dibenarkan secara EKSPLISIT (melumpuhkan delay untuk test/CI) —
 * dibezakan daripada nilai hilang/tak sah yang jatuh ke lalai 3000ms.
 * @param {number|undefined} [callerValue] - Nilai daripada pemanggil (options)
 * @returns {number} integer ms >= 0
 */
function resolveBackoffBaseMs(callerValue) {
    // 1. Pemanggil terus (0 eksplisit sahaja diterima sebagai override)
    if (Number.isFinite(callerValue) && callerValue >= 0) {
        return Math.floor(callerValue);
    }
    // 2. Env override (string '0' = melumpuhkan)
    const envRaw = process.env[ENV_OVERRIDE_KEY];
    if (envRaw !== undefined && envRaw !== null && String(envRaw).trim() !== '') {
        const parsed = parseInt(envRaw, 10);
        if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
    // 3. Lalai — pariti tepat dengan Gemini retryWithBackoff (baseDelay=3000)
    return DEFAULT_BACKOFF_BASE_MS;
}

/**
 * Kira delay backoff untuk satu percubaan (1:1 formula Gemini).
 * @param {number} attempt - Indeks percubaan gagal bermula 0
 * @param {number} [baseDelay] - Asas exponential (lalai 3000ms)
 * @returns {number} delay jittered dalam ms (minimum 50ms bila aktif)
 */
function computeRetryDelayMs(attempt, baseDelay = DEFAULT_BACKOFF_BASE_MS) {
    const delay = Math.max(0, Math.floor(baseDelay)) * Math.pow(2, attempt);
    if (delay <= 0) return 0;
    // Jitter 0.8x–1.2x + floor 50ms — serupa baris-for-baris dengan gemini.js.
    return Math.max(50, Math.round(delay * (0.8 + Math.random() * 0.4)));
}

/**
 * Tunggu delay backoff sebelum percubaan seterusnya.
 * No-op segera bila baseMs = 0 (test/CI mematikan backoff secara eksplisit).
 * @param {number} attempt - Indeks percubaan gagal bermula 0
 * @param {number} [baseMs] - Asas exponential; 0 = tiada delay
 * @returns {Promise<void>}
 */
function sleepRetryBackoff(attempt, baseMs) {
    const base = baseMs !== undefined ? baseMs : resolveBackoffBaseMs();
    if (base <= 0) return Promise.resolve();
    const delay = computeRetryDelayMs(attempt, base);
    return new Promise((resolve) => setTimeout(resolve, delay));
}

module.exports = {
    DEFAULT_BACKOFF_BASE_MS,
    ENV_OVERRIDE_KEY,
    resolveBackoffBaseMs,
    computeRetryDelayMs,
    sleepRetryBackoff
};
