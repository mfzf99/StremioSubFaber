const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { deriveVideoHash } = require('./videoHash');
const { selectStreamFilename, deriveStreamHashFromUrl } = require('./streamUrlIdentity');
const { generateEmbeddedSubtitlePage, generateAutoSubtitlePage } = require('./toolboxPageGenerator');
const { generateSubtitleSyncPage } = require('./syncPageGenerator');

const STREMIO_LOCAL_URL = 'http://127.0.0.1:11470/6bbd66ccc0adccc8db658f335ed23f55e32b0dd8/0?';
const LINKED_FILENAME = 'RuPauls.Drag.Race.All.Stars.S11E07.1080p.WEB.h264-EDITH.mkv';
const VIDEO_ID = 'tt2301351:11:7';

test('opaque Stremio local and LAN stream routes retain linked filename identity', () => {
    const expectedHash = deriveVideoHash(LINKED_FILENAME, VIDEO_ID);

    assert.equal(selectStreamFilename(STREMIO_LOCAL_URL, LINKED_FILENAME), LINKED_FILENAME);
    assert.equal(
        selectStreamFilename('http://192.168.1.20:11470/6bbd66ccc0adccc8db658f335ed23f55e32b0dd8/0', LINKED_FILENAME),
        LINKED_FILENAME
    );

    const identity = deriveStreamHashFromUrl(STREMIO_LOCAL_URL, {
        filename: LINKED_FILENAME,
        videoId: VIDEO_ID
    });
    assert.equal(identity.filename, LINKED_FILENAME);
    assert.equal(identity.hash, expectedHash);
    assert.notEqual(identity.hash, deriveVideoHash('0', VIDEO_ID));
});

test('reliable URL filenames override linked metadata while weak URL hints do not', () => {
    assert.equal(
        selectStreamFilename('https://cdn.example/movie/Other.Release.2026.mkv', LINKED_FILENAME),
        'Other.Release.2026.mkv'
    );
    assert.equal(
        selectStreamFilename('https://resolver.example/resolve/abc?name=Short+Title', LINKED_FILENAME),
        LINKED_FILENAME
    );
    assert.equal(
        selectStreamFilename('https://resolver.example/play?file=0&download=1', LINKED_FILENAME),
        LINKED_FILENAME
    );
    assert.equal(
        selectStreamFilename('https://resolver.example/play?filename=Encoded%20Movie.mkv', LINKED_FILENAME),
        'Encoded Movie.mkv'
    );
});

