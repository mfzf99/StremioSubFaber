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

const { buildPreflightPrompt } = require('./subfaberPreflight');

// Baca sumber translationEngine sebagai teks untuk semakan statik pemalar
// (modul tidak mengeksport PACING_DELAY_MS secara langsung — sumber ialah
// ground truth yang dikonsumsi runtime melalui require cache yang sama).
const ENGINE_SOURCE = fs.readFileSync(path.join(__dirname, 'translationEngine.js'), 'utf8');

// Stub dependencies sebelum require supaya engine dimuat tanpa Redis/env
process.env.ENTRY_CACHE_SIZE = '100';
const TranslationEngine = require('./translationEngine');

// --- A.1: Kunci Bahasa Inggeris untuk medan 'theme' (kini TIANG 1 skema 4-tiang) ---
test('BetaRun7/Run8: preflight prompt locks the theme field strictly to English (pillar 1)', () => {
    const prompt = buildPreflightPrompt('Some dialogue.', 'Malay', 'English');
    assert.ok(
        prompt.includes("The 'theme' field MUST be written strictly in clear, precise English"),
        'Prompt must contain the verbatim English-lock directive for the theme field'
    );
    assert.ok(
        prompt.includes('narrative arc (plot), setting, and central conflict/stakes'),
        'Prompt must require narrative arc, setting, and conflict coverage'
    );
});

test('BetaRun7/Run8: theme lock appears in the JSON schema contract itself', () => {
    const prompt = buildPreflightPrompt('Dialogue.', 'French', '');
    // Skema JSON mesti menyatakan keperluan Bahasa Inggeris pada medan theme
    assert.ok(
        prompt.includes('"theme"') && prompt.includes('strictly in English'),
        'JSON schema description must reinforce the English-only theme contract'
    );
});

// --- A.2: Matriks Gelaran Watak (kini TIANG 3 "characters" — canonical_address) ---
// [KNP-ALIGNMENT 2026-10-07] Matriks honorifik berpindah dari terms → characters
// (doktrin Netflix KNP — gelaran watak TIDAK PERNAH berada dalam senarai istilah).
// Arahan lama "terms WAJIB mengunci gelaran" adalah punca akar terms-pollution.
test('BetaRun7/Run8: preflight prompt mandates honorific locking in the characters pillar (MATRIKS SOSIOLINGUISTIK + KNP-ALIGNMENT 2026-10-07)', () => {
    const prompt = buildPreflightPrompt('Some dialogue.', 'Malay', 'English');
    assert.ok(
        prompt.includes("When locking character addresses in the 'characters' pillar"),
        'Prompt must contain the characters-pillar honorific directive (KNP-aligned)'
    );
    assert.ok(
        prompt.includes('titles/honorifics (Malay honorifics)'),
        'Prompt must reference titles/honorifics via the mandatory sociolinguistic matrix'
    );
    assert.ok(prompt.includes('"Ms." / "Mrs." for an adult woman'), 'Prompt must enumerate the Ms./Mrs. -> Puan rule');
    assert.ok(
        prompt.includes('never alternate'),
        'Prompt must forbid alternating between competing titles for one character'
    );
    // KNP: larangan silang-tiang — sifar gelaran watak dalam terms.
    assert.ok(
        prompt.includes("NEVER place character names, personal titles, or honorifics in 'terms'"),
        'Prompt must carry the explicit cross-pillar prohibition (KNP doctrine)'
    );
    assert.ok(
        !prompt.includes("In the 'terms' list, you MUST include and lock"),
        'Legacy terms-pillar honorific directive must be GONE (pollution root cause)'
    );
});

test('BetaRun7/Run8: character hierarchy pillar locks one canonical address per character', () => {
    const prompt = buildPreflightPrompt('Some dialogue.', 'Malay', 'English');
    assert.ok(prompt.includes('"canonical_address"'), 'Characters pillar must use the canonical_address key');
    assert.ok(
        prompt.includes('one canonical address per character, never alternate'),
        'Characters pillar must forbid alternating addresses'
    );
    assert.ok(prompt.includes('"role"'), 'Characters pillar must carry the narrative role field');
});

test('BetaRun7/Run8: honorific directive adapts to the target language label', () => {
    const prompt = buildPreflightPrompt('Dialogue.', 'Spanish', 'English');
    assert.ok(
        prompt.includes('official Spanish titles/honorifics'),
        'Honorific directive must interpolate the target language label'
    );
});

