// Bulk Key Import — zero-network, pure-regex parser for Gemini API keys.
//
// Security guarantees:
//  - ZERO network calls. This module never performs fetch()/XHR.
//  - ZERO DOM access. parseBulkKeys() is pure string-in / array-out.
//  - ZERO persistence. Keys stay in memory / DOM only until the normal Save flow
//    posts the whole config to /api/update-session (encrypted AES-256-GCM at rest).
//  - Keys are masked for UI preview so full values are never written to innerHTML
//    in plaintext, limiting shoulder-surfing and log-scrape exposure.
//
// The module is environment-agnostic: it attaches to window.SubMakerBulkKeyImport
// in the browser and to module.exports under Node (for regression tests).
(function (root) {
    'use strict';

    /**
     * Key format matchers. Token-scan regexes: any character not part of the
     * token alphabet (letters/digits/_/-, plus the literal "." anchor in the
     * "google-new" prefix) terminates the token. This means numbered lists
     * ("1. AIzaSy..."), commas, tabs, JSON arrays, quotes etc. are all safely
     * ignored without any line-splitting pre-processing.
     *
     * IMPORTANT: do not add trailing / start anchors (^/$) — these are global
     * token scanners.
     */
    const KEY_PATTERNS = [
        // Legacy Google API key: "AIzaSy" + 33 chars of [A-Za-z0-9_-] = 39 chars total.
        { type: 'google-legacy', re: /\bAIzaSy[A-Za-z0-9_-]{33}\b/g },
        // New Google API key format (2024+): anchored on the "AQ.Ab8" literal prefix,
        // variable length suffix. \b before "AQ" and the literal dot ensure we don't
        // match inside unrelated base64 blobs.
        { type: 'google-new', re: /\bAQ\.Ab8[A-Za-z0-9_-]{35,}\b/g },
        // Crazy Router OpenAI-compatible proxy key. User typically has ONE of these
        // (covers all models offered by the router).
        { type: 'crazyrouter', re: /\bsk-[A-Za-z0-9]{32,64}\b/g }
    ];

    /**
     * Parse arbitrary raw text and extract valid-looking API keys.
     *
     * @param {string} rawText - Pasted text in any format (numbered lines, CSV, JSON, prose).
     * @param {object} [opts]
     * @param {string[]} [opts.existingKeys] - Keys already present in the UI. Any occurrence
     *                                          of these in the paste is counted in
     *                                          stats.duplicatesExisting and excluded from
     *                                          the returned keys (idempotent re-import).
     * @param {number}   [opts.maxKeys]      - Hard cap on returned keys. Extra matches are
     *                                          dropped and stats.truncated is set.
     * @returns {{ keys: string[], stats: {
     *     scanned: boolean,
     *     duplicatesInText: number,
     *     duplicatesExisting: number,
     *     truncated: boolean,
     *     byType: { 'google-legacy': number, 'google-new': number, 'crazyrouter': number }
     * }}}
     */
    function parseBulkKeys(rawText, opts) {
        const options = opts || {};
        const text = String(rawText == null ? '' : rawText);
        const existing = new Set(
            Array.isArray(options.existingKeys)
                ? options.existingKeys
                    .map(k => (typeof k === 'string' ? k.trim() : ''))
                    .filter(Boolean)
                : []
        );
        const maxKeys = Number.isFinite(options.maxKeys) ? Math.max(0, options.maxKeys) : Infinity;

        const keys = [];
        const seen = new Set();
        const stats = {
            scanned: true,
            duplicatesInText: 0,
            duplicatesExisting: 0,
            truncated: false,
            byType: { 'google-legacy': 0, 'google-new': 0, 'crazyrouter': 0 }
        };

        if (!text) {
            return { keys, stats };
        }

        // Walk each pattern across the whole text. NOTE: we deliberately DO NOT
        // bail out of the outer loop when maxKeys is hit so duplicate statistics
        // remain accurate; extra keys simply aren't recorded.
        for (const { type, re } of KEY_PATTERNS) {
            // Reset lastIndex explicitly because the regexes are global and the
            // module may be reused across calls.
            re.lastIndex = 0;
            let match;
            while ((match = re.exec(text)) !== null) {
                const key = match[0];

                if (seen.has(key)) {
                    stats.duplicatesInText++;
                    continue;
                }
                if (existing.has(key)) {
                    // Count each *unique* duplicate vs UI only once so repeated
                    // pastes of the same key don't inflate the counter.
                    seen.add(key);
                    stats.duplicatesExisting++;
                    continue;
                }

                seen.add(key);
                if (keys.length >= maxKeys) {
                    stats.truncated = true;
                    // Keep scanning purely for duplicate-stat accuracy.
                    continue;
                }
                stats.byType[type]++;
                keys.push(key);
            }
        }

        return { keys, stats };
    }

    /**
     * Mask an API key for safe display in the preview pane.
     * Shows at most the first 8 and last 4 characters, e.g. "AIzaSyAd••••••••DI4w".
     *
     * @param {string} key
     * @returns {string}
     */
    function maskKey(key) {
        const s = String(key == null ? '' : key);
        if (s.length <= 12) {
            return '•'.repeat(s.length);
        }
        const middle = Math.min(8, s.length - 12);
        return s.slice(0, 8) + '•'.repeat(middle) + s.slice(-4);
    }

    const api = { parseBulkKeys, maskKey, KEY_PATTERNS };

    // Node export (regression tests) — guarded so the browser path is unaffected.
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
    // Browser export.
    root.SubMakerBulkKeyImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
