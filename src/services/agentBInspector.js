/**
 * Agent B — Semantic Inspector & Pre-Flight Offloader
 * (Dual-AI Mandat Pelaksanaan 2026-09-26, Fasa 1)
 *
 * Seni Bina 2-Agent:
 *   AGENT A (Worker): Gemini 3 Flash — penterjemahan kelompok 50 baris.
 *   AGENT B (Inspector): glm-5.3-flashx (OpenAI-compatible, 1M context):
 *     Tugasan 1: Mengambil alih Fasa 0 (Pre-Flight Semantic Pass) sepenuhnya
 *                daripada Gemini — jimat kuota TPM/RPM Gemini.
 *     Tugasan 2: Askar Pertahanan Semantik — menyemak setiap kelompok hasil
 *                penterjemahan (sumber vs hasil) bagi mengesan:
 *                  MERGE   — 2 baris sumber digabung ke satu slot output
 *                            sementara slot lain diisi ayat rekaan (phantom
 *                            filler) semata-mata untuk cukup kuota tag.
 *                  DROP    — maksud satu baris sumber hilang sepenuhnya.
 *                  PHANTOM — baris output mengandungi kandungan rekaan yang
 *                            tiada asas dalam baris sumber.
 *
 * Prinsip reka bentuk (diluluskan Lead Architecture, laporan audit 2026-09-26):
 *   - FAIL-OPEN: sebarang ralat rangkaian/timeout/respons rosak → verdict
 *     { valid: true } — Agent B TIDAK PERNAH menggagalkan terjemahan.
 *   - CIRCUIT BREAKER: 3 kegagalan berturut-turut dalam satu sesi fail →
 *     Agent B dinyahaktifkan senyap bagi baki fail tersebut.
 *   - UNTHROTTLED (Mandat Pembebasan 2026-09-26): kuota Agent B infiniti
 *     (skala 1B token) — max_tokens 4096 (ruang reasoning + content) dan
 *     timeout berfasa: Fasa 0 45s (baca episod penuh) / semakan batch 15s.
 *     Tiada micro-timeout / tiny token cap yang membekukan nafas Agent B.
 *   - ZERO-SWALLOWED-ERROR + DUAL-MODEL FAILOVER (Mandat Observabiliti
 *     2026-09-26): tiada ralat ditelan senyap — setiap kegagalan mencetak
 *     status + punca teknikal + raw snippet 500 aksara. Hierarki model:
 *     glm-5.3-flashx (utama) → deepseek-v4.1-flash (sandaran) bagi
 *     kedua-dua Fasa 0 dan Semakan Kelompok.
 *   - 100% BACKWARDS COMPATIBLE: Agent B null → enjin jalan 100% Gemini.
 */

const OpenAICompatibleProvider = require('./providers/openaiCompatible');
const { runPreflightSemanticPass, stripReasoningTags } = require('./subfaberPreflight');
const log = require('../utils/logger');

// ── Konfigurasi tetap Agent B (Mandat Pembebasan Penuh 2026-09-26) ──
const AGENT_B_DEFAULT_MODEL = 'glm-5.3-flashx';
const AGENT_B_FALLBACK_MODEL = 'deepseek-v4.1-flash'; // Mandat Failover §4: askar penyelamat
const AGENT_B_PREFLIGHT_TIMEOUT_MS = 45000;  // Fasa 0: baca episod penuh (48k aksara) + analisis tema
const AGENT_B_INSPECTION_TIMEOUT_MS = 15000; // Semakan batch: latensi rangkaian rootsys.cloud selamat
const AGENT_B_MAX_OUTPUT_TOKENS = 4096;      // Ruang reasoning tokens + content (kuota infiniti)
const AGENT_B_CIRCUIT_THRESHOLD = 3;      // 3 kegagalan berturut → silent mode
const AGENT_B_MAX_LINE_CHARS = 200;       // Cap panjang baris dalam payload padat
const AGENT_B_MAX_CRIMES = 5;             // >5 jenayah → tetap sahaja ditolong
const AGENT_B_MAX_IDS_PER_CRIME = 10;     // Cap bilangan id per jenayah
const AGENT_B_MAX_NOTE_CHARS = 120;       // Cap panjang nota jenayah
const VALID_CRIME_TYPES = new Set(['MERGE', 'DROP', 'PHANTOM']);

