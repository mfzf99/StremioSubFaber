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
   * P1 pillar-2/3 injection: MANDATORY sociolinguistic honorific matrix.
   * Injected into buildPreflightPrompt() when target = Malay.
   */
  honorificMatrix: [
    'In the \'terms\' list, you MUST include and lock the official ${tgt} titles/honorifics for recurring entities using this MANDATORY sociolinguistic matrix (Malay honorifics):',
    '* "Ms." / "Mrs." for an adult woman — married, mature, an auntie/mak cik figure, or holding a corporate/management position — MUST map to "Puan" (e.g. "Ms. [Surname]" -> "Puan [Surname]", NEVER "Cik [Surname]").',
    '* "Miss" / "Ms." for a young unmarried woman -> "Cik".',
    '* "Mr." -> "Encik". "Aunt" / "Auntie" -> "Mak Cik". "Uncle" -> "Pak Cik".',
    '* "Director" -> "Pengarah". "GM" / "General Manager" -> "Pengurus Besar".',
    'Cross-reference titles: if the same character is addressed as "Aunt" in dialogue AND called "Ms. [Surname]", lock the formal address as "Puan [Surname]" (NOT "Cik [Surname]") — one canonical title per character, never alternate.'
  ].join('\n   '),

  /**
   * P1 pillar-3 injection: canonical_address instruction for the Malay matrix.
   */
  canonicalAddressMatrix: 'Apply the SAME mandatory Malay honorific matrix from the \'terms\' pillar (Ms./Mrs./mature/auntie/manager -> Puan; young unmarried -> Cik; Mr. -> Encik; Auntie -> Mak Cik; Uncle -> Pak Cik; Director -> Pengarah; GM -> Pengurus Besar)',

  /**
   * P1 pillar-4 injection: official media/publishing credit translation example.
   */
  creditsExample: 'provide the official ${tgt} media/publishing translation for each line (e.g. "Adapted from" -> "Diadaptasi daripada")',

  /**
   * P2 injection: Malay few-shot examples — 4 jenayah (anti-crime weapons).
   * [HARMONY-FIX] 2026-09-29: satu contoh → EMPAT contoh, satu bagi setiap
   * jenayah Agent B (MERGE/SHIFT/PHANTOM/DROP), label jenayah pada setiap
   * header supaya Agent A dapat mengaitkan few-shot ↔ structural_rules
   * ↔ INSPECTOR_INSTRUCTION secara 1:1.
   */
  fewShot: `[EXAMPLE 1 — MERGE: split sentence and isolated question tag]
Input:
<s id="1">You are coming with us,</s>
<s id="2">aren't you?</s>
Correct output:
<s id="1">Awak ikut kami,</s>
<s id="2">kan?</s>
Wrong (merged):
<s id="1">Awak ikut kami, kan?</s>
<s id="2">.</s>

[EXAMPLE 2 — SHIFT: every slot must appear, symbol or SFX]
Input:
<s id="1">Sorry I'm late.</s>
<s id="2">♪♪</s>
<s id="3">[door slams]</s>
<s id="4">No problem, sit down.</s>
Correct output:
<s id="1">Maaf saya lewat.</s>
<s id="2">♪♪</s>
<s id="3">[pintu terhempas]</s>
<s id="4">Tak apa, duduklah.</s>
Wrong (slots skipped, dialogue drifts):
<s id="1">Maaf saya lewat.</s>
<s id="2">Tak apa, duduklah.</s>

[EXAMPLE 3 — PHANTOM: never elaborate beyond what the source says]
Input:
<s id="5">Wait.</s>
Correct output:
<s id="5">Tunggu.</s>
Wrong (fabricated content not present in source):
<s id="5">Tunggu, saya perlu fikir dulu sebelum kita teruskan.</s>

[EXAMPLE 4 — DROP: the line's own meaning must survive, not be replaced]
Input:
<s id="6">I never wanted this to happen.</s>
Correct output:
<s id="6">Saya tak pernah nak benda ni jadi.</s>
Wrong (meaning dropped, replaced with generic):
<s id="6">Baiklah.</s>`,

  /**
   * P8 injection: DEFAULT_TRANSLATION_PROMPT rule (target-conditional).
   */
  specificRules: '6. For Malay (ms/my/mya/zsm): use natural Bahasa Melayu Malaysia, keep common English loanwords used in daily speech (okay, confirm, check, settle, try, call, parking, boss, etc.), and choose self-reference based on context: default saya/awak, close aku/kau, formal saya/anda. Strictly avoid Indonesianisms (bisa, banget, gimana, cewek/cowok, kalian, ngomong, kok, dong, sih). Never translate literally word-by-word.',

  /**
   * NOT-LOCKED guidance (P1 formatter + translationEngine._formatPreflightForChunk).
   */
  notLockedGuidance: 'address NOT LOCKED — infer the correct honorific from the dialogue context (Malay matrix: Puan for adult/married/auntie/manager women, Cik for young unmarried women)'
};

module.exports = malayPack;
