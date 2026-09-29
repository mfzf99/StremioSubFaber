/**
 * SubFaber Pre-Flight Semantic Pass (Fasa 0) — SKEMA 4-TIANG (BETA RUN 9)
 *
 * Satu panggilan AI ringkas per fail SEBELUM batch translation bermula:
 *   1. Ekstrak teks mentah keseluruhan fail (TANPA timecode — timeline
 *      physically cannot be touched).
 *   2. AI jana kontrak JSON 4-TIANG (Mandat Penyatuuan DeepSeek Stack &
 *      Hierarki Kebenaran, Beta Run 9 2026-09-27 — dilaksanakan oleh
 *      deepseek-v4-pro):
 *        1. "theme"             — Ringkasan naratif makro (Bahasa Inggeris, 2-3 ayat).
 *        2. "terms"             — Istilah teknikal, lokasi, entiti industri [{source,target}].
 *        3. "characters"        — Profil watak utama berulang [{name, canonical_address, role}].
 *        4. "credits_and_titles"— Teks pembukaan bukan dialog [{source,target}] (baris 1-5).
 *   3. Output disimpan dalam engine state (this.preflightContext) dan
 *      disuntik ke setiap prompt batch sebagai konteks global (4 seksyen).
 *
 * Prinsip reka bentuk (dari laporan plans/subfaber-technical-plan-backend.md §3.1):
 *   - BEST-EFFORT, NON-BLOCKING: kegagalan Fasa 0 TIDAK menggagalkan
 *     terjemahan. Fallback: return null → pipeline jalan tanpa konteks global.
 *   - Token guard: fail besar di-sample merata (setiap k-th entry) supaya
 *     panggilan Fasa 0 kekal murah (~12k token input max).
 *   - SIFAR PERUBAHAN KOD RAPUH (Mandat Beta Run 8): tiada hardcoding teks
 *     kredit dalam peraturan batch — pengesanan kredit 100% delegasi kepada
 *     enjin Fasa 0 melalui arahan Pre-Flight; Agent A menerima hanya hasil
 *     JSON terurai.
 *   - DISIPLIN BUKTI (Mandat BETA RUN 9 — Anti 'Upstream Error Propagation'):
 *     Pre-Flight DILARANG meneka maklumat watak/gelaran tanpa bukti teks
 *     eksplisit (FACT VS INFERENCE DISCIPLINE). Racun tekaan tidak menular
 *     ke Agent A kerana Agent A diikat oleh HIERARCHY OF TRUTH (dialog
 *     sumber mengatasi andaian Pre-Flight).
 *
 * Formula: VideoLingo get_summary_prompt (Otak/Persona) — diadaptasi untuk
 * kontrak SubFaber. Lihat plans/subfaber-technical-plan-backend.md.
 *
 * Sejarah penalaan (dikekalkan sebagai kontrak regresi):
 *   - BETA RUN 7 (2026-09-27, Preflight Coherence Tune): medan 'theme' DIKUNCI
 *     kepada Bahasa Inggeris (elak 'framing interference' pada Agent A) —
 *     kini digabungkan ke dalam TIANG 1 skema 4-tiang; gelaran watak pula
 *     dinaik taraf menjadi TIANG 3 "characters" (canonical_address lock).
 */

const log = require('../utils/logger');
// [UNIVERSAL-FIX] Target-conditional prompt composition — pack di-resolve
// mengikut bahasa sasaran (Malay → malay.js; lain → generic.js).
const { getLanguagePack } = require('./prompts/languagePacks');

