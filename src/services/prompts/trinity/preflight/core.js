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
const { getTrinitySetup } = require('../setups');
const PREFLIGHT_STATIC_TEMPLATE = getTrinitySetup('A').preflightTemplate;

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
