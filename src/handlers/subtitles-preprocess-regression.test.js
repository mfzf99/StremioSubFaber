/**
 * SubFaber AI Input Cleaner — Regression Tests
 * Mandat: "<i> tags masih lepas" post-mortem (2026-09-28)
 *
 * Menggunakan node:test (corak projek). Menguji kontrak
 * preprocessSubtitleForAI (src/handlers/subtitles.js):
 *   1. ASS/SSA override tags dibuang: {\an8}, {\pos(...)}, {\i1}
 *   2. HTML inline tags dibuang: <i>, </i>, <b>, <font>, <br/>
 *   3. HTML entities di-decode DAHULU, kemudian tag dibuang
 *      (order kritikal: <i> → <i> → stripped)
 *   4. Whitespace dinormalkan: multi-space collapse + trailing strip
 *   5. SAFETY: teks bukan-tag TIDAK dirosakkan:
 *      - {Laughs} literal (bukan ASS tag — tiada backslash)
 *      - "a < b > c" matematik/perbandingan
 *      - URL dalam teks
 *   6. Stats accounting: htmlTagsRemoved + assTagsRemoved betul
 *   7. Sample sebenar dari SRT 759 entries (post-mortem case)
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { preprocessSubtitleForAI } = require('./subtitles');

// Helper: assert output bebas tag
function assertClean(output) {
    assert.ok(!/\{\\/.test(output), `ASS tag residue: ${JSON.stringify(output)}`);
    assert.ok(!/<\/?[a-zA-Z]/.test(output), `HTML tag residue: ${JSON.stringify(output)}`);
}

test('Preprocessor: ASS/SSA override tags dibuang (an8, pos, i1)', () => {
    const { content, stats } = preprocessSubtitleForAI('{\\an8}DIALOGUE LINE');

    assert.equal(content, 'DIALOGUE LINE');
    assert.ok(stats.assTagsRemoved >= 1, 'assTagsRemoved mesti dikira');
});

test('Preprocessor: pos(100,200) ASS tag dibuang', () => {
    const { content } = preprocessSubtitleForAI('{\\pos(100,200)}Positioned text');

    assert.equal(content, 'Positioned text');
});

test('Preprocessor: HTML italic tags dibuang — sample post-mortem #1', () => {
    const { content } = preprocessSubtitleForAI("{\\an8}ADAPTED FROM GU MAN'S NOVEL, <i>SHINE ON ME</i>");

    // EXPECTED dari post-mortem:
    // "ADAPTED FROM GU MAN'S NOVEL, SHINE ON ME"
    assert.equal(content, "ADAPTED FROM GU MAN'S NOVEL, SHINE ON ME");
    assertClean(content);
});

test('Preprocessor: HTML italic tags dibuang — sample post-mortem #2', () => {
    const { content } = preprocessSubtitleForAI('He always <i>bragged</i> about how he was quite the catch.');

    assert.equal(content, 'He always bragged about how he was quite the catch.');
    assertClean(content);
});

test('Preprocessor: bold + font + self-closing tags dibuang', () => {
    const cases = [
        ['<b>bold</b> text', 'bold text'],
        ['<font color="#fff">Colored</font> and <i>italic</i>', 'Colored and italic'],
        ['Line one<br/>Line two', 'Line oneLine two'],
        ['<u>underline</u>', 'underline']
    ];

    for (const [input, expected] of cases) {
        const { content } = preprocessSubtitleForAI(input);
        assert.equal(content, expected, `Input: ${input}`);
        assertClean(content);
    }
});

test('Preprocessor: HTML entities decode DAHULU, tag dibuang kemudian (order kritikal)', () => {
    // "<i>" → decode stage 7 → "<i>" → stage 8.5 strip
    const { content, stats } = preprocessSubtitleForAI('<i>escaped italic</i>');

    assert.equal(content, 'escaped italic');
    assert.ok(stats.htmlTagsRemoved >= 2, `htmlTagsRemoved: ${stats.htmlTagsRemoved}`);
});

test('Preprocessor: whitespace dinormalkan (multi-space + trailing)', () => {
    const { content } = preprocessSubtitleForAI('  Multiple   spaces   and trailing   ');

    // Leading space kekal (hanya trailing + collapse yang diproses)
    assert.equal(content, ' Multiple spaces and trailing');
});

test('Preprocessor: SAFETY — {Laughs} literal TIDAK dibuang', () => {
    const { content } = preprocessSubtitleForAI('{Laughs} loudly');

    assert.equal(content, '{Laughs} loudly', '{Laughs} bukan ASS tag (tiada backslash)');
});

test('Preprocessor: SAFETY — math comparison "a < b > c" TIDAK dibuang', () => {
    const { content } = preprocessSubtitleForAI('a < b > c for all x');

    // First char after '<' mesti letter untuk match — ' ' tak match
    assert.equal(content, 'a < b > c for all x');
});

test('Preprocessor: SAFETY — URL dengan path TIDAK dirosakkan', () => {
    const { content } = preprocessSubtitleForAI('Visit https://example.com/page now');

    assert.equal(content, 'Visit https://example.com/page now');
});

test('Preprocessor: stats htmlTagsRemoved + assTagsRemoved accounting betul', () => {
    const { stats } = preprocessSubtitleForAI('{\\an8}<i>two</i> <b>tags</b> here');

    assert.equal(stats.assTagsRemoved, 1);
    assert.equal(stats.htmlTagsRemoved, 4); // <i>, </i>, <b>, </b>
});

test('Preprocessor: dialog bersih TIDAK berubah (control case)', () => {
    const { content } = preprocessSubtitleForAI('Plain dialogue without any tags');

    assert.equal(content, 'Plain dialogue without any tags');
});

test('Preprocessor: input bukan-string / kosong — passthrough selamat', () => {
    assert.equal(preprocessSubtitleForAI('').content, '');
    assert.equal(preprocessSubtitleForAI(null).stats, null);
    assert.equal(preprocessSubtitleForAI(undefined).stats, null);
    assert.equal(preprocessSubtitleForAI(123).stats, null);
});

test('Preprocessor: SIMULASI 759-ENTRY — sifar tag residue dalam keseluruhan fail', () => {
    // Bina SRT 759 entri dengan tag tersebar (corak dari post-mortem):
    // setiap entri ke-3 ada <i>, ke-5 ada {\an8}
    const lines = [];
    for (let i = 1; i <= 759; i++) {
        lines.push(String(i));
        lines.push(
            `00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')},000 --> 00:${String(Math.floor(i / 60)).padStart(2, '0')}:${String((i + 1) % 60).padStart(2, '0')},000`
        );
        if (i % 5 === 0) {
            lines.push('{\\an8}CREDIT OR TITLE LINE');
        } else if (i % 3 === 0) {
            lines.push(`Dialogue <i>number ${i}</i> with tags`);
        } else {
            lines.push(`Plain dialogue number ${i}`);
        }
        lines.push('');
    }
    const srt = lines.join('\n');

    const { content, stats } = preprocessSubtitleForAI(srt);

    // GATE MUTLAK: sifar tag residue dalam keseluruhan output
    assert.ok(!/\{\\/.test(content), 'ASS tag residue dalam 759-entry SRT');
    assert.ok(!/<\/?[a-zA-Z]/.test(content), 'HTML tag residue dalam 759-entry SRT');

    // Accounting
    // Entri ke-5  → {\an8} (cabang if mengutamakan %5)
    // Entri ke-3  → <i>...</i> (HANYA yang TIDAK boleh bahagi 5)
    const expectedAss = Math.floor(759 / 5); // 151
    const divisibleBy3 = Math.floor(759 / 3); // 253
    const divisibleBy15 = Math.floor(759 / 15); // 50 (diambil cabang %5)
    const expectedHtml = 2 * (divisibleBy3 - divisibleBy15); // 406 (<i> + </i>)
    assert.equal(stats.assTagsRemoved, expectedAss);
    assert.equal(stats.htmlTagsRemoved, expectedHtml);
});
