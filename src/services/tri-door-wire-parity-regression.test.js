/**
 * Tri-Door Wire Parity Regression (Mandat Pembaikan K1/K2, H1, M1, M2 — 2026-11-14)
 *
 * Ujian wayar FORENSIK: memandu provider transport SEBENAR (GeminiService,
 * OpenAICompatibleProvider/AgentInspector, AnthropicProvider) dengan HANYA
 * lapisan axios di-mock; setiap url/headers/body muktamad ditangkap sebelum
 * keluar ke rangkaian. Asal: probe audit `.tmp/audit-probe.js` (dibersihkan),
 * kini kontrak regresi tetap.
 *
 * Matriks 12 laluan (3 pintu × [Translation Basic, Translation Pro,
 * Preflight, Inspector]) + 4 titik peralihan (boundary, retry diagnostics,
 * cross-channel fallback, parallel workers).
 *
 * Kontrak wayar yang dikunci:
 *   GEMINI    — systemInstruction top-level; model-turn continuation anchor
 *               EKSKLUSIF Translation (M1: sifar model turn generik pada
 *               agen JSON); sifar parameter haram (topK/minP/repetitionPenalty).
 *   OPENAI    — messages[0] system/developer statik; agent JSON wajib
 *               response_format json_schema strict (H1); agent teks sifar
 *               response_format; sifar assistant prefill.
 *   ANTHROPIC — system akar string; data-first; pembalut idempoten (M2:
 *               <subtitle_text>/<inspection_input> tidak dibalut semula);
 *               sifar assistant prefill; max_tokens integer positif.
 *   INSPECTOR — prompt bersempadan supaya split system/user berlaku pada
 *               KETIGA transport (K1/K2: data <source>/<translation> mesti
 *               di lorong user sahaja, sifar duplikasi).
 */

const test = require('node:test');
const assert = require('node:assert');
const { PassThrough } = require('stream');
const axios = require('axios');

const TranslationEngine = require('./translationEngine');
const GeminiService = require('./gemini');
const AnthropicProvider = require('./providers/anthropic');
const { AgentInspector } = require('./agentInspector');
const { SUBFABER_PROMPT_BOUNDARY, splitStructuredPrompt } = require('./utils/structuredPrompt');
const { injectRetryDiagnostics } = require('./utils/retryDiagnostics');

// ── Mock rangkaian: tangkap setiap request sebelum keluar ─────────────
const captured = [];
const TRANSLATION_XML = '<answer>\n<s id="1">Hai.</s>\n</answer>';
const INSPECTOR_JSON = '{"valid":true,"crimes":[]}';
const PREFLIGHT_JSON = '{"theme":"A story.","terms":[],"characters":[],"credits_and_titles":[]}';

function userTextOf(body) {
    if (Array.isArray(body?.contents)) {
        return body.contents[0]?.parts?.[0]?.text || '';
    }
    if (Array.isArray(body?.messages)) {
        return body.messages[body.messages.length - 1]?.content || '';
    }
    return '';
}

function payloadTextFor(body) {
    const userText = userTextOf(body);
    if (userText.includes('<text>')) return PREFLIGHT_JSON;
    if (userText.includes('<source>')) return INSPECTOR_JSON;
    return TRANSLATION_XML;
}

function sseBody(text) {
    const stream = new PassThrough();
    stream.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
    stream.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
    stream.write('data: [DONE]\n\n');
    stream.end();
    return stream;
}

const realPost = axios.post;
const realGet = axios.get;
axios.get = async () => {
    throw new Error('network disabled in wire tests');
};
axios.post = async (url, body, config = {}) => {
    const record = { url: String(url), headers: config.headers || {}, body };
    captured.push(record);
    const target = String(url);
    const text = payloadTextFor(body);
    if (target.includes(':generateContent')) {
        return {
            data: { candidates: [{ content: { parts: [{ text }] } }], usageMetadata: {} }
        };
    }
    if (target.includes(':streamGenerateContent')) {
        return { data: sseBody(text) };
    }
    if (target.includes('/messages')) {
        return { data: { content: [{ type: 'text', text }] } };
    }
    if (target.includes('/chat/completions') && config.responseType === 'stream') {
        return { data: sseBody(text) };
    }
    if (target.includes('/chat/completions')) {
        return { data: { choices: [{ message: { content: text } }] } };
    }
    if (target.includes(':countTokens')) {
        return { data: { totalTokens: 10 } };
    }
    return { data: {} };
};

