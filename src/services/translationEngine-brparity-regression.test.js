/**
 * [BR-PARITY v3.x] Regression Tests — Mandat Owner 2026-10-23
 *
 * Kontrak yang dikunci:
 *   reconcileBrParity(sourceText, translatedText) + cleanTranslatedText(text, sourceText?):
 *   1. Kiraan [br]/\n sama antara sumber dan output AI -> passthrough (teks tidak diubah).
 *   2. AI hilangkan [br] -> auto-repair sisip '\n' pada titik selamat
 *      (sempadan ayat > koma > ruang terdekat; SESAHASIA jangan potong perkataan tengah).
 *   3. AI hilang SEMUA [br] -> repair penuh; jumlah baris akhir = sumber.
 *   4. AI tambah [br] -> dikekalkan (no-op).
 *   5. Bentuk variasi marker (<br>, <br/>, entity-escaped) dinormalisasi sebelum parity.
 *   6. sourceText undefined/kosong -> back-compat passthrough (tingkah laku lama).
 *   7. Teks tanpa sempadan ayat/tanda baca -> fallback dumb-split, tiada potong tengah.
 *   8. Repair tidak menghasilkan '\n\n' (konsisten stage 4 collapse).
 *   9. Sumber 1 baris (0 [br]) -> tiada repair (guard countOut >= countSrc).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const TranslationEngine = require('./translationEngine');

// Provider mock — tiada panggilan API; hanya perlu untuk instantiation.
function makeEngine() {
    const provider = { translateSubtitle: async () => '', estimateTokenCount: () => 10 };
    return new TranslationEngine(provider, 'gemini-2.5-flash', {}, { providerName: 'gemini' });
}

function countNewlines(t) {
    return (String(t).match(/\n/g) || []).length;
}

test('BrParity 1: kiraan sama -> passthrough mutlak (teks tidak diubah)', () => {
    const engine = makeEngine();
    const src = 'Jangan tinggalkan aku [br] sendirian di sini';
    const out = 'Jangan tinggalkan saya\nsendirian di sini';
    assert.equal(engine.reconcileBrParity(src, out), out);
});

test('BrParity 2: AI hilang 1 [br] -> auto-repair sisip \\n pada sempadan ayat', () => {
    const engine = makeEngine();
    const src = 'Kita bergerak sekarang [br] sebelum mereka pulang';
    const out = 'Kita bergerak sekarang. Sebelum mereka pulang'; // AI buang break, gabung
    const repaired = engine.reconcileBrParity(src, out);

    assert.equal(countNewlines(repaired), 1, `Mesti tepat 1 \\n; dapat: ${JSON.stringify(repaired)}`);
    // Split mesti selepas ". " (sempadan ayat) — bukan potong tengah.
    assert.ok(
        repaired.includes('. \n') || repaired.includes('.\n'),
        `Split pada sempadan ayat: ${JSON.stringify(repaired)}`
    );
    assert.ok(!repaired.includes('Seka'), 'Perkataan "Sebelum" tidak boleh terpotong');
});

test('BrParity 3: AI hilang SEMUA [br] (3 baris sumber) -> repair penuh 3 baris', () => {
    const engine = makeEngine();
    const src = 'Baris pertama yang panjang [br] baris kedua pula begini [br] baris ketiga akhir sekali';
    const out = 'Baris pertama yang panjang baris kedua pula begini baris ketiga akhir sekali';
    const repaired = engine.reconcileBrParity(src, out);

    assert.equal(countNewlines(repaired), 2, `Mesti tepat 2 \\n (3 baris); dapat: ${JSON.stringify(repaired)}`);
    // Semua perkataan mesti kekal utuh — tiada potongan tengah.
    const words = repaired.replace(/\n/g, ' ').split(/\s+/).filter(Boolean);
    for (const w of words) {
        assert.ok(w.length > 1, `Tiada serpihan perkataan: ${JSON.stringify(repaired)}`);
    }
});

test('BrParity 4: AI tambah [br] -> dikekalkan (no-op)', () => {
    const engine = makeEngine();
    const src = 'Satu baris sahaja';
    const out = 'Satu baris\nsahaja\nlagi';
    assert.equal(engine.reconcileBrParity(src, out), out);
});

test('BrParity 5: bentuk variasi marker (<br>, <br/>) dinormalisasi sebelum parity', () => {
    const engine = makeEngine();
    const src = 'Ayat satu [br] ayat dua [br] ayat tiga';
    // Laluan penuh pipeline: stage 4 (marker -> \n) berjalan DALAM cleanTranslatedText
    // sebelum parity — jadi ujian integrasi melalui pintu depan, bukan method terus.
    // AI balas dengan <br> dan <br/> bercampur — kiraan sama (2), passthrough parity.
    const out = 'Ayat satu<br>ayat dua<br/>ayat tiga';
    const cleaned = engine.cleanTranslatedText(out, src);
    assert.equal(countNewlines(cleaned), 2, `Varian marker dinormalisasi: ${JSON.stringify(cleaned)}`);
});

test('BrParity 6: sourceText undefined/kosong -> back-compat passthrough', () => {
    const engine = makeEngine();
    // Tingkah laku lama: tanpa sumber, tiada parity — hanya stage 1-4+ kekal.
    const a = engine.reconcileBrParity(undefined, 'teks');
    const b = engine.reconcileBrParity('', 'teks');
    const c = engine.reconcileBrParity('src', '');
    assert.equal(a, 'teks');
    assert.equal(b, 'teks');
    assert.equal(c, '');
});

test('BrParity 7: teks panjang tanpa tanda baca -> fallback dumb-split tiada potong tengah', () => {
    const engine = makeEngine();
    const src = 'satu dua tiga empat lima [br] enam tujuh lapan sembilan sepuluh [br] sebelas dua belas tiga belas';
    const out = 'satu dua tiga empat lima enam tujuh lapan sembilan sepuluh sebelas dua belas tiga belas';
    const repaired = engine.reconcileBrParity(src, out);

    assert.equal(countNewlines(repaired), 2, `Dumb-split tepat 2 \\n: ${JSON.stringify(repaired)}`);
    // Semua token asal mesti kekal utuh (split ikut ruang — token satu perkataan).
    const tokens = repaired.split(/\s+/);
    for (const token of ['satu', 'lima', 'enam', 'sepuluh', 'sebelas', 'belas']) {
        assert.ok(tokens.includes(token), `Token "${token}" kekal utuh dalam: ${JSON.stringify(repaired)}`);
    }
    // Kandungan mesti kekal sama (tiada aksara hilang).
    assert.equal(repaired.replace(/\n/g, ' ').split(/\s+/).filter(Boolean).length, 15, 'Jumlah perkataan kekal 15');
});

test('BrParity 8: repair tidak menghasilkan \\n\\n berganda', () => {
    const engine = makeEngine();
    const src = 'A [br] B [br] C';
    // AI output ada ruang berlebih yang mungkin jadi baris kosong.
    const out = 'A. B. C';
    const repaired = engine.reconcileBrParity(src, out);
    assert.ok(!/\n{2,}/.test(repaired), `Tiada \\n\\n: ${JSON.stringify(repaired)}`);
    assert.equal(countNewlines(repaired), 2);
});

test('BrParity 9: integrasi cleanTranslatedText(text, sourceText) — hook stage 4.5 aktif', () => {
    const engine = makeEngine();
    const src = 'Hello there friend [br] how are you today';
    // AI balas: buang break + tambah HTML tag warisan.
    const cleaned = engine.cleanTranslatedText('Hello there friend, how are you today?', src);

    // HTML tag dibersihkan (kontrak warisan stage 8.5 subtitles.js kekal beza -
    // di sini output AI dianggap bersih) DAN parity diperbaiki.
    assert.equal(countNewlines(cleaned), 1, `Hook 4.5 berjalan: ${JSON.stringify(cleaned)}`);

    // Back-compat: tanpa sourceText, tingkah laku lama (tiada parity enforcement).
    const legacy = engine.cleanTranslatedText('Hello there friend, how are you today?');
    assert.equal(countNewlines(legacy), 0, 'Legacy path: tanpa sourceText -> tiada repair');
});

test('Sanitizer register: pilihan percakapan model dikekalkan, pinjaman English dinormalisasi', () => {
    const engine = makeEngine();
    const cleaned = engine.cleanTranslatedText(
        'Akulah yang cakap tadi, bukan kau.[br]Tunggu jap, ni untuk dia je, okey?'
    );
    assert.equal(cleaned, 'Akulah yang cakap tadi, bukan kau.\nTunggu jap, ni untuk dia je, okay?');
});
