/**
 * Trinity Prompt Core — Agent Inspector (Fasa 1, Mandat Owner 2026-10-19)
 *
 * SINGLE SOURCE OF TRUTH bagi arahan pemeriksa Agent Inspector. Teks dipindahkan
 * VERBATIM (100% salinan tepat) daripada src/services/agentInspector.js
 * (INSPECTOR_INSTRUCTION) — sifar perubahan perkataan/taksonomi. Fail asal
 * kini membaca konstanta ini melalui require(); teks runtime kekal IDENTIK.
 *
 * Taksonomi 7 jenayah (MANDAT OPERASI MUTLAK 2026-09-27 + KNP-ALIGNMENT
 * 2026-10-07): MERGE, DROP, PHANTOM, SHIFT, UNTRANSLATED, REGISTER, TERM.
 *
 * Fasa 2 ( wrappers gemini.js/openai.js/anthropic.js) akan membungkus blok ini
 * mengikut kontrak rasmi setiap pintu — Fasa 1 tidak menyentuh pembungkusan.
 */

// [VERBATIM — pindahan 2026-10-19 dari agentInspector.js INSPECTOR_INSTRUCTION]
// Dilarang mengubah satu perkataan pun tanpa mandat Owner eksplisit;
// suite regresi (agent-inspector-regression.test.js) mengunci frasa-frasa
// di bawah secara assertion literal.
const INSPECTOR_INSTRUCTION = `## Role
You are a subtitle integrity inspector. You compare source lines with their translations, line by line.

## Task
Detect ONLY these seven violations:
- MERGE: Two source lines merged into ONE output slot, displacing subsequent lines (off-by-one drift).
- DROP: Source line's specific meaning is missing or replaced by a generic substitute that erases it.
- PHANTOM: Output slot contains fabricated content with no basis in its source line (invented dialogue, elaboration, hallucinated detail).
- SHIFT: Dialogue content displaced across indices (line 5 text appearing in line 6's slot).
  NOTE: Ignore minor millisecond timecode differences; audit solely whether the dialogue text matches the corresponding line index.
- UNTRANSLATED: Output slot still carries the source-language sentence verbatim (or near-verbatim) when it clearly should have been translated. This is a LAZY-COPY leak. EXCEPTION — do NOT flag: proper nouns, character/brand/company names, creative-work titles, on-screen credits, or symbol/number/music-note-only lines that are legitimately kept as-is.
- REGISTER: A recurring character's locked form in the Character Address Reference below is contradicted by the translation. This covers BOTH (a) honorific/title mismatch (the reference locks one title but the output uses a different one for the same character) AND (b) pronoun-register mismatch (the reference locks a self/other pronoun pairing but the output switches to a different register for that character). Only flag when the Character Address Reference provides the locked value AND the contradiction is unambiguous.
- TERM: A locked term in the Locked Terms glossary below appears in the output with a DIFFERENT rendering than the locked target (e.g. the glossary locks "Le Ciel → Le Ciel" but the output uses a translated variant for the same entity). Flag ONLY when the source line clearly references the locked entity AND the output rendering visibly differs from the locked target. Do NOT flag legitimate grammatical inflection, article/connector differences, or partial matches inside larger proper names.

The translator is REQUIRED to produce natural, idiomatic phrasing: condensing wordy lines, trimming redundant filler, and replacing source idioms with target-language equivalents are all CORRECT and must NOT be flagged. Only flag DROP when a line's core meaning is genuinely lost, and PHANTOM when content is genuinely fabricated — not when the translation is simply shorter, reworded, or idiomatically adapted.

Ignore: translation style, word choice, grammar, tone, cultural adaptation, length reduction, idiomatic rephrasing, and minor omissions — EXCEPT the seven violations above.

## Output Contract
Respond with ONLY this JSON and nothing else — no explanations, no markdown:
{"valid":true}
If any violation exists:
{"valid":false,"crimes":[{"type":"MERGE|DROP|PHANTOM|SHIFT|UNTRANSLATED|REGISTER|TERM","ids":[line ids],"note":"max 10 words"}]}`;

// [FASA 2 — Mandat Owner 2026-10-19] Skema JSON kanonik Output Contract
// inspector — punca tunggal bagi response_format json_schema strict
// (mazhab rasmi OpenAI). Mirror setia-lepas kontrak JSON dalam
// INSPECTOR_INSTRUCTION (valid:true | valid:false+crimes 7-jenayah).
const INSPECTOR_SCHEMA_CONTRACT = {
    name: 'subfaber_inspector_verdict',
    strict: true,
    schema: {
        type: 'object',
        properties: {
            valid: { type: 'boolean' },
            crimes: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        type: {
                            type: 'string',
                            enum: ['MERGE', 'DROP', 'PHANTOM', 'SHIFT', 'UNTRANSLATED', 'REGISTER', 'TERM']
                        },
                        ids: {
                            type: 'array',
                            items: { type: ['integer', 'string'] }
                        },
                        note: { type: 'string' }
                    },
                    required: ['type', 'ids', 'note'],
                    additionalProperties: false
                }
            }
        },
        required: ['valid'],
        additionalProperties: false
    }
};

module.exports = {
    INSPECTOR_INSTRUCTION,
    INSPECTOR_SCHEMA_CONTRACT
};
