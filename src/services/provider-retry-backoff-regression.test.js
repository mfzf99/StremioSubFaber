'use strict';

/**
 * Regresi Pariti Retry-Backoff (2026-10-09)
 *
 * Ground truth forensik: log live owner — custom provider (rootsys.cloud,
 * deepseek-v4-pro) batch 10/13 gagal HTTP 502; gelung retry stream meluru
 * 3 percubaan dalam 37ms (tiada delay) lalu membunuh job 69% siap. Gemini
 * ada retryWithBackoff 3s/6s/12s + jitter. Mandat owner: pariti 1:1.
 *
 * Kontrak yang diuji:
 *   1. openaiCompatible.js — gelung retry non-stream & stream BERDELAY
 *      exponential (contoh: attempt 1 < attempt 2 < attempt 3 dalam ms).
 *   2. anthropic.js — gelung retry non-stream & stream BERDELAY.
 *   3. deepl.js — gelung retry BERDELAY.
 *   4. Formula helper — 0 eksplisit melumpuhkan; env override dihormati;
 *      growth exponential tepat (2^attempt).
 *   5. Keutamaan: options > env > lalai 3000 (pariti Gemini).
 *
 * Kelajuan: test menggunakan base kecil (20-40ms) melalui options
 * retryBackoffBaseMs — bukan env global — supaya tidak melambatkan suite.
 */

const test = require('node:test');
const assert = require('node:assert');
const axios = require('axios');

const OpenAICompatibleProvider = require('./providers/openaiCompatible');
const AnthropicProvider = require('./providers/anthropic');
const DeepLProvider = require('./providers/deepl');
const {
    DEFAULT_BACKOFF_BASE_MS,
    ENV_OVERRIDE_KEY,
    resolveBackoffBaseMs,
    computeRetryDelayMs
} = require('./providers/retryBackoff');

/**
 * Mock axios.post yang sentiasa gagal dan rakam timestamp setiap panggilan.
 * @param {Array<number>} calls - Sinkai timestamps panggilan (diisi semasa mock aktif)
 * @param {Error} [error] - Ralat yang dilempar (lalai: 502 seperti forensik)
 */
function installFailingAxiosPost(calls, error) {
    const original = axios.post;
    const fail =
        error ||
        (() => {
            const err = new Error('Request failed with status code 502');
            err.response = { status: 502, data: { error: { message: 'Bad Gateway' } } };
            return err;
        })();
    axios.post = async () => {
        calls.push(Date.now());
        throw fail;
    };
    return () => {
        axios.post = original;
    };
}

test('retryBackoff helper: keutamaan options > env > lalai 3000 (pariti Gemini)', () => {
    const envBefore = process.env[ENV_OVERRIDE_KEY];
    try {
        // 1. Lalai — tiada options, tiada env
        delete process.env[ENV_OVERRIDE_KEY];
        assert.equal(resolveBackoffBaseMs(undefined), DEFAULT_BACKOFF_BASE_MS);
        assert.equal(DEFAULT_BACKOFF_BASE_MS, 3000, 'lalai mesti 3000ms = Gemini');

        // 2. Env override
        process.env[ENV_OVERRIDE_KEY] = '1500';
        assert.equal(resolveBackoffBaseMs(undefined), 1500);

        // 3. Options menang ke atas env
        assert.equal(resolveBackoffBaseMs(77), 77);

        // 4. 0 eksplisit = melumpuhkan (bukan jatuh ke lalai)
        process.env[ENV_OVERRIDE_KEY] = '0';
        assert.equal(resolveBackoffBaseMs(undefined), 0);
        assert.equal(resolveBackoffBaseMs(0), 0);

        // 5. Nilai tidak sah jatuh ke lalai
        delete process.env[ENV_OVERRIDE_KEY];
        assert.equal(resolveBackoffBaseMs(-5), DEFAULT_BACKOFF_BASE_MS);
        assert.equal(resolveBackoffBaseMs('abc'), DEFAULT_BACKOFF_BASE_MS);
    } finally {
        if (envBefore === undefined) delete process.env[ENV_OVERRIDE_KEY];
        else process.env[ENV_OVERRIDE_KEY] = envBefore;
    }
});