// HEADROOM PRINSIP (Mandat Penghapusan 48k 2026-09-26): fail drama boleh
// mencecah 1,500–2,500 baris (150k–200k aksara). Siling 48k lama memaksa
// sampling yang membuang watak/plot babak tengah & akhir. GLM-5.3-flash
// mempunyai konteks 1M token — muatan 250k aksara hanya ~5% kapasiti.
// SILING BAHARU: 250,000 aksara (~2,500 entri penuh) — tiada pemotongan
// jalan cerita; sampling hanya aktif melebihi siling keselamatan ini.
const MAX_PREFLIGHT_CHARS = 250000;
const PREFLIGHT_MAX_INPUT_CHARS = MAX_PREFLIGHT_CHARS; // alias warisan
// Skip sampling jika fail lebih kecil dari ini (entries)
const PREFLIGHT_MIN_ENTRIES = 10;
// Had bilangan istilah yang diterima (VideoLingo: "Extract less than 15 terms")
const PREFLIGHT_MAX_TERMS = 15;
// Had bilangan watak utama (TIANG 3) — watak utama berulang sahaja, bukan extras
const PREFLIGHT_MAX_CHARACTERS = 12;
// Had bilangan kredit/gelaran pembukaan (TIANG 4) — baris 1-5 sahaja diperiksa
const PREFLIGHT_MAX_CREDITS = 10;

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
  // (HANYA melebihi siling 250k — fail sehingga 2,500 entri diserahkan penuh)
  const k = Math.ceil(totalChars / MAX_PREFLIGHT_CHARS);
  const sampled = entries.filter((_, idx) => idx % k === 0);
  log.debug(() => `[SubFaberPreflight] Large file (${entries.length} entries, ${totalChars} chars) sampled to ${sampled.length} entries (k=${k})`);
  return sampled;
}

/**
 * Bina prompt Fasa 0 (adaptasi VideoLingo get_summary_prompt — SKEMA 4-TIANG).
 * Prompt ringkas — dihantar sebagai flat user prompt (konsisten v1.6.0 surgery).
 *
 * SIFAR PERUBAHAN KOD RAPUH (Mandat Beta Run 8): tiada teks kredit yang
 * di-hardcode dalam peraturan batch Agent A. Contoh kredit ("Adapted from...")
 * wujud HANYA sebagai arahan pemeriksaan kepada Kimi K3 di sini (Fasa 0) —
 * Agent A menerima terjemahan muktamad melalui data JSON, bukan peraturan.
 *
 * [UNIVERSAL-FIX] TARGET-CONDITIONAL ARCHITECTURE (2026-09-28): Prompt ini
 * kini TEMPLATE — matriks honorifik, arahan canonical_address, dan contoh
 * kredit disuntik daripada language pack mengikut bahasa sasaran:
 *   - Malay (ms/my/mya/zsm/...) → malay.js (matriks gelaran penuh BM +
 *     contoh kredit rasmi BM) — IDENTIK dengan tingkah laku lama (tiada
 *     regresi kualiti).
 *   - Bukan-Malay (vi/ja/es/... 432 lagi) → generic.js (peraturan neutral).
 * SIFAR teks khusus-Malay di-hardcode dalam fail ini — getLanguagePack()
 * satu-satunya punca.
 *
 * @param {string} rawText - Teks dialog mentah (tanpa timecode)
 * @param {string} targetLanguage - Bahasa sasaran (untuk terjemahan istilah)
 * @param {string} sourceLanguage - Bahasa sumber (label, boleh kosong)
 * @returns {string} Prompt lengkap
 */
