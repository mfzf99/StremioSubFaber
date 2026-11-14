/**
 * [UNIVERSAL-FIX] Language Pack — GENERIC (neutral fallback for all
 * non-Malay target languages, 433-language universal contract)
 *
 * Returned by getLanguagePack() when targetLang is not Malay. Contains ZERO
 * language-specific content — placeholders stay language-neutral. Every rule
 * references ${tgt} (the runtime target language label) instead of any
 * concrete language, so Vietnamese/Japanese/Spanish/... all flow through the
 * same prompt shape without Malay logic ever firing.
 *
 * Interface mirrors malay.js:
 *   { code, aliases, honorificMatrix, canonicalAddressMatrix, creditsExample,
 *     fewShot, specificRules, notLockedGuidance }
 */

const genericPack = {
    code: 'generic',
    aliases: [],

    /**
     * P1 pillar-3 injection: language-neutral honorific locking directive.
     * Keeps the "lock one canonical title per recurring entity" discipline
     * (needed for Agent Inspector SHIFT/consistency audits) without any Malay mapping.
     * [KNP-ALIGNMENT 2026-10-07] Directive dipindah ke tiang characters —
     * sifar arahan gelaran watak dalam terms (doktrin Netflix KNP).
     */
    honorificMatrix: [
        "When locking character addresses in the 'characters' pillar, apply the standard sociolinguistic conventions of ${tgt} for official ${tgt} titles/honorifics:",
        '* Map adult/parental/authority figures, professional titles, and formal addresses to their official ${tgt} equivalents.',
        '* Map young unmarried women, men, and familial terms (aunt/uncle) to their official ${tgt} equivalents.',
        '* Map organizational roles (Director, General Manager, etc.) to their official ${tgt} equivalents.',
        'Cross-reference titles: if the same character is addressed two different ways in dialogue, lock the ONE formal ${tgt} address implied by the strongest contextual evidence — one canonical title per character, never alternate.',
        'These title mappings are recorded EXCLUSIVELY as character addresses (canonical_address / direct_address) — never as terms entries.'
    ].join('\n   '),

    /**
     * P1 pillar-3 injection: neutral canonical_address instruction.
     */
    canonicalAddressMatrix:
        'Apply the standard sociolinguistic title conventions for ${tgt} (professional, familial, and formal titles map to their official ${tgt} equivalents)',

    /**
     * P1 pillar-4 injection: neutral credits directive (no hardcoded translation).
     */
    creditsExample:
        'translate generic media/publishing credit phrases naturally in ${tgt}; for a creative-work title, use an official ${tgt} title only when already known with confidence, otherwise retain the original title',

    /**
     * [FEW-SHOT-V2 2026-11-14 — Mandat Owner] 3 contoh ISOMETRIK (sama
     * struktur dengan malay.js) dalam format <example><example_input>/<example_output>,
     * SIFAR teks khusus-bahasa — placeholder meta + simbol universal sahaja
     * (kontrak 433-bahasa). Disuntik KEDUA-DUA mod (templat tunggal).
     */
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
<s id="2">(Marcus) {translation of "Relax, kid."}[br]{translation of "The Pier Syndicate doesn't even know it's missing yet."}</s>
<s id="3">[{translation of "door slams"}]</s>
</answer>
</example_output>
</example>

<example>
<example_input>
<s id="1">Marcus, listen to me. I found <i>Manifest 404</i> in the vault.</s>
<s id="2">If Captain Vance finds out we took it, we're dead.</s>
</example_input>
<example_output>
<answer>
<s id="1">{direct address for "Marcus"}, {translation of "listen to me."}[br]{translation of "I found"} <i>{locked rendering of "Manifest 404"}</i> {translation of "in the vault."}</s>
<s id="2">{translation of "If Captain Vance finds out we took it, we're dead." — canonical third-person name}</s>
</answer>
</example_output>
</example>`,

    /**
     * P8 injection: neutral rule for DEFAULT_TRANSLATION_PROMPT.
     */
    specificRules:
        "7. Use natural, idiomatic phrasing as a native speaker of the target language would say it — respect the target language's spoken cadence, discourse particles, pro-drop habits, genre-appropriate loanword conventions, and self-reference/pronoun hierarchy. Never translate literally word-by-word.",

    /**
     * NOT-LOCKED guidance — neutral version for non-Malay targets.
     */
    notLockedGuidance:
        "address NOT LOCKED — infer the correct honorific from the dialogue context using the target language's standard title conventions"
};

module.exports = genericPack;
