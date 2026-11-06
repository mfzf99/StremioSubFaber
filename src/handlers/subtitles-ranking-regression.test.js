const test = require('node:test');
const assert = require('node:assert/strict');

const { rankSubtitlesByFilename, parseReleaseMetadata } = require('./subtitles');

const STREAM_FILENAME = 'Two.and.a.Half.Men.S12E10.1080p.WEB-DL.x265-NTb.mkv';
const VIDEO_INFO = { type: 'episode', season: 12, episode: 10 };

function makeSubtitle(id, properties = {}) {
    return {
        id,
        name: 'Generic English subtitles',
        provider: 'test',
        downloads: 0,
        rating: 0,
        uploadDate: null,
        ...properties
    };
}

function rankIds(subtitles, streamFilename = STREAM_FILENAME, videoInfo = VIDEO_INFO) {
    return rankSubtitlesByFilename(subtitles, streamFilename, videoInfo).map((subtitle) => subtitle.id);
}

test('release metadata ranks candidates within the confirmed hash group before provider priority and popularity', () => {
    const ranked = rankIds([
        makeSubtitle('hash-wrong-release', {
            hashMatch: true,
            hashMatchPriority: 0,
            originalFilename: 'Wrong.Show.S12E10.720p.HDTV.x264-GROUP.srt',
            downloads: 1000000,
            rating: 10
        }),
        makeSubtitle('hash-right-release', {
            hashMatch: true,
            hashMatchPriority: 10,
            originalFilename: 'Two.and.a.Half.Men.S12E10.1080p.WEB-DL.x265-NTb.srt',
            downloads: 1,
            rating: 1
        }),
        makeSubtitle('non-hash-perfect-release', {
            originalFilename: 'Two.and.a.Half.Men.S12E10.1080p.WEB-DL.x265-NTb.srt',
            downloads: 1000000,
            rating: 10
        })
    ]);

    assert.deepEqual(ranked, ['hash-right-release', 'hash-wrong-release', 'non-hash-perfect-release']);
});

test('matching episode evidence ranks a confirmed hash candidate before provider priority and popularity', () => {
    const ranked = rankIds([
        makeSubtitle('hash-wrong-episode', {
            hashMatch: true,
            hashMatchPriority: 0,
            name: 'Wrong.Show.S12E11.1080p.WEB-DL.x265-NTb',
            downloads: 1000000,
            rating: 10
        }),
        makeSubtitle('hash-right-episode', {
            hashMatch: true,
            hashMatchPriority: 10,
            name: 'Two.and.a.Half.Men.S12E10.1080p.WEB-DL.x265-NTb',
            downloads: 1,
            rating: 1
        })
    ]);

    assert.deepEqual(ranked, ['hash-right-episode', 'hash-wrong-episode']);
});

test('a confirmed hash without release metadata still precedes every non-hash candidate', () => {
    const ranked = rankIds([
        makeSubtitle('non-hash-perfect', {
            name: 'Two.and.a.Half.Men.S12E10.1080p.WEB-DL.x265-NTb',
            downloads: 1000000,
            rating: 10
        }),
        makeSubtitle('hash-no-metadata', {
            hashMatch: true,
            hashMatchPriority: 0
        })
    ]);

    assert.deepEqual(ranked, ['hash-no-metadata', 'non-hash-perfect']);
});

test('provider hash priority resolves equal release and episode evidence before quality', () => {
    const ranked = rankIds([
        makeSubtitle('hash-later-popular', {
            hashMatch: true,
            hashMatchPriority: 2,
            name: 'Two.and.a.Half.Men.S12E10.1080p.WEB-DL.x265-NTb',
            downloads: 1000000,
            rating: 10
        }),
        makeSubtitle('hash-first', {
            hashMatch: true,
            hashMatchPriority: 0,
            name: 'Two.and.a.Half.Men.S12E10.1080p.WEB-DL.x265-NTb',
            downloads: 0,
            rating: 0
        })
    ]);

    assert.deepEqual(ranked, ['hash-first', 'hash-later-popular']);
});

