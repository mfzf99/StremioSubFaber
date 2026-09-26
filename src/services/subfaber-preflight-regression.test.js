/**
 * SubFaber Pre-Flight Semantic Pass — Regression Tests (Fasa 0)
 *
 * Menggunakan node:test (corak projek). Menguji kontrak dari laporan
 * plans/subfaber-technical-plan-backend.md §3.1 & §4.1:
 *   1. buildPreflightRawText: ekstrak teks tanpa timecode
 *   2. sampleEntriesForPreflight: sampling merata untuk fail besar
 *   3. buildPreflightPrompt: persona VideoLingo + struktur verbatim
 *   4. parsePreflightResponse: JSON rosak/chatter/markdown — tahan lasak
 *   5. runPreflightSemanticPass: non-blocking, skip conditions, progress events
 *   6. formatPreflightForPrompt: blok Content Summary + Points to Note
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runPreflightSemanticPass,
  buildPreflightRawText,
  sampleEntriesForPreflight,
  buildPreflightPrompt,
  MAX_PREFLIGHT_CHARS,
  PREFLIGHT_MAX_INPUT_CHARS,
  parsePreflightResponse,
  formatPreflightForPrompt,
  PREFLIGHT_MAX_TERMS
} = require('./subfaberPreflight');

// Helper: jana entries dummy
function makeEntries(count, textFn) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    timecode: `00:00:${String(i % 60).padStart(2, '0')},000 --> 00:00:${String((i + 1) % 60).padStart(2, '0')},000`,
    text: typeof textFn === 'function' ? textFn(i) : `Dialogue line ${i + 1}`
  }));
}

// --- buildPreflightRawText ---
test('SubFaberPreflight: buildPreflightRawText extracts dialogue text without timecodes', () => {
  const entries = [
    { id: 1, timecode: '00:00:01,000 --> 00:00:02,000', text: 'Hello world.' },
    { id: 2, timecode: '00:00:03,000 --> 00:00:04,000', text: 'Second line.' }
  ];
  const raw = buildPreflightRawText(entries);
  assert.equal(raw, 'Hello world.\nSecond line.');
  assert.ok(!raw.includes('-->'), 'Timecode must NOT be included');
  assert.ok(!raw.includes('00:00'), 'Timestamps must NOT be included');
});

test('SubFaberPreflight: buildPreflightRawText empty/invalid entries return empty string', () => {
  assert.equal(buildPreflightRawText([]), '');
  assert.equal(buildPreflightRawText(null), '');
  assert.equal(buildPreflightRawText([{ id: 1, text: '   ' }]), '');
});

// --- sampleEntriesForPreflight ---
test('SubFaberPreflight: ceiling constant is 250k (mandat headroom 2026-09-26)', () => {
  assert.equal(MAX_PREFLIGHT_CHARS, 250000, 'siling penyerapan = 250,000 aksara (1M token GLM ~5% utilisasi)');
  assert.equal(PREFLIGHT_MAX_INPUT_CHARS, 250000, 'alias warisan sejajar');
});

test('SubFaberPreflight: small files pass through unchanged', () => {
  const entries = makeEntries(50, () => 'A'.repeat(20));
  const sampled = sampleEntriesForPreflight(entries);
  assert.equal(sampled.length, entries.length, 'Small file must not be sampled');
});

test('SubFaberPreflight: file up to 250k chars is absorbed FULLY (mandat headroom 2026-09-26)', () => {
  // 2000 entri × ~110 aksara = ~210k aksara — di bawah siling 250k baharu
  // → TANPA sampling: seluruh jalan cerita diserahkan (watak babak tengah/
  // akhir tidak tercicir lagi). Kes forensik mandat: filem/drama sebenar.
  const entries = makeEntries(2000, (i) => `Baris dialog epik nombor ${i} dengan kandungan naratif penuh keseluruhan babak cereka. `);
  const totalBefore = entries.reduce((s, e) => s + e.text.length, 0);
  assert.ok(totalBefore > 150000, `prasyarat: fail mesti besar (dapat ${totalBefore} aksara)`);
  assert.ok(totalBefore <= 250000, `mesti di bawah siling baharu (dapat ${totalBefore})`);

  const sampled = sampleEntriesForPreflight(entries);
  assert.equal(sampled.length, entries.length, 'FAIL PENUH diserahkan — sampling TIDAK aktif di bawah 250k');
  const raw = buildPreflightRawText(sampled);
  assert.ok(raw.includes(entries[1999].text.trim()), 'baris TERAKHIR (plot akhir) mesti hadir');
  assert.ok(raw.includes(entries[1000].text.trim()), 'baris TENGAH (plot tengah) mesti hadir');
});

test('SubFaberPreflight: sampling hanya aktif melebihi siling 250k (keselamatan ekstrem)', () => {
  // 4000 entri × ~90 aksara = ~360k aksara > 250k siling → sampling aktif
  const entries = makeEntries(4000, (i) => `Baris luar biasa panjang ${i} untuk melepasi siling keselamatan. `);
  const totalBefore = entries.reduce((s, e) => s + e.text.length, 0);
  assert.ok(totalBefore > 250000, `prasyarat: mesti melebihi siling (dapat ${totalBefore})`);

  const sampled = sampleEntriesForPreflight(entries);
  assert.ok(sampled.length < entries.length, 'melebihi 250k → sampling keselamatan aktif');
  // Entry pertama sentiasa kekal untuk kontinuiti plot
  assert.equal(sampled[0].id, entries[0].id, 'First entry always kept');
});

// --- buildPreflightPrompt ---
test('SubFaberPreflight: prompt contains VideoLingo persona + <text> XML wrapper + JSON contract', () => {
  const prompt = buildPreflightPrompt('Some dialogue.', 'Malay', 'English');
  assert.ok(prompt.includes('## Role'), 'Must have Role section');
  assert.ok(prompt.includes('video translation expert and terminology consultant'), 'Must have VideoLingo persona');
  assert.ok(prompt.includes('<text>'), 'Must wrap input in <text> XML tag');
  assert.ok(prompt.includes('</text>'), 'Must close <text> tag');
  assert.ok(prompt.includes('"theme"'), 'Must specify theme in JSON contract');
  assert.ok(prompt.includes('"terms"'), 'Must specify terms in JSON contract');
  assert.ok(prompt.includes('Malay'), 'Must include target language');
  assert.ok(prompt.includes('English'), 'Must include source language');
});

test('SubFaberPreflight: prompt empty source language falls back gracefully', () => {
  const prompt = buildPreflightPrompt('Dialogue.', 'French', '');
  assert.ok(prompt.includes('the source language'), 'Empty source must use generic label');
  assert.ok(prompt.includes('French'), 'Target language preserved');
});

// --- parsePreflightResponse ---
test('SubFaberPreflight: valid JSON parses with theme + terms', () => {
  const response = JSON.stringify({
    theme: 'A story about survival.',
    terms: [
      { src: 'Zhuang Xu', tgt: 'Zhuang Xu', note: 'Male colleague' },
      { src: 'CP Group', tgt: 'CP Group', note: 'Company name' }
    ]
  });
  const parsed = parsePreflightResponse(response);
  assert.ok(parsed, 'Must parse');
  assert.equal(parsed.theme, 'A story about survival.');
  assert.equal(parsed.terms.length, 2);
  assert.equal(parsed.terms[0].src, 'Zhuang Xu');
  assert.equal(parsed.terms[1].note, 'Company name');
});

test('SubFaberPreflight: markdown fences stripped from response', () => {
  const response = '```json\n{"theme": "Story.", "terms": []}\n```';
  const parsed = parsePreflightResponse(response);
  assert.ok(parsed, 'Must parse despite fences');
  assert.equal(parsed.theme, 'Story.');
});

test('SubFaberPreflight: chatter around JSON is stripped', () => {
  const response = 'Here is the analysis you requested:\n{"theme": "Plot.", "terms": [{"src": "Hero", "tgt": "Hero", "note": ""}]}\nHope this helps!';
  const parsed = parsePreflightResponse(response);
  assert.ok(parsed, 'Must parse despite chatter');
  assert.equal(parsed.theme, 'Plot.');
  assert.equal(parsed.terms.length, 1);
});

test('SubFaberPreflight: missing/empty theme returns null', () => {
  assert.equal(parsePreflightResponse('{"terms": []}'), null);
  assert.equal(parsePreflightResponse('{"theme": "", "terms": []}'), null);
  assert.equal(parsePreflightResponse('not json at all'), null);
  assert.equal(parsePreflightResponse(''), null);
  assert.equal(parsePreflightResponse(null), null);
});

test('SubFaberPreflight: invalid term entries filtered, missing tgt defaults to src', () => {
  const response = JSON.stringify({
    theme: 'T.',
    terms: [
      null,
      'not an object',
      { tgt: 'NoSrc' },
      { src: 'Valid', note: 'no tgt field' },
      { src: 'Another', tgt: 'X', note: 'ok' }
    ]
  });
  const parsed = parsePreflightResponse(response);
  assert.equal(parsed.terms.length, 2, 'null/string/missing-src entries filtered');
  assert.equal(parsed.terms[0].src, 'Valid');
  assert.equal(parsed.terms[0].tgt, 'Valid', 'Missing tgt defaults to src');
  assert.equal(parsed.terms[1].tgt, 'X');
});

test(`SubFaberPreflight: terms capped at ${PREFLIGHT_MAX_TERMS}`, () => {
  const manyTerms = Array.from({ length: 30 }, (_, i) => ({ src: `T${i}`, tgt: `T${i}`, note: 'n' }));
  const response = JSON.stringify({ theme: 'T.', terms: manyTerms });
  const parsed = parsePreflightResponse(response);
  assert.equal(parsed.terms.length, PREFLIGHT_MAX_TERMS, `Must cap at ${PREFLIGHT_MAX_TERMS}`);
});

// --- formatPreflightForPrompt ---
test('SubFaberPreflight: formatPreflightForPrompt renders Content Summary + Points to Note', () => {
  const ctx = {
    theme: 'Two-sentence summary here.',
    terms: [
      { src: 'Zhuang Xu', tgt: 'Zhuang Xu', note: 'Male colleague' },
      { src: 'Nie Xiguang', tgt: 'Nie Xiguang', note: 'Female lead' }
    ]
  };
  const block = formatPreflightForPrompt(ctx);
  assert.ok(block.includes('### Content Summary'), 'Must have Content Summary header');
  assert.ok(block.includes('Two-sentence summary here.'), 'Must include theme');
  assert.ok(block.includes('### Points to Note'), 'Must have Points to Note header');
  assert.ok(block.includes('- Zhuang Xu: Zhuang Xu (Male colleague)'), 'Must render term line with note');
  assert.ok(block.includes('- Nie Xiguang: Nie Xiguang (Female lead)'), 'Must render second term');
});

test('SubFaberPreflight: term without note omits parenthetical', () => {
  const block = formatPreflightForPrompt({ theme: 'T.', terms: [{ src: 'A', tgt: 'B', note: '' }] });
  assert.ok(block.includes('- A: B'), 'Term without note must render');
  assert.ok(!block.includes('()'), 'No empty parentheses');
});

test('SubFaberPreflight: null/invalid context returns empty string', () => {
  assert.equal(formatPreflightForPrompt(null), '');
  assert.equal(formatPreflightForPrompt({}), '');
  assert.equal(formatPreflightForPrompt({ theme: '' }), '');
  const noTerms = formatPreflightForPrompt({ theme: 'T', terms: [] });
  assert.equal(noTerms.includes('Points to Note'), false, 'No terms → no Points to Note block');
});

// --- runPreflightSemanticPass (async) ---
test('SubFaberPreflight: skips when entries below minimum', async () => {
  const events = [];
  const provider = { translateSubtitle: async () => { throw new Error('Should not be called'); } };
  const result = await runPreflightSemanticPass(
    makeEntries(5), 'Malay', 'English', provider,
    { onProgress: async (e) => events.push(e) }
  );
  assert.equal(result, null, 'Must return null');
  assert.equal(events.length, 1, 'One event only');
  assert.equal(events[0].status, 'skipped', 'Must emit skipped');
});

test('SubFaberPreflight: skips when no provider available', async () => {
  const events = [];
  const result = await runPreflightSemanticPass(makeEntries(20), 'Malay', 'English', null, {
    onProgress: async (e) => events.push(e)
  });
  assert.equal(result, null);
  assert.equal(events[0].status, 'skipped');
});

test('SubFaberPreflight: success path emits running → done with summary + terms', async () => {
  const events = [];
  const provider = {
    translateSubtitle: async (content, sourceLang, targetLang, prompt) => {
      // Verify contract: prompt contains persona + XML wrapper
      assert.ok(prompt.includes('terminology consultant'), 'Prompt must contain persona');
      assert.ok(prompt.includes('<text>'), 'Prompt must wrap in <text>');
      assert.ok(!content.includes('-->'), 'Content must not contain timecodes');
      return JSON.stringify({
        theme: 'A heist movie.',
        terms: [{ src: 'Boss', tgt: 'Ketua', note: 'Leader' }]
      });
    }
  };
  const result = await runPreflightSemanticPass(makeEntries(30), 'Malay', 'English', provider, {
    onProgress: async (e) => events.push(e)
  });

  assert.ok(result, 'Must return context');
  assert.equal(result.theme, 'A heist movie.');
  assert.equal(result.terms[0].tgt, 'Ketua');
  assert.equal(events.length, 2, 'running + done');
  assert.equal(events[0].status, 'running');
  assert.equal(events[1].status, 'done');
  assert.equal(events[1].summary, 'A heist movie.');
  assert.equal(events[1].terms.length, 1);
  assert.equal(events[1].phase, 'preflight', 'Events must carry phase=preflight');
});

test('SubFaberPreflight: provider failure is non-blocking (null + skipped event)', async () => {
  const events = [];
  const provider = { translateSubtitle: async () => { throw new Error('429 quota exceeded'); } };
  const result = await runPreflightSemanticPass(makeEntries(20), 'Malay', 'English', provider, {
    onProgress: async (e) => events.push(e)
  });
  assert.equal(result, null, 'Failure must return null, not throw');
  assert.equal(events[0].status, 'running');
  assert.equal(events[1].status, 'skipped');
});

test('SubFaberPreflight: malformed AI response degrades to skipped (non-blocking)', async () => {
  const provider = { translateSubtitle: async () => 'I cannot help with that.' };
  const result = await runPreflightSemanticPass(makeEntries(20), 'Malay', 'English', provider);
  assert.equal(result, null, 'Unparseable response must return null');
});

test('SubFaberPreflight: progress callback error does not break the flow', async () => {
  const provider = {
    translateSubtitle: async () => JSON.stringify({ theme: 'OK.', terms: [] })
  };
  // Callback throws — runPreflightSemanticPass must still succeed
  const result = await runPreflightSemanticPass(makeEntries(20), 'Malay', 'English', provider, {
    onProgress: async () => { throw new Error('UI hiccup'); }
  });
  assert.ok(result, 'Must succeed despite callback error');
  assert.equal(result.theme, 'OK.');
});
