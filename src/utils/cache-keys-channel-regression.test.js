/**
 * Cache-key channel discrimination regression (Mandat P1 F6, 2026-11-10)
 *
 * Defect F6: `generateCacheKeys` pins every key to a static namespace
 * regardless of the trinity channel that will actually generate the
 * translation. Two configurations pointing the same file+language at
 * different doors (Gemini vs OpenAI vs Anthropic) therefore shared one
 * permanent cache entry — cross-door cache poisoning.
 *
 * [STRUCTURE-V5 2026-11-14] The key now also discriminates the trinity MODE
 * (`trinity-basic-` vs `trinity-pro-`): Pro output is KNP-guided and must
 * never be served to Basic runs (cross-mode poisoning), and the redesigned
 * prompt (v6) must never serve v4 output. Legacy configs default to Basic.
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
    assert.equal(gemini.baseKey, 'tt123_en_ms_trinity-basic-universal-v7_ch-gemini', 'exact v7 basic gemini key');
    assert.ok(openai.baseKey.includes('openai'), 'openai key carries the channel discriminator');
    assert.ok(anthropic.baseKey.includes('anthropic'), 'anthropic key carries the channel discriminator');
});

test('[F6-E] Trinity mode discriminates the v6 namespace (Basic vs Pro never share a key)', () => {
    const basic = generateCacheKeys({ trinityChannel: 'gemini' }, 'tt123_en', 'ms');
    const pro = generateCacheKeys({ trinityChannel: 'gemini', trinityMode: 'pro' }, 'tt123_en', 'ms');
    assert.equal(pro.baseKey, 'tt123_en_ms_trinity-pro-universal-v7_ch-gemini', 'exact v7 pro key');
    assert.notEqual(basic.baseKey, pro.baseKey, 'cross-mode cache poisoning must be impossible');
});

test('[F6-B] Same channel keeps a stable key across calls (deterministic derivation)', () => {
    const a = generateCacheKeys({ trinityChannel: 'gemini' }, 'tt123_en', 'ms');
    const b = generateCacheKeys({ trinityChannel: 'gemini' }, 'tt123_en', 'ms');
    assert.equal(a.baseKey, b.baseKey, 'identical inputs must derive an identical key');
    assert.equal(a.cacheKey, b.cacheKey);
});

test('[F6-C] Legacy config without trinityChannel/trinityMode defaults to the basic+gemini door key', () => {
    // The runtime default is the Gemini door in Basic mode; a config that
    // predates the channel/mode fields must keep reading the same namespace
    // as trinityChannel:'gemini' + trinityMode:'basic'.
    const legacy = generateCacheKeys({}, 'tt123_en', 'ms');
    const gemini = generateCacheKeys({ trinityChannel: 'gemini', trinityMode: 'basic' }, 'tt123_en', 'ms');
    assert.equal(legacy.baseKey, gemini.baseKey, 'legacy config maps onto the basic+gemini namespace');
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
