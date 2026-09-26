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
 *   - ZERO-YAP: max_tokens 256 + reasoning_effort 'low' + kontrak JSON mini
 *     → sasaran latensi < 1.5s per batch (P50 ~0.6–1.1s).
 *   - 100% BACKWARDS COMPATIBLE: Agent B null → enjin jalan 100% Gemini.
 */

const OpenAICompatibleProvider = require('./providers/openaiCompatible');
const { runPreflightSemanticPass } = require('./subfaberPreflight');
const log = require('../utils/logger');

// ── Konfigurasi tetap Agent B (Mandat Pelaksanaan) ──
const AGENT_B_DEFAULT_MODEL = 'glm-5.3-flashx';
const AGENT_B_TIMEOUT_MS = 4000;          // Had masa lembut 4 saat (bukan 30s default)
const AGENT_B_MAX_OUTPUT_TOKENS = 256;    // Zero-yap: output JSON mini sahaja
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
 * auth headers, retry loop, registry GLM). Tiga override wajib:
 *   1. getCappedMaxOutputTokens() → 256 (bypass lantai 65536 keluarga GLM —
 *      mandat zero-yap).
 *   2. buildUserPrompt() → prompt inspector dihantar verbatim sebagai user
 *      message (implementasi asas membuang customPrompt bukan-terjemahan).
 *   3. translationTimeout → 4000ms (pembina asas clamp pada >= 5000ms).
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
      translationTimeout: AGENT_B_TIMEOUT_MS / 1000,
      maxRetries: 0,                    // Fail fast — satu percubaan sahaja
      enableJsonOutput: false,          // Parse JSON manual (kompatibiliti maksimum endpoint)
      ssrfLookup: options.ssrfLookup || null
    });

    // Pembina asas clamp translationTimeout kepada >= 5000ms — enforce semula
    // had lembut 4 saat mandat (axios timeout tunggal, maxRetries 0).
    this.translationTimeout = AGENT_B_TIMEOUT_MS;

    // ── Circuit breaker (per sesi fail — instance dibina per permintaan) ──
    this._consecutiveFailures = 0;
    this._circuitOpen = false;
    this.circuitThreshold = AGENT_B_CIRCUIT_THRESHOLD;
  }

  /**
   * Override: lantai 65536 token keluarga GLM terlalu besar untuk inspector
   * zero-yap — kunci kepada 256 supaya model tidak berpeluang "yap".
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
    return runPreflightSemanticPass(entries, targetLanguage, sourceLanguage, this, options);
  }

  /**
   * TUGASAN 2: Semakan Semantik per batch — banding sumber vs hasil.
   *
   * KEBAL RALAT (FAIL-OPEN): sebarang ralat rangkaian/timeout/respons rosak
   * ditangkap senyap → { valid: true, failOpen: true } — pipeline tidak
   * tergugat. Enjin membaca flag failOpen untuk statistik agentBFailures.
   *
   * @param {Array<{id:number, text:string}>} sourceBatch - Batch sumber
   * @param {Array<{index:number, text:string}>} translatedEntries - Hasil sejajar
   * @returns {Promise<{valid:boolean, crimes?:Array, failOpen?:boolean, skipped?:string}>}
   */
  async runSemanticInspection(sourceBatch, translatedEntries) {
    // Circuit breaker terbuka → senyap terus (tiada panggilan rangkaian)
    if (this._circuitOpen) {
      return { valid: true, skipped: 'circuit_open' };
    }

    const payload = buildInspectionPayload(sourceBatch, translatedEntries);
    if (!payload) {
      return { valid: true, skipped: 'no_input' };
    }

    let responseText;
    try {
      // Payload di-bake ke dalam customPrompt (buildUserPrompt override
      // menghantarnya verbatim). maxRetries 0 + timeout 4s = fail pantas.
      responseText = await this.translateSubtitle(payload.prompt, 'en', 'en', payload.prompt);
    } catch (err) {
      this._recordFailure();
      log.warn(() => `[AgentB] Inspection call failed (fail-open): ${err?.message || err}`);
      return { valid: true, failOpen: true, error: err?.message || String(err) };
    }

    const verdict = parseInspectorResponse(responseText);
    if (!verdict) {
      // Respons tidak boleh ditafsir — dikira sebagai kegagalan kualiti
      // (circuit breaker), tetapi fail-open bagi pipeline.
      this._recordFailure();
      log.warn(() => '[AgentB] Inspection response unparseable (fail-open)');
      return { valid: true, failOpen: true, error: 'unparseable_response' };
    }

    this._recordSuccess();
    return verdict;
  }
}

module.exports = {
  AgentBInspector,
  buildInspectionPayload,
  parseInspectorResponse,
  INSPECTOR_INSTRUCTION,
  AGENT_B_DEFAULT_MODEL,
  AGENT_B_TIMEOUT_MS,
  AGENT_B_MAX_OUTPUT_TOKENS,
  AGENT_B_CIRCUIT_THRESHOLD
};
