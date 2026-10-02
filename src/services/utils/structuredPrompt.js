/**
 * Structured Prompt Boundary (Agent A Prompt Rebuild v2, 2026-09-29)
 *
 * SubFaber's Agent A prompt is split into a STATIC system portion (Role,
 * Priority, Rules, Craft, Few-shot, Output Format — identical every batch,
 * cacheable) and a DYNAMIC user portion (per-batch context Bible + <input> +
 * <answer> anchor). To keep the existing single-string contract that flows
 * through cache keys, token counting, retry paths and the provider fallback
 * chain UNCHANGED, the two portions are joined with a sentinel boundary and
 * only split apart at the API boundary (each provider's buildUserPrompt).
 *
 * FIX: previously buildUserPrompt set `userPrompt = systemPrompt` for
 * self-contained XML prompts, so the ENTIRE instruction block was sent twice
 * (once as user content, once as systemInstruction) — doubling input tokens
 * and blurring instruction vs data. The split sends static instructions ONCE
 * as systemInstruction and only the dynamic data as user content.
 *
 * Backward compatibility: a prompt string WITHOUT the boundary marker
 * (legacy custom prompts, non-SubFaber callers) returns null from
 * splitStructuredPrompt(), so callers keep their original behaviour.
 */

// Sentinel unlikely to appear in any subtitle text or instruction.
const SUBFABER_PROMPT_BOUNDARY = '<<<SUBFABER_SYSTEM_USER_BOUNDARY>>>';

/**
 * Split a combined structured prompt into { system, user }.
 * @param {string} prompt - Combined prompt possibly containing the boundary.
 * @returns {{system:string, user:string}|null} null when not structured.
 */
function splitStructuredPrompt(prompt) {
    const str = String(prompt || '');
    const idx = str.indexOf(SUBFABER_PROMPT_BOUNDARY);
    if (idx === -1) return null;
    return {
        system: str.slice(0, idx).replace(/\s+$/, ''),
        // Preserve the trailing anchor exactly (do NOT trim the end — the prefill
        // anchor `<s id="N">` must survive verbatim for the parser's scrubber).
        user: str.slice(idx + SUBFABER_PROMPT_BOUNDARY.length).replace(/^\s+/, '')
    };
}

/**
 * Strip the boundary marker from a prompt (defensive fallback for providers
 * that do not split — never leak the sentinel into a live prompt).
 * @param {string} prompt
 * @returns {string}
 */
function stripStructuredBoundary(prompt) {
    const str = String(prompt || '');
    if (!str.includes(SUBFABER_PROMPT_BOUNDARY)) return str;
    // Join the two halves back with a blank line so a non-splitting provider
    // still receives a coherent single prompt.
    return str
        .split(SUBFABER_PROMPT_BOUNDARY)
        .map((s) => s.trim())
        .filter(Boolean)
        .join('\n\n');
}

module.exports = {
    SUBFABER_PROMPT_BOUNDARY,
    splitStructuredPrompt,
    stripStructuredBoundary
};