function resetCapture() {
    captured.length = 0;
}

const json = (o) => JSON.stringify(o);
const has = (haystack, needle) => String(haystack || '').includes(needle);

function makeGemini() {
    return new GeminiService('AIzaSyWireParityFakeKey00000000', 'gemini-2.5-flash', { maxRetries: 0 });
}

function makeOpenAIInspector(overrides = {}) {
    return new AgentInspector({
        apiKey: 'sk-wire-parity-fake',
        baseUrl: 'https://api.wireparity.test/v1',
        model: 'kimi-k3',
        maxRetries: 0,
        ...overrides
    });
}

function makeAnthropicInspector(overrides = {}) {
    return new AgentInspector({
        apiKey: 'sk-ant-api03-wireparity-fake',
        baseUrl: 'https://api.anthropic.wireparity.test/v1',
        model: 'claude-sonnet-4',
        maxRetries: 0,
        ...overrides
    });
}

function makeGeminiInspector(overrides = {}) {
    return new AgentInspector({
        apiKey: 'AIzaSyWireParityFakeKey00000000',
        baseUrl: 'https://generativelanguage.wireparity.test/v1beta',
        model: 'gemini-2.5-flash',
        maxRetries: 0,
        ...overrides
    });
}

const PREFLIGHT_ENTRIES = Array.from({ length: 12 }, (_, i) => ({ id: i + 1, text: `Line ${i + 1} of dialogue.` }));

function assertNoBoundaryLeak(body, label) {
    assert.ok(!has(json(body), SUBFABER_PROMPT_BOUNDARY), `${label}: sempadan tidak boleh bocor ke wayar`);
}

// ═══════════════════════════════════════════════════════════════════════
// K1 — Inspector × Gemini: lorong bersih, sifar duplikasi, sifar prefill
// ═══════════════════════════════════════════════════════════════════════