function buildPreflightPrompt(rawText, targetLanguage, sourceLanguage) {
  const src = sourceLanguage || 'the source language';
  const tgt = targetLanguage || 'the target language';
  // [UNIVERSAL-FIX] {{PLACEHOLDER}} injection: pack mengikut bahasa sasaran.
  const pack = getLanguagePack(targetLanguage);
  const honorificMatrix = pack.honorificMatrix.replaceAll('${tgt}', tgt);
  const canonicalAddressMatrix = pack.canonicalAddressMatrix.replaceAll('${tgt}', tgt);
  const creditsExample = pack.creditsExample.replaceAll('${tgt}', tgt);
  return `## Role
You are a video translation expert and terminology consultant, specializing in ${src} comprehension and ${tgt} expression optimization.

## FACT VS INFERENCE DISCIPLINE (MANDATORY)
FACT VS INFERENCE DISCIPLINE: Only lock relationships or canonical_address in 'characters' if there is EXPLICIT, UNAMBIGUOUS textual evidence in the source. If gender, social hierarchy, or formal title is unclear, DO NOT GUESS; mark canonical_address as null or omit the character.
- Every name, gender, title, and relationship you output must be supported by explicit dialogue evidence (how characters address each other in the text).
- Prefer omission over hallucination: a shorter 'characters' list with only evidenced entries is always safer than an invented one.

## Task
For the provided ${src} subtitle dialogue, build the 4-pillar pre-flight context:
1. Summarize the main topic.
   The 'theme' field MUST be written strictly in clear, precise English (2-3 sentences), summarizing the narrative arc (plot), setting, and central conflict/stakes.
2. Extract technical terms, location names, and industry entities with ${tgt} translations.
   Each 'terms' entry is an object with exactly two keys: "source" (original text) and "target" (${tgt} translation or original).
   ${honorificMatrix}
3. Build profiles for the main recurring characters.
   Each 'characters' entry is an object with exactly three keys:
   - "name": the character's name exactly as it appears in the dialogue.
   - "canonical_address": the ONE locked ${tgt} address/title used for this character every single time (one canonical address per character, never alternate). ${canonicalAddressMatrix}. Lock ONLY with explicit, unambiguous textual evidence per the FACT VS INFERENCE DISCIPLINE; if gender, social hierarchy, or formal title is unclear, set null instead of guessing.
   - "role": a short description of their narrative role (e.g. female lead, antagonist, mentor, butler).
4. Scan the EARLIEST lines of the file (lines 1-5) for NON-DIALOGUE opening text.
   If the file opens with production credits (e.g. "Adapted from..."), the work's title, or a studio name card, ${creditsExample}.
   If the file starts directly with normal dialogue, return an empty array [] for 'credits_and_titles'.
   Each 'credits_and_titles' entry is an object with exactly two keys: "source" (original opening text) and "target" (official ${tgt} translation).

## INPUT
<text>
${rawText}
</text>

## Output in only JSON format and no other text
{
  "theme": "Summary of the content — strictly in English (2-3 sentences: narrative arc, setting, conflict)",
  "terms": [
    { "source": "Original term", "target": "${tgt} translation or original" }
  ],
  "characters": [
    { "name": "Character name", "canonical_address": "Locked ${tgt} address/title, or null if unclear", "role": "Narrative role" }
  ],
  "credits_and_titles": [
    { "source": "Opening credit/title text", "target": "Official ${tgt} translation" }
  ]
}

You must respond ONLY with a raw JSON object matching the schema. Do not write any conversational preamble, introduction, or markdown commentary.

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
 * Resolve medan dari objek dengan beberapa kunci calon (ketahanan skema —
 * terima kunci 4-tiang baharu DAN kunci warisan Beta Run 7 tanpa gagal).
 * @param {Object} obj - Objek sumber
 * @param {...string} keys - Kunci calon mengikut keutamaan
 * @returns {string} Nilai pertama yang tidak kosong (trimmed), atau ''
 */
function pickField(obj, ...keys) {
  if (!obj || typeof obj !== 'object') return '';
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

/**
 * Parse + sanitize respons Fasa 0 (SKEMA 4-TIANG). Tahan kandungan rosak:
 *   - stripReasoningTags (tag penaakulan GLM/DeepSeek) dipanggil oleh caller
 *   - Resilient parser: fences, chatter, koma tergantung, control chars
 *   - Validasi struktur { theme, terms, characters, credits_and_titles }
 *   - Kunci warisan Beta Run 7 (src/tgt) diterima untuk ketahanan maksimum
 *   - Hadkan setiap tiang kepada siling mandat masing-masing
 * @param {string} responseText - Respons mentah model
 * @returns {{theme:string, terms:Array<{source:string,target:string,note:string}>,
 *            characters:Array<{name:string,canonical_address:string,role:string}>,
 *            credits_and_titles:Array<{source:string,target:string}>}|null}
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

  // ── TIANG 2: terms [{source, target}] (kunci warisan src/tgt diterima) ──
  const terms = [];
  if (Array.isArray(parsed.terms)) {
    for (const term of parsed.terms) {
      if (!term || typeof term !== 'object') continue;
      const source = pickField(term, 'source', 'src');
      if (!source) continue;
      terms.push({
        source,
        target: pickField(term, 'target', 'tgt') || source,
        note: pickField(term, 'note')
      });
      if (terms.length >= PREFLIGHT_MAX_TERMS) break;
    }
  }

  // ── TIANG 3: characters [{name, canonical_address, role}] ──
  const characters = [];
  if (Array.isArray(parsed.characters)) {
    for (const character of parsed.characters) {
      if (!character || typeof character !== 'object') continue;
      const name = pickField(character, 'name');
      if (!name) continue;
      // MANDAT SOSIOLINGUISTIK 2026-09-27: nilai null dikekalkan SEBAGAI null
      // (fallback lama `|| name` memadam isyarat "tidak dikunci" — punca akar
      // ketirisan gelaran Ms.→Cik; Agent A kini menerima isyarat NOT LOCKED).
      const rawAddress = character['canonical_address'];
      const legacyAddress = character['canonicalAddress'];
      const resolvedAddress = (rawAddress !== undefined && rawAddress !== null && String(rawAddress).trim() !== '')
        ? rawAddress
        : ((legacyAddress !== undefined && legacyAddress !== null && String(legacyAddress).trim() !== '')
          ? legacyAddress
          : null);
      characters.push({
        name,
        canonical_address: resolvedAddress,
        role: pickField(character, 'role')
      });
      if (characters.length >= PREFLIGHT_MAX_CHARACTERS) break;
    }
  }

  // ── TIANG 4: credits_and_titles [{source, target}] ──
  const creditsAndTitles = [];
  if (Array.isArray(parsed.credits_and_titles)) {
    for (const credit of parsed.credits_and_titles) {
      if (!credit || typeof credit !== 'object') continue;
      const source = pickField(credit, 'source', 'src');
      if (!source) continue;
      creditsAndTitles.push({
        source,
        target: pickField(credit, 'target', 'tgt') || source
      });
      if (creditsAndTitles.length >= PREFLIGHT_MAX_CREDITS) break;
    }
  }

  return { theme, terms, characters, credits_and_titles: creditsAndTitles };
}

/**
 * Format konteks Fasa 0 (4 TIANG) untuk suntikan ke prompt batch.
 * @param {{theme:string, terms:Array, characters:Array, credits_and_titles:Array}} preflightContext - Hasil Fasa 0
 * @returns {string} Blok teks "Content Summary + Technical Glossary + Character Hierarchy + Opening Credits / Titles"
 */
function formatPreflightForPrompt(preflightContext, targetLanguage) {
  if (!preflightContext || !preflightContext.theme) return '';
  // [UNIVERSAL-FIX] NOT-LOCKED guidance mengikut pack bahasa sasaran.
  // Lalai 'Malay' mengekalkan tingkah laku lama (matriks BM) bagi pemanggil
  // warisan yang tidak menghantar targetLanguage; pemanggil enjin menghantar
  // bahasa sasaran sebenar supaya bukan-Malay dapat panduan neutral.
  const notLockedPack = getLanguagePack(targetLanguage || 'Malay');
  let block = `### Content Summary\n${preflightContext.theme}`;

  // TIANG 2: Technical Glossary
  if (Array.isArray(preflightContext.terms) && preflightContext.terms.length > 0) {
    const termLines = preflightContext.terms
      .map(t => {
        const source = pickField(t, 'source', 'src');
        const target = pickField(t, 'target', 'tgt') || source;
        const note = pickField(t, 'note');
        return `- ${source}: ${target}${note ? ` (${note})` : ''}`;
      })
      .filter(line => !line.startsWith('- :'))
      .join('\n');
    if (termLines) {
      block += `\n\n### Technical Glossary\n${termLines}`;
    }
  }

  // TIANG 3: Character Hierarchy
  if (Array.isArray(preflightContext.characters) && preflightContext.characters.length > 0) {
    const charLines = preflightContext.characters
      .map(c => {
        const name = pickField(c, 'name');
        if (!name) return '';
        // MANDAT SOSIOLINGUISTIK 2026-09-27: null canonical_address mesti
        // dirender sebagai isyarat NOT LOCKED (bukan nama mentah) supaya
        // Agent A boleh menilai gelaran daripada konteks dialog chunk itu.
        const rawAddress = (c && typeof c === 'object') ? c.canonical_address : undefined;
        const legacyAddress = (c && typeof c === 'object') ? c.canonicalAddress : undefined;
        const hasAddress = (rawAddress !== undefined && rawAddress !== null && String(rawAddress).trim() !== '')
          || (legacyAddress !== undefined && legacyAddress !== null && String(legacyAddress).trim() !== '');
        const address = hasAddress
          ? (pickField(c, 'canonical_address', 'canonicalAddress') || name)
          : notLockedPack.notLockedGuidance; // [UNIVERSAL-FIX] pack-driven (Malay / generic)
        const role = pickField(c, 'role');
        return `- ${name} → ${address}${role ? ` (${role})` : ''}`;
      })
      .filter(Boolean)
      .join('\n');
    if (charLines) {
      block += `\n\n### Character Hierarchy\n${charLines}`;
    }
  }

  // TIANG 4: Opening Credits / Titles
  if (Array.isArray(preflightContext.credits_and_titles) && preflightContext.credits_and_titles.length > 0) {
    const creditLines = preflightContext.credits_and_titles
      .map(c => {
        const source = pickField(c, 'source', 'src');
        if (!source) return '';
        const target = pickField(c, 'target', 'tgt') || source;
        return `- ${source}: ${target}`;
      })
      .filter(Boolean)
      .join('\n');
    if (creditLines) {
      block += `\n\n### Opening Credits / Titles\n${creditLines}`;
    }
  }

  return block;
}

