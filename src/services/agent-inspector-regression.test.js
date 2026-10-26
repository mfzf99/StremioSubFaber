/**
 * Agent Inspector — Semantic Inspector & Pre-Flight Offloader — Regression Tests
 * (Mandat Pelaksanaan 2026-09-26, Fasa 1 & 2 + Mandat Unthrottle)
 *
 * Kontrak yang diuji (parit laporan audit diluluskan):
 *   1. parseInspectorResponse: JSON sah / rosak / berpagar markdown / chatter
 *   2. buildInspectionPayload: blok <en>/<ms> padat, ID global, cap baris
 *   3. Fail-open: panggilan API tergendala → { valid: true, failOpen: true }
 *   4. Circuit breaker: 3 kegagalan berturut → silent mode (tiada panggilan)
 *   5. Muatan (PENYATUAN MUTLAK 2026-10-25 — Mandat Owner):
 *      SEMUA ejen (Translation/Preflight/Inspector) melalui pembina standard
 *      buildChatRequest() pintu OpenAI-compatible — {model, messages,
 *      stream, max_tokens} + response_format json_schema strict (via
 *      meta.responseFormat INSPECTOR_SCHEMA_CONTRACT); parameter hanya bila
 *      eksplisit pengguna (sifar-penciptaan temperature/reasoning);
 *      timeout berfasa 5 minit (semakan) / 5 minit (Fasa 0).
 *   6. Integriti enjin apabila agentInspector = null → 100% laluan Gemini asal
 *   7. Gerbang semantik enjin: valid:false → SATU retry + amaran jenayah;
 *      failOpen → tiada retry; hasil struktur bercacat → tiada semakan
 *   8. Normalisasi config agentInspector (env fallback + hygiene enabled)
 *   9. Ketahanan pengekstrakan jawapan: content → reasoning_content →
 *      stringify fallback
 *  10. Ketelusan log mandat: [deepseek-v4-pro] / [glm-5.3] / Fallback triggered ->
 *  11. MANDAT OPERASI MUTLAK v2:
 *      Pre-Flight lalai deepseek-v4-pro (5 min) + fallback universal
 *      deepseek-v4.1-flash bagi Fasa 0 dan Fasa 1 (5 min semakan).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

// Stub dependencies sebelum require supaya modul dimuat tanpa Redis/env
process.env.ENTRY_CACHE_SIZE = '100';

const {
    AgentInspector,
    buildInspectionPayload,
    parseInspectorResponse,
    formatPreflightContextForInspection,
    INSPECTOR_INSTRUCTION,
    AGENT_INSPECTOR_DEFAULT_MODEL,
    AGENT_INSPECTOR_PREFLIGHT_TIMEOUT_MS,
    AGENT_INSPECTOR_INSPECTION_TIMEOUT_MS,
    AGENT_INSPECTOR_MAX_TOKENS,
    AGENT_INSPECTOR_PREFLIGHT_MODEL,
    AGENT_INSPECTOR_FALLBACK_MODEL,
    AGENT_INSPECTOR_CIRCUIT_THRESHOLD
} = require('./agentInspector');
const OpenAICompatibleProvider = require('./providers/openaiCompatible');

// Helper: jana entries dummy
function makeEntries(count, textFn) {
    return Array.from({ length: count }, (_, i) => ({
        id: i + 1,
        timecode: `00:00:${String(i % 60).padStart(2, '0')},000 --> 00:00:${String((i + 1) % 60).padStart(2, '0')},000`,
        text: typeof textFn === 'function' ? textFn(i) : `Dialogue line ${i + 1}`
    }));
}

function makeTranslated(count, textFn) {
    return Array.from({ length: count }, (_, i) => ({
        index: i,
        text: typeof textFn === 'function' ? textFn(i) : `Baris dialog ${i + 1}`
    }));
}

// ── 1. parseInspectorResponse ──

test('AgentInspector: parseInspectorResponse accepts valid:true JSON verbatim', () => {
    const verdict = parseInspectorResponse('{"valid":true}');
    assert.deepEqual(verdict, { valid: true });
});

test('AgentInspector: parseInspectorResponse parses crimes with type/ids/note', () => {
    const response = JSON.stringify({
        valid: false,
        crimes: [
            { type: 'MERGE', ids: [48, 49], note: 'two lines fused' },
            { type: 'PHANTOM', ids: [50], note: 'invented filler' }
        ]
    });
    const verdict = parseInspectorResponse(response);
    assert.equal(verdict.valid, false);
    assert.equal(verdict.crimes.length, 2);
    assert.equal(verdict.crimes[0].type, 'MERGE');
    assert.deepEqual(verdict.crimes[0].ids, [48, 49]);
    assert.equal(verdict.crimes[1].type, 'PHANTOM');
});

test('AgentInspector: parseInspectorResponse strips markdown fences and chatter', () => {
    const fenced = '```json\n{"valid":true}\n```';
    assert.deepEqual(parseInspectorResponse(fenced), { valid: true });

    const chatty = 'Here is my verdict:\n{"valid":true}\nHope this helps!';
    assert.deepEqual(parseInspectorResponse(chatty), { valid: true });
});

test('AgentInspector: parseInspectorResponse returns null on unparseable garbage', () => {
    assert.equal(parseInspectorResponse(''), null);
    assert.equal(parseInspectorResponse(null), null);
    assert.equal(parseInspectorResponse('totally not json at all'), null);
    assert.equal(parseInspectorResponse('{broken json'), null);
    assert.equal(parseInspectorResponse('{"noValidField":1}'), null);
});

test('AgentInspector: parseInspectorResponse sanitizes crime fields defensively', () => {
    const response = JSON.stringify({
        valid: false,
        crimes: [
            { type: 'merge', ids: ['12', 'x', 13], note: 'note'.repeat(100) }, // lowercase type + junk ids + long note
            { type: 'INVALID_TYPE', ids: [1], note: 'x' }, // jenis tidak sah → dibuang
            { type: 'DROP', ids: [], note: '' } // tiada id → masih diterima tapi tidak berbahaya
        ]
    });
    const verdict = parseInspectorResponse(response);
    assert.equal(verdict.valid, false);
    // merge (lowercase) dinormalisasi; ids 'x' dibuang; nota di-cap 120
    const merge = verdict.crimes.find((c) => c.type === 'MERGE');
    assert.ok(merge, 'lowercase type must normalize to MERGE');
    assert.deepEqual(merge.ids, [12, 13]);
    assert.ok(merge.note.length <= 120, 'note must be capped');
    assert.equal(
        verdict.crimes.some((c) => c.type === 'INVALID_TYPE'),
        false,
        'invalid crime type dropped'
    );
});

test('AgentInspector: parseInspectorResponse valid:false tanpa crimes boleh diperbetulkan → valid:true', () => {
    const verdict = parseInspectorResponse('{"valid":false}');
    assert.deepEqual(verdict, { valid: true }, 'no salvageable crimes → treat as valid');
});

test('AgentInspector: parseInspectorResponse UNBOUNDED — SEMUA jenayah dipulangkan (siling 5 digugurkan)', () => {
    // Jika batch mengandungi 8 jenayah, SEMUA 8 mesti dipulangkan supaya
    // retry engine memperbaiki semuanya. Siling lama 5 jenayah DIGUGURKAN
    // (UNBOUNDED-CONTEXT 2026-09-29).
    const eightCrimes = Array.from({ length: 8 }, (_, i) => ({
        type: i % 2 === 0 ? 'MERGE' : 'DROP',
        ids: [i * 10, i * 10 + 1],
        note: `crime ${i}`
    }));
    const verdict = parseInspectorResponse(JSON.stringify({ valid: false, crimes: eightCrimes }));
    assert.equal(verdict.valid, false, '8 jenayah → valid:false');
    assert.equal(verdict.crimes.length, 8, 'Semua 8 jenayah dipulangkan (bukan 5)');
    assert.equal(verdict.crimes[7].note, 'crime 7', 'Jenayah TERAKHIR hadir');
});

test('AgentInspector: sanity caps kekal — id per jenayah 10, nota 120 aksara (UNBOUNDED-CONTEXT 2026-09-29)', () => {
    // AGENT_INSPECTOR_MAX_IDS_PER_CRIME (10) dan AGENT_INSPECTOR_MAX_NOTE_CHARS (120) KEKAL
    // sebagai pertahanan sanity (elak 1 jenayah senaraikan 200 id / nota panjang).
    const verdict = parseInspectorResponse(
        JSON.stringify({
            valid: false,
            crimes: [
                {
                    type: 'MERGE',
                    ids: Array.from({ length: 50 }, (_, i) => i + 1), // 50 id → dipotong ke 10
                    note: 'N'.repeat(500) // 500 aksara → dipotong ke 120
                }
            ]
        })
    );
    assert.equal(verdict.crimes[0].ids.length, 10, 'Max 10 id per jenayah (sanity kekal)');
    assert.equal(verdict.crimes[0].note.length, 120, 'Nota dicap 120 aksara (sanity kekal)');
});

// ── 1B. SHIFT crime (MANDAT OPERASI MUTLAK 2026-09-27) ──

test('AgentInspector: parseInspectorResponse accepts SHIFT crime (4th crime type, klausa emas)', () => {
    const response = JSON.stringify({
        valid: false,
        crimes: [{ type: 'SHIFT', ids: [5, 6], note: 'line 5 dialogue in line 6' }]
    });
    const verdict = parseInspectorResponse(response);
    assert.equal(verdict.valid, false);
    assert.equal(verdict.crimes.length, 1);
    assert.equal(verdict.crimes[0].type, 'SHIFT');
    assert.deepEqual(verdict.crimes[0].ids, [5, 6]);
});

test('AgentInspector: inspector instruction locks the SHIFT golden clause verbatim', () => {
    // [HARMONY-FIX] 2026-09-29: taksonomi dipertajam — MERGE = bilangan slot
    // sahaja, PHANTOM = fabrikasi kandungan (tiada lagi pertindihan).
    assert.ok(
        INSPECTOR_INSTRUCTION.includes(
            "- SHIFT: Dialogue content displaced across indices (line 5 text appearing in line 6's slot)."
        ),
        'Klausa rasmi SHIFT mesti hadir verbatim dalam arahan pemeriksa'
    );
    assert.ok(
        INSPECTOR_INSTRUCTION.includes(
            'NOTE: Ignore minor millisecond timecode differences; audit solely whether the dialogue text matches the corresponding line index.'
        ),
        'Klausa emas pengurang token (abaikan millisecond timecode) mesti hadir'
    );
    assert.ok(
        INSPECTOR_INSTRUCTION.includes(
            '- MERGE: Two source lines merged into ONE output slot, displacing subsequent lines (off-by-one drift).'
        ),
        'MERGE mesti membawa definisi off-by-one drift (isue bilangan slot)'
    );
    assert.ok(
        INSPECTOR_INSTRUCTION.includes(
            '- PHANTOM: Output slot contains fabricated content with no basis in its source line (invented dialogue, elaboration, hallucinated detail).'
        ),
        'PHANTOM mesti membawa definisi fabrikasi kandungan (invented dialogue, elaboration, hallucinated detail)'
    );
    assert.ok(
        INSPECTOR_INSTRUCTION.includes(
            "- DROP: Source line's specific meaning is missing or replaced by a generic substitute that erases it."
        ),
        'DROP mesti membawa definisi generic substitute (maksud spesifik terpadam)'
    );
    assert.ok(
        !INSPECTOR_INSTRUCTION.includes('fabricated filler'),
        'MERGE TIADA lagi klausa "fabricated filler" (pertindihan PHANTOM dibuang)'
    );
    assert.ok(
        INSPECTOR_INSTRUCTION.includes('MERGE|DROP|PHANTOM|SHIFT|UNTRANSLATED|REGISTER|TERM'),
        'output contract mesti menyenaraikan 7 jenayah (KNP-ALIGNMENT: +TERM)'
    );
    assert.ok(
        INSPECTOR_INSTRUCTION.includes('Detect ONLY these seven violations'),
        'Task header mesti 7 violations (KNP-ALIGNMENT 2026-10-07)'
    );
});

// [KNP-ALIGNMENT 2026-10-07] TERM crime: pelanggaran locked term kini boleh
// dilaporkan — penguatkuasaan doktrin Netflix KNP (jenayah ke-7).
test('AgentInspector: TERM crime definition + guardrails (locked-term violation)', () => {
    assert.ok(
        INSPECTOR_INSTRUCTION.includes('TERM: A locked term in the Locked Terms glossary below'),
        'TERM definition (locked-glossary violation) mesti hadir'
    );
    assert.ok(
        INSPECTOR_INSTRUCTION.includes('Do NOT flag legitimate grammatical inflection'),
        'TERM guardrail: infleksi tatabahasa sahaja tidak boleh di-flag'
    );
});

test('AgentInspector: parseInspectorResponse accepts TERM crime (locked-term violation)', () => {
    const response = JSON.stringify({
        valid: false,
        crimes: [{ type: 'TERM', ids: [31], note: 'Le Ciel rendered differently' }]
    });
    const verdict = parseInspectorResponse(response);
    assert.equal(verdict.valid, false);
    assert.equal(verdict.crimes[0].type, 'TERM');
    assert.deepEqual(verdict.crimes[0].ids, [31]);
});

// ── 1C. UNTRANSLATED + REGISTER crimes (SOCIOLINGUISTIC v2 2026-09-29) ──

test('AgentInspector: parseInspectorResponse accepts UNTRANSLATED crime (lazy source-copy leak)', () => {
    const response = JSON.stringify({
        valid: false,
        crimes: [{ type: 'UNTRANSLATED', ids: [12], note: 'english sentence copied verbatim' }]
    });
    const verdict = parseInspectorResponse(response);
    assert.equal(verdict.valid, false);
    assert.equal(verdict.crimes[0].type, 'UNTRANSLATED');
    assert.deepEqual(verdict.crimes[0].ids, [12]);
});

test('AgentInspector: parseInspectorResponse accepts REGISTER crime (honorific contradiction)', () => {
    const response = JSON.stringify({
        valid: false,
        crimes: [{ type: 'REGISTER', ids: [7], note: 'Puan Shen became Cik Shen' }]
    });
    const verdict = parseInspectorResponse(response);
    assert.equal(verdict.valid, false);
    assert.equal(verdict.crimes[0].type, 'REGISTER');
});

test('AgentInspector: inspector instruction defines UNTRANSLATED + REGISTER with guardrails', () => {
    assert.ok(
        INSPECTOR_INSTRUCTION.includes('UNTRANSLATED: Output slot still carries the source-language sentence'),
        'UNTRANSLATED definition (lazy-copy leak) mesti hadir'
    );
    assert.ok(
        INSPECTOR_INSTRUCTION.includes(
            'do NOT flag: proper nouns, character/brand/company names, creative-work titles'
        ),
        'UNTRANSLATED mesti kecualikan kata nama khas / tajuk (elak false-positive ESCAPE HATCH sah)'
    );
    assert.ok(
        INSPECTOR_INSTRUCTION.includes(
            "REGISTER: A recurring character's locked form in the Character Address Reference below is contradicted"
        ),
        'REGISTER definition (percanggahan gelaran/kata ganti) mesti hadir'
    );
    assert.ok(
        INSPECTOR_INSTRUCTION.includes(
            'Only flag when the Character Address Reference explicitly provides the non-null locked value'
        ),
        'REGISTER mesti hanya trigger bila rujukan alamat bukan-null wujud (elak audit buta)'
    );
});

test('AgentInspector: formatPreflightContextForInspection renders vocative direct-address when it differs', () => {
    const block = formatPreflightContextForInspection({
        theme: 'Family drama.',
        terms: [],
        characters: [
            { name: 'Shen', canonical_address: 'Puan Shen', direct_address: 'Mak Cik Shen', role: 'aunt' },
            { name: 'Lin', canonical_address: 'Encik Lin', role: 'antagonist' }
        ]
    });
    assert.ok(
        block.includes('Puan Shen / Mak Cik Shen (when addressed directly)'),
        'vocative rendered beside narrative form'
    );
    assert.ok(block.includes('- Lin → Encik Lin'), 'character without vocative renders narrative form only');
});

// [HARMONY v2 2026-09-29] H1: pronoun register must reach Agent Inspector's audit context
test('AgentInspector: formatPreflightContextForInspection renders locked pronoun register', () => {
    const block = formatPreflightContextForInspection({
        theme: 'Drama.',
        terms: [],
        characters: [{ name: 'Shen', canonical_address: 'Puan Shen', pronoun_register: 'saya/awak', role: 'lead' }]
    });
    assert.ok(
        block.includes('[pronouns: saya/awak]'),
        'pronoun register surfaced to Agent Inspector (H1 bridge complete)'
    );
    assert.ok(
        block.includes('locked titles and pronouns must stay consistent'),
        'reference header signals pronoun consistency audit'
    );
});

// [FINALE UNIVERSAL 2026-10-26] REGISTER follows fields actually emitted by Preflight.
test('AgentInspector: REGISTER audits canonical/direct addresses without phantom pronoun pairing', () => {
    assert.ok(
        INSPECTOR_INSTRUCTION.includes('third-person canonical_address mismatch'),
        'REGISTER must cover third-person canonical_address mismatch'
    );
    assert.ok(
        INSPECTOR_INSTRUCTION.includes('face-to-face direct_address mismatch'),
        'REGISTER must ALSO cover face-to-face direct_address mismatch'
    );
    assert.ok(
        INSPECTOR_INSTRUCTION.includes('explicitly provides the non-null locked value'),
        'REGISTER must require an explicit non-null lock before flagging'
    );
    assert.ok(
        !INSPECTOR_INSTRUCTION.includes('pronoun-register mismatch'),
        'REGISTER must not audit pronoun pairings absent from the Preflight schema'
    );
});

// [FINALE UNIVERSAL 2026-10-26] Split-sentence grammar reordering is not a positional crime.
test('AgentInspector: adjacent split-sentence clause reordering is exempt from SHIFT and DROP', () => {
    assert.ok(INSPECTOR_INSTRUCTION.includes('For a single sentence split across adjacent slots'));
    assert.ok(INSPECTOR_INSTRUCTION.includes('SVO ↔ SOV word order'));
    assert.ok(INSPECTOR_INSTRUCTION.includes('must NOT be flagged as SHIFT or DROP'));
    assert.ok(INSPECTOR_INSTRUCTION.includes('both slots remain populated and the combined meaning is complete'));
});

// [HARMONY v2 2026-09-29] H2: Agent Inspector must NOT punish legitimate craft (compression/idiom)
test('AgentInspector: inspector explicitly permits compression + idiomatic adaptation', () => {
    assert.ok(
        INSPECTOR_INSTRUCTION.includes(
            'condensing wordy lines, trimming redundant filler, and replacing source idioms'
        ),
        'inspector must declare compression/idiom-adaptation as REQUIRED (not a crime)'
    );
    assert.ok(
        INSPECTOR_INSTRUCTION.includes(
            'not when the translation is simply shorter, reworded, or idiomatically adapted'
        ),
        'DROP/PHANTOM must not fire on legitimate craft output (H2 harmony with translation_craft)'
    );
    assert.ok(
        INSPECTOR_INSTRUCTION.includes('length reduction, idiomatic rephrasing'),
        'ignore-list must include length reduction + idiomatic rephrasing'
    );
});

// ── 2. buildInspectionPayload ──

test('AgentInspector: buildInspectionPayload builds compact parallel <en>/<ms> blocks with global ids', () => {
    const source = makeEntries(3, (i) => `Hello ${i}`);
    const translated = makeTranslated(3, (i) => `Hai ${i}`);
    const payload = buildInspectionPayload(source, translated);
    assert.ok(payload, 'payload must be built');
    assert.ok(payload.prompt.includes('<en>'), 'must contain <en> block');
    assert.ok(payload.prompt.includes('<ms>'), 'must contain <ms> block');
    assert.ok(payload.prompt.includes('1|Hello 0'), 'source line id|text format');
    assert.ok(payload.prompt.includes('1|Hai 0'), 'translated line id|text format');
    assert.ok(payload.prompt.includes('MERGE'), 'instruction must list MERGE');
    assert.ok(payload.prompt.includes('DROP'), 'instruction must list DROP');
    assert.ok(payload.prompt.includes('PHANTOM'), 'instruction must list PHANTOM');
    assert.ok(payload.prompt.includes('"valid":true'), 'JSON contract must be present');
});

test('AgentInspector: buildInspectionPayload rejects empty input (line truncation DIGUGURKAN — UNBOUNDED-CONTEXT 2026-09-29)', () => {
    // Siling lama 200 aksara/baris DIGUGURKAN — baris dialog bersubtitle
    // dengan markup boleh melebihi 200 aksara; inspector mesti melihat
    // baris PENUH untuk mengesan PHANTOM/DROP dengan tepat.
    const source = makeEntries(1, () => 'A'.repeat(500));
    const translated = makeTranslated(1, () => 'B');
    const payload = buildInspectionPayload(source, translated);
    const longLine = payload.prompt.split('\n').find((l) => l.startsWith('1|A'));
    assert.equal(longLine.length, 502, '500 aksara + prefix "1|" — baris PENUH tanpa pemotongan');

    assert.equal(buildInspectionPayload([], []), null);
    assert.equal(buildInspectionPayload(null, null), null);
});

test('AgentInspector: buildInspectionPayload menormalkan whitespace tanpa memotong baris (sanity kekal)', () => {
    // Whitespace collapse masih dijalankan (muatan padat) — ini BUKAN pemotongan.
    const source = makeEntries(1, () => 'Hello   \n\t world    with   spaces');
    const translated = makeTranslated(1, () => 'Hai dunia');
    const payload = buildInspectionPayload(source, translated);
    const line = payload.prompt.split('\n').find((l) => l.startsWith('1|Hello'));
    assert.ok(line.includes('Hello world with spaces'), 'whitespace collapse aktif');
    assert.ok(!line.includes('\t'), 'tab dibuang');
});

test('AgentInspector: buildInspectionPayload injects preflight context (theme/terms/characters) — CONTEXT-AWARE AUDIT', () => {
    const source = makeEntries(2, (i) => `Hello ${i}`);
    const translated = makeTranslated(2, (i) => `Hai ${i}`);
    const context = {
        theme: 'A corporate family drama about inheritance.',
        terms: [{ source: 'Zhuang Group', target: 'Kumpulan Zhuang', note: '' }],
        characters: [
            { name: 'Shen Ruoxin', canonical_address: 'Puan Shen', role: 'female lead' },
            { name: 'Lin Bo', canonical_address: null, role: 'antagonist' }
        ]
    };
    const payload = buildInspectionPayload(source, translated, context);
    assert.ok(payload, 'payload must be built');
    assert.ok(payload.prompt.includes('### Story Context (from Pre-Flight)'), 'theme header mesti hadir');
    assert.ok(payload.prompt.includes('A corporate family drama about inheritance.'), 'theme mesti disuntik');
    assert.ok(payload.prompt.includes('### Locked Terms'), 'terms header mesti hadir');
    assert.ok(payload.prompt.includes('- Zhuang Group → Kumpulan Zhuang'), 'istilah terkunci mesti disuntik');
    assert.ok(payload.prompt.includes('### Character Address Reference'), 'characters header mesti hadir');
    assert.ok(payload.prompt.includes('- Shen Ruoxin → Puan Shen (female lead)'), 'gelaran terkunci mesti dirender');
    assert.ok(payload.prompt.includes('address NOT LOCKED'), 'null address mesti dirender sebagai NOT LOCKED');
    // Blok input kekal selepas konteks
    assert.ok(
        payload.prompt.indexOf('### Story Context') < payload.prompt.indexOf('<en>'),
        'konteks sebelum blok input'
    );
});

test('AgentInspector: buildInspectionPayload tanpa preflightContext → tiada blok konteks (backwards compatible)', () => {
    const source = makeEntries(1, () => 'Hello');
    const translated = makeTranslated(1, () => 'Hai');
    const payload = buildInspectionPayload(source, translated);
    assert.ok(payload, 'payload must be built');
    assert.equal(payload.prompt.includes('### Story Context'), false, 'tiada konteks → tiada seksyen konteks');
    assert.equal(payload.prompt.includes('### Locked Terms'), false, 'tiada konteks → tiada istilah');
});

test('AgentInspector: formatPreflightContextForInspection — null/empty context returns empty string', () => {
    assert.equal(formatPreflightContextForInspection(null), '');
    assert.equal(formatPreflightContextForInspection({}), '');
    assert.equal(formatPreflightContextForInspection({ theme: '', terms: [], characters: [] }), '');
});

test('AgentInspector: formatPreflightContextForInspection UNBOUNDED — SEMUA terms/characters/theme disuntik (UNBOUNDED-CONTEXT 2026-09-29)', () => {
    // RANTAIAN PEMOTONGAN DIHAPUS: preflight kini pulangkan 50 istilah /
    // 20 watak; inspector WAJIB melihat SEMUANYA. Siling lama 10 istilah /
    // 12 watak / 400 aksara tema DIGUGURKAN.
    const manyTerms = Array.from({ length: 50 }, (_, i) => ({ source: `Term${i}`, target: `Istilah${i}` }));
    const manyChars = Array.from({ length: 20 }, (_, i) => ({
        name: `Watak${i}`,
        canonical_address: `Gelaran${i}`,
        role: 'r'
    }));
    const longTheme = 'X'.repeat(600) + '|THEME-TAIL-MARKER';
    const context = { theme: longTheme, terms: manyTerms, characters: manyChars };

    const block = formatPreflightContextForInspection(context);

    assert.ok(block.includes('Term49 → Istilah49'), 'Istilah ke-50 (indeks 49) hadir — siling 10 digugurkan');
    assert.ok(block.includes('Term10 → Istilah10'), 'Istilah ke-11 (indeks 10) hadir — melepasi siling lama 10');
    assert.ok(block.includes('Watak19 → Gelaran19'), 'Watak ke-20 (indeks 19) hadir — siling 12 digugurkan');
    assert.ok(block.includes('Watak12 → Gelaran12'), 'Watak ke-13 hadir — melepasi siling lama 12');
    assert.ok(block.includes('THEME-TAIL-MARKER'), 'Tema penuh (600+ aksara) disuntik tanpa dipotong pada 400');
    assert.equal(block.split('\n').filter((l) => l.startsWith('- Term')).length, 50, 'Semua 50 baris istilah dirender');
    assert.equal(block.split('\n').filter((l) => l.startsWith('- Watak')).length, 20, 'Semua 20 baris watak dirender');
});

test('AgentInspector: buildInspectionPayload menyuntik konteks penuh ke prompt inspector (chain-of-truncation dihapus)', () => {
    // Ujian hujung-ke-hujung: 50 istilah preflight → prompt inspector mesti
    // membawa 50 istilah (bukan 10). Ini kontrak ASAS audit Agent Inspector.
    const source = makeEntries(1, () => 'Hello');
    const translated = makeTranslated(1, () => 'Hai');
    const manyTerms = Array.from({ length: 50 }, (_, i) => ({ source: `Term${i}`, target: `Istilah${i}` }));
    const payload = buildInspectionPayload(source, translated, {
        theme: 'A story.',
        terms: manyTerms,
        characters: []
    });
    assert.ok(payload, 'payload mesti dibina');
    assert.equal(
        payload.prompt.split('\n').filter((l) => l.startsWith('- Term')).length,
        50,
        'Semua 50 istilah masuk prompt inspector — siling 10 digugurkan'
    );
    assert.ok(payload.prompt.includes('Term49 → Istilah49'), 'Istilah TERAKHIR hadir dalam prompt');
});

// ── 3. Fail-open + 4. Circuit breaker ──

test('AgentInspector: runSemanticInspection fails open on API error and counts toward circuit breaker', async () => {
    const inspector = new AgentInspector({
        apiKey: 'test-key',
        baseUrl: 'https://agent-inspector.example.com/v1',
        model: 'deepseek-v4-pro'
    });
    // Paksa kegagalan rangkaian: translateSubtitle di-override supaya throw
    inspector.translateSubtitle = async () => {
        throw new Error('network timeout');
    };

    const source = makeEntries(2);
    const translated = makeTranslated(2);

    const v1 = await inspector.runSemanticInspection(source, translated);
    assert.equal(v1.valid, true, 'must fail open');
    assert.equal(v1.failOpen, true, 'must be flagged fail-open');
    assert.equal(inspector.circuitOpen, false, '1 failure — circuit still closed');

    await inspector.runSemanticInspection(source, translated);
    assert.equal(inspector.circuitOpen, false, '2 failures — circuit still closed');

    await inspector.runSemanticInspection(source, translated);
    assert.equal(
        inspector.circuitOpen,
        true,
        `3 failures (threshold ${AGENT_INSPECTOR_CIRCUIT_THRESHOLD}) — circuit OPEN`
    );

    // Litar terbuka → panggilan seterusnya senyap tanpa menyentuh rangkaian
    let called = false;
    inspector.translateSubtitle = async () => {
        called = true;
        return '{"valid":false}';
    };
    const v4 = await inspector.runSemanticInspection(source, translated);
    assert.equal(v4.valid, true, 'silent mode returns valid');
    assert.equal(v4.skipped, 'circuit_open');
    assert.equal(called, false, 'no network call while circuit open');

    // Reset membuka sesi baharu
    inspector.resetCircuitBreaker();
    assert.equal(inspector.circuitOpen, false);
});

test('AgentInspector: runSemanticInspection fails open on unparseable response', async () => {
    const inspector = new AgentInspector({
        apiKey: 'test-key',
        baseUrl: 'https://agent-inspector.example.com/v1',
        model: 'deepseek-v4-pro'
    });
    inspector.translateSubtitle = async () => 'garbage response <>.';

    const verdict = await inspector.runSemanticInspection(makeEntries(2), makeTranslated(2));
    assert.equal(verdict.valid, true, 'unparseable → fail open');
    assert.equal(verdict.failOpen, true);
});

test('AgentInspector: runSemanticInspection returns crimes verdict on valid:false response', async () => {
    const inspector = new AgentInspector({
        apiKey: 'test-key',
        baseUrl: 'https://agent-inspector.example.com/v1',
        model: 'deepseek-v4-pro'
    });
    inspector.translateSubtitle = async () =>
        JSON.stringify({ valid: false, crimes: [{ type: 'MERGE', ids: [48, 49], note: 'fused' }] });

    const verdict = await inspector.runSemanticInspection(makeEntries(2), makeTranslated(2));
    assert.equal(verdict.valid, false);
    assert.equal(verdict.crimes[0].type, 'MERGE');
});

test('AgentInspector: kejayaan reset kaunter kegagalan berturut-turut', async () => {
    const inspector = new AgentInspector({
        apiKey: 'test-key',
        baseUrl: 'https://agent-inspector.example.com/v1'
    });
    inspector.translateSubtitle = async () => {
        throw new Error('boom');
    };
    await inspector.runSemanticInspection(makeEntries(1), makeTranslated(1)); // failure 1
    await inspector.runSemanticInspection(makeEntries(1), makeTranslated(1)); // failure 2

    inspector.translateSubtitle = async () => '{"valid":true}';
    await inspector.runSemanticInspection(makeEntries(1), makeTranslated(1)); // success → reset

    inspector.translateSubtitle = async () => {
        throw new Error('boom');
    };
    await inspector.runSemanticInspection(makeEntries(1), makeTranslated(1)); // failure 1 semula
    assert.equal(inspector.circuitOpen, false, 'success reset the consecutive counter — circuit still closed');
});

// ── 5. Muatan Universal (Mandat Seni Bina Universal Payload 2026-09-26) ──

// ═══ [NAIK TARAF ASSERTION — TRINITY TOTAL UNLOCK FASA 1, K1 — 2026-10-19] ═══
// AUDIT: temperature 0.0 hardcoded dimansuhkan (Keputusan Rasmi Owner §8.3 —
// medan tidak diset → kunci TIDAK dihantar; pelayan guna lalai asalnya).
// stream:true KEKAL (invariant pengangkutan, §8.1). Muatan kini 3-kunci
// sifar-penciptaan bagi Inspector tanpa params eksplisit.
// [PENYATUAN MUTLAK 2026-10-25 — Mandat Owner] Ujian dikunci semula kepada
// kontrak pembina STANDARD pintu OpenAI-compatible: {model, messages, stream,
// max_tokens} — laluan 4-kunci god-tier MANSUH. Sifar-penciptaan parameter
// pengguna (temperature/reasoning) kekal (TOTAL UNLOCK K1/K5).
test('AgentInspector: [PENYATUAN MUTLAK] kimi-k3 muatan standard streaming — {model, messages, stream, max_tokens}; sifar-penciptaan temperature/reasoning; timeout 5 min/5 min', () => {
    const inspector = new AgentInspector({
        apiKey: 'test-key',
        baseUrl: 'https://agent-inspector.example.com/v1',
        model: 'kimi-k3'
    });

    assert.equal(inspector.isKimiModel(), true, 'kimi detector mesti aktif untuk kimi-k3');
    assert.equal(inspector.maxRetries, 0, 'fail fast — no provider-level retries');
    assert.equal(
        inspector.translationTimeout,
        AGENT_INSPECTOR_INSPECTION_TIMEOUT_MS,
        'inspection timeout = konstanta mandat'
    );
    assert.equal(inspector.translationTimeout, 300000, 'semakan batch: 5 minit (siling Caddy 300s)');
    assert.equal(AGENT_INSPECTOR_INSPECTION_TIMEOUT_MS, 300000, 'Fasa 1: 5 minit (siling Caddy 300s)');
    assert.equal(AGENT_INSPECTOR_PREFLIGHT_TIMEOUT_MS, 300000, 'Fasa 0: 5 minit (siling Caddy 300s)');

    // [PENYATUAN MUTLAK 2026-10-25] Pembina STANDARD — sama dengan Agent
    // Translation & Preflight. stream:true kekal invariant pengangkutan SSE
    // (chunk SSE menghidupkan sambungan Caddy — kelulusan owner #4).
    const { body } = inspector.buildChatRequest('preflight prompt', true, {});
    assert.ok(!('temperature' in body), 'kimi: tiada temperature dicipta enjin (TOTAL UNLOCK K1 kekal)');
    assert.equal(
        body.stream,
        true,
        'kimi: stream WAJIB true — chunk SSE menghidupkan sambungan Caddy (invariant §8.1)'
    );
    assert.equal(body.model, 'kimi-k3');
    assert.ok(Array.isArray(body.messages) && body.messages.length === 1, 'kimi: satu mesej user');
    // Parameter rasmi pintu — kini DIHANTAR oleh pembina standard:
    assert.equal(
        'max_tokens' in body,
        true,
        'PENYATUAN: max_tokens DIHANTAR (parameter rasmi pintu — god-tier mansuh)'
    );
    // Sifar-penciptaan parameter pengguna — kekal (enjin tidak mencipta nilai):
    assert.equal(
        'reasoning_effort' in body,
        false,
        'kimi: tiada reasoning_effort dicipta enjin (TOTAL UNLOCK K5 sifar-penciptaan)'
    );
    assert.equal('extra_body' in body, false, 'kimi: extra_body tidak dicipta (tiada keluarga Hunyuan)');
    assert.equal('top_p' in body, false, 'kimi: tiada top_p dicipta (medan tidak diset)');
    assert.equal('thinking' in body, false, 'kimi: parameter thinking TIDAK wujud bagi keluarga kimi-k3');
    assert.equal('presence_penalty' in body, false, 'kimi: tiada presence_penalty dicipta (medan tidak diset)');
    assert.equal('max_completion_tokens' in body, false, 'kimi: max_completion_tokens khusus OpenAI rasmi');
    assert.equal(
        'response_format' in body,
        false,
        'kimi: response_format hanya bila enableJsonOutput/meta.responseFormat aktif (sifar-penciptaan)'
    );
});

// ── [MODEL-HIERARCHY] FINAL 2026-09-28: kimi-k3 ialah Pre-Flight agent SAHAJA ──

// [HARDCODE-PURGE 2026-10-13] Kontrak dinamik: tiada lagi lalai statik dalam
// kod. Instance tanpa model → kedua-dua fasa bypass senyap. Hierarki mandat
// (kimi-k3 preflight / deepseek-v4-pro pemeriksa / v4.1-flash fallback)
// diuji melalui suntikan eksplisit — tingkah laku runtime kekal sama.
test('AgentInspector [MODEL-HIERARCHY]: dinamik — tanpa model = bypass senyap; dengan model = Pre-Flight STANDALONE, Pemeriksa + fallback', () => {
    assert.equal(AGENT_INSPECTOR_PREFLIGHT_MODEL, '', 'lalai konstanta kosong (dinamik — konfigurasi pengguna/env)');
    const bare = new AgentInspector({ apiKey: 'k', baseUrl: 'https://x.example/v1' });
    assert.equal(bare.preflightModel, '', 'tiada preflightModel → Fasa 0 bypass');
    assert.equal(bare.model, '', 'tiada model → Fasa 1 bypass');

    const inspector = new AgentInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        preflightModel: 'kimi-k3',
        model: 'deepseek-v4-pro',
        fallbackModel: 'deepseek-v4.1-flash'
    });
    assert.equal(inspector.preflightModel, 'kimi-k3', 'suntikan Fasa 0 diterima');
    // [MODEL-HIERARCHY] Fallback Fasa 0 DIGUGURKAN — preflightFallbackModel
    // sentiasa sama dengan primer (kimi-k3 standalone).
    assert.equal(
        inspector.preflightFallbackModel,
        'kimi-k3',
        'fallback Fasa 0 = primer (standalone, tiada model lain)'
    );
    assert.deepEqual(inspector.preflightHierarchy, ['kimi-k3'], 'hierarki Fasa 0: [kimi-k3] SAHAJA — STANDALONE');
    assert.equal(inspector.preflightRetries, 4, 'retry-same-model: 4 retry tambahan bagi kimi-k3');
    assert.equal(inspector.model, 'deepseek-v4-pro', 'Fasa 1 suntikan deepseek-v4-pro');
    assert.deepEqual(inspector.modelHierarchy, ['deepseek-v4-pro', 'deepseek-v4.1-flash'], 'Fasa 1 kekal');
});

test('AgentInspector [MODEL-HIERARCHY]: config/env — preflightFallbackModel lama diabaikan (kimi-k3 standalone)', () => {
    const { normalizeConfig } = require('../utils/config');
    const saved = {
        AGENT_INSPECTOR_PREFLIGHT_MODEL: process.env.AGENT_INSPECTOR_PREFLIGHT_MODEL,
        AGENT_INSPECTOR_PREFLIGHT_FALLBACK_MODEL: process.env.AGENT_INSPECTOR_PREFLIGHT_FALLBACK_MODEL
    };
    try {
        delete process.env.AGENT_INSPECTOR_PREFLIGHT_MODEL;
        delete process.env.AGENT_INSPECTOR_PREFLIGHT_FALLBACK_MODEL;
        const defaults = normalizeConfig({});
        // [HARDCODE-PURGE] tiada lalai statik — env kosong → preflightModel ''
        assert.equal(defaults.agentInspector.preflightModel, '', 'lalai env: preflight kosong (bypass senyap)');
        // [MODEL-HIERARCHY] fallback lama deepseek-v4-pro TIDAK lagi digunakan.
        assert.equal(
            defaults.agentInspector.preflightFallbackModel,
            '',
            'fallback Fasa 0 = primer kosong (env lama diabaikan)'
        );

        process.env.AGENT_INSPECTOR_PREFLIGHT_MODEL = 'glm-5.3';
        // env lama AGENT_INSPECTOR_PREFLIGHT_FALLBACK_MODEL tidak lagi berkesan — nilai
        // sentiasa menuruti primer.
        process.env.AGENT_INSPECTOR_PREFLIGHT_FALLBACK_MODEL = 'deepseek-v4-pro';
        const overridden = normalizeConfig({});
        assert.equal(overridden.agentInspector.preflightModel, 'glm-5.3', 'env override preflightModel berfungsi');
        assert.equal(
            overridden.agentInspector.preflightFallbackModel,
            'glm-5.3',
            'fallback menuruti primer (env lama DIABAIKAN)'
        );
    } finally {
        for (const key of Object.keys(saved)) {
            if (saved[key] === undefined) delete process.env[key];
            else process.env[key] = saved[key];
        }
    }
});

// ── MANDAT v5.1: alias env AGENT_INSPECTOR_INSPECTION_MODEL (.env pengeluaran owner) ──

test('AgentInspector v5.1: env AGENT_INSPECTOR_INSPECTION_MODEL ialah alias rasmi model semakan', () => {
    const { normalizeConfig } = require('../utils/config');
    const saved = {
        AGENT_INSPECTOR_MODEL: process.env.AGENT_INSPECTOR_MODEL,
        AGENT_INSPECTOR_INSPECTION_MODEL: process.env.AGENT_INSPECTOR_INSPECTION_MODEL
    };
    try {
        delete process.env.AGENT_INSPECTOR_MODEL;
        delete process.env.AGENT_INSPECTOR_INSPECTION_MODEL;

        // Setting .env pengeluaran owner: AGENT_INSPECTOR_INSPECTION_MODEL="deepseek-v4-pro"
        process.env.AGENT_INSPECTOR_INSPECTION_MODEL = 'deepseek-v4-pro';
        const cfg = normalizeConfig({});
        assert.equal(cfg.agentInspector.model, 'deepseek-v4-pro', 'alias AGENT_INSPECTOR_INSPECTION_MODEL dibaca');

        // AGENT_INSPECTOR_MODEL lebih diutamakan apabila kedua-duanya wujud
        process.env.AGENT_INSPECTOR_MODEL = 'deepseek-v4.1-flash';
        const dual = normalizeConfig({});
        assert.equal(dual.agentInspector.model, 'deepseek-v4.1-flash', 'AGENT_INSPECTOR_MODEL menang atas alias');
    } finally {
        for (const key of Object.keys(saved)) {
            if (saved[key] === undefined) delete process.env[key];
            else process.env[key] = saved[key];
        }
    }
});

// ── [MODEL-HIERARCHY] FINAL: fallback Fasa 0 DIGUGURKAN (kimi-k3 standalone) ──

test('AgentInspector [MODEL-HIERARCHY]: preflightFallbackModel lama DIABAIKAN — hierarki Fasa 0 kekal 1-tingkat walaupun pemanggil menghantar nilai lama', () => {
    const inspector = new AgentInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        preflightModel: 'kimi-k3',
        model: 'deepseek-v4-pro',
        preflightFallbackModel: 'deepseek-v4-pro', // nilai lama — DIABAIKAN
        fallbackModel: 'deepseek-v4.1-flash'
    });
    assert.equal(inspector.preflightFallbackModel, 'kimi-k3', 'fallback menuruti primer');
    assert.deepEqual(
        inspector.preflightHierarchy,
        ['kimi-k3'],
        'hierarki Fasa 0 kekal 1-tingkat walaupun fallback lama dihantar'
    );
    // Fasa 1 TIDAK terjejas — kekal 2-tingkat
    assert.deepEqual(
        inspector.modelHierarchy,
        ['deepseek-v4-pro', 'deepseek-v4.1-flash'],
        'hierarki Fasa 1 kekal tanpa kimi'
    );
});

test('AgentInspector [MODEL-HIERARCHY]: tanpa override → hierarki kosong (bypass); fallback Fasa 0 menuruti primer', () => {
    const inspector = new AgentInspector({ apiKey: 'k', baseUrl: 'https://x.example/v1' });
    assert.equal(inspector.preflightFallbackModel, '', 'fallback Fasa 0 = primer (kosong → bypass)');
    assert.deepEqual(inspector.preflightHierarchy, [''], 'hierarki Fasa 0 1-tingkat (standalone — kosong)');
});

test('AgentInspector [MODEL-HIERARCHY]: custom preflightModel — fallback sentiasa menuruti primer (1-tingkat)', () => {
    const dup = new AgentInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        preflightModel: 'glm-5.3'
    });
    assert.equal(dup.preflightModel, 'glm-5.3', 'custom primer Fasa 0 diterima');
    assert.equal(dup.preflightFallbackModel, 'glm-5.3', 'fallback menuruti custom primer');
    assert.deepEqual(dup.preflightHierarchy, ['glm-5.3'], 'hierarki Fasa 0 custom tetap 1-tingkat');
});

test('AgentInspector [MODEL-HIERARCHY]: Fasa 0 — kimi-k3 gagal → RETRY kimi-k3 (bukan model lain); 2x gagal → fail-open null', async () => {
    const inspector = new AgentInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'deepseek-v4-pro',
        preflightModel: 'kimi-k3',
        preflightRetryBackoffMs: 0 // [UPSTREAM-RESILIENCE] lumpuh backoff — ujian pantas
    });

    const calls = [];
    const payloads = [];
    inspector.translateSubtitle = async function (content, src, tgt, prompt) {
        calls.push(this.model);
        payloads.push(this.buildChatRequest(prompt, true, {}).body);
        throw Object.assign(new Error('gateway 502'), { statusCode: 502 }); // sentiasa gagal
    };

    const result = await inspector.runPreflightPass(makeEntries(50), 'Malay', 'English');
    assert.equal(result, null, 'semua percubaan kimi-k3 gagal → fail-open null (kontrak non-blocking)');
    // [MODEL-HIERARCHY] 1 percubaan + 4 retry pada MODEL YANG SAMA — tiada
    // peralihan ke deepseek atau flash (fallback merentas model DIGUGURKAN).
    assert.deepEqual(
        calls,
        ['kimi-k3', 'kimi-k3', 'kimi-k3', 'kimi-k3', 'kimi-k3'],
        'kitaran retry-same-model: kimi-k3 × 5 (1 percubaan + 4 retry)'
    );
    // ═══ [PENYATUAN MUTLAK 2026-10-25] ═══
    // Muatan pembina standard konsisten pada setiap percubaan: max_tokens
    // dihantar (parameter rasmi pintu), sifar-penciptaan temperature/reasoning,
    // stream kekal invariant pengangkutan.
    for (const [i, label] of payloads.entries()) {
        assert.ok(!('temperature' in label), `muatan ${i}: tiada temperature dicipta (TOTAL UNLOCK kekal)`);
        assert.equal(label.stream, true, `muatan ${i}: stream true`);
        assert.equal('reasoning_effort' in label, false, `muatan ${i}: tiada reasoning_effort dicipta enjin`);
        assert.equal('max_tokens' in label, true, `muatan ${i}: max_tokens standard DIHANTAR (PENYATUAN)`);
        assert.equal('extra_body' in label, false, `muatan ${i}: tiada extra_body dicipta`);
        assert.equal(
            'response_format' in label,
            false,
            `muatan ${i}: response_format hanya bila meta.responseFormat aktif`
        );
    }
    assert.equal(inspector.model, 'deepseek-v4-pro', 'model semakan tidak terjejas oleh Fasa 0');
});

test('AgentInspector [MODEL-HIERARCHY]: config.js normalisasi preflightFallbackModel — sentiasa menuruti primer (env lama diabaikan)', () => {
    const { normalizeConfig } = require('../utils/config');
    const saved = process.env.AGENT_INSPECTOR_PREFLIGHT_FALLBACK_MODEL;
    try {
        delete process.env.AGENT_INSPECTOR_PREFLIGHT_FALLBACK_MODEL;
        const defaults = normalizeConfig({});
        // [HARDCODE-PURGE] lalai statik digugurkan — fallback = primer (kosong)
        assert.equal(defaults.agentInspector.preflightFallbackModel, '', 'lalai: fallback = primer (kosong — bypass)');

        const cfg = normalizeConfig({
            agentInspector: { enabled: true, baseUrl: 'https://c.example/v1', apiKey: 'ck', preflightModel: 'glm-5.3' }
        });
        assert.equal(cfg.agentInspector.preflightFallbackModel, 'glm-5.3', 'fallback menuruti config primer');

        process.env.AGENT_INSPECTOR_PREFLIGHT_FALLBACK_MODEL = 'deepseek-v4-pro';
        const envCfg = normalizeConfig({});
        assert.equal(
            envCfg.agentInspector.preflightFallbackModel,
            '',
            'env fallback lama DIABAIKAN — menuruti primer (kosong)'
        );
    } finally {
        if (saved === undefined) delete process.env.AGENT_INSPECTOR_PREFLIGHT_FALLBACK_MODEL;
        else process.env.AGENT_INSPECTOR_PREFLIGHT_FALLBACK_MODEL = saved;
    }
});

test('AgentInspector: glm-5.3-flash TIDAK terjejas peraturan frontier glm-5.3 penuh (pembezaan flash)', () => {
    const provider = new OpenAICompatibleProvider({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'glm-5.3-flash'
    });
    const { body } = provider.buildChatRequest('probe', false, {});
    // [TOTAL UNLOCK FASA 1] frontier rules telah dipadam (v3.14.2) — tiada lagi
    // lock temperature/top_p untuk sebarang varian glm. Constructor kini juga
    // sifar-lalai; assertion membuktikan kedua-dua kunci tidak dihasilkan.
    assert.ok(!('temperature' in body), 'flash variant: tiada temperature dicipta enjin');
    assert.ok(!('top_p' in body), 'flash variant: tiada top_p dicipta enjin');
});

// [PENYATUAN MUTLAK 2026-10-25 — Mandat Owner] Ujian dikunci semula kepada
// pembina STANDARD pintu: {model, messages, stream, max_tokens} — god-tier
// MANSUH. Sifar-penciptaan parameter pengguna kekal (TOTAL UNLOCK K1/K5).
test('AgentInspector: [PENYATUAN MUTLAK] payload deepseek-v4-pro — muatan standard streaming {model, messages, stream, max_tokens}; sifar-penciptaan temperature/reasoning', () => {
    const inspector = new AgentInspector({
        apiKey: 'test-key',
        baseUrl: 'https://agent-inspector.example.com/v1',
        model: 'deepseek-v4-pro'
    });

    // ═══ [PENYATUAN MUTLAK 2026-10-25] ═══
    // Pembina standard — sifar-penciptaan (temperature hanya bila user set).
    const { body } = inspector.buildChatRequest('fallback probe', true, {});
    assert.ok(!('temperature' in body), 'tiada temperature dicipta enjin (TOTAL UNLOCK K1 kekal)');
    assert.equal(body.stream, true, 'stream WAJIB true — siling Caddy 300s (invariant pengangkutan)');
    assert.equal('max_tokens' in body, true, 'PENYATUAN: max_tokens DIHANTAR (parameter rasmi pintu)');
    assert.equal('reasoning_effort' in body, false, 'tiada reasoning_effort dicipta enjin (K5 sifar-penciptaan)');
    assert.equal('extra_body' in body, false, 'extra_body tidak dicipta (bukan keluarga Hunyuan)');
    assert.equal(
        'response_format' in body,
        false,
        'response_format hanya bila meta.responseFormat aktif (wrapper Inspector)'
    );
    assert.equal('top_p' in body, false, 'tiada top_p dicipta (medan tidak diset)');
    assert.equal('thinking' in body, false, 'thinking tidak dicipta tanpa reasoningEffort eksplisit');
    assert.equal('presence_penalty' in body, false, 'tiada presence_penalty dicipta (medan tidak diset)');
    assert.equal('frequency_penalty' in body, false, 'tiada frequency_penalty dicipta (medan tidak diset)');
    assert.equal('max_completion_tokens' in body, false, 'max_completion_tokens khusus OpenAI rasmi reasoning');
    assert.equal(body.model, 'deepseek-v4-pro');
    assert.ok(Array.isArray(body.messages) && body.messages.length === 1, 'single user message');
    assert.deepEqual(
        Object.keys(body).sort(),
        ['max_tokens', 'messages', 'model', 'stream'],
        'muatan mesti TEPAT {model, messages, stream, max_tokens} (pembina standard — PENYATUAN MUTLAK)'
    );

    // FALLBACK PEMERIKSA (deepseek-v4.1-flash) — muatan YANG SAMA.
    const flash = new AgentInspector({
        apiKey: 'test-key',
        baseUrl: 'https://agent-inspector.example.com/v1',
        model: 'deepseek-v4.1-flash'
    });
    const flashBody = flash.buildChatRequest('flash probe', true, {}).body;
    assert.ok(!('temperature' in flashBody), 'fallback flash: tiada temperature dicipta enjin');
    assert.equal(flashBody.stream, true, 'fallback flash: stream true (invariant)');
    assert.equal('extra_body' in flashBody, false, 'fallback flash: tiada extra_body dicipta');
    assert.equal('reasoning_effort' in flashBody, false, 'fallback flash: tiada reasoning_effort dicipta');
    assert.equal('max_tokens' in flashBody, true, 'PENYATUAN: fallback flash max_tokens DIHANTAR');
    assert.equal(
        'response_format' in flashBody,
        false,
        'fallback flash: response_format hanya bila meta.responseFormat aktif'
    );
    assert.equal('top_p' in flashBody, false, 'fallback flash: tiada top_p dicipta');
});

test('AgentInspector: [PENYATUAN MUTLAK] — lalai modul: timeout 5 min/5 min (siling Caddy) + max_tokens standard dihantar (constant kekal untuk keserasian warisan)', () => {
    // Lalai mandat modul — timeout di bawah/at siling Caddy 300s.
    assert.equal(AGENT_INSPECTOR_PREFLIGHT_TIMEOUT_MS, 300000, 'lalai Fasa 0 5 minit');
    assert.equal(AGENT_INSPECTOR_INSPECTION_TIMEOUT_MS, 300000, 'lalai Fasa 1 5 minit');
    assert.equal(AGENT_INSPECTOR_MAX_TOKENS, 131072, 'constant warisan dikekalkan');

    // [PENYATUAN MUTLAK 2026-10-25] Pembina standard menghantar max_tokens
    // (lalai getCappedMaxOutputTokens 65536, clamp bawah 1 / atas 131072).
    const def = new AgentInspector({ apiKey: 'k', baseUrl: 'https://x.example/v1', model: 'deepseek-v4-pro' });
    const defBody = def.buildChatRequest('p', true, {}).body;
    assert.equal('max_tokens' in defBody, true, 'PENYATUAN: max_tokens DIHANTAR (pembina standard)');
    assert.ok(defBody.max_tokens > 0, 'max_tokens lalai bernilai sah');
    assert.equal('reasoning_effort' in defBody, false, 'sifar-penciptaan reasoning_effort kekal (K5)');
    assert.equal(defBody.stream, true, 'stream true lalai (invariant pengangkutan)');

    // Override maxTokens per-instance kini MENEMBUSI muatan standard —
    // laluan maxOutputTokens builder biasa (input semantik universal).
    const capped = new AgentInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'deepseek-v4-pro',
        maxTokens: 4096
    });
    assert.equal(
        capped.buildChatRequest('p', true, {}).body.max_tokens,
        4096,
        'PENYATUAN: override maxTokens menembusi muatan standard'
    );

    // Override tidak sah → fallback lalai pembina (bukan keguguran senyap).
    const invalid = new AgentInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'deepseek-v4-pro',
        maxTokens: -1
    });
    assert.ok(
        invalid.buildChatRequest('p', true, {}).body.max_tokens > 0,
        'nilai tidak sah → fallback lalai pembina standard (clamp >= 1)'
    );
});

test('AgentInspector: runPreflightPass menaikkan timeout kepada 5 min dan memulihkannya selepas Fasa 0 (MANDAT OPERASI MUTLAK v2)', async () => {
    const inspector = new AgentInspector({
        apiKey: 'test-key',
        baseUrl: 'https://agent-inspector.example.com/v1',
        preflightModel: 'kimi-k3'
    });

    // Fail kecil (< PREFLIGHT_MIN_ENTRIES) → skip cepat; laluan tetap melalui
    // kitaran naik/pulih timeout dalam runPreflightPass.
    assert.equal(inspector.translationTimeout, 300000, 'baseline 5 min sebelum Fasa 0');
    await inspector.runPreflightPass(makeEntries(3), 'Malay', 'English');
    assert.equal(inspector.translationTimeout, 300000, 'timeout dipulihkan selepas skip path');

    // Verifikasi kitaran penuh dengan fail besar (panggilan API di-override)
    let observedTimeout = null;
    inspector.translateSubtitle = async () => {
        observedTimeout = inspector.translationTimeout;
        return JSON.stringify({ theme: 'Theme.', terms: [] });
    };
    const result = await inspector.runPreflightPass(makeEntries(50), 'Malay', 'English');
    assert.ok(result, 'preflight context returned');
    assert.equal(observedTimeout, 300000, 'Fasa 0 mesti berjalan pada 5 minit (MANDAT v2)');
    assert.equal(inspector.translationTimeout, 300000, 'pulih kepada 5 min selepas Fasa 0');
});

test('AgentInspector: runPreflightPass memulihkan timeout walaupun panggilan API gagal', async () => {
    const inspector = new AgentInspector({
        apiKey: 'test-key',
        baseUrl: 'https://agent-inspector.example.com/v1',
        preflightModel: 'kimi-k3'
    });
    inspector.translateSubtitle = async () => {
        throw new Error('boom');
    };

    const result = await inspector.runPreflightPass(makeEntries(50), 'Malay', 'English');
    assert.equal(result, null, 'kegagalan Fasa 0 → null (non-blocking, kontrak asal)');
    assert.equal(inspector.translationTimeout, 300000, 'finally block sentiasa memulihkan 5 minit');
});

test('AgentInspector: buildUserPrompt override menghantar prompt inspector verbatim', () => {
    const inspector = new AgentInspector({
        apiKey: 'test-key',
        baseUrl: 'https://agent-inspector.example.com/v1'
    });
    const inspectorPrompt = 'INSPECT INSTRUCTION <en>...</en> <ms>...</ms>';
    const promptData = inspector.buildUserPrompt('ignored-content', 'en', inspectorPrompt);
    assert.equal(promptData.userPrompt, inspectorPrompt, 'inspector prompt delivered verbatim');
    assert.equal(promptData.isSelfContained, true);
});

// ── 6. Integriti enjin apabila agentInspector = null ──

test('AgentInspector: engine dengan agentInspector=null kekal 100% Gemini — tiada panggilan inspector, stats sifar', async () => {
    const TranslationEngine = require('./translationEngine');

    const geminiCalls = [];
    const dummyGemini = {
        translateSubtitle: async (content) => {
            geminiCalls.push({ content });
            // Respons penuh 50/50 — laluan pariti sempurna
            return Array.from({ length: 50 }, (_, i) => `<s id="${i + 1}">Terjemahan ${i + 1}</s>`).join('\n');
        },
        streamTranslateSubtitle: async () => '',
        estimateTokenCount: () => 10
    };

    const engine = new TranslationEngine(
        dummyGemini,
        'gemini-2.5-flash',
        {},
        {
            providerName: 'gemini',
            agentInspector: null // ← DUAL-AI off
        }
    );

    assert.equal(engine.agentInspector, null);
    assert.equal(engine.translationStats.agentInspectorUsed, false);
    assert.equal(engine.translationStats.agentInspectorFailures, 0);
    assert.equal(engine.translationStats.agentInspectorInspections, 0);
    assert.equal(engine.translationStats.agentInspectorRetries, 0);

    // Batch 3 entri kecil (< PREFLIGHT_MIN_ENTRIES) — Fasa 0 skip, terus batch.
    // Semak gate: tiada panggilan tambahan selepas 3 panggilan penterjemahan.
    // (blok konteks dipelihara)
    const batch = makeEntries(3);
    const result = await engine.translateBatch(batch, 'Malay', null, 0, 1, null, { streaming: false });
    assert.equal(result.length, 3);
    assert.equal(geminiCalls.length, 1, 'only ONE provider call — no inspector call when agentInspector is null');
    assert.equal(engine.translationStats.agentInspectorFailures, 0);
    assert.equal(engine.translationStats.agentInspectorInspections, 0);
    assert.equal(engine.translationStats.agentInspectorRetries, 0);
});

// ── 7. Gerbang semantik enjin ──

test('AgentInspector: gerbang enjin — valid:false mencetus SATU retry beramarah + re-verdict; hasil diganti jika lulus', async () => {
    const TranslationEngine = require('./translationEngine');

    // Kiraan panggilan: batch asal → inspector (crime) → retry → inspector (lulus)
    let workerCallCount = 0;
    let inspectorCallCount = 0;
    const verdicts = [
        { valid: false, crimes: [{ type: 'MERGE', ids: [1, 2], note: 'fused' }] }, // semakan pertama
        { valid: true } // re-verdict
    ];

    const dummyGemini = {
        translateSubtitle: async () => {
            workerCallCount++;
            return '<s id="1">Satu</s>\n<s id="2">Dua</s>\n<s id="3">Tiga</s>';
        },
        streamTranslateSubtitle: async () => '',
        estimateTokenCount: () => 10
    };

    const agentInspector = {
        circuitOpen: false,
        runPreflightPass: null, // tidak dipanggil dalam ujian ini
        runSemanticInspection: async () => {
            const v = verdicts[Math.min(inspectorCallCount, verdicts.length - 1)];
            inspectorCallCount++;
            return v;
        }
    };

    const engine = new TranslationEngine(
        dummyGemini,
        'gemini-2.5-flash',
        {},
        {
            providerName: 'gemini',
            agentInspector
        }
    );

    const batch = makeEntries(3);
    const result = await engine.translateBatch(batch, 'Malay', null, 0, 1, null, { streaming: false });

    assert.equal(workerCallCount, 2, 'original + ONE semantic retry');
    assert.equal(inspectorCallCount, 2, 'initial inspection + single re-verdict');
    assert.equal(engine.translationStats.agentInspectorRetries, 1);
    assert.equal(result.length, 3);

    const incident = engine.translationStats.incidents.find((i) => i.type === 'AGENT_INSPECTOR_SEMANTIC_RETRY');
    assert.ok(incident, 'incident must be logged');
    assert.equal(incident.outcome, 'recovered', 'retry must close incident as recovered');
});

test('AgentInspector: gerbang enjin — failOpen tidak mencetus retry', async () => {
    const TranslationEngine = require('./translationEngine');

    let workerCallCount = 0;
    const dummyGemini = {
        translateSubtitle: async () => {
            workerCallCount++;
            return '<s id="1">Satu</s>\n<s id="2">Dua</s>';
        },
        streamTranslateSubtitle: async () => '',
        estimateTokenCount: () => 10
    };

    const agentInspector = {
        circuitOpen: false,
        runSemanticInspection: async () => ({ valid: true, failOpen: true })
    };

    const engine = new TranslationEngine(
        dummyGemini,
        'gemini-2.5-flash',
        {},
        {
            providerName: 'gemini',
            agentInspector
        }
    );

    const batch = makeEntries(2);
    await engine.translateBatch(batch, 'Malay', null, 0, 1, null, { streaming: false });

    assert.equal(workerCallCount, 1, 'no retry on fail-open');
    assert.equal(engine.translationStats.agentInspectorFailures, 1);
    assert.equal(engine.translationStats.agentInspectorRetries, 0);
});

test('AgentInspector: gerbang enjin — hasil struktur bercacat (mismatch) melangkau semakan semantik', async () => {
    const TranslationEngine = require('./translationEngine');

    let inspectorCalled = false;
    const dummyGemini = {
        // Respons bercacat: hanya 1 daripada 2 entri — laluan mismatch aktif
        translateSubtitle: async () => '<s id="1">Satu</s>',
        streamTranslateSubtitle: async () => '',
        estimateTokenCount: () => 10
    };

    const agentInspector = {
        circuitOpen: false,
        runSemanticInspection: async () => {
            inspectorCalled = true;
            return { valid: true };
        }
    };

    const engine = new TranslationEngine(
        dummyGemini,
        'gemini-2.5-flash',
        {},
        {
            providerName: 'gemini',
            agentInspector
        }
    );

    const batch = makeEntries(2);
    await engine.translateBatch(batch, 'Malay', null, 0, 1, null, { streaming: false });

    // Gate memerlukan translatedEntries.length === batch.length; hasil bercacat
    // (1/2 walaupun selepas retry mismatch gagal) → tiada semakan semantik.
    assert.equal(inspectorCalled, false, 'semantic gate skipped on structurally broken result');
    assert.equal(engine.translationStats.agentInspectorRetries, 0);
});

test('AgentInspector: gerbang enjin — circuit breaker terbuka melangkau semakan', async () => {
    const TranslationEngine = require('./translationEngine');

    let inspectorCalled = false;
    const dummyGemini = {
        translateSubtitle: async () => '<s id="1">Satu</s>\n<s id="2">Dua</s>',
        streamTranslateSubtitle: async () => '',
        estimateTokenCount: () => 10
    };

    const agentInspector = {
        circuitOpen: true, // litar terbuka
        runSemanticInspection: async () => {
            inspectorCalled = true;
            return { valid: true };
        }
    };

    const engine = new TranslationEngine(
        dummyGemini,
        'gemini-2.5-flash',
        {},
        {
            providerName: 'gemini',
            agentInspector
        }
    );

    const batch = makeEntries(2);
    await engine.translateBatch(batch, 'Malay', null, 0, 1, null, { streaming: false });
    assert.equal(inspectorCalled, false, 'no inspection while circuit breaker open');
});

// ── 8. Normalisasi config agentInspector ──

test('AgentInspector: normalizeConfig membina struktur agentInspector dengan env fallback + hygiene', async () => {
    const { normalizeConfig } = require('../utils/config');

    // Simpan + pulihkan env semasa ujian (elak kebocoran antara-ujian)
    const savedEnv = {
        AGENT_INSPECTOR_BASE_URL: process.env.AGENT_INSPECTOR_BASE_URL,
        AGENT_INSPECTOR_API_KEY: process.env.AGENT_INSPECTOR_API_KEY,
        AGENT_INSPECTOR_MODEL: process.env.AGENT_INSPECTOR_MODEL
    };
    try {
        // Kes 1: config sedia ada menang ke atas env
        process.env.AGENT_INSPECTOR_BASE_URL = 'https://env.example.com/v1';
        process.env.AGENT_INSPECTOR_API_KEY = 'env-key';
        process.env.AGENT_INSPECTOR_MODEL = 'env-model';

        const withConfig = normalizeConfig({
            agentInspector: {
                enabled: true,
                baseUrl: 'https://config.example.com/v1',
                apiKey: 'config-key',
                model: 'config-model'
            }
        });
        assert.equal(withConfig.agentInspector.baseUrl, 'https://config.example.com/v1');
        assert.equal(withConfig.agentInspector.apiKey, 'config-key');
        assert.equal(withConfig.agentInspector.model, 'config-model');
        assert.equal(withConfig.agentInspector.enabled, true);

        // Kes 2: config kosong → env fallback + auto-enable apabila env lengkap
        const fromEnv = normalizeConfig({});
        assert.equal(fromEnv.agentInspector.baseUrl, 'https://env.example.com/v1');
        assert.equal(fromEnv.agentInspector.apiKey, 'env-key');
        assert.equal(fromEnv.agentInspector.model, 'env-model');
        assert.equal(fromEnv.agentInspector.enabled, true, 'env lengkap → auto-enable (Fasa 3 belum wujud)');

        // Kes 3: tiada config + tiada env → disabled + TIADA default model
        // statik ([HARDCODE-PURGE] bypass senyap menggantikan lalai kod).
        delete process.env.AGENT_INSPECTOR_BASE_URL;
        delete process.env.AGENT_INSPECTOR_API_KEY;
        delete process.env.AGENT_INSPECTOR_MODEL;
        const disabled = normalizeConfig({});
        assert.equal(disabled.agentInspector.enabled, false);
        assert.equal(disabled.agentInspector.baseUrl, '');
        assert.equal(disabled.agentInspector.model, '', 'tiada lalai statik — model kosong (bypass)');

        // Kes 4: enabled:true tetapi kredensial tak lengkap → hygiene melumpuhkan
        const partial = normalizeConfig({
            agentInspector: { enabled: true, baseUrl: 'https://partial.example.com/v1' } // tiada apiKey
        });
        assert.equal(partial.agentInspector.enabled, false, 'incomplete credentials must disable Agent Inspector');
    } finally {
        // Pulihkan env
        for (const [k, v] of Object.entries(savedEnv)) {
            if (v === undefined) delete process.env[k];
            else process.env[k] = v;
        }
    }
});

// ── 9. Ketahanan pengekstrakan jawapan (Mandat Unthrottle §C) ──

test('AgentInspector: extractChatMessageText — laluan standard content diutamakan', () => {
    const provider = new OpenAICompatibleProvider({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        providerName: 'custom'
    });
    assert.equal(
        provider.extractChatMessageText({ content: '{"valid":true}', reasoning_content: 'thinking noise' }),
        '{"valid":true}',
        'content mesti menang ke atas reasoning_content'
    );
    assert.equal(provider.extractChatMessageText({ content: 'plain text' }), 'plain text');
    assert.equal(provider.extractChatMessageText(null), '');
    assert.equal(provider.extractChatMessageText(undefined), '');
});

test('AgentInspector: extractChatMessageText — reasoning_content dipakai bila content kosong', () => {
    const provider = new OpenAICompatibleProvider({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        providerName: 'custom'
    });

    // JSON terus dalam reasoning_content
    assert.equal(
        provider.extractChatMessageText({ content: '', reasoning_content: '{"valid":true}' }),
        '{"valid":true}'
    );

    // JSON berpagar markdown dalam reasoning_content
    const fenced = 'analysis...\n```json\n{"valid":true}\n```\nend';
    assert.equal(provider.extractChatMessageText({ content: '', reasoning_content: fenced }), '{"valid":true}');

    // reasoning_content proza tanpa blok berstruktur → diguna mentah
    assert.equal(
        provider.extractChatMessageText({ content: '', reasoning_content: 'just prose, no braces' }),
        'just prose, no braces'
    );
});

test('AgentInspector: extractChatMessageText — fallback stringify mesej penuh bila kedua-dua medan kosong', () => {
    const provider = new OpenAICompatibleProvider({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        providerName: 'custom'
    });

    // content bertindih dalam medan luar + braces dalam string mesti tidak pecahkan scanner
    const message = {
        role: 'assistant',
        content: '',
        note: '{"valid":false,"crimes":[{"type":"MERGE","ids":[1,2],"note":"x{y}z"}]}'
    };
    const extracted = provider.extractChatMessageText(message);
    assert.ok(extracted.includes('"valid":false'), 'blok JSON seimbang mesti diekstrak dari stringify');

    // Tiada blok langsung → ''
    assert.equal(provider.extractChatMessageText({ role: 'assistant', content: '' }), '');
});

test('AgentInspector: extractStructuredBlock — scanner JSON seimbang tahan braces dalam string', () => {
    const provider = new OpenAICompatibleProvider({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        providerName: 'custom'
    });

    const balanced = 'prefix {"a":"has } brace","b":{"c":1}} suffix';
    assert.equal(provider.extractStructuredBlock(balanced), '{"a":"has } brace","b":{"c":1}}');

    // Bracket dalam prosa tanpa ':' → bukan JSON → ''
    assert.equal(provider.extractStructuredBlock('text with (parens) and [brackets] but no object'), '');

    // Fenced block dipilih dahulu
    const fenced = 'x ```json\n{"valid":true}\n``` y {"other":1}';
    assert.equal(provider.extractStructuredBlock(fenced), '{"valid":true}');

    // JSON tidak seimbang → ''
    assert.equal(provider.extractStructuredBlock('{"broken": true'), '');
});

// ── Kontrak preflight offload (Fasa 0) ──

test('AgentInspector: runPreflightPass mewarisi kontrak runPreflightSemanticPass (non-blocking)', async () => {
    const inspector = new AgentInspector({
        apiKey: 'test-key',
        baseUrl: 'https://agent-inspector.example.com/v1'
    });

    // Fail terlalu kecil (< 10 entri) → skip, return null — kontrak Fasa 0 asal
    const result = await inspector.runPreflightPass(makeEntries(3), 'Malay', 'English');
    assert.equal(result, null, 'small file must skip preflight (inherited contract)');

    // Guard provider: inspector sendiri memenuhi kontrak translateSubtitle
    assert.equal(typeof inspector.translateSubtitle, 'function');
});

// ── 10. Dual-model failover + zero-swallowed-error (Mandat Observabiliti 2026-09-26) ──

test('AgentInspector: failover automatik — deepseek-v4-pro gagal, deepseek-v4.1-flash menyelamatkan semakan', async () => {
    const inspector = new AgentInspector({
        apiKey: 'test-key',
        baseUrl: 'https://agent-inspector.example.com/v1',
        model: 'deepseek-v4-pro',
        fallbackModel: 'deepseek-v4.1-flash'
    });
    assert.deepEqual(
        inspector.modelHierarchy,
        ['deepseek-v4-pro', 'deepseek-v4.1-flash'],
        'hierarki semakan: deepseek-v4-pro + fallback (TRINITY BETA RUN 9)'
    );
    assert.equal(
        AGENT_INSPECTOR_FALLBACK_MODEL,
        '',
        'konstanta fallback kosong — nilai datang daripada konfigurasi ([HARDCODE-PURGE])'
    );

    const calls = [];
    inspector.translateSubtitle = async function () {
        calls.push(this.model);
        if (this.model === 'deepseek-v4-pro') {
            throw Object.assign(new Error('HTTP 502 Bad Gateway from upstream'), { statusCode: 502 });
        }
        return '{"valid":false,"crimes":[{"type":"MERGE","ids":[3,4],"note":"fused"}]}';
    };

    const verdict = await inspector.runSemanticInspection(makeEntries(4), makeTranslated(4), {
        batchIndex: 0,
        totalBatches: 2
    });
    assert.deepEqual(calls, ['deepseek-v4-pro', 'deepseek-v4.1-flash'], 'kedua-dua model dipanggil mengikut hierarki');
    assert.equal(verdict.valid, false, 'verdict dari model sandaran diterima');
    assert.equal(verdict.crimes[0].type, 'MERGE');
    assert.equal(verdict.modelUsed, 'deepseek-v4.1-flash', 'model sandaran direkodkan');
    assert.equal(inspector.model, 'deepseek-v4-pro', 'model dipulihkan kepada primary selepas operasi');
    assert.equal(inspector.circuitOpen, false, 'kejayaan sandaran tidak membuka litar');
});

test('AgentInspector [MODEL-HIERARCHY]: Fasa 0 — kimi-k3 504 pada percubaan pertama → RETRY kimi-k3 berjaya (tiada peralihan model)', async () => {
    const inspector = new AgentInspector({
        apiKey: 'test-key',
        baseUrl: 'https://agent-inspector.example.com/v1',
        model: 'deepseek-v4-pro',
        preflightModel: 'kimi-k3',
        preflightRetryBackoffMs: 0 // [UPSTREAM-RESILIENCE] lumpuh backoff — ujian pantas
    });
    // [MODEL-HIERARCHY] FINAL: Fasa 0 suntikan kimi-k3 SAHAJA.
    assert.equal(inspector.preflightModel, 'kimi-k3', 'suntikan Pre-Flight kimi-k3');
    assert.deepEqual(inspector.preflightHierarchy, ['kimi-k3'], 'hierarki Fasa 0 [kimi-k3] standalone');

    const calls = [];
    inspector.translateSubtitle = async function () {
        calls.push(this.model);
        if (calls.length === 1) {
            throw Object.assign(new Error('gateway timeout'), { statusCode: 504 });
        }
        return '{"theme":"Retry analysis.","terms":[]}';
    };

    const result = await inspector.runPreflightPass(makeEntries(50), 'Malay', 'English');
    assert.ok(result, 'konteks dari retry kimi-k3 diterima');
    assert.equal(result.theme, 'Retry analysis.');
    // [MODEL-HIERARCHY] 504 → retry kimi-k3 (bukan deepseek!)
    assert.deepEqual(calls, ['kimi-k3', 'kimi-k3'], 'retry-same-model: kimi-k3 → kimi-k3');
    assert.equal(inspector.model, 'deepseek-v4-pro', 'model semakan tidak terjejas oleh Fasa 0');
});

test('AgentInspector: kedua-dua model gagal (rangkaian) → fail-open both_models_failed + 1 kegagalan litar', async () => {
    const inspector = new AgentInspector({
        apiKey: 'test-key',
        baseUrl: 'https://agent-inspector.example.com/v1',
        model: 'deepseek-v4-pro',
        fallbackModel: 'deepseek-v4.1-flash'
    });
    let calls = 0;
    inspector.translateSubtitle = async function () {
        calls++;
        throw new Error('connection reset by peer');
    };

    const verdict = await inspector.runSemanticInspection(makeEntries(2), makeTranslated(2), {
        batchIndex: 0,
        totalBatches: 1
    });
    assert.equal(calls, 2, 'primary + fallback kedua-duanya dicuba');
    assert.equal(verdict.valid, true, 'fail-open');
    assert.equal(verdict.failOpen, true);
    assert.equal(verdict.error, 'both_models_failed');
    assert.equal(verdict.detail, 'connection reset by peer', 'punca teknikal sebenar dibawa keluar');
    assert.equal(inspector._consecutiveFailures, 1, 'satu operasi gagal = satu kegagalan litar sahaja');
});

test('AgentInspector: kedua-dua model gagal parse (HTTP 200 sampah) → fail-open selepas raw snippet', async () => {
    const inspector = new AgentInspector({
        apiKey: 'test-key',
        baseUrl: 'https://agent-inspector.example.com/v1',
        model: 'deepseek-v4-pro',
        fallbackModel: 'deepseek-v4.1-flash'
    });
    let calls = 0;
    inspector.translateSubtitle = async function () {
        calls++;
        return 'garbage not json';
    };

    const verdict = await inspector.runSemanticInspection(makeEntries(2), makeTranslated(2));
    assert.equal(calls, 2, 'failover turut berlaku untuk respons rosak (bukan ralat rangkaian)');
    assert.equal(verdict.failOpen, true);
    assert.equal(verdict.error, 'both_models_failed');
});

test('AgentInspector: logging forensik — raw snippet 500 aksara + pengumuman failover pada WARN', async () => {
    const log = require('../utils/logger');
    const inspector = new AgentInspector({
        apiKey: 'test-key',
        baseUrl: 'https://agent-inspector.example.com/v1',
        model: 'deepseek-v4-pro',
        fallbackModel: 'deepseek-v4.1-flash'
    });
    inspector.translateSubtitle = async () => 'G'.repeat(1200);

    const captured = [];
    const originalWarn = log.warn;
    log.warn = (fn) => {
        try {
            captured.push(typeof fn === 'function' ? String(fn()) : String(fn));
        } catch (_) {
            /* noop */
        }
    };
    try {
        const verdict = await inspector.runSemanticInspection(makeEntries(2), makeTranslated(2), {
            batchIndex: 0,
            totalBatches: 1
        });
        assert.equal(verdict.failOpen, true);

        const snippetLog = captured.find((l) => l.includes('Raw snippet'));
        assert.ok(snippetLog, 'raw snippet mesti dicetak pada WARN semasa parse failure');
        assert.ok(snippetLog.includes('G'.repeat(500)), 'snippet dipotong kepada tepat 500 aksara pertama');
        assert.ok(!snippetLog.includes('G'.repeat(501)), 'snippet TIDAK melebihi 500 aksara');

        const failoverLog = captured.find((l) => l.includes('Failing over to deepseek-v4.1-flash'));
        assert.ok(failoverLog, 'pengumuman failover kepada model sandaran mesti dicetak');

        // MANDAT SENI BINA UNIVERSAL PAYLOAD §C: format trigger wajib
        const triggerLog = captured.find((l) =>
            l.includes('[AgentInspector] Fallback triggered -> [deepseek-v4.1-flash]')
        );
        assert.ok(triggerLog, 'format trigger wajib: [AgentInspector] Fallback triggered -> [deepseek-v4.1-flash]');
    } finally {
        log.warn = originalWarn;
    }
});

