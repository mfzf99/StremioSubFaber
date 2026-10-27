const test = require('node:test');
const assert = require('node:assert/strict');

const OpenSubtitlesV3Service = require('./opensubtitles-v3');

function createService(rows) {
    const service = new OpenSubtitlesV3Service();
    service.client = {
        get: async () => ({ data: { subtitles: rows } })
    };
    return service;
}

function makeRow(overrides = {}) {
    return {
        id: 'v3-test-row',
        url: 'https://subs5.strem.io/en/download/file/src-api/12345',
        lang: 'eng',
        subtitleFileName: 'Show.S01E02.1080p.WEB-DL.srt',
        movieReleaseName: 'Show.S01E02.1080p.WEB-DL',
        season: 1,
        episode: 2,
        ...overrides
    };
}

test('OpenSubtitles V3 preserves feed filename and structured episode metadata', async () => {
    const service = createService([makeRow()]);
    const results = await service.searchSubtitles({
        imdb_id: 'tt1234567',
        type: 'episode',
        season: 1,
        episode: 2,
        languages: ['eng']
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'Show.S01E02.1080p.WEB-DL');
    assert.equal(results[0].originalFilename, 'Show.S01E02.1080p.WEB-DL.srt');
    assert.equal(results[0].season, 1);
    assert.equal(results[0].episode, 2);
    assert.equal(results[0].languageCode, 'eng');
    assert.equal(results[0].format, 'srt');
});

test('OpenSubtitles V3 rejects stale episode metadata instead of returning wrong subtitles', async () => {
    const service = createService([
        makeRow(),
        makeRow({ id: 'wrong-episode', episode: 3, subtitleFileName: 'Show.S01E03.WEB.srt' }),
        makeRow({ id: 'wrong-season', season: 2, subtitleFileName: 'Show.S02E02.WEB.srt' })
    ]);
    const results = await service.searchSubtitles({
        imdb_id: 'tt2234567',
        type: 'episode',
        season: 1,
        episode: 2,
        languages: ['eng']
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].episode, 2);
    assert.equal(results[0].season, 1);
});

test('OpenSubtitles V3 recognizes a real season pack from feed metadata', async () => {
    const service = createService([
        makeRow({
            subtitleFileName: 'Show.S01.COMPLETE.1080p.WEB-DL.srt',
            movieReleaseName: 'Show.S01.COMPLETE.1080p.WEB-DL',
            season: null,
            episode: null
        })
    ]);
    const results = await service.searchSubtitles({
        imdb_id: 'tt3234567',
        type: 'episode',
        season: 1,
        episode: 2,
        languages: ['eng']
    });

    assert.equal(results.length, 1);
    assert.equal(results[0].is_season_pack, true);
    assert.equal(results[0].season_pack_season, 1);
    assert.equal(results[0].season_pack_episode, 2);
    assert.match(results[0].fileId, /_seasonpack_s1e2$/);
});

test('OpenSubtitles V3 uses release name when the feed has no filename', async () => {
    const service = new OpenSubtitlesV3Service();
    const results = await service.extractFilenames([
        makeRow({ subtitleFileName: '', movieReleaseName: 'Show.S01E02.1080p.WEB-DL' })
    ]);

    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'Show.S01E02.1080p.WEB-DL');
});

test('OpenSubtitles V3 preserves soft failure metadata for provider diagnostics', async () => {
    const service = new OpenSubtitlesV3Service();
    service.client = {
        get: async () => {
            throw Object.assign(new Error('DNS unavailable'), { code: 'EDESTRUCTION' });
        }
    };

    const results = await service.searchSubtitles({
        imdb_id: 'tt4234567',
        type: 'episode',
        season: 1,
        episode: 2,
        languages: ['eng']
    });

    assert.equal(results.length, 0);
    assert.equal(results.__providerError.code, 'EDESTRUCTION');
    assert.equal(Object.keys(results).includes('__providerError'), false);
});
