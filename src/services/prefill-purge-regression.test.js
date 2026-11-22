/**
 * Prefill Purge & Post-Processing Regression (Mandat Owner 2026-11-22)
 *
 * Tiga pembaikan berfokus, setiap satunya dipin merah-merah sebelum edit:
 *   PP-1 — SIFAR giliran 'model' praisi pada laluan Gemini: user content
 *          berakhir dengan arahan penutup eksplisit (selari OpenAI);
 *          payload = systemInstruction top-level + contents[role 'user']
 *          TUNGGAL (tiada "Task confirmed...", tiada anchor continuation).
 *   PP-2 — buildStreamingProgress menerima stream yang dibuka model sendiri
 *          dengan <answer>\n<s id="N"> tanpa merosakkan slot pertama; tiada
 *          tampalan anchor semasa tag <s> sudah wujud / stream tengah
 *          pembuka <answer>.
 *   PP-3 — Parameter generasi (temperature/topP/thinkingLevel/penalti)
 *          memisahkan kunci cache secara deterministik (Basic/Pro/sandbox).
 *   PP-4 — cleanTranslatedText: entiti quote DI TUKAR (bukan dipadam),
 *          pasangan "..." / “...” dalam ayat dikekalkan, pembalut slot +
 *          dangling quote sahaja dibersihkan, apostrof dalam kata kekal.
 */

const test = require('node:test');
const assert = require('node:assert');
const axios = require('axios');

const TranslationEngine = require('./translationEngine');
const GeminiService = require('./gemini');
const { resolveTrinityPrompt } = require('./prompts/trinity');
const { generateCacheKeys } = require('../utils/cacheKeys');
const { splitStructuredPrompt } = require('./utils/structuredPrompt');
const { __setPromptSandboxForTests, __resetPromptSandboxForTests } = require('../config/promptSandbox');

function makeEngine(opts = {}) {
    const provider = { trinityChannel: 'gemini', translateSubtitle: async () => '' };
    return new TranslationEngine(
        provider,
        'gemini-2.5-flash',
        {},
        {
            trinityMode: 'basic',
            trinityChannel: 'gemini',
            ...opts
        }
    );
}

function batchOf(ids) {
    return ids.map((id, i) => ({
        id,
        timecode: `00:00:0${i},000 --> 00:00:0${i + 1},000`,
        text: `src ${id}`
    }));
}

// ═══════════════════════════════════════════════════════════════════════
// PP-1 — Sifar prefill giliran 'model' pada laluan Gemini
// ═══════════════════════════════════════════════════════════════════════

test('PP-1a: wrapper translation×gemini — arahan eksplisit, sifar prefill continuation', () => {
    const build = resolveTrinityPrompt('translation', 'gemini');
    const out = build({
        systemText: 'SYS TRANSLATION',
        dataText: '<input>\n<s id="11">Hello.</s>\n</input>',
        queryText: '',
        startId: 11
    });
    assert.equal(out.channel, 'gemini');
    assert.equal(out.prefill, undefined, 'medan prefill dibuang — sifar continuation');
    assert.ok(
        !out.userPrompt.trimEnd().endsWith('<s id="11">'),
        'user content TIDAK lagi berakhir dengan anchor continuation'
    );
    assert.ok(
        out.userPrompt
            .trimEnd()
            .endsWith('Begin your output with the <answer> block, starting with the first entry <s id="11">.'),
        'user content berakhir dengan arahan penutup eksplisit (selari OpenAI)'
    );
    assert.ok(!/\n\n<answer>\n<s id="\d+">$/.test(out.userPrompt), 'sifar jahitan <answer> continuation');
});

test('PP-1b: prompt enjin (gemini) berakhir dengan arahan eksplisit pada user lane', () => {
    const engine = makeEngine();
    engine.sourceLanguage = 'English';
    const prompt = engine.createXmlBatchPrompt('<s id="1">Hello.</s>', 'Malay', null, 1, null, 0, 1);
    const parts = splitStructuredPrompt(prompt);
    assert.ok(parts, 'prompt berpecah { system, user }');
    assert.ok(
        parts.user
            .trimEnd()
            .endsWith('Begin your output with the <answer> block, starting with the first entry <s id="1">.'),
        'user part berakhir dengan arahan eksplisit'
    );
    assert.ok(!parts.user.trimEnd().endsWith('<s id="1">'), 'sifar anchor continuation di hujung user part');
});

