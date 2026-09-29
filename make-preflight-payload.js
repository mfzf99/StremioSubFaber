/**
 * make-preflight-payload.js — [UPSTREAM-RESILIENCE TTFT PROBE 2026-09-29]
 *
 * Jana preflight-payload.json yang IDENTIK dengan muatan yang runtime Agent B
 * hantar ke gateway kimi-k3 (rootsys.cloud) untuk Fasa 0. Guna untuk ukur
 * TTFT (time-to-first-token) kimi-k3 melalui curl di VPS.
 *
 * Muatan runtime (4-kunci god-tier, sama seperti buildChatRequest universal):
 *   { model, messages: [{ role:'user', content: <preflight prompt> }],
 *     stream: true, temperature: 0.0 }
 * Prompt dibina oleh buildPreflightPrompt() SEBENAR — jadi honorific matrix,
 * arahan canonical_address, dan skema JSON adalah 100% sama dengan runtime.
 *
 * Guna:
 *   # (A) Beban SEBENAR — hantar fail SRT sebenar (paling tepat):
 *   node make-preflight-payload.js /path/to/episode.srt may kimi-k3
 *
 *   # (B) Beban sintetik 759-entri (jika tiada SRT di tangan) — saiz padan
 *   #     dengan run S01E31 (~30k aksara dialog mentah):
 *   node make-preflight-payload.js --synthetic may kimi-k3
 *
 * Argumen: [srtPath|--synthetic] [targetLanguage=may] [model=kimi-k3]
 * Output : preflight-payload.json (sedia untuk curl --data-binary @file)
 */

const fs = require('fs');
const { buildPreflightPrompt, buildPreflightRawText, sampleEntriesForPreflight } = require('./src/services/subfaberPreflight');

const arg0 = process.argv[2] || '--synthetic';
const targetLanguage = process.argv[3] || 'may';
const model = process.argv[4] || 'kimi-k3';

function synthesizeEntries(count = 759) {
  // Baris dialog wakil (~40 aksara purata) — meniru beban SRT drama 759-entri
  // supaya kiraan token prompt hampir dengan run sebenar. BUKAN kandungan
  // sebenar; hanya untuk ukur TTFT/latency, bukan kualiti terjemahan.
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
  console.error(`[probe] Synthetic mode: ${entries.length} entries`);
} else {
  const { parseSRT } = require('./src/utils/subtitle');
  const srt = fs.readFileSync(arg0, 'utf8');
  entries = parseSRT(srt);
  console.error(`[probe] Parsed SRT "${arg0}": ${entries.length} entries`);
}

// Laluan IDENTIK dengan runPreflightSemanticPass(): sample → rawText → prompt.
const sampled = sampleEntriesForPreflight(entries);
const rawText = buildPreflightRawText(sampled);
const prompt = buildPreflightPrompt(rawText, targetLanguage, 'detected');

// Muatan 4-kunci god-tier — sama dengan buildChatRequest(universalPayload).
const payload = {
  model,
  messages: [{ role: 'user', content: prompt }],
  stream: true,
  temperature: 0.0
};

fs.writeFileSync('preflight-payload.json', JSON.stringify(payload));
console.error(`[probe] Wrote preflight-payload.json`);
console.error(`[probe]   model=${model} target=${targetLanguage}`);
console.error(`[probe]   rawText chars=${rawText.length}  prompt chars=${prompt.length}`);
console.error(`[probe]   payload bytes=${fs.statSync('preflight-payload.json').size}`);
