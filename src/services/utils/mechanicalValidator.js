const { resolveLanguageCode } = require('../../utils/languageResolver');

const SOURCE_SCRIPT_PATTERN =
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}]/u;
const CJK_LABEL_PATTERN = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u;
// [MONKEY-H1 2026-11-15] SDH cues vs character names share the same parenthesized
// format; classification must be lexical, not case alone. A "name" is a small
// set of capitalized tokens WITHOUT descriptive words; an SDH cue is a
// descriptive phrase (sound/action/language descriptions like "sighs",
// "IN KOREAN", "THUNDER RUMBLES"). Template rule 4 explicitly orders
// parenthesized/bracketed cues to be LOCALIZED, so flagging their
// localization as SPEAKER_LABEL_LOSS contradicts the prompt's own contract.
// Multi-token English cues are word-shaped ( articles/prepositions/verbs), so
// a two-word heuristic ("contains a non-name word OR more than two tokens")
// separates them from names like "MARY" or "DR. REYES".
const SDH_DESCRIBER_WORDS = new Set([
    'a',
    'an',
    'the',
    'in',
    'on',
    'at',
    'to',
    'of',
    'and',
    'or',
    'with',
    'for',
    'from',
    'by',
    'as',
    'is',
    'are',
    'sighs',
    'sighing',
    'gasps',
    'gasping',
    'screams',
    'screaming',
    'shouts',
    'shouting',
    'whispers',
    'whispering',
    'laughs',
    'laughing',
    'groans',
    'groaning',
    'moans',
    'moaning',
    'exclaims',
    'exclaiming',
    'shrieks',
    'shrieking',
    'rumbles',
    'rumbling',
    'roars',
    'roaring',
    'echoes',
    'echoing',
    'fades',
    'fading',
    'continues',
    'continuing',
    'speaking',
    'speaks',
    'talking',
    'talks',
    'singing',
    'sings',
    'chuckles',
    'chuckling',
    'sniffles',
    'sniffling',
    'sobbing',
    'sobs',
    'crying',
    'cries',
    'breathing',
    'breathes',
    'clears',
    'clearing',
    'thunder',
    'wind',
    'rain',
    'music',
    'song',
    'engine',
    'engines',
    'phone',
    'phones',
    'door',
    'doors',
    'gunshot',
    'gunshots',
    'gunfire',
    'explosion',
    'explosions',
    'alarm',
    'alarms',
    'beeping',
    'beeps',
    'buzzing',
    'buzzes',
    'knocking',
    'knocks',
    'rapping',
    'clangs',
    'clanging',
    'crashes',
    'crashing',
    'approaching',
    'approaches',
    'distant',
    'louder',
    'softly',
    'loudly',
    'quietly',
    'slowly',
    'quickly',
    'voiceover',
    'voice',
    'over',
    'both',
    'all',
    'together',
    'off',
    'screen',
    'distorted',
    'muffled',
    'faint',
    'faintly',
    'korean',
    'japanese',
    'chinese',
    'mandarin',
    'cantonese',
    'english',
    'spanish',
    'french',
    'german',
    'russian',
    'italian',
    'thai',
    'vietnamese',
    'tagalog',
    'arabic',
    'hindi',
    'tamil',
    'indonesian',
    'malay'
]);
const HARD_FINDING_TYPES = new Set(['SCRIPT_LEAK', 'SPEAKER_LABEL_LOSS', 'MUSIC_SYMBOL_LOSS', 'VERBATIM_UNTRANSLATED']);
const UNIVERSAL_INTERJECTIONS = new Set([
    'ah',
    'aha',
    'eh',
    'ha',
    'hello',
    'hey',
    'hi',
    'hmm',
    'huh',
    'oh',
    'okay',
    'ok',
    'oops',
    'ouch',
    'uh',
    'um',
    'wow',
    'yeah',
    'yes'
]);

function normalizeText(value) {
    return String(value || '')
        .normalize('NFKC')
        .trim();
}