// ── 11. Pembersihan tag penaakulan (Mandat §3A) ──
// Nota: tag GLM/DeepSeek dibina melalui fromCharCode + hexpair supaya
// literal Unicode tidak rosak oleh pipeline penghantaran (konvensyen projek
// — corak sama digunakan oleh subfaber-context-regression.test.js).

test('AgentInspector: stripReasoningTags membuang tag penaakulan (tertutup & terbuka)', () => {
    const { stripReasoningTags } = require('./subfaberPreflight');

    // Tag GLM sebenar: THINK = U+1F9E0 (🧠) — dibina dari pasangan UTF-16 surrogates
    const BRAIN = String.fromCharCode(0xd83e, 0xdde0); // U+1F9E0
    const THINK_OPEN = `${BRAIN}`;
    const THINK_CLOSE = `</think>`;

    // 1. Blok tertutup: THINK... </think> dibuang, jawapan JSON kekal
    assert.equal(stripReasoningTags(`${THINK_OPEN}chain of thought${THINK_CLOSE}{"valid":true}`), '{"valid":true}');

    // 2. Blok tidak ditutup (stream terpotong): semuanya selepas THINK dibuang
    assert.equal(stripReasoningTags(`${THINK_OPEN}truncated reasoning without close`), '');

    // 3. Berbilang blok + kandungan sah di luar blok
    assert.equal(
        stripReasoningTags(`${THINK_OPEN}a${THINK_CLOSE}pre ${THINK_OPEN}b${THINK_CLOSE}mid{"valid":true}`),
        'pre mid{"valid":true}'
    );

    // 4. <thinking> tertutup & tidak tertutup
    assert.equal(stripReasoningTags('<thinking>reasoning</thinking>{"valid":true}'), '{"valid":true}');
    assert.equal(stripReasoningTags('<thinking>truncated'), '');

    // 5. Tiada tag → kekal; input kosong/null selamat
    assert.equal(stripReasoningTags('{"valid":true}'), '{"valid":true}');
    assert.equal(stripReasoningTags(null), '');
    assert.equal(stripReasoningTags('   '), '');
});