test('all stream-based toolbox pages embed the shared filename selector', async () => {
    const config = {
        uiLanguage: 'en',
        sourceLanguages: ['eng'],
        targetLanguages: ['por'],
        providers: {}
    };
    const pages = await Promise.all([
        generateEmbeddedSubtitlePage('test-config', '', LINKED_FILENAME, config),
        generateAutoSubtitlePage('test-config', '', LINKED_FILENAME, config),
        generateSubtitleSyncPage([], '', LINKED_FILENAME, 'test-config', config)
    ]);

    for (const html of pages) {
        assert.match(html, /const selectStreamFilename = function selectStreamFilename/);
        assert.match(html, /selectStreamFilename\(streamUrl,/);
        assert.doesNotMatch(html, /Last resort: return pathname last part even without extension/);

        const inlineScripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
            .map((match) => match[1])
            .filter((source) => source.trim());
        assert.ok(inlineScripts.length > 0);
        for (const source of inlineScripts) {
            assert.doesNotThrow(() => new Function(source));
        }
    }

    const serverSource = fs.readFileSync(path.join(__dirname, '..', '..', 'index.js'), 'utf8');
    assert.match(serverSource, /deriveStreamHashFromUrl\(streamUrl, fallback\)/);
    assert.doesNotMatch(serverSource, /Last resort: use pathname last part even without extension/);
});

// ── PIN D1 (v3.41.3): peleraian redirect mesti BENAR-BENAR wujud dalam skrip ──
// Sebelum ini autoSubsRuntime() memanggil resolveStreamUrlRedirect(), tetapi
// nama itu hanya diisytiharkan dalam skrip halaman embedded-subtitles — skrip
// yang BERBEZA. Pada halaman auto-subs panggilan itu sentiasa dilempar
// ReferenceError dan ditelan oleh catch(_), jadi `resolved` kekal null
// selama-lamanya walaupun UI memaparkan "Resolving stream URL...".
// ESLint tidak dapat mengesannya kerana ia global halaman yang sah pada
// halaman yang lain. Pin ini memeriksa HTML yang DIJANA secara sebenar.

const MINIMAL_CONFIG = {
    uiLanguage: 'en',
    sourceLanguages: ['eng'],
    targetLanguages: ['por'],
    providers: {}
};

test('D1 pin: halaman auto-subs membenamkan resolveStreamUrlRedirect SEBELUM runtime dijalankan', async () => {
    const html = await generateAutoSubtitlePage('test-config', '', LINKED_FILENAME, MINIMAL_CONFIG);

    const declareIdx = html.indexOf('const resolveStreamUrlRedirect = function resolveStreamUrlRedirect');
    assert.notEqual(declareIdx, -1, 'helper mesti dibenamkan dalam halaman auto-subs');

    const callIdx = html.indexOf('await resolveStreamUrlRedirect(streamUrl)');
    assert.notEqual(callIdx, -1, 'autoSubsRuntime mesti masih memanggil helper');

    // ATURAN PENTING: pengisytiharan mesti mendahului pelaksanaan runtime.
    // Jika tidak, ralat asal akan kembali secara senyap.
    const runtimeIdx = html.indexOf('(function autoSubsRuntime(');
    assert.notEqual(runtimeIdx, -1, 'autoSubsRuntime mesti dibenamkan');
    assert.ok(declareIdx < runtimeIdx, 'helper mesti diisytihar SEBELUM autoSubsRuntime dijalankan');
    assert.ok(declareIdx < callIdx, 'helper mesti diisytihar SEBELUM dipanggil');
});

test('D1 pin: helper yang dibenamkan berfungsi — menyelesaikan redirect & berundur selamat', async () => {
    // Sumber helper diambil TERUS daripada modul (objek yang sama yang
    // dibenamkan melalui .toString()), bukan diekstrak dengan regex — supaya
    // ujian ini menguji kod produksi sebenar dan tidak rapuh terhadap bentuk teks.
    const { resolveStreamUrlRedirect } = require('./streamUrlIdentity');
    const DECL = `(${resolveStreamUrlRedirect.toString()})`;

    // Pastikan salinan yang dibenamkan dalam HTML ialah teks yang SAMA.
    const html = await generateAutoSubtitlePage('test-config', '', LINKED_FILENAME, MINIMAL_CONFIG);
    assert.ok(
        html.includes(`const resolveStreamUrlRedirect = ${resolveStreamUrlRedirect.toString()};`),
        'HTML mesti membenamkan teks helper yang tepat dari modul'
    );

    // Jalankan helper dalam sandbox pelayar minimum (realm berasingan).
    const vm = require('node:vm');
    const makeResolver = (fetchImpl, href) => {
        const sandbox = {
            URL,
            AbortController,
            setTimeout,
            clearTimeout,
            console: { warn: () => {} },
            window: { location: { href, origin: new URL(href).origin } },
            fetch: fetchImpl
        };
        return vm.runInNewContext(DECL, sandbox, { filename: 'resolveStreamUrlRedirect.js' });
    };

    const SAME_ORIGIN = 'https://addon.example/resolve/abc';
    const FINAL_URL = 'https://cdn.example/Movie.2026.mkv';

    // 1) Redirect sebenar diselesaikan → response.url dikembalikan.
    let headCalls = 0;
    const okResolver = makeResolver(async () => {
        headCalls += 1;
        return { url: FINAL_URL };
    }, SAME_ORIGIN);
    assert.equal(await okResolver(SAME_ORIGIN), FINAL_URL, 'URL akhir selepas redirect mesti dikembalikan');
    assert.equal(headCalls, 1, 'satu permintaan HEAD dibuat');

    // 2) Cache: panggilan kedua tidak membuat permintaan rangkaian lagi.
    assert.equal(await okResolver(SAME_ORIGIN), FINAL_URL, 'hasil cache mesti konsisten');
    assert.equal(headCalls, 1, 'cache mesti digunakan — tiada HEAD kedua');

    // 3) Hos lintas-asal → tiada permintaan; URL asal dikembalikan (CSP).
    let crossCalls = 0;
    const crossResolver = makeResolver(async () => {
        crossCalls += 1;
        return { url: FINAL_URL };
    }, SAME_ORIGIN);
    assert.equal(await crossResolver('https://other.example/file.mkv'), 'https://other.example/file.mkv');
    assert.equal(crossCalls, 0, 'hos lintas-asal mesti dilangkau');

    // 4) fetch gagal → berundur ke URL asal, TIDAK dilempar.
    const failResolver = makeResolver(async () => {
        throw new Error('network down');
    }, SAME_ORIGIN);
    assert.equal(await failResolver('https://addon.example/resolve/xyz'), 'https://addon.example/resolve/xyz');

    // 5) URL kosong → dikembalikan seadanya tanpa permintaan.
    assert.equal(await failResolver(''), '');
});