/**
 * Jalankan Fasa 0: Pre-Flight Semantic Pass (SKEMA 4-TIANG).
 * BEST-EFFORT: sebarang kegagalan → return null (pipeline jalan tanpa konteks).
 *
 * @param {Array} entries - Parsed SRT entries (dari parseSRT)
 * @param {string} targetLanguage - Bahasa sasaran
 * @param {string} sourceLanguage - Bahasa sumber (label, optional)
 * @param {Object} geminiService - GeminiService instance (atau provider compatible)
 * @param {Object} [options] - Options tambahan
 * @param {Function} [options.onProgress] - Callback progress: ({phase:'preflight', status, summary, terms, characters, credits_and_titles})
 * @param {Function} [options.onParseFailure] - Zero-swallowed-error hook: dipanggil
 *        dengan teks mentah apabila parse gagal (forensik / failover dual-model).
 * @param {Function} [options.onCallError] - Zero-swallowed-error hook: dipanggil
 *        dengan ralat apabila panggilan API Fasa 0 gagal (failover dual-model).
 * @returns {Promise<{theme:string, terms:Array, characters:Array, credits_and_titles:Array}|null>} Konteks Fasa 0 atau null
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
  // Mandat Seni Bina Universal Payload §C: nama model tepat dicatatkan
  // semasa log — [kimi-k3] (Fasa 0) / [deepseek-v4.1-flash] (fallback).
  const preflightModel = (geminiService && geminiService.model) ? geminiService.model : 'unknown';
  log.info(() => `[SubFaberPreflight] Running pre-flight semantic pass (${entries.length} entries) [${preflightModel}]`);

  try {
    // 1. Sample + ekstrak teks mentah (tanpa timecode)
    const sampled = sampleEntriesForPreflight(entries);
    const rawText = buildPreflightRawText(sampled);
    if (!rawText) {
      log.warn(() => '[SubFaberPreflight] No dialogue text extracted, skipping pre-flight');
      await emit({ status: 'skipped' });
      return null;
    }

    // 2. Bina prompt 4-tiang + panggil AI (flat user prompt, JSON output)
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

    log.info(() => `[SubFaberPreflight] Pre-flight complete: theme="${parsed.theme.slice(0, 80)}...", ${parsed.terms.length} terms, ${parsed.characters.length} characters, ${parsed.credits_and_titles.length} credits/titles locked`);
    await emit({
      status: 'done',
      summary: parsed.theme,
      terms: parsed.terms,
      characters: parsed.characters,
      credits_and_titles: parsed.credits_and_titles
    });
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
  MAX_PREFLIGHT_CHARS,
  PREFLIGHT_MAX_INPUT_CHARS,
  PREFLIGHT_MIN_ENTRIES,
  PREFLIGHT_MAX_TERMS,
  PREFLIGHT_MAX_CHARACTERS,
  PREFLIGHT_MAX_CREDITS
};
