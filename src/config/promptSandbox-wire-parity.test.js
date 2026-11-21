/**
 * Prompt Sandbox Wire Parity (Mandat Owner 2026-11-16, v3.38.0 — Fasa B red-first)
 *
 * Bukti EMPIRIKAL untuk kebimbangan "syok sendiri": apabila sandbox aktif,
 * payload akhir di wayar ketiga-tiga pintu mesti 100% SEBIJI-SEBIJI dengan
 * laluan official KECUALI teks lorong system — sifar wayar lain tertinggal
 * (anchor, manifest ID, KNP, sempadan, retry diagnostik, batch header,
 * model-turn prefill, parameter sampling, susuran mesej).
 *
 * Kaedah: injection eksplisit __setPromptSandboxForTests (uji-sahaja, bypass
 * gate) + provider transport SEBENAR dengan axios di-mock; body official vs
 * body sandbox dibandingkan DEEP-EQUAL selepas nilai system digantikan token
 * tetap — apa-apa perbezaan selain teks system gagal ujian.
 *
 * Pin tambahan (pengetatan Owner #2/#3):
 *   - Interpolasi callback selamat: token $& / $` / $' dalam teks sandbox
 *     kekal VERBATIM pada wayar (bukti risiko R1 ditutup).
 *   - Placeholder format rasmi tunggal ${...} diinterpolasi enjin (v3.39.2);
 *     sifar residu token pada system lane.
 *   - Generic pack verbatim walaupun malayFewShot aktif (sasaran bukan-Malay
 *     100% tak tersentuh).
 *   - Resolusi cacheKeys DINAMIK per panggilan: injection menukar kunci ke
 *     v7-sbx-{hash8}; reset memulangkan kunci official v7 yang sama.
 */

const test = require('node:test');
const assert = require('node:assert');
const { PassThrough } = require('stream');
const axios = require('axios');

const TranslationEngine = require('../services/translationEngine');
const GeminiService = require('../services/gemini');
const AnthropicProvider = require('../services/providers/anthropic');
const { AgentInspector } = require('../services/agentInspector');
const { resolvePromptSandbox, __setPromptSandboxForTests, __resetPromptSandboxForTests } = require('./promptSandbox');
const { generateCacheKeys } = require('../utils/cacheKeys');
const { splitStructuredPrompt, SUBFABER_PROMPT_BOUNDARY } = require('../services/utils/structuredPrompt');
const { getLanguagePack } = require('../services/prompts/languagePacks');
const { TRANSLATION_SYSTEM_TEMPLATE } = require('../services/prompts/trinity/translation/core');

// ── Mock rangkaian: tangkap setiap request sebelum keluar ───────────────
const captured = [];
const TRANSLATION_XML = '<answer>\n<s id="1">Hai.</s>\n</answer>';

