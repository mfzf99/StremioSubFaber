/**
 * Prompt Sandbox Regression — Kontrak Resolver (Mandat Owner 2026-11-16, v3.38.0)
 *
 * Ujian kontrak `src/config/promptSandbox.js` (Fasa B — red-first; suite ini
 * diperhatikan MERAH (MODULE_NOT_FOUND) sebelum fail produksi dicipta).
 *
 * Yang dipin (selari keputusan Owner D1–D4 + 3 pengetatan):
 *   SBX-1  Modul & API: resolvePromptSandbox, __setPromptSandboxForTests,
 *          __resetPromptSandboxForTests, promptSandboxConfig (lalai selamat).
 *   SBX-2  Lalai gate-off: passthrough official, active:false, hash8:null.
 *   SBX-3  Gate kalis node --test telanjang: enabled:true pada config mentah
 *          DALAM test context masih passthrough official (bukti CI kekal
 *          hijau walaupun Owner push enabled:true ke GitHub).
 *   SBX-4  Injection force: enabled:true + kedua-dua teks → aktif; teks
 *          VERBATIM; hash8 = 8 hex deterministik (SHA-256 UTF-8 ke atas
 *          JSON.stringify([template, malayFewShot])).
 *   SBX-5  Hash berubah per-aksara; berbeza antara varian; stabil merentas
 *          panggilan; hash pasangan efektif (bukan pasangan override sahaja).
 *   SBX-6  Fall-back keselamatan: enabled:true + kedua-duanya kosong →
 *          official penuh + reason (sifar senyap, sifar eksperimen separuh).
 *   SBX-7  Per-medan bebas: satu medan sahaja digunakan, rakan kekal official.
 *   SBX-8  Medan rosak (non-string / kosong / whitespace-only) → medan itu
 *          official + reason; medan sihat tidak terjejas.
 *   SBX-9  Sentinel SUBFABER_PROMPT_BOUNDARY HARAM dalam teks override.
 *   SBX-10 Bentuk placeholder rasmi tunggal ${...} kekal VERBATIM dalam
 *          hasil resolve (interpolasi milik engine, bukan resolver).
 *   SBX-11 Verbatim penuh: leading/trailing whitespace + newline dikekalkan.
 */

const test = require('node:test');
const assert = require('node:assert');

const {
    resolvePromptSandbox,
    __setPromptSandboxForTests,
    __resetPromptSandboxForTests,
    promptSandboxConfig
} = require('./promptSandbox');
const { SUBFABER_PROMPT_BOUNDARY } = require('../services/utils/structuredPrompt');

const OFFICIAL_TEMPLATE = 'OFFICIAL TEMPLATE ${sourceLabel} -> ${targetLabel} ${fewShot}';
const OFFICIAL_MALAY_FEWSHOT = '<example>\n<example_input>\nOFFICIAL FEWSHOT\n</example_input>\n</example>';
// [TARGET-LANGUAGE-RULES 2026-11-21] Official ketiga bagi ujian 3-tuple.
const OFFICIAL_MALAY_RULES = 'OFFICIAL RULES ${targetLanguageRules}';

function resolve(
    officialTemplate = OFFICIAL_TEMPLATE,
    officialMalayFewShot = OFFICIAL_MALAY_FEWSHOT,
    officialMalayTargetLanguageRules = OFFICIAL_MALAY_RULES
) {
    return resolvePromptSandbox({ officialTemplate, officialMalayFewShot, officialMalayTargetLanguageRules });
}

// ── 1. Modul & API ──────────────────────────────────────────────────────

test('SBX-1: modul promptSandbox mendedahkan API kontrak dengan bentuk konfigurasi sah', () => {
    assert.equal(typeof resolvePromptSandbox, 'function', 'resolvePromptSandbox wajib fungsi');
    assert.equal(typeof __setPromptSandboxForTests, 'function', 'injection wajib fungsi');
    assert.equal(typeof __resetPromptSandboxForTests, 'function', 'reset injection wajib fungsi');
    // Pin BENTUK sahaja (bukan nilai mutlak fail) supaya CI kekal hijau
    // apabila Owner mengaktifkan eksperimen di GitHub — kelakuan lalai
    // dipin oleh SBX-2/SBX-3 melalui keadaan eksplisit.
    assert.equal(typeof promptSandboxConfig.enabled, 'boolean', 'enabled mesti boolean');
    assert.ok(
        promptSandboxConfig.translationSystemTemplate === null ||
            typeof promptSandboxConfig.translationSystemTemplate === 'string',
        'translationSystemTemplate meste null atau string'
    );
    assert.ok(
        promptSandboxConfig.malayFewShot === null || typeof promptSandboxConfig.malayFewShot === 'string',
        'malayFewShot mesti null atau string'
    );
});

// ── 2. Lalai gate-off ──────────────────────────────────────────────────

