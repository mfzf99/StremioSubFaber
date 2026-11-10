/**
 * Cache-key channel discrimination regression (Mandat P1 F6, 2026-11-10)
 *
 * Defect F6: `generateCacheKeys` pins every key to the static namespace
 * `trinity-basic-universal-v3` regardless of the trinity channel that will
 * actually generate the translation. Two configurations pointing the same
 * file+language at different doors (Gemini vs OpenAI vs Anthropic) therefore
 * share one permanent cache entry — cross-door cache poisoning.
 *
 * After the fix, the key schema must include the trinity channel so that
 * identical (file, language) requests under different doors resolve to
 * distinct base keys, while the same door keeps its existing key unchanged
 * (backward-compatible reads for the active Basic+Gemini default).
 */

const test = require('node:test');
const assert = require('node:assert');
const { generateCacheKeys } = require('./cacheKeys');

test('[F6-A] Same file+language under different trinity channels produces distinct cache keys', () => {
    const gemini = generateCacheKeys({ trinityChannel: 'gemini' }, 'tt123_en', 'ms');
    const openai = generateCacheKeys({ trinityChannel: 'openai' }, 'tt123_en', 'ms');
    const anthropic = generateCacheKeys({ trinityChannel: 'anthropic' }, 'tt123_en', 'ms');

    assert.notEqual(gemini.baseKey, openai.baseKey, 'gemini and openai keys must not collide');
    assert.notEqual(gemini.baseKey, anthropic.baseKey, 'gemini and anthropic keys must not collide');
    assert.notEqual(openai.baseKey, anthropic.baseKey, 'openai and anthropic keys must not collide');
    assert.ok(gemini.baseKey.includes('gemini'), 'gemini key carries the channel discriminator');
    assert.ok(openai.baseKey.includes('openai'), 'openai key carries the channel discriminator');
    assert.ok(anthropic.baseKey.includes('anthropic'), 'anthropic key carries the channel discriminator');
});

test('[F6-B] Same channel keeps a stable key across calls (deterministic derivation)', () => {
    const a = generateCacheKeys({ trinityChannel: 'gemini' }, 'tt123_en', 'ms');
    const b = generateCacheKeys({ trinityChannel: 'gemini' }, 'tt123_en', 'ms');
    assert.equal(a.baseKey, b.baseKey, 'identical inputs must derive an identical key');
    assert.equal(a.cacheKey, b.cacheKey);
});

test('[F6-C] Legacy config without trinityChannel defaults to the gemini door key', () => {
    // The runtime default is the Gemini door; a config that predates the
    // channel field must keep reading the same namespace as trinityChannel:
    // 'gemini' so existing permanent caches are not orphaned.
    const legacy = generateCacheKeys({}, 'tt123_en', 'ms');
    const gemini = generateCacheKeys({ trinityChannel: 'gemini' }, 'tt123_en', 'ms');
    assert.equal(legacy.baseKey, gemini.baseKey, 'legacy config maps onto the gemini namespace');
});

test('[F6-D] Bypass user-scoping and ASS discriminators continue to work with the channel segment', () => {
    const bypass = generateCacheKeys(
        { trinityChannel: 'openai', bypassCache: true, __configHash: 'config-hash' },
        'tt123_en',
        'ms'
    );
    assert.ok(bypass.cacheKey.endsWith('__u_config-hash'), 'bypass scoping preserved');
    assert.ok(bypass.cacheKey.includes('openai'), 'bypass key carries the channel discriminator');

    const ass = generateCacheKeys({ trinityChannel: 'openai', convertAssToVtt: false }, 'tt123_en', 'ms');
    assert.ok(ass.baseKey.endsWith('_ass'), 'ASS discriminator preserved');
    assert.ok(ass.baseKey.includes('openai'), 'ASS key carries the channel discriminator');
});
