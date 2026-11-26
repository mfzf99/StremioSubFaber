// Ujian regresi: PAGAR MEKANIKAL terminal-state untuk SEMUA jenis insiden.
//
// [TERMINAL-STATE v3.43.0 — menutup gap SSOT §5.4]
//
// Pin per-laluan (incident-terminal-state-regression.test.js) membuktikan
// PROHIBITED_CONTENT kini ditutup. Pagar ini menjawab soalan yang lebih luas yang
// diminta §5.4: adakah SESUATU jenis insiden yang dibuka sebagai 'in_progress'
// mempunyai sekurang-kurangnya satu laluan yang menutupnya?
//
// Ia membaca SUMBER translationEngine.js dan berputar pada tiga faktor yang boleh
// diperhatikan, bukan pada niat:
//   1. set jenis yang pernah dibuka dengan outcome:'in_progress'
//   2. set jenis yang pernah dipass ke _closeIncident(...)
//   3. bilangan panggilan _logIncident dengan 'in_progress' lwn bilangan _closeIncident
//      (setiap bukaan mesti ada penutup — nisbah 1:1 atau lebih banyak penutup)
//
// Ini adalah pintu keluar statik mengikut pilihan: ia tidak memerlukan provider atau
// rangkaian, jadi ia berjalan dalam setiap `npm test`, dan ia gagal kuat apabila
// seseorang menambah jenis insiden baharu tanpa laluan penutup.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ENGINE = path.join(__dirname, 'translationEngine.js');
// Buang komen baris dahulu supaya kod yang DICOBA (commented out) tidak dikira sebagai
// panggilan aktif — tanpa ini, gate kekal hijau walaupun semua penutup dibuang ke dalam
// komen. Mengekalkan rentetan & baris supaya nombor baris dan literal tidak terjejas.
function stripLineComments(text) {
    return text
        .split('\n')
        .map((line) => {
            // Hormat `//` di dalam rentetan: cuma potong pada `//` pertama yang berada di luar
            // petikan. Cukup untuk fail ini (tiada regex literal yang mengandungi `//`).
            let quote = null;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (quote) {
                    if (ch === '\\') i++;
                    else if (ch === quote) quote = null;
                } else if (ch === "'" || ch === '"' || ch === '`') quote = ch;
                else if (ch === '/' && line[i + 1] === '/') return line.slice(0, i);
            }
            return line;
        })
        .join('\n');
}
const source = stripLineComments(fs.readFileSync(ENGINE, 'utf8'));

// Satu panggilan `this._logIncident({ ... })` berbilang baris: type diambil daripada medan
// `type:` dan outcome diambil daripada medan `outcome:` dalam blok yang sama. Awalan
// `this.` wajib supaya definisi kaedah (_logIncident({ type, batch, ... }) — parameter
// yang didestruktur, tiada literal) tidak dikira sebagai panggilan.
function collectLogIncidents() {
    const out = [];
    const re = /this\._logIncident\(\{([\s\S]*?)\}\)/g;
    let m;
    while ((m = re.exec(source))) {
        const body = m[1];
        const type = /type:\s*'([^']+)'/.exec(body);
        const outcome = /outcome:\s*'([^']+)'/.exec(body);
        out.push({ type: type ? type[1] : null, outcome: outcome ? outcome[1] : 'recovered' });
    }
    return out;
}

// `_closeIncident('TYPE', ...)` — type sentiasa literal string.
function collectClosedTypes() {
    const types = new Set();
    const re = /_closeIncident\(\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(source))) types.add(m[1]);
    return types;
}

test('[TERMINAL-GATE 1] setiap jenis yang dibuka in_progress mempunyai panggilan _closeIncident', () => {
    const opened = new Set(
        collectLogIncidents()
            .filter((i) => i.outcome === 'in_progress')
            .map((i) => i.type)
    );
    const closed = collectClosedTypes();

    assert.ok(opened.size > 0, 'expected at least one incident type to open as in_progress');
    const leaking = [...opened].filter((t) => !closed.has(t));
    assert.deepEqual(
        leaking,
        [],
        `incident types opened in_progress but never closed: ${leaking.join(', ')} — ` +
            'setiap bukaan mesti ada _closeIncident pada setiap pintu keluar (SSOT §1 terminal-state closure)'
    );
});

test('[TERMINAL-GATE 2] tiada panggilan _logIncident kekal tanpa type yang boleh dikenal pasti', () => {
    const unknown = collectLogIncidents().filter((i) => !i.type);
    assert.deepEqual(
        unknown,
        [],
        'setiap _logIncident mesti menyatakan type literal — pagar statik tidak boleh mengauditnya jika tidak'
    );
});

test('[TERMINAL-GATE 3] bilangan penutup bukan kurang daripada bilangan bukaan in_progress', () => {
    const openCalls = collectLogIncidents().filter((i) => i.outcome === 'in_progress').length;
    const closeCalls = (source.match(/_closeIncident\(/g) || []).length;
    assert.ok(
        closeCalls >= openCalls,
        `bukaan in_progress=${openCalls} tetapi panggilan _closeIncident=${closeCalls} — ` +
            'satu bukaan tanpa penutup bermakna insiden boleh tergantung selamanya'
    );
});
