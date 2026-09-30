/**
 * SubFaber Pre-Flight Semantic Pass — Regression Tests (Fasa 0)
 * SKEMA 4-TIANG (Mandat Enjin Pemeriksa DeepSeek & Pre-Flight 4-Tiang,
 * Beta Run 8 2026-09-27)
 *
 * Menggunakan node:test (corak projek). Menguji kontrak dari laporan
 * plans/subfaber-technical-plan-backend.md §3.1 & §4.1:
 *   1. buildPreflightRawText: ekstrak teks tanpa timecode
 *   2. sampleEntriesForPreflight: sampling merata untuk fail besar
 *   3. buildPreflightPrompt: persona VideoLingo + kontrak JSON 4-TIANG
 *      (theme / terms / characters / credits_and_titles)
 *   4. parsePreflightResponse: JSON rosak/chatter/markdown — tahan lasak
 *   5. runPreflightSemanticPass: non-blocking, skip conditions, progress events
 *   6. formatPreflightForPrompt: 4 seksyen tiang (Content Summary +
 *      Technical Glossary + Character Hierarchy + Opening Credits / Titles)
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
  formatPreflightForPrompt
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

// --- BETA RUN 9: Disiplin Bukti (FACT VS INFERENCE) ---
test('SubFaberPreflight: prompt enforces FACT VS INFERENCE DISCIPLINE (no guessing without explicit evidence)', () => {
  const prompt = buildPreflightPrompt('Dialogue.', 'Malay', 'English');
  // Mandat Beta Run 9 (Anti Upstream Error Propagation): larangan meneka
  // wajar hadir verbatim dalam arahan sistem Fasa 0.
  assert.ok(
    prompt.includes('FACT VS INFERENCE DISCIPLINE'),
    'Prompt must carry the FACT VS INFERENCE DISCIPLINE header'
  );
  assert.ok(
    prompt.includes('Only lock a canonical_address'),
    'Prompt must restrict canonical_address locking to explicit evidence'
  );
  assert.ok(
    prompt.includes('EXPLICIT, UNAMBIGUOUS textual evidence'),
    'Prompt must require explicit, unambiguous textual evidence'
  );
  assert.ok(
    prompt.includes('DO NOT GUESS'),
    'Prompt must forbid guessing when gender/hierarchy/title is unclear'
  );
  assert.ok(
    prompt.includes('mark canonical_address as null or omit the character'),
    'Prompt must offer the null/omit escape hatch instead of hallucination'
  );
});

// --- buildPreflightPrompt (SKEMA 4-TIANG) ---
test('SubFaberPreflight: prompt contains VideoLingo persona + <text> XML wrapper + 4-pillar JSON contract', () => {
  const prompt = buildPreflightPrompt('Some dialogue.', 'Malay', 'English');
  assert.ok(prompt.includes('## Role'), 'Must have Role section');
  assert.ok(prompt.includes('video translation expert and terminology consultant'), 'Must have VideoLingo persona');
  assert.ok(prompt.includes('<text>'), 'Must wrap input in <text> XML tag');
  assert.ok(prompt.includes('</text>'), 'Must close <text> tag');
  assert.ok(prompt.includes('"theme"'), 'Must specify theme pillar in JSON contract');
  assert.ok(prompt.includes('"terms"'), 'Must specify terms pillar in JSON contract');
  assert.ok(prompt.includes('"characters"'), 'Must specify characters pillar in JSON contract');
  assert.ok(prompt.includes('"credits_and_titles"'), 'Must specify credits_and_titles pillar in JSON contract');
  assert.ok(prompt.includes('Malay'), 'Must include target language');
  assert.ok(prompt.includes('English'), 'Must include source language');
});

test('SubFaberPreflight: 4-pillar schema stays clean (theme / terms / characters / credits_and_titles) — BETA RUN 9', () => {
  const prompt = buildPreflightPrompt('Dialogue.', 'Malay', 'English');
  assert.ok(prompt.includes('"source"'), 'terms/credits entries must use "source" key');
  assert.ok(prompt.includes('"target"'), 'terms/credits entries must use "target" key');
  assert.ok(prompt.includes('"canonical_address"'), 'characters entries must use "canonical_address" key');
  assert.ok(prompt.includes('"role"'), 'characters entries must use "role" key');
});

// [PREFLIGHT-SLIM v2 2026-09-29] Skema characters: pronoun_register DIGUGURKAN
// (kimi-k3 curl ground-truth: field itu cetus deliberation meleret 9182
// reasoning tokens / 80% output — model teragak "aku/kau vs saya/awak"). TAPI
// direct_address DIPULIHKAN: ia ekstraksi FAKTA (Aunt → Mak Cik dari matriks
// honorifik), BUKAN pilihan subjektif, dan ketiadaannya menyebabkan Agent A
// hentam gelaran third-person (Puan Shen) pada baris vocative (Aunt) — kesan
// sampingan yang disahkan pada run runtime ke-3. canonical_address + anti-
// deliberation (pronoun sahaja) KEKAL.
test('SubFaberPreflight: slim characters schema drops pronoun_register but keeps direct_address + canonical_address', () => {
  const prompt = buildPreflightPrompt('Dialogue.', 'Malay', 'English');
  assert.ok(!prompt.includes('"pronoun_register"'), 'slim: pronoun_register key must NOT be declared (overthinking trigger)');
  assert.ok(prompt.includes('"direct_address"'), 'direct_address (vocative) MUST remain — factual mapping (Aunt → Mak Cik), fixes third-person leak');
  assert.ok(prompt.includes('"canonical_address"'), 'canonical_address (title) MUST remain — fact, not register guessing');
  assert.ok(prompt.includes('THIRD-PERSON reference'), 'canonical_address must be clarified as third-person narrative form');
  assert.ok(prompt.includes('spoken TO face-to-face'), 'direct_address instruction must explain the vocative use');
  assert.ok(prompt.includes('exactly four keys'), 'characters schema must declare exactly four keys (name, canonical_address, direct_address, role)');
  assert.ok(prompt.includes('DECISION DISCIPLINE'), 'slim prompt must carry the anti-deliberation directive');
  assert.ok(/one[- ]?pass|ONE fast pass/i.test(prompt), 'anti-deliberation must instruct a single fast pass');
});

// [REASONING-DISCIPLINE 2026-09-30] Ground-truth curl kimi-k3/glm-5.3 (laporan
// lead coder): model reasoning-heavy membakar bajet completion pada perbandingan
// alternatif internal. Kawalan bukan "DO NOT THINK" tetapi membuang SEBAB
// penaakulan: ban alternative generation + first-answer rule + scope narrowing
// + mechanical final check.
test('SubFaberPreflight: [REASONING-DISCIPLINE] prompt bans alternative/candidate generation (kimi-k3/glm-5.3 control)', () => {
  const prompt = buildPreflightPrompt('Dialogue.', 'Malay', 'English');
  assert.ok(
    prompt.includes('Do NOT generate, compare, or weigh alternative candidates'),
    'Prompt must ban generating/comparing alternatives (strongest lever for reasoning-heavy models)'
  );
  assert.ok(
    prompt.includes('never output A/B alternatives'),
    'Prompt must forbid A/B alternative output'
  );
});

test('SubFaberPreflight: [REASONING-DISCIPLINE] first-evidence-answer rule — no field reconsideration', () => {
  const prompt = buildPreflightPrompt('Dialogue.', 'Malay', 'English');
  assert.ok(
    prompt.includes('use the first explicit, evidence-supported answer and never reconsider it'),
    'Prompt must lock the decision path to the first evidence-supported answer'
  );
  assert.ok(
    prompt.includes('Return ONE answer per field'),
    'Prompt must mandate exactly one answer per field'
  );
});

test('SubFaberPreflight: [REASONING-DISCIPLINE] scope narrowed to pre-flight extraction (NOT translating/rewriting/register)', () => {
  const prompt = buildPreflightPrompt('Dialogue.', 'Malay', 'English');
  assert.ok(
    prompt.includes('PRE-FLIGHT CONTEXT EXTRACTION ONLY'),
    'Prompt must declare the narrow objective up front'
  );
  assert.ok(
    prompt.includes('You are NOT translating the subtitle file'),
    'Prompt must tell the model what it is NOT responsible for (search-space reduction)'
  );
  assert.ok(
    prompt.includes('factual extraction, not stylistic choice'),
    'Prompt must separate fact extraction from wording optimization'
  );
});

test('SubFaberPreflight: [REASONING-DISCIPLINE] mechanical final check + commentary ban', () => {
  const prompt = buildPreflightPrompt('Dialogue.', 'Malay', 'English');
  assert.ok(
    prompt.includes('## FINAL CHECK (mechanical, not re-analysis)'),
    'Prompt must close with a mechanical checklist, not another semantic debate'
  );
  assert.ok(
    prompt.includes('no alternative candidates anywhere'),
    'Final check must mechanically forbid alternatives in output'
  );
  assert.ok(
    prompt.includes('Do not include explanations, notes, justification, warnings, or confidence statements'),
    'Prompt must ban commentary/notes/justification in the final answer'
  );
});

test('SubFaberPreflight: parse preserves direct_address + pronoun_register (null when absent)', () => {
  const response = JSON.stringify({
    theme: 'Family drama.',
    terms: [],
    characters: [
      { name: 'Shen', canonical_address: 'Puan Shen', direct_address: 'Mak Cik Shen', pronoun_register: 'saya/awak', role: 'aunt' },
      { name: 'Lin', canonical_address: 'Encik Lin', role: 'antagonist' }
    ],
    credits_and_titles: []
  });
  const parsed = parsePreflightResponse(response);
  assert.equal(parsed.characters[0].direct_address, 'Mak Cik Shen', 'vocative preserved');
  assert.equal(parsed.characters[0].pronoun_register, 'saya/awak', 'pronoun register preserved');
  assert.equal(parsed.characters[1].direct_address, null, 'absent vocative → null');
  assert.equal(parsed.characters[1].pronoun_register, null, 'absent pronoun register → null');
});

test('SubFaberPreflight: engine renders vocative + pronoun register in Character Hierarchy', () => {
  const TranslationEngine = require('./translationEngine');
  const provider = { translateSubtitle: async () => '', estimateTokenCount: () => 10 };
  const engine = new TranslationEngine(provider, 'gemini-2.5-flash', {}, { providerName: 'gemini' });
  const batch = [{ id: 5, timecode: '00:00:05,000 --> 00:00:06,000', text: 'Shen arrives.' }];
  const block = engine._formatPreflightForChunk(
    {
      theme: 'Drama.',
      terms: [],
      characters: [{ name: 'Shen', canonical_address: 'Puan Shen', direct_address: 'Mak Cik Shen', pronoun_register: 'saya/awak', role: 'aunt' }],
      credits_and_titles: []
    },
    [], batch, [], 'Malay'
  );
  assert.ok(block.includes('direct address: Mak Cik Shen'), 'vocative rendered in Character Hierarchy');
  assert.ok(block.includes('[pronouns: saya/awak]'), 'pronoun register rendered in Character Hierarchy');
});

test('SubFaberPreflight: credits detection directive — Phase 0 engine inspects lines 1-5 for non-dialogue openings', () => {
  const prompt = buildPreflightPrompt('Dialogue.', 'Malay', 'English');
  assert.ok(
    prompt.includes('lines 1-5'),
    'Credits directive must target the earliest lines (1-5)'
  );
  assert.ok(
    prompt.includes('NON-DIALOGUE opening text'),
    'Credits directive must scope to non-dialogue opening text'
  );
  assert.ok(
    prompt.includes('Adapted from'),
    'Credits directive must give the production-credit example (no hardcoded batch rules — Phase 0 only)'
  );
  assert.ok(
    prompt.includes('Diadaptasi daripada'),
    'Credits directive must show the official media-translation example'
  );
  assert.ok(
    prompt.includes("return an empty array [] for 'credits_and_titles'"),
    'Files that start directly with dialogue must yield an empty credits array'
  );
});

test('SubFaberPreflight: prompt empty source language falls back gracefully', () => {
  const prompt = buildPreflightPrompt('Dialogue.', 'French', '');
  assert.ok(prompt.includes('the source language'), 'Empty source must use generic label');
  assert.ok(prompt.includes('French'), 'Target language preserved');
});

// --- parsePreflightResponse ---
test('SubFaberPreflight: valid JSON parses with theme + terms (legacy src/tgt keys normalized)', () => {
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
  assert.equal(parsed.terms[0].source, 'Zhuang Xu');
  assert.equal(parsed.terms[1].note, 'Company name');
});

test('SubFaberPreflight: full 4-pillar JSON parses theme + terms + characters + credits_and_titles', () => {
  const response = JSON.stringify({
    theme: 'A legal family drama about inheritance disputes.',
    terms: [
      { source: 'Zhuang Group', target: 'Kumpulan Zhuang' }
    ],
    characters: [
      { name: 'Shen Ruoxin', canonical_address: 'Puan Shen', role: 'female lead' },
      { name: 'Lin Bo', canonical_address: 'Encik Lin', role: 'antagonist' }
    ],
    credits_and_titles: [
      { source: 'Adapted from the novel', target: 'Diadaptasi daripada novel' }
    ]
  });
  const parsed = parsePreflightResponse(response);
  assert.ok(parsed, '4-pillar payload must parse');
  assert.equal(parsed.theme, 'A legal family drama about inheritance disputes.');
  assert.equal(parsed.terms.length, 1);
  assert.equal(parsed.terms[0].source, 'Zhuang Group');
  assert.equal(parsed.terms[0].target, 'Kumpulan Zhuang');
  assert.equal(parsed.characters.length, 2);
  assert.equal(parsed.characters[0].name, 'Shen Ruoxin');
  assert.equal(parsed.characters[0].canonical_address, 'Puan Shen');
  assert.equal(parsed.characters[1].role, 'antagonist');
  assert.equal(parsed.credits_and_titles.length, 1);
  assert.equal(parsed.credits_and_titles[0].source, 'Adapted from the novel');
  assert.equal(parsed.credits_and_titles[0].target, 'Diadaptasi daripada novel');
});

test('SubFaberPreflight: dialogue-only file yields empty characters/credits arrays (theme still parsed)', () => {
  const response = JSON.stringify({ theme: 'Plain drama.', terms: [], characters: [], credits_and_titles: [] });
  const parsed = parsePreflightResponse(response);
  assert.ok(parsed, 'theme-only payload must parse');
  assert.equal(parsed.characters.length, 0, 'missing characters pillar → empty array');
  assert.equal(parsed.credits_and_titles.length, 0, 'missing credits pillar → empty array');
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
  assert.equal(parsed.terms[0].source, 'Valid');
  assert.equal(parsed.terms[0].target, 'Valid', 'Missing target defaults to source');
  assert.equal(parsed.terms[1].target, 'X');
});

test('SubFaberPreflight: terms are UNBOUNDED — SEMUA istilah dipulangkan (UNBOUNDED-CONTEXT 2026-09-29)', () => {
  // Kes produksi: SRT 759 baris → model mengekstrak 30-80 istilah. Siling lama
  // 15 (VideoLingo) DIGUGURKAN — rantaian pemotongan preflight→inspection
  // menyebabkan Agent B mengaudit atas konteks separuh jelah.
  const manyTerms = Array.from({ length: 30 }, (_, i) => ({ src: `T${i}`, tgt: `T${i}`, note: 'n' }));
  const response = JSON.stringify({ theme: 'T.', terms: manyTerms });
  const parsed = parsePreflightResponse(response);
  assert.equal(parsed.terms.length, 30, 'Tiada siling — SEMUA 30 istilah sah dipulangkan');
  assert.equal(parsed.terms[29].source, 'T29', 'Istilah TERAKHIR hadir (tiada pemotongan)');
});

// --- formatPreflightForPrompt (4 TIANG) ---
test('SubFaberPreflight: formatPreflightForPrompt renders Content Summary + Technical Glossary + Character Hierarchy + Opening Credits', () => {
  const ctx = {
    theme: 'Two-sentence summary here.',
    terms: [
      { source: 'Zhuang Xu', target: 'Zhuang Xu', note: 'Male colleague' },
      { source: 'Nie Xiguang', target: 'Nie Xiguang', note: 'Female lead' }
    ],
    characters: [
      { name: 'Shen Ruoxin', canonical_address: 'Puan Shen', role: 'female lead' }
    ],
    credits_and_titles: [
      { source: 'Adapted from the novel', target: 'Diadaptasi daripada novel' }
    ]
  };
  const block = formatPreflightForPrompt(ctx);
  assert.ok(block.includes('### Content Summary'), 'Must have Content Summary header');
  assert.ok(block.includes('Two-sentence summary here.'), 'Must include theme');
  assert.ok(block.includes('### Technical Glossary'), 'Must have Technical Glossary header (pillar 2)');
  assert.ok(block.includes('- Zhuang Xu: Zhuang Xu (Male colleague)'), 'Must render term line with note');
  assert.ok(block.includes('- Nie Xiguang: Nie Xiguang (Female lead)'), 'Must render second term');
  assert.ok(block.includes('### Character Hierarchy'), 'Must have Character Hierarchy header (pillar 3)');
  assert.ok(block.includes('- Shen Ruoxin → Puan Shen (female lead)'), 'Must render canonical address + role');
  assert.ok(block.includes('### Opening Credits / Titles'), 'Must have Opening Credits header (pillar 4)');
  assert.ok(block.includes('- Adapted from the novel: Diadaptasi daripada novel'), 'Must render credit translation');
});

test('SubFaberPreflight: legacy src/tgt term keys still render via formatPreflightForPrompt', () => {
  const block = formatPreflightForPrompt({
    theme: 'T.',
    terms: [{ src: 'A', tgt: 'B', note: '' }]
  });
  assert.ok(block.includes('- A: B'), 'Legacy-shaped term must render');
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
  assert.equal(noTerms.includes('Technical Glossary'), false, 'No terms → no Technical Glossary block');
});

test('SubFaberPreflight: characters/credits pillars UNBOUNDED — SEMUA entri dipulangkan (UNBOUNDED-CONTEXT 2026-09-29)', () => {
  // Siling lama 12 watak / 10 kredit DIGUGURKAN — drama ensemble besar
  // (20+ watak berulang) mesti sampai penuh kepada enjin dan inspector.
  const manyChars = Array.from({ length: 30 }, (_, i) => ({ name: `C${i}`, canonical_address: `A${i}`, role: 'r' }));
  const manyCredits = Array.from({ length: 30 }, (_, i) => ({ source: `S${i}`, target: `T${i}` }));
  const response = JSON.stringify({
    theme: 'T.',
    characters: manyChars,
    credits_and_titles: manyCredits
  });
  const parsed = parsePreflightResponse(response);
  assert.equal(parsed.characters.length, 30, 'Tiada siling watak (siling lama 12 digugurkan)');
  assert.equal(parsed.credits_and_titles.length, 30, 'Tiada siling kredit (siling lama 10 digugurkan)');
  assert.equal(parsed.characters[29].name, 'C29', 'Watak TERAKHIR hadir');
  assert.equal(parsed.credits_and_titles[29].source, 'S29', 'Kredit TERAKHIR hadir');
});

test('SubFaberPreflight: skala produksi 80 istilah / 20 watak / 20 kredit — PENUH tanpa pemotongan', () => {
  // Simulasi output model bagi SRT drama penuh (759 baris). Kontrak pasca
  // UNBOUNDED-CONTEXT: semua entri sah melintas tanpa ditapis oleh siling.
  const bigTerms = Array.from({ length: 80 }, (_, i) => ({ source: `Term${i}`, target: `Istilah${i}` }));
  const bigChars = Array.from({ length: 20 }, (_, i) => ({ name: `Watak${i}`, canonical_address: null, role: 'r' }));
  const bigCredits = Array.from({ length: 20 }, (_, i) => ({ source: `Credit${i}`, target: `Kredit${i}` }));
  const response = JSON.stringify({
    theme: 'Drama ensemble penuh.',
    terms: bigTerms,
    characters: bigChars,
    credits_and_titles: bigCredits
  });
  const parsed = parsePreflightResponse(response);
  assert.equal(parsed.terms.length, 80, '80 istilah → 80 dipulangkan (bukan 15)');
  assert.equal(parsed.characters.length, 20, '20 watak → 20 dipulangkan (bukan 12)');
  assert.equal(parsed.credits_and_titles.length, 20, '20 kredit → 20 dipulangkan (bukan 10)');
});

test('SubFaberPreflight: malformed character/credit entries are filtered (MANDAT SOSIOLINGUISTIK 2026-09-27)', () => {
  const response = JSON.stringify({
    theme: 'T.',
    characters: [
      null,
      'not an object',
      { canonical_address: 'NoName', role: 'r' },
      { name: 'Solo' },
      { name: 'Full', canonical_address: 'Encik Full', role: 'butler' }
    ],
    credits_and_titles: [
      null,
      { target: 'NoSource' },
      { source: 'Studio Card', target: 'Kad Studio' }
    ]
  });
  const parsed = parsePreflightResponse(response);
  assert.equal(parsed.characters.length, 2, 'null/string/missing-name entries filtered');
  assert.equal(parsed.characters[0].canonical_address, null, 'Missing canonical_address kekal null — isyarat NOT LOCKED dipelihara');
  assert.equal(parsed.characters[1].canonical_address, 'Encik Full');
  assert.equal(parsed.credits_and_titles.length, 1, 'entries without source are filtered');
  assert.equal(parsed.credits_and_titles[0].target, 'Kad Studio');
});

test('SubFaberPreflight: canonical_address null dari model kekal null (tanpa dipaksa menjadi name)', () => {
  const response = JSON.stringify({
    theme: 'T.',
    characters: [
      { name: 'Mystery Woman', canonical_address: null, role: 'unknown' },
      { name: 'Explicit', canonical_address: 'Puan Explicit', role: 'manager' }
    ]
  });
  const parsed = parsePreflightResponse(response);
  assert.equal(parsed.characters.length, 2);
  assert.equal(parsed.characters[0].canonical_address, null, 'null dikekalkan (MANDAT — fallback lama || name DIBUANG)');
  assert.equal(parsed.characters[1].canonical_address, 'Puan Explicit');
});

test('SubFaberPreflight: formatPreflightForPrompt renders NOT LOCKED marker for null canonical_address', () => {
  const block = formatPreflightForPrompt({
    theme: 'T.',
    characters: [
      { name: 'Shen Ruoxin', canonical_address: 'Puan Shen', role: 'female lead' },
      { name: 'Mystery', canonical_address: null, role: 'unknown' }
    ]
  });
  assert.ok(block.includes('- Shen Ruoxin → Puan Shen (female lead)'), 'gelaran terkunci dirender seperti biasa');
  assert.ok(block.includes('- Mystery → address NOT LOCKED'), 'null → isyarat NOT LOCKED (bukan nama mentah)');
  assert.ok(block.includes('Malay matrix'), 'panduan matriks BM mesti hadir untuk Agent A');
});

test('SubFaberPreflight: prompt carries the Malay sociolinguistic honorific matrix (Puan/Cik/Encik/Mak Cik/Pak Cik)', () => {
  const prompt = buildPreflightPrompt('Some dialogue.', 'Malay', 'English');
  assert.ok(prompt.includes('MUST map to "Puan"'), 'aturan wajib Puan bagi wanita dewasa/berkahwin/auntie/pengurus');
  assert.ok(prompt.includes('"Puan [Surname]"'), 'contoh generik Ms. [Surname] -> Puan [Surname] (BUKAN Cik [Surname])');
  assert.ok(prompt.includes('NEVER "Cik [Surname]"'), 'larangan eksplisit Cik [Surname] bagi kes Aunt/manager');
  assert.ok(prompt.includes('young unmarried woman -> "Cik"'), 'aturan Cik bagi wanita muda bujang');
  assert.ok(prompt.includes('"Mr." -> "Encik"'), 'pemetaan Encik');
  assert.ok(prompt.includes('"Aunt" / "Auntie" -> "Mak Cik"'), 'pemetaan Mak Cik');
  assert.ok(prompt.includes('"Uncle" -> "Pak Cik"'), 'pemetaan Pak Cik');
  assert.ok(prompt.includes('"Director" -> "Pengarah"'), 'pemetaan Pengarah');
  assert.ok(prompt.includes('"GM" / "General Manager" -> "Pengurus Besar"'), 'pemetaan Pengurus Besar');
  assert.ok(
    prompt.includes('if the same character is addressed as "Aunt" in dialogue AND called "Ms. [Surname]", lock the formal address as "Puan [Surname]"'),
    'peraturan hubung kait gelaran (Aunt + Ms. -> Puan [Surname]) wajib hadir'
  );
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

test('SubFaberPreflight: success path emits running → done with summary + terms + characters + credits', async () => {
  const events = [];
  const provider = {
    translateSubtitle: async (content, sourceLang, targetLang, prompt) => {
      // Verify contract: prompt contains persona + XML wrapper
      assert.ok(prompt.includes('terminology consultant'), 'Prompt must contain persona');
      assert.ok(prompt.includes('<text>'), 'Prompt must wrap in <text>');
      assert.ok(!content.includes('-->'), 'Content must not contain timecodes');
      return JSON.stringify({
        theme: 'A heist movie.',
        terms: [{ source: 'Boss', target: 'Ketua', note: 'Leader' }],
        characters: [{ name: 'Boss', canonical_address: 'Ketua', role: 'mastermind' }],
        credits_and_titles: []
      });
    }
  };
  const result = await runPreflightSemanticPass(makeEntries(30), 'Malay', 'English', provider, {
    onProgress: async (e) => events.push(e)
  });

  assert.ok(result, 'Must return context');
  assert.equal(result.theme, 'A heist movie.');
  assert.equal(result.terms[0].target, 'Ketua');
  assert.equal(result.characters[0].canonical_address, 'Ketua');
  assert.equal(result.credits_and_titles.length, 0);
  assert.equal(events.length, 2, 'running + done');
  assert.equal(events[0].status, 'running');
  assert.equal(events[1].status, 'done');
  assert.equal(events[1].summary, 'A heist movie.');
  assert.equal(events[1].terms.length, 1);
  assert.equal(events[1].characters.length, 1);
  assert.equal(events[1].credits_and_titles.length, 0);
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
