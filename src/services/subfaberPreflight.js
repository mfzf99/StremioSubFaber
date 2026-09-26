/**
 * SubFaber Pre-Flight Semantic Pass (Fasa 0)
 *
 * Satu panggilan AI ringkas per fail SEBELUM batch translation bermula:
 *   1. Ekstrak teks mentah keseluruhan fail (TANPA timecode — timeline
 *      physically cannot be touched).
 *   2. AI jana: Content Summary (2 ayat) + Points to Note / Glosari Watak.
 *   3. Output disimpan dalam engine state (this.preflightContext) dan
 *      disuntik ke setiap prompt batch sebagai konteks global.
 *
 * Prinsip reka bentuk (dari laporan plans/subfaber-technical-plan-backend.md §3.1):
 *   - BEST-EFFORT, NON-BLOCKING: kegagalan Fasa 0 TIDAK menggagalkan
 *     terjemahan. Fallback: return null → pipeline jalan tanpa konteks global.
 *   - Token guard: fail besar di-sample merata (setiap k-th entry) supaya
 *     panggilan Fasa 0 kekal murah (~12k token input max).
 *   - Output JSON deterministik via responseMimeType (enableJsonOutput).
 *
 * Formula: VideoLingo get_summary_prompt (Otak/Persona) — diadaptasi untuk
 * kontrak SubFaber. Lihat plans/subfaber-technical-plan-backend.md.
 */

const log = require('../utils/logger');

// Had saiz input Fasa 0 (karakter kasar ~ 4 char/token → ~12k token)
const PREFLIGHT_MAX_INPUT_CHARS = 48000;
// Skip sampling jika fail lebih kecil dari ini (entries)
const PREFLIGHT_MIN_ENTRIES = 10;
// Had bilangan istilah yang diterima (VideoLingo: "Extract less than 15 terms")
const PREFLIGHT_MAX_TERMS = 15;

/**
 * Bina teks mentah dari entries SRT untuk Fasa 0.
 * Timecode dibuang sepenuhnya — hanya dialog disertakan.
 * @param {Array<{id:number, timecode:string, text:string}>} entries - Parsed SRT entries
 * @returns {string} Raw dialogue text (satu baris per entry)
 */
function buildPreflightRawText(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return '';
  return entries
    .map(e => String(e?.text || '').trim())
    .filter(Boolean)
    .join('\n');
}

/**
 * Sample entries merata untuk fail besar (setiap k-th entry) supaya
 * panggilan Fasa 0 kekal dalam bajet token.
 * @param {Array} entries - Parsed SRT entries
 * @returns {Array} Sampled entries (atau entries asal jika kecil)
 */
function sampleEntriesForPreflight(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return [];
  const totalChars = entries.reduce((sum, e) => sum + String(e?.text || '').length, 0);
  if (totalChars <= PREFLIGHT_MAX_INPUT_CHARS) {
    return entries; // Kecil — hantar semua
  }
  // Sampling merata: kekal k-th entry supaya plot arc tersebar
  const k = Math.ceil(totalChars / PREFLIGHT_MAX_INPUT_CHARS);
  const sampled = entries.filter((_, idx) => idx % k === 0);
  log.debug(() => `[SubFaberPreflight] Large file (${entries.length} entries, ${totalChars} chars) sampled to ${sampled.length} entries (k=${k})`);
  return sampled;
}

/**
 * Bina prompt Fasa 0 (adaptasi VideoLingo get_summary_prompt).
 * Prompt ringkas — dihantar sebagai flat user prompt (konsisten v1.6.0 surgery).
 * @param {string} rawText - Teks dialog mentah (tanpa timecode)
 * @param {string} targetLanguage - Bahasa sasaran (untuk terjemahan istilah)
 * @param {string} sourceLanguage - Bahasa sumber (label, boleh kosong)
 * @returns {string} Prompt lengkap
 */
function buildPreflightPrompt(rawText, targetLanguage, sourceLanguage) {
  const src = sourceLanguage || 'the source language';
  const tgt = targetLanguage || 'the target language';
  return `## Role
You are a video translation expert and terminology consultant, specializing in ${src} comprehension and ${tgt} expression optimization.

## Task
For the provided ${src} subtitle dialogue:
1. Summarize the main topic in two sentences
2. Extract professional terms, character names, and recurring entities with ${tgt} translations
3. Provide a brief explanation for each term (max 15 terms)

## INPUT
<text>
${rawText}
</text>

## Output in only JSON format and no other text
{
  "theme": "Two-sentence summary of the content",
  "terms": [
    {
      "src": "Original term",
      "tgt": "${tgt} translation or original",
      "note": "Brief explanation"
    }
  ]
}

Note: Start your answer with { and end with }, do not add any other text.`;
}

