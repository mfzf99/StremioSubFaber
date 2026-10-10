/**
 * Tri-Door Fasa C — regresi payload pintu Gemini & Anthropic (2026-10-10)
 *
 * Kontrak yang diuji (mandat owner Fasa C):
 *   1. geminiChannel.buildRequest: systemInstruction TOP-LEVEL (HARAM dalam
 *      contents), contents user tunggal, generationConfig dari
 *      buildGenerationConfig (getModelFamily ground truth), endpoint
 *      :generateContent non-stream.
 *   2. anthropicChannel.buildRequest: system TOP-LEVEL string, max_tokens
 *      MANDATORI + clamp cap 64000, messages user tunggal, endpoint
 *      /v1/messages, header anthropic-version.
 *   3. Delegasi AgentBInspector: format gemini/anthropic → translateSubtitle
 *      diarahkan ke channel transport; format openai → super() (laluan
 *      rootsys 1:1, universalPayload god-tier terpelihara).
 *   4. Autodetect: key AIza/sk-ant- + config.agentB.format auto → channel
 *      betul aktif tanpa mengubah tingkah laku laluan openai.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

process.env.ENTRY_CACHE_SIZE = '100';

const { AgentBInspector } = require('./agentBInspector');
const geminiChannel = require('./channels/geminiChannel');
const anthropicChannel = require('./channels/anthropicChannel');

const { SUBFABER_PROMPT_BOUNDARY } = require('./utils/structuredPrompt');

// ── 1. geminiChannel payload ──

test('geminiChannel: systemInstruction TOP-LEVEL — HARAM dalam contents', () => {
    const { body } = geminiChannel.buildRequest({
        model: 'gemini-3.7-flash',
        systemPrompt: 'STATIC ROLE INSTRUCTIONS',
        userPrompt: 'dynamic <text> payload'
    });
    assert.deepEqual(
        body.systemInstruction,
        { parts: [{ text: 'STATIC ROLE INSTRUCTIONS' }] },
        'systemInstruction mesti objek top-level { parts: [{ text }] }'
    );
    assert.equal(body.contents.length, 1, 'satu giliran user sahaja');
    assert.equal(body.contents[0].role, 'user');
    assert.ok(!JSON.stringify(body.contents).includes('STATIC ROLE INSTRUCTIONS'), 'system TIDAK BOLEH dalam contents');
    assert.equal(body.contents[0].parts[0].text, 'dynamic <text> payload');
});

test('geminiChannel: endpoint non-stream :generateContent + header x-goog-api-key', () => {
    const { url, headers } = geminiChannel.buildRequest({ model: 'gemini-2.5-flash', userPrompt: 'x' });
    assert.match(url, /\/v1beta\/models\/gemini-2\.5-flash:generateContent$/);
    assert.equal(headers['x-goog-api-key'], 'CHANNEL_KEY_PLACEHOLDER');
});

test('geminiChannel: ground truth getModelFamily — 3.7 STRICT strip sampling, thinkingLevel kekal', () => {
    const { body } = geminiChannel.buildRequest({ model: 'gemini-3.7-flash', userPrompt: 'x' });
    assert.equal(body.generationConfig.temperature, undefined, '3.x-strict: temperature digugurkan');
    assert.equal(body.generationConfig.topP, undefined, '3.x-strict: topP digugurkan');
    assert.equal(body.generationConfig.thinkingConfig.thinkingLevel, 'low', 'default channel thinkingLevel low');
});

test('geminiChannel: 2.5 LEGACY full sampling dikekalkan', () => {
    const { body } = geminiChannel.buildRequest({
        model: 'gemini-2.5-flash',
        userPrompt: 'x',
        advancedSettings: { temperature: 0.0, topP: 0.95 }
    });
    assert.equal(body.generationConfig.temperature, 0.0);
    assert.equal(body.generationConfig.topP, 0.95);
});

test('geminiChannel: tanpa systemPrompt → tiada medan systemInstruction', () => {
    const { body } = geminiChannel.buildRequest({ model: 'gemini-2.5-flash', userPrompt: 'x' });
    assert.equal(body.systemInstruction, undefined);
});

// ── 2. anthropicChannel payload ──

test('anthropicChannel: system TOP-LEVEL string + messages user tunggal', () => {
    const { body } = anthropicChannel.buildRequest({
        model: 'claude-sonnet-4',
        systemPrompt: 'STATIC ROLE INSTRUCTIONS',
        userPrompt: 'dynamic payload'
    });
    assert.equal(body.system, 'STATIC ROLE INSTRUCTIONS', 'system ialah string top-level');
    assert.ok(!JSON.stringify(body.messages).includes('STATIC ROLE INSTRUCTIONS'), 'system TIDAK dalam messages');
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages[0].role, 'user');
});

test('anthropicChannel: max_tokens MANDATORI + clamp cap 64000', () => {
    const a = anthropicChannel.buildRequest({ model: 'claude-sonnet-4', userPrompt: 'x' });
    assert.equal(a.body.max_tokens, 64000, 'lalai = cap sah');
    const b = anthropicChannel.buildRequest({ model: 'claude-sonnet-4', userPrompt: 'x', maxTokens: 999999 });
    assert.equal(b.body.max_tokens, 64000, 'melebihi cap → clamp');
    const c = anthropicChannel.buildRequest({ model: 'claude-sonnet-4', userPrompt: 'x', maxTokens: 8192 });
    assert.equal(c.body.max_tokens, 8192, 'bawah cap → kekal');
});

test('anthropicChannel: endpoint /v1/messages + header anthropic-version + x-api-key', () => {
    const { url, headers } = anthropicChannel.buildRequest({ model: 'claude-sonnet-4', userPrompt: 'x' });
    assert.equal(url, 'https://api.anthropic.com/v1/messages');
    assert.equal(headers['anthropic-version'], '2023-06-01');
    assert.equal(headers['x-api-key'], 'CHANNEL_KEY_PLACEHOLDER');
});

test('anthropicChannel: tanpa systemPrompt → tiada medan system; temperature optional', () => {
    const noSys = anthropicChannel.buildRequest({ model: 'claude-sonnet-4', userPrompt: 'x' });
    assert.equal(noSys.body.system, undefined);
    assert.equal(noSys.body.temperature, undefined, 'temperature tidak dihantar melainkan eksplisit');
    const withTemp = anthropicChannel.buildRequest({
        model: 'claude-sonnet-4',
        userPrompt: 'x',
        temperature: 0.0
    });
    assert.equal(withTemp.body.temperature, 0.0);
});

// ── 3. Delegasi AgentBInspector per pintu ──

test('AgentB [TRI-DOOR]: format openai (laluan rootsys) → tiada channel provider, super() 1:1', () => {
    const inspector = new AgentBInspector({ apiKey: 'sk-rootsys-key', baseUrl: 'https://rootsys.cloud/v1' });
    assert.equal(inspector.channelFormat, 'openai');
    assert.equal(inspector._getChannelProvider(), null, 'laluan openai kekal pewarisan super()');
});

test('AgentB [TRI-DOOR]: format gemini (key AIza) → delegasi translateSubtitle ke geminiChannel', async () => {
    const inspector = new AgentBInspector({
        apiKey: 'AIzaSyTRIDOORTEST',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        model: 'gemini-3.7-flash',
        preflightModel: 'gemini-3.7-flash'
    });
    assert.equal(inspector.channelFormat, 'gemini');
    const provider = inspector._getChannelProvider();
    assert.ok(provider, 'channel provider gemini dibina');
    assert.equal(provider.model, 'gemini-3.7-flash');

    // Delegasi: stub translateSubtitle channel → panggilan inspector mesti
    // melalui channel, BUKAN super() (laluan openai).
    let calledViaChannel = false;
    provider.translateSubtitle = async () => {
        calledViaChannel = true;
        return '{"valid":true}';
    };
    const out = await inspector.translateSubtitle('payload', 'en', 'en', 'prompt');
    assert.equal(out, '{"valid":true}');
    assert.ok(calledViaChannel, 'panggilan diarahkan melalui geminiChannel transport');
});

test('AgentB [TRI-DOOR]: format anthropic (key sk-ant-) → delegasi translateSubtitle ke anthropicChannel', async () => {
    const inspector = new AgentBInspector({
        apiKey: 'sk-ant-api03-TRIDOORTEST',
        baseUrl: 'https://api.anthropic.com/v1',
        model: 'claude-sonnet-4',
        preflightModel: 'claude-sonnet-4'
    });
    assert.equal(inspector.channelFormat, 'anthropic');
    const provider = inspector._getChannelProvider();
    assert.ok(provider, 'channel provider anthropic dibina');
    assert.equal(provider.model, 'claude-sonnet-4');

    let calledViaChannel = false;
    provider.translateSubtitle = async () => {
        calledViaChannel = true;
        return '{"valid":true}';
    };
    const out = await inspector.translateSubtitle('payload', 'en', 'en', 'prompt');
    assert.equal(out, '{"valid":true}');
    assert.ok(calledViaChannel, 'panggilan diarahkan melalui anthropicChannel transport');
});

test('AgentB [TRI-DOOR]: override manual format mengatasi autodetect key', () => {
    // Key gemini tetapi owner override openai (contoh gateway gemini-via-openai)
    const inspector = new AgentBInspector({
        apiKey: 'AIzaSyOVERRIDE',
        baseUrl: 'https://gateway.example/v1',
        format: 'openai'
    });
    assert.equal(inspector.channelFormat, 'openai');
    assert.equal(inspector.channelFormatSource, 'override');
    assert.equal(inspector._getChannelProvider(), null);
});

test('AgentB [TRI-DOOR]: prompt bersempadan diterima channel — kedua-dua pintu menyokong split system/user', () => {
    // Kontrak penting: buildUserPrompt AgentB memecahkan sempadan; channel
    // transport (Gemini/Anthropic) menjalankan split yang sama dalam
    // buildUserPrompt masing-masing — tiada sentinel bocor.
    const geminiProvider = geminiChannel.buildProvider({ apiKey: 'k', model: 'gemini-2.5-flash' });
    const { userPrompt, systemPrompt } = geminiProvider.buildUserPrompt(
        'unused',
        'Malay',
        `SYSTEM BLOCK${SUBFABER_PROMPT_BOUNDARY}USER DYNAMIC BLOCK`
    );
    assert.equal(systemPrompt, 'SYSTEM BLOCK');
    assert.equal(userPrompt, 'USER DYNAMIC BLOCK');

    const anthropicProvider = anthropicChannel.buildProvider({ apiKey: 'k', model: 'claude-sonnet-4' });
    const a = anthropicProvider.buildUserPrompt(
        'unused',
        'Malay',
        `SYSTEM BLOCK${SUBFABER_PROMPT_BOUNDARY}USER DYNAMIC BLOCK`
    );
    assert.equal(a.systemPrompt, 'SYSTEM BLOCK');
    assert.equal(a.userPrompt, 'USER DYNAMIC BLOCK');
});

// ── 4. Konfigurasi ──

test('config agentB.format: lalai auto + override lowercase + nilai tidak sah kekal verbatim', () => {
    const { normalizeConfig } = require('../utils/config');
    const base = normalizeConfig({ agentB: { baseUrl: 'https://x.example/v1', apiKey: 'k' } });
    assert.equal(base.agentB.format, 'auto', 'lalai = auto (autodetect keyDetector)');

    const explicit = normalizeConfig({ agentB: { baseUrl: 'https://x.example/v1', apiKey: 'k', format: 'GEMINI' } });
    assert.equal(explicit.agentB.format, 'gemini', 'override config dinormalize lowercase');

    const bogus = normalizeConfig({ agentB: { baseUrl: 'https://x.example/v1', apiKey: 'k', format: 'bogus' } });
    assert.equal(
        bogus.agentB.format,
        'bogus',
        'nilai tidak sah kekal — keyDetector menolak override tidak sah → autodetect'
    );
});
