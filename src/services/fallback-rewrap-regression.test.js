/**
 * Fallback Re-wrap Regression (Mandat P0 F2, 2026-11-10)
 *
 * Defect F2 (audit A–Z): `tryFallback` dalam translationEngine.js menghantar
 * prompt yang dibungkus untuk PINTU PRIMER kepada fallbackProvider tanpa
 * dibungkus semula mengikut `fallbackProvider.trinityChannel`.
 *
 * Bukti laluan:
 *   - `this.trinityChannel` dikunci pada primer (`options.trinityChannel`).
 *   - `_trinityPromptBuilder` dipilih SEKALI untuk primer.
 *   - `createXmlBatchPrompt` membungkus dengan builder primer.
 *   - `tryFallback` menggunakan `fallbackPrompt = prompt` (prompt primer).
 *
 * Ujian ini membuktikan bahawa selepas pembetulan, setiap batch yang
 * menghadapi kegagalan primer merentas channel MESTI membungkus semula
 * segmen sari kata menggunakan builder channel fallback:
 *   - Gemini   → user content berakhir dengan anchor continuation
 *                `<answer>\n<s id="startId">`.
 *   - OpenAI   → user content berakhir dengan arahan eksplisit
 *                "Begin your output with the <answer> block ... <s id="N">".
 *   - Anthropic→ user content dibalut `<subtitle_input>` dan diakhiri dengan
 *                arahan eksplisit "Write your answer inside a single <answer>".
 *
 * Tiada provider sebenar dipanggil — semua panggilan di-mock.
 */

const test = require('node:test');
const assert = require('node:assert');
const TranslationEngine = require('./translationEngine');
const { splitStructuredPrompt } = require('./utils/structuredPrompt');

// Build a provider double whose `translateSubtitle` captures the prompt.
function makeProvider({ name, channel, response, shouldFail = false, captured = [] }) {
    return {
        providerName: name,
        trinityChannel: channel,
        async translateSubtitle(content, srcLang, targetLang, prompt) {
            captured.push({ content, targetLang, prompt });
            if (shouldFail) {
                const err = new Error(`${name} forced failure`);
                err.translationErrorType = 'NETWORK';
                throw err;
            }
            return response;
        },
        async streamTranslateSubtitle() {
            // Engine prefers non-stream when this is absent; keep it simple.
            return undefined;
        },
        estimateTokenCount() {
            return 10;
        }
    };
}

// A tiny valid XML batch response that satisfies parseXmlBatchResponse.
const VALID_XML = '<answer>\n<s id="1">Hai.</s>\n</answer>';

function makeEngine({ primaryChannel, fallbackChannel }) {
    const primaryCalls = [];
    const fallbackCalls = [];
    const primary = makeProvider({
        name: 'primary',
        channel: primaryChannel,
        shouldFail: true,
        captured: primaryCalls
    });
    const fallback = makeProvider({
        name: 'fallback',
        channel: fallbackChannel,
        response: VALID_XML,
        captured: fallbackCalls
    });
    // Engine constructor accepts { primary, fallback } wrapper.
    const engine = new TranslationEngine(
        { primary, fallback },
        'gemini-2.5-flash',
        {},
        {
            providerName: 'primary',
            fallbackProviderName: 'fallback',
            trinityChannel: primaryChannel,
            trinityMode: 'basic'
        }
    );
    return { engine, primaryCalls, fallbackCalls };
}

async function runBatch(engine) {
    const batch = [{ id: 1, timecode: '00:00:01,000 --> 00:00:02,000', text: 'Hello.' }];
    // translateBatch drives the primary failure → tryFallback path.
    await engine.translateBatch(batch, 'Malay', null, 0, 1, null, {});
}

test('[F2-A] Fallback OpenAI → Gemini: prompt must be re-wrapped with Gemini continuation anchor', async () => {
    const { engine, primaryCalls, fallbackCalls } = makeEngine({ primaryChannel: 'openai', fallbackChannel: 'gemini' });
    await runBatch(engine);
    assert.equal(primaryCalls.length, 1, 'primary attempted once');
    assert.equal(fallbackCalls.length, 1, 'fallback attempted once');
    const fallbackPrompt = fallbackCalls[0].prompt;
    const structured = splitStructuredPrompt(fallbackPrompt);
    assert.ok(structured, 'fallback prompt must carry the structured boundary');
    // Gemini wrapper: user content ENDS with the continuation anchor.
    assert.ok(
        structured.user.trimEnd().endsWith('<s id="1">'),
        `Gemini fallback user content must END with continuation anchor <s id="1">, got tail: ${JSON.stringify(structured.user.slice(-120))}`
    );
    assert.ok(structured.user.includes('<answer>'), 'Gemini fallback must include the <answer> anchor block');
    // It must NOT end with the OpenAI explicit-directive tail.
    assert.ok(
        !structured.user.trimEnd().endsWith('<s id="1">.'),
        'Gemini fallback must not end with the OpenAI directive sentence'
    );
});

test('[F2-B] Fallback Gemini → Anthropic: prompt must be re-wrapped data-first with explicit directive', async () => {
    const { engine, fallbackCalls } = makeEngine({ primaryChannel: 'gemini', fallbackChannel: 'anthropic' });
    await runBatch(engine);
    assert.equal(fallbackCalls.length, 1, 'fallback attempted once');
    const fallbackPrompt = fallbackCalls[0].prompt;
    const structured = splitStructuredPrompt(fallbackPrompt);
    assert.ok(structured, 'fallback prompt must carry the structured boundary');
    // Anthropic wrapper: <subtitle_input> wraps the data, query/directive at the end.
    assert.ok(
        structured.user.includes('<subtitle_input>'),
        'Anthropic fallback user content must wrap data in <subtitle_input>'
    );
    assert.ok(
        structured.user.includes('Write your answer inside a single <answer> block'),
        'Anthropic fallback must include the explicit answer directive'
    );
    // It must NOT end with the Gemini continuation anchor (dangling partial tag).
    assert.ok(
        !structured.user.trimEnd().endsWith('<s id="1">'),
        'Anthropic fallback must NOT end with the Gemini continuation anchor (dangling partial tag)'
    );
});

test('[F2-C] Fallback Gemini → OpenAI: prompt must use explicit directive, not Gemini continuation anchor', async () => {
    const { engine, fallbackCalls } = makeEngine({ primaryChannel: 'gemini', fallbackChannel: 'openai' });
    await runBatch(engine);
    assert.equal(fallbackCalls.length, 1, 'fallback attempted once');
    const fallbackPrompt = fallbackCalls[0].prompt;
    const structured = splitStructuredPrompt(fallbackPrompt);
    assert.ok(structured, 'fallback prompt must carry the structured boundary');
    assert.ok(
        structured.user.includes('Begin your output with the <answer> block'),
        'OpenAI fallback must include the explicit directive'
    );
    assert.ok(
        !structured.user.trimEnd().endsWith('<s id="1">'),
        'OpenAI fallback must NOT end with the Gemini continuation anchor'
    );
});

test('[F2-D] Same-channel fallback (Gemini → Gemini): still ends with continuation anchor', async () => {
    const { engine, fallbackCalls } = makeEngine({ primaryChannel: 'gemini', fallbackChannel: 'gemini' });
    await runBatch(engine);
    assert.equal(fallbackCalls.length, 1, 'fallback attempted once');
    const structured = splitStructuredPrompt(fallbackCalls[0].prompt);
    assert.ok(structured.user.trimEnd().endsWith('<s id="1">'), 'same-channel fallback keeps the anchor');
});
