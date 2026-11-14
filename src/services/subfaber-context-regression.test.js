/**
 * SubFaber Sliding Context Buffer + Prompt Composer — Regression Tests
 * (TOTAL PURGE Mandat 2026-09-25 — SubFaber enjin TUNGGAL)
 *
 * SHARED PROMPT ARCHITECTURE (Mandat 2026-09-26, Lingo 1:1 parity):
 *   1. _prepareSubfaberContext: sliding window dua hala (previous + subsequent)
 *   2. prepareContextForBatch: pembina konteks TUNGGAL (tiada laluan legacy)
 *   3. prepareBatchXml: entri aktif <s id> SAHAJA — tiada konteks, tiada
 *      penanda '=== ENTRIES TO TRANSLATE ===' (dibuang)
 *   4. _formatSharedContext: blok konteks verbatim mandat (<previous_content>,
 *      <subsequent_content>, Content Summary, Points to Note, previousMemory)
 *   5. createXmlBatchPrompt: {shared_prompt} VideoLingo di antara ## Task dan
 *      <translation_principles>; <input> suci (entri aktif sahaja); persona
 *      hybrid V1.9.2 + guardrail split-sentence
 *   6. Flag subfaberEnabled DIBUANG — prompt SubFaber tulen tanpa sebarang flag
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// Stub dependencies sebelum require supaya engine dimuat tanpa Redis/env
process.env.ENTRY_CACHE_SIZE = '100';

const TranslationEngine = require('./translationEngine');

function makeEngine(advancedSettings = {}, options = {}) {
    // Provider dummy — tiada panggilan sebenar diperlukan untuk test context
    const dummyProvider = {
        translateSubtitle: async () => '',
        streamTranslateSubtitle: async () => '',
        estimateTokenCount: () => 10
    };
    return new TranslationEngine(dummyProvider, 'gemini-2.5-flash', advancedSettings, {
        providerName: 'gemini',
        ...options
    });
}

function makeEntries(count, startId = 1) {
    return Array.from({ length: count }, (_, i) => ({
        id: startId + i,
        timecode: `00:00:${String(i % 60).padStart(2, '0')},000 --> 00:00:${String((i + 1) % 60).padStart(2, '0')},000`,
        text: `Entry ${startId + i} dialogue text`
    }));
}

// --- Enjin tunggal: flag dibuang (TOTAL PURGE 2026-09-25) ---
test('SubFaberContext: subfaberEnabled flag REMOVED — SubFaber is the only engine', () => {
    const engine = makeEngine({});
    assert.equal(engine.subfaberEnabled, undefined, 'Flag must NOT exist on engine (total purge)');
    assert.equal(engine.enableBatchContext, undefined, 'Legacy batch context flag must NOT exist');
    assert.equal(engine.contextSize, undefined, 'Legacy contextSize must NOT exist');
    assert.equal(engine.preflightContext, null, 'Preflight slot must start null');
    // Config lama yang masih membawa field legacy mesti diabaikan sepenuhnya
    const engineLegacy = makeEngine({ subfaberEnabled: false, enableBatchContext: true, contextSize: 20 });
    assert.equal(
        engineLegacy.subfaberEnabled,
        undefined,
        'Legacy subfaberEnabled:false ignored — engine stays SubFaber'
    );
    assert.equal(engineLegacy.batchSize, 200, 'Batch size stays 200 regardless of legacy flags');
});

test('SubFaberContext: context builder runs WITHOUT any flag (single engine path)', () => {
    const engine = makeEngine({});
    const all = makeEntries(40);
    const batch = all.slice(20, 30); // batch tengah — ada baris sebelum & selepas
    const ctx = engine.prepareContextForBatch(batch, all, [], 1);
    assert.ok(ctx, 'Sliding context built without subfaberEnabled flag');
    assert.equal(ctx.previousContent.length, 20, 'Prev window = 20 (always, 20+200+10)');
    assert.equal(ctx.subsequentContent.length, 10, 'Next window = 10 (always, 20+200+10)');
});

// --- _prepareSubfaberContext: ASYMMETRIC sliding window (20+200+10 — owner's special tweak) ---
test('SubFaberContext: middle batch gets asymmetric context — prev=20 lines, next=10 lines', () => {
    const engine = makeEngine({ subfaberEnabled: true, contextSize: 5 }); // contextSize diabaikan dalam mod SubFaber
    const all = makeEntries(40); // IDs 1..40
    const batch = all.slice(20, 30); // batch tengah (IDs 21..30)

    const ctx = engine.prepareContextForBatch(batch, all, [], 1);
    assert.ok(ctx, 'Context must be built for SubFaber');
    assert.ok(Array.isArray(ctx.previousContent), 'previousContent array');
    assert.ok(Array.isArray(ctx.subsequentContent), 'subsequentContent array');
    // FORMULA 20+200+10: prev = 20 baris terakhir, next = 10 baris pertama
    assert.equal(ctx.previousContent.length, 20, 'Prev window = 20 entries (20+200+10 owner tweak)');
    assert.equal(ctx.subsequentContent.length, 10, 'Next window = 10 entries (20+200+10 owner tweak)');
    // Verifikasi kandungan: previous = IDs 1..20, subsequent = IDs 31..40
    assert.equal(ctx.previousContent[0].id, 1);
    assert.equal(ctx.previousContent[19].id, 20);
    assert.equal(ctx.subsequentContent[0].id, 31);
    assert.equal(ctx.subsequentContent[9].id, 40);
    assert.equal(ctx.preflight, null, 'No preflight context set');
});

test('SubFaberContext: first batch gets subsequent but no previous (batch 1突破)', () => {
    const engine = makeEngine({ subfaberEnabled: true, contextSize: 20 });
    const all = makeEntries(20);
    const batch = all.slice(0, 10); // batch pertama

    const ctx = engine.prepareContextForBatch(batch, all, [], 0);
    assert.ok(ctx, 'SubFaber context must exist even for batch 0');
    assert.equal(ctx.previousContent.length, 0, 'No previous for first batch');
    assert.ok(ctx.subsequentContent.length > 0, 'First batch gets forward context');
    assert.equal(ctx.subsequentContent.length, 10, 'First batch next window = 10 (asymmetric)');
    assert.equal(ctx.subsequentContent[0].id, 11);
    assert.equal(ctx.subsequentContent[9].id, 20);
});

test('SubFaberContext: last batch gets previous but no subsequent', () => {
    const engine = makeEngine({ subfaberEnabled: true, contextSize: 20 });
    const all = makeEntries(30);
    const batch = all.slice(20, 30); // batch terakhir (IDs 21..30)

    const ctx = engine.prepareContextForBatch(batch, all, [], 1);
    assert.ok(ctx);
    assert.equal(ctx.previousContent.length, 20, 'Last batch prev window = 20 (20+200+10)');
    assert.equal(ctx.previousContent[19].id, 20, 'Previous ends at ID 20');
    assert.equal(ctx.subsequentContent.length, 0, 'No subsequent at file end');
});

test('SubFaberContext: window clamps at file boundaries', () => {
    const engine = makeEngine({ subfaberEnabled: true, contextSize: 100 });
    const all = makeEntries(10);
    const batch = all.slice(4, 6); // IDs 5..6

    const ctx = engine.prepareContextForBatch(batch, all, [], 0);
    assert.equal(ctx.previousContent.length, 4, 'Clamped prev: only 4 entries available');
    assert.equal(ctx.subsequentContent.length, 4, 'Clamped next: only 4 entries available');
});

// --- OWNER MANDATE 2026-11-09: batch size SubFaber = 200 (hardcoded,
// tiada env override), dengan previous=20 dan future=10 ---
test('SubFaberContext: batch size = 200 ALWAYS (SUBFABER_BATCH_SIZE hardcoded)', () => {
    const engine = makeEngine({});
    assert.equal(engine.batchSize, 200, 'SubFaber batch size = 200 (Owner Mandate 2026-11-09, enjin tunggal)');
    // Env TRANSLATION_BATCH_SIZE tidak lagi berkesan — nilai diabaikan
    const engineEnv = makeEngine({ TRANSLATION_BATCH_SIZE: 75 });
    assert.equal(engineEnv.batchSize, 200, 'Env override REMOVED — always 200');
});

test('SubFaberContext: createBatches uses 200 active entries without changing slot order', () => {
    const engine = makeEngine({});
    const entries = makeEntries(450);
    const batches = engine.createBatches(entries, engine.batchSize);
    assert.deepEqual(
        batches.map((batch) => batch.length),
        [200, 200, 50]
    );
    assert.deepEqual(batches.flat(), entries, 'Batching preserves every entry in its original order');
});

test('SubFaberContext: parallel mode shares the 20+200+10 formula', async () => {
    const { executeParallelTranslation } = require('../utils/parallelTranslation');
    const engine = makeEngine({ parallelBatchesCount: 1 });
    const entries = makeEntries(450);
    const calls = [];
    engine.enableStreaming = false;
    engine.translateBatch = async (batch, targetLanguage, customPrompt, batchIndex, totalBatches, context) => {
        calls.push({
            batchIndex,
            totalBatches,
            length: batch.length,
            previous: context.previousContent.length,
            subsequent: context.subsequentContent.length
        });
        return batch.map((entry) => ({ ...entry, text: `Translated ${entry.id}` }));
    };

    const result = await executeParallelTranslation(engine, entries, 'Malay', null, null);
    calls.sort((a, b) => a.batchIndex - b.batchIndex);
    assert.deepEqual(
        calls.map(({ batchIndex, totalBatches, length, previous, subsequent }) => ({
            batchIndex,
            totalBatches,
            length,
            previous,
            subsequent
        })),
        [
            { batchIndex: 0, totalBatches: 3, length: 200, previous: 0, subsequent: 10 },
            { batchIndex: 1, totalBatches: 3, length: 200, previous: 20, subsequent: 10 },
            { batchIndex: 2, totalBatches: 3, length: 50, previous: 20, subsequent: 0 }
        ]
    );
    assert.equal(result.length, entries.length, 'Parallel path preserves total slot count');
    assert.deepEqual(
        result.map((entry) => entry.id),
        entries.map((entry) => entry.id),
        'Parallel path preserves ordered IDs'
    );
});

test('SubFaberContext: previousMemory includes verified translations, excludes placeholders', () => {
    const engine = makeEngine({ subfaberEnabled: true, contextSize: 3 });
    const all = makeEntries(50);
    const batch = all.slice(20, 30);
    // translatedSoFar: entries 1..20 = previous window (20+200+10); entry 20 = [⚠️] placeholder (must be excluded)
    const translatedSoFar = all.slice(0, 20).map((e) => ({
        id: e.id,
        timecode: e.timecode,
        text: e.id === 20 ? '[⚠️] untranslated' : `Terjemahan ${e.id}`
    }));

    const ctx = engine.prepareContextForBatch(batch, all, translatedSoFar, 1);
    assert.ok(Array.isArray(ctx.previousMemory));
    const memoryIds = ctx.previousMemory.map((m) => m.id);
    assert.equal(memoryIds.length, 19);
    assert.ok(memoryIds.includes(1), 'Verified translation included (window start, 20+200+10)');
    assert.ok(memoryIds.includes(19), 'Verified translation included');
    assert.ok(!memoryIds.includes(20), '[⚠️] placeholder excluded');
    assert.ok(!memoryIds.includes(21), 'Outside 20-line prev window excluded (20+200+10)');
});

test('SubFaberContext: preflight context flows through when set', () => {
    const engine = makeEngine({ subfaberEnabled: true, contextSize: 2 });
    engine.preflightContext = { theme: 'A heist movie.', terms: [{ src: 'Boss', tgt: 'Ketua', note: 'Leader' }] };
    const all = makeEntries(10);
    const ctx = engine.prepareContextForBatch(all.slice(5, 10), all, [], 0);
    assert.equal(ctx.preflight.theme, 'A heist movie.');
    assert.equal(ctx.preflight.terms.length, 1);
});

// --- prepareBatchXml: entri aktif sahaja (Shared Prompt Architecture 2026-09-26) ---
test('SubFaberXml: batchText is active entries ONLY — no context, no ENTRIES marker', () => {
    const engine = makeEngine({ subfaberEnabled: true });
    const batch = makeEntries(3, 11); // IDs 11..13
    const context = {
        previousContent: makeEntries(2, 9), // IDs 9..10
        subsequentContent: makeEntries(2, 14), // IDs 14..15
        previousMemory: [{ id: 9, source: 'Hi', translation: 'Hai' }],
        preflight: { theme: 'T.', terms: [] }
    };

    const xml = engine.prepareBatchXml(batch, context);
    assert.ok(!xml.includes('[CONTEXT INFORMATION'), 'No context header in batchText');
    assert.ok(!xml.includes('<previous_content>'), 'No previous_content in batchText');
    assert.ok(!xml.includes('<subsequent_content>'), 'No subsequent_content in batchText');
    assert.ok(!xml.includes('### Content Summary'), 'No preflight summary in batchText');
    assert.ok(!xml.includes('=== ENTRIES TO TRANSLATE ==='), 'Legacy ENTRIES marker REMOVED');
    assert.ok(!xml.includes('<m id='), 'No memory tags in batchText');
    // Hanya entri aktif — konteks parameter diabaikan sepenuhnya
    assert.ok(xml.includes('<s id="11">'), 'Active entry 11 rendered');
    assert.ok(xml.includes('<s id="12">'), 'Active entry 12 rendered');
    assert.ok(xml.includes('<s id="13">'), 'Active entry 13 rendered');
    assert.ok(!xml.includes('<s id="9">'), 'Context entry 9 NOT in batchText');
    assert.ok(!xml.includes('<s id="14">'), 'Context entry 14 NOT in batchText');
});

// --- _formatSharedContext: blok konteks verbatim mandat (slot {shared_prompt}) ---
// [SLIDING-V2 2026-11-14] <previous_content> sumber-sahaja DIBUBARKAN
// (Owner D6): tetingkap previous kini SATU blok <previous_translated>
// pasangan src+dst. <subsequent_content> DINAMAKAN <future_source>.
test('SubFaberSharedContext: renders previous_translated + future_source + verbatim preflight_knp', () => {
    const engine = makeEngine({ subfaberEnabled: true });
    const batch = makeEntries(3, 11); // IDs 11..13
    const batchText = engine.prepareBatchXml(batch);
    const context = {
        previousContent: makeEntries(2, 9), // IDs 9..10
        subsequentContent: makeEntries(2, 14), // IDs 14..15
        previousMemory: [{ id: 9, source: 'Hi', translation: 'Hai' }],
        preflight: {
            theme: 'A story about survival.',
            terms: [{ source: 'Entry 12', target: 'Entri 12', note: 'Term' }],
            characters: [{ name: 'Liam', canonical_address: 'Liam', direct_address: 'Adik', role: 'Rookie' }],
            credits_and_titles: [{ source: 'EPISODE 4', target: 'EPISOD 4' }]
        }
    };

    const block = engine._formatSharedContext(context, batchText);
    assert.ok(block.includes('[CONTEXT INFORMATION - READ ONLY. DO NOT TRANSLATE THIS SECTION]'), 'Read-only header');
    // D6: blok gabungan src+dst menggantikan dua blok berasingan.
    assert.ok(block.includes('<previous_translated'), 'previous_translated opening tag');
    assert.ok(block.includes('</previous_translated>'), 'previous_translated closing tag');
    assert.ok(block.includes('<m id="9"><src>Hi</src><dst>Hai</dst></m>'), 'src+dst pair rendered as <m>');
    assert.ok(!block.includes('<previous_content>'), 'previous_content sumber-sahaja DIBUBARKAN (D6)');
    assert.ok(!block.includes('[PREVIOUS VERIFIED TRANSLATIONS'), 'header memory legasi dibubarkan');
    // Future window: sumber sahaja, nama baharu.
    assert.ok(block.includes('<future_source'), 'future_source opening tag');
    assert.ok(block.includes('</future_source>'), 'future_source closing tag');
    assert.ok(!block.includes('<subsequent_content>'), 'subsequent_content legasi dibubarkan');
    // KNP verbatim (D1): JSON penuh 4 tiang + HIERARCHY OF TRUTH. Tag
    // pembawa membawa atribut note — semak awalan, bukan tag kosong.
    assert.ok(block.includes('<preflight_knp'), 'preflight_knp opening tag');
    assert.ok(block.includes('</preflight_knp>'), 'preflight_knp closing tag');
    assert.ok(block.includes('"theme": "A story about survival."'), 'JSON theme verbatim');
    assert.ok(block.includes('"source": "Entry 12"'), 'JSON terms verbatim');
    assert.ok(block.includes('"canonical_address": "Liam"'), 'JSON characters verbatim');
    assert.ok(block.includes('"credits_and_titles"'), 'JSON credits pillar verbatim');
    assert.ok(block.includes('HIERARCHY OF TRUTH'), 'hierarchy-of-truth guidance hadir');
});

test('SubFaberSharedContext: null/empty context returns empty string', () => {
    const engine = makeEngine({ subfaberEnabled: true });
    assert.equal(engine._formatSharedContext(null, '<s id="1">x</s>'), '', 'null context → empty');
    assert.equal(engine._formatSharedContext({}, '<s id="1">x</s>'), '', 'empty context → empty');
    assert.equal(
        engine._formatSharedContext(
            { previousContent: [], subsequentContent: [], previousMemory: [], preflight: null },
            '<s id="1">x</s>'
        ),
        '',
        'all-empty arrays → empty'
    );
});

test('SubFaberSharedContext: preflight renders the verbatim KNP JSON block (D1)', () => {
    const engine = makeEngine({ subfaberEnabled: true });
    // [KNP-VERBATIM 2026-11-14] Owner D1: suntik JSON penuh terus — bukan
    // lagi term-matching fragmen per-chunk. Semua 4 tiang hadir verbatim.
    const batch = [
        { id: 1, timecode: 't', text: 'Zhuang Xu walked into the room.' },
        { id: 2, timecode: 't', text: 'He looked tired.' }
    ];
    const context = {
        previousContent: [],
        subsequentContent: [],
        previousMemory: [],
        preflight: {
            theme: 'A story about survival.',
            terms: [{ source: 'Zhuang Xu', target: 'Zhuang Xu', note: 'Male colleague' }],
            characters: [],
            credits_and_titles: []
        }
    };

    const batchText = engine.prepareBatchXml(batch);
    const block = engine._formatSharedContext(context, batchText);
    assert.ok(block.includes('<preflight_knp'), 'preflight_knp block present');
    assert.ok(block.includes('A story about survival.'), 'Theme text verbatim in JSON');
    assert.ok(block.includes('"source": "Zhuang Xu"'), 'terms pillar verbatim (even unmatched terms)');
    assert.ok(block.includes('"credits_and_titles"'), 'credits pillar key present');
});

test('SubFaberXml: empty context renders plain active entries (no context anywhere)', () => {
    const engine = makeEngine({ subfaberEnabled: true });
    const batch = makeEntries(2, 1);
    const xml = engine.prepareBatchXml(batch, null);
    assert.ok(!xml.includes('[CONTEXT INFORMATION'), 'No context header when no context');
    assert.ok(!xml.includes('=== ENTRIES TO TRANSLATE ==='), 'No entries marker — legacy REMOVED');
    assert.ok(xml.includes('<s id="1">'), 'Active entries still rendered');
    // Dan prompt tiada blok konteks
    const prompt = engine.createXmlBatchPrompt(xml, 'Malay', null, batch.length, null, 0, 1);
    assert.ok(!prompt.includes('[CONTEXT INFORMATION'), 'No context block in prompt without context');
});

test('SubFaberSharedContext: XML escaping applied to context entries', () => {
    const engine = makeEngine({ subfaberEnabled: true });
    const batch = makeEntries(1, 1);
    // Bina string melalui char codes supaya sumber test tidak mengandungi
    // entity literal (& / <) yang boleh dinormalisasi oleh tooling —
    // pastikan assertion menguji runtime sebenar, bukan artefak penulisan fail.
    const AMP = String.fromCharCode(38); // &
    const LT = String.fromCharCode(60); // <
    const GT = String.fromCharCode(62); // >
    const rawInput = `A ${AMP} B ${LT}tag${GT}`;
    const expectedEscaped = `A ${AMP}amp; B ${AMP}lt;tag${AMP}gt;`;

    const context = {
        previousContent: [{ id: 99, text: rawInput }],
        subsequentContent: [],
        previousMemory: [],
        preflight: null
    };
    const batchText = engine.prepareBatchXml(batch);
    const block = engine._formatSharedContext(context, batchText);
    assert.ok(block.includes(expectedEscaped), 'Special chars escaped in context');
    assert.ok(!block.includes(`>A ${AMP} B ${LT}tag${GT}<`), 'Raw unescaped form must NOT appear inside tags');
});

test('SubFaberSharedContext: previousMemory rendered as <previous_translated> src+dst pairs (D2/D6)', () => {
    // TOTAL PURGE + [SLIDING-V2 2026-11-14]: previousMemory + previousContent
    // digabungkan ke SATU blok <previous_translated> pasangan <m><src/><dst/>.
    // Fixture: window id 5 DIPADANKAN dengan memory id 5 (cara produksi —
    // _prepareSubfaberContext membina memory daripada window yang sama).
    const engine = makeEngine({});
    const batch = makeEntries(2, 1);
    const context = {
        previousContent: makeEntries(1, 5),
        previousMemory: [{ id: 5, source: 'Hello', translation: 'Helo' }]
    };
    const batchText = engine.prepareBatchXml(batch);
    const block = engine._formatSharedContext(context, batchText);
    assert.ok(block.includes('<previous_translated'), 'Merged previous_translated block present');
    assert.ok(block.includes('<m id="5"><src>Hello</src><dst>Helo</dst></m>'), 'src+dst pair rendered as <m>');
    assert.ok(!block.includes('[PREVIOUS VERIFIED TRANSLATIONS'), 'Legacy standalone header REMOVED');
    assert.ok(!block.includes('<previous_content>'), 'Source-only previous block REMOVED (D6)');
    assert.ok(!batchText.includes('<m id='), 'Memory NOT in batchText (clean <input>)');
});

// --- createXmlBatchPrompt: PROMPT V4 "SLIM & SHARP" (Prompt-Slim Mandate 2026-09-30) ---
const { splitStructuredPrompt, SUBFABER_PROMPT_BOUNDARY } = require('./utils/structuredPrompt');

// [P2 F5-B FIX 2026-11-10] Behavioral replacement for the old Pro-only
// source-text assertions. These tests previously passed ONLY because the test
// harness defaulted the engine to `trinityMode: 'pro'`, while the runtime is
// Basic-only. They now construct the engine EXPLICITLY in Pro mode so the
// Pro contract is genuinely exercised, and add a Basic-mode test that asserts
// the ACTIVE Basic contract (universal instruction, no language pack, no
// few-shot, ID manifest present, anchor retained).
test('SubFaberPrompt V5: Pro mode structured template, split system/user, no double-send', () => {
    // [SINGLE-TEMPLATE 2026-11-14] Pro dan Basic berkongsi SATU templat berstruktur
    // 8 seksyen; ujian ini menzip kontrak templat itu pada mod Pro.
    const engine = makeEngine({ subfaberEnabled: true }, { trinityMode: 'pro' });
    engine.sourceLanguage = 'English';
    const batch = makeEntries(2, 1);
    const batchText = engine.prepareBatchXml(batch, null);

    const prompt = engine.createXmlBatchPrompt(batchText, 'Malay', null, batch.length, null, 0, 1);

    // ── Sempadan system/user hadir; split bersih ──
    assert.ok(prompt.includes(SUBFABER_PROMPT_BOUNDARY), 'Boundary marker present between system and user parts');
    const parts = splitStructuredPrompt(prompt);
    assert.ok(parts, 'Prompt must split into { system, user }');
    const { system, user } = parts;

    // ── SYSTEM lane: 5 seksyen statik berlabel ──
    assert.ok(system.includes('[SYSTEM / ROLE]'), 'System/Role section label');
    assert.ok(system.includes('a native speaker would actually say'), 'Role states living-language mandate');
    assert.ok(system.includes('English'), 'Source language in role');
    assert.ok(system.includes('Malay'), 'Target language in role');
    // Technical constraints — parity + markup + SDH (pemetaan 1:1 taksonomi Agent Inspector)
    assert.ok(system.includes('[TECHNICAL CONSTRAINTS & FORMATTING]'), 'Constraints section label');
    assert.ok(system.includes('identical IDs in identical order'), 'ID parity contract');
    assert.ok(
        system.includes('Music symbols (♪♪) are copied as-is; bracketed sound effects ([door slams]) are localized'),
        'Music verbatim vs SFX localized (no contradiction with pack Example 2)'
    );
    assert.ok(
        !system.includes('[door slams]) are copied as-is'),
        'TIDAK mengatakan SFX copied as-is (kontradiksi few-shot)'
    );
    assert.ok(system.includes('exact count of [br]'), '[br] count locked');
    assert.ok(system.includes('place [br] at a natural'), '[br] reposition adaptif');
    // Style — ayat hidup, anti-calque
    assert.ok(system.includes('[STYLE & TONE GUIDELINES]'), 'Style section label');
    assert.ok(system.includes('natural, conversational'), 'Natural conversational directive in style');
    assert.ok(system.includes('Never calque'), 'Anti-calque in style');
    assert.ok(
        system.includes('never inject a title onto a bare name'),
        'Style forbids injecting titles onto bare names (register lock tightened)'
    );
    // Few-shot 3 contoh isometrik dari pack (FEW-SHOT-V2)
    assert.ok(system.includes('[FEW-SHOT EXAMPLES'), 'Few-shot section label');
    assert.ok(system.includes('<example>'), 'Few-shot <example> format (pack V2)');
    assert.ok(system.includes('Biar betul.'), 'Malay pack few-shot example 1 (target=Malay)');
    assert.ok(!system.includes('[EXAMPLE 1 — MERGE:'), 'Legacy crime-labeled examples REMOVED');
    // Output requirement
    assert.ok(system.includes('[OUTPUT REQUIREMENT]'), 'Output requirement label');
    assert.ok(system.includes('one <s id="N"> per input ID'), '1-to-1 contract');
    assert.ok(system.includes('no thinking tags'), 'No-thinking-tags contract');
    assert.ok(
        system.includes('ZERO translator notes in parentheses'),
        'Anti-lazy-parenthetical contract (owner A/B tested hack)'
    );
    // Static lane mesti sifar rujukan preflight (arahan KNP hidup dalam blok user-lane)
    assert.ok(!/pre-?flight/i.test(system), 'Static lane carries NO preflight reference (KNP guidance is user-lane)');

    // ── USER part: HANYA data dinamik + anchor (tiada arahan statik) ──
    assert.ok(user.includes('<input>'), 'input block in user part');
    assert.ok(user.trimEnd().endsWith('<s id="1">'), 'User part ENDS with prefill anchor');
    assert.ok(!user.includes('[SYSTEM / ROLE]'), 'Static sections NOT duplicated into user part');
    assert.ok(!user.includes('<example>'), 'Few-shot NOT duplicated into user part');
    // Pro juga menerima idManifest (Owner D5).
    assert.ok(user.includes('Required output ids in exact order'), 'Pro user part carries the required-ID manifest');

    // ── DETOX: legacy bloat gone ──
    assert.ok(!prompt.includes('<translation_craft>'), 'translation_craft tag block REMOVED');
    assert.ok(!prompt.includes('CRITICAL ENFORCEMENT RULES'), 'Legacy 7-rule REMOVED');
    assert.ok(!prompt.includes('[UNIVERSAL STRUCTURAL DEMONSTRATION'), 'Legacy demo REMOVED');
});

test('SubFaberPrompt V5: Basic mode uses the SAME single template with pack few-shot', () => {
    // [SINGLE-TEMPLATE 2026-11-14] Basic = templat yang sama; beza hanya data
    // (tiada konteks preflight → tiada blok <preflight_knp>). Few-shot pack
    // disuntik pada Basic juga (mandat Owner).
    const engine = makeEngine({ subfaberEnabled: true }, { trinityMode: 'basic' });
    engine.sourceLanguage = 'English';
    const batch = makeEntries(2, 1);
    const batchText = engine.prepareBatchXml(batch, null);

    const prompt = engine.createXmlBatchPrompt(batchText, 'Malay', null, batch.length, null, 0, 1);
    const parts = splitStructuredPrompt(prompt);
    assert.ok(parts, 'Prompt must split into { system, user }');
    const { system, user } = parts;

    // SATU templat: Basic membawa seksyen berlabel yang sama.
    assert.ok(
        system.includes('You are a professional Netflix subtitle translator, specializing in localizing subtitles'),
        'Basic system carries the universal translator instruction'
    );
    assert.ok(
        system.includes('specializing in localizing subtitles from English into Malay.'),
        'Basic system names the actual source and target language'
    );
    assert.ok(system.includes('[TECHNICAL CONSTRAINTS & FORMATTING]'), 'Basic carries the same constraints section');
    assert.ok(system.includes('[FEW-SHOT EXAMPLES'), 'Basic carries the few-shot section (mandat Owner)');
    assert.ok(system.includes('Biar betul.'), 'Basic carries the pack few-shot for target=Malay');
    assert.ok(system.includes('[OUTPUT REQUIREMENT]'), 'Basic output contract label');
    // Basic tiada konteks preflight → tiada blok KNP dalam user lane.
    assert.ok(!user.includes('<preflight_knp'), 'Basic user part carries NO KNP block (no preflight context)');
    // idManifest kekal hadir untuk Basic.
    assert.ok(user.includes('Required output ids in exact order'), 'Basic user part carries the required-ID manifest');
    // Data-only user part + retained anchor.
    assert.ok(user.includes('<input>'), 'user part carries the batch input');
    assert.ok(user.trimEnd().endsWith('<s id="1">'), 'user part ENDS with the anchor');
    assert.ok(!user.includes('You are a professional'), 'static instruction not duplicated into user part');
});

test('SubFaberPrompt V3: gemini buildUserPrompt splits system/user (no double-send)', () => {
    // Fix bazir token: arahan statik dihantar SEKALI (systemInstruction),
    // data dinamik SEKALI (user content). Dulu userPrompt = systemPrompt penuh.
    const GeminiService = require('./gemini');
    const engine = makeEngine({ subfaberEnabled: true }, { trinityMode: 'pro' });
    engine.sourceLanguage = 'English';
    const batch = makeEntries(3, 1);
    const batchText = engine.prepareBatchXml(batch, null);
    const combined = engine.createXmlBatchPrompt(batchText, 'Malay', null, batch.length, null, 0, 1);

    const svc = new GeminiService('dummy-key', 'gemini-2.5-flash', {});
    const { userPrompt, systemPrompt } = svc.buildUserPrompt('unused', 'Malay', combined);

    // System carries the static instructions; user carries the dynamic data.
    assert.ok(systemPrompt.includes('[SYSTEM / ROLE]'), 'systemPrompt carries the Role section label');
    assert.ok(systemPrompt.includes('[TECHNICAL CONSTRAINTS & FORMATTING]'), 'systemPrompt carries the constraints');
    assert.ok(userPrompt.includes('<input>'), 'userPrompt carries the batch input');
    assert.ok(userPrompt.trimEnd().endsWith('<s id="1">'), 'userPrompt keeps the prefill anchor');
    // The critical anti-duplication guarantee:
    assert.ok(!userPrompt.includes('[SYSTEM / ROLE]'), 'Role NOT duplicated into userPrompt');
    assert.ok(!userPrompt.includes('[TECHNICAL CONSTRAINTS'), 'Constraints NOT duplicated into userPrompt');
    // [SINGLE-TEMPLATE] Templat kini menyebut '<input>' dalam TEKS ARAHAN
    // ("Only translate the lines inside <input>") — itu bukan kebocoran data.
    // Yang dilarang: BLOK data sebenar <input>...</input> jatuh ke system.
    assert.ok(!systemPrompt.includes('<input>\n<s id='), 'Input DATA block NOT leaked into systemPrompt');
    assert.ok(!systemPrompt.includes('Hello there.'), 'Batch text NOT leaked into systemPrompt');
    // Boundary sentinel must never survive into either delivered part.
    assert.ok(!userPrompt.includes(SUBFABER_PROMPT_BOUNDARY), 'No boundary sentinel in userPrompt');
    assert.ok(!systemPrompt.includes(SUBFABER_PROMPT_BOUNDARY), 'No boundary sentinel in systemPrompt');
});

test('SubFaberPrompt V3: legacy markerless custom prompt keeps old behaviour', () => {
    // Backward-compat: prompt tanpa sempadan (custom warisan) → laluan lama,
    // systemPrompt = combined penuh (tiada regresi untuk pengguna custom prompt).
    const GeminiService = require('./gemini');
    const svc = new GeminiService('dummy-key', 'gemini-2.5-flash', {});
    const legacy = 'Translate everything into {target_language} nicely.';
    const { userPrompt, systemPrompt } = svc.buildUserPrompt('Hello world', 'Malay', legacy);
    assert.ok(systemPrompt.includes('Translate everything into Malay'), 'legacy systemPrompt intact');
    assert.ok(userPrompt.includes('Content to translate:'), 'legacy non-self-contained path intact');
    assert.ok(userPrompt.includes('Hello world'), 'legacy user carries the subtitle content');
});

test('SubFaberPrompt V5: prompt is the ONLY path (no flags), structured sections always present', () => {
    const engine = makeEngine({});
    engine.sourceLanguage = 'English';
    const batch = makeEntries(2, 1);
    const batchText = engine.prepareBatchXml(batch, null);

    const prompt = engine.createXmlBatchPrompt(batchText, 'Malay', null, batch.length, null, 0, 1);
    assert.ok(prompt.includes('[SYSTEM / ROLE]'), 'Role section always present');
    assert.ok(prompt.includes('strict 1-to-1'), 'Parity mandate always present (V5 role)');
    assert.ok(prompt.includes('[TECHNICAL CONSTRAINTS & FORMATTING]'), 'Constraints section always present');
    assert.ok(!prompt.includes('CRITICAL ENFORCEMENT RULES'), 'Legacy 7-rule REMOVED permanently');
});

test('SubFaberPrompt: anchor startId derived directly from clean batchText (first active ID)', () => {
    // Shared Prompt Architecture: batchText HANYA entri aktif — startId
    // diekstrak TERUS daripada tag pertama. Konteks (IDs 1..5) hidup dalam
    // blok {shared_prompt} dan TIDAK boleh mencemar anchor penutup.
    const engine = makeEngine({ subfaberEnabled: true });
    engine.sourceLanguage = 'English';
    const all = makeEntries(10);
    const batch = all.slice(5, 10); // IDs 6..10
    const context = {
        previousContent: all.slice(0, 5), // IDs 1..5 — konteks, mesti TIDAK jadi anchor
        subsequentContent: [],
        previousMemory: [],
        preflight: null
    };
    const batchText = engine.prepareBatchXml(batch); // context diabaikan — entri aktif sahaja
    const prompt = engine.createXmlBatchPrompt(batchText, 'Malay', null, batch.length, context, 0, 1);

    // Anchor mesti <s id="6"> (ID aktif pertama), BUKAN <s id="1"> (context ID)
    assert.ok(prompt.includes('<s id="6">'), 'Anchor must be active first ID (6)');
    assert.ok(prompt.trimEnd().endsWith('<s id="6">'), 'Prompt must END with anchor <s id="6">');
    // Anchor ialah token terakhir prompt
    const lastIdx = prompt.trimEnd().length;
    const anchorIdx = prompt.lastIndexOf('<s id="6">');
    assert.ok(anchorIdx === lastIdx - '<s id="6">'.length, 'Anchor is the final token of the prompt');
});

test('SubFaberPrompt V3: shared context block lives in the USER part, before <input>', () => {
    // Rebuild v2: blok konteks Bible + previous/subsequent hidup dalam bahagian
    // USER (dinamik), SEBELUM <input>. Bahagian SYSTEM (statik) tidak membawa
    // konteks. <input> kekal suci (entri aktif sahaja).
    const engine = makeEngine({ subfaberEnabled: true });
    engine.sourceLanguage = 'English';
    const all = makeEntries(10);
    const batch = all.slice(5, 10); // IDs 6..10
    const context = {
        previousContent: all.slice(0, 5), // IDs 1..5
        subsequentContent: [],
        previousMemory: [],
        preflight: { theme: 'A heist movie.', terms: [] }
    };
    const batchText = engine.prepareBatchXml(batch);
    const prompt = engine.createXmlBatchPrompt(batchText, 'Malay', null, batch.length, context, 0, 1);
    const { system, user } = splitStructuredPrompt(prompt);

    // Konteks wujud dalam bahagian USER (bukan SYSTEM)
    assert.ok(
        user.includes('[CONTEXT INFORMATION - READ ONLY. DO NOT TRANSLATE THIS SECTION]'),
        'Context block in USER part'
    );
    assert.ok(user.includes('<previous_translated'), 'previous_translated in USER part');
    assert.ok(user.includes('<preflight_knp'), 'KNP block in USER part');
    assert.ok(user.includes('A heist movie.'), 'Theme text present in USER');
    assert.ok(!system.includes('[CONTEXT INFORMATION'), 'Context NOT in SYSTEM part (dynamic data only in user)');

    // Disclaimer anti-PHANTOM kekal, selepas blok konteks
    assert.ok(
        user.includes('(Reference only — do not translate or output content from this block as a target entry.)'),
        'Anti-PHANTOM disclaimer present in USER part'
    );

    // Susunan dalam USER: context → disclaimer → idManifest → <input> data.
    // [KNP-VERBATIM] Blok KNP membawa ARAHAN yang menyebut '<input>' (hierarki
    // kebenaran) — itu bukan blok data; cari blok data `<input>` pada
    // kedudukan selepas idManifest.
    const ctxIdx = user.indexOf('[CONTEXT INFORMATION');
    const manifestIdx = user.indexOf('Required output ids in exact order');
    const inputIdx = user.indexOf('<input>', manifestIdx);
    const disclaimerIdx = user.indexOf('(Reference only — do not translate');
    assert.ok(ctxIdx < inputIdx, 'Context BEFORE <input> in USER');
    assert.ok(disclaimerIdx > ctxIdx && disclaimerIdx < inputIdx, 'Disclaimer between context and <input>');

    // <input> SUCI — tiada konteks di dalamnya
    const inputSection = user.slice(inputIdx, user.indexOf('</input>'));
    assert.ok(inputSection.includes('<s id="6">'), 'Active entry 6 inside <input>');
    assert.ok(!inputSection.includes('<previous_translated'), 'No previous_translated inside <input>');
    assert.ok(!inputSection.includes('<preflight_knp'), 'No KNP inside <input>');
    assert.ok(!inputSection.includes('[CONTEXT INFORMATION'), 'No context header inside <input>');
});

test('SubFaberPrompt V3: no shared context block when context empty (user part clean)', () => {
    const engine = makeEngine({});
    engine.sourceLanguage = 'English';
    const batch = makeEntries(2, 1);
    const batchText = engine.prepareBatchXml(batch);
    const prompt = engine.createXmlBatchPrompt(batchText, 'Malay', null, batch.length, null, 0, 1);
    const { user } = splitStructuredPrompt(prompt);

    assert.ok(!user.includes('[CONTEXT INFORMATION'), 'No context block without context');
    // USER part goes straight to <input> then anchor
    const inputIdx = user.indexOf('<input>');
    assert.ok(inputIdx !== -1, '<input> present in user part');
    assert.ok(user.trimEnd().endsWith('<s id="1">'), 'User ends with anchor even without context');
});

// --- [KNP-VERBATIM 2026-11-14] Istilah disuntik VERBATIM (Owner D1) —
// pemadanan dinamik per-chunk GS3 DIPENSIUNKAN. Koverans: KESEMUA istilah
// kini hadir dalam JSON (tiada gugur senyap), notes/type dikekalkan.
test('SubFaberKNP: terms pillar carries every term verbatim regardless of chunk scope', () => {
    const engine = makeEngine({ subfaberEnabled: true });
    engine.preflightContext = {
        theme: 'A story about survival.',
        terms: [
            { source: 'Zhuang Xu', target: 'Zhuang Xu', note: 'Male colleague' },
            { source: 'Nie Xiguang', target: 'Nie Xiguang', note: 'Female lead' },
            { source: 'CP Group', target: 'CP Group', note: 'Company' } // Istilah TIDAK wujud dalam skop chunk
        ],
        characters: [],
        credits_and_titles: []
    };
    const batch = [
        { id: 11, timecode: 't', text: 'Zhuang Xu entered the office.' },
        { id: 12, timecode: 't', text: 'Nie Xiguang followed behind him.' }
    ];
    const previousContent = [{ id: 8, timecode: 't', text: 'The corridor was quiet.' }];
    const subsequentContent = [{ id: 13, timecode: 't', text: 'They sat down together.' }];

    const block = engine._formatPreflightForChunk(engine.preflightContext, previousContent, batch, subsequentContent);
    assert.ok(block.includes('A story about survival.'), 'Theme verbatim dalam JSON');
    assert.ok(block.includes('"source": "Zhuang Xu"'), 'Term 1 verbatim');
    assert.ok(block.includes('"note": "Male colleague"'), 'Note term 1 dikekalkan');
    assert.ok(block.includes('"source": "CP Group"'), 'Term luar skop KEKAL hadir (D1 — tiada gugur senyap)');
});

test('SubFaberKNP: verbatim renderer keeps unmatched-only terms (retirement of per-chunk gating)', () => {
    const engine = makeEngine({ subfaberEnabled: true });
    engine.preflightContext = {
        theme: 'A heist movie.',
        terms: [{ source: 'Ghost', target: 'Hantu', note: 'Mastermind' }], // Tidak wujud dalam skop
        characters: [],
        credits_and_titles: []
    };
    const batch = [{ id: 1, timecode: 't', text: 'Hello world.' }];

    const block = engine._formatPreflightForChunk(engine.preflightContext, [], batch, []);
    assert.ok(block.includes('A heist movie.'), 'Theme verbatim hadir');
    assert.ok(block.includes('"source": "Ghost"'), 'Istilah tanpa padanan KEKAL disuntik (D1)');
});

test('SubFaberGS3: term matching is case-insensitive and scans prev + batch + next scope', () => {
    const engine = makeEngine({ subfaberEnabled: true });
    engine.preflightContext = {
        theme: 'T.',
        terms: [
            { source: 'BLACKWOOD', target: 'Hutan Hitam', note: 'Mansion' }, // Padanan dalam prev (UPPERCASE source)
            { source: 'Silverton', target: 'Bandar Perak', note: 'Town' } // Padanan dalam next
        ],
        characters: [],
        credits_and_titles: []
    };
    const previousContent = [{ id: 1, timecode: 't', text: 'Welcome to blackwood mansion.' }];
    const batch = [{ id: 2, timecode: 't', text: 'The drive continues.' }];
    const subsequentContent = [{ id: 3, timecode: 't', text: 'Arriving at Silverton soon.' }];

    const block = engine._formatPreflightForChunk(engine.preflightContext, previousContent, batch, subsequentContent);
    // [KNP-VERBATIM] Semua istilah kini disuntik verbatim (D1) — istilah di
    // luar skop chunk kekal hadir, tiada lagi pemadanan dinamik per-chunk.
    assert.ok(block.includes('BLACKWOOD'), 'Full terms pillar carries BLACKWOOD verbatim');
    assert.ok(block.includes('Silverton'), 'Full terms pillar carries Silverton verbatim');
});

test('SubFaberGS3: null canonical_address renders NOT LOCKED marker (MANDAT SOSIOLINGUISTIK 2026-09-27)', () => {
    const engine = makeEngine({ subfaberEnabled: true });
    engine.preflightContext = {
        theme: 'T.',
        terms: [],
        characters: [
            { name: 'Shen Ruoxin', canonical_address: 'Puan Shen', role: 'female lead' },
            { name: 'Mystery Woman', canonical_address: null, role: 'unknown' }
        ],
        credits_and_titles: []
    };
    const batch = [{ id: 1, timecode: 't', text: 'Shen Ruoxin arrives.' }];

    const block = engine._formatPreflightForChunk(engine.preflightContext, [], batch, []);
    // [KNP-VERBATIM] characters kini JSON: gelaran terkunci hadir verbatim.
    assert.ok(block.includes('"canonical_address": "Puan Shen"'), 'gelaran terkunci dirender verbatim');
    // null → isyarat NOT LOCKED pack-driven (fallback lama || name DIBUANG).
    assert.ok(block.includes('"canonical_address": null'), 'null dirender sebagai null (bukan nama mentah)');
    assert.ok(block.includes('address NOT LOCKED'), 'isyarat NOT LOCKED hadir (guidance pack)');
    assert.ok(!block.includes('"canonical_address": "Mystery Woman"'), 'nama mentah TIDAK dijadikan gelaran');
    assert.ok(block.includes('Malay matrix'), 'panduan matriks BM mesti hadir untuk Agent Translation');
});

// --- Parser: konteks tidak rosakkan parseXmlBatchResponse ---
test('SubFaberParse: parser ignores context IDs not in batch (hallucination filter)', () => {
    const engine = makeEngine({ subfaberEnabled: true });
    const batch = makeEntries(3, 11); // IDs 11,12,13
    // Model hypothetically echo context ID 9 + active IDs
    const response = `<s id="9">Context echo</s>\n<s id="11">Sebelas</s>\n<s id="12">Dua belas</s>\n<s id="13">Tiga belas</s>`;

    const parsed = engine.parseXmlBatchResponse(response, 3, batch);
    assert.equal(parsed.length, 3, 'Only active batch IDs parsed');
    const parsedIds = parsed.map((p) => p.index);
    assert.ok(!parsedIds.includes(8), 'Context ID 9 (index 8) filtered out');
});

// --- translationStats.subfaberContextUsed ---
test('SubFaberStats: subfaberContextUsed flag starts undefined/false in stats', () => {
    const engine = makeEngine({ subfaberEnabled: true });
    assert.ok(!engine.translationStats.subfaberContextUsed, 'Flag must start falsy');
});
