/**
 * SubFaber Sliding Context Buffer + Prompt Composer — Regression Tests
 * (TOTAL PURGE Mandat 2026-09-25 — SubFaber enjin TUNGGAL)
 *
 * Menguji kontrak laporan plans/subfaber-technical-plan-backend.md §3.2:
 *   1. _prepareSubfaberContext: sliding window dua hala (previous + subsequent)
 *   2. prepareContextForBatch: pembina konteks TUNGGAL (tiada laluan legacy)
 *   3. prepareBatchXml: blok konteks verbatim mandat (<previous_content>,
 *      <subsequent_content>, Content Summary, Points to Note)
 *   4. createXmlBatchPrompt: persona hybrid V1.9.2 (expressiveness) +
 *      guardrail split-sentence + <translation_principles>
 *   5. Flag subfaberEnabled DIBUANG — prompt SubFaber tulen tanpa sebarang flag
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
  assert.equal(engineLegacy.subfaberEnabled, undefined, 'Legacy subfaberEnabled:false ignored — engine stays SubFaber');
  assert.equal(engineLegacy.batchSize, 50, 'Batch size stays 50 regardless of legacy flags');
});

test('SubFaberContext: context builder runs WITHOUT any flag (single engine path)', () => {
  const engine = makeEngine({});
  const all = makeEntries(30);
  const batch = all.slice(10, 20); // batch tengah — ada baris sebelum & selepas
  const ctx = engine.prepareContextForBatch(batch, all, [], 1);
  assert.ok(ctx, 'Sliding context built without subfaberEnabled flag');
  assert.equal(ctx.previousContent.length, 3, 'Prev window = 3 (always)');
  assert.equal(ctx.subsequentContent.length, 2, 'Next window = 2 (always)');
});

// --- _prepareSubfaberContext: ASYMMETRIC sliding window (Golden Standard, VideoLingo ground truth) ---
test('SubFaberContext: middle batch gets asymmetric context — prev=3 lines, next=2 lines', () => {
  const engine = makeEngine({ subfaberEnabled: true, contextSize: 5 }); // contextSize diabaikan dalam mod SubFaber
  const all = makeEntries(30); // IDs 1..30
  const batch = all.slice(10, 20); // batch kedua (IDs 11..20)

  const ctx = engine.prepareContextForBatch(batch, all, [], 1);
  assert.ok(ctx, 'Context must be built for SubFaber');
  assert.ok(Array.isArray(ctx.previousContent), 'previousContent array');
  assert.ok(Array.isArray(ctx.subsequentContent), 'subsequentContent array');
  // GOLDEN STANDARD: prev = 3 baris terakhir (VideoLingo [-3:]), next = 2 baris pertama ([:2])
  assert.equal(ctx.previousContent.length, 3, 'Prev window = 3 entries (VideoLingo ground truth)');
  assert.equal(ctx.subsequentContent.length, 2, 'Next window = 2 entries (VideoLingo ground truth)');
  // Verifikasi kandungan: previous = IDs 8..10 (3 terakhir sebelum batch), subsequent = IDs 21..22 (2 pertama selepas)
  assert.equal(ctx.previousContent[0].id, 8);
  assert.equal(ctx.previousContent[2].id, 10);
  assert.equal(ctx.subsequentContent[0].id, 21);
  assert.equal(ctx.subsequentContent[1].id, 22);
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
  assert.equal(ctx.subsequentContent.length, 2, 'First batch next window = 2 (asymmetric)');
  assert.equal(ctx.subsequentContent[0].id, 11);
});

test('SubFaberContext: last batch gets previous but no subsequent', () => {
  const engine = makeEngine({ subfaberEnabled: true, contextSize: 20 });
  const all = makeEntries(20);
  const batch = all.slice(15, 20); // batch terakhir (IDs 16..20)

  const ctx = engine.prepareContextForBatch(batch, all, [], 1);
  assert.ok(ctx);
  assert.equal(ctx.previousContent.length, 3, 'Last batch prev window = 3');
  assert.equal(ctx.previousContent[2].id, 15, 'Previous ends at ID 15');
  assert.equal(ctx.subsequentContent.length, 0, 'No subsequent at file end');
});

test('SubFaberContext: window clamps at file boundaries', () => {
  const engine = makeEngine({ subfaberEnabled: true, contextSize: 100 });
  const all = makeEntries(10);
  const batch = all.slice(4, 6); // IDs 5..6

  const ctx = engine.prepareContextForBatch(batch, all, [], 0);
  assert.equal(ctx.previousContent.length, 3, 'Clamped prev: only 3 entries requested (of 4 available)');
  assert.equal(ctx.subsequentContent.length, 2, 'Clamped next: only 2 entries requested (of 4 available)');
});

// --- GOLDEN STANDARD GS1: batch size SubFaber = 50 (hardcoded, tiada env override) ---
test('SubFaberContext: batch size = 50 ALWAYS (SUBFABER_BATCH_SIZE hardcoded)', () => {
  const engine = makeEngine({});
  assert.equal(engine.batchSize, 50, 'SubFaber batch size = 50 (Golden Standard, enjin tunggal)');
  // Env TRANSLATION_BATCH_SIZE tidak lagi berkesan — nilai diabaikan
  const engineEnv = makeEngine({ TRANSLATION_BATCH_SIZE: 200 });
  assert.equal(engineEnv.batchSize, 50, 'Env override REMOVED — always 50');
});

test('SubFaberContext: previousMemory includes verified translations, excludes placeholders', () => {
  const engine = makeEngine({ subfaberEnabled: true, contextSize: 3 });
  const all = makeEntries(20);
  const batch = all.slice(10, 20);
  // translatedSoFar: entry 9 = OK, entry 10 = [⚠️] placeholder (must be excluded)
  const translatedSoFar = all.slice(0, 10).map(e => ({
    id: e.id,
    timecode: e.timecode,
    text: e.id === 10 ? '[⚠️] untranslated' : `Terjemahan ${e.id}`
  }));

  const ctx = engine.prepareContextForBatch(batch, all, translatedSoFar, 1);
  assert.ok(Array.isArray(ctx.previousMemory));
  const memoryIds = ctx.previousMemory.map(m => m.id);
  assert.ok(memoryIds.includes(9), 'Verified translation included');
  assert.ok(!memoryIds.includes(10), '[⚠️] placeholder excluded');
});

test('SubFaberContext: preflight context flows through when set', () => {
  const engine = makeEngine({ subfaberEnabled: true, contextSize: 2 });
  engine.preflightContext = { theme: 'A heist movie.', terms: [{ src: 'Boss', tgt: 'Ketua', note: 'Leader' }] };
  const all = makeEntries(10);
  const ctx = engine.prepareContextForBatch(all.slice(5, 10), all, [], 0);
  assert.equal(ctx.preflight.theme, 'A heist movie.');
  assert.equal(ctx.preflight.terms.length, 1);
});

// --- prepareBatchXml: blok konteks verbatim mandat ---
test('SubFaberXml: context block renders previous_content + subsequent_content + ENTRIES marker', () => {
  const engine = makeEngine({ subfaberEnabled: true });
  const batch = makeEntries(3, 11); // IDs 11..13
  const context = {
    previousContent: makeEntries(2, 9),  // IDs 9..10
    subsequentContent: makeEntries(2, 14), // IDs 14..15
    previousMemory: [],
    preflight: null
  };

  const xml = engine.prepareBatchXml(batch, context);
  assert.ok(xml.includes('[CONTEXT INFORMATION - READ ONLY. DO NOT TRANSLATE THIS SECTION]'), 'Read-only header');
  assert.ok(xml.includes('<previous_content>'), 'previous_content opening tag');
  assert.ok(xml.includes('</previous_content>'), 'previous_content closing tag');
  assert.ok(xml.includes('<subsequent_content>'), 'subsequent_content opening tag');
  assert.ok(xml.includes('</subsequent_content>'), 'subsequent_content closing tag');
  assert.ok(xml.includes('=== ENTRIES TO TRANSLATE ==='), 'Entries marker present');

  // Konteks SEBELUM entri aktif; entri aktif selepas marker
  const ctxIdx = xml.indexOf('<previous_content>');
  const entriesIdx = xml.indexOf('=== ENTRIES TO TRANSLATE ===');
  assert.ok(ctxIdx < entriesIdx, 'Context must precede active entries');

  // Verifikasi ID: konteks guna tag <s id> juga (satu bentuk sahaja)
  assert.ok(xml.includes('<s id="9">'), 'Previous entry 9 rendered');
  assert.ok(xml.includes('<s id="14">'), 'Subsequent entry 14 rendered');
  assert.ok(xml.includes('<s id="11">'), 'Active entry 11 rendered');
});

test('SubFaberXml: preflight renders Content Summary + Points to Note blocks (term must match batch text)', () => {
  const engine = makeEngine({ subfaberEnabled: true });
  // GS3: term-matching dinamik — istilah mesti wujud dalam skop chunk
  // (prev/batch/next) untuk disuntik. Batch ini menyebut "Zhuang Xu".
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
      terms: [{ src: 'Zhuang Xu', tgt: 'Zhuang Xu', note: 'Male colleague' }]
    }
  };

  const xml = engine.prepareBatchXml(batch, context);
  assert.ok(xml.includes('### Content Summary'), 'Content Summary header');
  assert.ok(xml.includes('A story about survival.'), 'Theme text');
  assert.ok(xml.includes('### Points to Note'), 'Points to Note header');
  assert.ok(xml.includes('- Zhuang Xu: Zhuang Xu (Male colleague)'), 'Term line rendered (matched in batch)');
});

test('SubFaberXml: empty context renders no context block (plain batch)', () => {
  const engine = makeEngine({ subfaberEnabled: true });
  const batch = makeEntries(2, 1);
  const xml = engine.prepareBatchXml(batch, null);
  assert.ok(!xml.includes('[CONTEXT INFORMATION'), 'No context header when no context');
  assert.ok(!xml.includes('=== ENTRIES TO TRANSLATE ==='), 'No entries marker when no context block');
  assert.ok(xml.includes('<s id="1">'), 'Active entries still rendered');
});

test('SubFaberXml: XML escaping applied to context entries', () => {
  const engine = makeEngine({ subfaberEnabled: true });
  const batch = makeEntries(1, 1);
  // Bina string melalui char codes supaya sumber test tidak mengandungi
  // entity literal (& / <) yang boleh dinormalisasi oleh tooling —
  // pastikan assertion menguji runtime sebenar, bukan artefak penulisan fail.
  const AMP = String.fromCharCode(38);   // &
  const LT = String.fromCharCode(60);    // <
  const GT = String.fromCharCode(62);    // >
  const rawInput = `A ${AMP} B ${LT}tag${GT}`;
  const expectedEscaped = `A ${AMP}amp; B ${AMP}lt;tag${AMP}gt;`;

  const context = {
    previousContent: [{ id: 99, text: rawInput }],
    subsequentContent: [],
    previousMemory: [],
    preflight: null
  };
  const xml = engine.prepareBatchXml(batch, context);
  assert.ok(xml.includes(expectedEscaped), 'Special chars escaped in context');
  assert.ok(!xml.includes(`>A ${AMP} B ${LT}tag${GT}<`), 'Raw unescaped form must NOT appear inside tags');
});

test('SubFaberXml: previousMemory rendered as continuity block (single SubFaber path)', () => {
  // TOTAL PURGE: blok legacy [PREVIOUS_TRANSLATION_MEMORY] berasingan dibuang;
  // previousMemory kini dirender sebagai blok continuity dalam laluan SubFaber.
  const engine = makeEngine({});
  const batch = makeEntries(2, 1);
  const context = {
    previousContent: makeEntries(1, 0),
    previousMemory: [{ id: 5, source: 'Hello', translation: 'Helo' }]
  };
  const xml = engine.prepareBatchXml(batch, context);
  assert.ok(xml.includes('[PREVIOUS VERIFIED TRANSLATIONS'), 'Continuity memory header present');
  assert.ok(xml.includes('<m id="5">'), 'Verified translation rendered as <m> tag');
  assert.ok(xml.includes('=== END OF MEMORY ==='), 'Memory terminator present');
  assert.ok(!xml.includes('[PREVIOUS_TRANSLATION_MEMORY'), 'Legacy standalone header REMOVED');
});

// --- createXmlBatchPrompt: persona + principles (Purification Mandat 2026-09-25) ---
test('SubFaberPrompt: pure SubFaber prompt when ON — persona + principles + XML contract, NO legacy bloat', () => {
  const engine = makeEngine({ subfaberEnabled: true });
  engine.sourceLanguage = 'English';
  const batch = makeEntries(2, 1);
  const batchText = engine.prepareBatchXml(batch, null);

  const prompt = engine.createXmlBatchPrompt(batchText, 'Malay', null, batch.length, null, 0, 1);
  // Persona hybrid V1.9.2 verbatim (localization expert + natural spoken flow)
  assert.ok(prompt.includes('## Role'), 'Role section present');
  assert.ok(prompt.includes('professional Netflix subtitle translator'), 'VideoLingo persona verbatim');
  assert.ok(prompt.includes('fluent in both English and Malay'), 'Language pair in persona');
  assert.ok(prompt.includes('natural, fluent, and conversational Malay'), 'Conversational tone in persona (hybrid V1.9.2)');
  // Task + principles verbatim (hybrid: expressiveness + split-sentence guardrail)
  assert.ok(prompt.includes('## Task'), 'Task section present');
  assert.ok(prompt.includes('Handle split sentences correctly'), 'Split-sentence guardrail (task item 3, hybrid V1.9.2)');
  assert.ok(prompt.includes('Translate ONLY the fragment present in each line'), 'Fragment isolation rule verbatim');
  assert.ok(prompt.includes('Strictly preserve all inline markup'), 'Markup preservation rule (task item 4)');
  assert.ok(prompt.includes('<translation_principles>'), 'Principles opening tag');
  assert.ok(prompt.includes('</translation_principles>'), 'Principles closing tag');
  assert.ok(prompt.includes('Meaning over literal words'), 'Principle 1 verbatim (hybrid V1.9.2)');
  assert.ok(prompt.includes('Natural spoken flow'), 'Principle 2 verbatim (hybrid V1.9.2)');
  assert.ok(prompt.includes('Strict line isolation'), 'Principle 3 verbatim (split-sentence isolation)');
  assert.ok(prompt.includes('Professional terminology'), 'Principle 4 verbatim (hybrid V1.9.2)');
  // Kontrak XML satu baris (SRT AI Translator)
  assert.ok(prompt.includes('## Output Format'), 'Output Format section present');
  assert.ok(prompt.includes('EXACTLY one <s id="N"> element per input subtitle'), '1-to-1 XML contract');
  assert.ok(prompt.includes('<answer>'), 'Answer block wrapper in contract');
  // DETOX: legacy bloat mesti HILANG
  assert.ok(!prompt.includes('CRITICAL ENFORCEMENT RULES'), '7-rule rulebook REMOVED (detox)');
  assert.ok(!prompt.includes('STRICT 1-TO-1 CARDINALITY'), 'Rule 1 REMOVED (detox)');
  assert.ok(!prompt.includes('[UNIVERSAL STRUCTURAL DEMONSTRATION'), 'Structural demo REMOVED (detox)');
  assert.ok(!prompt.includes('ZERO TOLERANCE'), 'Zero-tolerance tone REMOVED (detox)');
  // Anchor kekal di penutup (Smart Preamble Scrubber compatibility)
  assert.ok(prompt.includes('<s id="1">'), 'Anchor <s id="${startId}"> at prompt tail');
  assert.ok(prompt.trimEnd().endsWith('<s id="1">'), 'Prompt must END with anchor tag');
});

test('SubFaberPrompt: pure SubFaber prompt is the ONLY path (no flags exist)', () => {
  // TOTAL PURGE Mandat 2026-09-25: enjin SubFaber tunggal — prompt dijana
  // tanpa sebarang flag. Bangkai komen legacy 7-rule dibuang sepenuhnya.
  const engine = makeEngine({});
  engine.sourceLanguage = 'English';
  const batch = makeEntries(2, 1);
  const batchText = engine.prepareBatchXml(batch, null);

  const prompt = engine.createXmlBatchPrompt(batchText, 'Malay', null, batch.length, null, 0, 1);
  assert.ok(prompt.includes('## Role'), 'Persona always present (SubFaber is the only engine)');
  assert.ok(prompt.includes('<translation_principles>'), 'Principles always present');
  assert.ok(prompt.includes('Netflix subtitle translator'), 'Netflix persona always present');
  assert.ok(!prompt.includes('CRITICAL ENFORCEMENT RULES'), 'Legacy 7-rule REMOVED permanently');
  assert.ok(!prompt.includes('[UNIVERSAL STRUCTURAL DEMONSTRATION'), 'Legacy demo REMOVED permanently');
});

test('SubFaberPrompt: anchor startId derived from active section, not context blocks', () => {
  // prepareBatchXml dengan konteks SubFaber meletakkan <s id> entries dalam
  // blok konteks SEBELUM '=== ENTRIES TO TRANSLATE ==='. createXmlBatchPrompt
  // mesti derive startId dari SEKSYEN AKTIF sahaja (selepas marker), bukan
  // konteks. Prompt SubFaber tulen tiada idList eksplisit (7-rule dibuang),
  // jadi pengesahan adalah melalui anchor di penutup prompt.
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
  const batchText = engine.prepareBatchXml(batch, context);
  const prompt = engine.createXmlBatchPrompt(batchText, 'Malay', null, batch.length, context, 0, 1);

  // Anchor mesti <s id="6"> (ID aktif pertama), BUKAN <s id="1"> (context ID)
  assert.ok(prompt.includes('<s id="6">'), 'Anchor must be active first ID (6)');
  assert.ok(prompt.trimEnd().endsWith('<s id="6">'), 'Prompt must END with anchor <s id="6">');
  // Context IDs wujud dalam blok konteks (itu OK) tapi tidak sebagai anchor penutup
  const lastIdx = prompt.trimEnd().length;
  const anchorIdx = prompt.lastIndexOf('<s id="6">');
  assert.ok(anchorIdx === lastIdx - '<s id="6">'.length, 'Anchor is the final token of the prompt');
});

// --- GOLDEN STANDARD GS3: Dynamic term-matching per-chunk (VideoLingo search_things_to_note) ---
test('SubFaberGS3: Points to Note only injects terms whose source text appears in chunk scope', () => {
  const engine = makeEngine({ subfaberEnabled: true });
  engine.preflightContext = {
    theme: 'A story about survival.',
    terms: [
      { src: 'Zhuang Xu', tgt: 'Zhuang Xu', note: 'Male colleague' },
      { src: 'Nie Xiguang', tgt: 'Nie Xiguang', note: 'Female lead' },
      { src: 'CP Group', tgt: 'CP Group', note: 'Company' } // Istilah TIDAK wujud dalam skop chunk
    ]
  };
  const batch = [
    { id: 11, timecode: 't', text: 'Zhuang Xu entered the office.' },
    { id: 12, timecode: 't', text: 'Nie Xiguang followed behind him.' }
  ];
  const previousContent = [{ id: 8, timecode: 't', text: 'The corridor was quiet.' }];
  const subsequentContent = [{ id: 13, timecode: 't', text: 'They sat down together.' }];

  const block = engine._formatPreflightForChunk(
    engine.preflightContext, previousContent, batch, subsequentContent
  );
  assert.ok(block.includes('### Content Summary'), 'Theme always injected');
  assert.ok(block.includes('A story about survival.'), 'Theme text present');
  assert.ok(block.includes('### Points to Note'), 'Points to Note present (2 terms matched)');
  assert.ok(block.includes('- Zhuang Xu: Zhuang Xu (Male colleague)'), 'Matched term 1 rendered');
  assert.ok(block.includes('- Nie Xiguang: Nie Xiguang (Female lead)'), 'Matched term 2 rendered');
  assert.ok(!block.includes('CP Group'), 'Unmatched term NOT injected (token savings)');
});

test('SubFaberGS3: Points to Note section emptied when no terms match chunk scope', () => {
  const engine = makeEngine({ subfaberEnabled: true });
  engine.preflightContext = {
    theme: 'A heist movie.',
    terms: [{ src: 'Ghost', tgt: 'Hantu', note: 'Mastermind' }] // Tidak wujud dalam skop
  };
  const batch = [{ id: 1, timecode: 't', text: 'Hello world.' }];

  const block = engine._formatPreflightForChunk(engine.preflightContext, [], batch, []);
  assert.ok(block.includes('### Content Summary'), 'Theme still injected');
  assert.ok(!block.includes('### Points to Note'), 'No Points to Note when zero matches (token savings)');
});

test('SubFaberGS3: term matching is case-insensitive and scans prev + batch + next scope', () => {
  const engine = makeEngine({ subfaberEnabled: true });
  engine.preflightContext = {
    theme: 'T.',
    terms: [
      { src: 'BLACKWOOD', tgt: 'Hutan Hitam', note: 'Mansion' }      // Padanan dalam prev (UPPERCASE source)
      , { src: 'Silverton', tgt: 'Bandar Perak', note: 'Town' }      // Padanan dalam next
    ]
  };
  const previousContent = [{ id: 1, timecode: 't', text: 'Welcome to blackwood mansion.' }];
  const batch = [{ id: 2, timecode: 't', text: 'The drive continues.' }];
  const subsequentContent = [{ id: 3, timecode: 't', text: 'Arriving at Silverton soon.' }];

  const block = engine._formatPreflightForChunk(engine.preflightContext, previousContent, batch, subsequentContent);
  assert.ok(block.includes('- BLACKWOOD: Hutan Hitam'), 'Prev-scope match (case-insensitive)');
  assert.ok(block.includes('- Silverton: Bandar Perak'), 'Next-scope match');
});

// --- Parser: konteks tidak rosakkan parseXmlBatchResponse ---
test('SubFaberParse: parser ignores context IDs not in batch (hallucination filter)', () => {
  const engine = makeEngine({ subfaberEnabled: true });
  const batch = makeEntries(3, 11); // IDs 11,12,13
  // Model hypothetically echo context ID 9 + active IDs
  const response = `<s id="9">Context echo</s>\n<s id="11">Sebelas</s>\n<s id="12">Dua belas</s>\n<s id="13">Tiga belas</s>`;

  const parsed = engine.parseXmlBatchResponse(response, 3, batch);
  assert.equal(parsed.length, 3, 'Only active batch IDs parsed');
  const parsedIds = parsed.map(p => p.index);
  assert.ok(!parsedIds.includes(8), 'Context ID 9 (index 8) filtered out');
});

// --- translationStats.subfaberContextUsed ---
test('SubFaberStats: subfaberContextUsed flag starts undefined/false in stats', () => {
  const engine = makeEngine({ subfaberEnabled: true });
  assert.ok(!engine.translationStats.subfaberContextUsed, 'Flag must start falsy');
});