/**
 * Arahan inspector (zero-yap). Dihantar sebagai SATU mesej user lengkap
 * (pariti 1:1 dengan kontrak pembawa OpenAI-compatible projek — payload
 * dibake terus ke dalam prompt, bukan dihantar berasingan).
 */
const INSPECTOR_INSTRUCTION = `## Role
You are a subtitle integrity inspector. You compare source lines with their translations, line by line.

## Task
Detect ONLY these three violations:
- MERGE: two source lines were translated into ONE output line while another output line contains fabricated filler text.
- DROP: a source line's meaning is completely missing from its output line.
- PHANTOM: an output line contains content with no basis in the source line.

Ignore: translation style, grammar, tone, cultural adaptation, and minor omissions.

## Output Contract
Respond with ONLY this JSON and nothing else — no explanations, no markdown:
{"valid":true}
If any violation exists:
{"valid":false,"crimes":[{"type":"MERGE|DROP|PHANTOM","ids":[line ids],"note":"max 10 words"}]}`;

/**
 * Bina payload padat untuk semakan semantik: dua blok selari <en> (sumber)
 * dan <ms> (hasil) — nombor ID global + teks sahaja, tanpa timecode.
 * Baris dipadankan mengikut kedudukan index (batch[i] ↔ translatedEntries[i],
 * dijamin oleh gerbang enjin yang hanya memanggil inspector selepas alignment
 * struktur muktamad).
 *
 * @param {Array<{id:number, text:string}>} sourceBatch - Batch sumber (EN)
 * @param {Array<{index:number, text:string}>} translatedEntries - Hasil sejajar (MS)
 * @returns {{prompt:string}|null} Prompt lengkap inspector atau null (input kosong)
 */
function buildInspectionPayload(sourceBatch, translatedEntries) {
  if (!Array.isArray(sourceBatch) || sourceBatch.length === 0) return null;
  if (!Array.isArray(translatedEntries) || translatedEntries.length === 0) return null;

  const clamp = (t) => String(t || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, AGENT_B_MAX_LINE_CHARS);

  const enLines = [];
  const msLines = [];
  for (let i = 0; i < sourceBatch.length; i++) {
    const src = sourceBatch[i];
    if (!src || typeof src.id === 'undefined') continue;
    const id = Number(src.id);
    if (!Number.isFinite(id) || id <= 0) continue;
    enLines.push(`${id}|${clamp(src.text)}`);
    const dst = translatedEntries[i];
    msLines.push(`${id}|${clamp(dst?.text)}`);
  }
  if (enLines.length === 0) return null;

  const prompt = `${INSPECTOR_INSTRUCTION}

## Input
<en>
${enLines.join('\n')}
</en>
<ms>
${msLines.join('\n')}
</ms>

Respond with ONLY the JSON now.`;

  return { prompt };
}

/**
 * Parse + sanitize respons inspector. Tahan kandungan rosak (corak sama
 * dengan parsePreflightResponse):
 *   - Strip markdown fences jika model tak patuh arahan
 *   - Regex-extract blok { ... } pertama sebagai fallback
 *   - Validasi + clamp struktur crimes
 *
 * @param {string} responseText - Respons mentah model
 * @returns {{valid:true}|{valid:false, crimes:Array<{type,ids,note}>}|null}
 *          null = respons tidak boleh ditafsir (pemanggil mesti fail-open)
 */
