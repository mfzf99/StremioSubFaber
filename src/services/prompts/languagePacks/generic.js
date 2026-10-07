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
     * (needed for Agent B SHIFT/consistency audits) without any Malay mapping.
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
        'provide the official ${tgt} media/publishing translation for each line (e.g. "Adapted from..." -> its official published ${tgt} rendering)',

    /**
     * P2 injection: language-neutral few-shot — 2 contoh PARITY-CRITICAL.
     * [PROMPT-SLIM 2026-09-30] 6 → 2 contoh: hanya MERGE + SHIFT (dua
     * jenayah yang merosakkan struktur; yang lain dilindungi rules +
     * inspection Agent B). UNIVERSAL COMPLIANCE kekal: sifar teks
     * khusus-bahasa — placeholder + simbol universal sahaja.
     */
    fewShot: `[EXAMPLE 1 — MERGE: keep split sentences and question tags isolated]
Input:
<s id="1">You are coming with us,</s>
<s id="2">aren't you?</s>
Correct:
<s id="1">[translation of "You are coming with us,"]</s>
<s id="2">[translation of "aren't you?" — isolated tag in own slot]</s>
Wrong (merged):
<s id="1">[full merged sentence]</s>
<s id="2">.</s>

[EXAMPLE 2 — SHIFT: every slot must appear; symbols/music copied as-is]
Input:
<s id="1">Sorry I'm late.</s>
<s id="2">♪♪</s>
<s id="3">[door slams]</s>
<s id="4">No problem, sit down.</s>
Correct:
<s id="1">[translation of "Sorry I'm late."]</s>
<s id="2">♪♪</s>
<s id="3">[translation of "[door slams]"]</s>
<s id="4">[translation of "No problem, sit down."]</s>
Wrong (slots skipped):
<s id="1">[translation of "Sorry I'm late."]</s>
<s id="2">[translation of "No problem, sit down."]</s>`,

    /**
     * P8 injection: neutral rule #6 for DEFAULT_TRANSLATION_PROMPT.
     */
    specificRules:
        "6. Use natural, idiomatic phrasing as a native speaker of the target language would say it — respect the target language's standard register, common loanword conventions, and self-reference/pronoun conventions. Never translate literally word-by-word.",

    /**
     * NOT-LOCKED guidance — neutral version for non-Malay targets.
     */
    notLockedGuidance:
        "address NOT LOCKED — infer the correct honorific from the dialogue context using the target language's standard title conventions"
};

module.exports = genericPack;