test('AgentInspector: inspection membersihkan tag THINK sebelum parse — verdict bertahan', async () => {
    const inspector = new AgentInspector({
        apiKey: 'test-key',
        baseUrl: 'https://agent-inspector.example.com/v1',
        model: 'deepseek-v4-pro'
    });
    const BRAIN = String.fromCharCode(0xd83e, 0xdde0);
    inspector.translateSubtitle = async () =>
        `${BRAIN}I need to compare each line carefully... lines 1 and 2 look fine, no merge detected.</think>\n{"valid":true}`;

    const verdict = await inspector.runSemanticInspection(makeEntries(2), makeTranslated(2), {
        batchIndex: 0,
        totalBatches: 1
    });
    assert.equal(verdict.valid, true);
    assert.equal(verdict.failOpen, undefined, 'parse berjaya — bukan fail-open');
    assert.equal(verdict.modelUsed, 'deepseek-v4-pro', 'primary model cukup — tiada failover diperlukan');
});

test('SubFaberPreflight: pembersihan tag dilaksanakan sebelum parse (provider mentah)', async () => {
    const { runPreflightSemanticPass } = require('./subfaberPreflight');
    const BRAIN = String.fromCharCode(0xd83e, 0xdde0);
    // Provider mentah yang TIDAK membersihkan THINK (corak bukan-openai) —
    // tanggungjawab pembersihan kini pada lapisan preflight sendiri.
    const rawProvider = {
        model: 'glm-5.3-flashx',
        translateSubtitle: async () =>
            `${BRAIN}raw reasoning that would leak into a naive parser</think>{"theme":"Theme X.","terms":[]}`
    };
    const result = await runPreflightSemanticPass(makeEntries(50), 'Malay', 'English', rawProvider);
    assert.ok(result, 'tag THINK mesti dibersihkan sebelum parsePreflightResponse');
    assert.equal(result.theme, 'Theme X.');
});