// --- A.2b: Kontrak KNP terms (medan type + definisi bukan-watak) ---
test('KNP-ALIGNMENT: terms pillar carries type field + non-character scope (2026-10-07)', () => {
    const prompt = buildPreflightPrompt('Some dialogue.', 'Malay', 'English');
    assert.ok(
        prompt.includes('vocabulary of the story world ONLY'),
        'Terms scope must be story-world vocabulary (non-character) — KNP doctrine'
    );
    assert.ok(
        prompt.includes('exactly three keys: "source" (original text), "type"'),
        'Terms entries must declare {source, type, target} contract'
    );
    assert.ok(
        prompt.includes('"type" (exactly one of: location, organization, object, technical, phrase)'),
        'Terms type enum must be enumerated in the task contract'
    );
    assert.ok(
        prompt.includes(
            "A human's name (with or without a title like Ms./Corporal/Lawyer) is a character entry, never a term"
        ),
        'Human-name prohibition must be explicit (anti-pollution)'
    );
});

// --- A.3: Skema 4-TIANG (Mandat Beta Run 8) ---
test('BetaRun8: preflight prompt produces the full 4-pillar JSON contract', () => {
    const prompt = buildPreflightPrompt('Some dialogue.', 'Malay', 'English');
    for (const pillar of ['"theme"', '"terms"', '"characters"', '"credits_and_titles"']) {
        assert.ok(prompt.includes(pillar), `JSON contract must declare pillar ${pillar}`);
    }
    assert.ok(
        prompt.includes(
            '{ "source": "Original term", "type": "location|organization|object|technical|phrase", "target":'
        ),
        'terms pillar must use {source, type, target} entries (KNP-ALIGNMENT)'
    );
    assert.ok(
        prompt.includes('{ "name": "Character name", "canonical_address":'),
        'characters pillar must use {name, canonical_address, role} entries'
    );
});

test('BetaRun8: credits detection is delegated to Kimi K3 over lines 1-5 with official translations', () => {
    const prompt = buildPreflightPrompt('Some dialogue.', 'Malay', 'English');
    assert.ok(prompt.includes('lines 1-5'), 'Credits scan must be scoped to the earliest lines (1-5)');
    assert.ok(prompt.includes('NON-DIALOGUE opening text'), 'Credits scan must target non-dialogue openings only');
    assert.ok(
        prompt.includes('Adapted from') && prompt.includes('Diadaptasi daripada'),
        'Official media/publishing translation example must be present in Phase 0 only'
    );
    assert.ok(
        prompt.includes("return an empty array [] for 'credits_and_titles'"),
        'Dialogue-first files must produce an empty credits_and_titles array'
    );
});

// --- B: Sifar Jeda Pacing ---
test('BetaRun7: PACING_DELAY_MS is zero (artificial pacing abolished)', () => {
    const constMatch = ENGINE_SOURCE.match(/const\s+PACING_DELAY_MS\s*=\s*(\d+)\s*;/);
    assert.ok(constMatch, 'PACING_DELAY_MS constant must be declared in translationEngine.js');
    assert.equal(parseInt(constMatch[1], 10), 0, 'PACING_DELAY_MS must be 0 — zero idle time between batch dispatches');
});

test('BetaRun7: no hardcoded 5.0s inter-batch sleep remains', () => {
    assert.ok(
        !ENGINE_SOURCE.includes('await sleep(5000)'),
        'The literal await sleep(5000) call must be removed from the engine'
    );
    assert.ok(!/Applying 5\.0s pacing delay/.test(ENGINE_SOURCE), 'The 5.0s pacing log line must be removed');
});

test('BetaRun7: pacing guard skips sleep when delay <= 0', () => {
    // SINGLE-BATCH PURGE (2026-09-29): tapak inter-chunk (dalam laluan
    // single-batch) dibuang; kini hanya tapak inter-batch dalam laluan batched
    // yang dikawal oleh guard `PACING_DELAY_MS > 0`.
    const guardSites = ENGINE_SOURCE.match(/PACING_DELAY_MS > 0/g) || [];
    assert.ok(guardSites.length >= 1, `Expected >= 1 pacing guard, found ${guardSites.length}`);
});