test('SBX-2: dalam test context, resolver SENTIASA passthrough official (gate), walau apa pun fail config', () => {
    // Pin BEHAVIOUR gate (bukan nilai fail) supaya CI kekal hijau apabila
    // Owner mengaktifkan eksperimen di GitHub — dan setiap larian CI dengan
    // sandbox aktif menjadi bukti gate yang terbenam.
    const out = resolve();
    assert.equal(out.template, OFFICIAL_TEMPLATE, 'templat = official');
    assert.equal(out.malayFewShot, OFFICIAL_MALAY_FEWSHOT, 'few-shot = official');
    assert.equal(out.active, false, 'test context: tidak pernah aktif');
    assert.equal(out.hash8, null, 'test context: sifar namespace sandbox');
    assert.ok(Array.isArray(out.reasons), 'reasons mesti array');
    if (promptSandboxConfig.enabled === true) {
        assert.ok(
            out.reasons.some((r) => /test context|Test context/i.test(r)),
            'sandbox aktif pada fail → reason gate test context wajib direkodkan'
        );
    } else {
        assert.deepEqual(out.reasons, [], 'lalai bersih → sifar reason');
    }
});

// ── 3. Gate kalis node --test telanjang (bukti CI hijau) ────────────────

test('SBX-3: enabled=true pada config mentah DALAM test context tetap passthrough (gate)', () => {
    // Simulasikan Owner yang push enabled:true + teks eksperimen ke GitHub:
    // suite CI (node --test) TIDAK BOLEH melihat teks eksperimen.
    promptSandboxConfig.enabled = true;
    promptSandboxConfig.translationSystemTemplate = 'SANDBOX TEMPLATE MUST NOT LOAD IN TESTS';
    promptSandboxConfig.malayFewShot = 'SANDBOX FEWSHOT MUST NOT LOAD IN TESTS';
    try {
        const out = resolve();
        assert.equal(out.template, OFFICIAL_TEMPLATE, 'gate: templat official kekal');
        assert.equal(out.malayFewShot, OFFICIAL_MALAY_FEWSHOT, 'gate: few-shot official kekal');
        assert.equal(out.active, false, 'gate: tidak aktif dalam test context');
        assert.equal(out.hash8, null, 'gate: hash8 null dalam test context');
    } finally {
        promptSandboxConfig.enabled = false;
        promptSandboxConfig.translationSystemTemplate = null;
        promptSandboxConfig.malayFewShot = null;
    }
});

// ── 4. Injection force (uji-sahaja, bypass gate) ────────────────────────

test('SBX-4: injection enabled=true + kedua-dua teks → aktif, verbatim, hash8 deterministik', () => {
    try {
        __setPromptSandboxForTests({
            enabled: true,
            translationSystemTemplate: 'SANDBOX TEMPLATE A',
            malayFewShot: 'SANDBOX FEWSHOT A'
        });
        const out = resolve();
        assert.equal(out.active, true, 'aktif melalui injection eksplisit');
        assert.equal(out.template, 'SANDBOX TEMPLATE A', 'tempat eksperimen VERBATIM');
        assert.equal(out.malayFewShot, 'SANDBOX FEWSHOT A', 'few-shot eksperimen VERBATIM');
        assert.match(out.hash8, /^[0-9a-f]{8}$/, 'hash8 = 8 aksara hex');
        assert.equal(out.hash8, resolve().hash8, 'hash8 stabil merentas panggilan');
    } finally {
        __resetPromptSandboxForTests();
    }
});

test('SBX-5: hash8 berubah per-aksara, berbeza antara varian, dan dikira atas pasangan EFEKTIF', () => {
    try {
        __setPromptSandboxForTests({
            enabled: true,
            translationSystemTemplate: 'SANDBOX TEMPLATE A',
            malayFewShot: 'SANDBOX FEWSHOT A'
        });
        const a = resolve().hash8;
        __setPromptSandboxForTests({
            enabled: true,
            translationSystemTemplate: 'SANDBOX TEMPLATE B', // satu aksara berubah
            malayFewShot: 'SANDBOX FEWSHOT A'
        });
        const b = resolve().hash8;
        assert.notEqual(a, b, 'satu aksara templat → hash baharu');

        // Pasangan efektif: templat eksperimen + few-shot OFFICIAL (satu medan sahaja)
        __setPromptSandboxForTests({ enabled: true, translationSystemTemplate: 'SANDBOX TEMPLATE A' });
        const mixed = resolve().hash8;
        assert.notEqual(mixed, a, 'hash pasangan efektif ≠ hash pasangan override penuh');

        const crypto = require('crypto');
        // [TARGET-LANGUAGE-RULES 2026-11-21] Formula 3-tuple: medan rules
        // (di sini official, kerana injection tidak menetapkannya).
        const expected = crypto
            .createHash('sha256')
            .update(JSON.stringify(['SANDBOX TEMPLATE A', OFFICIAL_MALAY_FEWSHOT, OFFICIAL_MALAY_RULES]), 'utf8')
            .digest('hex')
            .slice(0, 8);
        assert.equal(mixed, expected, 'hash8 = SHA-256(JSON.stringify([template, fewShot, rules])) 8-hex');
    } finally {
        __resetPromptSandboxForTests();
    }
});

// ── 6. Fall-back keselamatan (enabled:true tetapi tiada teks sah) ────────