test('SubFaberPreflight: hook onParseFailure menghantar teks mentah untuk forensik', async () => {
    const { runPreflightSemanticPass } = require('./subfaberPreflight');
    let hookRaw = null;
    const provider = {
        model: 'glm-5.3-flashx',
        translateSubtitle: async () => 'not-json-at-all {broken'
    };
    const result = await runPreflightSemanticPass(makeEntries(50), 'Malay', 'English', provider, {
        onParseFailure: (raw) => {
            hookRaw = raw;
        }
    });
    assert.equal(result, null, 'parse gagal → null (non-blocking dipelihara)');
    assert.equal(hookRaw, 'not-json-at-all {broken', 'hook menerima teks mentah yang sama dengan log forensik');
});

// ── 12. Meta batch dari gerbang enjin ──

test('AgentInspector: gerbang enjin menghantar meta {batchIndex, totalBatches} kepada inspector', async () => {
    const TranslationEngine = require('./translationEngine');
    let capturedMeta = null;
    const dummyGemini = {
        translateSubtitle: async () => '<s id="1">Satu</s>\n<s id="2">Dua</s>',
        streamTranslateSubtitle: async () => '',
        estimateTokenCount: () => 10
    };
    const agentInspector = {
        circuitOpen: false,
        runSemanticInspection: async (batch, translated, meta) => {
            capturedMeta = meta;
            return { valid: true };
        }
    };
    const engine = new TranslationEngine(
        dummyGemini,
        'gemini-2.5-flash',
        {},
        { providerName: 'gemini', agentInspector }
    );
    await engine.translateBatch(makeEntries(2), 'Malay', null, 0, 1, null, { streaming: false });
    assert.ok(capturedMeta, 'meta mesti dihantar oleh gerbang enjin');
    assert.equal(capturedMeta.batchIndex, 0);
    assert.equal(capturedMeta.totalBatches, 1);
});

