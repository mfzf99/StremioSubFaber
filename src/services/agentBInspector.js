/**
 * Agent B — Semantic Inspector & Pre-Flight Offloader
 * (Dual-AI Mandat Pelaksanaan 2026-09-26, Fasa 1)
 *
 * Seni Bina 2-Agent (UNIVERSAL PAYLOAD 2026-09-26 — Trinity Dual-Agent,
 * kredensial rootsys.cloud: 1B token quota / 1M context window):
 *   AGENT A (Worker): Gemini 3 Flash — penterjemahan kelompok 60 baris.
 *   AGENT B (Inspector): Trinity BETA RUN 10 — FULL DEEPSEEK FRONTIER STACK
 *     (BEAST MODE — Mandat Beast Mode DeepSeek Frontier 2026-09-27,
 *     OpenAI-compatible):
 *     - PRE-FLIGHT (Fasa 0)   : deepseek-v4-pro     (Frontier Inspector), 5 min.
 *     - PEMERIKSA UTAMA       : deepseek-v4-pro     (Frontier Inspector), 5 min.
 *     - FALLBACK UNIVERSAL    : deepseek-v4.1-flash (mewarisi had masa fasa berkaitan).
 *     Bukti empirikal terminal: had hulu Caddy rootsys.cloud ialah tepat 300s
 *     (Kimi K3 mencetus 502 akibat letupan token penaakulan); deepseek-v4-pro
 *     menyelesaikan analisis Pre-Flight 4-tiang dalam 3.45 saat dengan JSON sah.
 *     Muatan sejagat (MANDAT OPERASI MUTLAK v2 — arahan Project Owner
 *     2026-09-27): enjin DeepSeek membawa temperature: 0.0 +
 *     reasoning_effort:"max" + max_tokens:16384 + extra_body.thinking:
 *     {type:"enabled"} + response_format json_object — top_p DIGUGURKAN.
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
 *     (skala 1B token) — timeout berfasa: Fasa 0 5 minit (baca episod penuh)
 *     / semakan batch 5 minit. Tiada micro-timeout yang membekukan nafas Agent B.
 *   - CONTEXT-AWARE AUDIT (MANDAT OPERASI MUTLAK 2026-09-27): Agent B TIDAK
 *     lagi mengaudit secara buta — buildInspectionPayload menerima
 *     preflightContext (theme + terms + characters) dan menyuntiknya ke dalam
 *     prompt pemeriksaan. Jenayah SHIFT dikunci dengan klausa emas pengurang
 *     token (abaikan perbezaan millisecond timecode; audit teks sahaja).
 *   - ZERO-SWALLOWED-ERROR + TRINITY FAILOVER (Mandat Observabiliti +
 *     Universal Payload 2026-09-26): tiada ralat ditelan senyap — setiap
 *     kegagalan mencetak status + punca teknikal + raw snippet 500 aksara
 *     + format trigger wajib `[AgentB] Fallback triggered -> [model]`.
 *     TRINITY BETA RUN 9: dua hierarki berasingan — preflightHierarchy
 *     [deepseek-v4-pro → deepseek-v4.1-flash] dan modelHierarchy
 *     [deepseek-v4-pro → deepseek-v4.1-flash]. Kegagalan mana-mana model
 *     utama beralih automatik ke deepseek-v4.1-flash.
 *   - 100% BACKWARDS COMPATIBLE: Agent B null → enjin jalan 100% Gemini.
 */

const OpenAICompatibleProvider = require('./providers/openaiCompatible');
const { runPreflightSemanticPass, stripReasoningTags } = require('./subfaberPreflight');
const log = require('../utils/logger');

