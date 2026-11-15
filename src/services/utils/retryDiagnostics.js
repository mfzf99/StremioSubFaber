// [TOTAL-PURGE v3.36.0 — Mandat Owner] Diagnostik retry SEMANTIK sahaja
// (7-jenayah Agent Inspector, DUAL-AI 2026-09-26). Entri mekanikal MONKEY
// (SCRIPT_LEAK, SPEAKER_LABEL_LOSS, MUSIC_SYMBOL_LOSS, VERBATIM_UNTRANSLATED,
// PUNCTUATION_MISMATCH) dan gabungan mekanikal dalam selectRetryFindings
// DIBUANG — mechanicalValidator.js tidak lagi wujud.

const CORRECTION_BY_TYPE = {
    MERGE: 'Restore this source line as its own populated slot; do not merge it with or displace an adjacent slot.',
    DROP: 'Restore the specific meaning and emotional subtext of this source line without generic substitution.',
    PHANTOM: 'Remove invented content and render only the meaning supported by this source line.',
    SHIFT: 'Return this content to its own source ID and remove any meaning displaced from another slot.',
    UNTRANSLATED:
        'Translate the complete sentence into {targetLanguage}; do not retain untranslated surrounding prose.',
    REGISTER:
        'Apply the locked canonical_address for third-person references or direct_address for face-to-face speech.',
    TERM: 'Apply the exact locked target rendering for the same entity or sense named by this source line.'
};

function normalizeIds(finding) {
    const ids = Array.isArray(finding?.ids) ? finding.ids : [finding?.id];
    return [...new Set(ids.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

function buildCrimeCorrections(findings, options = {}) {
    const targetLanguage = String(options.targetLanguage || 'the target language');
    const lines = [];
    const seen = new Set();
    for (const finding of Array.isArray(findings) ? findings : []) {
        const type = finding?.type;
        const template = CORRECTION_BY_TYPE[type];
        if (!template) continue;
        for (const id of normalizeIds(finding)) {
            const key = `${id}:${type}`;
            if (seen.has(key)) continue;
            seen.add(key);
            lines.push(`- ID ${id} (${type}): ${template.replaceAll('{targetLanguage}', targetLanguage)}`);
        }
    }
    return lines;
}

// [TOTAL-PURGE v3.36.0] Kini semantic-sahaja: terima senarai crimes
// Inspector sahaja (tiada lagi parameter mekanikal).
function selectRetryFindings(semanticFindings = []) {
    const semantic = Array.isArray(semanticFindings) ? semanticFindings : [];
    return semantic;
}

function escapeXmlText(text) {
    // Diagnostic prose preserves subtitle markup visibly; the engine, not the
    // model output, restores verified slot text after the retry is validated.
    return String(text || '');
}

function buildRetryDiagnosticBlock(options = {}) {
    const findings = Array.isArray(options.findings) ? options.findings : [];
    const corrections = buildCrimeCorrections(findings, options);
    if (corrections.length === 0) return '';
    const heading = options.semantic
        ? 'CRITICAL SEMANTIC ALERT (from independent inspector):'
        : 'CRITICAL SEMANTIC ALERT:';
    const affectedIds = new Set(findings.flatMap((finding) => normalizeIds(finding)));
    const verified = (Array.isArray(options.verifiedEntries) ? options.verifiedEntries : [])
        .filter(
            (entry) =>
                Number.isInteger(Number(entry?.id)) &&
                !affectedIds.has(Number(entry.id)) &&
                typeof entry?.text === 'string'
        )
        .map((entry) => `<s id="${Number(entry.id)}">${escapeXmlText(entry.text)}</s>`)
        .join('\n');

    return `\n\n${heading}\nRepair only the affected IDs; resend the complete answer with identical IDs and order.\n${corrections.join('\n')}\n\nVERIFIED SLOTS (keep verbatim)\n${verified || '(none)'}`;
}

function injectRetryDiagnostics(prompt, diagnosticBlock) {
    const base = String(prompt || '');
    const block = String(diagnosticBlock || '');
    if (!block) return base;
    const answerIndex = base.lastIndexOf('\n\n<answer>');
    if (answerIndex !== -1) return `${base.slice(0, answerIndex)}${block}${base.slice(answerIndex)}`;
    const directive =
        /\n\n(?:Begin your output with the <answer> block|Write your answer inside a single <answer> block)/.exec(base);
    if (directive) return `${base.slice(0, directive.index)}${block}${base.slice(directive.index)}`;
    return block + '\n\n' + base;
}

function preserveVerifiedEntries(originalEntries, retryEntries, verifiedIndices) {
    if (!Array.isArray(retryEntries)) return Array.isArray(originalEntries) ? [...originalEntries] : [];
    const verified = new Set(Array.isArray(verifiedIndices) ? verifiedIndices : []);
    return retryEntries.map((entry, index) =>
        verified.has(index) && typeof originalEntries?.[index]?.text === 'string'
            ? { ...entry, text: originalEntries[index].text }
            : entry
    );
}

module.exports = {
    buildCrimeCorrections,
    buildRetryDiagnosticBlock,
    injectRetryDiagnostics,
    preserveVerifiedEntries,
    selectRetryFindings
};
