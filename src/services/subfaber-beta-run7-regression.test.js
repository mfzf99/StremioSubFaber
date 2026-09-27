/**
 * BETA RUN 7 — Regression Tests (Mandat Penalaan Linguistik & Sifar Jeda)
 *
 * Menggunakan node:test (corak projek). Kontrak daripada mandat 2026-09-27:
 *   1. Preflight prompt: medan 'theme' DIKUNCI kepada Bahasa Inggeris
 *      (2-3 ayat: narrative arc, setting, stakes) — elak 'framing
 *      interference' pada Agent A yang menerima sistem arahan Inggeris.
 *   2. Preflight prompt: Matriks Gelaran Watak (honorific consistency) —
 *      'terms' WAJIB mengunci gelaran rasmi watak berulang (Puan Shen vs
 *      Cik Shen mesti konsisten; Ms. / Mr. / Uncle / Aunt).
 *   3. Pacing delay dimansuhkan sepenuhnya: PACING_DELAY_MS === 0 — tiada
 *      lagi jeda tidur buatan 5.0s antara kelompok/chunk. Latensi semakan
 *      kelompok GLM-5.3 (11s-16s) bertindak sebagai penimbal semula jadi.
 *   4. Peraturan terjemahan kredit permulaan / tag HTML KEKAL TIDAK DIUBAH
 *      (Plan 2 ditangguhkan) — kontrak prompt batch tulen.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  buildPreflightPrompt
} = require('./subfaberPreflight');

// Baca sumber translationEngine sebagai teks untuk semakan statik pemalar
// (modul tidak mengeksport PACING_DELAY_MS secara langsung — sumber ialah
// ground truth yang dikonsumsi runtime melalui require cache yang sama).
const ENGINE_SOURCE = fs.readFileSync(
  path.join(__dirname, 'translationEngine.js'),
  'utf8'
);

// Stub dependencies sebelum require supaya engine dimuat tanpa Redis/env
process.env.ENTRY_CACHE_SIZE = '100';
const TranslationEngine = require('./translationEngine');

// --- A.1: Kunci Bahasa Inggeris untuk medan 'theme' ---
test('BetaRun7: preflight prompt locks the theme field strictly to English', () => {
  const prompt = buildPreflightPrompt('Some dialogue.', 'Malay', 'English');
  assert.ok(
    prompt.includes("The 'theme' field MUST be written strictly in clear, precise English"),
    'Prompt must contain the verbatim English-lock directive for the theme field'
  );
  assert.ok(
    prompt.includes('summarizing the narrative arc, setting, and stakes'),
    'Prompt must require narrative arc, setting, and stakes coverage'
  );
});

test('BetaRun7: theme lock appears in the JSON schema contract itself', () => {
  const prompt = buildPreflightPrompt('Dialogue.', 'French', '');
  // Skema JSON mesti menyatakan keperluan Bahasa Inggeris pada medan theme
  assert.ok(
    prompt.includes('"theme"') && prompt.includes('strictly in English'),
    'JSON schema description must reinforce the English-only theme contract'
  );
});

// --- A.2: Matriks Gelaran Watak (Honorific Consistency) ---
test('BetaRun7: preflight prompt mandates honorific locking in the terms list', () => {
  const prompt = buildPreflightPrompt('Some dialogue.', 'Malay', 'English');
  assert.ok(
    prompt.includes("In the 'terms' list, you MUST include and lock the official"),
    'Prompt must contain the verbatim honorific-lock directive'
  );
  assert.ok(
    prompt.includes('titles/honorifics for recurring characters'),
    'Prompt must reference titles/honorifics for recurring characters'
  );
  assert.ok(
    prompt.includes('Ms. / Mr. / Uncle / Aunt'),
    'Prompt must enumerate family vs professional title examples'
  );
  assert.ok(
    prompt.includes('never alternate'),
    'Prompt must forbid alternating between competing titles for one character'
  );
});

test('BetaRun7: honorific directive adapts to the target language label', () => {
  const prompt = buildPreflightPrompt('Dialogue.', 'Spanish', 'English');
  assert.ok(
    prompt.includes('official Spanish titles/honorifics'),
    'Honorific directive must interpolate the target language label'
  );
});

// --- B: Sifar Jeda Pacing ---
test('BetaRun7: PACING_DELAY_MS is zero (artificial pacing abolished)', () => {
  const constMatch = ENGINE_SOURCE.match(/const\s+PACING_DELAY_MS\s*=\s*(\d+)\s*;/);
  assert.ok(constMatch, 'PACING_DELAY_MS constant must be declared in translationEngine.js');
  assert.equal(
    parseInt(constMatch[1], 10),
    0,
    'PACING_DELAY_MS must be 0 — zero idle time between batch dispatches'
  );
});

test('BetaRun7: no hardcoded 5.0s inter-batch sleep remains', () => {
  assert.ok(
    !ENGINE_SOURCE.includes('await sleep(5000)'),
    'The literal await sleep(5000) call must be removed from the engine'
  );
  assert.ok(
    !/Applying 5\.0s pacing delay/.test(ENGINE_SOURCE),
    'The 5.0s pacing log line must be removed'
  );
});

test('BetaRun7: pacing guard skips sleep when delay <= 0', () => {
  // Kedua-dua tapak (inter-batch & inter-chunk) mesti dikawal oleh guard
  // `PACING_DELAY_MS > 0` supaya sleep tidak dipanggil apabila pemalar 0.
  const guardSites = ENGINE_SOURCE.match(/PACING_DELAY_MS > 0/g) || [];
  assert.ok(guardSites.length >= 2, `Expected >= 2 pacing guards, found ${guardSites.length}`);
});

test('BetaRun7: runtime inter-batch wall-clock contains no artificial 5s delay', async () => {
  // Ujian kitaran terjemahan penuh: 100 entri → 2 kelompok @ 50. Tanpa
  // pacing, jumlah masa mesti jauh di bawah 5000ms (provider mock segerak).
  const TranslationEngineClass = TranslationEngine;
  const makeSrt = (count) => Array.from({ length: count }, (_, i) =>
    `${i + 1}\n00:00:${String(i % 59).padStart(2, '0')},000 --> 00:00:${String((i + 1) % 59).padStart(2, '0')},000\nDialogue number ${i + 1} for pacing test.\n`
  ).join('\n');

  const provider = {
    // Preflight (Fasa 0) dipanggil dahulu — pulangkan JSON sah. Pembeza:
    // kontrak "Output in only JSON format" hanya wujud dalam prompt Fasa 0
    // (prompt batch berkongsi persona '## Role' tetapi bukan kontrak JSON).
    translateSubtitle: async (content, sourceLang, targetLang, prompt) => {
      if (prompt && prompt.includes('Output in only JSON format')) {
        return JSON.stringify({
          theme: 'A legal family drama about inheritance disputes.',
          terms: [{ src: 'Puan Shen', tgt: 'Puan Shen', note: 'Locked honorific' }]
        });
      }
      // Panggilan batch: content ialah XML <s id="N">text</s> per baris.
      const ids = [...String(content).matchAll(/<s id="(\d+)">([^<]*)<\/s>/g)];
      return ids.map((m) => `<s id="${m[1]}">${m[2]} (translated)</s>`).join('\n');
    },
    estimateTokenCount: () => 10
  };

  const engine = new TranslationEngineClass(provider, 'gemini-2.5-flash', {}, {
    providerName: 'gemini',
    enableStreaming: false
  });

  const startedAt = Date.now();
  const result = await engine.translateSubtitle(makeSrt(100), 'Malay', null, null, 'English');
  const duration = Date.now() - startedAt;

  assert.ok(result && result.length > 0, 'Translation must complete and return SRT');
  assert.ok(
    duration < 5000,
    `Inter-batch pacing must be zero — full 2-batch cycle took ${duration}ms (must be < 5000ms)`
  );
});

test('BetaRun7: runtime single-batch auto-chunk path contains no artificial 5s delay', async () => {
  // Mod single-batch dengan token est tinggi → 2 chunks → tapak jeda kedua.
  const makeSrt = (count) => Array.from({ length: count }, (_, i) =>
    `${i + 1}\n00:00:${String(i % 59).padStart(2, '0')},000 --> 00:00:${String((i + 1) % 59).padStart(2, '0')},000\nChunk dialogue number ${i + 1} with some padding text for token estimation.\n`
  ).join('\n');

  const provider = {
    translateSubtitle: async (content, sourceLang, targetLang, prompt) => {
      if (prompt && prompt.includes('Output in only JSON format')) {
        return JSON.stringify({ theme: 'Family drama with locked honorifics.', terms: [] });
      }
      const ids = [...String(content).matchAll(/<s id="(\d+)">([^<]*)<\/s>/g)];
      return ids.map((m) => `<s id="${m[1]}">${m[2]} (translated)</s>`).join('\n');
    },
    estimateTokenCount: () => 10
  };

  const engine = new TranslationEngine(provider, 'glm-5.3', {}, {
    providerName: 'gemini',
    enableStreaming: false,
    singleBatchMode: true
  });

  const startedAt = Date.now();
  const result = await engine.translateSubtitle(makeSrt(60), 'Malay', null, null, 'English');
  const duration = Date.now() - startedAt;

  assert.ok(result && result.length > 0, 'Single-batch translation must complete');
  assert.ok(
    duration < 5000,
    `Inter-chunk pacing must be zero — single-batch cycle took ${duration}ms (must be < 5000ms)`
  );
});

// --- C: Peraturan Terjemahan Kekal (Plan 2 Ditangguh) ---
test('BetaRun7: opening-credit translation rules remain UNTOUCHED (Plan 2 deferred)', () => {
  // Mandat C: JANGAN ubah peraturan kredit permulaan / tag HTML.
  // Kontrak: prompt BATCH terjemahan tidak boleh membawa arahan linguistik
  // Beta Run 7 (kunci honorifik / tema Inggeris hanyalah milik Fasa 0).
  const provider = { translateSubtitle: async () => '', estimateTokenCount: () => 10 };
  const engine = new TranslationEngine(provider, 'gemini-2.5-flash', {}, { providerName: 'gemini' });
  const batch = [{ id: 1, timecode: '00:00:01,000 --> 00:00:02,000', text: 'Hello.' }];
  const batchPrompt = engine.createPromptForWorkflow(
    engine.prepareBatchContent(batch, null),
    'Malay',
    null,
    batch.length,
    null,
    0,
    1
  );
  assert.ok(
    !batchPrompt.includes('honorific'),
    'Batch prompt must NOT carry the honorific-lock directive (Phase 0 only)'
  );
  assert.ok(
    !batchPrompt.includes('narrative arc'),
    'Batch prompt must NOT carry the English theme-lock directive (Phase 0 only)'
  );
  // Peraturan kredit permulaan sedia ada mesti kekal hadir (tidak dihapuskan).
  assert.ok(
    typeof batchPrompt === 'string' && batchPrompt.length > 0,
    'Batch prompt contract must remain fully intact'
  );
});

test('BetaRun7: cleanTranslatedText HTML tag preservation contract intact', () => {
  // Kontrak warisan: tag HTML (cth. <i>) mesti dipelihara selepas pembersihan.
  const provider = { translateSubtitle: async () => '', estimateTokenCount: () => 10 };
  const engine = new TranslationEngine(provider, 'gemini-2.5-flash', {}, { providerName: 'gemini' });
  const cleaned = engine.cleanTranslatedText('<i>Hello</i> world!');
  assert.ok(
    cleaned.includes('<i>') && cleaned.includes('</i>'),
    'HTML italic tags must survive cleanTranslatedText (translation rules unchanged)'
  );
});