test('PP-1c: payload wayar — contents role user TUNGGAL, sifar "Task confirmed", systemInstruction top-level', async () => {
    const captured = [];
    const realPost = axios.post;
    const realGet = axios.get;
    axios.get = async () => {
        throw new Error('network disabled');
    };
    axios.post = async (url, body, config = {}) => {
        captured.push({ url: String(url), body });
        return {
            data: {
                candidates: [{ content: { parts: [{ text: '<answer>\n<s id="1">Hai.</s>\n</answer>' }] } }],
                usageMetadata: {}
            }
        };
    };
    try {
        const engine = makeEngine();
        engine.sourceLanguage = 'English';
        const prompt = engine.createXmlBatchPrompt('<s id="1">Hello.</s>', 'Malay', null, 1, null, 0, 1);
        const svc = new GeminiService('AIzaSyPrefillPurgeFake0000000000', 'gemini-2.5-flash', { maxRetries: 0 });
        await svc.translateSubtitle('<s id="1">Hello.</s>', 'detected', 'Malay', prompt);

        const record = captured.find((r) => r.url.includes(':generateContent'));
        assert.ok(record, 'request generateContent ditangkap');
        const { body } = record;
        assert.equal(body.contents.length, 1, 'contents mesti SATU giliran user sahaja');
        assert.equal(body.contents[0].role, 'user', 'giliran tunggal mesti role user');
        assert.ok(!JSON.stringify(body).includes('Task confirmed'), 'sifar teks prefill "Task confirmed"');
        assert.ok(body.systemInstruction?.parts?.[0]?.text, 'systemInstruction kekal top-level');
        assert.ok(
            (body.contents[0].parts[0].text || '').trimEnd().endsWith('starting with the first entry <s id="1">.'),
            'user content penuh (arahan penutup di hujung, TIDAK dipotong)'
        );
    } finally {
        axios.post = realPost;
        axios.get = realGet;
    }
});

// ═══════════════════════════════════════════════════════════════════════
// PP-2 — buildStreamingProgress tanpa prefill
// ═══════════════════════════════════════════════════════════════════════

test('PP-2a: stream bermula <answer>\\n<s id="1"> — slot 1 TIDAK rosak', () => {
    const engine = makeEngine();
    const payload = engine.buildStreamingProgress('<answer>\n<s id="1">Hai.', batchOf([1]));
    assert.ok(payload, 'payload progress wujud');
    assert.ok(payload.partialSRT.includes('Hai.'), 'teks slot 1 hadir');
    assert.ok(!payload.partialSRT.includes('<answer>'), 'sifar <answer> bocor ke progress');
    assert.ok(!payload.partialSRT.includes('<s id="1"><answer>'), 'slot 1 tidak dicemar anchor tampalan');
    assert.ok(!/<s id="1">/.test(payload.partialSRT), 'tiada tag <s> mentah dalam SRT progress');
});

test('PP-2b: stream tengah pembuka <answer> (penuh/terpotong) — TIADA tampalan anchor', () => {
    const engine = makeEngine();
    assert.equal(engine.buildStreamingProgress('<answer>', batchOf([1])), null, '<answer> penuh → null');
    assert.equal(engine.buildStreamingProgress('<answer>\n', batchOf([1])), null, '<answer>\\n → null');
    assert.equal(engine.buildStreamingProgress('<answ', batchOf([1])), null, 'tag terpotong <answ → null');
    assert.equal(engine.buildStreamingProgress('<', batchOf([1])), null, 'tag baru mula < → null');
});

test('PP-2c: markdown fence + <answer> dibersihkan sebelum penguraian slot', () => {
    const engine = makeEngine();
    const payload = engine.buildStreamingProgress(
        '```xml\n<answer>\n<s id="1">Hai.</s>\n<s id="2">Dua.',
        batchOf([1, 2])
    );
    assert.ok(payload, 'payload wujud');
    assert.ok(payload.partialSRT.includes('Hai.'), 'slot 1 utuh');
    assert.ok(payload.partialSRT.includes('Dua.'), 'slot 2 utuh');
    assert.ok(!payload.partialSRT.includes('```'), 'sifar fence');
    assert.ok(!payload.partialSRT.includes('<answer>'), 'sizar <answer>');
});

