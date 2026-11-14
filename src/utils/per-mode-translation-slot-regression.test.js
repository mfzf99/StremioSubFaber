/**
 * [REGRESSION v3.34.0] Per-Mode Translation Slots (translationBasic / translationPro)
 *
 * Owner mandate (2026-11-14): the single shared `trinity.translation` slot made
 * Basic and Pro appear "synced" — a translation setup done in Basic shows up in
 * Pro. Surgery: two sibling slots (`trinity.translationBasic`, `trinity.translationPro`)
 * with `trinity.translation` retained as an ALIAS of the ACTIVE mode slot.
 *
 * Backend contract (config.js normalizeTrinityAgentParams step (0b)):
 *   1. Migration seeds the ACTIVE mode slot from a legacy `trinity.translation`
 *      exactly once (flag `__perModeSlotsSeeded`); the other mode stays fresh ({}).
 *   2. After seeding, `trinity.translation` is always rebuilt as a deep copy of
 *      the ACTIVE mode slot — legacy consumers (bridge, geminiBaseUrl fallback,
 *      factory params, key resolver) keep working unchanged.
 *   3. Slots survive round-trips without cross-mode sync.
 *   4. Alias points at the active slot after a mode change (hash saved in Pro).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeConfig } = require('./config');

function legacyBasicHash() {
    return {
        trinity: {
            mode: 'basic',
            translation: {
                apiKey: 'bk-1',
                model: 'basic-model',
                baseUrl: 'https://basic.example',
                provider: 'custom',
                door: 'openai-chat',
                params: { temperature: 0.3 }
            }
        }
    };
}

test('[S1] Legacy translation seeds ONLY the active mode slot; the other mode stays fresh', () => {
    const cfg = normalizeConfig(legacyBasicHash());
    assert.ok(cfg.trinity.translationBasic, 'translationBasic slot must exist');
    assert.ok(cfg.trinity.translationPro, 'translationPro slot must exist');
    assert.equal(cfg.trinity.translationBasic.apiKey, 'bk-1', 'active Basic slot inherits legacy credentials');
    assert.equal(cfg.trinity.translationBasic.model, 'basic-model');
    assert.equal(cfg.trinity.translationPro.apiKey, undefined, 'Pro slot must start FRESH (no sync)');
    assert.equal(cfg.trinity.translationPro.model, undefined);
});

test('[S2] Round-trip keeps slots separated (no cross-mode sync across normalize passes)', () => {
    const input = {
        trinity: {
            mode: 'basic',
            translationBasic: { apiKey: 'bb-1', model: 'm-basic' },
            translationPro: { apiKey: 'pp-1', model: 'm-pro' }
        }
    };
    const once = normalizeConfig(JSON.parse(JSON.stringify(input)));
    assert.equal(once.trinity.translationBasic.apiKey, 'bb-1');
    assert.equal(once.trinity.translationPro.apiKey, 'pp-1');
    const twice = normalizeConfig(JSON.parse(JSON.stringify(once)));
    assert.equal(twice.trinity.translationBasic.apiKey, 'bb-1', 'Basic slot unchanged');
    assert.equal(twice.trinity.translationPro.apiKey, 'pp-1', 'Pro slot unchanged — no re-seed, no sync');
    assert.equal(twice.trinity.translation.apiKey, 'bb-1', 'alias tracks ACTIVE (basic) slot');
});

test('[S3] Alias always mirrors the ACTIVE mode slot (Pro hash → alias = translationPro)', () => {
    const cfg = normalizeConfig({
        trinity: {
            mode: 'pro',
            translationBasic: { apiKey: 'bb-2', model: 'm-b2' },
            translationPro: { apiKey: 'pp-2', model: 'm-p2' }
        }
    });
    assert.equal(cfg.trinity.translation.apiKey, 'pp-2', 'alias must point at the Pro slot');
    assert.equal(cfg.trinity.translation.model, 'm-p2');
    assert.equal(cfg.trinity.translationBasic.apiKey, 'bb-2', 'Basic slot untouched');
});

test('[S3b] Mode switch changes the alias target on next normalize', () => {
    const input = {
        trinity: {
            mode: 'basic',
            translationBasic: { apiKey: 'bb-3', model: 'm-b3' },
            translationPro: { apiKey: 'pp-3', model: 'm-p3' }
        }
    };
    const basic = normalizeConfig(JSON.parse(JSON.stringify(input)));
    assert.equal(basic.trinity.translation.apiKey, 'bb-3');
    input.trinity.mode = 'pro';
    const pro = normalizeConfig(JSON.parse(JSON.stringify(input)));
    assert.equal(pro.trinity.translation.apiKey, 'pp-3', 'after switching to pro the alias follows translationPro');
});

test('[S4] Bridge still routes from the alias (custom provider → mainProvider=custom)', () => {
    const cfg = normalizeConfig({
        trinity: {
            mode: 'basic',
            translationBasic: {
                apiKey: 'k-root',
                model: 'deepseek-v4-pro',
                baseUrl: 'https://rootsys.cloud/v1',
                provider: 'custom',
                door: 'openai-chat'
            }
        }
    });
    assert.equal(cfg.mainProvider, 'custom', 'bridge must keep routing via the alias');
    assert.equal(cfg.trinity.translation.model, 'deepseek-v4-pro');
    assert.equal(cfg.providers?.custom?.apiKey, 'k-root', 'provider block materialised from the aliased slot');
});

test('[S5] Params migration lands on the ACTIVE mode slot (legacy advancedSettings)', () => {
    const cfg = normalizeConfig({
        trinity: { mode: 'pro', translationPro: { apiKey: 'pp-4', model: 'm-p4' } },
        mainProvider: 'gemini',
        advancedSettings: { temperature: 0.7, maxOutputTokens: 8192 },
        __advancedSettingsProvided: true
    });
    assert.equal(cfg.trinity.translationPro.params?.temperature, 0.7, 'active (pro) slot receives migrated params');
    assert.equal(cfg.trinity.translationBasic.params, null, 'inactive slot stays params-null');
    assert.equal(cfg.trinity.translation.params?.temperature, 0.7, 'alias carries the migrated params');
});

test('[S5b] Per-mode params drive configHash discrimination', () => {
    const base = {
        trinity: {
            mode: 'pro',
            translationBasic: { apiKey: 'same-key', model: 'same-model', params: { temperature: 0.2 } },
            translationPro: { apiKey: 'same-key', model: 'same-model', params: { temperature: 0.9 } }
        }
    };
    const cfg = normalizeConfig(JSON.parse(JSON.stringify(base)));
    assert.equal(cfg.trinity.translation.params.temperature, 0.9, 'active pro params visible via alias');
    assert.equal(cfg.trinity.translationBasic.params.temperature, 0.2, 'basic params preserved separately');
    assert.notEqual(
        JSON.stringify(cfg.trinity.translationBasic.params),
        JSON.stringify(cfg.trinity.translationPro.params),
        'per-mode params must never collapse into one value'
    );
});

test('[S6] Empty trinity block still yields both slots + alias (defensive)', () => {
    const cfg = normalizeConfig({ trinity: {} });
    assert.ok(cfg.trinity.translationBasic, 'translationBasic exists on empty block');
    assert.ok(cfg.trinity.translationPro, 'translationPro exists on empty block');
    assert.equal(cfg.trinity.translationBasic.apiKey, undefined);
    assert.equal(cfg.trinity.translationPro.apiKey, undefined);
    assert.ok(cfg.trinity.translation, 'alias exists on empty block');
});

test('[S6b] Fresh default config never seeds slots from alias defaults', () => {
    const cfg = normalizeConfig({});
    assert.equal(cfg.trinity.mode, 'basic');
    assert.equal(cfg.trinity.translationBasic.apiKey, undefined, 'fresh Basic slot stays empty');
    assert.equal(cfg.trinity.translationPro.apiKey, undefined, 'fresh Pro slot stays empty');
});
