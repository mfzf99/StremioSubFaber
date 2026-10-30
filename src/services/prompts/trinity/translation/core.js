/**
 * Trinity Prompt Core — Agent Translation (Fasa 1, Mandat Owner 2026-10-19)
 *
 * SINGLE SOURCE OF TRUTH bagi bahagian STATIK prompt batch Agent Translation
 * (PROMPT V4 "SLIM & SHARP", Prompt-Slim Mandate 2026-09-30). Teks dipindahkan
 * VERBATIM (100% salinan tepat) daripada src/services/translationEngine.js
 * (createXmlBatchPrompt → systemPart) — sifar perubahan perkataan/taksonomi.
 * Fail asal kini membina systemPart melalui require(); teks runtime kekal
 * IDENTIK.
 *
 * Interpolasi ${sourceLabel}/${targetLabel}/${fewShotPack} kekal tanggungjawab
 * pemanggil — core.js membekalkan TEMPLAT kanonik; wrapper pintu (Fasa 2)
 * hanya membungkus hasil interpolasi mengikut kontrak rasmi setiap pintu.
 *
 * Rujukan: plans/trinity-channel-native-prompts.md §1.2
 */

// [PROMPT SETUP REGISTRY — Mandat Owner 2026-10-30] Literal template dipindahkan
// VERBATIM (byte-identical, disahkan === true sebelum commit) ke
// setups/setupA.js (Setup A — baseline Finale v3.25.1). core.js kekal
// Single Source of Truth bagi KONTRAK export TRANSLATION_SYSTEM_TEMPLATE;
// teks disimpan dalam registry setup supaya Owner boleh menyimpan/switch
// antara setup prompt (A/B/C) tanpa menyentuh fail ini.
// [VERBATIM — pindahan 2026-10-19 dari translationEngine.js createXmlBatchPrompt]
// Blok statik Role → Output Format. Dilarang mengubah satu perkataan pun tanpa
// mandat Owner eksplisit; suite regresi (subfaber-context-regression,
// universal-language-pack) mengunci frasa di bawah secara assertion literal.
// [PENAJAMAN 2026-10-24 — Mandat Owner, Zero-Regression Surgical Upgrade]
// Suntingan terhad ZON BEBAS sahaja (laporan forensik assertion 2026-10-24):
// translation_principles, teks badan ANTI-MERGE/SHIFT/UNTRANSLATED selepas
// label, paragraf Style, dan klausa pronouns/titles. SEMUA frasa ZON
// TERKUNCI kekal verbatim (CCR/ULP/TPM menguncinya secara includes literal):
// keep slot/ID parity sacred · a native speaker would actually say ·
// 6 label rules · klausa SFX Rule 2 · natural, conversational · Never calque ·
// never inject titles onto bare names · Output Format · ZERO translator notes.
const { getTranslationSetup } = require('./setups');
const TRANSLATION_SYSTEM_TEMPLATE = getTranslationSetup('A').template;

module.exports = {
    TRANSLATION_SYSTEM_TEMPLATE
};
