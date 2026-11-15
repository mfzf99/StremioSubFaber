/**
 * [TOTAL-PURGE v3.36.0 — Mandat Owner 2026-11-15] Language Pack — MALAY.
 * [STREAMLINE v3.37.0 — Mandat Owner 2026-11-15] fewShot baharu VERBATIM Owner:
 * 2 contoh — (1) ayat terpisah + demo anti-calque <bad_textbook> vs
 * <example_output> idiomatik, (2) SDH penuh (♪♪, label penutur, [br], <i>,
 * SFX). Antara muka pack kini { code, aliases, fewShot } SAHAJA: satu-satunya
 * wayar per-bahasa ialah few-shot contoh isometrik Agent Translation.
 * Semua medan sosiolinguistik MONKEY/KNP
 * (honorificMatrix, canonicalAddressMatrix, creditsExample, specificRules,
 * notLockedGuidance) DIKELUARKAN — prompt Preflight/Inspector tidak lagi
 * memakan language pack (kontrak 433-bahasa: prompt neutral-global).
 *
 * Aliases (ms/my/mya/zsm/zzm...) diselesaikan oleh index.js getLanguagePack().
 * Bukan-Malay → generic.js. Bahasa Melayu TIDAK boleh bocor ke pack lain.
 */

const malayPack = {
    code: 'ms',
    aliases: ['ms', 'my', 'mya', 'zsm', 'zzm', 'malay', 'bahasa melayu', 'melayu', 'may'],

    /**
     * [STREAMLINE 2026-11-15] 2 contoh few-shot VERBATIM Owner baharu:
     * (1) ayat terpisah merentas slot + blok <bad_textbook> anti-calque vs
     * <example_output> idiomatik, (2) SDH penuh: ♪♪, label penutur (Marcus),
     * [br], <i>...</i>, SFX [door slams]. Disuntik kedua-dua mod melalui
     * ${fewShot} templat tunggal.
     */
    fewShot: `<example>
<example_input>
<s id="1">If you think I'm gonna let him walk away after what he pulled,</s>
<s id="2">you're out of your damn mind.</s>
</example_input>
<bad_textbook>
<s id="1">Jika awak fikir saya akan biarkan dia berjalan pergi selepas apa yang dia tarik,</s>
<s id="2">awak sudah keluar dari akal fikiran awak.</s>
</bad_textbook>
<example_output>
<answer>
<s id="1">Kalau kau ingat aku nak lepaskan dia macam tu je lepas apa dia buat,</s>
<s id="2">memang gila lah kau.</s>
</answer>
</example_output>
</example>

<example>
<example_input>
<s id="1">♪♪</s>
<s id="2">(Marcus) - We're out of time.[br]- Grab <i>Manifest 404</i> and move!</s>
<s id="3">[door slams]</s>
</example_input>
<example_output>
<answer>
<s id="1">♪♪</s>
<s id="2">(Marcus) - Masa dah suntuk.[br]- Capai <i>Manifest 404</i>, cepat gerak!</s>
<s id="3">[pintu terhempas]</s>
</answer>
</example_output>
</example>`
};

module.exports = malayPack;