function parseInspectorResponse(responseText) {
  if (!responseText || typeof responseText !== 'string') return null;

  let cleaned = responseText.trim();

  // Strip markdown code fences (hex \x60 mengelakkan UI breakage — konvensyen projek)
  const fenceRegex = new RegExp('\\x60\\x60\\x60[a-z]*(?:\\r?\\n)?', 'gi');
  cleaned = cleaned.replace(fenceRegex, '');
  cleaned = cleaned.replace(new RegExp('\\x60\\x60\\x60', 'g'), '');

  // Fallback: extract blok JSON pertama jika ada bahan sampingan (chatter)
  const jsonStart = cleaned.indexOf('{');
  const jsonEnd = cleaned.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    return null;
  }
  if (jsonStart > 0 || jsonEnd < cleaned.length - 1) {
    cleaned = cleaned.slice(jsonStart, jsonEnd + 1);
  }

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (_) {
    return null;
  }

  if (!parsed || typeof parsed !== 'object') return null;
  if (parsed.valid === true) return { valid: true };
  if (parsed.valid !== false) return null; // medan valid hilang → tidak sah

  // Sanitize crimes: jenis mesti sah, id mesti integer positif, nota di-cap
  const crimes = [];
  if (Array.isArray(parsed.crimes)) {
    for (const crime of parsed.crimes) {
      if (!crime || typeof crime !== 'object') continue;
      const type = String(crime.type || '').toUpperCase();
      if (!VALID_CRIME_TYPES.has(type)) continue;
      const ids = Array.isArray(crime.ids)
        ? crime.ids
          .map((n) => parseInt(n, 10))
          .filter((n) => Number.isFinite(n) && n > 0)
          .slice(0, AGENT_B_MAX_IDS_PER_CRIME)
        : [];
      crimes.push({
        type,
        ids,
        note: String(crime.note || '').trim().slice(0, AGENT_B_MAX_NOTE_CHARS)
      });
      if (crimes.length >= AGENT_B_MAX_CRIMES) break;
    }
  }

  // valid:false tetapi tiada jenayah boleh diperbetulkan → tiada tindakan
  if (crimes.length === 0) return { valid: true };

  return { valid: false, crimes };
}

/**
 * Agent B — Inspector Semantik & Pre-Flight Offloader.
 *
 * Wrapper nipis di atas OpenAICompatibleProvider (reuse: SSRF agents,
 * auth headers, retry loop, registry GLM). Override wajib:
 *   1. getCappedMaxOutputTokens() → 4096 (bypass lantai 65536 keluarga GLM;
 *      ruang secukupnya untuk reasoning tokens tanpa menghalang content).
 *   2. buildUserPrompt() → prompt inspector dihantar verbatim sebagai user
 *      message (implementasi asas membuang customPrompt bukan-terjemahan).
 *   3. translationTimeout → 15s (semakan batch) / 45s (Fasa 0, dinaikkan
 *      sementara oleh runPreflightPass — pembina asas clamp >= 5000ms).
 *
 * DUAL-MODEL FAILOVER (Mandat Observabiliti §4): hierarki model disimpan
 * dalam this.modelHierarchy (utama + sandaran deepseek-v4.1-flash). Setiap
 * panggilan bergerak melalui _callWithFailover(): cuba utama → sebarang
 * kegagalan (HTTP/timeout/kosong/rosak) → log WARN berformat mandat dan
 * cuba sandaran → kedua-dua gagal → error terakhir dilempar.
 */
class AgentBInspector extends OpenAICompatibleProvider {
  constructor(options = {}) {
    super({
      apiKey: options.apiKey || '',
      model: options.model || AGENT_B_DEFAULT_MODEL,
      baseUrl: options.baseUrl || 'https://api.openai.com/v1',
      providerName: 'agentb',
      reasoningEffort: 'low',           // GLM 5.3: thinking always-on, effort minimum
      maxOutputTokens: AGENT_B_MAX_OUTPUT_TOKENS,
      translationTimeout: AGENT_B_INSPECTION_TIMEOUT_MS / 1000,
      maxRetries: 0,                    // Fail fast — satu percubaan sahaja per model
      enableJsonOutput: false,          // Parse JSON manual (kompatibilitas maksimum endpoint)
      ssrfLookup: options.ssrfLookup || null
    });

    // Pembina asas clamp translationTimeout kepada >= 5000ms — enforce semula
    // had mandate: 15s bagi semakan batch (lalai instance); Fasa 0 dinaikkan
    // sementara kepada 45s oleh runPreflightPass().
    this.translationTimeout = AGENT_B_INSPECTION_TIMEOUT_MS;

    // ── DUAL-MODEL FAILOVER DINAMIK (Mandat Hot-Swap 2026-09-26 §2) ──
    // Hierarki model 100% configurable — TIADA susunan hardcoded:
    //   - Utama: options.model (lalai glm-5.3-flashx)
    //   - Sandaran: options.fallbackModel (lalai deepseek-v4.1-flash);
    //     nilai 'none' ATAU sama dengan utama ATAU kosong → hierarki
    //     model tunggal (tiada failover).
    // this.model sentiasa menjejak model AKTIF supaya log forensik
    // melaporkan model sebenar yang sedang beroperasi.
    const primary = String(options.model || AGENT_B_DEFAULT_MODEL).trim() || AGENT_B_DEFAULT_MODEL;
    const requestedFallback = String(options.fallbackModel || AGENT_B_FALLBACK_MODEL).trim();
    this.modelHierarchy = [primary];
    if (
      requestedFallback &&
      requestedFallback.toLowerCase() !== 'none' &&
      requestedFallback.toLowerCase() !== primary.toLowerCase()
    ) {
      this.modelHierarchy.push(requestedFallback);
    }
    this.fallbackModel = this.modelHierarchy.length > 1 ? this.modelHierarchy[1] : null;

    // ── Circuit breaker (per sesi fail — instance dibina per permintaan) ──
    this._consecutiveFailures = 0;
    this._circuitOpen = false;
    this.circuitThreshold = AGENT_B_CIRCUIT_THRESHOLD;
  }

