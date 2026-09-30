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
  assert.equal(engineLegacy.subfaberEnabled, undefined, 'Legacy subfaberEnabled:false ignored — engine stays SubFaber');
  assert.equal(engineLegacy.batchSize, 60, 'Batch size stays 60 regardless of legacy flags');
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

// --- OWNER TUNING 2026-09-30: batch size SubFaber = 60 (dinaikkan daripada 30;
// hardcoded, tiada env override — edit manual owner) ---
test('SubFaberContext: batch size = 60 ALWAYS (SUBFABER_BATCH_SIZE hardcoded)', () => {
  const engine = makeEngine({});
  assert.equal(engine.batchSize, 60, 'SubFaber batch size = 60 (owner tuning 2026-09-30, enjin tunggal)');
  // Env TRANSLATION_BATCH_SIZE tidak lagi berkesan — nilai diabaikan
  const engineEnv = makeEngine({ TRANSLATION_BATCH_SIZE: 200 });
  assert.equal(engineEnv.batchSize, 60, 'Env override REMOVED — always 60');
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

// --- prepareBatchXml: entri aktif sahaja (Shared Prompt Architecture 2026-09-26) ---
test('SubFaberXml: batchText is active entries ONLY — no context, no ENTRIES marker', () => {
  const engine = makeEngine({ subfaberEnabled: true });
  const batch = makeEntries(3, 11); // IDs 11..13
  const context = {
    previousContent: makeEntries(2, 9),  // IDs 9..10
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
test('SubFaberSharedContext: renders previous_content + subsequent_content + preflight + memory', () => {
  const engine = makeEngine({ subfaberEnabled: true });
  const batch = makeEntries(3, 11); // IDs 11..13
  const batchText = engine.prepareBatchXml(batch);
  const context = {
    previousContent: makeEntries(2, 9),  // IDs 9..10
    subsequentContent: makeEntries(2, 14), // IDs 14..15
    previousMemory: [{ id: 9, source: 'Hi', translation: 'Hai' }],
    preflight: {
      theme: 'A story about survival.',
      terms: [{ source: 'Entry 12', target: 'Entri 12', note: 'Term' }],
      characters: [],
      credits_and_titles: []
    }
  };

  const block = engine._formatSharedContext(context, batchText);
  assert.ok(block.includes('[CONTEXT INFORMATION - READ ONLY. DO NOT TRANSLATE THIS SECTION]'), 'Read-only header');
  assert.ok(block.includes('<previous_content>'), 'previous_content opening tag');
  assert.ok(block.includes('</previous_content>'), 'previous_content closing tag');
  assert.ok(block.includes('<subsequent_content>'), 'subsequent_content opening tag');
  assert.ok(block.includes('</subsequent_content>'), 'subsequent_content closing tag');
  assert.ok(block.includes('### Content Summary'), 'Preflight Content Summary block');
  assert.ok(block.includes('[PREVIOUS VERIFIED TRANSLATIONS'), 'Continuity memory header');
  assert.ok(block.includes('<m id="9">'), 'Verified translation rendered as <m> tag');
  assert.ok(block.includes('=== END OF MEMORY ==='), 'Memory terminator present');
  // Term 'Entry 12' wujud dalam batchText → Technical Glossary aktif (TIANG 2)
  assert.ok(block.includes('### Technical Glossary'), 'Technical Glossary (term matched in batch)');
  assert.ok(block.includes('- Entry 12: Entri 12 (Term)'), 'Matched term rendered');
});

test('SubFaberSharedContext: null/empty context returns empty string', () => {
  const engine = makeEngine({ subfaberEnabled: true });
  assert.equal(engine._formatSharedContext(null, '<s id="1">x</s>'), '', 'null context → empty');
  assert.equal(engine._formatSharedContext({}, '<s id="1">x</s>'), '', 'empty context → empty');
  assert.equal(engine._formatSharedContext({ previousContent: [], subsequentContent: [], previousMemory: [], preflight: null }, '<s id="1">x</s>'), '', 'all-empty arrays → empty');
});

test('SubFaberSharedContext: preflight renders Content Summary + Points to Note (term matched via batchText)', () => {
  const engine = makeEngine({ subfaberEnabled: true });
  // GS3: term-matching dinamik — istilah mesti wujud dalam skop chunk
  // (prev/batchText/next) untuk disuntik. BatchText ini menyebut "Zhuang Xu".
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
  assert.ok(block.includes('### Content Summary'), 'Content Summary header');
  assert.ok(block.includes('A story about survival.'), 'Theme text');
  assert.ok(block.includes('### Technical Glossary'), 'Technical Glossary header');
  assert.ok(block.includes('- Zhuang Xu: Zhuang Xu (Male colleague)'), 'Term line rendered (matched in batch)');
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
  const batchText = engine.prepareBatchXml(batch);
  const block = engine._formatSharedContext(context, batchText);
  assert.ok(block.includes(expectedEscaped), 'Special chars escaped in context');
  assert.ok(!block.includes(`>A ${AMP} B ${LT}tag${GT}<`), 'Raw unescaped form must NOT appear inside tags');
});

test('SubFaberSharedContext: previousMemory rendered as continuity block (single SubFaber path)', () => {
  // TOTAL PURGE: blok legacy [PREVIOUS_TRANSLATION_MEMORY] berasingan dibuang;
  // previousMemory dirender dalam blok {shared_prompt}, bukan batchText.
  const engine = makeEngine({});
  const batch = makeEntries(2, 1);
  const context = {
    previousContent: makeEntries(1, 0),
    previousMemory: [{ id: 5, source: 'Hello', translation: 'Helo' }]
  };
  const batchText = engine.prepareBatchXml(batch);
  const block = engine._formatSharedContext(context, batchText);
  assert.ok(block.includes('[PREVIOUS VERIFIED TRANSLATIONS'), 'Continuity memory header present');
  assert.ok(block.includes('<m id="5">'), 'Verified translation rendered as <m> tag');
  assert.ok(block.includes('=== END OF MEMORY ==='), 'Memory terminator present');
  assert.ok(!block.includes('[PREVIOUS_TRANSLATION_MEMORY'), 'Legacy standalone header REMOVED');
  assert.ok(!batchText.includes('<m id='), 'Memory NOT in batchText (clean <input>)');
});

// --- createXmlBatchPrompt: PROMPT V3 "PARITY-FIRST + SPLIT" (Rebuild v2 2026-09-29) ---
const { splitStructuredPrompt, SUBFABER_PROMPT_BOUNDARY } = require('./utils/structuredPrompt');

test('SubFaberPrompt V3: parity-first, slim rules, split system/user, no double-send', () => {
  const engine = makeEngine({ subfaberEnabled: true });
  engine.sourceLanguage = 'English';
  const batch = makeEntries(2, 1);
  const batchText = engine.prepareBatchXml(batch, null);

  const prompt = engine.createXmlBatchPrompt(batchText, 'Malay', null, batch.length, null, 0, 1);

  // ── Sempadan system/user hadir; split bersih ──
  assert.ok(prompt.includes(SUBFABER_PROMPT_BOUNDARY), 'Boundary marker present between system and user parts');
  const parts = splitStructuredPrompt(prompt);
  assert.ok(parts, 'Prompt must split into { system, user }');
  const { system, user } = parts;

  // ── SYSTEM part: Role + Priority + Rules + Style + few-shot + Output Format ──
  assert.ok(system.includes('## Role'), 'Role section in system part');
  // OWNER TUNING 2026-09-30: persona Role dikembalikan kepada "expert Netflix
  // subtitle translator" (edit manual owner) — ujian diselaraskan.
  assert.ok(system.includes('expert Netflix subtitle translator and localization specialist'), 'Owner-tuned role (Netflix persona restored)');
  assert.ok(system.includes('from English into Malay'), 'Language pair in role');
  // Priority 0 — pariti #1 (mandat owner: ID PARITI comes first)
  assert.ok(system.includes('## Top Priority — Slot & ID Parity (ABSOLUTE)'), 'Parity-first Priority section present');
  assert.ok(system.includes('PARITY WINS'), 'Explicit hierarchy: parity beats fluency');
  assert.ok(system.includes('desyncs the entire file'), 'Parity rationale present');
  // Rules — 7 tajam, label ANTI-* kekal (pemetaan 1:1 taksonomi Agent B)
  assert.ok(system.includes('1. ANTI-MERGE — SLOT ISOLATION'), 'Rule 1 ANTI-MERGE');
  assert.ok(system.includes('2. ANTI-SHIFT — NO SKIP, NO DRIFT'), 'Rule 2 ANTI-SHIFT');
  assert.ok(system.includes('3. ANTI-PHANTOM — NO FABRICATION'), 'Rule 3 ANTI-PHANTOM');
  assert.ok(system.includes('4. ANTI-DROP — FULL MEANING'), 'Rule 4 ANTI-DROP');
  assert.ok(system.includes('5. ANTI-UNTRANSLATED — ALWAYS TRANSLATE'), 'Rule 5 ANTI-UNTRANSLATED (lazy-copy guard)');
  assert.ok(system.includes('6. CROSS-SLOT TIEBREAKER'), 'Rule 6 cross-slot tiebreaker');
  assert.ok(system.includes('slot integrity outranks cross-slot grammatical smoothness'), 'Tiebreaker: parity > grammar');
  assert.ok(system.includes('7. PRESERVE markup'), 'Rule 7 markup preservation');
  assert.ok(system.includes('SAME COUNT as the source'), '[br] count locked');
  assert.ok(system.includes('reposition a [br] to a natural break'), '[br] reposition adaptif');
  // Style prose (secondary to parity) — craft padat
  assert.ok(system.includes('## Style (secondary to parity)'), 'Style section subordinate to parity');
  assert.ok(system.includes('reproduce the meaning and emotion (not the individual words)'), 'Equivalent-effect in style');
  assert.ok(system.includes('adapt idioms'), 'Anti-calque/idiom adaptation in style');
  assert.ok(system.includes('locked titles and pronouns'), 'Style references locked register (harmony with Bible)');
  assert.ok(system.includes('do NOT worry about reading-speed'), 'Text-to-text: timing fixed, no CPS math');
  // Few-shot (dari pack) hidup di SYSTEM (hantar sekali, cacheable)
  assert.ok(system.includes('[EXAMPLE 1 — MERGE:'), 'Few-shot EXAMPLE 1 in system');
  assert.ok(system.includes('[EXAMPLE 6 — REGISTER:'), 'Few-shot EXAMPLE 6 in system');
  assert.ok(system.includes('Awak ikut kami,'), 'Malay few-shot present (target=Malay)');
  // Output Format di SYSTEM
  assert.ok(system.includes('## Output Format'), 'Output Format in system part');
  assert.ok(system.includes('one <s id="N"> per input id'), '1-to-1 contract');
  assert.ok(system.includes('no reasoning or thinking tags'), 'No-thinking-tags contract');

  // ── USER part: HANYA data dinamik + anchor (tiada arahan statik) ──
  assert.ok(user.includes('<input>'), 'input block in user part');
  assert.ok(user.trimEnd().endsWith('<s id="1">'), 'User part ENDS with prefill anchor');
  assert.ok(!user.includes('## Role'), 'Role NOT duplicated into user part');
  assert.ok(!user.includes('ANTI-MERGE'), 'Rules NOT duplicated into user part');
  assert.ok(!user.includes('[EXAMPLE 1'), 'Few-shot NOT duplicated into user part');

  // ── NO DOUBLE-SEND: static instructions live ONLY in system, not in user ──
  assert.ok(system.includes('ANTI-MERGE') && !user.includes('ANTI-MERGE'), 'No duplication: rules only in system');

  // ── DETOX: legacy bloat gone ──
  assert.ok(!prompt.includes('<translation_craft>'), 'translation_craft tag block REMOVED (folded into Style prose)');
  assert.ok(!prompt.includes('CRITICAL ENFORCEMENT RULES'), 'Legacy 7-rule REMOVED');
  assert.ok(!prompt.includes('[UNIVERSAL STRUCTURAL DEMONSTRATION'), 'Legacy demo REMOVED');
});

test('SubFaberPrompt V3: gemini buildUserPrompt splits system/user (no double-send)', () => {
  // Fix bazir token: arahan statik dihantar SEKALI (systemInstruction),
  // data dinamik SEKALI (user content). Dulu userPrompt = systemPrompt penuh.
  const GeminiService = require('./gemini');
  const engine = makeEngine({ subfaberEnabled: true });
  engine.sourceLanguage = 'English';
  const batch = makeEntries(3, 1);
  const batchText = engine.prepareBatchXml(batch, null);
  const combined = engine.createXmlBatchPrompt(batchText, 'Malay', null, batch.length, null, 0, 1);

  const svc = new GeminiService('dummy-key', 'gemini-2.5-flash', {});
  const { userPrompt, systemPrompt } = svc.buildUserPrompt('unused', 'Malay', combined);

  // System carries the static instructions; user carries the dynamic data.
  assert.ok(systemPrompt.includes('## Role'), 'systemPrompt carries Role');
  assert.ok(systemPrompt.includes('1. ANTI-MERGE'), 'systemPrompt carries Rules');
  assert.ok(userPrompt.includes('<input>'), 'userPrompt carries the batch input');
  assert.ok(userPrompt.trimEnd().endsWith('<s id="1">'), 'userPrompt keeps the prefill anchor');
  // The critical anti-duplication guarantee:
  assert.ok(!userPrompt.includes('## Role'), 'Role NOT duplicated into userPrompt');
  assert.ok(!userPrompt.includes('1. ANTI-MERGE'), 'Rules NOT duplicated into userPrompt');
  assert.ok(!systemPrompt.includes('<input>'), 'Input NOT leaked into systemPrompt');
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

test('SubFaberPrompt V3: prompt is the ONLY path (no flags), parity + rules always present', () => {
  const engine = makeEngine({});
  engine.sourceLanguage = 'English';
  const batch = makeEntries(2, 1);
  const batchText = engine.prepareBatchXml(batch, null);

  const prompt = engine.createXmlBatchPrompt(batchText, 'Malay', null, batch.length, null, 0, 1);
  assert.ok(prompt.includes('## Role'), 'Role always present');
  assert.ok(prompt.includes('## Top Priority — Slot & ID Parity (ABSOLUTE)'), 'Parity-first always present');
  assert.ok(prompt.includes('1. ANTI-MERGE — SLOT ISOLATION'), 'Rules always present');
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
  assert.ok(user.includes('[CONTEXT INFORMATION - READ ONLY. DO NOT TRANSLATE THIS SECTION]'), 'Context block in USER part');
  assert.ok(user.includes('<previous_content>'), 'previous_content in USER part');
  assert.ok(user.includes('### Content Summary'), 'Content Summary (theme) in USER part');
  assert.ok(user.includes('A heist movie.'), 'Theme text present in USER');
  assert.ok(!system.includes('[CONTEXT INFORMATION'), 'Context NOT in SYSTEM part (dynamic data only in user)');

  // Disclaimer anti-PHANTOM kekal, selepas blok konteks
  assert.ok(
    user.includes('(Reference only — do not translate or output content from this block as a target entry.)'),
    'Anti-PHANTOM disclaimer present in USER part'
  );

  // Susunan dalam USER: context → disclaimer → <input> → anchor
  const ctxIdx = user.indexOf('[CONTEXT INFORMATION');
  const inputIdx = user.indexOf('<input>');
  const disclaimerIdx = user.indexOf('(Reference only — do not translate');
  assert.ok(ctxIdx < inputIdx, 'Context BEFORE <input> in USER');
  assert.ok(disclaimerIdx > ctxIdx && disclaimerIdx < inputIdx, 'Disclaimer between context and <input>');

  // <input> SUCI — tiada konteks di dalamnya
  const inputSection = user.slice(inputIdx, user.indexOf('</input>'));
  assert.ok(inputSection.includes('<s id="6">'), 'Active entry 6 inside <input>');
  assert.ok(!inputSection.includes('<previous_content>'), 'No previous_content inside <input>');
  assert.ok(!inputSection.includes('### Content Summary'), 'No theme inside <input>');
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

// --- GOLDEN STANDARD GS3: Dynamic term-matching per-chunk (VideoLingo search_things_to_note) ---
test('SubFaberGS3: Technical Glossary only injects terms whose source text appears in chunk scope', () => {
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

  const block = engine._formatPreflightForChunk(
    engine.preflightContext, previousContent, batch, subsequentContent
  );
  assert.ok(block.includes('### Content Summary'), 'Theme always injected');
  assert.ok(block.includes('A story about survival.'), 'Theme text present');
  assert.ok(block.includes('### Technical Glossary'), 'Technical Glossary present (2 terms matched)');
  assert.ok(block.includes('- Zhuang Xu: Zhuang Xu (Male colleague)'), 'Matched term 1 rendered');
  assert.ok(block.includes('- Nie Xiguang: Nie Xiguang (Female lead)'), 'Matched term 2 rendered');
  assert.ok(!block.includes('CP Group'), 'Unmatched term NOT injected (token savings)');
});

test('SubFaberGS3: Technical Glossary section emptied when no terms match chunk scope', () => {
  const engine = makeEngine({ subfaberEnabled: true });
  engine.preflightContext = {
    theme: 'A heist movie.',
    terms: [{ source: 'Ghost', target: 'Hantu', note: 'Mastermind' }], // Tidak wujud dalam skop
    characters: [],
    credits_and_titles: []
  };
  const batch = [{ id: 1, timecode: 't', text: 'Hello world.' }];

  const block = engine._formatPreflightForChunk(engine.preflightContext, [], batch, []);
  assert.ok(block.includes('### Content Summary'), 'Theme still injected');
  assert.ok(!block.includes('### Technical Glossary'), 'No Technical Glossary when zero matches (token savings)');
});

test('SubFaberGS3: term matching is case-insensitive and scans prev + batch + next scope', () => {
  const engine = makeEngine({ subfaberEnabled: true });
  engine.preflightContext = {
    theme: 'T.',
    terms: [
      { source: 'BLACKWOOD', target: 'Hutan Hitam', note: 'Mansion' }      // Padanan dalam prev (UPPERCASE source)
      , { source: 'Silverton', target: 'Bandar Perak', note: 'Town' }      // Padanan dalam next
    ],
    characters: [],
    credits_and_titles: []
  };
  const previousContent = [{ id: 1, timecode: 't', text: 'Welcome to blackwood mansion.' }];
  const batch = [{ id: 2, timecode: 't', text: 'The drive continues.' }];
  const subsequentContent = [{ id: 3, timecode: 't', text: 'Arriving at Silverton soon.' }];

  const block = engine._formatPreflightForChunk(engine.preflightContext, previousContent, batch, subsequentContent);
  assert.ok(block.includes('- BLACKWOOD: Hutan Hitam'), 'Prev-scope match (case-insensitive)');
  assert.ok(block.includes('- Silverton: Bandar Perak'), 'Next-scope match');
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
  assert.ok(block.includes('- Shen Ruoxin → Puan Shen (female lead)'), 'gelaran terkunci dirender seperti biasa');
  assert.ok(block.includes('- Mystery Woman → address NOT LOCKED'), 'null → isyarat NOT LOCKED (fallback lama || name DIBUANG)');
  assert.ok(!block.includes('- Mystery Woman → Mystery Woman'), 'nama mentah TIDAK lagi dijadikan gelaran');
  assert.ok(block.includes('Malay matrix'), 'panduan matriks BM mesti hadir untuk Agent A');
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
