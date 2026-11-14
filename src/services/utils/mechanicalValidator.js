const { resolveLanguageCode } = require('../../utils/languageResolver');

const SOURCE_SCRIPT_PATTERN =
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Cyrillic}\p{Script=Arabic}]/u;
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
        if (
            label !== label.toLocaleLowerCase() ||
            /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}|\p{Script=Hangul}/u.test(label)
        ) {
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
            add('SCRIPT_LEAK', 'source-script characters remain in the Rumi target');
        }

        const missingLabels = speakerLabels(sourceText).filter((label) => !speakerLabels(targetText).includes(label));
        if (missingLabels.length > 0) {
            add('SPEAKER_LABEL_LOSS', `missing speaker label(s): ${missingLabels.join(', ')}`);
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