  /**
   * DUAL-MODEL FAILOVER CORE (Mandat §4B): jalankan satu operasi AI melalui
   * hierarki model. Predicate `isFailure` memutuskan samaada hasil operasi
   * dianggap gagal (ralat dilempar ATAU respons rosak/kosong) — membolehkan
   * failover berlaku walaupun endpoint memulangkan HTTP 200 dengan badan
   * sampah.
   *
   * @param {string} operation - Label operasi ('Pre-flight' / 'Batch N inspection') untuk log
   * @param {Function} attempt - async (model) => hasil panggilan (boleh throw)
   * @param {Function} isFailure - (hasil) => boolean — true jika failover diperlukan
   * @returns {Promise<{result:*, modelUsed:string, failedAttempts:Array}>}
   * @throws {Error} ralat percubaan terakhir apabila SEMUA model gagal
   */
  async _callWithFailover(operation, attempt, isFailure) {
    const failedAttempts = [];
    for (let i = 0; i < this.modelHierarchy.length; i++) {
      const model = this.modelHierarchy[i];
      this.model = model; // log + payload pembawa sentiasa melihat model aktif
      let result;
      try {
        result = await attempt(model);
      } catch (err) {
        // ZERO-SWALLOWED-ERROR §3B/§4B: status + punca sebenar, bukan generik
        const status = err?.statusCode || err?.response?.status || err?.status || 'N/A';
        failedAttempts.push({ model, error: err });
        if (i < this.modelHierarchy.length - 1) {
          log.warn(() => `[AgentB] ${operation} on ${model} failed (Status: ${status}): ${err?.message || err}. Failing over to ${this.modelHierarchy[i + 1]}...`);
          continue;
        }
        log.warn(() => `[AgentB] ${operation} on ${model} failed (Status: ${status}): ${err?.message || err}. All models exhausted.`);
        throw err;
      }
      if (!isFailure(result)) {
        return { result, modelUsed: model, failedAttempts };
      }
      // Respons diterima tetapi rosak/kosong (HTTP 200 sampah)
      const reason = 'Empty or corrupt response';
      failedAttempts.push({ model, error: new Error(reason) });
      if (i < this.modelHierarchy.length - 1) {
        log.warn(() => `[AgentB] ${operation} on ${model} failed (${reason}). Failing over to ${this.modelHierarchy[i + 1]}...`);
        continue;
      }
      log.warn(() => `[AgentB] ${operation} on ${model} failed (${reason}). All models exhausted.`);
      throw new Error(`${operation}: ${reason} on all models`);
    }
    // Tidak boleh dicapai — loop sentiasa return/throw
    throw new Error(`${operation}: exhausted`);
  }

  /**
   * Override: kunci siling output kepada 4096 token — ruang secukupnya bagi
   * model menjana reasoning tokens tanpa menghalang penjanaan content akhir
   * (Mandat Unthrottle 2026-09-26; kuota Agent B infiniti).
   */
  getCappedMaxOutputTokens() {
    return AGENT_B_MAX_OUTPUT_TOKENS;
  }

  /**
   * Override: prompt inspector ialah arahan lengkap + payload (self-contained)
   * — hantar verbatim sebagai user message. Implementasi asas akan
   * menggugurkan customPrompt yang bukan template terjemahan.
   */
  buildUserPrompt(subtitleContent, targetLanguage, customPrompt = null) {
    const userPrompt = String(customPrompt || subtitleContent || '');
    return {
      userPrompt,
      systemPrompt: '',
      normalizedTarget: '',
      subtitleContent,
      isSelfContained: true
    };
  }

  /** Circuit breaker terbuka? (Agent B ditenyapkan bagi sisa fail ini) */
  get circuitOpen() {
    return this._circuitOpen === true;
  }