test('original filename and SubDL releases arrays contribute release evidence when display names are generic', () => {
    const ranked = rankIds([
        makeSubtitle('generic-popular', {
            downloads: 1000000,
            rating: 10
        }),
        makeSubtitle('original-filename', {
            originalFilename: 'Two.and.a.Half.Men.S12E10.1080p.WEB-DL.x265-NTb.srt'
        }),
        makeSubtitle('subdl-release', {
            provider: 'subdl',
            releases: ['Two.and.a.Half.Men.S12E10.720p.HDTV.x264-OTHER']
        })
    ]);

    assert.deepEqual(ranked, ['original-filename', 'subdl-release', 'generic-popular']);
});

test('stronger fingerprint evidence cannot be outranked by a weaker sync match or an external priority tier', () => {
    const movieFilename = 'Movie.2020.1080p.WEB-DL.x264-GROUP.mkv';
    const ranked = rankIds(
        [
            makeSubtitle('external-priority-perfect', {
                providerBestMatch: true,
                providerBestMatchPriority: 0,
                originalFilename: 'Movie.2020.1080p.WEB-DL.x264-GROUP.srt'
            }),
            makeSubtitle('three-field-match', {
                name: 'Movie.2020.1080p.WEB-DL.x264-OTHER'
            }),
            makeSubtitle('weaker-popular', {
                name: 'Movie.2020.720p.HDTV.x264-OTHER',
                downloads: 1000000,
                rating: 10
            })
        ],
        movieFilename,
        { type: 'movie' }
    );

    assert.deepEqual(ranked, ['external-priority-perfect', 'three-field-match', 'weaker-popular']);
});

test('any positive sync-score difference takes precedence over downloads ratings and upload date', () => {
    const ranked = rankIds([
        makeSubtitle('popular-wrong-source', {
            name: 'Two.and.a.Half.Men.S12E10',
            downloads: 1000000,
            rating: 10,
            uploadDate: new Date().toISOString()
        }),
        makeSubtitle('right-source', {
            name: 'Two.and.a.Half.Men.S12E10.1080p'
        })
    ]);

    assert.deepEqual(ranked, ['right-source', 'popular-wrong-source']);
});

test('quality still resolves candidates with equal sync scores', () => {
    const name = 'Two.and.a.Half.Men.S12E10.1080p.WEB-DL.x265-NTb';
    const ranked = rankIds([
        makeSubtitle('equal-sync-low-quality', { name, downloads: 1, rating: 1 }),
        makeSubtitle('equal-sync-high-quality', { name, downloads: 100000, rating: 10 })
    ]);

    assert.deepEqual(ranked, ['equal-sync-high-quality', 'equal-sync-low-quality']);
});

test('release parsing strips media extensions and rejects technical suffixes as release groups', () => {
    assert.equal(parseReleaseMetadata(STREAM_FILENAME).releaseGroup, 'ntb');
    assert.equal(parseReleaseMetadata('Movie.2020.1080p.WEB-DL.x264-GROUP.srt').releaseGroup, 'group');
    assert.equal(parseReleaseMetadata('Movie.2020.1080p.WEB-DL.x264.mkv').releaseGroup, null);
    assert.equal(parseReleaseMetadata('Movie.2020.1080p.WEB-DL.x264.srt').releaseGroup, null);
});

test('ranking does not mutate inputs or expose temporary ranking fields', () => {
    const original = makeSubtitle('original', {
        name: STREAM_FILENAME,
        originalFilename: STREAM_FILENAME.replace(/\.mkv$/, '.srt'),
        hashMatch: true,
        hashMatchPriority: 4
    });
    const snapshot = structuredClone(original);
    const [ranked] = rankSubtitlesByFilename([original], STREAM_FILENAME, VIDEO_INFO);

    assert.deepEqual(original, snapshot);
    assert.notStrictEqual(ranked, original);
    assert.deepEqual(ranked, snapshot);
});
