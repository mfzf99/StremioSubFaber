'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

// Stable 64-hex-char (32-byte) key keeps the deterministic-IV assertions
// independent of any local/CI .encryption-key state. Must be set before the
// module under test first reads the key through getEncryptionKey().
process.env.ENCRYPTION_KEY = 'a'.repeat(64);

const { encodeProviderUrl, decodeProviderUrl } = require('./providerUrlToken');

const SAMPLE_URL = 'https://dl.opensubtitles.org/en/download/file/src-api-v3/1234567';

test('encodeProviderUrl is deterministic for the same URL', () => {
    const first = encodeProviderUrl('v3_', SAMPLE_URL);
    const second = encodeProviderUrl('v3_', SAMPLE_URL);
    assert.equal(first, second);
});

test('encodeProviderUrl produces distinct tokens for distinct URLs', () => {
    const a = encodeProviderUrl('v3_', SAMPLE_URL);
    const b = encodeProviderUrl('v3_', `${SAMPLE_URL}?x=1`);
    assert.notEqual(a, b);
});

test('decodeProviderUrl round-trips the original URL without GCM tag errors', () => {
    const token = encodeProviderUrl('v3_', SAMPLE_URL);
    assert.equal(decodeProviderUrl(token, 'v3_'), SAMPLE_URL);
});