  /** Reset circuit breaker (sesi fail baharu) */
  resetCircuitBreaker() {
    this._consecutiveFailures = 0;
    this._circuitOpen = false;
  }

  /** Rekod kegagalan berturut-turut → buka litar pada ambang mandat */
  _recordFailure() {
    this._consecutiveFailures += 1;
    if (this._consecutiveFailures >= this.circuitThreshold && !this._circuitOpen) {
      this._circuitOpen = true;
      log.warn(() => `[AgentB] Circuit breaker OPEN after ${this._consecutiveFailures} consecutive failures — Agent B silenced for the rest of this file`);
    }
  }

  /** Kejayaan → reset kaunter kegagalan berturut-turut */
  _recordSuccess() {
    this._consecutiveFailures = 0;
  }

  /**
   * TUGASAN 1: Pre-Flight Offload — Fasa 0 dijalankan oleh Agent B sepenuhnya
   * (Gemini 3 Flash dikecualikan, jimat kuota TPM/RPM).
   *
   * Guna semula runPreflightSemanticPass() sedia ada dengan menyuntik
   * instance ini sebagai provider — kontrak duck-typing (translateSubtitle)
   * dipenuhi oleh OpenAICompatibleProvider.
   *
   * BEST-EFFORT & NON-BLOCKING: kegagalan → null → pipeline jalan tanpa
   * konteks global (tingkah laku Fasa 0 sedia ada dipelihara 100%).
   */
  async runPreflightPass(entries, targetLanguage, sourceLanguage, options = {}) {
    // Fasa 0 membaca teks episod penuh (hingga 48k aksara disampel) dan
    // menjana analisis tema — naikkan had masa axios kepada 45s untuk
    // panggilan ini sahaja, kemudian pulihkan 15s (fasa semakan batch).
    // SELAMAT dari race: preflight di-await sepenuhnya oleh enjin sebelum
    // mana-mana panggilan batch bermula; fasa tidak bertindih.
    const previousTimeout = this.translationTimeout;
    const previousModel = this.model;
    this.translationTimeout = AGENT_B_PREFLIGHT_TIMEOUT_MS;

    // DUAL-MODEL FAILOVER (Mandat §4B): setiap model menjalankan Fasa 0
    // penuh melalui runPreflightSemanticPass dengan hook zero-swallowed-
    // error. null + hook aktif = kegagalan model (failover); null tanpa
    // hook = skip sahaja (fail kecil / tiada teks) — jangan failover.
    try {
      const { result } = await this._callWithFailover(
        'Pre-flight',
        async () => {
          let callError = null;
          let parseFailed = false;
          let rawSnippet = '';
          let inner = null;
          try {
            inner = await runPreflightSemanticPass(entries, targetLanguage, sourceLanguage, this, {
              ...options,
              onCallError: (err) => { callError = err; },
              onParseFailure: (raw) => { parseFailed = true; rawSnippet = String(raw || ''); }
            });
          } catch (err) {
            // Defensive: runPreflightSemanticPass non-blocking, tetapi
            // zero-swallowed-error bermakna kita tidak bergantung pada andaian.
            callError = err;
          }
          if (inner) return { ok: true, context: inner };
          if (callError || parseFailed) {
            return { ok: false, callError, parseFailed, rawSnippet };
          }
          return { ok: true, context: null }; // skip sahaja (bukan kegagalan)
        },
        (outcome) => outcome && outcome.ok === false
      );
      return result && result.ok ? result.context : null;
    } catch (failoverErr) {
      // SEMUA model gagal — Fasa 0 kekal NON-BLOCKING (kontrak asal):
      // pulangkan null, pipeline jalan tanpa konteks global. Punca
      // teknikal telah dipapar oleh _callWithFailover (zero-swallowed).
      log.warn(() => `[AgentB] Pre-flight exhausted all models — continuing without global context (non-blocking): ${failoverErr?.message || failoverErr}`);
      return null;
    } finally {
      this.model = previousModel;
      this.translationTimeout = previousTimeout;
    }
  }