// ── 13. Resilient Pre-Flight JSON Parser (Mandat Pengerasan 2026-09-26 §1) ──
// Forensik Beta Run 3: respons 2101 aksara sah gagal parse akibat anomali
// sintaks biasa LLM — koma tergantung, fences, chatter, control chars.

test('AgentInspector: parsePreflightResponse selamat dari koma tergantung (trailing comma)', () => {
    const { parsePreflightResponse } = require('./subfaberPreflight');

    // Koma tergantung pada entri array terakhir "terms": [...,]
    const withArrayComma = '{"theme":"Heist drama.","terms":[{"src":"Boss","tgt":"Ketua","note":"n"},]}';
    const parsedArray = parsePreflightResponse(withArrayComma);
    assert.ok(parsedArray, 'koma tergantung dalam array mesti dibersihkan');
    assert.equal(parsedArray.theme, 'Heist drama.');
    assert.equal(parsedArray.terms.length, 1);

    // Koma tergantung pada object: {"theme": "...", }
    const withObjectComma = '{"theme":"T.", "terms":[],}';
    const parsedObject = parsePreflightResponse(withObjectComma);
    assert.ok(parsedObject, 'koma tergantung dalam object mesti dibersihkan');
    assert.equal(parsedObject.theme, 'T.');

    // Kedua-dua serentak + berbilang tahap
    const both = '{"theme":"B.", "terms":[{"src":"A","tgt":"B",},],}';
    const parsedBoth = parsePreflightResponse(both);
    assert.ok(parsedBoth, 'koma tergantung berbilang tahap mesti dibersihkan');
    assert.equal(parsedBoth.terms[0].source, 'A');
});

