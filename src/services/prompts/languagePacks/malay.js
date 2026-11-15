/**
 * [TOTAL-PURGE v3.36.0 — Mandat Owner 2026-11-15] Language Pack — MALAY.
 * Antara muka pack kini { code, aliases, fewShot } SAHAJA: satu-satunya
 * wayar per-bahasa ialah few-shot contoh isometrik Agent Translation
 * (3 contoh VERBATIM Owner). Semua medan sosiolinguistik MONKEY/KNP
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
     * [TOTAL-PURGE 2026-11-15] 3 contoh few-shot VERBATIM Owner:
     * (1) [br] + <i> markup, (2) SDH speaker label + muzik + SFX + zarah
     * pertuturan, (3) ayat terpisah merentas slot. Disuntik kedua-dua mod
     * melalui ${fewShot} templat tunggal.
     */
    fewShot: `<example>
<example_input>
<s id="1">You've got to be kidding me.[br]Are we really doing this right now?</s>
<s id="2"><i>Internal Affairs</i> won't back us up if this goes south.</s>
</example_input>
<example_output>
<answer>
<s id="1">Biar betul.[br]Memang nak buat sekarang ke?</s>
<s id="2"><i>Internal Affairs</i> takkan tolong kita kalau benda ni jadi kecoh.</s>
</answer>
</example_output>
</example>

<example>
<example_input>
<s id="1">♪♪</s>
<s id="2">(Marcus) Relax, kid. The Pier Syndicate doesn't even know it's missing yet.</s>
<s id="3">[door slams]</s>
</example_input>
<example_output>
<answer>
<s id="1">♪♪</s>
<s id="2">(Marcus) Relaks lah, budak. Pier Syndicate tak tahu pun benda tu dah hilang.</s>
<s id="3">[pintu terhempas]</s>
</answer>
</example_output>
</example>

<example>
<example_input>
<s id="1">Marcus, if Captain Vance finds out we took <i>Manifest 404</i> from the vault,</s>
<s id="2">every single one of us is dead.</s>
</example_input>
<example_output>
<answer>
<s id="1">Marcus, kalau Kapten Vance tahu kita ambil <i>Manifest 404</i> dari bilik kebal tu,</s>
<s id="2">memang habislah kita semua.</s>
</answer>
</example_output>
</example>`
};

module.exports = malayPack;
