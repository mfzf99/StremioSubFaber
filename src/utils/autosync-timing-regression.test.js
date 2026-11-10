const test = require('node:test');
const assert = require('node:assert/strict');

const { generateSubtitleSyncPage } = require('./syncPageGenerator');
const { detectSubtitleFormat, shiftSubtitleTimings } = require('./syncTiming');

const CONFIG = {
    uiLanguage: 'en',
    sourceLanguages: ['eng'],
    targetLanguages: ['msa'],
    providers: {}
};

async function generateSyncPage() {
    return generateSubtitleSyncPage([], 'tt14819828:1:1', 'Business Proposal S01E01.mkv', 'test-config', CONFIG);
}

test('manual offsets remain valid outside the slider range and preserve a typed decimal', async () => {
    const html = await generateSyncPage();

    // The applied offset is the exact typed value, not a slider-clamped or rounded substitute.
    assert.match(html, /const clamped = Number\.isFinite\(ms\) \? ms : 0/);
    // The slider stays a visual indicator and is clamped separately, so it cannot clobber the input.
    assert.match(html, /manualOffsetSlider\.value = Math\.min\(max, Math\.max\(min, Math\.round\(clamped\)\)\)/);
    // The summary reflects the real applied value, not the clamped slider value.
    assert.match(html, /formatOffsetLabel\(clamped\)/);
    // The number input accepts fractional milliseconds instead of forcing 50ms steps.
    assert.match(html, /<input type="number" id="offsetMs" value="0" step="any">/);
    // The legacy clamp of the applied value is gone.
    assert.doesNotMatch(html, /const clamped = Math\.min\(max, Math\.max\(min, Math\.round\(numeric\)\)\)/);
});

test('offset summary rounds fractional milliseconds instead of exposing floating-point noise', async () => {
    const html = await generateSyncPage();

    assert.match(html, /Math\.round\(absolute \* 1000\) \/ 1000 \+ 'ms'/);
});

test('characterization guard: negative offsets clamp the cue start at zero and shorten the tail', () => {
    const input = '1\n00:00:00,100 --> 00:00:01,500\nDialogue';
    const output = shiftSubtitleTimings(input, -200);

    assert.match(output, /00:00:00,000 --> 00:00:01,300/);
});

test('Sync Studio keeps manual offsets available without the autosync extension', async () => {
    const html = await generateSyncPage();

    assert.match(html, /<option value="manual" selected>/);
    assert.match(html, /id="manualSyncControls"/);
    assert.match(html, /id="offsetMs"/);
    assert.match(html, /if \(primaryMode !== 'manual'\)/);
    assert.match(html, /STATE\.syncedSubtitle = offsetSubtitles\(STATE\.subtitleContent, offsetMs\)/);
    assert.match(html, /if \(\(primaryModeSelect\?\.value \|\| 'manual'\) === 'manual'\)/);
    assert.match(html, /id="fileInput" accept="\.srt,\.vtt"/);
    assert.match(html, /Or drag & drop your \.srt or \.vtt file here/);
    assert.match(html, /\.form-group input\[type="number"\]/);
    assert.match(html, /class="offset-entry"/);
    assert.match(html, /grid-template-columns: repeat\(7, minmax\(0, 1fr\)\)/);
    assert.match(
        html,
        /!file \|\| !file\.name\.toLowerCase\(\)\.endsWith\('\.srt'\) && !file\.name\.toLowerCase\(\)\.endsWith\('\.vtt'\)/
    );
});

test('Sync Studio normalizes extension results before they reach cache and download consumers', async () => {
    const html = await generateSyncPage();

    assert.match(html, /STATE\.syncedSubtitle = shiftSubtitleTimings\(syncResult\.syncedSubtitle, 0\)/);
    assert.match(html, /STATE\.syncedSubtitleFormat = detectSubtitleFormat\(STATE\.syncedSubtitle\)/);
    assert.match(html, /'synced_subtitle\.' \+ \(STATE\.syncedSubtitleFormat === 'vtt' \? 'vtt' : 'srt'\)/);
});