function isRumiTarget(targetLanguage) {
    const raw = String(targetLanguage || '').trim();
    if (!raw) return false;
    if (/rumi|latin/i.test(raw) && !/non[-\s]?latin/i.test(raw)) return true;
    const normalized = raw.toLowerCase();
    if (normalized === 'ara' || normalized === 'ar' || normalized === 'arabic') return false;
    if (/jawi|cyrl|cyrillic|arab|han[st]|hangul|kana/i.test(raw)) return false;
    try {
        const code = resolveLanguageCode(raw) || raw;
        return new Intl.Locale(code).maximize().script === 'Latn';
    } catch {
        return false;
    }
}

function isProperNameOrUniversalInterjection(text) {
    const normalized = normalizeText(text);
    if (normalized.length <= 5 || /^[\p{P}\p{S}\p{N}\s]+$/u.test(normalized)) return true;
    const bare = normalized
        .replace(/^(?:\([^)]{1,60}\)|\[[^\]]{1,60}\])\s*/u, '')
        .replace(/[\p{P}\p{S}]+$/gu, '')
        .trim();
    if (UNIVERSAL_INTERJECTIONS.has(bare.toLocaleLowerCase())) return true;

    // Restrict this exception to single-token names or universal interjections;
    // multi-token capitalized prose must still be translated.
    const words = bare.split(/\s+/u).filter(Boolean);
    if (words.length !== 1) return false;
    const clean = words[0].replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
    return /^[\p{Lu}\p{Lo}][\p{L}\p{M}.'’&-]*$/u.test(clean) || /^[\p{Lu}\p{N}]+$/u.test(clean);
}

function isSdhCue(label) {
    // [MONKEY-H1 2026-11-15] Klasifier leksikal: isyarat SDH menerang
    // bunyi/tindakan/bahasa ("sighs", "IN KOREAN", "THUNDER RUMBLES") dan
    // peraturan 4 templat memerintahkan ia DILOKALKAN; nama watak pula ialah
    // set token terkapital yang ketat ("MARY", "DR. REYES"). Label dengan
    // perkataan menerang, >2 token, atau bentuk gerund ialah isyarat SDH.
    // Akhiran 's' kasar TIDAK digunakan — nama watak Latin kerap berakhir 's'
    // (MARCUS, JAMES, CHARLES); bentuk kata kerja ('SIGHS') sudah berada dalam
    // senarai perkataan menerang.
    const tokens = label
        .toLocaleLowerCase()
        .split(/[\s/]+/u)
        .map((token) => token.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, ''))
        .filter(Boolean);
    if (tokens.length === 0) return true;
    if (tokens.length > 2) return true;
    return tokens.some((token) => SDH_DESCRIBER_WORDS.has(token) || /ing$/.test(token));
}

function speakerLabels(text) {
    const labels = [];
    const pattern = /(?:^|\n)\s*(?:\(([^()\n]{1,60})\)|（([^（）\n]{1,60})）|\[([^\][\n]{1,60})\])/g;
    for (const match of String(text || '').matchAll(pattern)) {
        const label = normalizeText(match[1] || match[2] || match[3]);
        if (!label) continue;
        // Lowercase parenthesized cues are SDH sound effects, not speaker names.
        // [R#3-FIX] Huruf besar Rumi bukan syarat nama watak: label kurungan
        // penuh berisi skrip bukan-Rumi (（りん）/（タカシ）) ialah nama watak
        // CJK — bukan isyarat SDH. Ujian kecil: ada mana-mana huruf skrip
        // bukan-Rumi/Latin? Kalau ada, ia label penutur.
        // [MONKEY-H1 2026-11-15] Label Rumi huruf besar kini dikelaskan secara
        // LEKSIKAL (isSdhCue), bukan huruf besar semata — cue deskriptif
        // (IN KOREAN / THUNDER RUMBLES) bebas dilokalkan mengikut peraturan 4
        // templat tanpa false positive SPEAKER_LABEL_LOSS; nama watak sebenar
        // (MARY / DR. REYES) kekal wajib dipelihara.
        if (CJK_LABEL_PATTERN.test(label) || (label !== label.toLocaleLowerCase() && !isSdhCue(label))) {
            labels.push(label);
        }
    }
    return labels;
}