/**
 * ZERO-SWALLOWED-ERROR (Mandat Observability 2026-09-26 §3A): bersihkan tag
 * penaakulan GLM/DeepSeek (<think>...</think>, <thinking>...</thinking>)
 * SEBELUM teks diserahkan kepada parsePreflightResponse(). Blok penaakulan
 * boleh berlegar di hadapan JSON jawapan dan menyebabkan parse gagal palsu
 * (isu runtime beta: respons 28s "gagal dihuraikan" sedangkan jawapan sah
 * terbenam selepas <think>).
 * @param {string} text - Respons mentah model
 * @returns {string} Teks tanpa blok penaakulan
 */
function stripReasoningTags(text) {
  // Tag pembuka GLM 5.3 ialah emoji otak (U+1F9E0) — dibina daripada pasangan
  // UTF-16 surrogates supaya literal tidak rosak oleh pipeline penghantaran.
  const GLM_BRAIN = String.fromCharCode(0xD83E, 0xDDE0);
  const brainOpen = new RegExp(GLM_BRAIN + '[\\s\\S]*?<\\/think>', 'gi');
  const brainUnclosed = new RegExp(GLM_BRAIN + '[\\s\\S]*$', 'gi');

  let cleaned = String(text || '');
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/<think>[\s\S]*$/gi, '');          // tag tidak ditutup (stream terpotong)
  cleaned = cleaned.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  cleaned = cleaned.replace(/<thinking>[\s\S]*$/gi, '');        // tag tidak ditutup
  cleaned = cleaned.replace(brainOpen, '');                     // 🧠... </think> (GLM 5.3)
  cleaned = cleaned.replace(brainUnclosed, '');                 // 🧠 tanpa penutup
  return cleaned.trim();
}

/**
 * RESILIENT JSON PARSER (Mandat Pengerasan 2026-09-26 §1, forensik Beta Run 3):
 * JSON.parse asli gagal terhadap anomali sintaks biasa LLM walaupun struktur
 * respons pada asasnya sah (2101 aksara bermula '{"theme": ...}'). Lapisan
 * ini membersihkan anomali KLASIK sebelum parse:
 *   1. Sempadan: teks di antara '{' pertama dan '}' terakhir (buang chatter).
 *   2. Koma tergantung: "},]" dan "},}" — `.replace(/,\s*([}\]])/g, '$1')`.
 *   3. Markdown fences: ```json ... ``` (hex \x60 — konvensyen projek).
 *   4. Aksara kawalan tidak sah (0x00–0x1F kecuali \n \r \t).
 * Sekiranya parse masih gagal selepas pembersihan, mesej ralat sintaks +
 * kedudukan aksara (position offset) + 100 aksara sekitar kawasan bermasalah
 * dicetak pada WARN untuk siasatan forensik segera.
 *
 * @param {string} text - Respons yang telah dibersihkan tag penaakulan
 * @returns {Object|null} Objek JS terhurai, atau null jika tidak boleh diselamatkan
 */
function resilientParseJson(text) {
  let candidate = String(text || '');

  // 3. Buang markdown fences SEBELUM pengekstrakan sempadan supaya
  // fence yang membingkai JSON tidak menghalang pengesanan '{' pertama.
  // (Konstruktor RegExp + string '\\x60' = escape heks 0x60 yang betul —
  // regex literal berganda-backslash TIDAK memadankan backtick sebenar.)
  const fenceOpen = new RegExp('\\x60\\x60\\x60[a-z]*(?:\\r?\\n)?', 'gi');
  candidate = candidate.replace(fenceOpen, '');
  candidate = candidate.replace(new RegExp('\\x60\\x60\\x60', 'g'), '');

  // 1. Ekstrak sempadan: '{' pertama → '}' terakhir (buang perbualan luar).
  const jsonStart = candidate.indexOf('{');
  const jsonEnd = candidate.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    log.warn(() => `[SubFaberPreflight] Resilient parse: no JSON object boundary found`);
    return null;
  }
  if (jsonStart > 0 || jsonEnd < candidate.length - 1) {
    candidate = candidate.slice(jsonStart, jsonEnd + 1);
  }

  // 4. Buang aksara kawalan tidak sah (JSON melarang 0x00–0x1F mentah
  //    kecuali \n \r \t — punca biasa ralat "Unexpected token" LLM).
  candidate = candidate.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

  // 2. Koma tergantung pada array dan object:
  //    {...,}  →  {...}    /    [...,]  →  [...]
  candidate = candidate.replace(/,\s*([}\]])/g, '$1');

  try {
    return JSON.parse(candidate);
  } catch (err) {
    // FORENSIK: kedudukan aksara + 100 aksara sekitar kawasan bermasalah.
    const posMatch = String(err?.message || '').match(/position (\d+)/i);
    const pos = posMatch ? parseInt(posMatch[1], 10) : null;
    let context = '';
    if (Number.isFinite(pos)) {
      const from = Math.max(0, pos - 50);
      const to = Math.min(candidate.length, pos + 50);
      context = ` Offset ${pos} (${from}–${to}): "${candidate.slice(from, to).replace(/\n/g, '\\n')}"`;
    }
    log.warn(() => `[SubFaberPreflight] Resilient parse failed even after cleaning: ${err?.message}.${context}`);
    return null;
  }
}

