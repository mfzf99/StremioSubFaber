/**
 * Agent B — Semantic Inspector & Pre-Flight Offloader
 * (Dual-AI Mandat Pelaksanaan 2026-09-26, Fasa 1)
 *
 * Seni Bina 2-Agent ([MODEL-HIERARCHY] + [PAYLOAD-GODTIER] 2026-09-28 —
 * Trinity Dual-Agent, kredensial rootsys.cloud: 1B token quota / 1M context):
 *   AGENT A (Worker): Gemini 3 Flash — penterjemahan kelompok 60 baris.
 *   AGENT B (Inspector): MODEL HIERARCHY FINAL 2026-09-28 (OpenAI-compatible):
 *     - PRE-FLIGHT (Fasa 0)   : kimi-k3 SAHAJA (STANDALONE — tiada fallback
 *                               merentas model). Kegagalan → RETRY kimi-k3
 *                               (2x berturut) → gagal juga → pre-flight dihentikan,
 *                               terjemahan jalan TANPA konteks (fail-open).
 *                               Pre-flight ialah ASAS — pre-flight lemah daripada
 *                               model sandaran LEBIH BURUK daripada tiada pre-flight.
 *     - PEMERIKSA UTAMA       : deepseek-v4-pro     (Frontier Inspector).
 *     - FALLBACK PEMERIKSA    : deepseek-v4.1-flash (mewarisi had masa fasa).
 *     [PAYLOAD-GODTIER] Muatan 4-KUNCI STREAMING (ground truth empirikal curl
 *     ke gateway rootsys.cloud — Kimi K3, SRT 759 baris):
 *       { model, messages, stream: true, temperature: 0.0 }
 *       stream:true WAJIB — chunk SSE menghidupkan sambungan Caddy (siling
 *       keras 300s tidak lagi membunuh penaakulan panjang; purata 109s, JSON
 *       sah, 18/18 istilah kritikal). Keempat-empat parameter tambahan
 *       muatan 7-kunci lama ialah PENCETUS
 *       OVERTHINKING (+90-110s) dan TANPA stream gagal timeout 300s sepenuhnya.
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

// ── [MODEL-HIERARCHY] Konfigurasi tetap Agent B (FINAL 2026-09-28) ──
// Hierarki model MUKTAMAD (empirikal curl gateway rootsys.cloud):
//   Fasa 0 (Pre-Flight Makro) : kimi-k3 SAHAJA — STANDALONE. Tiada fallback
//                               merentas model. Kegagalan → retry kimi-k3
//                               (AGENT_B_PREFLIGHT_RETRIES) → gagal juga →
//                               pre-flight dihentikan, terjemahan TANPA konteks
//                               (fail-open kontrak sedia ada).
//   Fasa 1 (Pemeriksa Utama)  : deepseek-v4-pro — Timeout 300,000ms / 5 min
//   Fallback Pemeriksa        : deepseek-v4.1-flash — Timeout dinamik
//                               (mewarisi had masa fasa berkaitan)
// NOTA reka bentuk: pre-flight ialah ASAS analisis. Pre-flight daripada
// model sandaran (kualiti rendah) LEBIH BURUK daripada tiada pre-flight —
// itulah sebabnya hierarki Fasa 0 TIDAK MERENTAS keluarga model.
const AGENT_B_DEFAULT_MODEL = 'deepseek-v4-pro';      // Fasa 1: Pemeriksa Utama
const AGENT_B_PREFLIGHT_MODEL = 'kimi-k3';            // Fasa 0: kimi-k3 SAHAJA
// [MODEL-HIERARCHY] Fallback khusus Fasa 0 DIGUGURKAN — kimi-k3 standalone.
// env AGENT_B_PREFLIGHT_FALLBACK_MODEL diabaikan sepenuhnya (nilai muktamad
// sentiasa sama dengan primer supaya hierarki Fasa 0 ialah 1-tingkat).
const AGENT_B_PREFLIGHT_FALLBACK_MODEL = AGENT_B_PREFLIGHT_MODEL;
// Bilangan percubaan RETRY-SAME-MODEL bagi Fasa 0: percubaan pertama + 2
// retry (2x kegagalan berturut) sebelum pre-flight dihentikan (fail-open).
const AGENT_B_PREFLIGHT_RETRIES = 2;
const AGENT_B_FALLBACK_MODEL = 'deepseek-v4.1-flash'; // Fallback Fasa 1 SAHAJA
// [PAYLOAD-GODTIER] SEJARAH (dikekalkan untuk forensik): muatan lama
// BETA RUN 10 membawa 7 kunci; keempat-empat parameter tambahan terbukti
// PENCETUS OVERTHINKING (masing-masing +90-110s) dan digugurkan —
// sekarang hanya {model, messages, stream:true, temperature:0.0}. Kesahan
// JSON dijamin parser tahan lasak. Tiada parameter terlarang dihantar.
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
// [UPSTREAM-RESILIENCE 2026-09-29] Backoff eksponen antara retry-same-model
// Fasa 0. Forensik run S01E31: kimi-k3 di-reset gateway (ECONNRESET ~221s),
// lalu 2 retry pukul 502 dalam 200ms TANPA jeda → semua percubaan terbakar
// serta-merta. 502/reset gateway lazimnya transient; jeda 2s→4s memberi
// backend hulu masa pulih. Delay = base * 2^r dihadkan pada siling.
// parseInt kongsi parseAgentBTimeout: integer > 0 sahaja; 0/tak sah → lalai.
// Nilai 0 EKSPLISIT (melumpuhkan backoff — ujian pantas) diterima melalui
// pemeriksaan berasingan supaya tidak jatuh ke lalai 2000.
const parseAgentBBackoff = (raw, fallbackMs) => {
  if (raw === undefined || raw === null || String(raw).trim() === '') return fallbackMs;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackMs;
};
const AGENT_B_PREFLIGHT_RETRY_BACKOFF_MS = parseAgentBBackoff(process.env.AGENT_B_PREFLIGHT_RETRY_BACKOFF_MS, 2000);
const AGENT_B_PREFLIGHT_RETRY_BACKOFF_CAP_MS = 15000;
// MANDAT v3 (pembetulan owner 2026-09-27): siling token muatan DeepSeek —
// 131072 (128K); boleh ditindih melalui env AGENT_B_MAX_TOKENS
// (integer positif sahaja).
const AGENT_B_MAX_TOKENS = parseAgentBTimeout(process.env.AGENT_B_MAX_TOKENS, 131072);
const AGENT_B_CIRCUIT_THRESHOLD = 3;      // 3 kegagalan berturut → silent mode
// [UNBOUNDED-CONTEXT 2026-09-29] Siling lama 200 aksara/baris dan
// 5 jenayah DIGUGURKAN — tiada mandat pemotongan baris dialog (dialog
// bersubtitle boleh melebihi 200 aksara) dan jika batch mengandungi
// 8 jenayah, SEMUA 8 mesti dipulangkan untuk retry. Hanya siling sanity
// pertahanan kekal (id-per-crime + nota ringkas).
const AGENT_B_MAX_IDS_PER_CRIME = 10;     // Cap bilangan id per jenayah (sanity)
const AGENT_B_MAX_NOTE_CHARS = 120;       // Cap panjang nota jenayah (sanity)
// MANDAT OPERASI MUTLAK 2026-09-27: SHIFT dikunci sebagai jenayah ke-4 —
// kandungan dialog berpindah merentasi indeks (dialog baris 5 muncul di
// baris 6). Klausa emas pengurang token di dalam arahan pemeriksa.
const VALID_CRIME_TYPES = new Set(['MERGE', 'DROP', 'PHANTOM', 'SHIFT', 'UNTRANSLATED', 'REGISTER']);
// [UNBOUNDED-CONTEXT 2026-09-29] Siling konteks Pre-Flight (10 istilah /
// 12 watak / 400 aksara tema) DIGUGURKAN sepenuhnya. Sebab: rantaian
// pemotongan — preflight mengekstrak 50 istilah → siling lama memotong
// kepada 15 → inspection memotong kepada 10 → Agent B mengaudit atas
// 10/50 istilah jelah. Inspector MELIHAT konteks Pre-Flight PENUH.

/**
 * Arahan inspector (zero-yap). Dihantar sebagai SATU mesej user lengkap
 * (pariti 1:1 dengan kontrak pembawa OpenAI-compatible projek — payload
 * dibake terus ke dalam prompt, bukan dihantar berasingan).
 * [HARMONY-FIX] 2026-09-29: taksonomi 4 jenayah dipertajam selari dengan
 * structural_rules Agent A. MERGE kini semata-mata isu bilangan slot
 * (off-by-one drift — klausa "fabricated filler" lama dibuang kerana
 * bertindih dengan PHANTOM), PHANTOM = fabrikasi kandungan, DROP = maksud
 * spesifik diganti substitut generik.
 * [SOCIOLINGUISTIC v2 2026-09-29] Taksonomi dikembang 4→6 (selari dengan 8
 * structural_rules Agent A): + UNTRANSLATED (kebocoran salinan malas sumber)
 * + REGISTER (percanggahan gelaran ATAU daftar kata ganti vs Bible Fasa 0).
 * Nota keharmonian: arahan kini eksplisit membenarkan pemampatan &
 * penyesuaian idiom (kerja sah Agent A) supaya tidak tersalah tuduh DROP/
 * PHANTOM — Agent A & Agent B kini berkongsi definisi "terjemahan betul".
 */
