/**
 * Canonical HTML escaping — Single Source of Truth (Mandat P1 F4, 2026-11-10).
 *
 * Replaces 6 divergent ad-hoc implementations across the page generators and
 * the inline `escapeHtmlClient` copies. Contract:
 *   - Escapes `&`, `<`, `>`, `"` and `'` (single quote → `&#039;`).
 *   - `null` / `undefined` → '' (never the literal strings 'null'/'undefined').
 *   - Numbers and booleans are stringified, so `0` → '0' (never dropped by a
 *     falsy guard like `if (!text) return ''`).
 *   - `&` is escaped first so existing entities are not re-interpreted.
 *
 * This is the ONLY implementation the generators and inline client copies
 * should delegate to. Entity strings are assembled from char codes so the
 * transport channel can never normalise them into raw characters.
 */

const AMP = String.fromCharCode(38);
const ENT_AMP = AMP + 'amp;';
const ENT_LT = AMP + 'lt;';
const ENT_GT = AMP + 'gt;';
const ENT_QUOT = AMP + 'quot;';

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, ENT_AMP)
        .replace(/</g, ENT_LT)
        .replace(/>/g, ENT_GT)
        .replace(/"/g, ENT_QUOT)
        .replace(/'/g, '&#039;');
}

// Client-side mirror used by the inline `escapeHtmlClient` copies. Identical
// contract and identical output as `escapeHtml`, delivered as source text so
// generators can inline it into their `<script>` blocks.
const ESCAPE_HTML_CLIENT_SOURCE = `const escapeHtmlClient = (value) => {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, ${JSON.stringify(ENT_AMP)})
        .replace(/</g, ${JSON.stringify(ENT_LT)})
        .replace(/>/g, ${JSON.stringify(ENT_GT)})
        .replace(/"/g, ${JSON.stringify(ENT_QUOT)})
        .replace(/'/g, '&#039;');
};`;

module.exports = { escapeHtml, ESCAPE_HTML_CLIENT_SOURCE };