/**
 * Parse + sanitize respons Fasa 0. Tahan kandungan rosak:
 *   - stripReasoningTags (tag penaakulan GLM/DeepSeek) dipanggil oleh caller
 *   - Resilient parser: fences, chatter, koma tergantung, control chars
 *   - Validasi struktur { theme: string, terms: [{src,tgt,note}] }
 *   - Hadkan terms kepada PREFLIGHT_MAX_TERMS
 * @param {string} responseText - Respons mentah model
 * @returns {{theme:string, terms:Array<{src:string,tgt:string,note:string}>}|null}
 */
function parsePreflightResponse(responseText) {
  if (!responseText || typeof responseText !== 'string') return null;

  // RESILIENT PARSER (Mandat §1): semua pembersihan + forensik dijalankan
  // oleh resilientParseJson — parsePreflightResponse hanya mengesahkan struktur.
  const parsed = resilientParseJson(responseText);

  // Validasi struktur
  if (!parsed || typeof parsed !== 'object') return null;

  const theme = typeof parsed.theme === 'string' ? parsed.theme.trim() : '';
  if (!theme) return null;

  // Sanitize terms
  const terms = [];
  if (Array.isArray(parsed.terms)) {
    for (const term of parsed.terms) {
      if (!term || typeof term !== 'object') continue;
      const src = String(term.src || '').trim();
      if (!src) continue;
      terms.push({
        src,
        tgt: String(term.tgt || src).trim(),
        note: String(term.note || '').trim()
      });
      if (terms.length >= PREFLIGHT_MAX_TERMS) break;
    }
  }

  return { theme, terms };
}

/**
 * Format konteks Fasa 0 untuk suntikan ke prompt batch (Points to Note).
 * @param {{theme:string, terms:Array}} preflightContext - Hasil Fasa 0
 * @returns {string} Blok teks "Content Summary + Points to Note"
 */
function formatPreflightForPrompt(preflightContext) {
  if (!preflightContext || !preflightContext.theme) return '';
  let block = `### Content Summary\n${preflightContext.theme}`;
  if (Array.isArray(preflightContext.terms) && preflightContext.terms.length > 0) {
    const termLines = preflightContext.terms
      .map(t => `- ${t.src}: ${t.tgt}${t.note ? ` (${t.note})` : ''}`)
      .join('\n');
    block += `\n\n### Points to Note\n${termLines}`;
  }
  return block;
}

/**
 * Jalankan Fasa 0: Pre-Flight Semantic Pass.
 * BEST-EFFORT: sebarang kegagalan → return null (pipeline jalan tanpa konteks).
 *
 * @param {Array} entries - Parsed SRT entries (dari parseSRT)
 * @param {string} targetLanguage - Bahasa sasaran
 * @param {string} sourceLanguage - Bahasa sumber (label, optional)
 * @param {Object} geminiService - GeminiService instance (atau provider compatible)
 * @param {Object} [options] - Options tambahan
 * @param {Function} [options.onProgress] - Callback progress: ({phase:'preflight', status, summary, terms})
 * @param {Function} [options.onParseFailure] - Zero-swallowed-error hook: dipanggil
 *        dengan teks mentah apabila parse gagal (forensik / failover dual-model).
 * @param {Function} [options.onCallError] - Zero-swallowed-error hook: dipanggil
 *        dengan ralat apabila panggilan API Fasa 0 gagal (failover dual-model).
 * @returns {Promise<{theme:string, terms:Array}|null>} Konteks Fasa 0 atau null
 */
