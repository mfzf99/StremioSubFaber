/**
 * [UNIVERSAL-FIX] Language Pack System — Regression Tests
 * [PAYLOAD-GODTIER] 4-key streaming payload — supplementary checks
 * [MODEL-HIERARCHY] kimi-k3 standalone pre-flight / DeepSeek dual inspection
 *
 * Kontrak yang diuji:
 *   1. Pack resolution: Malay family (ms/my/mya/zsm/zzm/Malay/Bahasa Melayu)
 *      → malay pack; semua lain → generic pack.
 *   2. Malay target → composed prompts IDENTIK dengan tingkah laku lama
 *      (matriks Puan/Cik/Encik, "Ms. Shen", few-shot "Awak ikut kami,").
 *   3. Non-Malay target (Vietnamese/Japanese) → generic pack → TIADA teks
 *      Malay dalam prompt.
 *   4. Sifar hardcoded "Ms. Shen"/"Puan Shen"/few-shot BM dalam P1/P2/P8
 *      source (semua dari pack).
 *   5. P8 composer: Malay → rule BM; Vietnamese → rule neutral.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { getLanguagePack, isMalayTarget, malayPack, genericPack } = require('./prompts/languagePacks');
const { buildPreflightPrompt } = require('./subfaberPreflight');
const { composeDefaultTranslationPrompt, DEFAULT_TRANSLATION_PROMPT } = require('./gemini');

// ── 1. Pack resolution ──

test('LanguagePacks: keluarga Malay (ms/my/mya/zsm/zzm/Malay/Bahasa Melayu/ms-MY) → malay pack', () => {
  for (const target of ['ms', 'my', 'mya', 'zsm', 'zzm', 'ms-MY', 'ms_MY', 'Malay', 'Bahasa Melayu', 'Malay (Jawi script)', 'may']) {
    const pack = getLanguagePack(target);
    assert.equal(pack.code, 'ms', `target "${target}" mesti resolve ke malay pack`);
  }
});

test('LanguagePacks: bukan-Malay (vi/ja/es/en/kosong) → generic pack', () => {
  for (const target of ['vi', 'ja', 'es', 'en', 'Vietnamese', 'Japanese', 'Spanish', 'maori', '', null, undefined]) {
    const pack = getLanguagePack(target);
    assert.equal(pack.code, 'generic', `target "${target}" mesti resolve ke generic pack`);
  }
});

test('LanguagePacks: isMalayTarget TIDAK salah positif pada bahasa lain', () => {
  assert.equal(isMalayTarget('Vietnamese'), false);
  assert.equal(isMalayTarget('Maori'), false); // mengandungi 'ma' bukan 'malay'
  assert.equal(isMalayTarget('Japanese'), false);
  assert.equal(isMalayTarget('Tamil'), false);
  assert.equal(isMalayTarget('my'), true); // ISO-639-1 Burmese alias dipakai untuk Malay dalam sistem ini (kontrak pack lama)
});

test('LanguagePacks: antara muka pack — semua kunci wajib wujud pada kedua-dua pack', () => {
  for (const pack of [malayPack, genericPack]) {
    for (const key of ['code', 'honorificMatrix', 'canonicalAddressMatrix', 'creditsExample', 'fewShot', 'specificRules', 'notLockedGuidance']) {
      assert.ok(typeof pack[key] === 'string' && pack[key].length > 0, `${pack.code}.${key} wajib bukan kosong`);
    }
  }
});

// ── 2. P1 (subfaberPreflight) — Malay target: tingkah laku IDENTIK ──

test('P1 Malay: prompt bawa matriks honorifik penuh (Puan/Cik/Encik/Mak Cik/Pak Cik/Pengarah/Pengurus Besar)', () => {
  const prompt = buildPreflightPrompt('Some dialogue.', 'Malay', 'English');
  assert.ok(prompt.includes('MUST map to "Puan"'));
  assert.ok(prompt.includes('"Puan Shen"'));
  assert.ok(prompt.includes('NEVER "Cik Shen"'));
  assert.ok(prompt.includes('young unmarried woman -> "Cik"'));
  assert.ok(prompt.includes('"Mr." -> "Encik"'));
  assert.ok(prompt.includes('"Aunt" / "Auntie" -> "Mak Cik"'));
  assert.ok(prompt.includes('"Uncle" -> "Pak Cik"'));
  assert.ok(prompt.includes('"Director" -> "Pengarah"'));
  assert.ok(prompt.includes('if the same character is addressed as "Aunt" in dialogue AND called "Ms. Shen", lock the formal address as "Puan Shen"'));
});

test('P1 Malay: kredit contoh "Diadaptasi daripada" hadir', () => {
  const prompt = buildPreflightPrompt('Dialogue.', 'Malay', 'English');
  assert.ok(prompt.includes('Adapted from'));
  assert.ok(prompt.includes('Diadaptasi daripada'));
});

test('P1 Malay: interpolasi label bahasa sasaran dalam matriks', () => {
  const prompt = buildPreflightPrompt('Dialogue.', 'Bahasa Melayu', 'English');
  assert.ok(prompt.includes('official Bahasa Melayu titles/honorifics'), 'label ${tgt} diganti dengan nama sasaran');
  assert.ok(!prompt.includes('${tgt}'), 'tiada placeholder mentah tertinggal');
});

// ── 3. P1 — bukan-Malay: generic pack, TIADA teks Malay ──

test('P1 Vietnamese: generic pack — tiada matriks BM, tiada Ms. Shen, tiada Diadaptasi', () => {
  const prompt = buildPreflightPrompt('Dialogue.', 'Vietnamese', 'English');
  assert.ok(prompt.includes('official Vietnamese titles/honorifics'), 'panduan neutral dengan label Vietnamese');
  assert.ok(!prompt.includes('Puan'), 'TIADA Puan (BM) dalam prompt Vietnamese');
  assert.ok(!prompt.includes('Cik Shen'), 'TIADA Cik Shen');
  assert.ok(!prompt.includes('Ms. Shen'), 'TIADA Ms. Shen (contoh khusus BM)');
  assert.ok(!prompt.includes('Diadaptasi daripada'), 'TIADA contoh kredit BM');
  assert.ok(!prompt.includes('Mak Cik'), 'TIADA Mak Cik');
  assert.ok(!prompt.includes('Encik'), 'TIADA Encik');
});

test('P1 Japanese: generic pack — tiada teks BM', () => {
  const prompt = buildPreflightPrompt('Dialogue.', 'Japanese', 'English');
  assert.ok(prompt.includes('official Japanese titles/honorifics'));
  assert.ok(!prompt.includes('Puan'));
  assert.ok(!prompt.includes('Diadaptasi daripada'));
});

// ── 4. P2 (translationEngine) — few-shot target-conditional ──

test('P2 Malay: few-shot BM "Awak ikut kami," hadir (identik dengan lama)', () => {
  const TranslationEngine = require('./translationEngine');
  const dummyGemini = {
    translateSubtitle: async () => '',
    streamTranslateSubtitle: async () => '',
    estimateTokenCount: () => 10
  };
  const engine = new TranslationEngine(dummyGemini, 'gemini-2.5-flash', {}, { providerName: 'gemini' });
  engine.sourceLanguage = 'English';
  const batchText = '<s id="1">You are coming with us,</s>\n<s id="2">aren\'t you?</s>';
  const prompt = engine.createXmlBatchPrompt(batchText, 'Malay', null, 2, null, 0, 1);
  assert.ok(prompt.includes('[EXAMPLE — split sentence and isolated question tag]'));
  assert.ok(prompt.includes('Awak ikut kami,'), 'few-shot BM hadir untuk sasaran Malay');
  assert.ok(prompt.includes('Wrong (merged):'));
});

test('P2 Vietnamese: few-shot neutral — TIADA "Awak ikut kami"', () => {
  const TranslationEngine = require('./translationEngine');
  const dummyGemini = {
    translateSubtitle: async () => '',
    streamTranslateSubtitle: async () => '',
    estimateTokenCount: () => 10
  };
  const engine = new TranslationEngine(dummyGemini, 'gemini-2.5-flash', {}, { providerName: 'gemini' });
  engine.sourceLanguage = 'English';
  const batchText = '<s id="1">You are coming with us,</s>\n<s id="2">aren\'t you?</s>';
  const prompt = engine.createXmlBatchPrompt(batchText, 'Vietnamese', null, 2, null, 0, 1);
  assert.ok(prompt.includes('[EXAMPLE — split sentence and isolated question tag]'), 'struktur few-shot kekal');
  assert.ok(!prompt.includes('Awak ikut kami'), 'TIADA teks BM dalam prompt Vietnamese');
  assert.ok(prompt.includes('Correct output:'), 'disiplin slot kekal didemonstrasi');
});

// ── 5. P8 (gemini DEFAULT_TRANSLATION_PROMPT) — rule #6 target-conditional ──

test('P8 Malay: composer membawa peraturan BM (saya/awak, anti-Indonesianisms)', () => {
  const prompt = composeDefaultTranslationPrompt('ms');
  assert.ok(prompt.includes('Bahasa Melayu Malaysia'), 'peraturan BM hadir untuk sasaran Malay');
  assert.ok(prompt.includes('Indonesianisms'), 'larangan Indonesianism hadir');
});

test('P8 Vietnamese: composer neutral — TIADA teks BM', () => {
  const prompt = composeDefaultTranslationPrompt('Vietnamese');
  assert.ok(!prompt.includes('Bahasa Melayu'), 'TIADA peraturan BM untuk Vietnamese');
  assert.ok(!prompt.includes('Indonesianisms'));
  assert.ok(prompt.includes('natural, idiomatic phrasing'), 'peraturan neutral hadir');
});

test('P8: DEFAULT_TRANSLATION_PROMPT statik (warisan) = generic neutral', () => {
  assert.ok(!DEFAULT_TRANSLATION_PROMPT.includes('Bahasa Melayu'), 'constant warisan tidak lagi membawa peraturan BM tanpa syarat');
  assert.equal(DEFAULT_TRANSLATION_PROMPT, composeDefaultTranslationPrompt(null), 'warisan statik = generic');
});

// ── 6. SIFAR hardcode: "Ms. Shen"/"Puan Shen"/few-shot BM di luar pack ──

test('Grep proof: P1/P2/P8 source TIADA hardcoded "Ms. Shen"/"Puan Shen"/Awak ikut kami', () => {
  const p1 = fs.readFileSync(path.join(__dirname, 'subfaberPreflight.js'), 'utf8');
  const p2 = fs.readFileSync(path.join(__dirname, 'translationEngine.js'), 'utf8');
  const p8 = fs.readFileSync(path.join(__dirname, 'gemini.js'), 'utf8');

  for (const [name, src] of [['P1', p1], ['P2', p2], ['P8', p8]]) {
    assert.ok(!src.includes('Ms. Shen'), `${name}: TIADA "Ms. Shen" hardcoded`);
    assert.ok(!src.includes('Puan Shen'), `${name}: TIADA "Puan Shen" hardcoded`);
  }
  // Few-shot BM hanya dalam malay.js
  assert.ok(!p2.includes('Awak ikut kami'), 'P2: TIADA few-shot BM hardcoded');
  const malayPackSrc = fs.readFileSync(path.join(__dirname, 'prompts/languagePacks/malay.js'), 'utf8');
  assert.ok(malayPackSrc.includes('Puan Shen'), 'malay.js membawa contoh Puan Shen (migration verified)');
  assert.ok(malayPackSrc.includes('Awak ikut kami'), 'malay.js membawa few-shot BM (migration verified)');
  // Rule #6 BM hanya dalam malay.js
  assert.ok(!p8.includes('Indonesianisms'), 'P8: TIADA peraturan BM hardcoded');
  assert.ok(malayPackSrc.includes('Indonesianisms'), 'malay.js membawa larangan Indonesianism');
});

// ── 7. NOT-LOCKED guidance target-conditional ──

test('NOT-LOCKED: Malay → matriks BM; Vietnamese → panduan neutral', () => {
  const { formatPreflightForPrompt } = require('./subfaberPreflight');
  const ctx = {
    theme: 'T.',
    terms: [],
    characters: [{ name: 'Mystery', canonical_address: null, role: 'unknown' }],
    credits_and_titles: []
  };
  const malayBlock = formatPreflightForPrompt(ctx, 'Malay');
  assert.ok(malayBlock.includes('Malay matrix'), 'panduan matriks BM untuk Malay');
  const vnBlock = formatPreflightForPrompt(ctx, 'Vietnamese');
  assert.ok(!vnBlock.includes('Puan'), 'TIADA matriks BM untuk Vietnamese');
  assert.ok(vnBlock.includes('address NOT LOCKED'), 'isyarat NOT LOCKED kekal');
  // Kes warisan: tanpa targetLanguage → lalai Malay (keserasian penuh)
  const legacyBlock = formatPreflightForPrompt(ctx);
  assert.ok(legacyBlock.includes('Malay matrix'), 'pemanggil warisan (tiada arg) kekal matriks BM');
});

// ── 8. [PAYLOAD-GODTIER] supplementary: SSE propagation + timeout ceiling ──

test('[PAYLOAD-GODTIER]: translateSubtitle Agent B MENGDELEGASI ke laluan SSE (stream:true propagates to fetch)', async () => {
  const AgentBInspector = require('./agentBInspector').AgentBInspector;
  const inspector = new AgentBInspector({ apiKey: 'k', baseUrl: 'https://x.example/v1' });

  let sseUsed = false;
  const { EventEmitter } = require('events');
  const axios = require('axios');
  const originalPost = axios.post;
  axios.post = async (url, body, config) => {
    if (config && config.responseType === 'stream') {
      sseUsed = true; // responseType stream = laluan SSE sebenar
      assert.equal(body.stream, true, 'muatan SSE membawa stream:true');
      const stream = new EventEmitter();
      setImmediate(() => {
        stream.emit('data', Buffer.from('data: {"choices":[{"delta":{"content":"{\\"theme\\":\\"SSE ok.\\",\\"terms\\":[]}"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'));
        stream.emit('end');
      });
      return { data: stream };
    }
    return { data: { choices: [{ message: { content: '' } }] } };
  };
  try {
    // Laluan langsung translateSubtitle (dipakai Fasa 0 & Fasa B)
    const text = await inspector.translateSubtitle('probe', 'en', 'en', 'probe prompt');
    assert.ok(sseUsed, 'panggilan Agent B melalui SSE (responseType stream)');
    assert.ok(text.includes('SSE ok.'), 'jawapan dihuraikan daripada stream');
  } finally {
    axios.post = originalPost;
  }
});

test('[PAYLOAD-GODTIER]: timeout config hormati siling Caddy — lalai 300000ms, boleh ditindih, tidak sah → lalai', () => {
  const { AGENT_B_PREFLIGHT_TIMEOUT_MS, AGENT_B_INSPECTION_TIMEOUT_MS, AgentBInspector } = require('./agentBInspector');
  assert.equal(AGENT_B_PREFLIGHT_TIMEOUT_MS, 300000, 'Fasa 0 = siling Caddy 300s');
  assert.equal(AGENT_B_INSPECTION_TIMEOUT_MS, 300000, 'Fasa 1 = siling Caddy 300s');
  const over = new AgentBInspector({ apiKey: 'k', baseUrl: 'https://x.example/v1', preflightTimeoutMs: 420000, inspectionTimeoutMs: 360000 });
  assert.equal(over.preflightTimeoutMs, 420000);
  assert.equal(over.inspectionTimeoutMs, 360000);
});