test('AgentInspector: parsePreflightResponse selamat dari fences + chatter di luar sempadan', () => {
    const { parsePreflightResponse } = require('./subfaberPreflight');
    const fence = String.fromCharCode(0x60, 0x60, 0x60); // dibina supaya literal tidak rosak

    // ```json ... ``` (fence dibuang sebelum pengekstrakan sempadan)
    const fenced = `${fence}json\n{"theme":"F.","terms":[]}\n${fence}`;
    assert.ok(parsePreflightResponse(fenced), 'fences mesti dibuang');

    // Chatter sebelum DAN selepas JSON
    const chatty =
        'Sure! Here is the analysis:\n{"theme":"C.","terms":[{"src":"X","tgt":"Y","note":""}]}\nHope this helps!';
    const parsedChatty = parsePreflightResponse(chatty);
    assert.ok(parsedChatty, 'chatter luar mesti dibuang');
    assert.equal(parsedChatty.theme, 'C.');
    assert.equal(parsedChatty.terms[0].source, 'X');

    // Kombinasi penuh: chatter + fence + koma tergantung (corak Beta Run 3)
    const combined = `Absolutely, here you go:\n${fence}json\n{"theme":"K.","terms":[{"src":"Z","tgt":"Z","note":""},]}\n${fence}\nLet me know!`;
    const parsedCombined = parsePreflightResponse(combined);
    assert.ok(parsedCombined, 'kombinasi anomali mesti selamat');
    assert.equal(parsedCombined.theme, 'K.');
});