  /**
   * TUGASAN 2: Semakan Semantik per batch — banding sumber vs hasil.
   *
   * DUAL-MODEL FAILOVER + ZERO-SWALLOWED-ERROR (Mandat Observabiliti):
   *   - PASSED  → [INFO]  dengan latensi ms + model (§3C).
   *   - CRIME   → [WARN]  jenis jenayah + model → Triggering Retry (§3B).
   *   - FAILED  → [WARN]  status + punca teknikal sebenar per model (§3B).
   *   - Parse gagal → [WARN] raw snippet 500 aksara pertama (§B).
   *   - Kedua-dua model gagal → fail-open { valid: true, failOpen: true }.
   *
   * @param {Array<{id:number, text:string}>} sourceBatch - Batch sumber
   * @param {Array<{index:number, text:string}>} translatedEntries - Hasil sejajar
   * @param {{batchIndex?:number, totalBatches?:number}} [meta] - Meta batch untuk log
   * @returns {Promise<{valid:boolean, crimes?:Array, failOpen?:boolean, skipped?:string, modelUsed?:string}>}
   */
  async runSemanticInspection(sourceBatch, translatedEntries, meta = {}) {
    // Circuit breaker terbuka → senyap terus (tiada panggilan rangkaian)
    if (this._circuitOpen) {
      return { valid: true, skipped: 'circuit_open' };
    }

    const payload = buildInspectionPayload(sourceBatch, translatedEntries);
    if (!payload) {
      return { valid: true, skipped: 'no_input' };
    }

    const hasBatchMeta = Number.isFinite(meta.batchIndex);
    const batchLabel = hasBatchMeta
      ? `Batch ${meta.batchIndex + 1}${Number.isFinite(meta.totalBatches) ? `/${meta.totalBatches}` : ''} inspection`
      : 'Inspection';

    const previousModel = this.model;
    try {
      const { result, modelUsed } = await this._callWithFailover(
        batchLabel,
        async () => {
          const startedAt = Date.now();
          // Payload di-bake ke dalam customPrompt (buildUserPrompt override
          // menghantarnya verbatim). maxRetries 0 per model + timeout 15s.
          const responseText = await this.translateSubtitle(payload.prompt, 'en', 'en', payload.prompt);
          const latency = Date.now() - startedAt;
          // Mandat §3A: bersihkan tag penaakulan sebelum parse.
          const cleaned = stripReasoningTags(responseText);
          const verdict = parseInspectorResponse(cleaned);
          if (!verdict) {
            // FORENSIK §B: 500 aksara pertama respons mentah wajib dipaparkan.
            const rawForLog = String(cleaned || responseText || '');
            log.warn(() => `[AgentB] ${batchLabel} parse failure. Raw snippet (first 500 chars): "${rawForLog.slice(0, 500)}..."`);
            return { verdict: null };
          }
          return { verdict, latency };
        },
        (outcome) => !outcome || !outcome.verdict // kosong/rosak → failover model seterusnya
      );

      // Berjaya pada salah satu model — log status keputusan (§3B/§3C)
      const { verdict, latency } = result;
      this._recordSuccess();
      if (verdict.valid === false && Array.isArray(verdict.crimes) && verdict.crimes.length > 0) {
        const types = verdict.crimes.map(c => c.type).join(', ');
        log.warn(() => `[AgentB] ${batchLabel}: CRIME DETECTED [${types}] [${modelUsed}] -> Triggering Retry`);
      } else {
        log.info(() => `[AgentB] ${batchLabel}: PASSED (valid: true) [${modelUsed}] (${latency}ms)`);
      }
      return { ...verdict, modelUsed };
    } catch (err) {
      // SEMUA model dalam hierarki gagal — fail-open forensik penuh.
      this._recordFailure();
      const status = err?.statusCode || err?.response?.status || err?.status || 'N/A';
      log.warn(() => `[AgentB] ${batchLabel} failed on ALL models (Status: ${status}): ${err?.message || err} — accepting Agent A output (fail-open)`);
      return { valid: true, failOpen: true, error: 'both_models_failed', detail: err?.message || String(err) };
    } finally {
      this.model = previousModel;
    }
  }
}

module.exports = {
  AgentBInspector,
  buildInspectionPayload,
  parseInspectorResponse,
  INSPECTOR_INSTRUCTION,
  AGENT_B_DEFAULT_MODEL,
  AGENT_B_FALLBACK_MODEL,
  AGENT_B_PREFLIGHT_TIMEOUT_MS,
  AGENT_B_INSPECTION_TIMEOUT_MS,
  AGENT_B_MAX_OUTPUT_TOKENS,
  AGENT_B_CIRCUIT_THRESHOLD
};