const INSPECTOR_INSTRUCTION = `## Role
You are a subtitle integrity inspector. You compare source lines with their translations, line by line.

## Task
Detect ONLY these six violations:
- MERGE: Two source lines merged into ONE output slot, displacing subsequent lines (off-by-one drift).
- DROP: Source line's specific meaning is missing or replaced by a generic substitute that erases it.
- PHANTOM: Output slot contains fabricated content with no basis in its source line (invented dialogue, elaboration, hallucinated detail).
- SHIFT: Dialogue content displaced across indices (line 5 text appearing in line 6's slot).
  NOTE: Ignore minor millisecond timecode differences; audit solely whether the dialogue text matches the corresponding line index.
- UNTRANSLATED: Output slot still carries the source-language sentence verbatim (or near-verbatim) when it clearly should have been translated. This is a LAZY-COPY leak. EXCEPTION — do NOT flag: proper nouns, character/brand/company names, creative-work titles, on-screen credits, or symbol/number/music-note-only lines that are legitimately kept as-is.
- REGISTER: A recurring character's locked form in the Character Address Reference below is contradicted by the translation. This covers BOTH (a) honorific/title mismatch (the reference locks one title but the output uses a different one for the same character) AND (b) pronoun-register mismatch (the reference locks a self/other pronoun pairing but the output switches to a different register for that character). Only flag when the Character Address Reference provides the locked value AND the contradiction is unambiguous.

The translator is REQUIRED to produce natural, idiomatic phrasing: condensing wordy lines, trimming redundant filler, and replacing source idioms with target-language equivalents are all CORRECT and must NOT be flagged. Only flag DROP when a line's core meaning is genuinely lost, and PHANTOM when content is genuinely fabricated — not when the translation is simply shorter, reworded, or idiomatically adapted.

Ignore: translation style, word choice, grammar, tone, cultural adaptation, length reduction, idiomatic rephrasing, and minor omissions — EXCEPT the six violations above.

## Output Contract
Respond with ONLY this JSON and nothing else — no explanations, no markdown:
{"valid":true}
If any violation exists:
{"valid":false,"crimes":[{"type":"MERGE|DROP|PHANTOM|SHIFT|UNTRANSLATED|REGISTER","ids":[line ids],"note":"max 10 words"}]}`;

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
    // UNBOUNDED-CONTEXT: tema penuh disuntik — tiada pemotongan 400 aksara.
    sections.push(`### Story Context (from Pre-Flight)\n${theme}`);
  }

  if (Array.isArray(preflightContext.terms) && preflightContext.terms.length > 0) {
    const termLines = preflightContext.terms
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
    const pick = (...vals) => {
      for (const v of vals) {
        if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim();
      }
      return '';
    };
    const charLines = preflightContext.characters
      .map(c => {
        const name = String(c?.name || '').trim();
        if (!name) return '';
        const narrative = pick(c?.canonical_address, c?.canonicalAddress) || 'address NOT LOCKED';
        // Vocative (direct-address) is optional; only render when it differs
        // from the narrative form so the inspector sees both valid options.
        const vocative = pick(c?.direct_address, c?.directAddress);
        // Pronoun register (self/other pairing) — rendered when locked so the
        // inspector can audit REGISTER (b) pronoun-register mismatches.
        const pronoun = pick(c?.pronoun_register, c?.pronounRegister);
        const role = String(c?.role || '').trim();
        const addressPart = (vocative && vocative !== narrative)
          ? `${narrative} / ${vocative} (when addressed directly)`
          : narrative;
        const pronounPart = pronoun ? ` [pronouns: ${pronoun}]` : '';
        return `- ${name} → ${addressPart}${role ? ` (${role})` : ''}${pronounPart}`;
      })
      .filter(Boolean)
      .join('\n');
    if (charLines) sections.push(`### Character Address Reference (locked titles and pronouns must stay consistent)\n${charLines}`);
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

  // UNBOUNDED-CONTEXT 2026-09-29: pemotongan 200 aksara digugurkan — baris
  // dialog bersubtitle (dengan markup) boleh melebihi 200; whitespace
  // normalization masih dijalankan supaya muatan kekal padat.
  const clamp = (t) => String(t || '')
    .replace(/\s+/g, ' ')
    .trim();

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
      // UNBOUNDED-CONTEXT: tiada siling bilangan jenayah — jika batch
      // mengandungi 8 jenayah, SEMUA 8 mesti dipulangkan untuk retry.
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
 * MUATAN GOD-TIER ([PAYLOAD-GODTIER] 2026-09-28): instance dibina dengan
 * universalPayload=true — buildChatRequest membina muatan 4-kunci streaming
 * TEPAT { model, messages, stream: true, temperature: 0.0 } bagi SEMUA
 * enjin Agent B (deepseek/kimi — endpoint sama). Param tambahan muatan lama
 * digugurkan (pencetus overthinking). Kesahan JSON dijamin parser tahan
 * lasak (stripReasoningTags + parseInspectorResponse), bukan response_format.
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
      beastMaxTokens: parseAgentBTimeout(options.maxTokens, AGENT_B_MAX_TOKENS), // [AUDIT-WARISAN 2026-09-29] no-op — builder 4-kunci god-tier tidak membaca beastMaxTokens
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

    // ── [MODEL-HIERARCHY] DUAL-AGENT FINAL (2026-09-28) ──
    // Dua hierarki berasingan bagi dua fasa:
    //   - Pemeriksa Utama : options.model (lalai deepseek-v4-pro)
    //       → modelHierarchy = [deepseek-v4-pro, deepseek-v4.1-flash]
    //   - Pre-Flight Fasa 0: options.preflightModel (lalai kimi-k3)
    //       → preflightHierarchy = [kimi-k3] SAHAJA — STANDALONE (fallback
    //         merentas model DIGUGURKAN; kegagalan dikendalikan melalui
    //         retry-same-model dalam _callWithFailover).
    //   - Fallback pemeriksa: options.fallbackModel (lalai deepseek-v4.1-flash);
    //     'none' ATAU kosong ATAU sama dengan model utama → model tunggal.
    // this.model sentiasa menjejak model AKTIF supaya log forensik melaporkan
    // model sebenar yang sedang beroperasi.
    this.model = String(options.model || options.inspectionModel || AGENT_B_DEFAULT_MODEL).trim() || AGENT_B_DEFAULT_MODEL;
    this.preflightModel = String(options.preflightModel || AGENT_B_PREFLIGHT_MODEL).trim() || AGENT_B_PREFLIGHT_MODEL;
    const requestedFallback = String(options.fallbackModel || AGENT_B_FALLBACK_MODEL).trim();
    // [MODEL-HIERARCHY] preflightFallbackModel DINEUTRALKAN — sentiasa sama
    // dengan primer Fasa 0 supaya hierarki pre-flight kekal 1-tingkat
    // (kimi-k3 standalone). Nilai options/env lama diabaikan atas sebab:
    // pre-flight daripada model sandaran lebih buruk daripada tiada
    // pre-flight (ujian empirikal kualiti menurun dengan model lemah).
    this.preflightFallbackModel = this.preflightModel;

    const buildHierarchy = (primary, extraFallback = '') => {
      const hierarchy = [primary];
      const addCandidate = (candidate) => {
        if (
          candidate &&
          candidate.toLowerCase() !== 'none' &&
          !hierarchy.some((m) => m.toLowerCase() === candidate.toLowerCase())
        ) {
          hierarchy.push(candidate);
        }
      };
      addCandidate(extraFallback);      // fallback khusus fasa
      addCandidate(requestedFallback);  // fallback universal (kontrak lama dipelihara — Fasa 1 sahaja)
      return hierarchy;
    };
    this.modelHierarchy = buildHierarchy(this.model);
    // [MODEL-HIERARCHY] Fasa 0: kimi-k3 SAHAJA — dedupe primer+preflightFallback
    // (nilai sama) membina hierarki 1-tingkat; requestedFallback tidak disuntik
    // (kimi-k3 TIDAK beralih ke deepseek bagi pre-flight).
    this.preflightHierarchy = buildHierarchy(this.preflightModel, this.preflightFallbackModel)
      .filter((m) => m.toLowerCase() === this.preflightModel.toLowerCase());

    // [MODEL-HIERARCHY] Retry-same-model bagi Fasa 0 (kimi-k3 standalone):
    // 1 percubaan + AGENT_B_PREFLIGHT_RETRIES retry = maksimum 3 panggilan
    // berturut-turut pada model yang sama sebelum fail-open.
    this.preflightRetries = Math.max(0, parseInt(options.preflightRetries, 10) || AGENT_B_PREFLIGHT_RETRIES);

    // [UPSTREAM-RESILIENCE 2026-09-29] Backoff eksponen retry-same-model.
    // Boleh ditindih per-instance (options.preflightRetryBackoffMs) atau env;
    // 0 melumpuhkan jeda (ujian pantas). _sleep boleh di-stub oleh ujian
    // supaya assertion susunan panggilan kekal deterministik tanpa jeda nyata.
    this.preflightRetryBackoffMs = parseAgentBBackoff(options.preflightRetryBackoffMs, AGENT_B_PREFLIGHT_RETRY_BACKOFF_MS);
    this.preflightRetryBackoffCapMs = AGENT_B_PREFLIGHT_RETRY_BACKOFF_CAP_MS;

    this.fallbackModel = this.modelHierarchy.length > 1 ? this.modelHierarchy[1] : null;
    this.inspectionModel = this.model;

    // ── Circuit breaker (per sesi fail — instance dibina per permintaan) ──
    // NOTA [MODEL-HIERARCHY]: breaker tidak lagi mengandaikan hierarki
    // berbilang-model bagi pre-flight — kegagalan Fasa 0 dikira sama seperti
    // kegagalan Fasa 1 (kaunter gabungan per sesi fail).
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
  async _callWithFailover(operation, attempt, isFailure, hierarchyOverride = null, retrySameModel = 0) {
    const failedAttempts = [];
    // [MODEL-HIERARCHY] FINAL 2026-09-28: Pre-Flight menggunakan
    // preflightHierarchy [kimi-k3] SAHAJA (standalone — tiada failover
    // merentas model); Pemeriksaan menggunakan modelHierarchy
    // (deepseek-v4-pro → deepseek-v4.1-flash). Suntikan hierarki mengatasi
    // kedua-duanya (kes ujian susunan tersuai).
    //
    // RETRY-SAME-MODEL ([MODEL-HIERARCHY]): apabila hierarki hanya memuat
    // SATU model (hierarki Fasa 0), kegagalan TIDAK beralih model — model
    // yang sama di-RETRY sehingga `retrySameModel` kali tambahan sebelum
    // kegagalan muktamad. Log `[AgentB] Fallback triggered` TIDAK PERNAH
    // dicetak bagi Fasa 0 (tiada fallback wujud); sebaliknya
    // `[AgentB] Retry-same-model` yang dicetak.
    const hierarchy = Array.isArray(hierarchyOverride) && hierarchyOverride.length > 0
      ? hierarchyOverride
      : this.modelHierarchy;
    const singleModelRetries = (hierarchy.length === 1 && retrySameModel > 0) ? retrySameModel : 0;
    for (let i = 0; i < hierarchy.length; i++) {
      const model = hierarchy[i];
      this.model = model; // log + payload pembawa sentiasa melihat model aktif
      // [MODEL-HIERARCHY] Inner retry loop untuk hierarki model tunggal.
      // totalTries = 1 + singleModelRetries; untuk multi-model (Fasa 1),
      // singleModelRetries = 0 → tingkah laku failover sedia ada 100%.
      const totalTries = 1 + singleModelRetries;
      for (let r = 0; r < totalTries; r++) {
        let result;
        try {
          result = await attempt(model);
        } catch (err) {
          // ZERO-SWALLOWED-ERROR §3B/§4B: status + punca sebenar, bukan generik
          const status = err?.statusCode || err?.response?.status || err?.status || 'N/A';
          failedAttempts.push({ model, error: err });
          const hasSibling = i < hierarchy.length - 1;
          const hasRetry = r < totalTries - 1;
          if (hasRetry) {
            log.warn(() => `[AgentB] ${operation} on ${model} failed (Status: ${status}): ${err?.message || err}. Retry ${r + 1}/${totalTries - 1} on the SAME model [${model}]...`);
            // [UPSTREAM-RESILIENCE] Backoff eksponen SEBELUM retry berikutnya
            // (retry-same-model sahaja — Fasa 1 failover tiada singleModelRetries).
            await this._retrySameModelBackoff(operation, model, r);
            continue;
          }
          if (hasSibling) {
            log.warn(() => `[AgentB] ${operation} on ${model} failed (Status: ${status}): ${err?.message || err}. Failing over to ${hierarchy[i + 1]}...`);
            // Mandat Seni Bina Universal Payload §C: format trigger wajib
            log.warn(() => `[AgentB] Fallback triggered -> [${hierarchy[i + 1]}]`);
            break;
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
        const hasSibling = i < hierarchy.length - 1;
        const hasRetry = r < totalTries - 1;
        if (hasRetry) {
          log.warn(() => `[AgentB] ${operation} on ${model} failed (${reason}). Retry ${r + 1}/${totalTries - 1} on the SAME model [${model}]...`);
          // [UPSTREAM-RESILIENCE] Backoff eksponen SEBELUM retry berikutnya.
          await this._retrySameModelBackoff(operation, model, r);
          continue;
        }
        if (hasSibling) {
          log.warn(() => `[AgentB] ${operation} on ${model} failed (${reason}). Failing over to ${hierarchy[i + 1]}...`);
          // Mandat Seni Bina Universal Payload §C: format trigger wajib
          log.warn(() => `[AgentB] Fallback triggered -> [${hierarchy[i + 1]}]`);
          break;
        }
        log.warn(() => `[AgentB] ${operation} on ${model} failed (${reason}). All models exhausted.`);
        throw new Error(`${operation}: ${reason} on all models`);
      }
    }
    // Tidak boleh dicapai — loop sentiasa return/throw
    throw new Error(`${operation}: exhausted`);
  }

  /**
   * [UPSTREAM-RESILIENCE 2026-09-29] Jeda boleh-diganti (test-stubbable).
   * Diasingkan supaya ujian boleh menindih tanpa jeda nyata.
   * @param {number} ms - Milisaat untuk tidur
   * @returns {Promise<void>}
   */
  _sleep(ms) {
    const delay = Number(ms);
    if (!Number.isFinite(delay) || delay <= 0) return Promise.resolve();
    return new Promise((resolve) => setTimeout(resolve, delay));
  }

  /**
   * [UPSTREAM-RESILIENCE 2026-09-29] Backoff eksponen antara percubaan
   * retry-same-model. r=0 → base; r=1 → base*2; dihadkan pada cap. Jeda 0
   * (env/option) melangkau tidur sepenuhnya. Berasingan supaya ujian boleh
   * stub _sleep dan mengesahkan susunan panggilan tanpa jeda dinding-jam.
   * @param {string} operation - Label operasi (untuk log)
   * @param {string} model - Model aktif (untuk log)
   * @param {number} r - Indeks percubaan semasa (0-based)
   * @returns {Promise<void>}
   */
  async _retrySameModelBackoff(operation, model, r) {
    const base = Number(this.preflightRetryBackoffMs) || 0;
    if (base <= 0) return; // backoff dilumpuhkan
    const cap = Number(this.preflightRetryBackoffCapMs) || base;
    const delay = Math.min(cap, base * Math.pow(2, r));
    log.debug(() => `[AgentB] ${operation} backoff ${delay}ms before retrying [${model}]`);
    await this._sleep(delay);
  }

  // [PAYLOAD-GODTIER] SEJARAH (dikekalkan untuk forensik): muatan BEAST lama
  // membawa siling token 131072 (128K) — kini DIGUGURKAN sepenuhnya daripada
  // muatan 4-kunci god-tier (pencetus overthinking + istilah kritikal
  // tergugur). Constant AGENT_B_MAX_TOKENS kekal untuk keserasian warisan.

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

    // [MODEL-HIERARCHY] FAILOVER FINAL (2026-09-28): Fasa 0 dihalakan ke
    // preflightHierarchy [kimi-k3] SAHAJA — STANDALONE. Kegagalan kimi-k3
    // TIDAK beralih model; model yang sama di-retry (preflightRetries = 2)
    // melalui _callWithFailover(retrySameModel). 2x kegagalan berturut
    // → pre-flight dihentikan, terjemahan jalan tanpa konteks (fail-open
    // kontrak asal). null + hook aktif = kegagalan model (retry);
    // null tanpa hook = skip sahaja (fail kecil / tiada teks) — jangan retry.
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
        this.preflightHierarchy, // [MODEL-HIERARCHY] Fasa 0 → [kimi-k3] SAHAJA
        this.preflightRetries    // [MODEL-HIERARCHY] retry-same-model (kimi-k3), bukan failover
      );
      return result && result.ok ? result.context : null;
    } catch (failoverErr) {
      // SEMUA percubaan kimi-k3 gagal — Fasa 0 kekal NON-BLOCKING (kontrak
      // asal): pulangkan null, pipeline jalan tanpa konteks global. Punca
      // teknikal telah dipapar oleh _callWithFailover (zero-swallowed).
      log.warn(() => `[AgentB] Pre-flight exhausted all attempts on [${this.preflightModel}] — continuing without global context (non-blocking): ${failoverErr?.message || failoverErr}`);
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
  AGENT_B_PREFLIGHT_FALLBACK_MODEL, // [MODEL-HIERARCHY] sentiasa = primer Fasa 0
  AGENT_B_PREFLIGHT_RETRIES,        // [MODEL-HIERARCHY] retry-same-model Fasa 0
  AGENT_B_PREFLIGHT_RETRY_BACKOFF_MS,     // [UPSTREAM-RESILIENCE] backoff base retry Fasa 0
  AGENT_B_PREFLIGHT_RETRY_BACKOFF_CAP_MS, // [UPSTREAM-RESILIENCE] siling backoff
  AGENT_B_PREFLIGHT_TIMEOUT_MS,
  AGENT_B_INSPECTION_TIMEOUT_MS,
  AGENT_B_MAX_TOKENS,
  AGENT_B_CIRCUIT_THRESHOLD
};