async function runPreflightSemanticPass(entries, targetLanguage, sourceLanguage, geminiService, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  const emit = async (payload) => {
    if (!onProgress) return;
    try {
      await onProgress({ phase: 'preflight', ...payload });
    } catch (err) {
      log.debug(() => `[SubFaberPreflight] Progress callback error: ${err.message}`);
    }
  };

  // Guard: fail terlalu kecil — skip Fasa 0
  if (!Array.isArray(entries) || entries.length < PREFLIGHT_MIN_ENTRIES) {
    log.info(() => `[SubFaberPreflight] Skipping pre-flight (${Array.isArray(entries) ? entries.length : 0} entries < ${PREFLIGHT_MIN_ENTRIES} minimum)`);
    await emit({ status: 'skipped' });
    return null;
  }

  // Guard: tiada provider
  if (!geminiService || typeof geminiService.translateSubtitle !== 'function') {
    log.warn(() => '[SubFaberPreflight] No provider available, skipping pre-flight');
    await emit({ status: 'skipped' });
    return null;
  }

  await emit({ status: 'running' });
  log.info(() => `[SubFaberPreflight] Running pre-flight semantic pass (${entries.length} entries)`);

  try {
    // 1. Sample + ekstrak teks mentah (tanpa timecode)
    const sampled = sampleEntriesForPreflight(entries);
    const rawText = buildPreflightRawText(sampled);
    if (!rawText) {
      log.warn(() => '[SubFaberPreflight] No dialogue text extracted, skipping pre-flight');
      await emit({ status: 'skipped' });
      return null;
    }

    // 2. Bina prompt + panggil AI (flat user prompt, JSON output)
    const prompt = buildPreflightPrompt(rawText, targetLanguage, sourceLanguage);
    const callStartedAt = Date.now();
    const responseText = await geminiService.translateSubtitle(
      rawText,
      'detected',
      targetLanguage,
      prompt
    );
    const callDuration = Date.now() - callStartedAt;
    const modelUsed = (geminiService && geminiService.model) ? geminiService.model : 'unknown';

    // ZERO-SWALLOWED-ERROR §3A: observability penuh — saiz + durasi + model
    // setiap respons Fasa 0 wajib dipaparkan supaya runtime boleh diper-
    // diagnosis tanpa menebing (isu "blind log" beta 2).
    log.info(() => `[SubFaberPreflight] Raw response received (${String(responseText || '').length} chars) in ${callDuration}ms [${modelUsed}]`);

    // Mandat §3A: bersihkan tag penaakulan GLM/DeepSeek SEBELUM parse.
    const cleanedResponse = stripReasoningTags(responseText);

    // 3. Parse + sanitize
    const parsed = parsePreflightResponse(cleanedResponse);
    if (!parsed) {
      // FORENSIK §B: 500 aksara pertama respons mentah wajib dipaparkan —
      // kita tidak lagi buta terhadap apa yang dipulangkan endpoint.
      const rawForLog = String(cleanedResponse || responseText || '');
      log.warn(() => `[SubFaberPreflight] Parse failure. Raw snippet (first 500 chars): "${rawForLog.slice(0, 500)}..."`);
      if (typeof options.onParseFailure === 'function') {
        try { options.onParseFailure(rawForLog); } catch (_) { /* hook tidak boleh menggagalkan Fasa 0 */ }
      }
      await emit({ status: 'skipped' });
      return null;
    }

    log.info(() => `[SubFaberPreflight] Pre-flight complete: theme="${parsed.theme.slice(0, 80)}...", ${parsed.terms.length} terms locked`);
    await emit({ status: 'done', summary: parsed.theme, terms: parsed.terms });
    return parsed;
  } catch (err) {
    // NON-BLOCKING: kegagalan Fasa 0 tidak menggagalkan terjemahan.
    // ZERO-SWALLOWED-ERROR §A: status + punca teknikal sebenar wajib dicetak.
    const status = err?.statusCode || err?.response?.status || err?.status || 'N/A';
    log.warn(() => `[SubFaberPreflight] Pre-flight API call failed (non-blocking, Status: ${status}): ${err?.message || err}`);
    if (typeof options.onCallError === 'function') {
      try { options.onCallError(err); } catch (_) { /* hook tidak boleh menggagalkan Fasa 0 */ }
    }
    await emit({ status: 'skipped' });
    return null;
  }
}

module.exports = {
  runPreflightSemanticPass,
  buildPreflightRawText,
  sampleEntriesForPreflight,
  buildPreflightPrompt,
  parsePreflightResponse,
  resilientParseJson,
  stripReasoningTags,
  formatPreflightForPrompt,
  PREFLIGHT_MAX_INPUT_CHARS,
  PREFLIGHT_MIN_ENTRIES,
  PREFLIGHT_MAX_TERMS
};