function countMusicSymbols(text) {
    return (String(text || '').match(/♪/g) || []).length;
}

function validateMechanicalBatch(sourceBatch, translatedEntries, targetLanguage) {
    if (!Array.isArray(sourceBatch) || !Array.isArray(translatedEntries)) return [];
    const findings = [];
    const rumiTarget = isRumiTarget(targetLanguage);

    for (let index = 0; index < sourceBatch.length; index++) {
        const sourceText = String(sourceBatch[index]?.text || '');
        const targetText = String(translatedEntries[index]?.text || '');
        if (!sourceText || translatedEntries[index]?.index !== index) continue;
        const id = Number(sourceBatch[index]?.id);
        if (!Number.isInteger(id) || id <= 0) continue;

        const add = (type, note) => findings.push({ type, id, index, ids: [id], note });

        if (rumiTarget && SOURCE_SCRIPT_PATTERN.test(targetText)) {
            // [MONKEY-H2 2026-11-15] Label penutur CJK yang dipelihara verbatim
            // (（りん） こんにちは → （りん） Selamat pagi) dikecualikan: label itu
            // nama watak dipelihara mengikut kontrak pembetulan retry sendiri,
            // bukan dialog bocor. Skrip bukan-Rumi di LUAR label kurungan
            // penutur kekal dilaporkan sebagai SCRIPT_LEAK.
            const dialogueOnly = targetText
                .replace(/(?:^|\n)\s*(?:\([^()\n]{1,60}\)|（[^（）\n]{1,60}）|\[[^\][\n]{1,60}\])/g, '$1\n')
                .replace(/(?:^|\n)\s*(?:\([^()\n]{1,60}\)|（[^（）\n]{1,60}）|\[[^\][\n]{1,60}\])/g, '');
            if (SOURCE_SCRIPT_PATTERN.test(dialogueOnly)) {
                add('SCRIPT_LEAK', 'source-script characters remain in the Rumi target');
            }
        }

        const sourceLabels = speakerLabels(sourceText);
        if (sourceLabels.length > 0) {
            // [MONKEY-H2C 2026-11-15] Nama CJK dialih-huruf ke Rumi ((りん) ->
            // (Rin)) adalah terjemahan SAH — padanan rentetan merentasi skrip
            // akan sentiasa gagal. Kewujudan label penutur pada sasaran
            // disemak secara STRUKTUR (kiraan label sama), bukan hanya verbatim.
            const targetLabels = speakerLabels(targetText);
            const missingLabels = sourceLabels.filter(
                (label) =>
                    !targetLabels.includes(label) &&
                    !(CJK_LABEL_PATTERN.test(label) && targetLabels.length === sourceLabels.length)
            );
            if (missingLabels.length > 0) {
                add('SPEAKER_LABEL_LOSS', `missing speaker label(s): ${missingLabels.join(', ')}`);
            }
        }

        const sourceMusicCount = countMusicSymbols(sourceText);
        if (sourceMusicCount > countMusicSymbols(targetText)) {
            add('MUSIC_SYMBOL_LOSS', 'one or more ♪ symbols are missing');
        }

        if (
            sourceText.length > 5 &&
            normalizeText(sourceText) === normalizeText(targetText) &&
            !isProperNameOrUniversalInterjection(sourceText)
        ) {
            add('VERBATIM_UNTRANSLATED', 'the complete source line was copied verbatim');
        }

        const dropped = [];
        if (sourceText.includes('?') && !targetText.includes('?')) dropped.push('?');
        if (sourceText.includes('!') && !targetText.includes('!')) dropped.push('!');
        if (dropped.length > 0) {
            add('PUNCTUATION_MISMATCH', `source ${dropped.join('/')} absent; review only when retrying another defect`);
        }
    }

    return findings;
}

function getHardMechanicalFindings(findings) {
    return (Array.isArray(findings) ? findings : []).filter((finding) => HARD_FINDING_TYPES.has(finding?.type));
}

module.exports = {
    getHardMechanicalFindings,
    validateMechanicalBatch
};