test('AgentInspector: parsePreflightResponse membersihkan aksara kawalan tidak sah', () => {
    const { parsePreflightResponse } = require('./subfaberPreflight');
    // Control chars mentah (0x01, 0x0B) dibina secara programatik — JSON.parse
    // asli menolaknya ("Unexpected token"); parser tahan lasak mesti membuangnya.
    const CTRL_01 = String.fromCharCode(0x01);
    const CTRL_0B = String.fromCharCode(0x0b);
    const ctrl = `{"theme":"Ctrl${CTRL_01}clean${CTRL_0B}now.","terms":[]}`;

    // Semakan awal: JSON.parse asli memang gagal dengan input ini
    let nativeFailed = false;
    try {
        JSON.parse(ctrl);
    } catch (_) {
        nativeFailed = true;
    }
    assert.ok(nativeFailed, 'precondition: JSON.parse asli mesti gagal');

    const parsed = parsePreflightResponse(ctrl);
    assert.ok(parsed, 'control chars tidak sah mesti dibuang');
    assert.equal(parsed.theme, 'Ctrlcleannow.', '0x01 dan 0x0B dibuang; teks sah kekal');
    assert.ok(!parsed.theme.includes(CTRL_01) && !parsed.theme.includes(CTRL_0B), 'tiada control char tersisa');
});

test('AgentInspector: parse gagal selepas pembersihan → forensik offset + konteks 100 aksara pada WARN', () => {
    const { parsePreflightResponse } = require('./subfaberPreflight');
    const log = require('../utils/logger');
    const captured = [];
    const originalWarn = log.warn;
    log.warn = (fn) => {
        try {
            captured.push(typeof fn === 'function' ? String(fn()) : String(fn));
        } catch (_) {
            /* noop */
        }
    };
    try {
        // JSON rosak yang TIDAK boleh diselamatkan (string tidak ditutup)
        const result = parsePreflightResponse('{"theme":"broken... no closing quote, "terms":[]}');
        assert.equal(result, null, 'tetap null untuk JSON yang benar-benar rosak');

        const forensic = captured.find((l) => l.includes('Resilient parse failed'));
        assert.ok(forensic, 'kegagalan parse mesti dilog dengan forensik');
        assert.ok(/Offset \d+/.test(forensic), 'offset kedudukan aksara mesti dipaparkan');
        assert.ok(forensic.includes('broken'), 'konteks 100 aksara sekitar kawasan bermasalah mesti dipaparkan');
    } finally {
        log.warn = originalWarn;
    }
});

// ── 14. Dynamic Model Swapping — Hot-Swappable (Mandat §2) ──

test('AgentInspector: hierarki model 100% dinamik — kimi-k3 utama, sandaran custom', async () => {
    const inspector = new AgentInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'kimi-k3',
        fallbackModel: 'glm-5.3-flashx'
    });
    assert.deepEqual(inspector.modelHierarchy, ['kimi-k3', 'glm-5.3-flashx'], 'susunan configurable, bukan hardcoded');

    const calls = [];
    inspector.translateSubtitle = async function () {
        calls.push(this.model);
        if (this.model === 'kimi-k3') throw new Error('kimi down');
        return '{"valid":true}';
    };
    const verdict = await inspector.runSemanticInspection(makeEntries(2), makeTranslated(2));
    assert.deepEqual(calls, ['kimi-k3', 'glm-5.3-flashx'], 'failover mengikut hierarki dinamik');
    assert.equal(verdict.modelUsed, 'glm-5.3-flashx');
    assert.equal(verdict.valid, true);
});

test('AgentInspector: fallbackModel "none" → hierarki model tunggal (tiada failover)', async () => {
    const inspector = new AgentInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'deepseek-v4-pro',
        fallbackModel: 'none'
    });
    assert.deepEqual(inspector.modelHierarchy, ['deepseek-v4-pro'], '"none" = single-model');
    assert.equal(inspector.fallbackModel, null);

    let calls = 0;
    inspector.translateSubtitle = async function () {
        calls++;
        throw new Error('primary dead');
    };
    const verdict = await inspector.runSemanticInspection(makeEntries(2), makeTranslated(2));
    assert.equal(calls, 1, 'tiada panggilan kedua — failover dimatikan');
    assert.equal(verdict.failOpen, true);
    assert.equal(verdict.error, 'both_models_failed');
});

test('AgentInspector: fallbackModel sama dengan utama → dedupe kepada hierarki tunggal', () => {
    const inspector = new AgentInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'glm-5.3-flashx',
        fallbackModel: 'GLM-5.3-FLASHX' // sama (case-insensitive)
    });
    assert.deepEqual(inspector.modelHierarchy, ['glm-5.3-flashx'], 'duplikat mesti didedup');
    assert.equal(inspector.fallbackModel, null);
});

// [HARDCODE-PURGE 2026-10-13] Lalai tanpa options = bypass senyap. Hierarki
// mandat penuh diuji melalui suntikan eksplisit (kontrak baharu).
test('AgentInspector [MODEL-HIERARCHY]: suntikan penuh — kimi-k3 Fasa 0 standalone & deepseek-v4-pro semakan + deepseek-v4.1-flash sandaran', () => {
    const bare = new AgentInspector({ apiKey: 'k', baseUrl: 'https://x.example/v1' });
    assert.equal(bare.preflightModel, '', 'tiada options → Fasa 0 bypass');
    assert.equal(bare.model, '', 'tiada options → Fasa 1 bypass');
    assert.equal(AGENT_INSPECTOR_DEFAULT_MODEL, '');
    assert.equal(AGENT_INSPECTOR_PREFLIGHT_MODEL, '');
    assert.equal(AGENT_INSPECTOR_FALLBACK_MODEL, '');

    const inspector = new AgentInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        preflightModel: 'kimi-k3',
        model: 'deepseek-v4-pro',
        fallbackModel: 'deepseek-v4.1-flash'
    });
    assert.equal(inspector.preflightModel, 'kimi-k3', 'suntikan Fasa 0 kimi-k3');
    assert.deepEqual(inspector.preflightHierarchy, ['kimi-k3'], 'hierarki Fasa 0 [kimi-k3] standalone');
    assert.equal(inspector.preflightRetries, 4, 'retry-same-model Fasa 0 = 4');
    assert.equal(inspector.model, 'deepseek-v4-pro', 'suntikan pemeriksa utama deepseek-v4-pro');
    assert.deepEqual(inspector.modelHierarchy, ['deepseek-v4-pro', 'deepseek-v4.1-flash'], 'hierarki semakan');
    assert.equal(inspector.fallbackModel, 'deepseek-v4.1-flash', 'fallback pemeriksa deepseek-v4.1-flash');
    assert.equal(inspector.inspectionModel, 'deepseek-v4-pro', 'alias inspectionModel menunjuk model semakan');
});

test('AgentInspector: config.js normalisasi agentInspector — TRINITY FRONTIER (preflight + inspection + fallback)', async () => {
    const { normalizeConfig } = require('../utils/config');
    const savedEnv = {
        AGENT_INSPECTOR_MODEL: process.env.AGENT_INSPECTOR_MODEL,
        AGENT_INSPECTOR_PREFLIGHT_MODEL: process.env.AGENT_INSPECTOR_PREFLIGHT_MODEL
    };
    try {
        // Kes 1: config menang
        const cfg = normalizeConfig({
            agentInspector: {
                enabled: true,
                baseUrl: 'https://c.example/v1',
                apiKey: 'ck',
                model: 'm1',
                preflightModel: 'p1',
                fallbackModel: 'm2'
            }
        });
        assert.equal(cfg.agentInspector.model, 'm1', 'model = model semakan');
        assert.equal(cfg.agentInspector.preflightModel, 'p1', 'preflightModel = model Fasa 0');
        assert.equal(cfg.agentInspector.fallbackModel, 'm2');

        // Kes 2: lalai bersih — [HARDCODE-PURGE] tiada lalai statik: semua
        // model kosong (env bersih) → bypass senyap kedua-dua fasa.
        delete process.env.AGENT_INSPECTOR_MODEL;
        delete process.env.AGENT_INSPECTOR_PREFLIGHT_MODEL;
        const defaults = normalizeConfig({});
        assert.equal(defaults.agentInspector.model, '', 'tiada lalai statik — model kosong');
        assert.equal(defaults.agentInspector.preflightModel, '', 'tiada lalai statik — preflight kosong');
        assert.equal(defaults.agentInspector.preflightFallbackModel, '', 'fallback Fasa 0 = primer (standalone)');
        assert.equal(defaults.agentInspector.fallbackModel, '', 'tiada lalai statik — fallback kosong');

        // Kes 3: inspectionModel warisan bermigrasi ke 'model'
        const legacy = normalizeConfig({
            agentInspector: {
                enabled: true,
                baseUrl: 'https://l.example/v1',
                apiKey: 'lk',
                inspectionModel: 'legacy-inspector'
            }
        });
        assert.equal(
            legacy.agentInspector.model,
            'legacy-inspector',
            'inspectionModel warisan kekal sebagai model semakan'
        );
        assert.equal(
            legacy.agentInspector.inspectionModel,
            undefined,
            'alias warisan dilucutkan daripada struktur tersimpan'
        );
    } finally {
        for (const key of ['AGENT_INSPECTOR_MODEL', 'AGENT_INSPECTOR_PREFLIGHT_MODEL']) {
            if (savedEnv[key] === undefined) delete process.env[key];
            else process.env[key] = savedEnv[key];
        }
    }
});

// ── 15. TRINITY POWERHOUSE (Mandat Frontier 2026-09-26) ──

test('AgentInspector: [MODEL-HIERARCHY] FINAL — Fasa 0 dihalakan ke kimi-k3 (retry-same-model), semakan ke deepseek-v4-pro (dua hierarki berasingan)', async () => {
    const inspector = new AgentInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'deepseek-v4-pro',
        preflightModel: 'kimi-k3',
        preflightRetryBackoffMs: 0 // [UPSTREAM-RESILIENCE] lumpuh backoff — ujian pantas
    });
    assert.equal(inspector.preflightModel, 'kimi-k3', 'Fasa 0 kimi-k3');
    assert.equal(inspector.model, 'deepseek-v4-pro', 'semakan deepseek-v4-pro');

    const calls = [];
    // Fasa 0: kimi-k3 gagal 5x → fail-open null (tiada model lain menyelamatkan)
    inspector.translateSubtitle = async function () {
        calls.push(this.model);
        throw new Error('primary down');
    };
    const preflightContext = await inspector.runPreflightPass(makeEntries(50), 'Malay', 'English');
    assert.equal(preflightContext, null, 'kimi-k3 standalone: 5x gagal → fail-open tanpa konteks');
    assert.deepEqual(
        calls,
        ['kimi-k3', 'kimi-k3', 'kimi-k3', 'kimi-k3', 'kimi-k3'],
        'Fasa 0: hanya kimi-k3 di-retry (×5) — deepseek TIDAK disentuh'
    );

    // Semakan: hierarki berasingan deepseek-v4-pro → deepseek-v4.1-flash
    calls.length = 0;
    inspector.translateSubtitle = async function () {
        calls.push(this.model);
        if (this.model === 'deepseek-v4-pro') throw new Error('primary down');
        return '{"valid":true}';
    };
    inspector.fallbackModel = 'deepseek-v4.1-flash';
    inspector.modelHierarchy = ['deepseek-v4-pro', 'deepseek-v4.1-flash'];
    const verdict = await inspector.runSemanticInspection(makeEntries(2), makeTranslated(2));
    assert.equal(verdict.valid, true);
    assert.deepEqual(
        calls,
        ['deepseek-v4-pro', 'deepseek-v4.1-flash'],
        'Semakan hierarki deepseek-v4-pro → deepseek-v4.1-flash'
    );
});

test('AgentInspector: TRINITY — hot-swap utama tersuai + sandaran tersuai (Fasa 0 kekal standalone)', () => {
    const inspector = new AgentInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'glm-5.3-flashx',
        preflightModel: 'kimi-k2.7',
        fallbackModel: 'deepseek-v4-pro'
    });
    assert.equal(inspector.model, 'glm-5.3-flashx');
    assert.equal(inspector.preflightModel, 'kimi-k2.7');
    assert.equal(inspector.fallbackModel, 'deepseek-v4-pro');
    assert.deepEqual(inspector.modelHierarchy, ['glm-5.3-flashx', 'deepseek-v4-pro']);
    // [MODEL-HIERARCHY] FINAL: Fasa 0 sentiasa 1-tingkat — primer custom,
    // fallback menuruti primer (tiada deepseek-v4-pro dalam pre-flight).
    assert.deepEqual(inspector.preflightHierarchy, ['kimi-k2.7']);
});

// ── 16. KETELUSAN LOG + MUATAN HTTP SEBENAR (Mandat Universal Payload §C) ──

