const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { collectProviderSearchResults, deduplicateSearch, finalizeSubtitleResults } = require('./subtitles');

function makeSubtitle(id, languageCode) {
    return {
        id,
        fileId: id,
        languageCode,
        name: `${id}.srt`,
        provider: 'test'
    };
}

test('subtitle handler does not define route/cache fallback timeout knobs', () => {
    const source = fs.readFileSync(path.join(__dirname, 'subtitles.js'), 'utf8');

    assert.equal(source.includes('SUBTITLE_ROUTE_FALLBACK_TIMEOUT_MS'), false);
    assert.equal(source.includes('SUBTITLE_CACHE_PHASE_TIMEOUT_MS'), false);
    assert.equal(source.includes('withFallbackTimeout'), false);
    assert.equal(source.includes('continuing with fallback'), false);
});

test('finalizeSubtitleResults ranks before deduplicating so the best duplicate survives', () => {
    const makeDuplicate = (provider, downloads) => ({
        id: provider,
        fileId: provider,
        languageCode: 'eng',
        language: 'en',
        name: 'Show.S01E02.1080p.WEB-DL',
        provider,
        downloads,
        rating: 0,
        uploadDate: null,
        format: 'srt',
        hearing_impaired: false
    });

    const results = finalizeSubtitleResults(
        [makeDuplicate('subdl', 1), makeDuplicate('opensubtitles-v3', 1000)],
        ['eng'],
        { deduplicateSubtitles: true },
        {
            streamFilename: 'Show.S01E02.1080p.WEB-DL.mkv',
            videoInfo: { type: 'episode', season: 1, episode: 2 }
        }
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].provider, 'opensubtitles-v3');
});

test('provider search timeout marks returned results as partial', async () => {
    const results = await collectProviderSearchResults(
        [
            {
                provider: 'fast-provider',
                promise: Promise.resolve({
                    provider: 'fast-provider',
                    results: [makeSubtitle('srp_1', 'srp'), makeSubtitle('srp_2', 'srp'), makeSubtitle('srp_3', 'srp')]
                })
            },
            {
                provider: 'slow-provider',
                promise: new Promise((resolve) =>
                    setTimeout(
                        () =>
                            resolve({
                                provider: 'slow-provider',
                                results: [
                                    makeSubtitle('eng_1', 'eng'),
                                    makeSubtitle('eng_2', 'eng'),
                                    makeSubtitle('eng_3', 'eng')
                                ]
                            }),
                        40
                    )
                )
            }
        ],
        [],
        {
            logContext: 'Test',
            orchestrationTimeoutMs: 5
        }
    );

    assert.equal(results.length, 3);
    assert.equal(results.__partialProviderResults, true);
    assert.deepEqual(results.__providerDiagnostics, [
        { provider: 'fast-provider', status: 'success', count: 3 },
        { provider: 'slow-provider', status: 'timeout', count: 0 }
    ]);
    assert.deepEqual(
        results.map((sub) => sub.languageCode),
        ['srp', 'srp', 'srp']
    );
});

test('provider search errors mark returned results as partial', async () => {
    const results = await collectProviderSearchResults(
        [
            {
                provider: 'fast-provider',
                promise: Promise.resolve({
                    provider: 'fast-provider',
                    results: [makeSubtitle('srp_1', 'srp'), makeSubtitle('srp_2', 'srp'), makeSubtitle('srp_3', 'srp')]
                })
            },
            {
                provider: 'rate-limited-provider',
                promise: Promise.resolve({
                    provider: 'rate-limited-provider',
                    results: [],
                    error: Object.assign(new Error('provider rate limited'), {
                        statusCode: 429,
                        type: 'rate_limit'
                    })
                })
            }
        ],
        [],
        {
            logContext: 'Test',
            orchestrationTimeoutMs: 100
        }
    );

    assert.equal(results.length, 3);
    assert.equal(results.__partialProviderResults, true);
    assert.deepEqual(results.__providerDiagnostics, [
        { provider: 'fast-provider', status: 'success', count: 3 },
        { provider: 'rate-limited-provider', status: 'error', category: 'http_429', count: 0 }
    ]);
});