test('PP-2d: preamble pendek sebelum <s> pertama dibuang (chatter)', () => {
    const engine = makeEngine();
    const payload = engine.buildStreamingProgress(
        'Here is the translation:\n<s id="1">Hai.</s>\n<s id="2">Dua.',
        batchOf([1, 2])
    );
    assert.ok(payload, 'payload wujud');
    assert.ok(payload.partialSRT.includes('Hai.'), 'slot 1 utuh');
    assert.ok(!payload.partialSRT.includes('Here is the translation'), 'chatter dibuang');
});

test('PP-2e: slot pertama tanpa tag pembuka (Rule 7) — anchor tetap dipulihkan', () => {
    const engine = makeEngine();
    const payload = engine.buildStreamingProgress('Hai.</s>\n<s id="2">Dua.', batchOf([1, 2]));
    assert.ok(payload, 'payload wujud');
    assert.ok(payload.partialSRT.includes('Hai.'), 'slot 1 dipulihkan melalui anchor re-attach');
    assert.ok(payload.partialSRT.includes('Dua.'), 'slot 2 utuh');
});

// ═══════════════════════════════════════════════════════════════════════
// PP-3 — Parameter generasi dalam kunci cache
// ═══════════════════════════════════════════════════════════════════════

test('PP-3a: temperature/topP/thinkingLevel berubah → kunci cache berbeza', () => {
    const base = generateCacheKeys(
        { advancedSettings: { temperature: 0.3, topP: 0.95, thinkingLevel: 'low' } },
        'tt9_en',
        'ms'
    );
    const hot = generateCacheKeys(
        { advancedSettings: { temperature: 0.9, topP: 0.95, thinkingLevel: 'low' } },
        'tt9_en',
        'ms'
    );
    const wide = generateCacheKeys(
        { advancedSettings: { temperature: 0.3, topP: 0.8, thinkingLevel: 'low' } },
        'tt9_en',
        'ms'
    );
    const deep = generateCacheKeys(
        { advancedSettings: { temperature: 0.3, topP: 0.95, thinkingLevel: 'high' } },
        'tt9_en',
        'ms'
    );
    assert.notEqual(base.cacheKey, hot.cacheKey, 'temperature berubah → kunci berbeza');
    assert.notEqual(base.cacheKey, wide.cacheKey, 'topP berubah → kunci berbeza');
    assert.notEqual(base.cacheKey, deep.cacheKey, 'thinkingLevel berubah → kunci berbeza');
});

test('PP-3b: konfig tanpa parameter eksplisit kekal kunci legacy byte-identik', () => {
    assert.equal(
        generateCacheKeys({}, 'tt123_en', 'ms').baseKey,
        'tt123_en_ms_trinity-basic-universal-v7_ch-gemini',
        'sifar advancedSettings → kunci lama tidak bercabang'
    );
    const a = generateCacheKeys({ advancedSettings: { temperature: 0.5 } }, 'tt1', 'ms');
    const b = generateCacheKeys({ advancedSettings: { temperature: 0.5 } }, 'tt1', 'ms');
    assert.equal(a.baseKey, b.baseKey, 'nilai eksplisit sama → kunci deterministik sama');
});

test('PP-3c: pemisahan aktif untuk mod Pro dan laluan sandbox', () => {
    const pro = generateCacheKeys({ trinityMode: 'pro', advancedSettings: { temperature: 0.6 } }, 'tt1', 'ms');
    assert.ok(pro.baseKey.includes('trinity-pro-'), 'namespace Pro kekal');
    assert.ok(/_g-t0\.6/.test(pro.baseKey), `segment parameter hadir pada Pro: ${pro.baseKey}`);

    try {
        __setPromptSandboxForTests({
            enabled: true,
            translationSystemTemplate: 'SBX ${fewShot}',
            malayFewShot: null,
            batchSize: null,
            previousContextSize: null,
            futureContextSize: null
        });
        const sbx = generateCacheKeys({ advancedSettings: { topP: 0.7 } }, 'tt1', 'ms');
        assert.ok(sbx.baseKey.includes('-sbx-'), 'namespace sandbox kekal');
        assert.ok(/_g-p0\.7/.test(sbx.baseKey), `segment parameter hadir pada sandbox: ${sbx.baseKey}`);
    } finally {
        __resetPromptSandboxForTests();
    }
});