test('retryBackoff helper: growth exponential 2^attempt + floor 50ms', () => {
    // Fixed Math.random untuk ujian deterministic jitter
    const originalRandom = Math.random;
    Math.random = () => 0.5; // jitter tepat 1.0x
    try {
        assert.equal(computeRetryDelayMs(0, 1000), 1000);
        assert.equal(computeRetryDelayMs(1, 1000), 2000);
        assert.equal(computeRetryDelayMs(2, 1000), 4000);
        assert.equal(computeRetryDelayMs(3, 1000), 8000);
        // Floor 50ms untuk delay kecil yang aktif
        assert.equal(computeRetryDelayMs(0, 1), 50);
        // Base 0 = tiada delay langsung
        assert.equal(computeRetryDelayMs(2, 0), 0);
    } finally {
        Math.random = originalRandom;
    }
});

test('OpenAICompatibleProvider: gelung retry non-stream kini BERDELAY exponential (forensik 502)', async () => {
    const calls = [];
    const restore = installFailingAxiosPost(calls);
    try {
        const provider = new OpenAICompatibleProvider({
            apiKey: 'k',
            baseUrl: 'https://x.example/v1',
            providerName: 'custom',
            model: 'deepseek-v4-pro',
            maxRetries: 2,
            // 40ms: attempt0 → floor 50ms, attempt1 → 64-96ms — exponential
            // sentiasa melepasi floor, deterministik untuk assertion growth.
            retryBackoffBaseMs: 40
        });

        await assert.rejects(() => provider.translateSubtitle('1. hello', 'en', 'ms'), /server error|502|translation/i);

        assert.equal(calls.length, 3, 'mesti tepat 3 panggilan (1 + 2 retry)');
        const gap1 = calls[1] - calls[0];
        const gap2 = calls[2] - calls[1];
        assert.ok(gap1 >= 45, `gap1 mesti >= 45ms (dapat ${gap1}ms) — sebelum patch: 0ms`);
        assert.ok(gap2 >= 55, `gap2 mesti >= 55ms (dapat ${gap2}ms)`);
        assert.ok(gap2 > gap1, `gap2 (${gap2}ms) mesti > gap1 (${gap1}ms) — exponential`);
    } finally {
        restore();
    }
});

test('OpenAICompatibleProvider: gelung retry STREAM kini BERDELAY (laluan forensik rootsys 502)', async () => {
    const calls = [];
    const restore = installFailingAxiosPost(calls);
    try {
        const provider = new OpenAICompatibleProvider({
            apiKey: 'k',
            baseUrl: 'https://x.example/v1',
            providerName: 'custom',
            model: 'deepseek-v4-pro',
            maxRetries: 2,
            retryBackoffBaseMs: 40
        });

        await assert.rejects(
            () => provider.streamTranslateSubtitle('1. hello', 'en', 'ms'),
            /server error|502|translation/i
        );

        assert.equal(calls.length, 3, 'mesti tepat 3 panggilan stream (1 + 2 retry)');
        const gap1 = calls[1] - calls[0];
        const gap2 = calls[2] - calls[1];
        assert.ok(gap1 >= 45, `gap1 mesti >= 45ms (dapat ${gap1}ms) — forensik: 37ms untuk 3 retry`);
        assert.ok(gap2 >= 55, `gap2 mesti >= 55ms (dapat ${gap2}ms)`);
        assert.ok(gap2 > gap1, `gap2 (${gap2}ms) mesti > gap1 (${gap1}ms)`);
    } finally {
        restore();
    }
});

test('OpenAICompatibleProvider: retryBackoffBaseMs=0 eksplisit memelihara tingkah laku lama (tiada delay)', async () => {
    const calls = [];
    const restore = installFailingAxiosPost(calls);
    try {
        const provider = new OpenAICompatibleProvider({
            apiKey: 'k',
            baseUrl: 'https://x.example/v1',
            providerName: 'custom',
            model: 'deepseek-v4-pro',
            maxRetries: 2,
            retryBackoffBaseMs: 0
        });

        await assert.rejects(() => provider.translateSubtitle('1. hello', 'en', 'ms'), /server error|502|translation/i);

        assert.equal(calls.length, 3);
        const totalWindow = calls[2] - calls[0];
        assert.ok(totalWindow < 100, `tingkah laku lama (0ms) dipelihara bila eksplisit (dapat ${totalWindow}ms)`);
    } finally {
        restore();
    }
});