test('provider soft failures are diagnosed as errors rather than successful empty searches', async () => {
    const softFailedResults = [];
    Object.defineProperty(softFailedResults, '__providerError', {
        value: Object.assign(new Error('DNS unavailable'), { code: 'EDESTRUCTION' }),
        enumerable: false
    });

    const results = await collectProviderSearchResults(
        [
            {
                provider: 'opensubtitles-v3',
                promise: Promise.resolve({ provider: 'opensubtitles-v3', results: softFailedResults })
            }
        ],
        [],
        { logContext: 'Test' }
    );

    assert.equal(results.__partialProviderResults, true);
    assert.deepEqual(results.__providerDiagnostics, [
        { provider: 'opensubtitles-v3', status: 'error', category: 'edestruction', count: 0 }
    ]);

    const emptyResults = await collectProviderSearchResults(
        [{ provider: 'opensubtitles-v3', promise: Promise.resolve({ provider: 'opensubtitles-v3', results: [] }) }],
        [],
        { logContext: 'Test' }
    );

    assert.equal(emptyResults.__partialProviderResults, undefined);
    assert.deepEqual(emptyResults.__providerDiagnostics, [
        { provider: 'opensubtitles-v3', status: 'success', count: 0 }
    ]);
});

test('provider search rejects are folded into partial results', async () => {
    const results = await collectProviderSearchResults(
        [
            {
                provider: 'fast-provider',
                promise: Promise.resolve({
                    provider: 'fast-provider',
                    results: [makeSubtitle('srp_1', 'srp'), makeSubtitle('srp_2', 'srp'), makeSubtitle('srp_3', 'srp')]
                })
            },
            {
                provider: 'rejecting-provider',
                promise: Promise.reject(new Error('socket reset'))
            }
        ],
        [],
        {
            logContext: 'Test',
            orchestrationTimeoutMs: 100
        }
    );

    assert.equal(results.length, 3);
    assert.equal(results.__partialProviderResults, true);
});

test('deduplicateSearch does not cache partial provider results', async () => {
    const key = `test-partial-provider-results-${Date.now()}-${Math.random()}`;
    let calls = 0;

    const runSearch = () =>
        deduplicateSearch(key, async () => {
            calls += 1;
            const results = [
                makeSubtitle(`srp_${calls}_1`, 'srp'),
                makeSubtitle(`srp_${calls}_2`, 'srp'),
                makeSubtitle(`srp_${calls}_3`, 'srp')
            ];
            Object.defineProperty(results, '__partialProviderResults', {
                value: true,
                enumerable: false
            });
            return results;
        });

    const first = await runSearch();
    const second = await runSearch();

    assert.equal(calls, 2);
    assert.notDeepEqual(
        first.map((sub) => sub.id),
        second.map((sub) => sub.id)
    );
});

test('deduplicateSearch times out and evicts stuck in-flight searches', async () => {
    const key = `test-stuck-provider-search-${Date.now()}-${Math.random()}`;
    let releaseStuckSearch;
    let calls = 0;

    const stuckSearch = new Promise((resolve) => {
        releaseStuckSearch = resolve;
    });

    const first = await deduplicateSearch(
        key,
        () => {
            calls += 1;
            return stuckSearch;
        },
        {
            timeoutMs: 5,
            timeoutFallback: () => {
                const results = [];
                Object.defineProperty(results, '__partialProviderResults', {
                    value: true,
                    enumerable: false
                });
                return results;
            }
        }
    );

    assert.equal(calls, 1);
    assert.equal(first.length, 0);
    assert.equal(first.__partialProviderResults, true);

    const second = await deduplicateSearch(
        key,
        async () => {
            calls += 1;
            return [makeSubtitle('fresh_1', 'eng'), makeSubtitle('fresh_2', 'eng'), makeSubtitle('fresh_3', 'eng')];
        },
        {
            timeoutMs: 100
        }
    );

    releaseStuckSearch([]);

    assert.equal(calls, 2);
    assert.equal(second.length, 3);
    assert.deepEqual(
        second.map((sub) => sub.id),
        ['fresh_1', 'fresh_2', 'fresh_3']
    );
});
