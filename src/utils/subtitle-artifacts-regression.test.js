const test = require('node:test');
const assert = require('node:assert/strict');

const SubDLService = require('../services/subdl');
const { handleSubtitleDownload, preprocessSubtitleForAI } = require('../handlers/subtitles');
const { sanitizeSubtitleText, parseSRT } = require('./subtitle');
const entity = (body) => String.fromCharCode(38) + body + ';';

test('parseSRT preserves empty-text slots for ID parity (BUGFIX)', () => {
    const srt = `1
00:00:01,000 --> 00:00:02,000
Hello.

2
00:00:02,000 --> 00:00:03,000


3
00:00:03,000 --> 00:00:04,000
World.
`;
    const entries = parseSRT(srt);
    assert.equal(entries.length, 3, 'Empty-text slot must be preserved');
    assert.equal(entries[1].id, 2);
    assert.equal(entries[1].text, '', 'Empty slot must keep empty text');

    const crlf = `1\r\n00:00:01,000 --> 00:00:02,000\r\nHello.\r\n\r\n2\r\n00:00:02,000 --> 00:00:03,000\r\n\r\n\r\n3\r\n00:00:03,000 --> 00:00:04,000\r\nWorld.\r\n`;
    const crlfEntries = parseSRT(crlf);
    assert.equal(crlfEntries.length, 3, 'CRLF empty slot must be preserved');
    assert.equal(crlfEntries[1].text, '');
});

test('subtitle cleanup collapses duplicated in-word apostrophes while preserving valid accents', () => {
    const input = "I'm I'’m I'´m I''m l’amour d’ete café ''quoted''";
    const expected = "I'm I'm I'm I'm l’amour d’ete café ''quoted''";

    assert.equal(sanitizeSubtitleText(input), expected);
    assert.equal(sanitizeSubtitleText(sanitizeSubtitleText(input)), expected);
});

test('subtitle cleanup decodes named decimal and hexadecimal entities once', () => {
    const input = [
        'I' + entity('apos') + 'm',
        entity('#39') + 'ready' + entity('#39'),
        entity('amp'),
        '<3',
        entity('#x2019') + 'ok' + entity('#x2019'),
        entity('#x1F600'),
        entity('acute'),
        entity('copy'),
        entity('bull'),
        entity('trade')
    ].join(' ');
    const expected = ["I'm", "'ready'", String.fromCharCode(38), '<3', '’ok’', '😀', '´', '©', '•', '™'].join(' ');
    assert.equal(sanitizeSubtitleText(input), expected);

    const doubleEncoded = entity('amp') + 'apos; ' + entity('amp') + 'lt;i' + entity('amp') + 'gt;';
    const decodedOnce = entity('apos') + ' ' + entity('lt') + 'i' + entity('gt');
    const cleaned = sanitizeSubtitleText(doubleEncoded);
    assert.equal(cleaned, decodedOnce);
    assert.equal(cleaned.includes(entity('lt')), true);
    assert.equal(cleaned.includes('<i>'), false);
    assert.equal(sanitizeSubtitleText(cleaned), "' <i>");
});

test('subtitle cleanup preserves unknown malformed and non-scalar entities', () => {
    const input = [
        entity('#xD800'),
        entity('#x110000'),
        entity('notarealentity'),
        String.fromCharCode(38) + '#39'
    ].join(' ');
    assert.equal(sanitizeSubtitleText(input), input);
});

test('AI preprocessing shares entity decoding and apostrophe cleanup without changing its tag contract', () => {
    const input =
        '{\\i1}I' +
        entity('apos') +
        entity('rsquo') +
        "m I'´m " +
        entity('copy') +
        ' ' +
        entity('bull') +
        ' <b>bold</b>';
    const { content, stats } = preprocessSubtitleForAI(input);

    assert.equal(content, "I'm I'm © • bold");
    assert.equal(stats.htmlEntitiesDecoded, 4);
    assert.equal(stats.assTagsRemoved, 1);
    assert.equal(stats.htmlTagsRemoved, 2);
    assert.equal(
        preprocessSubtitleForAI(entity('amp') + 'lt;i' + entity('amp') + 'gt;').content,
        entity('lt') + 'i' + entity('gt')
    );
});

test('direct provider downloads clean text while preserving SRT timecodes and ASS structure', async (t) => {
    const originalDownload = SubDLService.prototype.downloadSubtitle;
    t.after(() => {
        SubDLService.prototype.downloadSubtitle = originalDownload;
    });

    const responses = [
        '1\r\n00:00:01,000 --> 00:00:03,000\r\nI' +
            entity('apos') +
            "m I'’m I'´m " +
            entity('amp') +
            ' <3 ' +
            entity('#x2019') +
            'ok' +
            entity('#x2019') +
            '\r\n',
        {
            format: 'ass',
            content:
                '[Script Info]\nTitle: Punctuation test\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\i1}I' +
                entity('apos') +
                "m I'’m l’amour café"
        }
    ];
    SubDLService.prototype.downloadSubtitle = async () => responses.shift();

    const config = {
        __configHash: 'subtitle-artifact-cleanup-test',
        uiLanguage: 'en',
        minSubtitleSizeBytes: 1,
        convertAssToVtt: false,
        forceSRTOutput: false,
        subtitleProviders: {
            subdl: { enabled: true, apiKey: 'test-key' }
        }
    };

    const srt = await handleSubtitleDownload('subdl_1_2', 'eng', config);
    assert.match(srt, /00:00:01,000 --> 00:00:03,000/);
    assert.match(srt, /I'm I'm I'm & <3 ’ok’/);
    assert.equal(srt.includes(entity('apos')), false);
    assert.equal(srt.includes(entity('#x2019')), false);
    assert.doesNotMatch(srt, /I'’m|I'´m/);

    const ass = await handleSubtitleDownload('subdl_1_2', 'eng', config);
    assert.match(ass, /\[Script Info\]/);
    assert.match(ass, /Dialogue: 0,0:00:01\.00,0:00:03\.00/);
    assert.match(ass, /\{\\i1\}I'm I'm l’amour café/);
    assert.doesNotMatch(ass, /I'’m/);
});