test('AnthropicProvider: kedua-dua gelung retry BERDELAY exponential', async () => {
    // Non-stream
    {
        const calls = [];
        const restore = installFailingAxiosPost(calls);
        try {
            const provider = new AnthropicProvider({
                apiKey: 'k',
                model: 'claude-sonnet-4-5',
                maxRetries: 2,
                retryBackoffBaseMs: 40
            });
            await assert.rejects(
                () => provider.translateSubtitle('1. hello', 'en', 'ms'),
                /server error|502|translation/i
            );
            assert.equal(calls.length, 3);
            const gap1 = calls[1] - calls[0];
            const gap2 = calls[2] - calls[1];
            assert.ok(gap1 >= 45, `non-stream gap1 >= 45ms (dapat ${gap1}ms)`);
            assert.ok(gap2 >= 55, `non-stream gap2 >= 55ms (dapat ${gap2}ms)`);
            assert.ok(gap2 > gap1, `non-stream exponential: ${gap2}ms > ${gap1}ms`);
        } finally {
            restore();
        }
    }
    // Stream
    {
        const calls = [];
        const restore = installFailingAxiosPost(calls);
        try {
            const provider = new AnthropicProvider({
                apiKey: 'k',
                model: 'claude-sonnet-4-5',
                maxRetries: 2,
                retryBackoffBaseMs: 40
            });
            await assert.rejects(
                () => provider.streamTranslateSubtitle('1. hello', 'en', 'ms'),
                /server error|502|translation/i
            );
            assert.equal(calls.length, 3);
            const gap1 = calls[1] - calls[0];
            const gap2 = calls[2] - calls[1];
            assert.ok(gap1 >= 45, `stream gap1 >= 45ms (dapat ${gap1}ms)`);
            assert.ok(gap2 >= 55, `stream gap2 >= 55ms (dapat ${gap2}ms)`);
        } finally {
            restore();
        }
    }
});

test('DeepLProvider: gelung retry BERDELAY exponential', async () => {
    const calls = [];
    const restore = installFailingAxiosPost(calls);
    try {
        const provider = new DeepLProvider({
            apiKey: 'deepl-key',
            maxRetries: 2,
            retryBackoffBaseMs: 40
        });
        await assert.rejects(() => provider.translateSubtitle('1. hello', 'en', 'ms'), /server error|502|translation/i);
        assert.equal(calls.length, 3);
        const gap1 = calls[1] - calls[0];
        const gap2 = calls[2] - calls[1];
        assert.ok(gap1 >= 45, `gap1 >= 45ms (dapat ${gap1}ms)`);
        assert.ok(gap2 >= 55, `gap2 >= 55ms (dapat ${gap2}ms)`);
        assert.ok(gap2 > gap1, `exponential: ${gap2}ms > ${gap1}ms`);
    } finally {
        restore();
    }
});

test('Pariti: formula provider = formula Gemini (baseDelay * 2^attempt, jitter 0.8x-1.2x, floor 50ms)', () => {
    const originalRandom = Math.random;
    Math.random = () => 0.5; // 1.0x — membolehkan perbandingan tepat
    try {
        // Nilai rujukan Gemini retryWithBackoff (gemini.js:1143-1149):
        //   delay = baseDelay * Math.pow(2, attempt)
        //   jittered = Math.max(50, Math.round(delay * (0.8 + random()*0.4)))
        const geminiDelay = (attempt, base) => Math.max(50, Math.round(base * Math.pow(2, attempt) * 1.0));
        for (const base of [3000, 1000, 25]) {
            for (const attempt of [0, 1, 2, 3]) {
                assert.equal(
                    computeRetryDelayMs(attempt, base),
                    geminiDelay(attempt, base),
                    `base=${base} attempt=${attempt} mesti identik dengan formula Gemini`
                );
            }
        }
    } finally {
        Math.random = originalRandom;
    }
});