test('[WIRE-K1] Inspector×Gemini: data inspection di lorong user sahaja, sifar duplikasi, sifar model turn', async () => {
    const inspector = makeGeminiInspector({ trinityChannel: 'gemini' });
    resetCapture();
    const verdict = await inspector.runSemanticInspection([{ id: 1, text: 'Hello.' }], [{ id: 1, text: 'Hai.' }], {
        batchIndex: 0,
        totalBatches: 1
    });
    assert.ok(verdict, 'inspeksi selesai (fail-open pun kembali)');

    const record = captured.find((r) => r.url.includes(':generateContent'));
    assert.ok(record, 'request generateContent ditangkap');
    const { body } = record;
    assertNoBoundaryLeak(body, 'inspector/gemini');

    const system = body.systemInstruction?.parts?.[0]?.text || '';
    const user = body.contents?.[0]?.parts?.[0]?.text || '';

    // K1a: DATA (baris id|teks) mesti sifar dalam lorong system. Arahan
    // memang menyebut nama tag <source>/<translation> sebagai dokumentasi
    // kontrak — penanda data sebenar ialah baris "1|Hello." / "1|Hai.".
    assert.ok(!has(system, '1|Hello.'), 'K1a: baris data source HARAM dalam systemInstruction');
    assert.ok(!has(system, '1|Hai.'), 'K1a: baris data translation HARAM dalam systemInstruction');
    assert.ok(has(system, 'Respond with ONLY this JSON'), 'system membawa INSPECTOR_INSTRUCTION');

    // K1b: sifar duplikasi — '## Input' muncul tepat sekali pada keseluruhan payload.
    const occurrences = (system.match(/## Input/g) || []).length + (user.match(/## Input/g) || []).length;
    assert.equal(occurrences, 1, `K1b: sifar duplikasi (mendapat ${occurrences})`);

    assert.ok(has(user, '<source>'), 'data <source> berada dalam lorong user');
    assert.ok(has(user, '<translation>'), 'data <translation> berada dalam lorong user');
    assert.ok(/Respond with ONLY the JSON now\.$/.test(user.trimEnd()), 'arahan JSON di hujung user content');

    // Sifar continuation anchor / prefill generik pada agen JSON.
    assert.ok(!has(user, '<answer>'), 'sifar anchor <answer> pada agen JSON');
    assert.equal(body.contents.length, 1, 'M1: giliran user TUNGGAL — tiada model turn generik');
    assert.equal(body.contents[0].role, 'user');
});

// ═══════════════════════════════════════════════════════════════════════
// K2 — Inspector × Anthropic: system akar bersih, sifar duplikasi
// ═══════════════════════════════════════════════════════════════════════

test('[WIRE-K2] Inspector×Anthropic: system akar = arahan sahaja, <inspection_input> tunggal, sifar duplikasi', async () => {
    const inspector = makeAnthropicInspector({ trinityChannel: 'anthropic' });
    resetCapture();
    await inspector.runSemanticInspection([{ id: 1, text: 'Hello.' }], [{ id: 1, text: 'Hai.' }], {
        batchIndex: 0,
        totalBatches: 1
    });

    const record = captured.find((r) => r.url.includes('/messages'));
    assert.ok(record, 'request /messages ditangkap');
    const { body } = record;
    assertNoBoundaryLeak(body, 'inspector/anthropic');

    // K2a: DATA (baris id|teks) mesti sifar dalam medan system akar; nama tag
    // dalam arahan ialah dokumentasi kontrak, bukan data.
    assert.ok(!has(body.system, '1|Hello.'), 'K2a: baris data source HARAM dalam medan system');
    assert.ok(!has(body.system, '1|Hai.'), 'K2a: baris data translation HARAM dalam medan system');
    assert.ok(has(body.system, 'Respond with ONLY this JSON'), 'system membawa INSPECTOR_INSTRUCTION');

    const user = body.messages?.[0]?.content || '';
    assert.ok(has(user, '<inspection_input>'), 'pembatas <inspection_input> hadir dalam user');
    assert.ok(has(user, '<source>'), 'data <source> berada dalam lorong user');
    assert.ok(/Respond with ONLY the JSON now\.$/.test(user.trimEnd()), 'arahan JSON di hujung user content');

    // K2b: sifar duplikasi.
    const occurrences =
        (String(body.system || '').match(/## Input/g) || []).length + (user.match(/## Input/g) || []).length;
    assert.equal(occurrences, 1, `K2b: sifar duplikasi (mendapat ${occurrences})`);

    // Sifar assistant prefill; max_tokens integer positif; header rasmi.
    const roles = body.messages.map((m) => m.role);
    assert.deepEqual(roles, ['user'], 'giliran user tunggal, sifar assistant prefill');
    assert.ok(Number.isInteger(body.max_tokens) && body.max_tokens > 0, 'max_tokens integer positif');
    assert.equal(record.headers['anthropic-version'], '2023-06-01');
    assert.ok(record.headers['x-api-key'], 'header x-api-key hadir');
});

// ═══════════════════════════════════════════════════════════════════════
// K1B — Inspector × OpenAI: dua lorong mesej + response_format strict
// ═══════════════════════════════════════════════════════════════════════

test('[WIRE-K1B] Inspector×OpenAI: messages[0]=system arahan, messages[1]=user data, json_schema strict', async () => {
    const inspector = makeOpenAIInspector({ trinityChannel: 'openai' });
    resetCapture();
    await inspector.runSemanticInspection([{ id: 1, text: 'Hello.' }], [{ id: 1, text: 'Hai.' }], {
        batchIndex: 0,
        totalBatches: 1
    });

    const record = captured.find((r) => r.url.includes('/chat/completions'));
    assert.ok(record, 'request chat/completions ditangkap');
    const { body } = record;
    assertNoBoundaryLeak(body, 'inspector/openai');

    const [m0, m1] = body.messages || [];
    assert.equal(m0?.role, 'system', 'messages[0] mesti role system (arahan statik)');
    assert.ok(has(m0?.content, 'Respond with ONLY this JSON'), 'messages[0] membawa INSPECTOR_INSTRUCTION');
    assert.ok(!has(m0?.content, '1|Hello.'), 'baris data HARAM dalam messages[0]');
    assert.ok(!has(m0?.content, '1|Hai.'), 'baris data terjemahan HARAM dalam messages[0]');

    assert.equal(m1?.role, 'user', 'messages[1] mesti role user');
    assert.ok(has(m1?.content, '<source>'), 'data <source> dalam lorong user');
    assert.ok(has(m1?.content, '<translation>'), 'data <translation> dalam lorong user');

    const occurrences =
        (String(m0?.content || '').match(/## Input/g) || []).length +
        (String(m1?.content || '').match(/## Input/g) || []).length;
    assert.equal(occurrences, 1, `sifar duplikasi (mendapat ${occurrences})`);

    assert.ok(!body.messages.some((m) => m.role === 'assistant'), 'sifar assistant prefill');
    assert.equal(body.response_format?.type, 'json_schema', 'agent JSON wajib response_format json_schema');
    assert.equal(body.response_format?.json_schema?.strict, true, 'json_schema strict:true');
});

// ═══════════════════════════════════════════════════════════════════════
// H1 — Preflight × OpenAI: response_format json_schema strict di wayar
// ═══════════════════════════════════════════════════════════════════════

test('[WIRE-H1] Preflight×OpenAI: response_format json_schema strict hadir + lorong bersih', async () => {
    const inspector = makeOpenAIInspector({ preflightModel: 'kimi-k3', trinityChannel: 'openai' });
    resetCapture();
    const context = await inspector.runPreflightPass(PREFLIGHT_ENTRIES, 'Malay', 'English', {});

    const record = captured.find((r) => r.url.includes('/chat/completions'));
    assert.ok(record, 'request chat/completions ditangkap');
    const { body } = record;
    assertNoBoundaryLeak(body, 'preflight/openai');

    assert.equal(
        body.response_format?.type,
        'json_schema',
        'H1: preflight wajib response_format json_schema (mazhab rasmi OpenAI)'
    );
    assert.equal(body.response_format?.json_schema?.strict, true, 'H1: json_schema strict:true');
    assert.equal(
        body.response_format?.json_schema?.name,
        'subfaber_preflight_context',
        'H1: skema kanonik preflight digunakan'
    );

    const [m0, m1] = body.messages || [];
    assert.equal(m0?.role, 'system', 'messages[0] role system');
    assert.ok(has(m0?.content, '## Role'), 'system membawa arahan statik preflight');
    assert.ok(!has(m0?.content, 'Line 1 of dialogue'), 'data dialog HARAM dalam system');
    assert.ok(has(m1?.content, '<text>'), 'user membawa data <text>');
    assert.ok(
        /Apply the tasks above to this subtitle dialogue and return ONLY the JSON object\.$/.test(
            String(m1?.content || '').trimEnd()
        ),
        'arahan penutup JSON di hujung user'
    );
    assert.ok(context === null || typeof context === 'object', 'preflight tidak melempar');
});

// ═══════════════════════════════════════════════════════════════════════
// M1 — Preflight × Gemini: giliran user tunggal, sifar model turn generik
// ═══════════════════════════════════════════════════════════════════════

test('[WIRE-M1] Preflight×Gemini: sifar model turn generik pada agen JSON; anchor Translation kekal eksklusif', async () => {
    const inspector = makeGeminiInspector({ preflightModel: 'gemini-2.5-flash', trinityChannel: 'gemini' });
    resetCapture();
    await inspector.runPreflightPass(PREFLIGHT_ENTRIES, 'Malay', 'English', {});

    const record = captured.find((r) => r.url.includes(':generateContent'));
    assert.ok(record, 'request generateContent ditangkap');
    const { body } = record;
    assertNoBoundaryLeak(body, 'preflight/gemini');

    assert.ok(!has(json(body), 'Task confirmed'), 'M1: sifar prefill generik "Task confirmed"');
    assert.equal(body.contents.length, 1, 'M1: giliran user TUNGGAL');
    assert.equal(body.contents[0].role, 'user');

    const system = body.systemInstruction?.parts?.[0]?.text || '';
    const user = body.contents[0]?.parts?.[0]?.text || '';
    assert.ok(has(system, '## Role'), 'systemInstruction membawa arahan statik');
    assert.ok(!has(system, 'Line 1 of dialogue'), 'data dialog HARAM dalam systemInstruction');
    assert.ok(user.startsWith('<text>'), 'user membuka dengan data <text>');
    assert.ok(!has(user, '<answer>'), 'sifar anchor <answer> pada agen JSON');

    // Bahagian 2 — kontrak M1 pada laluan TRANSLATION: model turn hanya wujud
    // bila anchor ditemui (regression pin bagi gelag yang sah).
    const engine = new TranslationEngine(
        makeGemini(),
        'gemini-2.5-flash',
        {},
        {
            trinityMode: 'basic',
            trinityChannel: 'gemini'
        }
    );
    engine.sourceLanguage = 'English';
    const prompt = engine.createXmlBatchPrompt('<s id="1">Hello.</s>', 'Malay', null, 1, null, 0, 1);
    resetCapture();
    await makeGemini().translateSubtitle('<s id="1">Hello.</s>', 'detected', 'Malay', prompt);
    const translationRecord = captured.find((r) => r.url.includes(':generateContent'));
    assert.ok(translationRecord, 'request translation ditangkap');
    const tBody = translationRecord.body;
    assert.equal(tBody.contents.length, 2, 'Translation: model turn continuation aktif bila anchor dijumpai');
    assert.equal(tBody.contents[1]?.role, 'model', 'giliran model pembawa anchor');
    assert.ok(
        /<s id="1">\s*$/.test(tBody.contents[1]?.parts?.[0]?.text || ''),
        'model turn berakhir dengan anchor slot pertama'
    );
});

// ═══════════════════════════════════════════════════════════════════════
// M2 — Preflight × Anthropic: pembalut idempoten, sifar dwi-pembatas
// ═══════════════════════════════════════════════════════════════════════

test('[WIRE-M2] Preflight×Anthropic: <subtitle_text> tidak dibalut semula dalam <subtitle_input>', async () => {
    const inspector = makeAnthropicInspector({ preflightModel: 'claude-sonnet-4', trinityChannel: 'anthropic' });
    resetCapture();
    await inspector.runPreflightPass(PREFLIGHT_ENTRIES, 'Malay', 'English', {});

    const record = captured.find((r) => r.url.includes('/messages'));
    assert.ok(record, 'request /messages ditangkap');
    const { body } = record;
    assertNoBoundaryLeak(body, 'preflight/anthropic');

    const user = body.messages?.[0]?.content || '';
    assert.ok(has(user, '<subtitle_text>'), 'pembatas <subtitle_text> (wrapper preflight anthropic) hadir');
    assert.ok(
        !has(user, '<subtitle_input>'),
        'M2: sifar dwi-pembatas — <subtitle_input> HARAM membalut <subtitle_text>'
    );
    assert.ok(!has(body.system, 'Line 1 of dialogue'), 'data dialog HARAM dalam system akar');
    assert.ok(has(body.system, '## Role'), 'system akar membawa arahan statik');
    assert.ok(
        /Apply the tasks above to this subtitle dialogue and return ONLY the JSON object\.$/.test(user.trimEnd()),
        'arahan penutup JSON di hujung user'
    );
    const roles = body.messages.map((m) => m.role);
    assert.deepEqual(roles, ['user'], 'giliran user tunggal, sifar assistant prefill');
});

// ═══════════════════════════════════════════════════════════════════════
// MATRIKS — Translation × Gemini (Basic + Pro)
// ═══════════════════════════════════════════════════════════════════════

test('[WIRE-MATRIX-GEMINI] Translation Basic+Pro × Gemini: systemInstruction top-level, anchor continuation, sifar parameter haram', async () => {
    for (const mode of ['basic', 'pro']) {
        const provider = makeGemini();
        const engine = new TranslationEngine(
            provider,
            'gemini-2.5-flash',
            {},
            {
                trinityMode: mode,
                trinityChannel: 'gemini'
            }
        );
        engine.sourceLanguage = 'English';
        const prompt = engine.createXmlBatchPrompt('<s id="1">Hello.</s>', 'Malay', null, 1, null, 0, 1);
        resetCapture();
        await provider.translateSubtitle('<s id="1">Hello.</s>', 'detected', 'Malay', prompt);

        const record = captured.find((r) => r.url.includes(':generateContent'));
        assert.ok(record, `[${mode}] request ditangkap`);
        const { body, headers, url } = record;
        assertNoBoundaryLeak(body, `translation/${mode}/gemini`);

        const system = body.systemInstruction?.parts?.[0]?.text || '';
        assert.ok(system, `[${mode}] systemInstruction top-level hadir`);
        assert.ok(!has(system, '<s id="1">Hello'), `[${mode}] lorong system bersih daripada data`);
        if (mode === 'basic') {
            assert.ok(has(system, 'STRICT 1:1 SLOT PARITY'), `[${mode}] templat universal Basic`);
            assert.ok(!has(system, 'Spoken Malaysian Cadence'), `[${mode}] sifar suntikan pack dalam Basic`);
        } else {
            assert.ok(has(system, 'ANTI-MERGE'), `[${mode}] templat Pro hadir`);
        }

        const user = body.contents[0]?.parts?.[0]?.text || '';
        assert.ok(has(user, '<input>'), `[${mode}] user membawa <input>`);
        assert.equal(
            has(user, 'Required output ids in exact order'),
            mode === 'basic',
            `[${mode}] manifest ID mengikut mod`
        );

        assert.equal(body.contents.length, 2, `[${mode}] model turn continuation aktif`);
        assert.equal(body.contents[1]?.role, 'model');
        assert.ok(
            /<s id="1">\s*$/.test(body.contents[1]?.parts?.[0]?.text || ''),
            `[${mode}] model turn berakhir dengan anchor`
        );
        assert.ok(!/<s id="1">\s*$/.test(user), `[${mode}] anchor telah dialih keluar dari user`);

        const generationConfig = body.generationConfig || {};
        for (const forbidden of ['topK', 'minP', 'repetitionPenalty', 'topKEnabled']) {
            assert.ok(!(forbidden in generationConfig), `[${mode}] parameter haram ${forbidden} sifar`);
        }
        assert.ok(headers['x-goog-api-key'], `[${mode}] header x-goog-api-key`);
        assert.ok(!has(url, 'AIzaSy'), `[${mode}] kunci tidak terdedah dalam URL`);
    }
});

// ═══════════════════════════════════════════════════════════════════════
// MATRIKS — Translation × OpenAI (Basic + Pro)
// ═══════════════════════════════════════════════════════════════════════

test('[WIRE-MATRIX-OPENAI] Translation Basic+Pro × OpenAI: dua lorong mesej, arahan eksplisit, sifar response_format', async () => {
    const provider = makeOpenAIInspector();
    for (const mode of ['basic', 'pro']) {
        const engine = new TranslationEngine(
            provider,
            'gemini-2.5-flash',
            {},
            {
                trinityMode: mode,
                trinityChannel: 'openai'
            }
        );
        engine.sourceLanguage = 'English';
        const prompt = engine.createXmlBatchPrompt('<s id="1">Hello.</s>', 'Malay', null, 1, null, 0, 1);
        resetCapture();
        await provider.translateSubtitle('<s id="1">Hello.</s>', 'detected', 'Malay', prompt);

        const record = captured.find((r) => r.url.includes('/chat/completions'));
        assert.ok(record, `[${mode}] request ditangkap`);
        const { body, headers } = record;
        assertNoBoundaryLeak(body, `translation/${mode}/openai`);

        const [m0, m1] = body.messages || [];
        assert.equal(m0?.role, 'system', `[${mode}] messages[0] role system`);
        assert.ok(!has(m1?.content, 'STRICT 1:1 SLOT PARITY'), `[${mode}] arahan tidak bocor ke user`);
        assert.ok(has(m1?.content, '<input>'), `[${mode}] user membawa <input>`);
        assert.equal(
            has(m1?.content, 'Required output ids in exact order'),
            mode === 'basic',
            `[${mode}] manifest ID mengikut mod`
        );
        assert.ok(
            has(m1?.content, 'Begin your output with the <answer> block'),
            `[${mode}] arahan anchor eksplisit di hujung user`
        );
        assert.ok(!body.messages.some((m) => m.role === 'assistant'), `[${mode}] sifar assistant prefill`);
        assert.ok(!('response_format' in body), `[${mode}] agent teks: sifar response_format`);
        assert.ok(String(headers.Authorization || '').includes('Bearer'), `[${mode}] auth Bearer`);
    }
});

// ═══════════════════════════════════════════════════════════════════════
// MATRIKS — Translation × Anthropic (Basic + Pro)
// ═══════════════════════════════════════════════════════════════════════

test('[WIRE-MATRIX-ANTHROPIC] Translation Basic+Pro × Anthropic: system akar, data-first, sifar prefill', async () => {
    const provider = new AnthropicProvider({
        apiKey: 'sk-ant-api03-wireparity-fake',
        baseUrl: 'https://api.anthropic.wireparity.test/v1',
        model: 'claude-sonnet-4',
        providerName: 'anthropic',
        enableJsonOutput: false,
        maxRetries: 0
    });
    for (const mode of ['basic', 'pro']) {
        const engine = new TranslationEngine(
            provider,
            'gemini-2.5-flash',
            {},
            {
                trinityMode: mode,
                trinityChannel: 'anthropic'
            }
        );
        engine.sourceLanguage = 'English';
        const prompt = engine.createXmlBatchPrompt('<s id="1">Hello.</s>', 'Malay', null, 1, null, 0, 1);
        resetCapture();
        await provider.translateSubtitle('<s id="1">Hello.</s>', 'detected', 'Malay', prompt);

        const record = captured.find((r) => r.url.includes('/messages'));
        assert.ok(record, `[${mode}] request ditangkap`);
        const { body, headers } = record;
        assertNoBoundaryLeak(body, `translation/${mode}/anthropic`);

        assert.equal(typeof body.system, 'string', `[${mode}] system akar string`);
        assert.ok(!has(body.system, '<s id="1">Hello'), `[${mode}] lorong system bersih daripada data`);
        assert.ok(!body.messages.some((m) => m.role === 'system'), `[${mode}] sifar mesej system dalam array`);
        assert.equal(body.messages.length, 1, `[${mode}] giliran user tunggal`);
        assert.ok(!body.messages.some((m) => m.role === 'assistant'), `[${mode}] sifar assistant prefill`);

        const user = body.messages[0]?.content || '';
        assert.ok(has(user, '<subtitle_input>'), `[${mode}] pembalut data-first hadir`);
        assert.ok(has(user, '<input>'), `[${mode}] user membawa <input>`);
        assert.ok(
            /Write your answer inside a single <answer> block:.*beginning with <s id="1">\.$/.test(user.trimEnd()),
            `[${mode}] arahan format <answer> di hujung user`
        );
        assert.ok(Number.isInteger(body.max_tokens) && body.max_tokens > 0, `[${mode}] max_tokens positif`);
        assert.equal(headers['anthropic-version'], '2023-06-01', `[${mode}] header anthropic-version`);
        assert.ok(headers['x-api-key'], `[${mode}] header x-api-key`);
    }
});

// ═══════════════════════════════════════════════════════════════════════
// T2 — Retry diagnostics: lorong user sahaja, sebelum anchor/arahan
// ═══════════════════════════════════════════════════════════════════════

test('[WIRE-T-RETRY] Diagnostics retry di lorong user, sebelum anchor/arahan, pada ketiga-tiga pintu', () => {
    const block =
        '\n\nRETRY REPAIRS\nID 1 (VERBATIM_UNTRANSLATED)\n\nVERIFIED SLOTS (keep verbatim)\n<s id="2">Baik</s>';
    const geminiPrompt = `STATIC SYSTEM\n\n${SUBFABER_PROMPT_BOUNDARY}\n\n<input>\n<s id="1">Hello.</s>\n</input>\n\n<answer>\n<s id="1">`;
    const openaiPrompt = `STATIC SYSTEM\n\n${SUBFABER_PROMPT_BOUNDARY}\n\n<input>\n<s id="1">Hello.</s>\n</input>\n\nBegin your output with the <answer> block, starting with the first entry <s id="1">.`;
    const anthropicPrompt = `STATIC SYSTEM\n\n${SUBFABER_PROMPT_BOUNDARY}\n\n<subtitle_input>\n<s id="1">Hello.</s>\n</subtitle_input>\n\nWrite your answer inside a single <answer> block: one <s id="N"> per input id, same ids, same order, beginning with <s id="1">.`;

    for (const [door, prompt] of [
        ['gemini', geminiPrompt],
        ['openai', openaiPrompt],
        ['anthropic', anthropicPrompt]
    ]) {
        const injected = injectRetryDiagnostics(prompt, block);
        const parts = splitStructuredPrompt(injected);
        assert.ok(parts, `[${door}] prompt kekal bersempadan selepas suntikan`);
        assert.ok(!has(parts.system, 'VERIFIED SLOTS'), `[${door}] diagnostik HARAM dalam lorong system`);
        assert.ok(has(parts.user, 'VERIFIED SLOTS'), `[${door}] diagnostik hadir dalam lorong user`);
        const anchorToken =
            door === 'gemini' ? '\n\n<answer>' : door === 'openai' ? 'Begin your output' : 'Write your answer';
        assert.ok(
            injected.indexOf(block) < injected.lastIndexOf(anchorToken),
            `[${door}] diagnostik berada SEBELUM anchor/arahan`
        );
    }
});

// ═══════════════════════════════════════════════════════════════════════
// T3 — Cross-channel fallback: pembungkusan semula mengikut pintu fallback
// ═══════════════════════════════════════════════════════════════════════

test('[WIRE-T-FALLBACK] Gemini→Anthropic: fallback di-bungkus semula mengikut kontrak pintu anthropic', async () => {
    const primary = makeGemini();
    const fallback = new AnthropicProvider({
        apiKey: 'sk-ant-api03-wireparity-fake',
        baseUrl: 'https://api.anthropic.wireparity.test/v1',
        model: 'claude-sonnet-4',
        providerName: 'anthropic',
        enableJsonOutput: false,
        maxRetries: 0
    });
    // Pariti harness dengan fallback-rewrap-regression: laluan bukan-stream.
    primary.streamTranslateSubtitle = undefined;
    fallback.streamTranslateSubtitle = undefined;

    axios.post = async (url, body, config = {}) => {
        if (String(url).includes(':generateContent')) {
            const err = new Error('Simulated primary 500');
            err.response = { status: 500, data: {} };
            throw err;
        }
        const record = { url: String(url), headers: config.headers || {}, body };
        captured.push(record);
        const target = String(url);
        const text = payloadTextFor(body);
        if (target.includes('/messages')) {
            return { data: { content: [{ type: 'text', text }] } };
        }
        if (target.includes(':countTokens')) {
            return { data: { totalTokens: 10 } };
        }
        return { data: {} };
    };

    try {
        const engine = new TranslationEngine(
            { primary, fallback },
            'gemini-2.5-flash',
            {},
            {
                providerName: 'gemini',
                fallbackProviderName: 'anthropic',
                trinityChannel: 'gemini',
                trinityMode: 'basic'
            }
        );
        resetCapture();
        await engine.translateSubtitle('1\n00:00:01,000 --> 00:00:02,000\nHello.\n', 'Malay', null, null, 'English');

        const record = captured.find((r) => r.url.includes('/messages'));
        assert.ok(record, 'request fallback anthropic ditangkap');
        const { body } = record;
        assertNoBoundaryLeak(body, 'fallback/anthropic');

        assert.equal(typeof body.system, 'string', 'system akar string (bukan bercantum ke user)');
        assert.ok(!has(body.system, '<s id="1">Hello'), 'lorong system bersih daripada data');
        const user = body.messages?.[0]?.content || '';
        assert.ok(
            has(user, 'Write your answer inside a single <answer> block'),
            'arahan pintu anthropic hadir (bukan anchor gemini)'
        );
        assert.ok(!/<answer>\n<s id="1">\s*$/.test(user), 'sifar residu anchor continuation gemini');
        assert.ok(!body.messages.some((m) => m.role === 'assistant'), 'sifar assistant prefill');
    } finally {
        axios.post = realPost;
    }
});

// ═══════════════════════════════════════════════════════════════════════
// T4 — Parallel workers: pariti penuh lorong system/user merentas batch
// ═══════════════════════════════════════════════════════════════════════

test('[WIRE-T-PARALLEL] Pekerja selari (batchIndex 0 vs 1) membina lorong yang identik', () => {
    const engine = new TranslationEngine(
        { translateSubtitle: async () => '', estimateTokenCount: () => 10 },
        'gemini-2.5-flash',
        {},
        { trinityMode: 'basic', trinityChannel: 'openai' }
    );
    engine.sourceLanguage = 'English';
    const p0 = engine.createXmlBatchPrompt('<s id="1">A.</s>', 'Malay', null, 1, null, 0, 2);
    const p1 = engine.createXmlBatchPrompt('<s id="2">B.</s>', 'Malay', null, 1, null, 1, 2);
    const s0 = splitStructuredPrompt(p0);
    const s1 = splitStructuredPrompt(p1);

    assert.ok(s0 && s1, 'kedua-dua prompt bersempadan');
    assert.equal(s0.system, s1.system, 'lorong system IDENTIK merentas pekerja');
    for (const parts of [s0, s1]) {
        assert.ok(has(parts.user, 'Required output ids in exact order'), 'manifest ID hadir');
        assert.ok(has(parts.user, '<input>'), 'input hadir');
        assert.ok(has(parts.user, 'Begin your output'), 'arahan anchor eksplisit hadir');
        assert.ok(!has(parts.user, SUBFABER_PROMPT_BOUNDARY), 'sifar bocor sempadan selepas split');
    }
});