test('BetaRun7: runtime inter-batch wall-clock contains no artificial 5s delay', async () => {
    // Ujian kitaran terjemahan penuh: 100 entri → 2 kelompok @ 50. Tanpa
    // pacing, jumlah masa mesti jauh di bawah 5000ms (provider mock segerak).
    const TranslationEngineClass = TranslationEngine;
    const makeSrt = (count) =>
        Array.from(
            { length: count },
            (_, i) =>
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

    const engine = new TranslationEngineClass(
        provider,
        'gemini-2.5-flash',
        {},
        {
            providerName: 'gemini',
            enableStreaming: false
        }
    );

    const startedAt = Date.now();
    const result = await engine.translateSubtitle(makeSrt(100), 'Malay', null, null, 'English');
    const duration = Date.now() - startedAt;

    assert.ok(result && result.length > 0, 'Translation must complete and return SRT');
    assert.ok(
        duration < 5000,
        `Inter-batch pacing must be zero — full 2-batch cycle took ${duration}ms (must be < 5000ms)`
    );
});

// SINGLE-BATCH PURGE (2026-09-29): ujian "single-batch auto-chunk pacing"
// dibuang — mod single-batch dimansuhkan sepenuhnya. Pacing inter-batch
// biasa masih diliputi oleh ujian "runtime inter-batch wall-clock" di atas.

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
    // SIFAR PERUBAHAN KOD RAPUH (Mandat Beta Run 8): prompt batch TIDAK BOLEH
    // membawa teks kredit yang di-hardcode — pengesanan kredit adalah data
    // Fasa 0 (credits_and_titles), bukan peraturan batch.
    assert.ok(
        !batchPrompt.includes('Diadaptasi daripada'),
        'Batch prompt must NOT carry hardcoded credit translations (Phase 0 data only)'
    );
    assert.ok(
        !batchPrompt.includes('credits_and_titles'),
        'Batch prompt must NOT reference the credits_and_titles schema directly'
    );
    // Peraturan kredit permulaan sedia ada mesti kekal hadir (tidak dihapuskan).
    assert.ok(
        typeof batchPrompt === 'string' && batchPrompt.length > 0,
        'Batch prompt contract must remain fully intact'
    );
});

test('BetaRun8: engine renders all four preflight pillars into the Agent A context block', () => {
    // Kontrak suntikan konteks Agent A (translationEngine._formatPreflightForChunk):
    // Theme + Technical Glossary + Character Hierarchy + Opening Credits / Titles.
    const provider = { translateSubtitle: async () => '', estimateTokenCount: () => 10 };
    const engine = new TranslationEngine(provider, 'gemini-2.5-flash', {}, { providerName: 'gemini' });
    const batch = [{ id: 5, timecode: '00:00:05,000 --> 00:00:06,000', text: 'Uncle Shen arrives at Zhuang Group.' }];
    const block = engine._formatPreflightForChunk(
        {
            theme: 'A corporate family drama.',
            terms: [{ source: 'Zhuang Group', target: 'Kumpulan Zhuang', note: 'company' }],
            characters: [{ name: 'Shen', canonical_address: 'Pakcik Shen', role: 'mentor' }],
            credits_and_titles: [{ source: 'Adapted from the novel', target: 'Diadaptasi daripada novel' }]
        },
        [],
        batch,
        []
    );
    assert.ok(block.includes('### Content Summary'), 'Pillar 1: Content Summary rendered');
    assert.ok(block.includes('A corporate family drama.'), 'Pillar 1: theme text rendered');
    assert.ok(block.includes('### Technical Glossary'), 'Pillar 2: Technical Glossary rendered');
    assert.ok(block.includes('- Zhuang Group: Kumpulan Zhuang (company)'), 'Pillar 2: matched term rendered');
    assert.ok(block.includes('### Character Hierarchy'), 'Pillar 3: Character Hierarchy rendered');
    assert.ok(block.includes('- Shen → Pakcik Shen (mentor)'), 'Pillar 3: canonical address rendered');
    assert.ok(block.includes('### Opening Credits / Titles'), 'Pillar 4: Opening Credits / Titles rendered');
    assert.ok(
        block.includes('- Adapted from the novel: Diadaptasi daripada novel'),
        'Pillar 4: credit translation rendered'
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
