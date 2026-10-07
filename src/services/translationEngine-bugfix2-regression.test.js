/**
 * Regression Tests — Bug Fix Deep Scan #2 (2026-10-07)
 *
 * BUG #1 (Fix #7 auto-chunk): context separuh kedua dibina manual dan
 * menjatuhkan subsequentContent + preflight daripada context asal →
 * separuh kedua diterjemah tanpa window ke hadapan dan tanpa bible
 * Fasa 0. Patch: bawa semula kedua-dua medan daripada `context` param.
 *
 * BUG #2 (Agent B crime retry): `prompt + warningBlock` menolak anchor
 * '<s id="N">' dari kedudukan token terakhir → melanggar kontrak Smart
 * Preamble Scrubber + prefill Gemini. Patch: amaran disisip SEBELUM
 * blok <answer>; anchor kekal menghujungi prompt.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ENTRY_CACHE_SIZE = '100';

const TranslationEngine = require('./translationEngine');
const { splitStructuredPrompt } = require('./utils/structuredPrompt');

function makeEngine(overrides = {}) {
    const dummyProvider = {
        translateSubtitle: async () => '',
        streamTranslateSubtitle: async () => '',
        estimateTokenCount: () => 10,
        ...(overrides.provider || {})
    };
    const engine = new TranslationEngine(
        dummyProvider,
        'gemini-2.5-flash',
        {},
        {
            providerName: 'gemini',
            ...(overrides.options || {})
        }
    );
    engine.sourceLanguage = 'English';
    return engine;
}

function makeEntries(count, startId = 1) {
    return Array.from({ length: count }, (_, i) => ({
        id: startId + i,
        timecode: `00:00:${String(i % 60).padStart(2, '0')},000 --> 00:00:${String((i + 1) % 60).padStart(2, '0')},000`,
        text: `Entry ${startId + i} dialogue text`
    }));
}

/** Respons sah 1:1 untuk setiap entri dalam <input> — struktur bersih supaya gerbang Agent B aktif. */
function validResponseFor(content) {
    const ids = [...String(content).matchAll(/<s id="(\d+)">/g)].map((m) => m[1]);
    return ids.map((id) => `<s id="${id}">Terjemahan ${id}</s>`).join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// BUG #1 — Auto-chunk: second-half context mesti mewarisi subsequent +
// preflight daripada context asal (skop fail), bukan dibina separuh makan.
// ─────────────────────────────────────────────────────────────────────────────
test('Bug#1 auto-chunk: second-half prompt carries subsequent + preflight + previous', async () => {
    const captured = [];
    // Trigger auto-chunk deterministik: token = 100 × bilangan entri dalam
    // batchText. Siling 550 → 6 entri (600) dipecah 3+3; 3 entri (300) berhenti.
    const engine = makeEngine({
        provider: {
            countTokensForTranslation: async (content) => (String(content).match(/<s id="/g) || []).length * 100,
            // Tawan PROMPT (arg 4) — blok konteks SubFaber hidup di sana,
            // bukan dalam batchText (arg 1).
            translateSubtitle: async (content, _src, _tgt, prompt) => {
                captured.push(String(prompt));
                return validResponseFor(content);
            }
        }
    });
    engine.preflightContext = {
        theme: 'A heist movie in Blackwood.',
        terms: [{ source: 'Blackwood', target: 'Hutan Hitam', note: 'Mansion' }],
        characters: [],
        credits_and_titles: []
    };
    engine.maxTokensPerBatch = 550;
    // File 10 entri (IDs 51..60); batch aktif = 6 pertama (51..56).
    // Context dibina cara produksi (translateSubtitleBatched loop):
    // prev=[] (batch pertama fail), subsequent=IDs 57,58, preflight=bible.
    const all = makeEntries(10, 51);
    const batch = all.slice(0, 6);
    const ctx = engine.prepareContextForBatch(batch, all, [], 0);

    await engine.translateBatch(batch, 'Malay', null, 0, 1, ctx, {
        streaming: false,
        allowAutoChunking: true
    });

    assert.equal(captured.length, 2, `auto-chunk mesti split 3+3 (dapat ${captured.length} panggilan)`);
    const secondPrompt = captured[1];

    // Anchor second-half = ID aktif pertama second-half (54)
    assert.ok(secondPrompt.trimEnd().endsWith('<s id="54">'), 'anchor <s id="54"> token terakhir');

    // ── ASSERTION BUG #1 (sebelum patch: MERAH) ──
    assert.ok(
        secondPrompt.includes('<subsequent_content>'),
        'Bug#1: <subsequent_content> mewarisi context asal — window ke hadapan second-half'
    );
    assert.ok(
        secondPrompt.includes('<s id="57">'),
        'Bug#1: baris subsequent ID 57 (selepas batch dalam skop fail) hadir'
    );
    assert.ok(
        secondPrompt.includes('### Content Summary'),
        'Bug#1: blok preflight (Content Summary) hadir dalam second-half'
    );
    assert.ok(secondPrompt.includes('A heist movie in Blackwood.'), 'Bug#1: theme bible disuntik ke second-half');
    // previousContent + memory kekal (4+50+2, window 4 dari first-half)
    assert.ok(secondPrompt.includes('<previous_content>'), '<previous_content> kekal hadir');
    assert.ok(secondPrompt.includes('<s id="53">'), 'previous window termasuk ID 53 (akhir first-half)');
    assert.ok(secondPrompt.includes('[PREVIOUS VERIFIED TRANSLATIONS'), 'previousMemory (terjemahan first-half) hadir');
});

test('Bug#1 auto-chunk: split 4+4 — previous window penuh, subsequent dari skop fail', async () => {
    const captured = [];
    const engine = makeEngine({
        provider: {
            countTokensForTranslation: async (content) => (String(content).match(/<s id="/g) || []).length * 100,
            translateSubtitle: async (content, _src, _tgt, prompt) => {
                captured.push(String(prompt));
                return validResponseFor(content);
            }
        }
    });
    engine.preflightContext = null;
    engine.maxTokensPerBatch = 550;
    // File 12 entri (IDs 21..32); batch aktif = 8 pertama (21..28) → split 4+4.
    const all = makeEntries(12, 21);
    const batch = all.slice(0, 8);
    const ctx = engine.prepareContextForBatch(batch, all, [], 0);

    await engine.translateBatch(batch, 'Malay', null, 0, 1, ctx, {
        streaming: false,
        allowAutoChunking: true
    });

    assert.equal(captured.length, 2, 'split 4+4');
    const secondPrompt = captured[1];

    // Second-half = IDs 25..28; previous = 4 baris terakhir first-half (21..24)
    assert.ok(secondPrompt.trimEnd().endsWith('<s id="25">'), 'anchor <s id="25"> token terakhir');
    assert.ok(secondPrompt.includes('<previous_content>'), 'previous_content hadir');
    assert.ok(secondPrompt.includes('<s id="21">'), 'window prev bermula ID 21 (4 baris penuh)');
    assert.ok(secondPrompt.includes('<s id="24">'), 'window prev berakhir ID 24');
    assert.ok(!secondPrompt.includes('<s id="20">'), 'tiada baris luar window prev');
    // Subsequent mewarisi skop fail: IDs 29,30
    assert.ok(secondPrompt.includes('<subsequent_content>'), 'Bug#1: subsequent hadir');
    assert.ok(secondPrompt.includes('<s id="29">'), 'subsequent ID 29 hadir');
    assert.ok(!secondPrompt.includes('<s id="31">'), 'subsequent clamp pada 2 baris (29,30 sahaja)');
});

// ─────────────────────────────────────────────────────────────────────────────
// BUG #2 — Agent B crime retry: anchor mesti kekal token terakhir prompt
// ─────────────────────────────────────────────────────────────────────────────
test('Bug#2 crime retry: warning injected BEFORE <answer>, anchor stays last token', async () => {
    const prompts = [];
    const engine = makeEngine({
        provider: {
            translateSubtitle: async (content, _src, _tgt, prompt) => {
                prompts.push(String(prompt));
                return validResponseFor(content);
            }
        },
        options: {
            agentB: {
                circuitOpen: false,
                runSemanticInspection: async () => ({
                    valid: false,
                    failOpen: false,
                    crimes: [{ type: 'MERGE', ids: [1, 2], note: 'merged slots' }]
                })
            }
        }
    });

    const batch = makeEntries(3, 11); // IDs 11..13
    await engine.translateBatch(batch, 'Malay', null, 0, 1, null, { streaming: false });

    assert.equal(prompts.length, 2, `panggilan asal + 1 retry crime (dapat ${prompts.length})`);
    const retryPrompt = prompts[1];

    // Amaran jenayah hadir
    assert.ok(retryPrompt.includes('CRITICAL SEMANTIC ALERT'), 'warning crime hadir dalam retry');
    // ── ASSERTION BUG #2 (sebelum patch: MERAH) ──
    assert.ok(
        retryPrompt.trimEnd().endsWith('<s id="11">'),
        'Bug#2: anchor <s id="11"> mesti kekal token terakhir prompt retry'
    );
    // Susunan: ALERT → <answer> → anchor
    const alertIdx = retryPrompt.indexOf('CRITICAL SEMANTIC ALERT');
    const answerIdx = retryPrompt.lastIndexOf('\n\n<answer>');
    const anchorIdx = retryPrompt.lastIndexOf('<s id="11">');
    assert.ok(answerIdx !== -1, 'blok <answer> hadir');
    assert.ok(
        alertIdx !== -1 && alertIdx < answerIdx && answerIdx < anchorIdx,
        'Susunan mesti: ALERT → <answer> → anchor (amaran SEBELUM <answer>)'
    );
    // Anchor tidak berganda SELEPAS blok <answer> (ID sama memang wujud
    // dalam <input> — itu bukan duplikasi anchor).
    const afterAnswer = retryPrompt.slice(answerIdx);
    const anchorCountAfterAnswer = (afterAnswer.match(/<s id="11">/g) || []).length;
    assert.equal(anchorCountAfterAnswer, 1, 'anchor tepat SATU selepas <answer> (tiada duplikasi oleh retry)');
});

test('Bug#2 crime retry: split system/user kekal — warning hidup dalam USER part', async () => {
    const prompts = [];
    const engine = makeEngine({
        provider: {
            translateSubtitle: async (content, _src, _tgt, prompt) => {
                prompts.push(String(prompt));
                return validResponseFor(content);
            }
        },
        options: {
            agentB: {
                circuitOpen: false,
                runSemanticInspection: async () => ({
                    valid: false,
                    failOpen: false,
                    crimes: [{ type: 'DROP', ids: [3], note: 'meaning dropped' }]
                })
            }
        }
    });

    await engine.translateBatch(makeEntries(2, 1), 'Malay', null, 0, 1, null, { streaming: false });
    assert.equal(prompts.length, 2, 'asal + retry');
    const { system, user } = splitStructuredPrompt(prompts[1]);

    assert.ok(user.includes('CRITICAL SEMANTIC ALERT'), 'warning dalam USER part');
    assert.ok(!system.includes('CRITICAL SEMANTIC ALERT'), 'warning TIDAK bocor ke SYSTEM part');
    assert.ok(user.trimEnd().endsWith('<s id="1">'), 'USER part berakhir dengan anchor');
});