test('AgentInspector: log PASSED berformat mandat — [AgentInspector] Batch X/Y inspection: PASSED (valid: true) [glm-5.3] (...ms)', async () => {
    const log = require('../utils/logger');
    const inspector = new AgentInspector({
        apiKey: 'test-key',
        baseUrl: 'https://agent-inspector.example.com/v1',
        model: 'deepseek-v4-pro'
    });
    inspector.translateSubtitle = async () => '{"valid":true}';

    const captured = [];
    const originalInfo = log.info;
    log.info = (fn) => {
        try {
            captured.push(typeof fn === 'function' ? String(fn()) : String(fn));
        } catch (_) {
            /* noop */
        }
    };
    try {
        const verdict = await inspector.runSemanticInspection(makeEntries(2), makeTranslated(2), {
            batchIndex: 0,
            totalBatches: 1
        });
        assert.equal(verdict.valid, true);
        assert.equal(verdict.modelUsed, 'deepseek-v4-pro');

        const passedLog = captured.find((l) => l.includes('PASSED'));
        assert.ok(passedLog, 'log PASSED mesti dicetak pada INFO');
        assert.ok(
            passedLog.startsWith('[AgentInspector] Batch 1/1 inspection: PASSED (valid: true) [deepseek-v4-pro] ('),
            'format mandat: prefix + model deepseek-v4-pro tepat dicatatkan'
        );
        assert.ok(/\(\d+ms\)$/.test(passedLog), 'latensi ms mesti dicatatkan dalam kurungan');
    } finally {
        log.info = originalInfo;
    }
});

test('AgentInspector: log Pre-Flight berformat mandat — [SubFaberPreflight] Running pre-flight semantic pass (N entries) [kimi-k3]', async () => {
    const log = require('../utils/logger');
    const inspector = new AgentInspector({
        apiKey: 'test-key',
        baseUrl: 'https://agent-inspector.example.com/v1',
        preflightModel: 'kimi-k3'
    });
    inspector.translateSubtitle = async () => JSON.stringify({ theme: 'Theme.', terms: [] });

    const captured = [];
    const originalInfo = log.info;
    log.info = (fn) => {
        try {
            captured.push(typeof fn === 'function' ? String(fn()) : String(fn));
        } catch (_) {
            /* noop */
        }
    };
    try {
        const context = await inspector.runPreflightPass(makeEntries(50), 'Malay', 'English');
        assert.ok(context, 'preflight context returned');

        const runningLog = captured.find((l) => l.includes('Running pre-flight semantic pass'));
        assert.ok(runningLog, 'log Running pre-flight mesti dicetak');
        assert.ok(
            runningLog.includes('Running pre-flight semantic pass (50 entries) [kimi-k3]'),
            'format mandat: N entries + nama model tepat [kimi-k3] (MANDAT v5)'
        );
    } finally {
        log.info = originalInfo;
    }
});

// [PENYATUAN MUTLAK 2026-10-25 — Mandat Owner] Muatan HTTP sebenar kini
// pembina STANDARD: {model, messages, stream, max_tokens, response_format}
// — god-tier MANSUH; sifar-penciptaan temperature/reasoning kekal (K1/K5).
test('AgentInspector: [PENYATUAN MUTLAK] muatan HTTP sebenar (axios.post, stream SSE) — pembina standard: stream true + max_tokens + response_format json_schema strict; sifar-penciptaan temperature/reasoning', async () => {
    const axios = require('axios');
    const inspector = new AgentInspector({
        apiKey: 'test-key',
        baseUrl: 'https://agent-inspector.example.com/v1',
        model: 'deepseek-v4-pro'
    });

    const captured = [];
    const { EventEmitter } = require('events');
    const originalPost = axios.post;
    // [PAYLOAD-GODTIER] translateSubtitle kini MENGDELEGASI ke laluan SSE
    // (stream:true dalam muatan). Mock memulangkan EventEmitter berisi chunk
    // data: SSE — memastikan parser SSE sedia ada menghurai jawapan sebenar.
    axios.post = async (url, body) => {
        captured.push({ url, body });
        const stream = new EventEmitter();
        setImmediate(() => {
            stream.emit('data', Buffer.from('data: {"choices":[{"delta":{"content":"{\\"valid\\":"}}]}\n\n'));
            stream.emit(
                'data',
                Buffer.from('data: {"choices":[{"delta":{"content":"true}"},"finish_reason":"stop"}]}\n\n')
            );
            stream.emit('data', Buffer.from('data: [DONE]\n\n'));
            stream.emit('end');
        });
        return { data: stream };
    };
    try {
        const verdict = await inspector.runSemanticInspection(makeEntries(2), makeTranslated(2), {
            batchIndex: 0,
            totalBatches: 1
        });
        assert.equal(verdict.valid, true, 'verdict dihuraikan daripada stream SSE');
        assert.equal(captured.length, 1, 'satu panggilan HTTP sahaja (primary lulus)');

        const { url, body } = captured[0];
        assert.ok(url.endsWith('/chat/completions'), 'endpoint chat/completions');
        // ═══ [PENYATUAN MUTLAK 2026-10-25] ═══
        // Muatan HTTP SEBENAR tanpa params pengguna → sifar-penciptaan temperature.
        assert.ok(!('temperature' in body), 'muatan HTTP TIDAK membawa temperature dicipta enjin');
        assert.equal(
            body.stream,
            true,
            'muatan HTTP WAJIB membawa stream:true (siling Caddy 300s — STREAMING MANDATORY)'
        );
        assert.equal(body.model, 'deepseek-v4-pro');
        assert.ok(Array.isArray(body.messages) && body.messages.length === 1, 'satu mesej user');
        // Sifar-penciptaan parameter pengguna (enjin tidak mencipta nilai):
        assert.equal(
            'reasoning_effort' in body,
            false,
            'muatan HTTP: tiada reasoning_effort dicipta enjin (K5 sifar-penciptaan)'
        );
        assert.equal(
            'max_tokens' in body,
            true,
            'PENYATUAN: muatan HTTP membawa max_tokens standard (parameter rasmi pintu — god-tier mansuh)'
        );
        assert.equal('extra_body' in body, false, 'muatan HTTP: tiada extra_body dicipta (bukan keluarga Hunyuan)');
        // ═══ [TRINITY FASA 3 + PENYATUAN MUTLAK 2026-10-25] ═══
        // Inspector ialah agent JSON → response_format json_schema strict
        // WAJIB pada muatan HTTP, dijana daripada INSPECTOR_SCHEMA_CONTRACT
        // kanonik (core.js) melalui meta.responseFormat → kini diaktifkan di
        // DALAM buildChatRequest() standard pembina pintu (bukan override ejen).
        assert.ok(
            body.response_format && body.response_format.type === 'json_schema',
            'muatan HTTP WAJIB membawa response_format json_schema (mazhab rasmi tunggal — Fasa 3)'
        );
        assert.equal(
            body.response_format.json_schema.strict,
            true,
            'response_format WAJIB strict:true (Structured Outputs rasmi)'
        );
        assert.equal(
            body.response_format.json_schema.name,
            'subfaber_inspector_verdict',
            'skema daripada INSPECTOR_SCHEMA_CONTRACT kanonik (core.js)'
        );
        assert.deepEqual(
            body.response_format.json_schema.schema.properties.crimes.items.properties.type.enum,
            ['MERGE', 'DROP', 'PHANTOM', 'SHIFT', 'UNTRANSLATED', 'REGISTER', 'TERM'],
            'enum 7 jenayah kekal dalam skema strict (anti-drift taksonomi)'
        );
        assert.equal('top_p' in body, false, 'muatan HTTP: tiada top_p dicipta (medan tidak diset)');
        assert.equal('thinking' in body, false, 'muatan HTTP: tiada thinking dicipta tanpa reasoningEffort eksplisit');
        assert.equal(
            'presence_penalty' in body,
            false,
            'muatan HTTP: tiada presence_penalty dicipta (medan tidak diset)'
        );
        assert.equal('max_completion_tokens' in body, false, 'muatan HTTP: max_completion_tokens khusus OpenAI rasmi');
        // ═══ [PENYATUAN MUTLAK 2026-10-25] ═══
        // Pembina standard: model/messages/stream/max_tokens + response_format
        // json_schema strict (parameter rasmi pintu) — sifar-penciptaan temperature.
        assert.deepEqual(
            Object.keys(body).sort(),
            ['max_tokens', 'messages', 'model', 'response_format', 'stream'],
            'muatan HTTP mesti {model, messages, stream, max_tokens, response_format} (pembina standard — PENYATUAN MUTLAK)'
        );
    } finally {
        axios.post = originalPost;
    }
});

// ── 17. BETA RUN 9 — PENYATUAN DEEPSEEK STACK & HIERARKI KEBENARAN ──

test('AgentInspector: MANDAT v5 — Pre-Flight kimi-k3 (suntikan dinamik) dengan timeout 5 minit', () => {
    const inspector = new AgentInspector({ apiKey: 'k', baseUrl: 'https://x.example/v1', preflightModel: 'kimi-k3' });
    // (a) Pre-Flight menerima kimi-k3 melalui suntikan konfigurasi.
    assert.equal(inspector.preflightModel, 'kimi-k3', 'Fasa 0 menerima kimi-k3 (MANDAT v5, dinamik)');
    assert.equal(AGENT_INSPECTOR_PREFLIGHT_MODEL, '');
    assert.equal(AGENT_INSPECTOR_PREFLIGHT_TIMEOUT_MS, 300000, 'Fasa 0 timeout 5 minit (MANDAT OPERASI MUTLAK v2)');
    assert.equal(AGENT_INSPECTOR_INSPECTION_TIMEOUT_MS, 300000, 'Fasa 1 5 minit (MANDAT OPERASI MUTLAK v2)');
    assert.equal(inspector.translationTimeout, 300000, 'baseline instance 5 minit');
    // (b) Override env berfungsi (integer ms positif sahaja).
    const override = new AgentInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        preflightTimeoutMs: 420000,
        inspectionTimeoutMs: 330000
    });
    assert.equal(override.preflightTimeoutMs, 420000, 'override preflight 420s diterima');
    assert.equal(override.inspectionTimeoutMs, 330000, 'override inspection 330s diterima');
    // (c) Override tidak sah → lalai mandat.
    const invalid = new AgentInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        preflightTimeoutMs: -5,
        inspectionTimeoutMs: 'junk'
    });
    assert.equal(invalid.preflightTimeoutMs, 300000, 'override tidak sah → lalai 5 minit');
    assert.equal(invalid.inspectionTimeoutMs, 300000, 'override tidak sah → lalai 5 minit');
});

test('AgentInspector: [MODEL-HIERARCHY] FINAL — fallback deepseek-v4.1-flash Fasa 1 SAHAJA; Fasa 0 retry kimi-k3', async () => {
    // Fasa 0: kimi-k3 gagal 5x → fail-open (deepseek-v4.1-flash TIDAK disentuh).
    const inspector0 = new AgentInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'deepseek-v4-pro',
        preflightModel: 'kimi-k3',
        preflightRetryBackoffMs: 0 // [UPSTREAM-RESILIENCE] lumpuh backoff — ujian pantas
    });
    assert.deepEqual(inspector0.preflightHierarchy, ['kimi-k3'], 'preflightHierarchy = [kimi-k3] SAHAJA');
    assert.equal(AGENT_INSPECTOR_FALLBACK_MODEL, '');

    const calls0 = [];
    inspector0.translateSubtitle = async function () {
        calls0.push(this.model);
        throw Object.assign(new Error('HTTP 502 Bad Gateway'), { statusCode: 502 });
    };
    const ctx = await inspector0.runPreflightPass(makeEntries(50), 'Malay', 'English');
    assert.equal(ctx, null, 'Fasa 0: kimi-k3 standalone — kegagalan → fail-open (bukan fallback)');
    assert.deepEqual(
        calls0,
        ['kimi-k3', 'kimi-k3', 'kimi-k3', 'kimi-k3', 'kimi-k3'],
        'Fasa 0: kimi-k3 sahaja (×5) — flash TIDAK dipanggil'
    );

    // Fasa 1: deepseek-v4-pro gagal → deepseek-v4.1-flash menyelamatkan.
    const inspector1 = new AgentInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'deepseek-v4-pro',
        fallbackModel: 'deepseek-v4.1-flash'
    });
    assert.deepEqual(
        inspector1.modelHierarchy,
        ['deepseek-v4-pro', 'deepseek-v4.1-flash'],
        'modelHierarchy = [deepseek-v4-pro, deepseek-v4.1-flash]'
    );
    const calls1 = [];
    inspector1.translateSubtitle = async function () {
        calls1.push(this.model);
        if (this.model === 'deepseek-v4-pro') {
            throw Object.assign(new Error('HTTP 502 Bad Gateway'), { statusCode: 502 });
        }
        return '{"valid":true}';
    };
    const verdict = await inspector1.runSemanticInspection(makeEntries(2), makeTranslated(2));
    assert.equal(verdict.valid, true);
    assert.deepEqual(calls1, ['deepseek-v4-pro', 'deepseek-v4.1-flash'], 'Fasa 1 beralih ke deepseek-v4.1-flash');
});

test('AgentInspector: BETA RUN 9 — hierarki kebenaran hadir dalam suntikan konteks kelompok Agent Translation', () => {
    const TranslationEngine = require('./translationEngine');
    const dummyGemini = {
        translateSubtitle: async () => '',
        streamTranslateSubtitle: async () => '',
        estimateTokenCount: () => 10
    };
    const engine = new TranslationEngine(dummyGemini, 'gemini-2.5-flash', {}, { providerName: 'gemini' });
    const batch = [{ id: 1, timecode: 't', text: 'Hello there.' }];
    const block = engine._formatPreflightForChunk(
        { theme: 'A drama.', terms: [], characters: [], credits_and_titles: [] },
        [],
        batch,
        []
    );
    // (b) HIERARCHY OF TRUTH wajib hadir verbatim dalam suntikan konteks.
    assert.ok(block.includes('### HIERARCHY OF TRUTH'), 'Seksyen HIERARCHY OF TRUTH mesti wujud');
    assert.ok(
        block.includes(
            'HIERARCHY OF TRUTH: Pre-flight context provides macro-guidance. However, the SOURCE DIALOGUE in the current batch is the absolute ground truth.'
        ),
        'Arahan tegar dialog-sumber-mengatasi mesti hadir verbatim'
    );
    // (b2) BARE-NAME FIX (runtime lesson Shine on Me S01E31, 2026-09-30):
    // gelaran ialah MAPPING bukan mandat — nama kosong mesti kekal kosong,
    // gelaran tidak boleh disuntik pada baris sumber yang tidak membawanya.
    assert.ok(
        block.includes('Character titles are MAPPINGS, not mandates'),
        'Arahan mapping-bukan-mandat mesti hadir (anti gelaran-hantu)'
    );
    assert.ok(block.includes('when the source uses a bare name'), 'Peraturan nama-kosong-kekal-kosong mesti hadir');
    assert.ok(block.includes('ALWAYS FOLLOW THE SOURCE DIALOGUE.'), 'Arahan ikut dialog sumber mesti hadir');
});
