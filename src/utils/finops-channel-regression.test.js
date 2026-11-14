/**
 * A1 cache-channel wiring + A2 provider FinOps regression (2026-11-14)
 *
 * Defects closed by this suite:
 *
 *   A1 — `generateCacheKeys` reads `config.trinityChannel`, but no runtime
 *        path ever populated it. The factory resolves the real door and hands
 *        it only to TranslationEngine, so every cache key defaulted to
 *        `_ch-gemini` — including custom/OpenAI and custom/Anthropic runs
 *        (live evidence: deepseek-v4-pro @ rootsys stored under `ch-gemini`).
 *        The F6-A..D suite passed only because it injected the field
 *        manually; the production wiring gap was untested. Fix:
 *        `resolveTrinityChannelForConfig(config)` in translationProviderFactory
 *        + the handler threading the factory result into the config BEFORE
 *        cache-key generation. Key schemas below must match the live door.
 *
 *   A2 — only the Gemini door wrote usage into `global.geminiFinOps.streams`
 *        (GeminiService.recordUsageIfPresent), so non-Gemini doors rendered
 *        `±0 tokens / $0.00` receipts and incident tokensBurned stayed dark.
 *        Live wire probe (rootsys, 2026-11-14): the gateway returns a usage
 *        superset on EVERY mode — including plain SSE streams — so recording
 *        is pure response parsing with zero transport change.
 *        Pricing per plans/provider-pricing-ground-truth-2026.md: model-name
 *        resolved, door-agnostic; unpriced models must render an explicit
 *        N/A instead of silently falling back to Gemini flash-lite rates.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('stream');
const axios = require('axios');

const { generateCacheKeys } = require('../utils/cacheKeys');
const { resolveTrinityChannelForConfig } = require('../services/translationProviderFactory');
const { buildCostSection, resolvePricing } = require('../utils/telegramFinOps');

// ─────────────────────────────────────────────────────────────────────────────
// A1 — channel resolution (pure function, no network)
// ─────────────────────────────────────────────────────────────────────────────

test('[A1-R1] resolveTrinityChannelForConfig: custom openai-compatible door resolves to openai', () => {
    const channel = resolveTrinityChannelForConfig({
        mainProvider: 'custom',
        providers: { custom: { door: 'openai-compatible', baseUrl: 'https://rootsys.cloud/v1' } }
    });
    assert.equal(channel, 'openai');
});

test('[A1-R2] resolveTrinityChannelForConfig: custom anthropic-messages door resolves to anthropic', () => {
    const channel = resolveTrinityChannelForConfig({
        mainProvider: 'custom',
        providers: { custom: { door: 'anthropic-messages', baseUrl: 'https://api.anthropic.com/v1' } }
    });
    assert.equal(channel, 'anthropic');
});

test('[A1-R3] resolveTrinityChannelForConfig: custom gemini-native door resolves to gemini', () => {
    const channel = resolveTrinityChannelForConfig({
        mainProvider: 'custom',
        providers: { custom: { door: 'gemini-native', baseUrl: 'https://cn.crazyrouter.com/v1beta' } }
    });
    assert.equal(channel, 'gemini');
});

test('[A1-R4] resolveTrinityChannelForConfig: legacy gemini config without channel stays gemini', () => {
    assert.equal(resolveTrinityChannelForConfig({ mainProvider: 'gemini' }), 'gemini');
    assert.equal(resolveTrinityChannelForConfig({}), 'gemini');
});

test('[A1-R5] resolveTrinityChannelForConfig: explicit config.trinityChannel wins over derived door', () => {
    const channel = resolveTrinityChannelForConfig({
        trinityChannel: 'openai',
        mainProvider: 'custom',
        providers: { custom: { door: 'anthropic-messages' } }
    });
    assert.equal(channel, 'openai');
});

test('[A1-R6] resolveTrinityChannelForConfig: bare provider keys map to their native doors', () => {
    assert.equal(
        resolveTrinityChannelForConfig({
            mainProvider: 'custom',
            providers: { custom: { baseUrl: 'https://api.deepseek.com' } }
        }),
        'openai'
    );
    assert.equal(resolveTrinityChannelForConfig({ mainProvider: 'openai' }), 'openai');
    assert.equal(resolveTrinityChannelForConfig({ mainProvider: 'anthropic' }), 'anthropic');
});

test('[A1-K1] cache key: custom openai-compatible config (no explicit channel) derives ch-openai', () => {
    const config = {
        mainProvider: 'custom',
        providers: { custom: { door: 'openai-compatible', baseUrl: 'https://rootsys.cloud/v1' } }
    };
    const { baseKey } = generateCacheKeys(config, 'subdl_1_en', 'ms');
    assert.ok(
        baseKey.endsWith('_trinity-basic-universal-v4_ch-openai'),
        `expected ch-openai namespace, got ${baseKey}`
    );
});

test('[A1-K2] cache key: custom anthropic-messages config derives ch-anthropic', () => {
    const config = {
        mainProvider: 'custom',
        providers: { custom: { door: 'anthropic-messages', baseUrl: 'https://api.anthropic.com/v1' } }
    };
    const { baseKey } = generateCacheKeys(config, 'subdl_1_en', 'ms');
    assert.ok(baseKey.endsWith('_ch-anthropic'), `expected ch-anthropic namespace, got ${baseKey}`);
});

test('[A1-K3] cache key: legacy gemini config keeps the exact historical ch-gemini namespace', () => {
    const { baseKey } = generateCacheKeys({ mainProvider: 'gemini' }, 'tt123_en', 'ms');
    assert.equal(baseKey, 'tt123_en_ms_trinity-basic-universal-v4_ch-gemini');
});

test('[A1-K4] cache key: explicit trinityChannel in config still wins end-to-end', () => {
    const config = {
        trinityChannel: 'openai',
        mainProvider: 'custom',
        providers: { custom: { door: 'openai-compatible' } }
    };
    const { baseKey } = generateCacheKeys(config, 'tt9_en', 'ms');
    assert.equal(baseKey, 'tt9_en_ms_trinity-basic-universal-v4_ch-openai');
});

// ─────────────────────────────────────────────────────────────────────────────
// A2 — pricing resolution (pure)
// ─────────────────────────────────────────────────────────────────────────────

test('[A2-P1] resolvePricing: deepseek-v4-pro uses official DeepSeek peak rates', () => {
    const rates = resolvePricing('deepseek-v4-pro', 0);
    assert.equal(rates.input, 1.32);
    assert.equal(rates.output, 3.96);
    assert.equal(rates.cache, 0.044);
});

test('[A2-P2] resolvePricing: kimi-k3 and kimi-k3.1-pro use official Moonshot rates', () => {
    const k3 = resolvePricing('kimi-k3', 0);
    assert.equal(k3.input, 2.0);
    assert.equal(k3.output, 10.0);
    assert.equal(k3.cache, 0.2);
    const k31 = resolvePricing('kimi-k3.1-pro', 0);
    assert.equal(k31.input, 3.0);
    assert.equal(k31.output, 15.0);
    assert.equal(k31.cache, 0.3);
});

test('[A2-P3] resolvePricing: glm-5.3 uses official Z.ai rates; flashx differs', () => {
    const glm = resolvePricing('glm-5.3', 0);
    assert.equal(glm.input, 1.4);
    assert.equal(glm.output, 4.4);
    assert.equal(glm.cache, 0.26);
    const flashx = resolvePricing('glm-5.3-flashx', 0);
    assert.equal(flashx.input, 0.37);
    assert.equal(flashx.output, 1.25);
});

test('[A2-P4] resolvePricing: OpenAI gpt-6.1 family uses official standard rates', () => {
    assert.deepEqual(resolvePricing('gpt-6.1-sol', 0), { input: 2.0, output: 10.0, cache: 0.1 });
    assert.deepEqual(resolvePricing('gpt-6.1-terra', 0), { input: 1.0, output: 5.0, cache: 0.05 });
    assert.deepEqual(resolvePricing('gpt-6-luna', 0), { input: 0.1, output: 0.5, cache: 0.01 });
});

test('[A2-P5] resolvePricing: Claude models use official Anthropic rates', () => {
    assert.deepEqual(resolvePricing('claude-sonnet-5.5', 0), { input: 2.0, output: 10.0, cache: 0.1 });
    assert.deepEqual(resolvePricing('claude-opus-5.5', 0), { input: 4.0, output: 20.0, cache: 0.2 });
});

test('[A2-P6] resolvePricing: unpriced models return null — never a silent Gemini fallback', () => {
    assert.equal(resolvePricing('deepseek-v4-pro-mod', 0), null);
    assert.equal(resolvePricing('hy3-tencent', 0), null);
    assert.equal(resolvePricing('some-unknown-model', 0), null);
});

test('[A2-P7] resolvePricing: Gemini models keep the legacy table incl. Tier-2', () => {
    assert.deepEqual(resolvePricing('gemini-3.1-pro', 100000), { input: 2.0, output: 12.0, cache: 0.2 });
    assert.deepEqual(resolvePricing('gemini-3.1-pro', 300000), { input: 4.0, output: 18.0, cache: 0.4 });
});

// ─────────────────────────────────────────────────────────────────────────────
// A2 — receipt rendering for unpriced non-Gemini doors
// ─────────────────────────────────────────────────────────────────────────────

test('[A2-C1] buildCostSection: unpriced model renders token counts + explicit N/A cost, not $0.00', async () => {
    global.geminiFinOps = {
        streams: {
            s1: { input: 900000, cached: 100000, thought: 0, output: 200000 }
        }
    };
    try {
        const { costSection, finalUSD } = await buildCostSection({
            usedModel: 'deepseek-v4-pro-mod',
            isCrazyRouter: false,
            exchangeRateFetcher: async () => ({ rate: 4.0, indicator: 'test' })
        });
        assert.match(costSection, /Input:<\/b> 900,000/);
        assert.match(costSection, /Output:<\/b> 200,000/);
        assert.match(costSection, /Retail Value:<\/b> N\/A/);
        assert.match(costSection, /unpriced model/i);
        assert.equal(finalUSD, null);
    } finally {
        global.geminiFinOps = { streams: {} };
    }
});

test('[A2-C2] buildCostSection: priced non-Gemini model computes retail value from official rates', async () => {
    // 1M input @ $1.32 + 0 cache + 0.5M output @ $3.96 = $1.32 + $1.98 = $3.30
    global.geminiFinOps = {
        streams: {
            s1: { input: 1000000, cached: 0, thought: 0, output: 500000 }
        }
    };
    try {
        const { costSection, finalUSD } = await buildCostSection({
            usedModel: 'deepseek-v4-pro',
            isCrazyRouter: false,
            exchangeRateFetcher: async () => ({ rate: 4.0, indicator: 'test' })
        });
        assert.match(costSection, /Retail Value:<\/b> \$3\.30/);
        assert.equal(finalUSD, 3.3);
    } finally {
        global.geminiFinOps = { streams: {} };
    }
});

test('[A2-C3] buildCostSection: thought tokens render on the Thought line and bill as output', async () => {
    // kimi-k3: 1M input @ $2 + 0.43M thought @ $10 + 0.5M output @ $10 = $2 + $4.3 + $5 = $11.30
    global.geminiFinOps = {
        streams: {
            s1: { input: 1000000, cached: 0, thought: 430000, output: 500000 }
        }
    };
    try {
        const { costSection, finalUSD } = await buildCostSection({
            usedModel: 'kimi-k3',
            isCrazyRouter: false,
            exchangeRateFetcher: async () => ({ rate: 4.0, indicator: 'test' })
        });
        assert.match(costSection, /Thought:<\/b> 430,000/);
        assert.equal(finalUSD, 11.3);
    } finally {
        global.geminiFinOps = { streams: {} };
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// A2 — usage recording in the OpenAI-compatible provider (stream + non-stream)
// ─────────────────────────────────────────────────────────────────────────────

const OpenAICompatibleProvider = require('../services/providers/openaiCompatible');

function openAiStreamResponse(chunks) {
    const stream = new PassThrough();
    for (const c of chunks) stream.write(c);
    stream.end();
    return { data: stream };
}

test('[A2-U1] openaiCompatible stream: usage chunk populates the FinOps ledger', async () => {
    const provider = new OpenAICompatibleProvider({
        apiKey: 'sk-test',
        baseUrl: 'https://rootsys.cloud/v1',
        providerName: 'custom'
    });
    global.geminiFinOps = { streams: {} };
    const realPost = axios.post;
    axios.post = async () =>
        openAiStreamResponse([
            'data: ' + JSON.stringify({ choices: [{ delta: { content: 'OK' } }] }) + '\n\n',
            'data: ' +
                JSON.stringify({
                    choices: [{ delta: {}, finish_reason: 'stop' }],
                    usage: {
                        prompt_tokens: 16,
                        completion_tokens: 1,
                        prompt_cache_hit_tokens: 0,
                        completion_thinking_tokens: 0,
                        total_tokens: 17
                    }
                }) +
                '\n\n',
            'data: [DONE]\n\n'
        ]);
    try {
        const out = await provider.streamTranslateSubtitle('1\n00:00:01,000 --> 00:00:02,000\nHello', 'en', 'ms');
        assert.ok(out.length > 0);
        const ids = Object.keys(global.geminiFinOps.streams);
        assert.equal(ids.length, 1, 'exactly one ledger stream must be recorded');
        const s = global.geminiFinOps.streams[ids[0]];
        assert.equal(s.input, 16);
        assert.equal(s.output, 1);
        assert.equal(s.cached, 0);
        assert.equal(s.thought, 0);
    } finally {
        axios.post = realPost;
        global.geminiFinOps = { streams: {} };
    }
});

test('[A2-U2] openaiCompatible stream: DeepSeek-style superset fields map (cache hit + thinking)', async () => {
    const provider = new OpenAICompatibleProvider({
        apiKey: 'sk-test',
        baseUrl: 'https://rootsys.cloud/v1',
        providerName: 'custom'
    });
    global.geminiFinOps = { streams: {} };
    const realPost = axios.post;
    axios.post = async () =>
        openAiStreamResponse([
            'data: ' + JSON.stringify({ choices: [{ delta: { content: 'OK' } }] }) + '\n\n',
            'data: ' +
                JSON.stringify({
                    choices: [{ delta: {}, finish_reason: 'stop' }],
                    usage: {
                        prompt_tokens: 108,
                        completion_tokens: 59,
                        prompt_cache_hit_tokens: 8,
                        cache_read_input_tokens: 8,
                        completion_thinking_tokens: 43,
                        completion_tokens_details: { reasoning_tokens: 43 },
                        total_tokens: 167
                    }
                }) +
                '\n\n',
            'data: [DONE]\n\n'
        ]);
    try {
        await provider.streamTranslateSubtitle('1\n00:00:01,000 --> 00:00:02,000\nHello', 'en', 'ms');
        const ids = Object.keys(global.geminiFinOps.streams);
        const s = global.geminiFinOps.streams[ids[0]];
        assert.equal(s.input, 100); // 108 prompt − 8 cache-hit
        assert.equal(s.cached, 8);
        assert.equal(s.thought, 43);
        assert.equal(s.output, 16); // 59 completion − 43 thinking
    } finally {
        axios.post = realPost;
        global.geminiFinOps = { streams: {} };
    }
});

test('[A2-U3] openaiCompatible non-stream: response usage populates the ledger', async () => {
    const provider = new OpenAICompatibleProvider({
        apiKey: 'sk-test',
        baseUrl: 'https://rootsys.cloud/v1',
        providerName: 'custom'
    });
    global.geminiFinOps = { streams: {} };
    const realPost = axios.post;
    axios.post = async () => ({
        data: {
            model: 'deepseek-v4-pro',
            choices: [{ message: { role: 'assistant', content: 'OK' }, finish_reason: 'stop' }],
            usage: {
                prompt_tokens: 16,
                completion_tokens: 1,
                prompt_cache_hit_tokens: 0,
                total_tokens: 17
            }
        }
    });
    try {
        const out = await provider.translateSubtitle('1\n00:00:01,000 --> 00:00:02,000\nHello', 'en', 'ms');
        assert.ok(out.length > 0);
        const ids = Object.keys(global.geminiFinOps.streams);
        assert.equal(ids.length, 1, 'non-stream path must record usage too');
        const s = global.geminiFinOps.streams[ids[0]];
        assert.equal(s.input, 16);
        assert.equal(s.output, 1);
    } finally {
        axios.post = realPost;
        global.geminiFinOps = { streams: {} };
    }
});

test('[A2-U4] openaiCompatible stream: no usage in stream → no ledger entry (fail-open, no zeros)', async () => {
    const provider = new OpenAICompatibleProvider({
        apiKey: 'sk-test',
        baseUrl: 'https://legacy-gateway.test/v1',
        providerName: 'custom'
    });
    global.geminiFinOps = { streams: {} };
    const realPost = axios.post;
    axios.post = async () =>
        openAiStreamResponse([
            'data: ' + JSON.stringify({ choices: [{ delta: { content: 'OK' } }] }) + '\n\n',
            'data: [DONE]\n\n'
        ]);
    try {
        await provider.streamTranslateSubtitle('1\n00:00:01,000 --> 00:00:02,000\nHello', 'en', 'ms');
        assert.equal(Object.keys(global.geminiFinOps.streams).length, 0);
    } finally {
        axios.post = realPost;
        global.geminiFinOps = { streams: {} };
    }
});

// ─────────────────────────────────────────────────────────────────────────────
// A2 — usage recording in the Anthropic provider (stream + non-stream)
// ─────────────────────────────────────────────────────────────────────────────

const AnthropicProvider = require('../services/providers/anthropic');

function anthropicStreamResponse(events) {
    const stream = new PassThrough();
    for (const [event, payload] of events) {
        stream.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    }
    stream.end();
    return { data: stream };
}

test('[A2-U5] anthropic non-stream: usage block populates the ledger', async () => {
    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test', baseUrl: 'https://api.anthropic.com/v1' });
    global.geminiFinOps = { streams: {} };
    const realPost = axios.post;
    axios.post = async () => ({
        data: {
            content: [{ type: 'text', text: 'OK' }],
            usage: { input_tokens: 120, output_tokens: 30, cache_read_input_tokens: 20 }
        }
    });
    try {
        const out = await provider.translateSubtitle('1\n00:00:01,000 --> 00:00:02,000\nHello', 'en', 'ms');
        assert.ok(out.length > 0);
        const ids = Object.keys(global.geminiFinOps.streams);
        assert.equal(ids.length, 1, 'anthropic non-stream must record usage');
        const s = global.geminiFinOps.streams[ids[0]];
        assert.equal(s.input, 100); // 120 − 20 cache-read
        assert.equal(s.cached, 20);
        assert.equal(s.output, 30);
    } finally {
        axios.post = realPost;
        global.geminiFinOps = { streams: {} };
    }
});

test('[A2-U6] anthropic stream: message_start usage populates the ledger', async () => {
    const provider = new AnthropicProvider({ apiKey: 'sk-ant-test', baseUrl: 'https://api.anthropic.com/v1' });
    global.geminiFinOps = { streams: {} };
    const realPost = axios.post;
    axios.post = async () =>
        anthropicStreamResponse([
            ['message_start', { type: 'message_start', message: { usage: { input_tokens: 90, output_tokens: 1 } } }],
            ['content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text' } }],
            [
                'content_block_delta',
                { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'OK' } }
            ],
            [
                'message_delta',
                { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 12 } }
            ],
            ['message_stop', { type: 'message_stop' }]
        ]);
    try {
        const out = await provider.streamTranslateSubtitle('1\n00:00:01,000 --> 00:00:02,000\nHello', 'en', 'ms');
        assert.ok(out.length > 0);
        const ids = Object.keys(global.geminiFinOps.streams);
        assert.equal(ids.length, 1, 'anthropic stream must record usage');
        const s = global.geminiFinOps.streams[ids[0]];
        assert.equal(s.input, 90);
        assert.equal(s.output, 12); // message_delta output supersedes the initial 1
    } finally {
        axios.post = realPost;
        global.geminiFinOps = { streams: {} };
    }
});