// ── Konfigurasi tetap Agent B (UNIVERSAL PAYLOAD 2026-09-26 + BETA RUN 10
//    BEAST MODE — Mandat Beast Mode DeepSeek Frontier 2026-09-27) ──
// TRINITY DUAL-AGENT — FULL DEEPSEEK FRONTIER STACK (kredensial rootsys.cloud,
// 1B token / 1M context; Mandat Penyatuuan DeepSeek Stack 2026-09-27):
//   Fasa 0 (Pre-Flight Makro) : deepseek-v4-pro     — Timeout 300,000ms / 5 min
//   Fasa 1 (Pemeriksa Utama)  : deepseek-v4-pro     — Timeout 300,000ms / 5 min
//   Fallback Universal        : deepseek-v4.1-flash — Timeout dinamik
//                                 (mewarisi had masa fasa berkaitan)
const AGENT_B_DEFAULT_MODEL = 'deepseek-v4-pro';      // Fasa 1: Pemeriksa Utama
const AGENT_B_PREFLIGHT_MODEL = 'deepseek-v4-pro';    // Fasa 0: Pre-Flight Makro (BETA RUN 10)
const AGENT_B_FALLBACK_MODEL = 'deepseek-v4.1-flash'; // Fallback Universal (Fasa 0 + Fasa 1)
// BEAST MODE (BETA RUN 10): muatan DeepSeek membuka kuasa mutlak penaakulan
// (ground truth rasmi api-docs.deepseek.com):
//   thinking:{type:"enabled"}   — suis utama pembuka CoT;
//   reasoning_effort:"max"      — parameter rasmi peringkat atas (top-level);
//   max_tokens:131072           — siling rasmi 128K (CoT + JSON tanpa potong);
//   top_p:0.95                  — julat pensampelan aktif rasmi (0.95–1.0);
//   response_format json_object — JSON sah dijamin;
//   temperature DIGUGURKAN      — "has no effect in thinking mode" (rasmi).
// Tiada parameter terlarang (presence_penalty deprecated dsb.) dihantar —
// elak HTTP 400.
// HEADROOM KESELAMATAN (MANDAT OPERASI MUTLAK v2 2026-09-27):
// Fasa 0 5 minit + Semakan 5 minit (300,000ms) — arahan Project Owner:
// kedua-dua fasa ditetapkan 5 minit penuh bagi menjamin kejayaan panggilan
// penaakulan max tanpa timeout hulu. Had masa boleh ditindih melalui env
// AGENT_B_PREFLIGHT_TIMEOUT_MS / AGENT_B_INSPECTION_TIMEOUT_MS
// (integer ms positif).
const parseAgentBTimeout = (raw, fallbackMs) => {
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
};
const AGENT_B_PREFLIGHT_TIMEOUT_MS = parseAgentBTimeout(process.env.AGENT_B_PREFLIGHT_TIMEOUT_MS, 300000);
const AGENT_B_INSPECTION_TIMEOUT_MS = parseAgentBTimeout(process.env.AGENT_B_INSPECTION_TIMEOUT_MS, 300000);
// MANDAT OPERASI MUTLAK v2: siling token muatan DeepSeek — 16384; boleh
// ditindih melalui env AGENT_B_MAX_TOKENS (integer positif sahaja).
const AGENT_B_MAX_TOKENS = parseAgentBTimeout(process.env.AGENT_B_MAX_TOKENS, 16384);
const AGENT_B_CIRCUIT_THRESHOLD = 3;      // 3 kegagalan berturut → silent mode
const AGENT_B_MAX_LINE_CHARS = 200;       // Cap panjang baris dalam payload padat
const AGENT_B_MAX_CRIMES = 5;             // >5 jenayah → tetap sahaja ditolong
const AGENT_B_MAX_IDS_PER_CRIME = 10;     // Cap bilangan id per jenayah
const AGENT_B_MAX_NOTE_CHARS = 120;       // Cap panjang nota jenayah
// MANDAT OPERASI MUTLAK 2026-09-27: SHIFT dikunci sebagai jenayah ke-4 —
// kandungan dialog berpindah merentasi indeks (dialog baris 5 muncul di
// baris 6). Klausa emas pengurang token di dalam arahan pemeriksa.
const VALID_CRIME_TYPES = new Set(['MERGE', 'DROP', 'PHANTOM', 'SHIFT']);
// Cap ringkasan konteks Pre-Flight yang disuntik ke prompt pemeriksaan.
const AGENT_B_MAX_CONTEXT_TERMS = 10;     // Istilah padat (source → target)
const AGENT_B_MAX_CONTEXT_CHARACTERS = 12;// Selari dengan PREFLIGHT_MAX_CHARACTERS
const AGENT_B_MAX_CONTEXT_THEME_CHARS = 400; // Cap panjang ringkasan tema

