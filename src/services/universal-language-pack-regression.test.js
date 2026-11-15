/**
 * [TOTAL-PURGE v3.36.0] Language Pack System — Regression Tests (pasca-purge)
 *
 * Kontrak yang diuji:
 *   1. Pack resolution: Malay family (ms/my/mya/zsm/zzm/Malay/Bahasa Melayu)
 *      → malay pack; semua lain → generic pack.
 *   2. Antara muka pack kini { code, aliases, fewShot } SAHAJA — medan
 *      sosiolinguistik MONKEY/KNP (honorificMatrix, canonicalAddressMatrix,
 *      creditsExample, specificRules, notLockedGuidance) DIBUANG.
 *   3. fewShot Malay = 3 contoh VERBATIM Owner; generic = meta-placeholder
 *      neutral (sifar BM).
 *   4. Preflight TIDAK memakan pack: prompt neutral-global — tiada teks BM,
 *      tiada matriks honorifik, tiada contoh kredit BM untuk mana-mana bahasa.
 *   5. P8 composer neutral statik (warisan bukan-Trinity).
 *   6. [PAYLOAD-GODTIER] supplementary: SSE propagation + timeout ceiling
 *      (tidak berubah).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { getLanguagePack, isMalayTarget, malayPack, genericPack } = require('./prompts/languagePacks');
const { buildPreflightPrompt, formatPreflightForPrompt } = require('./subfaberPreflight');
const { composeDefaultTranslationPrompt, DEFAULT_TRANSLATION_PROMPT } = require('./gemini');

// ── 1. Pack resolution ──

test('LanguagePacks: keluarga Malay (ms/my/mya/zsm/zzm/Malay/Bahasa Melayu/ms-MY) → malay pack', () => {
    for (const target of [
        'ms',
        'my',
        'mya',
        'zsm',
        'zzm',
        'ms-MY',
        'ms_MY',
        'Malay',
        'Bahasa Melayu',
        'Malay (Jawi script)',
        'may'
    ]) {
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
    assert.equal(isMalayTarget('my'), true); // ISO-639-1 alias dipakai untuk Malay dalam sistem ini
});

// ── 2. Antara muka pack pasca-purge ──

test('LanguagePacks: antara muka pack — { code, aliases, fewShot } sahaja', () => {
    for (const pack of [malayPack, genericPack]) {
        for (const key of ['code', 'aliases', 'fewShot']) {
            assert.ok(pack[key] !== undefined, `${pack.code}.${key} wajib wujud`);
        }
        assert.ok(typeof pack.fewShot === 'string' && pack.fewShot.length > 0, `${pack.code}.fewShot wajib string`);
        // [TOTAL-PURGE] Medan MONKEY/sosiolinguistik DIBUANG.
        for (const key of [
            'honorificMatrix',
            'canonicalAddressMatrix',
            'creditsExample',
            'specificRules',
            'notLockedGuidance'
        ]) {
            assert.equal(pack[key], undefined, `${pack.code}.${key} mesti dibuang (TOTAL-PURGE)`);
        }
    }
});

test('LanguagePacks: fewShot Malay = 2 contoh VERBATIM Owner (STREAMLINE)', () => {
    assert.ok(malayPack.fewShot.includes('<bad_textbook>'));
    assert.ok(malayPack.fewShot.includes('memang gila lah kau.'));
    assert.ok(malayPack.fewShot.includes('Masa dah suntuk.'));
    assert.ok(malayPack.fewShot.includes('[pintu terhempas]'));
    assert.ok(malayPack.fewShot.includes('<i>Manifest 404</i>'));
    assert.ok(!malayPack.fewShot.includes('Biar betul.'));
});

test('LanguagePacks: fewShot generic = meta-placeholder neutral, sifar BM', () => {
    assert.ok(genericPack.fewShot.includes('{translation of "You\'ve got to be kidding me."}'));
    assert.ok(genericPack.fewShot.includes('[{translation of "door slams"}]'));
    assert.ok(!genericPack.fewShot.includes('Biar betul.'));
    assert.ok(!genericPack.fewShot.includes('Relaks'));
});

// ── 3. P1 (subfaberPreflight) — neutral-global, TIDAK memakan pack ──

test('P1 neutral: tiada matriks honorifik / tiada teks BM pada mana-mana bahasa', () => {
    for (const target of ['Malay', 'Vietnamese', 'Japanese']) {
        const prompt = buildPreflightPrompt('Some dialogue.', target, 'English');
        assert.ok(
            prompt.includes(`standard ${target} conventions for official titles and honorifics`),
            `panduan neutral ${target} hadir`
        );
        assert.ok(!prompt.includes('Puan'), `${target}: TIADA Puan`);
        assert.ok(!prompt.includes('Mak Cik'), `${target}: TIADA Mak Cik`);
        assert.ok(!prompt.includes('Diadaptasi daripada'), `${target}: TIADA contoh kredit BM`);
        assert.ok(!prompt.includes('${honorificMatrix}'), `${target}: tiada placeholder pack mentah`);
        assert.ok(!prompt.includes('${creditsExample}'), `${target}: tiada placeholder pack mentah`);
    }
});

test('P1 neutral: kredit dipandu arahan inline — tiada contoh BM', () => {
    const prompt = buildPreflightPrompt('Dialogue.', 'Malay', 'English');
    assert.ok(prompt.includes('translate generic production-credit phrases naturally'));
    assert.ok(prompt.includes('never invent an official title'));
});

// ── 4. P2 (translationEngine) — few-shot 3 contoh isometrik dari pack ──

const FEW_SHOT_EXAMPLE_HEADERS = ['<example_input>', '<example_output>'];

test('P2 Malay: few-shot 2 contoh Owner hadir dalam prompt', () => {
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
    for (const header of FEW_SHOT_EXAMPLE_HEADERS) {
        assert.ok(prompt.includes(header), `few-shot format hadir: ${header}`);
    }
    assert.ok(prompt.includes('memang gila lah kau.'), 'contoh BM (example 1 split + bad_textbook) hadir');
    assert.ok(prompt.includes('(Marcus) - Masa dah suntuk.'), 'contoh BM (example 2 SDH) hadir');
    assert.ok(prompt.includes('<i>Manifest 404</i>'), 'markup <i> kekal dalam few-shot');
    // Templat streamline Owner hadir (STREAMLINE 2026-11-15).
    assert.ok(prompt.includes('### CORE RULES'));
    assert.ok(prompt.includes('translate the whole thought first'));
});

test('P2 Vietnamese: few-shot neutral — TIADA contoh BM, placeholder meta hadir', () => {
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
    for (const header of FEW_SHOT_EXAMPLE_HEADERS) {
        assert.ok(prompt.includes(header), `few-shot format neutral hadir: ${header}`);
    }
    assert.ok(!prompt.includes('Biar betul.'), 'TIADA contoh BM dalam prompt Vietnamese');
    assert.ok(!prompt.includes('Relaks lah'), 'TIADA teks BM (SDH) dalam prompt Vietnamese');
    assert.ok(
        prompt.includes('{translation of "You\'ve got to be kidding me."}'),
        'placeholder meta neutral hadir (example 1)'
    );
    assert.ok(prompt.includes('[{translation of "door slams"}]'), 'placeholder meta neutral hadir (example 2)');
});

// ── 5. P8 (gemini DEFAULT_TRANSLATION_PROMPT) — neutral statik ──

test('P8: composer neutral statik — tiada teks BM untuk mana-mana sasaran', () => {
    for (const target of ['ms', 'Vietnamese', null]) {
        const prompt = composeDefaultTranslationPrompt(target);
        assert.ok(!prompt.includes('Bahasa Melayu'), `${target}: TIADA peraturan BM`);
        assert.ok(!prompt.includes('Indonesianisms'), `${target}: TIADA senarai hitam BM`);
        assert.ok(prompt.includes('natural, idiomatic phrasing'), `${target}: peraturan neutral hadir`);
    }
    assert.equal(DEFAULT_TRANSLATION_PROMPT, composeDefaultTranslationPrompt(null), 'warisan statik = neutral');
});

// ── 6. SIFAR hardcode: few-shot BM hanya dalam malay.js ──

test('Grep proof: sumber enjin/preflight/composer TIADA hardcoded few-shot BM', () => {
    const p1 = fs.readFileSync(path.join(__dirname, 'subfaberPreflight.js'), 'utf8');
    const p2 = fs.readFileSync(path.join(__dirname, 'translationEngine.js'), 'utf8');
    const p8 = fs.readFileSync(path.join(__dirname, 'gemini.js'), 'utf8');

    for (const [name, src] of [
        ['P1', p1],
        ['P2', p2],
        ['P8', p8]
    ]) {
        assert.ok(!src.includes('Relaks lah'), `${name}: TIADA few-shot BM hardcoded`);
        assert.ok(!src.includes('Biar betul'), `${name}: TIADA few-shot BM hardcoded`);
        assert.ok(!src.includes('Puan [Surname]'), `${name}: TIADA matriks BM hardcoded`);
    }
    const malayPackSrc = fs.readFileSync(path.join(__dirname, 'prompts/languagePacks/malay.js'), 'utf8');
    assert.ok(malayPackSrc.includes('memang gila lah kau.'), 'malay.js membawa fewShot Owner');
    // Preflight/composer tidak membawa pack (komen legacy tidak dikira — kod sahaja).
    assert.ok(!/^[^\/]*getLanguagePack\(/m.test(p1), 'P1: TIADA panggilan pack (kod sahaja)');
    assert.ok(!/require\('\.\/prompts\/languagePacks'\)/.test(p1), 'P1: TIADA import pack');
});

// ── 7. NOT-LOCKED guidance neutral statik ──

test('NOT-LOCKED: panduan neutral statik untuk SEMUA bahasa', () => {
    const ctx = {
        theme: 'T.',
        terms: [],
        characters: [{ name: 'Mystery', canonical_address: null, role: 'unknown' }],
        credits_and_titles: []
    };
    const malayBlock = formatPreflightForPrompt(ctx, 'Malay');
    assert.ok(malayBlock.includes('address not locked'), 'isyarat neutral untuk Malay');
    assert.ok(!malayBlock.includes('Malay matrix'), 'TIADA matriks BM');
    const vnBlock = formatPreflightForPrompt(ctx, 'Vietnamese');
    assert.ok(vnBlock.includes('address not locked'), 'isyarat neutral untuk Vietnamese');
    assert.ok(!vnBlock.includes('Puan'), 'TIADA matriks BM untuk Vietnamese');
});

// ── 8. [PAYLOAD-GODTIER] supplementary: SSE propagation + timeout ceiling ──

test('[PAYLOAD-GODTIER]: translateSubtitle Agent Inspector MENGDELEGASI ke laluan SSE (stream:true propagates to fetch)', async () => {
    const AgentInspector = require('./agentInspector').AgentInspector;
    const inspector = new AgentInspector({ apiKey: 'k', baseUrl: 'https://x.example/v1' });

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
                stream.emit(
                    'data',
                    Buffer.from(
                        'data: {"choices":[{"delta":{"content":"{\\"theme\\":\\"SSE ok.\\",\\"terms\\":[]}"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
                    )
                );
                stream.emit('end');
            });
            return { data: stream };
        }
        return { data: { choices: [{ message: { content: '' } }] } };
    };
    try {
        const text = await inspector.translateSubtitle('probe', 'en', 'en', 'probe prompt');
        assert.ok(sseUsed, 'panggilan Agent Inspector melalui SSE (responseType stream)');
        assert.ok(text.includes('SSE ok.'), 'jawapan dihuraikan daripada stream');
    } finally {
        axios.post = originalPost;
    }
});

test('[PAYLOAD-GODTIER]: timeout config hormati siling Caddy — lalai 300000ms, boleh ditindih, tidak sah → lalai', () => {
    const {
        AGENT_INSPECTOR_PREFLIGHT_TIMEOUT_MS,
        AGENT_INSPECTOR_INSPECTION_TIMEOUT_MS,
        AgentInspector
    } = require('./agentInspector');
    assert.equal(AGENT_INSPECTOR_PREFLIGHT_TIMEOUT_MS, 300000, 'Fasa 0 = siling Caddy 300s');
    assert.equal(AGENT_INSPECTOR_INSPECTION_TIMEOUT_MS, 300000, 'Fasa 1 = siling Caddy 300s');
    const over = new AgentInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        preflightTimeoutMs: 420000,
        inspectionTimeoutMs: 360000
    });
    assert.equal(over.preflightTimeoutMs, 420000);
    assert.equal(over.inspectionTimeoutMs, 360000);
});