const realPost = axios.post;
const realGet = axios.get;
axios.get = async () => {
    throw new Error('network disabled in wire tests');
};
function sseBody(text) {
    const stream = new PassThrough();
    stream.write(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`);
    stream.write('data: [DONE]\n\n');
    stream.end();
    return stream;
}

// SSE format OpenAI (choices[].delta) — Agent Inspector pintu openai
// mengutamakan SSE; mock mesti memenuhi kedua-dua format pintu.
function sseOpenAIBody(text) {
    const stream = new PassThrough();
    stream.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`);
    stream.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\n`);
    stream.write('data: [DONE]\n\n');
    stream.end();
    return stream;
}

axios.post = async (url, body, config = {}) => {
    captured.push({ url: String(url), headers: config.headers || {}, body });
    const target = String(url);
    if (target.includes(':generateContent')) {
        return { data: { candidates: [{ content: { parts: [{ text: TRANSLATION_XML }] } }], usageMetadata: {} } };
    }
    if (target.includes(':streamGenerateContent')) {
        return { data: sseBody(TRANSLATION_XML) };
    }
    if (target.includes(':countTokens')) {
        return { data: { totalTokens: 10 } };
    }
    if (target.includes('/messages')) {
        return { data: { content: [{ type: 'text', text: TRANSLATION_XML }] } };
    }
    if (target.includes('/chat/completions') && config.responseType === 'stream') {
        return { data: sseOpenAIBody(TRANSLATION_XML) };
    }
    if (target.includes('/chat/completions')) {
        return { data: { choices: [{ message: { content: TRANSLATION_XML } }] } };
    }
    return { data: {} };
};

function resetCapture() {
    captured.length = 0;
}

// ── Teks eksperimen sentinel + token khas ──────────────────────────────
// Token $& / $` / $' adalah token substitution yang DIMUSNAHKAN oleh
// replaceAll(replaceValue) — callback melindunginya. Placeholder format
// rasmi tunggal ${...} (v3.39.2 — selari core.js) mesti diinterpolasi.
const SBX_TEMPLATE = "SBX ROLE ${sourceLabel} -> ${targetLabel} ${targetLabelShort} RULES $& $` $' END ${fewShot}";
// [[fewShot]] ialah PSEUDO-TOKEN data (bukan placeholder sah): ia pin
// "kandungan tersuntik TIDAK diimbas semula" tanpa mencalarkan semakan
// sifar-residu placeholder sah pada templat.
const SBX_MALAY_FEWSHOT = "SBX FEWSHOT $& ` ' VERBATIM [[fewShot]]";

function makeEngine(provider, trinityMode, trinityChannel) {
    return new TranslationEngine(
        provider,
        'gemini-2.5-flash',
        {},
        {
            providerName: trinityChannel,
            trinityMode,
            trinityChannel,
            enableStreaming: false
        }
    );
}

const BATCH = '<s id="1">Hello.</s>';
const PREFLIGHT_CTX = {
    previousContent: null,
    subsequentContent: [{ id: 2, text: 'Next line.' }],
    previousMemory: [],
    preflight: { theme: 'A heist movie.', terms: [], characters: [], credits_and_titles: [] }
};

function buildPrompt(engine, context) {
    return engine.createXmlBatchPrompt(BATCH, 'Malay', null, 1, context, 0, 1);
}

// ── Pengeluaran nilai system dari body pintu ────────────────────────────
function systemOf(body, door) {
    if (door === 'gemini') {
        return { text: body.systemInstruction?.parts?.[0]?.text ?? '', at: ['systemInstruction', 'parts', 0, 'text'] };
    }
    if (door === 'openai') {
        return { text: body.messages?.[0]?.content ?? '', at: ['messages', 0, 'content'] };
    }
    return { text: body.system ?? '', at: ['system'] };
}

// Gantikan nilai system dengan token tetap, kemudian deep-equal keseluruhan:
// apa-apa wayar lain yang berbeza → FAIL. (Bukti "hanya system berubah".)
function normalizeBody(rawBody, door) {
    const body = JSON.parse(JSON.stringify(rawBody));
    const { at } = systemOf(body, door);
    let node = body;
    for (let i = 0; i < at.length - 1; i++) node = node[at[i]];
    node[at[at.length - 1]] = '<SYSTEM-TEXT-NORMALIZED>';
    return body;
}

async function captureDoor(door, trinityMode, context, { stream = false } = {}) {
    resetCapture();
    let provider;
    if (door === 'gemini') {
        provider = new GeminiService('AIzaSySbxWireParityFake000000', 'gemini-2.5-flash', { maxRetries: 0 });
    } else if (door === 'openai') {
        provider = new AgentInspector({
            apiKey: 'sk-sbx-wire-parity-fake',
            baseUrl: 'https://wireparity.test/v1',
            model: 'kimi-k3',
            maxRetries: 0
        });
    } else {
        provider = new AnthropicProvider({
            apiKey: 'sk-ant-api03-sbxwireparityfake',
            baseUrl: 'https://api.anthropic.wireparity.test/v1',
            model: 'claude-sonnet-4',
            providerName: 'anthropic',
            enableJsonOutput: false,
            maxRetries: 0
        });
    }
    const engine = makeEngine(provider, trinityMode, door);
    engine.sourceLanguage = 'English';
    const prompt = buildPrompt(engine, context);
    const target = stream
        ? provider.streamTranslateSubtitle?.(BATCH, 'detected', 'Malay', prompt, null)
        : provider.translateSubtitle(BATCH, 'detected', 'Malay', prompt);
    await target;
    assert.ok(captured.length > 0, `${door}/${trinityMode}: request ditangkap`);
    return { record: captured[captured.length - 1], prompt };
}

// ═══════════════════════════════════════════════════════════════════════
// MATRIKS PARITI — 3 pintu × 2 mod: body IDENTIK kecuali teks system
// ═══════════════════════════════════════════════════════════════════════

for (const door of ['gemini', 'openai', 'anthropic']) {
    for (const trinityMode of ['basic', 'pro']) {
        test(`[SBX-WIRE] ${door}/${trinityMode}: sandbox menukar TEKS SYSTEM sahaja — body lain 100% identik`, async () => {
            try {
                // 1) Snapshot official (sandbox dimatikan).
                const official = await captureDoor(door, trinityMode, trinityMode === 'pro' ? PREFLIGHT_CTX : null);
                const officialSystem = systemOf(official.record.body, door).text;

                // 2) Snapshot sandbox (injection eksplisit).
                __setPromptSandboxForTests({
                    enabled: true,
                    translationSystemTemplate: SBX_TEMPLATE,
                    malayFewShot: SBX_MALAY_FEWSHOT
                });
                const sandbox = await captureDoor(door, trinityMode, trinityMode === 'pro' ? PREFLIGHT_CTX : null);
                const sandboxSystem = systemOf(sandbox.record.body, door).text;

                // 3) URL + headers identik (auth, endpoint, anthropic-version).
                assert.equal(sandbox.record.url, official.record.url, `${door}/${trinityMode}: URL identik`);

                // 4) Body IDENTIK selepas nilai system dinormalisasi.
                assert.deepEqual(
                    normalizeBody(sandbox.record.body, door),
                    normalizeBody(official.record.body, door),
                    `${door}/${trinityMode}: SEMUA wayar luar teks system mesti identik byte demi byte`
                );

                // 5) System lane sandbox membawa teks eksperimen TERINTERPOLASI.
                assert.ok(sandboxSystem.includes('SBX ROLE'), `${door}/${trinityMode}: teks sandbox hadir`);
                assert.ok(
                    sandboxSystem.includes('English -> Malay'),
                    `${door}/${trinityMode}: kedua-dua bentuk placeholder diinterpolasi (D4)`
                );

                // 6) Token substitution berbahaya kekal VERBATIM (callback selamat).
                const DOLLAR_AND = '$&';
                const DOLLAR_BACKTICK = '$`';
                const DOLLAR_QUOTE = "$'";
                assert.ok(
                    sandboxSystem.includes(DOLLAR_AND),
                    `${door}/${trinityMode}: token DOLLAR_AND kekal verbatim`
                );
                assert.ok(
                    sandboxSystem.includes(DOLLAR_BACKTICK),
                    `${door}/${trinityMode}: token DOLLAR_BACKTICK kekal verbatim`
                );
                assert.ok(
                    sandboxSystem.includes(DOLLAR_QUOTE),
                    `${door}/${trinityMode}: token DOLLAR_QUOTE kekal verbatim`
                );
                assert.ok(sandboxSystem.includes('SBX FEWSHOT'), `${door}/${trinityMode}: few-shot sandbox hadir`);

                // 7) Sifar residu placeholder pada system lane (format rasmi
                // tunggal ${...} — v3.39.2).
                for (const residue of ['${sourceLabel}', '${targetLabel}', '${targetLabelShort}', '${fewShot}']) {
                    assert.ok(!sandboxSystem.includes(residue), `${door}/${trinityMode}: sifar residu ${residue}`);
                }

                // 8) Sifar sempadan bocor + official system kekal tanpa teks sandbox.
                assert.ok(
                    !JSON.stringify(sandbox.record.body).includes(SUBFABER_PROMPT_BOUNDARY),
                    `${door}/${trinityMode}: sifar sempadan`
                );
                assert.ok(
                    !officialSystem.includes('SBX ROLE'),
                    `${door}/${trinityMode}: official bersih daripada eksperimen`
                );
            } finally {
                __resetPromptSandboxForTests();
            }
        });
    }
}

// ═══════════════════════════════════════════════════════════════════════
// STREAM GEMINI — pariti laluan stream/non-stream kekal di bawah sandbox
// ═══════════════════════════════════════════════════════════════════════

test('[SBX-STREAM] Gemini stream: sandbox kekal system-sahaja pada laluan SSE', async () => {
    try {
        const official = await captureDoor('gemini', 'basic', null);
        __setPromptSandboxForTests({
            enabled: true,
            translationSystemTemplate: SBX_TEMPLATE,
            malayFewShot: SBX_MALAY_FEWSHOT
        });
        const sandbox = await captureDoor('gemini', 'basic', null);
        assert.deepEqual(
            normalizeBody(sandbox.record.body, 'gemini'),
            normalizeBody(official.record.body, 'gemini'),
            'stream: wayar luar system identik'
        );
        assert.ok(systemOf(sandbox.record.body, 'gemini').text.includes('SBX ROLE'), 'stream: teks sandbox hadir');
    } finally {
        __resetPromptSandboxForTests();
    }
});

// ═══════════════════════════════════════════════════════════════════════
// KNP PRO — blok <preflight_knp> IDENTIK (user lane tidak tersentuh)
// ═══════════════════════════════════════════════════════════════════════

test('[SBX-KNP] Pro: blok KNP + manifest ID kekal identik; hanya system berubah', async () => {
    try {
        const official = await captureDoor('gemini', 'pro', PREFLIGHT_CTX);
        __setPromptSandboxForTests({
            enabled: true,
            translationSystemTemplate: SBX_TEMPLATE,
            malayFewShot: SBX_MALAY_FEWSHOT
        });
        const sandbox = await captureDoor('gemini', 'pro', PREFLIGHT_CTX);

        const officialUser = official.record.body.contents[0]?.parts?.[0]?.text || '';
        const sandboxUser = sandbox.record.body.contents[0]?.parts?.[0]?.text || '';
        assert.equal(sandboxUser, officialUser, 'user lane (KNP + manifest + input + anchor-stripped) IDENTIK');
        assert.ok(officialUser.includes('<preflight_knp'), 'KNP hadir pada official');
        assert.ok(officialUser.includes('Required output ids in exact order'), 'manifest hadir');
    } finally {
        __resetPromptSandboxForTests();
    }
});

// ═══════════════════════════════════════════════════════════════════════
// RETRY DIAGNOSTICS — diagnostik kekal di lorong user, sebelum anchor
// ═══════════════════════════════════════════════════════════════════════

test('[SBX-RETRY] Diagnostik retry pada prompt sandbox: lorong user, sebelum anchor, sempadan utuh', async () => {
    try {
        __setPromptSandboxForTests({
            enabled: true,
            translationSystemTemplate: SBX_TEMPLATE,
            malayFewShot: SBX_MALAY_FEWSHOT
        });
        const { injectRetryDiagnostics } = require('../services/utils/retryDiagnostics');
        const provider = new GeminiService('AIzaSySbxWireParityFake000000', 'gemini-2.5-flash', { maxRetries: 0 });
        const engine = makeEngine(provider, 'pro', 'gemini');
        engine.sourceLanguage = 'English';
        const prompt = buildPrompt(engine, null);
        const block =
            '\n\nRETRY REPAIRS\nID 1 (VERBATIM_UNTRANSLATED)\n\nVERIFIED SLOTS (keep verbatim)\n<s id="2">Baik</s>';
        const injected = injectRetryDiagnostics(prompt, block);
        const parts = splitStructuredPrompt(injected);
        assert.ok(parts, 'prompt kekal bersempadan selepas suntikan');
        assert.ok(!parts.system.includes('VERIFIED SLOTS'), 'diagnostik HARAM dalam system');
        assert.ok(parts.user.includes('VERIFIED SLOTS'), 'diagnostik hadir dalam user');
        assert.ok(parts.system.includes('SBX ROLE'), 'system lane kekal teks sandbox');
        assert.ok(parts.system.includes('$&'), 'token $& kekal verbatim selepas retry path');
        assert.ok(injected.indexOf(block) < injected.lastIndexOf('\n\n<answer>'), 'diagnostik SEBELUM anchor');
    } finally {
        __resetPromptSandboxForTests();
    }
});

// ═══════════════════════════════════════════════════════════════════════
// GENERIC PACK — sasaran bukan-Malay 100% tak tersentuh oleh malayFewShot
// ═══════════════════════════════════════════════════════════════════════

test('[SBX-GENERIC] Vietnamese: generic pack verbatim walaupun malayFewShot aktif', async () => {
    try {
        __setPromptSandboxForTests({
            enabled: true,
            translationSystemTemplate: SBX_TEMPLATE,
            malayFewShot: SBX_MALAY_FEWSHOT
        });
        const provider = { translateSubtitle: async () => '', estimateTokenCount: () => 10 };
        const engine = makeEngine(provider, 'basic', 'gemini');
        engine.sourceLanguage = 'English';
        const prompt = engine.createXmlBatchPrompt(BATCH, 'Vietnamese', null, 1, null, 0, 1);
        const { system } = splitStructuredPrompt(prompt);
        assert.ok(!system.includes('SBX FEWSHOT'), 'sifar few-shot sandbox pada sasaran bukan-Malay');
        assert.ok(system.includes(getLanguagePack('Vietnamese').fewShot), 'few-shot generic ASAL hadir');
        assert.ok(system.includes('Vietnamese'), 'label sasaran betul');
    } finally {
        __resetPromptSandboxForTests();
    }
});

// ═══════════════════════════════════════════════════════════════════════
// CACHE KEYS — resolusi dinamik per panggilan + namespace -sbx-{hash8}
// ═══════════════════════════════════════════════════════════════════════

test('[SBX-CACHE] generateCacheKeys dinamik: injection → v7-sbx-{hash8}; reset → v7 official', () => {
    // 1) Official: kunci pin asli kekal EXACT.
    assert.equal(
        generateCacheKeys({}, 'tt123_en', 'ms').baseKey,
        'tt123_en_ms_trinity-basic-universal-v7_ch-gemini',
        'kunci official v7 tidak berubah'
    );

    try {
        // 2) Injection: kunci membawa namespace sandbox + hash8 resolver.
        __setPromptSandboxForTests({
            enabled: true,
            translationSystemTemplate: SBX_TEMPLATE,
            malayFewShot: SBX_MALAY_FEWSHOT
        });
        const sandboxKey = generateCacheKeys({}, 'tt123_en', 'ms').baseKey;
        const { hash8 } = resolvePromptSandbox({
            officialTemplate: TRANSLATION_SYSTEM_TEMPLATE,
            officialMalayFewShot: getLanguagePack('Malay').fewShot,
            // [TARGET-LANGUAGE-RULES 2026-11-21] Feed ketiga selari cacheKeys.
            officialMalayTargetLanguageRules: getLanguagePack('Malay').targetLanguageRules
        });
        assert.equal(
            sandboxKey,
            `tt123_en_ms_trinity-basic-universal-v7-sbx-${hash8}_ch-gemini`,
            'kunci sandbox = official + segmen -sbx-{hash8}'
        );
        assert.ok(/-v7-sbx-[0-9a-f]{8}_ch-/.test(sandboxKey), 'bentuk kunci sandbox betul');

        // 3) Pro-mode + ASS segment kekal selepas namespace sandbox.
        const proKey = generateCacheKeys({ trinityMode: 'pro' }, 'tt123_en', 'ms').baseKey;
        assert.ok(proKey.includes('trinity-pro-universal-v7-sbx-'), 'mode discriminator kekal');
        const assKey = generateCacheKeys({ convertAssToVtt: false }, 'tt123_en', 'ms').baseKey;
        assert.ok(assKey.endsWith('_ass'), 'segmen ASS kekal di hujung');

        // 4) Dynamisme: teks eksperimen berubah → kunci berubah (auto-busting).
        __setPromptSandboxForTests({ enabled: true, translationSystemTemplate: `${SBX_TEMPLATE}+1` });
        const mutatedKey = generateCacheKeys({}, 'tt123_en', 'ms').baseKey;
        assert.notEqual(mutatedKey, sandboxKey, 'satu aksara eksperimen → kunci cache baharu');
    } finally {
        __resetPromptSandboxForTests();
    }

    // 5) Selepas reset: kunci official dipulihkan penuh (cache rasmi tak terjejas).
    assert.equal(
        generateCacheKeys({}, 'tt123_en', 'ms').baseKey,
        'tt123_en_ms_trinity-basic-universal-v7_ch-gemini',
        'reset injection → kunci official semula'
    );
});

// ═══════════════════════════════════════════════════════════════════════
// FALLBACK CROSS-DOOR — pembungkusan semula pintu fallback di bawah sandbox
// ═══════════════════════════════════════════════════════════════════════

test('[SBX-FALLBACK] Gemini→Anthropic fallback: kontrak pintu anthropic kekal, hanya system sandbox', async () => {
    try {
        async function captureFallback() {
            resetCapture();
            const primary = new GeminiService('AIzaSySbxWireParityFake000000', 'gemini-2.5-flash', { maxRetries: 0 });
            const fallback = new AnthropicProvider({
                apiKey: 'sk-ant-api03-sbxwireparityfake',
                baseUrl: 'https://api.anthropic.wireparity.test/v1',
                model: 'claude-sonnet-4',
                providerName: 'anthropic',
                enableJsonOutput: false,
                maxRetries: 0
            });
            primary.streamTranslateSubtitle = undefined;
            fallback.streamTranslateSubtitle = undefined;
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
            engine.sourceLanguage = 'English';

            const realPostInner = axios.post;
            axios.post = async (url, body, config = {}) => {
                const target = String(url);
                if (target.includes(':generateContent')) {
                    throw Object.assign(new Error('Simulated primary 500'), { response: { status: 500, data: {} } });
                }
                return realPostInner(url, body, config);
            };
            try {
                await engine.translateSubtitle(
                    '1\n00:00:01,000 --> 00:00:02,000\nHello.\n',
                    'Malay',
                    null,
                    null,
                    'English'
                );
            } finally {
                axios.post = realPostInner;
            }
            const record = captured.find((r) => r.url.includes('/messages'));
            assert.ok(record, 'request fallback anthropic ditangkap');
            return record;
        }

        const official = await captureFallback();
        __setPromptSandboxForTests({
            enabled: true,
            translationSystemTemplate: SBX_TEMPLATE,
            malayFewShot: SBX_MALAY_FEWSHOT
        });
        const sandbox = await captureFallback();
        assert.deepEqual(
            normalizeBody(sandbox.body, 'anthropic'),
            normalizeBody(official.body, 'anthropic'),
            'fallback: wayar luar system identik (arahan pintu anthropic, sifar residu anchor gemini)'
        );
        assert.ok((sandbox.body.system || '').includes('SBX ROLE'), 'fallback: system lane membawa sandbox');
    } finally {
        __resetPromptSandboxForTests();
    }
});

// ── Pembersihan mock global ────────────────────────────────────────────

test('SBX-CLEANUP: pulihkan axios mock (kebersihan sesi)', () => {
    axios.post = realPost;
    axios.get = realGet;
    assert.equal(typeof axios.post, 'function', 'axios.post dipulihkan');
});