/**
 * Arahan inspector (zero-yap). Dihantar sebagai SATU mesej user lengkap
 * (pariti 1:1 dengan kontrak pembawa OpenAI-compatible projek — payload
 * dibake terus ke dalam prompt, bukan dihantar berasingan).
 */
const INSPECTOR_INSTRUCTION = `## Role
You are a subtitle integrity inspector. You compare source lines with their translations, line by line.

## Task
Detect ONLY these four violations:
- MERGE: two source lines were translated into ONE output line while another output line contains fabricated filler text.
- DROP: a source line's meaning is completely missing from its output line.
- PHANTOM: an output line contains content with no basis in the source line.
- SHIFT: Dialogue content displaced or shifted across indices (e.g. line 5 dialogue appears in line 6).
  NOTE: Ignore minor millisecond timecode differences; audit solely whether the dialogue text matches the corresponding line index.

Ignore: translation style, grammar, tone, cultural adaptation, and minor omissions.

## Output Contract
Respond with ONLY this JSON and nothing else — no explanations, no markdown:
{"valid":true}
If any violation exists:
{"valid":false,"crimes":[{"type":"MERGE|DROP|PHANTOM|SHIFT","ids":[line ids],"note":"max 10 words"}]}`;

/**
 * Format ringkasan konteks Pre-Flight (Fasa 0) untuk suntikan ke prompt
 * pemeriksaan Agent B (MANDAT OPERASI MUTLAK 2026-09-27 — CONTEXT-AWARE
 * AUDIT): Agent B tidak boleh lagi mengaudit secara buta. Ringkasan merangkumi
 * theme + istilah padat + profil watak (gelaran canonical_address terkunci —
 * rujukan konsistensi gelaran semasa audit).
 * @param {{theme?:string, terms?:Array, characters?:Array}} preflightContext - Konteks Fasa 0
 * @returns {string} Blok teks konteks ('' bila tiada konteks berguna)
 */
