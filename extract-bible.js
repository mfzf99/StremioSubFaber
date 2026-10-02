/**
 * extract-bible.js — [TTFT PROBE HELPER 2026-09-29]
 *
 * Himpun content SSE dari fail output curl (data: chunks) dan huraikan JSON
 * Bible pre-flight, kemudian ringkaskan kualiti: theme, bilangan terms,
 * characters, canonical_address terkunci, credits. Guna untuk mengesahkan
 * varian slim TIDAK menjatuhkan kualiti Bible berbanding baseline.
 *
 * Guna:  node extract-bible.js slim-1.txt
 */

const fs = require('fs');

const file = process.argv[2];
if (!file) {
    console.error('Usage: node extract-bible.js <curl-output.txt>');
    process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8');
let out = '';
for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith('data:')) continue;
    const p = t.slice(5).trim();
    if (!p || p === '[DONE]') continue;
    try {
        const j = JSON.parse(p);
        const c = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
        if (c) out += c;
    } catch (_) {
        /* skip non-JSON keepalive lines */
    }
}

// Buang fence markdown jika ada, ekstrak sempadan { ... }.
let candidate = out.replace(/```json/gi, '').replace(/```/g, '');
const s = candidate.indexOf('{');
const e = candidate.lastIndexOf('}');
if (s !== -1 && e > s) candidate = candidate.slice(s, e + 1);

let bible;
try {
    bible = JSON.parse(candidate);
} catch (err) {
    console.log('PARSE FAIL:', err.message);
    console.log('assembled content length:', out.length);
    console.log('head:', out.slice(0, 400));
    process.exit(0);
}

const terms = Array.isArray(bible.terms) ? bible.terms : [];
const chars = Array.isArray(bible.characters) ? bible.characters : [];
const credits = Array.isArray(bible.credits_and_titles) ? bible.credits_and_titles : [];
const locked = chars.filter(
    (c) =>
        c &&
        c.canonical_address &&
        String(c.canonical_address).trim() &&
        String(c.canonical_address).toLowerCase() !== 'null'
);

console.log('=== BIBLE QUALITY:', file, '===');
console.log('theme      :', String(bible.theme || '(none)').slice(0, 160));
console.log('terms      :', terms.length);
console.log('characters :', chars.length);
console.log('canon locked:', locked.length, '/', chars.length);
console.log('credits    :', credits.length);
console.log('--- sample characters (first 5) ---');
for (const c of chars.slice(0, 5)) {
    console.log(`  ${c.name} -> ${c.canonical_address || 'null'}  (${c.role || ''})`);
}
console.log('--- sample terms (first 6) ---');
for (const t of terms.slice(0, 6)) {
    console.log(`  ${t.source} -> ${t.target}`);
}
