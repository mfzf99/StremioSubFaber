/**
 * Malay Hybrid Sanitizer — SENARAI MERAH (RED LIST), TIDAK AKTIF
 * [MALAY-SANITIZER-SET-ASIDE 2026-11-08 — Mandat Owner]
 *
 * Fail ini adalah SIMPANAN KOD untuk eksperimen "hybrid sanitizer" yang
 * sebelumnya menyuntik normalisasi Melayu ke dalam output terjemahan:
 *   - pronoun: aku→saya, kau/kamu→awak, Anda→Awak, diorang→mereka
 *   - zarf/partikel: ni→ini, tu→itu, je→saja, jap→sekejap, la→lah
 *   - pinjaman Inggeris: okey/oke/ok→okay, helo/halo→hello
 *   - singkatan SMS: sbb→sebab, utk→untuk, tp→tapi, klu→kalau, dgn→dengan,
 *     yg→yang, kat/dkt/kt→dekat
 *
 * KEPUTUSAN OWNER: sanitizer ini diketepikan daripada laluan runtime.
 * Alasan (semuanya disahkan daripada kod dan data sebenar):
 *   1. Ia berjalan TANPA syarat bahasa — ia menimpa output untuk SEMUA
 *      bahasa sasaran, bukan hanya Melayu.
 *   2. Ia MEROSAKKAN output Bahasa Indonesia: "kamu" (kamu = "you")
 *      ditukar kepada "awak" (bukan "you" dalam standard Indonesia).
 *   3. Ia MEMASUKKAN perkataan Melayu ke dalam output bukan-Melayu: "ni"→"ini",
 *      "je"→"saja" dan sebagainya ditulis ke dalam terjemahan Jepun/Sepanyol.
 *   4. Ia tidak sepadan dengan subtitle Netflix.
 *
 * KONTRAK BARU: output AI dikekalkan dalam bentuk yang ditulis model.
 * Normalisasi gaya dalam output adalah tanggungjawab model (satu arahan
 * universal), bukan post-processing mekanik yang meneka bahasa.
 *
 * Fail ini SENGAJA TIDAK DI-REQUIRE oleh mana-mana modul runtime. Ia hanya
 * rujukan/arkib supaya eksperimen ini boleh diaktifkan semula pada masa depan
 * (contohnya sebagai language-pack-scoped post-normalizer untuk Melayu SAHAJA)
 * tanpa perlu membina semula daripada log dan lesen.
 *
 * Rujukan asal: src/services/translationEngine.js — cleanTranslatedText(),
 * tahap "Hybrid sanitizer (dialogue vs lyrics + full CAPSLOCK support)".
 */

// Peta normalisasi. Kunci = bentuk sumber; asal Kod asal menyokong
// varian Title/UPPER/lower melalui replacement thrice-per-rule.
const MALAY_HYBRID_SANITIZER_RULES = [
    // 1. Pronoun (dialogue only — lirik dikekalkan)
    { from: 'dia orang', to: 'mereka' },
    { from: 'diorang', to: 'mereka' },
    { from: 'akulah', to: 'sayalah' },
    { from: 'kaulah', to: 'awaklah' },
    { from: 'engkaulah', to: 'awaklah' },
    { from: 'kamulah', to: 'awaklah' },
    { from: 'andalah', to: 'awaklah' },
    { from: 'aku', to: 'saya' },
    { from: 'kau', to: 'awak' },
    { from: 'engkau', to: 'awak' },
    { from: 'kamu', to: 'awak' },
    { from: 'benda', to: 'awak' },
    { from: 'anda', to: 'Awak' },

    // 2. Zarf dan demonstratif
    { from: 'ni', to: 'ini' },
    { from: 'nilah', to: 'inilah' },
    { from: 'tulah', to: 'itulah' },
    { from: 'tu', to: 'itu' },
    { from: 'je', to: 'saja' },
    { from: 'jap', to: 'sekejap' },
    { from: 'la', to: 'lah' },

    // 3. Pinjaman dan standardisasi
    { from: 'okeylah', to: 'okaylah' },
    { from: 'okelah', to: 'okaylah' },
    { from: 'oklah', to: 'okaylah' },
    { from: 'okey', to: 'okay' },
    { from: 'oke', to: 'okay' },
    { from: 'ok', to: 'okay' },
    { from: 'helo', to: 'hello' },
    { from: 'halo', to: 'hello' },

    // 4. Singkatan gaya SMS
    { from: 'sbb', to: 'sebab' },
    { from: 'utk', to: 'untuk' },
    { from: 'tp', to: 'tapi' },
    { from: 'klu', to: 'kalau' },
    { from: 'dgn', to: 'dengan' },
    { from: 'yg', to: 'yang' },
    { from: 'kat', to: 'dekat' },
    { from: 'dkt', to: 'dekat' },
    { from: 'kt', to: 'dekat' }
];

/**
 * Sanitizer dinyahaktifkan — dilumpuhkan sepenuhnya.
 *
 * Fungsi ini sengaja TIDAK menormalisasi apa-apa. Ia kekal sebagai API
 * supaya ujian (dan pemanggil masa depan) boleh mengesahkan dengan jelas
 * bahawa sanitizer Melayu tidak lagi mengubah output, dan supaya senarai
 * merah di atas kekal boleh diaktifkan semula secara sedar.
 *
 * @param {string} line - Baris dialog/terjemahan (tidak diubah).
 * @returns {string} Baris yang sama, tanpa sebarang normalisasi Melayu.
 */
function applyMalayHybridSanitizer(line) {
    return String(line === undefined || line === null ? '' : line);
}

/**
 * Semak sama ada baris mengandungi bentuk yang akan pernah diubah oleh
 * sanitizer Melayu. Fungsi ini hanya untuk diagnostik dan ujian.
 *
 * @param {string} line
 * @returns {boolean}
 */
function wouldBeAlteredByMalaySanitizer(line) {
    const text = String(line || '');
    if (!text) return false;
    return MALAY_HYBRID_SANITIZER_RULES.some((rule) =>
        new RegExp(`\\b${rule.from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(text)
    );
}

module.exports = {
    MALAY_HYBRID_SANITIZER_RULES,
    applyMalayHybridSanitizer,
    wouldBeAlteredByMalaySanitizer,
    ENABLED: false
};
