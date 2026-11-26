// Ujian regresi: arahan ujian bersasar yang DOKUMENASIKAN mesti selamat dijalankan.
//
// [ZOMBIE-ROOT-CAUSE v3.43.0]
// Punca sebenar 17 proses yatim ialah arahan yang disyorkan sendiri oleh dokumen:
// `node --test <target-file>` — TANPA `--test-force-exit`. Memuatkan
// src/handlers/subtitles.js (rantaian require, bukan hook ujian) membina pemasa
// setInterval peringkat-modul dalam sessionManager.js yang mengekalkan event loop
// selamanya. Tanpa bendera itu, proses tidak pernah keluar.
//
// Ujian ini memfailkan dirinya (fail-closed) jika:
//   Z1 — dokumen masih mengesyorkan `node --test` tanpa --test-force-exit
//   Z2 — pelari yang di-track hilang flag itu (satu-satunya sebab npm test berfungsi)
//   Z3 — seseorang mengubah sessionManager sehingga pemasa tidak lagi .unref()-able
//        (iaitu: mengesahkan pemasa wujud di peringkat modul — punca yang sebenar)
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('[Z1] RELEASE_PIPELINE_REFERENCE §4 mengesyorkan --test-force-exit pada arahan ujian bersasar', () => {
    const doc = read('docs/RELEASE_PIPELINE_REFERENCE.md');
    // Cari setiap `node --test <...>` dan nahu yang tiada satu pun tanpa bendera.
    const bare = [...doc.matchAll(/node --test (?!--test-force-exit)[^\s`]*\s*<target-file>/g)];
    assert.deepEqual(
        bare.map((m) => m[0]),
        [],
        'dokumen masih mengesyorkan `node --test` tanpa --test-force-exit — arahan ini menggantung selamanya'
    );
    assert.match(
        doc,
        /node --test --test-force-exit <target-file>/,
        'dokumen mesti menunjukkan borang yang selamat secara eksplisit'
    );
});

test('[Z2] run-tracked-tests.js sentiasa memakai --test-force-exit', () => {
    const runner = read('scripts/run-tracked-tests.js');
    assert.match(runner, /'--test-force-exit'/, 'pelari yang di-track mesti mengekalkan --test-force-exit');
});

test('[Z3] sessionManager membina pemasa peringkat-modul yang mengekalkan event loop (punca zombie)', () => {
    const src = read('src/utils/sessionManager.js');
    const timers = (src.match(/this\.\w+\s*=\s*setInterval\(/g) || []).length;
    assert.ok(timers >= 3, `dijangka >=3 pemasa setInterval, ditemui ${timers}`);
    // Pemasa TIDAK di-unref — itu punca sebenar event loop kekal hidup.
    // Jika seseorang "membaiki" ini dengan .unref(), ujian ini gagal supaya
    // keputusan itu dibuat secara sedar dan didokumenkan, bukan secara senyap.
    const unrefed = (src.match(/setInterval\([^;]*\)\s*\.unref\(\)/g) || []).length;
    assert.equal(unrefed, 0, 'pemasa kini di-unref — kemas kini Z3 dan dokumentasikan perubahan tingkah laku');
});
