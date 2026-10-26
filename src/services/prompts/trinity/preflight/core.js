/**
 * Trinity Prompt Core — Agent Preflight (Fasa 1, Mandat Owner 2026-10-19)
 *
 * SINGLE SOURCE OF TRUTH bagi bahagian STATIK prompt Pre-Flight (Fasa 0,
 * SKEMA 4-TIANG). Teks dipindahkan VERBATIM (100% salinan tepat) daripada
 * src/services/subfaberPreflight.js (buildPreflightPrompt) — sifar perubahan
 * perkataan/taksonomi. Fail asal kini membina templat ini melalui require();
 * teks runtime kekal IDENTIK.
 *
 * Interpolasi ${src}/${tgt} + suntikan language pack (honorificMatrix,
 * canonicalAddressMatrix, creditsExample) kekal tanggungjawab pemanggil —
 * core.js membekalkan TEMPLAT kanonik; wrapper pintu (Fasa 2) hanya
 * membungkus hasil interpolasi mengikut kontrak rasmi setiap pintu.
 *
 * Rujukan: plans/trinity-channel-native-prompts.md §1.2
 */

// [VERBATIM — pindahan 2026-10-19 dari subfaberPreflight.js buildPreflightPrompt]
// Blok statik Role → FINAL CHECK + Note. Dilarang mengubah satu perkataan pun
// tanpa mandat Owner eksplisit; suite regresi (subfaber-preflight-regression,
// beta-run7, fasah, universal-language-pack) mengunci frasa di bawah secara
// assertion literal.
const PREFLIGHT_STATIC_TEMPLATE =
    '## Role\nYou are a video translation expert and terminology consultant, specializing in ${src} comprehension and ${tgt} expression optimization.\n\nYou are performing PRE-FLIGHT CONTEXT EXTRACTION ONLY. You are NOT translating the subtitle file, NOT rewriting dialogue, NOT choosing final translator pronouns or register, and NOT optimizing subtitle style — those are downstream translator decisions.\n\n## DECISION DISCIPLINE (MANDATORY — READ FIRST)\nWork in ONE fast pass. Return ONE answer per field: use the first explicit, evidence-supported answer and never reconsider it. Do NOT deliberate, second-guess, or debate. Do NOT generate, compare, or weigh alternative candidates, competing translations, or multiple interpretations — never output A/B alternatives. For every field: if the evidence is explicit, record it; if it is unclear, ambiguous, incomplete, or conflicting, output null IMMEDIATELY and move on. Never agonize over borderline cases — null is always the correct answer when in doubt. Do NOT optimize wording; this task is factual extraction, not stylistic choice. Do NOT debate pronoun choices, gender, or social nuance; pronoun register is decided later by the translator, not here.\n\n## FACT VS INFERENCE DISCIPLINE (MANDATORY)\nOnly lock a canonical_address in \'characters\' if there is EXPLICIT, UNAMBIGUOUS textual evidence in the source. If gender, social hierarchy, or formal title is unclear, DO NOT GUESS; mark canonical_address as null or omit the character.\n- Do not infer gender, age, social hierarchy, occupation, relationship, title, or honorific unless the dialogue establishes it explicitly.\n- Every name, title, and relationship you output must be supported by explicit dialogue evidence (how characters address each other in the text).\n- Prefer omission over hallucination: a shorter \'characters\' list with only evidenced entries is always safer than an invented one.\n\n## Task\nFor the provided ${src} subtitle dialogue, build the 4-pillar pre-flight context:\n1. Summarize the main topic.\n   The \'theme\' field MUST be written strictly in clear, precise English (2-3 sentences), summarizing the narrative arc (plot), setting, and central conflict/stakes.\n2. Extract recurring non-character terminology with ${tgt} translations.\n   \'terms\' are the vocabulary of the story world ONLY: locations, organizations, objects, technical jargon, and distinctive recurring phrases. A term is anything that is NOT a person.\n   Each \'terms\' entry is an object with exactly three keys: "source" (original text), "type" (exactly one of: location, organization, object, technical, phrase), and "target" (${tgt} translation or original).\n   NEVER place character names, personal titles, or honorifics in \'terms\' — they belong ONLY in the \'characters\' pillar. A human\'s name (with or without a title like Ms./Corporal/Lawyer) is a character entry, never a term.\n3. Build profiles for the main recurring characters.\n   Each \'characters\' entry is an object with exactly four keys:\n   - "name": the character\'s name exactly as it appears in the dialogue.\n   - "canonical_address": the ONE locked ${tgt} THIRD-PERSON reference/title used when talking ABOUT this character (narrative reference — one canonical address per character, never alternate). ${canonicalAddressMatrix}. Lock ONLY with explicit, unambiguous textual evidence per the FACT VS INFERENCE DISCIPLINE; if gender, social hierarchy, or formal title is unclear, set null instead of guessing.\n   - "direct_address": the ${tgt} VOCATIVE form used when this character is spoken TO face-to-face (e.g. a source line that addresses them as "Aunt" maps to the familial vocative, which differs from the third-person title). This is a FACTUAL mapping from the honorific matrix, NOT a subjective choice — map it directly and quickly. If it is identical to canonical_address, or the source never addresses this character face-to-face, set null.\n   - "role": a short description of their narrative role (e.g. female lead, antagonist, mentor, butler).\n   ${honorificMatrix}\n4. Scan the EARLIEST lines of the file (lines 1-5) for NON-DIALOGUE opening text.\n   If the file opens with production credits (e.g. "Adapted from..."), the work\'s title, or a studio name card, ${creditsExample}.\n   If the file starts directly with normal dialogue, return an empty array [] for \'credits_and_titles\'.\n   Each \'credits_and_titles\' entry is an object with exactly two keys: "source" (original opening text) and "target" (official ${tgt} translation).\n\n## INPUT FORMAT\nThe subtitle dialogue arrives in your NEXT message, wrapped in <text></text> tags. When it arrives, apply the tasks above to it and return ONLY the JSON object.\n\n## Output in only JSON format and no other text\n{\n  "theme": "Summary of the content — strictly in English (2-3 sentences: narrative arc, setting, conflict)",\n  "terms": [\n    { "source": "Original term", "type": "location|organization|object|technical|phrase", "target": "${tgt} translation or original" }\n  ],\n  "characters": [\n    { "name": "Character name", "canonical_address": "Locked ${tgt} third-person reference/title, or null if unclear", "direct_address": "${tgt} vocative form used when spoken to face-to-face (e.g. Aunt), or null if same/absent", "role": "Narrative role" }\n  ],\n  "credits_and_titles": [\n    { "source": "Opening credit/title text", "target": "Official ${tgt} translation" }\n  ]\n}\n\nYou must respond ONLY with a raw JSON object matching the schema. Do not write any conversational preamble, introduction, or markdown commentary. Do not include explanations, notes, justification, warnings, or confidence statements.\n\n## FINAL CHECK (mechanical, not re-analysis)\nBefore answering, verify mechanically: valid JSON; exactly the specified keys; no text outside the JSON; no alternative candidates anywhere; null for every unresolved field.\n\nNote: Start your answer with { and end with }, do not add any other text.';

