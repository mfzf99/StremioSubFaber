/**
 * [TOTAL-PURGE v3.36.0 — Mandat Owner 2026-11-15] Language Pack — GENERIC
 * (neutral fallback untuk semua bahasa sasaran bukan-Malay, kontrak
 * 433-bahasa). Antara muka pack kini { code, aliases, fewShot } SAHAJA.
 *
 * fewShot kekal META-PLACEHOLDER (sifar teks khusus-bahasa): struktur
 * isometrik sama dengan malay.js tetapi output contoh ialah perihal
 * `{translation of "..."}` supaya tiada bahasa konkrit terkunci. Preflight
 * dan Inspector TIDAK memakan pack — hanya Agent Translation.
 */

const genericPack = {
    code: 'generic',
    aliases: [],

    fewShot: `<example>
<example_input>
<s id="1">You've got to be kidding me.[br]Are we really doing this right now?</s>
<s id="2"><i>Internal Affairs</i> won't back us up if this goes south.</s>
</example_input>
<example_output>
<answer>
<s id="1">{translation of "You've got to be kidding me."}[br]{translation of "Are we really doing this right now?"}</s>
<s id="2"><i>{locked rendering of "Internal Affairs"}</i> {translation of "won't back us up if this goes south."}</s>
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
<s id="2">(Marcus) {translation of "Relax, kid."} {translation of "The Pier Syndicate doesn't even know it's missing yet."}</s>
<s id="3">[{translation of "door slams"}]</s>
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
<s id="1">{translation of "Marcus, if Captain Vance finds out we took"} <i>Manifest 404</i> {translation of "from the vault,"}</s>
<s id="2">{translation of "every single one of us is dead."}</s>
</answer>
</example_output>
</example>`
};

module.exports = genericPack;