test('SBX-6: enabled=true + kedua-duanya kosong → official penuh + reason (bukan senyap)', () => {
    try {
        __setPromptSandboxForTests({ enabled: true, translationSystemTemplate: null, malayFewShot: null });
        const out = resolve();
        assert.equal(out.template, OFFICIAL_TEMPLATE, 'templat official');
        assert.equal(out.malayFewShot, OFFICIAL_MALAY_FEWSHOT, 'few-shot official');
        assert.equal(out.active, false, 'sifar eksperimen separuh jalan');
        assert.equal(out.hash8, null, 'sifar namespace sandbox');
        assert.ok(
            out.reasons.some((r) => /translationSystemTemplate|malayFewShot|fallback/i.test(r)),
            'reason fall-back direkodkan (sifar senyap)'
        );
    } finally {
        __resetPromptSandboxForTests();
    }
});

// ── 7. Per-medan bebas ──────────────────────────────────────────────────

test('SBX-7: satu medan sahaja → medan itu digunakan, rakan kekal official', () => {
    try {
        __setPromptSandboxForTests({ enabled: true, translationSystemTemplate: 'SANDBOX TEMPLATE ONLY' });
        const out = resolve();
        assert.equal(out.template, 'SANDBOX TEMPLATE ONLY', 'templat eksperimen');
        assert.equal(out.malayFewShot, OFFICIAL_MALAY_FEWSHOT, 'few-shot kekal official');
        assert.equal(out.active, true, 'aktif (sekurang-kurangnya satu medan)');

        __setPromptSandboxForTests({ enabled: true, malayFewShot: 'SANDBOX FEWSHOT ONLY' });
        const out2 = resolve();
        assert.equal(out2.template, OFFICIAL_TEMPLATE, 'templat kekal official');
        assert.equal(out2.malayFewShot, 'SANDBOX FEWSHOT ONLY', 'few-shot eksperimen');
        assert.equal(out2.active, true, 'aktif');
    } finally {
        __resetPromptSandboxForTests();
    }
});

// ── 8. Medan rosak ──────────────────────────────────────────────────────

test('SBX-8: medan rosak (non-string / kosong / whitespace) → medan itu official + reason', () => {
    try {
        __setPromptSandboxForTests({ enabled: true, translationSystemTemplate: 12345, malayFewShot: '   ' });
        const out = resolve();
        assert.equal(out.template, OFFICIAL_TEMPLATE, 'non-string ditolak → official');
        assert.equal(out.malayFewShot, OFFICIAL_MALAY_FEWSHOT, 'whitespace-only ditolak → official');
        assert.equal(out.active, false, 'tiada medan sah → tidak aktif');
        assert.ok(out.reasons.length >= 2, 'setiap medan rosak direkodkan');
    } finally {
        __resetPromptSandboxForTests();
    }
});

// ── 9. Sentinel sempadan ────────────────────────────────────────────────

test('SBX-9: sentinel SUBFABER_PROMPT_BOUNDARY HARAM dalam teks override', () => {
    try {
        __setPromptSandboxForTests({
            enabled: true,
            translationSystemTemplate: `SANDBOX ${SUBFABER_PROMPT_BOUNDARY} TEMPLATE`
        });
        const out = resolve();
        assert.equal(out.template, OFFICIAL_TEMPLATE, 'templat bawa sentinel → ditolak → official');
        assert.equal(out.active, false, 'tidak aktif');
        assert.ok(
            out.reasons.some((r) => /boundary|sentinel/i.test(r)),
            'penolakan sentinel direkodkan'
        );
    } finally {
        __resetPromptSandboxForTests();
    }
});

// ── 10. Placeholder kedua-dua bentuk kekal verbatim (resolver tidak interpolate) ──

test('SBX-10: ${...} kekal VERBATIM dalam hasil resolve (interpolasi milik engine)', () => {
    try {
        __setPromptSandboxForTests({
            enabled: true,
            translationSystemTemplate: 'SBX ${sourceLabel} -> ${targetLabel} ${fewShot}',
            malayFewShot: 'SBX FEWSHOT ${targetLabelShort}'
        });
        const out = resolve();
        assert.equal(out.template, 'SBX ${sourceLabel} -> ${targetLabel} ${fewShot}', 'templat tidak diubah');
        assert.equal(out.malayFewShot, 'SBX FEWSHOT ${targetLabelShort}', 'few-shot tidak diubah');
    } finally {
        __resetPromptSandboxForTests();
    }
});

// ── 11. Verbatim penuh ──────────────────────────────────────────────────

test('SBX-11: whitespace tepi dan newline dikekalkan verbatim (trim hanya untuk pemeriksaan)', () => {
    try {
        const raw = '\n\n  SANDBOX WITH WHITESPACE  \n';
        __setPromptSandboxForTests({ enabled: true, malayFewShot: raw });
        const out = resolve();
        assert.equal(out.malayFewShot, raw, 'nilai verbatim — tiada trim pada kandungan');
        assert.equal(out.active, true, 'aktif');
    } finally {
        __resetPromptSandboxForTests();
    }
});
