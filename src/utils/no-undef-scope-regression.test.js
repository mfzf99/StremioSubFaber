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