test('PP-3d: trinity.translation.params mengatasi advancedSettings dalam kunci', () => {
    const viaAdvanced = generateCacheKeys({ advancedSettings: { temperature: 0.2 } }, 'tt1', 'ms');
    const viaTrinity = generateCacheKeys(
        { advancedSettings: { temperature: 0.2 }, trinity: { translation: { params: { temperature: 0.8 } } } },
        'tt1',
        'ms'
    );
    assert.notEqual(viaAdvanced.baseKey, viaTrinity.baseKey, 'override kad Trinity menghasilkan kunci berbeza');
});

// ═══════════════════════════════════════════════════════════════════════
// PP-4 — cleanTranslatedText: pemeliharaan tanda petik berpasangan
// ═══════════════════════════════════════════════════════════════════════

test('PP-4a: pasangan petik berganda dalam ayat dikekalkan', () => {
    const engine = makeEngine();
    const out = engine.cleanTranslatedText('(Duit tu memang "berbaloi".)');
    assert.equal(out, '(Duit tu memang "berbaloi".)', 'pasangan "..." kekal verbatim');
    const curly = engine.cleanTranslatedText('Dia cakap “mantap” tadi.');
    assert.equal(curly, 'Dia cakap “mantap” tadi.', 'pasangan “...” kekal verbatim');
});

test('PP-4b: entiti XML quote ditukar, bukan dipadam', () => {
    const engine = makeEngine();
    const ENT_D = '&' + 'quot;';
    const ENT_A = '&' + 'apos;';
    const out = engine.cleanTranslatedText(`(Duit tu memang ${ENT_D}berbaloi${ENT_D}.)`);
    assert.equal(out, '(Duit tu memang "berbaloi".)', 'entiti quote berganda → " (pasangan kekal)');
    const apos = engine.cleanTranslatedText('Xing' + ENT_A + 'anli');
    assert.equal(apos, 'Xing' + String.fromCharCode(39) + 'anli', 'entiti apos → apostrof dalam kata');
});

test('PP-4c: pembalut keseluruhan slot ditanggalkan hanya bila sumber tidak dibalut', () => {
    const engine = makeEngine();
    assert.equal(
        engine.cleanTranslatedText('"Selamat datang."', 'Welcome.'),
        'Selamat datang.',
        'pembalut luar dibuang (sumber telanjang)'
    );
    assert.equal(
        engine.cleanTranslatedText('"Welcome."', '"Welcome."'),
        '"Welcome."',
        'pembalut dikekalkan bila sumber sendiri dibalut'
    );
    assert.equal(
        engine.cleanTranslatedText('«Bonjour.'),
        'Bonjour.',
        'pembalut sebelah sahaja ditanggalkan (dangling)'
    );
});

test('PP-4d: dangling quote dibersihkan, pasangan kekal', () => {
    const engine = makeEngine();
    assert.equal(
        engine.cleanTranslatedText('Dia kata "sampai jumpa.'),
        'Dia kata sampai jumpa.',
        'pembuka tanpa penutup dibuang'
    );
    assert.equal(engine.cleanTranslatedText('Jumpa nanti"'), 'Jumpa nanti', 'penutup tanpa pembuka dibuang');
    const mixed = engine.cleanTranslatedText('Dia kata "gila" dan "betul.');
    assert.equal(mixed, 'Dia kata "gila" dan betul.', 'pasangan kekal, yang tergantung dibuang');
});

test('PP-4e: apostrof dalam kata kekal terpelihara', () => {
    const engine = makeEngine();
    assert.equal(engine.cleanTranslatedText("Xing'anli"), "Xing'anli", 'apostrof geopolitik kekal');
    assert.equal(engine.cleanTranslatedText("don't stop"), "don't stop", 'kontraksi kekal');
});