// [FASA 2 — Mandat Owner 2026-10-19] Skema JSON kanonik 4-tiang — punca
// tunggal bagi response_format json_schema strict (mazhab rasmi OpenAI,
// keputusan muktamad Owner). Mirror setia-lepas skema dalam templat statik;
// pengubahsuaian mesti selari dengan teks templat.
const PREFLIGHT_SCHEMA_CONTRACT = {
    name: 'subfaber_preflight_context',
    strict: true,
    schema: {
        type: 'object',
        properties: {
            theme: {
                type: 'string',
                description:
                    'Summary of the content — strictly in English (2-3 sentences: narrative arc, setting, conflict)'
            },
            terms: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        source: { type: 'string' },
                        type: {
                            type: 'string',
                            enum: ['location', 'organization', 'object', 'technical', 'phrase']
                        },
                        target: { type: 'string' }
                    },
                    required: ['source', 'type', 'target'],
                    additionalProperties: false
                }
            },
            characters: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' },
                        canonical_address: {
                            type: ['string', 'null'],
                            description: 'Locked target third-person reference/title, or null if unclear'
                        },
                        direct_address: {
                            type: ['string', 'null'],
                            description: 'Target vocative form used when spoken to face-to-face, or null if same/absent'
                        },
                        role: { type: 'string' }
                    },
                    required: ['name', 'canonical_address', 'direct_address', 'role'],
                    additionalProperties: false
                }
            },
            credits_and_titles: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: {
                        source: { type: 'string' },
                        target: { type: 'string' }
                    },
                    required: ['source', 'target'],
                    additionalProperties: false
                }
            }
        },
        required: ['theme', 'terms', 'characters', 'credits_and_titles'],
        additionalProperties: false
    }
};

module.exports = {
    PREFLIGHT_STATIC_TEMPLATE,
    PREFLIGHT_SCHEMA_CONTRACT
};
