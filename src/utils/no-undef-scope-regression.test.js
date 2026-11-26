/**
 * [v3.41.2 — AUDIT no-undef] PIN SKOP: rujukan lintas-blok/lintas-fungsi.
 *
 * Punca: eslint.config.mjs hanya menjalankan `no-unused-vars`. `no-undef` TIDAK
 * diaktifkan, jadi rujukan kepada pembolehubah yang tidak kelihatan pada skop
 * penggunaan hanya dapat dikesan pada RUNTIME sebagai ReferenceError.
 *
 * Dua defek sebenar yang terlepas daripada gate statik:
 *   1. `translationGen` (v3.41.1) — dideklarasi dalam handleTranslation(),
 *      digunakan dalam performTranslation() (fungsi SIBLING peringkat-atas).
 *   2. `geminiAuthFailureCacheKey` (ditemui audit v3.41.2) — `const`
 *      dideklarasi DALAM blok `try` luar pengendali /api/validate-gemini
 *      (index.js:3986) tetapi dirujuk DALAM blok `catch` bersaudara
 *      (index.js:4055). `const` ialah block-scoped → ReferenceError dijamin
 *      setiap kali laluan ralat auth diambil.
 *
 * Ujian ini ialah PIN SUMBER, bukan lint longgar. Ia mengekod peraturan skop
 * JavaScript itu sendiri:
 *   - `const`/`let` hanya kelihatan dalam BLOK yang mendeklarasikannya;
 *   - satu blok tamat apabila `}` menutupnya — `catch` ialah blok BahARU,
 *     bukan penyambungan blok `try`.
 * Ia sengaja tidak bergantung pada nombor baris.
 *
 * NOTA KEGAGALAN PIN PERTAMA (direkod supaya tidak diulang): versi awal
 * membandingkan KEDALAMAN kurung kurawal sahaja (`useDepth === declDepth`).
 * Ia LULUS pada kod yang rosak — deklarasi pada depth 2, penggunaan sah pada
 * depth 2 & 3, penggunaan rosak juga pada depth 3. Kedalaman tidak dapat
 * membezakan "bersarang dalam blok yang masih terbuka" daripada "blok saudara
 * yang baharu dibuka". Isyarat yang betul ialah: adakah blok peringkat
 * deklarasi SUDAH DITUTUP sebelum baris penggunaan?
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');

function read(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// ── Penjejak blok ────────────────────────────────────────────────────────────
// Mengira `{` / `}` dan mengabaikan string, komentar, regex literal kasar dan
// template literal (termasuk interpolasi `${}`). Bukan penghurai JS penuh;
// direka untuk fail yang diuji dan untuk KEGAGALAN-SELAMAT: jika yakin tidak
// pasti, anggap blok MASIH TERBUKA (tidak pernah memberi positif palsu).
function analyzeBraces(src) {
    const lines = src.split('\n');
    // closeDepth[lineIdx] = senarai kedalaman yang DITUTUP pada baris itu
    // (kedalaman blok SEBELUM `}` dikurangkan).
    const closedAtLine = new Array(lines.length).fill(null).map(() => []);
    const openAtLine = new Array(lines.length).fill(null).map(() => []);
    const depthAtLineStart = new Array(lines.length).fill(0);

    let depth = 0;
    let mode = 'code'; // code | line | block | squote | dquote | template
    const templateStack = []; // kedalaman `depth` sebelum `${`
    let line = 0;

    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        const n = src[i + 1];

        if (mode === 'line') {
            if (c === '\n') {
                mode = 'code';
                line++;
                depthAtLineStart[line] = depth;
            }
            continue;
        }
        if (mode === 'block') {
            if (c === '*' && n === '/') {
                mode = 'code';
                i++;
            } else if (c === '\n') {
                line++;
                depthAtLineStart[line] = depth;
            }
            continue;
        }
        if (mode === 'squote' || mode === 'dquote') {
            if (c === '\\') {
                i++;
            } else if ((mode === 'squote' && c === "'") || (mode === 'dquote' && c === '"')) {
                mode = 'code';
            } else if (c === '\n') {
                line++;
                depthAtLineStart[line] = depth;
            }
            continue;
        }
        if (mode === 'template') {
            if (c === '\\') {
                i++;
            } else if (c === '`') {
                mode = 'code';
            } else if (c === '$' && n === '{') {
                templateStack.push(depth);
                depth++;
                openAtLine[line].push(depth);
                mode = 'code';
                i++;
            } else if (c === '\n') {
                line++;
                depthAtLineStart[line] = depth;
            }
            continue;
        }

        // mode === 'code'
        if (c === '/' && n === '/') {
            mode = 'line';
            i++;
            continue;
        }
        if (c === '/' && n === '*') {
            mode = 'block';
            i++;
            continue;
        }
        if (c === "'") {
            mode = 'squote';
            continue;
        }
        if (c === '"') {
            mode = 'dquote';
            continue;
        }
        if (c === '`') {
            mode = 'template';
            continue;
        }
        if (c === '{') {
            depth++;
            openAtLine[line].push(depth);
            continue;
        }
        if (c === '}') {
            const closing = depth;
            closedAtLine[line].push(closing);
            depth--;
            if (templateStack.length && templateStack[templateStack.length - 1] === depth) {
                templateStack.pop();
                mode = 'template';
            }
            continue;
        }
        if (c === '\n') {
            line++;
            depthAtLineStart[line] = depth;
        }
    }

    return { closedAtLine, openAtLine, depthAtLineStart, lineCount: lines.length };
}

const identRe = (name) => new RegExp(`(^|[^A-Za-z0-9_$.])${name}([^A-Za-z0-9_$]|$)`);

function findDeclarationLine(lines, name) {
    const declRe = new RegExp(`\\b(?:const|let|var)\\s+(?:\\{[^}]*\\b${name}\\b[^}]*\\}|${name}\\b)`);
    for (let i = 0; i < lines.length; i++) {
        if (!/^\s*(\/\/|\*)/.test(lines[i]) && declRe.test(lines[i])) return i + 1;
    }
    return -1;
}

function findUseLines(lines, name, declLine) {
    const use = identRe(name);
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        const ln = i + 1;
        if (ln === declLine) continue;
        if (/^\s*(\/\/|\*)/.test(lines[i])) continue;
        if (use.test(lines[i])) out.push(ln);
    }
    return out;
}

// ── PERATURAN SKOP BLOK ──────────────────────────────────────────────────────
// `const`/`let` pada baris D hidup dalam blok yang dibuka pada kedalaman
// `declDepth`. Blok itu TAMAT pada `}` pertama (selepas D) yang menutup
// kedalaman `declDepth`. Sebarang penggunaan selepas baris itu tidak
// kelihatan — walaupun kedalaman pendakwaannya kelihatan sama.
function blockClosesBefore(analysis, declLine, useLine) {
    const declIdx = declLine - 1;
    const useIdx = useLine - 1;
    const declDepth = analysis.depthAtLineStart[declIdx];
    // Kedalaman blok yang MENGENDALAMI deklarasi ialah kedalaman selepas
    // sebarang `{` pada baris deklarasi yang mendahului lajur deklarasi.
    // Untuk kes kita deklarasi berada pada permulaan baris — gunakan
    // kedalaman permulaan baris + 0.
    for (let i = declIdx; i < useIdx; i++) {
        // Baris deklarasi sendiri: `{` pada baris itu TIDAK menutup blok.
        for (const closed of analysis.closedAtLine[i]) {
            if (i === declIdx) continue; // `}` pada baris yang sama dengan deklarasi — abaikan (jarang; konservatif)
            if (closed === declDepth) return true;
        }
    }
    return false;
}

// ── PIN 1: translationGen (fungsi sibling) ──────────────────────────────────

test('ND-1: translationGen dideklarasi DALAM fungsi yang menggunakannya', () => {
    const lines = read('src/handlers/subtitles.js').split('\n');

    const topLevelFn = (lineIndex) => {
        for (let j = lineIndex; j >= 0; j--) {
            const m = /^(?:async\s+)?function\s+(\w+)\s*\(/.exec(lines[j]);
            if (m) return m[1];
        }
        return '<module>';
    };

    const decl = lines.findIndex((l) => /const translationGen = getTranslationGeneration\(runtimeKey\);/.test(l));
    assert.notEqual(decl, -1, 'tangkapan generasi mesti wujud');
    const declFn = topLevelFn(decl);

    const uses = [];
    lines.forEach((l, i) => {
        if (/isTranslationGenerationCurrent\(runtimeKey, translationGen\)/.test(l)) uses.push(i);
    });
    assert.equal(uses.length, 4, 'zombie gate mesti kekal di 4 titik tulisan cache');

    for (const u of uses) {
        assert.equal(
            topLevelFn(u),
            declFn,
            `penggunaan translationGen di baris ${u + 1} berada di luar fungsi yang mendeklarasikannya (${declFn})`
        );
    }
});

// ── PIN 2: geminiAuthFailureCacheKey (blok try → catch bersaudara) ──────────

test('ND-2: geminiAuthFailureCacheKey tidak dirujuk selepas bloknya ditutup', () => {
    const rel = 'index.js';
    const src = read(rel);
    const lines = src.split('\n');
    const analysis = analyzeBraces(src);

    const declLine = findDeclarationLine(lines, 'geminiAuthFailureCacheKey');
    assert.notEqual(declLine, -1, 'declaration of geminiAuthFailureCacheKey must exist');

    const uses = findUseLines(lines, 'geminiAuthFailureCacheKey', declLine);
    assert.ok(uses.length >= 3, 'geminiAuthFailureCacheKey mesti digunakan (lookup, clear, cache-on-auth-error)');

    for (const u of uses) {
        assert.equal(
            blockClosesBefore(analysis, declLine, u),
            false,
            `geminiAuthFailureCacheKey digunakan di baris ${u} SELEPAS blok yang mendeklarasikannya ditutup → ReferenceError`
        );
    }
});

// ── KAWALAN PIN: pengesan mesti MERAH pada corak try→catch bersaudara ───────
// Tanpa kawalan ini, pengesan boleh rosak senyap dan lulus pada apa sahaja
// (inilah yang berlaku pada versi pertama — lihat nota di atas).

test('ND-3: KAWALAN — pengesan skop mengesan const-try→catch sebagai ROSAK, dan const-luar sebagai SAH', () => {
    const broken = [
        'async function h(req, res) {',
        '    try {',
        '        const myKey = build();',
        '        await use(myKey);',
        '    } catch (error) {',
        '        await flush(myKey);',
        '    }',
        '}',
        ''
    ].join('\n');
    const brokenLines = broken.split('\n');
    const a1 = analyzeBraces(broken);
    const d1 = findDeclarationLine(brokenLines, 'myKey');
    const u1 = findUseLines(brokenLines, 'myKey', d1);
    // use(myKey) sah; flush(myKey) rosak.
    const results = u1.map((u) => blockClosesBefore(a1, d1, u));
    assert.deepEqual(
        results,
        [false, true],
        'pengesan mesti mengenal pasti penggunaan dalam catch bersaudara sebagai di luar skop'
    );

    const fixed = [
        'async function h(req, res) {',
        '    const myKey = build();',
        '    try {',
        '        await use(myKey);',
        '    } catch (error) {',
        '        await flush(myKey);',
        '    }',
        '}',
        ''
    ].join('\n');
    const fixedLines = fixed.split('\n');
    const a2 = analyzeBraces(fixed);
    const d2 = findDeclarationLine(fixedLines, 'myKey');
    const u2 = findUseLines(fixedLines, 'myKey', d2);
    for (const u of u2) {
        assert.equal(blockClosesBefore(a2, d2, u), false, `penggunaan sah di baris ${u} tidak boleh dilaporkan rosak`);
    }
});

// ── PIN 4: no-undef mesti MELAPORKAN 0 ralat pada seluruh pokok ──────────────
// [v3.41.3] ND-1..ND-3 menjaga kes yang SUDAH diketahui. Pin ini menjaga
// SEMUA kes: ia menjalankan ESLint sendiri (peraturan yang sama dengan CI)
// dan gagal jika ada sebarang rujukan yang tidak diisytiharkan.
// Ia sengaja tidak bergantung pada nama fail — apa jua ReferenceError baharu
// di mana-mana fail aktif akan ditangkap di sini.

const ROOT_LINT = path.resolve(__dirname, '..', '..');
const LINT_TARGETS = ['index.js', 'src', 'public', 'eslint.config.mjs'];

async function lintTreeWithNoUndef() {
    const { ESLint } = require('eslint');
    const eslint = new ESLint({ cwd: ROOT_LINT });
    const results = await eslint.lintFiles(LINT_TARGETS);
    return results.flatMap((r) =>
        r.messages
            .filter((m) => m.ruleId === 'no-undef')
            .map((m) => `${path.relative(ROOT_LINT, r.filePath).replace(/\\/g, '/')}:${m.line} ${m.message}`)
    );
}

test('ND-4: ESLint melaporkan 0 ralat no-undef pada seluruh pokok aktif', async () => {
    const undef = await lintTreeWithNoUndef();
    assert.deepEqual(
        undef,
        [],
        `no-undef masih melaporkan ${undef.length} ralat — rujukan yang tidak diisytiharkan akan menjadi ReferenceError:\n` +
            undef.join('\n')
    );
});

// ── KAWALAN PIN 4: pengesan mesti BOLEH gagal ───────────────────────────────
// Tanpa kawalan ini ND-4 boleh lulus kosong (cth. sasaran lint kosong, atau
// peraturan tidak diaktifkan) dan kita tidak akan sedar. Fail sementara ini
// mengandungi rujukan yang PASTI tidak wujud; pengesan mesti menemuinya.

test('ND-4b: KAWALAN — pengesan no-undef MENGESAN rujukan yang tidak wujud', async () => {
    const { ESLint } = require('eslint');
    const probePath = path.join(ROOT_LINT, 'src', 'utils', `nd4b-probe-${process.pid}.js`);
    const probeSource = [
        "'use strict';",
        'function probe() {',
        '    return nameThatIsNeverDeclaredAnywhere;',
        '}',
        'module.exports = probe;',
        ''
    ].join('\n');
    fs.writeFileSync(probePath, probeSource, 'utf8');
    try {
        const eslint = new ESLint({ cwd: ROOT_LINT });
        const results = await eslint.lintFiles([path.relative(ROOT_LINT, probePath)]);
        const hits = results.flatMap((r) => r.messages.filter((m) => m.ruleId === 'no-undef'));
        assert.ok(hits.length >= 1, 'kawalan mesti gagal: pengesan tidak menemui rujukan yang jelas tidak wujud');
        assert.match(hits[0].message, /nameThatIsNeverDeclaredAnywhere/);
    } finally {
        fs.rmSync(probePath, { force: true });
    }
});

// ── PIN 5: pembina metadata Telegram tidak dilempar bila nama tiada ─────────
// [v3.41.3] Sebelum ini, logik yang menentukan detectedKeys / detectedModel /
// detectedWalletUSD dalam laporan Telegram wujud sebagai DUA salinan inline
// (index.js xEmbed; subtitles.js terjemahan biasa). Setiap salinan merujuk
// nama yang TIDAK wujud dalam skopnya (config, userConfig, geminiApiKeys,
// message, text, ...) dan menyembunyikannya dengan `typeof x !== 'undefined'`.
//
// Kedua-dua salinan kini digantikan oleh SATU fungsi tulen:
//   resolveTelegramRegistryMeta(sources)  — src/utils/telegramFinOps.js
// Setiap "nama yang mungkin wujud" ialah SIFAT objek `sources`, jadi tiada
// nama yang tidak diisytiharkan dirujuk langsung. Kontrak yang dikekalkan:
//   - sumber yang tiada kekal `undefined` → hasil SAMA seperti sebelum ini;
//   - urutan keutamaan tidak berubah;
//   - tidak dilempar walau semua sumber tiada.
//
// index.js TIDAK dimuatkan dalam ujian: ia memanggil startTelegramBot() pada
// masa dimuatkan (line 1226). Pin di bawah menguji resolver secara langsung.

const { resolveTelegramRegistryMeta } = require('./telegramFinOps');

const resolveMeta = (sources) => resolveTelegramRegistryMeta(sources);

test('ND-5: resolver metadata Telegram TIDAK dilempar bila semua sumber tiada', () => {
    let out;
    assert.doesNotThrow(() => {
        out = resolveMeta({});
    }, 'resolver dilempar bila tiada sumber dibekalkan');
    assert.deepEqual(out.detectedKeys, [], 'detectedKeys mesti array kosong — bukan undefined/null');
    assert.equal(out.detectedModel, 'gemini-3.5-flash', 'model pengganti lalai mesti kekal');
    assert.equal(out.detectedWalletUSD, 0, 'baki dompet lalai mesti kekal 0');
    // Bentuk pulangan mesti kekal stabil — registerCompletedSubtitle()
    // membaca ketiga-tiga medan ini.
    assert.deepEqual(Object.keys(out).sort(), ['detectedKeys', 'detectedModel', 'detectedWalletUSD']);
});

// ── Jadual nilai: urutan keutamaan dan pengekstrakan, dipeterai satu-satu ───
// Setiap baris ialah (sumber → hasil yang DIHARAPKAN). Nilai diambil daripada
// tingkah laku kod asal (diverifikasi setara merentas 58 kes semasa refaktor).

const KEY_CASES = [
    {
        label: 'activeApiKey diutamakan',
        in: { activeApiKey: 'K-ACTIVE', config: { apiKey: 'K-CFG' } },
        want: ['K-ACTIVE']
    },
    { label: 'activeApiKey kosong → abaikan', in: { activeApiKey: '', config: { apiKey: 'K-CFG' } }, want: ['K-CFG'] },
    { label: 'config.geminiApiKeys (array)', in: { config: { geminiApiKeys: ['K1', 'K2'] } }, want: ['K1', 'K2'] },
    { label: 'geminiApiKeys bukan array → abaikan', in: { config: { geminiApiKeys: 'K-STR' } }, want: [] },
    { label: 'config.geminiApiKey', in: { config: { geminiApiKey: 'K-SINGLE' } }, want: ['K-SINGLE'] },
    { label: 'config.apiKey', in: { config: { apiKey: 'K-PLAIN' } }, want: ['K-PLAIN'] },
    { label: 'config null → selamat', in: { config: null }, want: [] },
    {
        label: 'config mengatasi userConfig',
        in: { config: { apiKey: 'K-CFG' }, userConfig: { apiKey: 'K-USER' } },
        want: ['K-CFG']
    },
    {
        label: 'userConfig hanya jika config kosong',
        in: { config: {}, userConfig: { apiKey: 'K-USER' } },
        want: ['K-USER']
    },
    { label: 'geminiApiKeys teras', in: { geminiApiKeys: ['K-B1'] }, want: ['K-B1'] },
    { label: 'geminiApiKey teras', in: { geminiApiKey: 'K-BARE' }, want: ['K-BARE'] },
    { label: 'apiKey teras', in: { apiKey: 'K-PLAIN-BARE' }, want: ['K-PLAIN-BARE'] }
];

const MODEL_CASES = [
    { label: 'translationEngine.model', in: { translationEngine: { model: 'm-engine' } }, want: 'm-engine' },
    { label: 'translationEngine null → abaikan', in: { translationEngine: null }, want: 'gemini-3.5-flash' },
    { label: 'translationEngine tanpa model → abaikan', in: { translationEngine: {} }, want: 'gemini-3.5-flash' },
    { label: 'geminiService.model', in: { geminiService: { model: 'm-svc' } }, want: 'm-svc' },
    {
        label: 'enjin mengatasi service',
        in: { translationEngine: { model: 'm-engine' }, geminiService: { model: 'm-svc' } },
        want: 'm-engine'
    },
    { label: 'config.geminiModel', in: { config: { geminiModel: 'm-cfg' } }, want: 'm-cfg' },
    {
        label: 'config.advancedSettings.geminiModel',
        in: { config: { advancedSettings: { geminiModel: 'm-adv' } } },
        want: 'm-adv'
    },
    { label: 'userConfig.geminiModel', in: { userConfig: { geminiModel: 'm-user' } }, want: 'm-user' },
    {
        label: 'enjin mengatasi config',
        in: { translationEngine: { model: 'm-e' }, config: { geminiModel: 'm-c' } },
        want: 'm-e'
    },
    { label: 'teks "Engine: model" tanpa teg', in: { message: 'Engine: plain-model' }, want: 'plain-model' }
];

const WALLET_CASES = [
    { label: 'teleMsg', in: { teleMsg: '💰 <b>Wallet Balance:</b> $12.50' }, want: 12.5 },
    { label: 'walletSection', in: { walletSection: 'Wallet Balance: $3.25' }, want: 3.25 },
    { label: 'tiada teks → 0', in: {}, want: 0 }
];

test('ND-5b: urutan keutamaan dan pengekstrakan resolver adalah seperti kod asal', () => {
    for (const c of KEY_CASES) {
        assert.deepEqual(resolveMeta(c.in).detectedKeys, c.want, `kunci / ${c.label}`);
    }
    for (const c of MODEL_CASES) {
        assert.equal(resolveMeta(c.in).detectedModel, c.want, `model / ${c.label}`);
    }
    for (const c of WALLET_CASES) {
        assert.equal(resolveMeta(c.in).detectedWalletUSD, c.want, `baki / ${c.label}`);
    }

    // Kedua-dua pengekstrakan berlaku serentak dari teks yang sama.
    const both = resolveMeta({ teleMsg: '🧠 <b>Engine:</b> m9\nWallet Balance: $7.00' });
    assert.equal(both.detectedWalletUSD, 7, 'baki diekstrak walaupun model turut ada');
});

test('ND-5q: KEANEHAN DIPETERAI — Sumber C menangkap "b" daripada teg, bukan model', () => {
    // DIREKOD, BUKAN DIBAIKI (mandat: tingkah laku tidak berubah).
    // Regex asal ialah /Engine:[^\w]*([a-zA-Z0-9._-]+)/i tetapi laporan
    // sebenar ialah `🧠 <b>Engine:</b> <model>`: selepas "Engine:" aksara
    // berikutnya ialah "</b>", jadi `[^\w]*` melangkaunya dan kumpulan
    // penangkap mengambil huruf "b" — BUKAN nama model.
    // Ia tersembunyi selama ini kerana Sumber A/B lazimnya sudah memberi
    // nilai sebelum Sumber C dicapai. Pin ini memeterai kelakuan SEMASA
    // supaya sebarang perubahan padanya adalah disengajakan dan kelihatan.
    assert.equal(
        resolveMeta({ teleMsg: '🧠 <b>Engine:</b> gemini-uji-9' }).detectedModel,
        'b',
        'Sumber C semasa menangkap "b" (teg), bukan model — ubah hanya dengan sengaja'
    );
});

test('ND-5c: KAWALAN — resolver tidak mencipta nilai daripada sumber yang tiada', () => {
    // Bukti bahawa ND-5/ND-5b menguji sesuatu yang nyata: pembekalan sumber
    // yang betul MESTI mengubah hasil. Jika ini gagal, bermakna resolver
    // mengabaikan input dan semua pin di atas adalah lulus kosong.
    const empty = resolveMeta({});
    const withKey = resolveMeta({ config: { apiKey: 'K' } });
    const withModel = resolveMeta({ translationEngine: { model: 'm' } });
    const withWallet = resolveMeta({ teleMsg: 'Wallet Balance: $5.00' });
    assert.notDeepEqual(withKey.detectedKeys, empty.detectedKeys, 'config.apiKey mesti mengubah detectedKeys');
    assert.notEqual(withModel.detectedModel, empty.detectedModel, 'translationEngine.model mesti mengubah model');
    assert.notEqual(withWallet.detectedWalletUSD, empty.detectedWalletUSD, 'teleMsg mesti mengubah baki');
});

test('ND-5d: KONTRAK TAPAK PANGGILAN — kedua-dua fail memanggil resolver dengan nama skop sahaja', () => {
    // Kedua-dua fungsi BUKAN corak seragam (amaran mandat):
    //  - index.js (xEmbed): hanya `teleMsg` wujud dalam skop.
    //  - subtitles.js: `config`, `translationEngine`, `activeApiKey`, `teleMsg`.
    // Pin ini memastikan (a) rantaian `typeof` tidak kembali, dan (b) tiada
    // tapak panggilan menghantar nama yang TIDAK wujud dalam skopnya —
    // kerana itu akan menjadi ReferenceError sebaik `typeof` dibuang.
    const forbidden =
        /typeof\s+(config|userConfig|geminiApiKeys|geminiApiKey|apiKey|translationEngine|geminiService|teleMsg|telegramMessage|message|caption|text|walletSection)\s*!==?\s*'undefined'/;

    const xembed = read('index.js');
    assert.ok(
        /resolveTelegramRegistryMeta\s*\(\s*\{[^}]*teleMsg[^}]*\}\s*\)/.test(xembed),
        'index.js mesti memanggil resolveTelegramRegistryMeta({ ... teleMsg })'
    );
    assert.doesNotMatch(
        xembed,
        forbidden,
        'index.js: rantaian typeof_nama tidak boleh kembali — guna resolveTelegramRegistryMeta'
    );
    // index.js TIDAK mempunyai config/activeApiKey dalam skop — pastikan ia
    // tidak dihantar (ini akan menjadi bug yang membungkam ralat).
    const xembedCall = xembed.match(/resolveTelegramRegistryMeta\s*\(\s*\{[^}]*\}\s*\)/);
    assert.ok(xembedCall, 'index.js: panggilan resolver mesti wujud');
    assert.doesNotMatch(
        xembedCall[0],
        /\b(config|userConfig|activeApiKey|geminiApiKeys)\b/,
        'index.js: jangan hantar nama yang tiada dalam skop'
    );

    const normal = read('src/handlers/subtitles.js');
    const normalCall = normal.match(/resolveTelegramRegistryMeta\s*\(\s*\{[^}]*\}\s*\)/);
    assert.ok(normalCall, 'subtitles.js: panggilan resolver mesti wujud');
    assert.match(normalCall[0], /\bactiveApiKey\b/, 'subtitles.js: activeApiKey wujud dan mesti dihantar');
    assert.match(normalCall[0], /\bconfig\b/, 'subtitles.js: config wujud dan mesti dihantar');
    assert.match(normalCall[0], /\btranslationEngine\b/, 'subtitles.js: translationEngine wujud dan mesti dihantar');
    assert.doesNotMatch(
        normal,
        forbidden,
        'subtitles.js: rantaian typeof_nama tidak boleh kembali — guna resolveTelegramRegistryMeta'
    );
    // subtitles.js TIDAK mempunyai userConfig/geminiService — pastikan ia
    // tidak dihantar.
    assert.doesNotMatch(
        normalCall[0],
        /\b(userConfig|geminiService|geminiApiKeys|geminiApiKey)\b/,
        'subtitles.js: jangan hantar nama yang tiada dalam skop'
    );
});