test('negative SRT offsets clamp at zero while preserving positive, non-overlapping cues and text', () => {
    const input = [
        '1',
        '00:00:00,400 --> 00:00:01,200',
        'First',
        '',
        '2',
        '00:00:00,900 --> 00:00:01,500',
        'Second --> kept as text',
        '',
        '3',
        '00:00:02,000 --> 00:00:03,000',
        'Third'
    ].join('\r\n');

    const output = shiftSubtitleTimings(input, -1000);
    const timings = [...output.matchAll(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/g)];

    assert.equal(timings.length, 3);
    assert.equal(timings[0][1], '00:00:00,000');
    assert.equal(timings[0][2], '00:00:00,200');
    assert.equal(timings[1][1], '00:00:00,200');
    assert.equal(timings[1][2], '00:00:00,500');
    assert.equal(timings[2][1], '00:00:01,000');
    assert.equal(output.includes('Second --> kept as text'), true);
    assert.equal(output.includes('\r\n'), true);

    let previousEnd = 0;
    for (const timing of timings) {
        const start = timing[1];
        const end = timing[2];
        const toMs = (value) => {
            const [hours, minutes, seconds, milliseconds] = value.split(/[:,]/).map(Number);
            return ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
        };
        assert.equal(toMs(start) >= previousEnd, true);
        assert.equal(toMs(end) > toMs(start), true);
        previousEnd = toMs(end);
    }
});

test('VTT keeps dots, header, cue identifiers, settings, and short timestamp forms', () => {
    const input = [
        'WEBVTT - synchronized output',
        'Kind: captions',
        '',
        'intro',
        '00:01.000 --> 00:02.500 align:start position:10%',
        'Hello',
        '',
        '00:03.000 --> 01:02:04.500',
        'World'
    ].join('\n');

    const output = shiftSubtitleTimings(input, 500);

    assert.equal(detectSubtitleFormat(output), 'vtt');
    assert.match(output, /^WEBVTT - synchronized output\nKind: captions/);
    assert.match(output, /intro\n00:01\.500 --> 00:03\.000 align:start position:10%/);
    assert.match(output, /00:03\.500 --> 01:02:05\.000\nWorld/);
    assert.doesNotMatch(output, /\d,\d{3}\s+-->/);
});

test('zero offset repairs overlapping and inverted cues without changing valid cue boundaries', () => {
    const input = [
        '1',
        '00:00:01,000 --> 00:00:02,000',
        'One',
        '',
        '2',
        '00:00:01,500 --> 00:00:01,600',
        'Two',
        '',
        '3',
        '00:00:03,000 --> 00:00:04,000',
        'Three'
    ].join('\n');

    const output = shiftSubtitleTimings(input, 0);

    assert.match(output, /00:00:01,000 --> 00:00:02,000/);
    assert.match(output, /00:00:02,000 --> 00:00:02,001/);
    assert.match(output, /00:00:03,000 --> 00:00:04,000/);
});

test('invalid timestamps, empty input, and non-finite offsets fail explicitly', () => {
    assert.throws(
        () => shiftSubtitleTimings('1\nnot-a-time --> 00:00:01,000\nBroken', 0),
        /Invalid subtitle timing line 2/
    );
    assert.throws(
        () => shiftSubtitleTimings('1\n00:00:99,000 --> 00:01:00,000\nBroken', 0),
        /Invalid subtitle timestamp/
    );
    assert.throws(() => shiftSubtitleTimings('', 0), /empty/);
    assert.throws(() => shiftSubtitleTimings('1\n00:00:00,000 --> 00:00:01,000\nNo shift', Number.NaN), /finite/);
    assert.throws(() => shiftSubtitleTimings('Plain text without cues', 0), /No valid subtitle cues/);
});
