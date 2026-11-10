/**
 * Transport ↔ Wrapper Parity Regression (Mandat P0 F3, 2026-11-10)
 *
 * Defect F3 (audit A–Z): wrapper Trinity mengeluarkan kontrak yang betul,
 * tetapi kelas provider sebenar tidak menghormatinya:
 *   1. OpenAI — `systemRole: 'developer'` daripada wrapper digugurkan oleh
 *      `buildChatRequest` (sentiasa 'system').
 *   2. Anthropic — `buildUserPrompt` tidak melaksanakan susunan data-first
 *      `<subtitle_input>` yang diwajibkan wrapper translation/anthropic.
 *   3. Anthropic — `enableJsonOutput` mesti kekal dimatikan pada laluan
 *      runtime supaya assistant prefill `[` tidak dihantar.
 */

const test = require('node:test');
const assert = require('node:assert');
const OpenAICompatibleProvider = require('./providers/openaiCompatible');
const AnthropicProvider = require('./providers/anthropic');
const { SUBFABER_PROMPT_BOUNDARY } = require('./utils/structuredPrompt');

function makeBoundaryPrompt(systemText, userText) {
    return `${systemText}\n\n${SUBFABER_PROMPT_BOUNDARY}\n\n${userText}`;
}

test('[F3-A] OpenAI buildChatRequest honours systemRole=developer from wrapper meta', () => {
    const provider = new OpenAICompatibleProvider({
        apiKey: 'k',
        model: 'gpt-5-mini',
        providerName: 'openai',
        enableJsonOutput: false
    });
    const { body } = provider.buildChatRequest('<input><s id="1">Hi</s></input>', false, {
        systemPrompt: 'STATIC ROLE INSTRUCTIONS',
        systemRole: 'developer'
    });
    assert.equal(body.messages[0].role, 'developer', 'wrapper systemRole=developer must reach the wire');
    assert.equal(body.messages[0].content, 'STATIC ROLE INSTRUCTIONS');
    assert.equal(body.messages[1].role, 'user');
});

test('[F3-B] OpenAI buildChatRequest defaults to system when systemRole absent', () => {
    const provider = new OpenAICompatibleProvider({
        apiKey: 'k',
        model: 'gpt-5-mini',
        providerName: 'openai',
        enableJsonOutput: false
    });
    const { body } = provider.buildChatRequest('<input><s id="1">Hi</s></input>', false, {
        systemPrompt: 'STATIC ROLE INSTRUCTIONS'
    });
    assert.equal(body.messages[0].role, 'system', 'default remains system');
});

test('[F3-C] Anthropic buildUserPrompt wraps structured user data in <subtitle_input> (data-first)', () => {
    const provider = new AnthropicProvider({
        apiKey: 'k',
        model: 'claude-sonnet-4',
        providerName: 'anthropic',
        enableJsonOutput: false
    });
    const systemText = 'You are a professional Netflix subtitle translator. Translate from English to Malay.';
    const userText = '<input>\n<s id="1">Hello.</s>\n</input>';
    const { systemPrompt, userPrompt } = provider.buildUserPrompt(
        '<s id="1">Hello.</s>',
        'Malay',
        makeBoundaryPrompt(systemText, userText)
    );
    assert.equal(systemPrompt, systemText, 'static system text preserved');
    assert.ok(
        userPrompt.startsWith('<subtitle_input>'),
        `Anthropic user content must START with <subtitle_input> (data-first), got: ${userPrompt.slice(0, 80)}`
    );
    assert.ok(userPrompt.includes('</subtitle_input>'), 'Anthropic user content must close the <subtitle_input> block');
});

test('[F3-D] Anthropic buildRequestBody emits no assistant prefill when enableJsonOutput=false', () => {
    const provider = new AnthropicProvider({
        apiKey: 'k',
        model: 'claude-sonnet-4',
        providerName: 'anthropic',
        enableJsonOutput: false
    });
    const { body } = provider.buildRequestBody(
        '<s id="1">Hello.</s>',
        'Malay',
        makeBoundaryPrompt('STATIC', '<input><s id="1">Hello.</s></input>')
    );
    assert.equal(body.messages.length, 1, 'exactly one user message, no assistant prefill');
    assert.equal(body.messages[0].role, 'user');
    assert.equal(body.system, 'STATIC');
});