function formatPreflightContextForInspection(preflightContext) {
  if (!preflightContext || typeof preflightContext !== 'object') return '';
  const sections = [];

  const theme = String(preflightContext.theme || '').trim();
  if (theme) {
    sections.push(`### Story Context (from Pre-Flight)\n${theme.slice(0, AGENT_B_MAX_CONTEXT_THEME_CHARS)}`);
  }

  if (Array.isArray(preflightContext.terms) && preflightContext.terms.length > 0) {
    const termLines = preflightContext.terms
      .slice(0, AGENT_B_MAX_CONTEXT_TERMS)
      .map(t => {
        const src = String(t?.source ?? t?.src ?? '').trim();
        const tgt = String(t?.target ?? t?.tgt ?? '').trim() || src;
        return src ? `- ${src} → ${tgt}` : '';
      })
      .filter(Boolean)
      .join('\n');
    if (termLines) sections.push(`### Locked Terms (use for consistency judgement)\n${termLines}`);
  }

  if (Array.isArray(preflightContext.characters) && preflightContext.characters.length > 0) {
    const charLines = preflightContext.characters
      .slice(0, AGENT_B_MAX_CONTEXT_CHARACTERS)
      .map(c => {
        const name = String(c?.name || '').trim();
        if (!name) return '';
        const address = (c.canonical_address !== undefined && c.canonical_address !== null && String(c.canonical_address).trim() !== '')
          ? String(c.canonical_address).trim()
          : (c.canonicalAddress !== undefined && c.canonicalAddress !== null && String(c.canonicalAddress).trim() !== ''
            ? String(c.canonicalAddress).trim()
            : 'address NOT LOCKED');
        const role = String(c?.role || '').trim();
        return `- ${name} → ${address}${role ? ` (${role})` : ''}`;
      })
      .filter(Boolean)
      .join('\n');
    if (charLines) sections.push(`### Character Address Reference (titles must stay consistent)\n${charLines}`);
  }

  if (sections.length === 0) return '';
  return `${sections.join('\n\n')}\n\n`;
}

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
function buildInspectionPayload(sourceBatch, translatedEntries, preflightContext = null) {
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

  // CONTEXT-AWARE AUDIT (MANDAT OPERASI MUTLAK 2026-09-27): suntik ringkasan
  // konteks Pre-Flight SEBELUM blok <en>/<ms> supaya pemeriksa menilai
  // konsistensi gelaran/istilah dengan bukti Fasa 0, bukan secara buta.
  const contextBlock = formatPreflightContextForInspection(preflightContext);

  const prompt = `${INSPECTOR_INSTRUCTION}

${contextBlock ? `${contextBlock}` : ''}## Input
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
 * auth headers, retry loop). Override wajib:
 *   1. buildUserPrompt() → prompt inspector dihantar verbatim sebagai user
 *      message (implementasi asas membuang customPrompt bukan-terjemahan).
 *   2. translationTimeout → 60s (semakan batch) / 150s (Fasa 0, dinaikkan
 *      sementara oleh runPreflightPass — pembina asas clamp >= 5000ms).
 *
 * MUATAN BEAST (Mandat Seni Bina Universal Payload §A + BETA RUN 10):
 * instance dibina dengan universalPayload=true — buildChatRequest membina
 * muatan BEAST bagi enjin DeepSeek { model, thinking:{type:"enabled"},
 * reasoning_effort:"max", max_tokens:131072 (128K), top_p:0.95,
 * response_format:{type:"json_object"}, messages } (temperature digugurkan
 * — tiada kesan dalam thinking mode). Enjin warisan bukan-DeepSeek kekal
 * menerima { model, temperature: 0.0, messages }.
 *
 * DUAL-MODEL FAILOVER (Mandat Observabiliti §4): hierarki model disimpan
 * dalam this.modelHierarchy (utama + sandaran deepseek-v4.1-flash). Setiap
 * panggilan bergerak melalui _callWithFailover(): cuba utama → sebarang
 * kegagalan (HTTP/timeout/kosong/rosak) → log WARN berformat mandat dan
 * cuba sandaran → kedua-dua gagal → error terakhir dilempar.
 */
class AgentBInspector extends OpenAICompatibleProvider {
  constructor(options = {}) {
    // BEAST MODE BETA RUN 10: had masa berfasa boleh ditindih melalui
    // options (config.agentB.preflightTimeoutMs / inspectionTimeoutMs —
    // env AGENT_B_*_TIMEOUT_MS dinormalisasi oleh config.js). Lalai mandat:
    // Fasa 1 60s / Fasa 0 150s.
    const inspectionTimeoutMs = parseAgentBTimeout(options.inspectionTimeoutMs, AGENT_B_INSPECTION_TIMEOUT_MS);
    const preflightTimeoutMs = parseAgentBTimeout(options.preflightTimeoutMs, AGENT_B_PREFLIGHT_TIMEOUT_MS);
    super({
      apiKey: options.apiKey || '',
      model: options.inspectionModel || options.model || AGENT_B_DEFAULT_MODEL,
      baseUrl: options.baseUrl || 'https://api.openai.com/v1',
      providerName: 'agentb',
      universalPayload: true,           // Muatan BEAST sejagat (Mandat §A + BETA RUN 10)
      beastMaxTokens: parseAgentBTimeout(options.maxTokens, AGENT_B_MAX_TOKENS), // siling 128K (BETA RUN 10)
      translationTimeout: inspectionTimeoutMs / 1000,
      maxRetries: 0,                    // Fail fast — satu percubaan sahaja per model
      enableJsonOutput: false,          // Parse JSON manual (kompatibilitas maksimum endpoint)
      ssrfLookup: options.ssrfLookup || null
    });

    this.inspectionTimeoutMs = inspectionTimeoutMs;
    this.preflightTimeoutMs = preflightTimeoutMs;

    // Pembina asas clamp translationTimeout kepada >= 5000ms — enforce semula
    // had mandate: 60s bagi semakan batch (lalai instance); Fasa 0 dinaikkan
    // sementara kepada 150s oleh runPreflightPass(). Sandaran (deepseek)
    // mewarisi had masa yang sama — failover berkongsi headroom ini.
    this.translationTimeout = inspectionTimeoutMs;

    // ── TRINITY DUAL-AGENT (UNIVERSAL PAYLOAD 2026-09-26 + BETA RUN 9) ──
    // Dua hierarki berasingan bagi dua fasa:
    //   - Pemeriksa Utama : options.model (lalai deepseek-v4-pro)
    //       → modelHierarchy = [deepseek-v4-pro, deepseek-v4.1-flash]
    //   - Pre-Flight Fasa 0: options.preflightModel (lalai deepseek-v4-pro)
    //       → preflightHierarchy = [deepseek-v4-pro, deepseek-v4.1-flash]
    //   - Fallback pemeriksa: options.fallbackModel (lalai deepseek-v4.1-flash);
    //     'none' ATAU kosong ATAU sama dengan model utama → model tunggal.
    // this.model sentiasa menjejak model AKTIF supaya log forensik melaporkan
    // model sebenar yang sedang beroperasi.
    this.model = String(options.model || options.inspectionModel || AGENT_B_DEFAULT_MODEL).trim() || AGENT_B_DEFAULT_MODEL;
    this.preflightModel = String(options.preflightModel || AGENT_B_PREFLIGHT_MODEL).trim() || AGENT_B_PREFLIGHT_MODEL;
    const requestedFallback = String(options.fallbackModel || AGENT_B_FALLBACK_MODEL).trim();

    const buildHierarchy = (primary) => {
      const hierarchy = [primary];
      if (
        requestedFallback &&
        requestedFallback.toLowerCase() !== 'none' &&
        requestedFallback.toLowerCase() !== primary.toLowerCase()
      ) {
        hierarchy.push(requestedFallback);
      }
      return hierarchy;
    };
    this.modelHierarchy = buildHierarchy(this.model);
    this.preflightHierarchy = buildHierarchy(this.preflightModel);

    this.fallbackModel = this.modelHierarchy.length > 1 ? this.modelHierarchy[1] : null;
    this.inspectionModel = this.model;

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
  async _callWithFailover(operation, attempt, isFailure, hierarchyOverride = null) {
    const failedAttempts = [];
    // TRINITY BETA RUN 9: Pre-Flight menggunakan preflightHierarchy
    // (deepseek-v4-pro → deepseek-v4.1-flash); Pemeriksaan menggunakan
    // modelHierarchy (deepseek-v4-pro → deepseek-v4.1-flash). Suntikan
    // hierarki mengatasi kedua-duanya (kes ujian susunan tersuai).
    const hierarchy = Array.isArray(hierarchyOverride) && hierarchyOverride.length > 0
      ? hierarchyOverride
      : this.modelHierarchy;
    for (let i = 0; i < hierarchy.length; i++) {
      const model = hierarchy[i];
      this.model = model; // log + payload pembawa sentiasa melihat model aktif
      let result;
      try {
        result = await attempt(model);
      } catch (err) {
        // ZERO-SWALLOWED-ERROR §3B/§4B: status + punca sebenar, bukan generik
        const status = err?.statusCode || err?.response?.status || err?.status || 'N/A';
        failedAttempts.push({ model, error: err });
        if (i < hierarchy.length - 1) {
          log.warn(() => `[AgentB] ${operation} on ${model} failed (Status: ${status}): ${err?.message || err}. Failing over to ${hierarchy[i + 1]}...`);
          // Mandat Seni Bina Universal Payload §C: format trigger wajib
          log.warn(() => `[AgentB] Fallback triggered -> [${hierarchy[i + 1]}]`);
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
      if (i < hierarchy.length - 1) {
        log.warn(() => `[AgentB] ${operation} on ${model} failed (${reason}). Failing over to ${hierarchy[i + 1]}...`);
        // Mandat Seni Bina Universal Payload §C: format trigger wajib
        log.warn(() => `[AgentB] Fallback triggered -> [${hierarchy[i + 1]}]`);
        continue;
      }
      log.warn(() => `[AgentB] ${operation} on ${model} failed (${reason}). All models exhausted.`);
      throw new Error(`${operation}: ${reason} on all models`);
    }
    // Tidak boleh dicapai — loop sentiasa return/throw
    throw new Error(`${operation}: exhausted`);
  }

  // SILING TOKEN BEAST (BETA RUN 10 — Mandat Beast Mode DeepSeek Frontier
  // 2026-09-27): muatan BEAST menghantar max_tokens = 131072 (128K rasmi
  // apabila reasoning_effort="max") — override getCappedMaxOutputTokens()
  // warisan (4096/16384) kekal dipadam; CoT + JSON bebas terpotong.

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
    // Fasa 0 membaca teks episod penuh (hingga 250k aksara) dan menjana
    // analisis tema — naikkan had masa axios kepada 150s untuk panggilan
    // ini sahaja (BEAST MODE BETA RUN 10 — di bawah siling 300s Caddy),
    // kemudian pulihkan 60s (fasa pemeriksaan batch). Fallback pemeriksa
    // deepseek-v4.1-flash mewarisi had masa fasa yang sama (timeout
    // dinamik) — failover berkongsi headroom ini.
    // SELAMAT dari race: preflight di-await sepenuhnya oleh enjin sebelum
    // mana-mana panggilan batch bermula; fasa tidak bertindih.
    const previousTimeout = this.translationTimeout;
    const previousModel = this.model;
    this.translationTimeout = this.preflightTimeoutMs; // 150s headroom (BETA RUN 10)

    // TRINITY FAILOVER (Universal Payload 2026-09-26 §2B): Fasa 0 dihalakan
    // ke preflightHierarchy [deepseek-v4-pro → deepseek-v4.1-flash]. Setiap model
    // menjalankan Fasa 0 penuh melalui runPreflightSemanticPass dengan hook
    // zero-swallowed-error. null + hook aktif = kegagalan model (failover);
    // null tanpa hook = skip sahaja (fail kecil / tiada teks) — jangan failover.
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
        (outcome) => outcome && outcome.ok === false,
        this.preflightHierarchy // TRINITY BETA RUN 9: Fasa 0 → [deepseek-v4-pro → deepseek-v4.1-flash]
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
   * @param {{batchIndex?:number, totalBatches?:number, preflightContext?:Object}} [meta] - Meta batch
   *        (preflightContext: konteks Fasa 0 — theme/terms/characters — untuk
   *        CONTEXT-AWARE AUDIT; mandat operasi mutlak 2026-09-27)
   * @returns {Promise<{valid:boolean, crimes?:Array, failOpen?:boolean, skipped?:string, modelUsed?:string}>}
   */
  async runSemanticInspection(sourceBatch, translatedEntries, meta = {}) {
    // Circuit breaker terbuka → senyap terus (tiada panggilan rangkaian)
    if (this._circuitOpen) {
      return { valid: true, skipped: 'circuit_open' };
    }

    // CONTEXT-AWARE AUDIT: konteks Pre-Flight dihantar melalui meta supaya
    // signature lama runSemanticInspection(source, translated) kekal sah.
    const payload = buildInspectionPayload(sourceBatch, translatedEntries, meta.preflightContext || null);
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
          // menghantarnya verbatim). maxRetries 0 per model + timeout 90s.
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
  formatPreflightContextForInspection,
  INSPECTOR_INSTRUCTION,
  AGENT_B_DEFAULT_MODEL,
  AGENT_B_PREFLIGHT_MODEL,
  AGENT_B_FALLBACK_MODEL,
  AGENT_B_PREFLIGHT_TIMEOUT_MS,
  AGENT_B_INSPECTION_TIMEOUT_MS,
  AGENT_B_MAX_TOKENS,
  AGENT_B_CIRCUIT_THRESHOLD
};
