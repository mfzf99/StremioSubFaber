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
const { getTrinitySetup } = require('../setups');
const INSPECTOR_INSTRUCTION = getTrinitySetup('A').inspectorInstruction;

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
