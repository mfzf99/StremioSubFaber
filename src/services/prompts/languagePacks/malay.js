/**
 * [UNIVERSAL-FIX] Language Pack — MALAY (Bahasa Melayu Malaysia)
 *
 * Migrated verbatim from the formerly-hardcoded prompt blocks:
 *   - P1 (subfaberPreflight.js): Malay sociolinguistic honorific matrix
 *     ("Ms. [Surname]" → "Puan [Surname]"), canonical_address guidance, credits example.
 *   - P2 (translationEngine.js): Malay few-shot split-sentence example
 *     ("Awak ikut kami," / "kan?").
 *   - P8 (gemini.js DEFAULT_TRANSLATION_PROMPT rule #6): natural Bahasa
 *     Melayu Malaysia rules + Indonesianism blacklist.
 *
 * Aliases (ms/my/mya/zsm/zzm...) are resolved by index.js getLanguagePack().
 * Any target language that is NOT Malay resolves to generic.js — Malay rules
 * MUST NEVER leak into non-Malay prompts (universal 433-language contract).
 *
 * Interface: { code, aliases, honorificMatrix, fewShot, specificRules,
 *              notLockedGuidance, creditsExample }
 */

const malayPack = {
    code: 'ms',
    aliases: ['ms', 'my', 'mya', 'zsm', 'zzm', 'malay', 'bahasa melayu', 'melayu'],

    /**
     * P1 pillar-3 injection: MANDATORY sociolinguistic honorific matrix.
     * [KNP-ALIGNMENT 2026-10-07] Matriks dipindah ke TIANG 3 (characters) —
     * arahan lama "terms WAJIB mengunci gelaran watak" adalah PUNCA AKAR
     * terms-pollution (audit KNP §5.10: Fasa D membuktikan "ms. yoon sae-bom"
     * dsb. bocor masuk terms, Jaccard terms 0.51-0.62). Netflix KNP tidak
     * pernah meletakkan gelaran watak dalam senarai istilah. Mandat "MUST"
     * kini terletak pada PEMETAAN (bila mengunci), bukan pada pemasukan —
     * menghapuskan kontradiksi MANDATORY vs null-discipline.
     */
    honorificMatrix: [
        "When locking character addresses in the 'characters' pillar, apply this MANDATORY sociolinguistic matrix of official ${tgt} titles/honorifics (Malay honorifics):",
        '* EVIDENCE PRECEDENCE: explicit evidence that a woman is a mother (called "Mom"/"Mother"/"Mum"/"Mommy" by her child, or identified as a parent) or married (wife/spouse) OVERRIDES "Ms.", "Miss", and apparent youth. Her canonical_address MUST use "Puan [Name]", NEVER "Cik [Name]". Apply this only when the relationship is explicit; never invent motherhood or marriage.',
        '* "Ms." / "Mrs." for an adult woman — married, mature, an auntie/mak cik figure, or holding a corporate/management position — MUST map to "Puan" (e.g. "Ms. [Surname]" -> "Puan [Surname]", NEVER "Cik [Surname]").',
        '* "Miss" / "Ms." for a young unmarried woman -> "Cik" only when there is no explicit evidence of motherhood or marriage.',
        '* "Mr." -> "Encik". "Aunt" / "Auntie" -> "Mak Cik". "Uncle" -> "Pak Cik".',
        '* "Director" -> "Pengarah". "GM" / "General Manager" -> "Pengurus Besar".',
        '* Cross-genre mappings: "Sir" -> "Tuan". "Madam" / "Ma\'am" -> "Puan". "Captain" -> "Kapten". "Detective" -> "Detektif". "Dr." -> "Dr.". "Older Brother" -> "Abang". "Older Sister" -> "Kakak".',
        'Cross-reference titles: if the same character is addressed as "Aunt" in dialogue AND called "Ms. [Surname]", lock the formal address as "Puan [Surname]" (NOT "Cik [Surname]") — one canonical title per character, never alternate.',
        'Mother vocative distinction: if her child calls her "Mom"/"Mother"/"Mum"/"Mommy", set direct_address = "Mak" while canonical_address = "Puan [Name]". Do NOT replace the formal reference with "Mak [Name]" merely because she is a mother.',
        'These title mappings are recorded EXCLUSIVELY as character addresses (canonical_address / direct_address) — never as terms entries.'
    ].join('\n   '),

    /**
     * P1 pillar-3 injection: canonical_address instruction for the Malay matrix.
     */
    canonicalAddressMatrix:
        'Apply the Malay honorific matrix below with evidence precedence (explicit mother/married -> Puan even if source says Ms./Miss; otherwise Ms./Mrs./mature/auntie/manager -> Puan; young unmarried without such evidence -> Cik; Mr. -> Encik; Auntie -> Mak Cik; Uncle -> Pak Cik; Director -> Pengarah; GM -> Pengurus Besar)',

    /**
     * P1 pillar-4 injection: official media/publishing credit translation example.
     */
    creditsExample:
        'translate generic media/publishing credit phrases naturally (e.g. "Adapted from" -> "Diadaptasi daripada"); for a creative-work title, use an official ${tgt} title only when already known with confidence, otherwise retain the original title',

    /**
     * [FEW-SHOT-V2 2026-11-14 — Mandat Owner] 3 contoh ISOMETRIK dalam
     * format <example><example_input>/<example_output><answer>: (1) [br] + <i> markup, (2)
     * SDH speaker label + muzik + SFX, (3) disiplin alamat KNP (direct
     * address face-to-face "Abang" vs canonical ketiga "Kapten Vance").
     * Few-shot kini disuntik KEDUA-DUA mod (templat tunggal); label
     * jenayah legasi dibuang — perlindungan parity dibawa oleh seksyen
     * [TECHNICAL CONSTRAINTS] + Agent Inspector.
     */
    fewShot: `<example>
<example_input>
<s id="1">You've got to be kidding me.[br]Are we really doing this right now?</s>
<s id="2"><i>Internal Affairs</i> won't back us up if this goes south.</s>
</example_input>
<example_output>
<answer>
<s id="1">Biar betul.[br]Memang nak buat sekarang ke?</s>
<s id="2"><i>Unit Integriti</i> takkan bantu kita kalau benda ni jadi kecoh.</s>
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
<s id="2">(Marcus) Bertenang, adik.[br]Sindiket Jeti tak tahu pun benda tu dah hilang.</s>
<s id="3">[pintu terhempas]</s>
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
<s id="1">Abang, dengar sini.[br]Aku jumpa <i>Manifes 404</i> dalam bilik besi tu.</s>
<s id="2">Kalau Kapten Vance tahu kita yang ambil, kita dah kongsi.</s>
</answer>
</example_output>
</example>`,

    /**
     * P8 injection: DEFAULT_TRANSLATION_PROMPT rule (target-conditional).
     */
    specificRules: `7. For Malay (ms/my/mya/zsm):
- Spoken Malaysian Cadence: write natural Bahasa Melayu Malaysia using conversational particles (lah, kan, pun, je, dah, ni, tu, kot) and contractions (tak, nak, kejap) where fitting so lines sound spoken, never like a school textbook.
- Register-Gated Loanwords: keep common English loanwords used in daily speech (okay, confirm, check, settle, try, call, parking, boss, bro, sorry) ONLY in modern, casual, or urban contexts — never in period dramas, fantasy, or formal/solemn scenes.
- Pronouns & Pro-Drop: drop redundant pronouns when context is clear, and never translate dummy "it" as "ia/ianya" (e.g., "It hurts" → "Sakitnya", "It's over" → "Dah berakhir"). When pronouns are needed, match the relationship: close/peers/heated aku/kau, polite/neutral saya/awak (or drop "awak" with superiors/strangers), formal saya (avoid commercial "anda" in character dialogue unless addressing a public audience or broadcast).
- Zero Indonesianisms: strictly avoid bisa, banget, gimana, cewek/cowok, kalian, ngomong, kok, dong, sih, gue/lu, keren. Never translate literally word-by-word.`,

    /**
     * NOT-LOCKED guidance (P1 formatter + translationEngine._formatPreflightForChunk).
     */
    notLockedGuidance:
        'address NOT LOCKED — infer the correct honorific from explicit dialogue context (Malay matrix: Puan for mothers/married/adult/auntie/manager women, Cik for young unmarried women without evidence of motherhood or marriage)'
};

module.exports = malayPack;
