/**
 * make-preflight-payload-slim.js — [TTFT PROBE v2: PROMPT SLIM 2026-09-29]
 *
 * PROBE SAHAJA — bukan kod produksi. Jana preflight-payload-slim.json untuk
 * menguji hipotesis: field pronoun_register + direct_address (SOCIOLINGUISTIC
 * v2) mencetuskan deliberation meleret pada kimi-k3 (9182 reasoning tokens,
 * 80% output). Varian "slim" ini:
 *   1. GUGURKAN pronoun_register + direct_address dari skema characters.
 *      (canonical_address KEKAL — itu fakta gelaran, bukan tekaan register.)
 *   2. TAMBAH arahan anti-deliberation: putuskan sekali-lalu, jangan agonize.
 *
 * Objektif: potong reasoning tokens tanpa jatuhkan tema/istilah/gelaran.
 * Prompt dibina dengan getLanguagePack() SEBENAR (honorificMatrix +
 * canonicalAddressMatrix + creditsExample) supaya kualiti Bible sebanding.
 *
 * Guna (di VPS, sama seperti probe asal):
 *   node make-preflight-payload-slim.js /path/to/episode.srt may kimi-k3
 *   node make-preflight-payload-slim.js --synthetic may kimi-k3
 *
 * Output: preflight-payload-slim.json (untuk curl --data-binary @file)
 */

const fs = require('fs');
const { buildPreflightRawText, sampleEntriesForPreflight } = require('./src/services/subfaberPreflight');
const { getLanguagePack } = require('./src/services/prompts/languagePacks');

const arg0 = process.argv[2] || '--synthetic';
const targetLanguage = process.argv[3] || 'may';
const model = process.argv[4] || 'kimi-k3';

function synthesizeEntries(count = 759) {
    const samples = [
        'I never thought it would come to this.',
        'The solar panel shipment is delayed again.',
        'Engineer Lin, please review the contract terms.',
        'We cannot afford another supplier failure.',
        'She looked at him without saying a word.',
        'The quarterly targets are impossible to meet.',
        'Grandfather always said hard work pays off.',
        'Are you sure about the voltage specifications?',
        'This partnership means everything to our company.',
        'He walked away before she could explain.'
    ];
    const entries = [];
    for (let i = 0; i < count; i++) {
        entries.push({ id: i + 1, timecode: '00:00:00,000 --> 00:00:01,000', text: samples[i % samples.length] });
    }
    return entries;
}

let entries;
if (arg0 === '--synthetic') {
    entries = synthesizeEntries(759);
    console.error(`[probe-slim] Synthetic mode: ${entries.length} entries`);
} else {
    const { parseSRT } = require('./src/utils/subtitle');
    entries = parseSRT(fs.readFileSync(arg0, 'utf8'));
    console.error(`[probe-slim] Parsed SRT "${arg0}": ${entries.length} entries`);
}

const sampled = sampleEntriesForPreflight(entries);
const rawText = buildPreflightRawText(sampled);

// ── SLIM PROMPT (probe) — 3-tiang characters TANPA pronoun/direct_address ──
const src = 'detected';
const tgt = targetLanguage || 'the target language';
const pack = getLanguagePack(targetLanguage);
const honorificMatrix = pack.honorificMatrix.replaceAll('${tgt}', tgt);
const canonicalAddressMatrix = pack.canonicalAddressMatrix.replaceAll('${tgt}', tgt);
const creditsExample = pack.creditsExample.replaceAll('${tgt}', tgt);

const prompt = `## Role
You are a video translation expert and terminology consultant, specializing in ${src} comprehension and ${tgt} expression optimization.

## DECISION DISCIPLINE (MANDATORY — READ FIRST)
Work in ONE fast pass. Do NOT deliberate, second-guess, or weigh alternatives out loud. For every field: if the evidence is explicit, record it; if it is unclear or ambiguous, output null IMMEDIATELY and move on. Never agonize over borderline cases — null is always the correct answer when in doubt. Do not debate pronoun choices, gender, or social nuance; those are decided later by the translator, not here.

## FACT VS INFERENCE DISCIPLINE (MANDATORY)
Only lock a canonical_address if there is EXPLICIT, UNAMBIGUOUS textual evidence. If gender, social hierarchy, or formal title is unclear, set canonical_address to null. Prefer omission over guessing.

## Task
For the provided ${src} subtitle dialogue, build the pre-flight context:
1. Summarize the main topic.
   The 'theme' field MUST be written strictly in clear, precise English (2-3 sentences): narrative arc (plot), setting, and central conflict/stakes.
2. Extract technical terms, location names, and industry entities with ${tgt} translations.
   Each 'terms' entry is an object with exactly two keys: "source" and "target" (${tgt} translation or original).
   ${honorificMatrix}
3. Build profiles for the main recurring characters.
   Each 'characters' entry has exactly three keys:
   - "name": the character's name exactly as it appears in the dialogue.
   - "canonical_address": the ONE locked ${tgt} third-person reference/title used when talking ABOUT this character. ${canonicalAddressMatrix}. Lock ONLY with explicit textual evidence; if unclear, set null.
   - "role": a short description of their narrative role (e.g. female lead, antagonist, mentor, butler).
4. Scan the EARLIEST lines (1-5) for NON-DIALOGUE opening text.
   If the file opens with production credits (e.g. "Adapted from..."), the work's title, or a studio name card, ${creditsExample}.
   If it starts directly with dialogue, return an empty array [] for 'credits_and_titles'.
   Each 'credits_and_titles' entry has exactly two keys: "source" and "target".

## INPUT
<text>
${rawText}
</text>

## Output in only JSON format and no other text
{
  "theme": "Summary — strictly English (2-3 sentences)",
  "terms": [ { "source": "Original term", "target": "${tgt} translation or original" } ],
  "characters": [ { "name": "Character name", "canonical_address": "Locked ${tgt} title, or null if unclear", "role": "Narrative role" } ],
  "credits_and_titles": [ { "source": "Opening credit/title text", "target": "Official ${tgt} translation" } ]
}

You must respond ONLY with a raw JSON object matching the schema. Start with { and end with }, no other text.`;

const payload = { model, messages: [{ role: 'user', content: prompt }], stream: true, temperature: 0.0 };
fs.writeFileSync('preflight-payload-slim.json', JSON.stringify(payload));
console.error(`[probe-slim] Wrote preflight-payload-slim.json`);
console.error(`[probe-slim]   rawText chars=${rawText.length}  prompt chars=${prompt.length}`);
console.error(`[probe-slim]   payload bytes=${fs.statSync('preflight-payload-slim.json').size}`);
