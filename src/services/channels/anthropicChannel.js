/**
 * Anthropic Channel — pintu Anthropic Messages bagi Trinity (Tri-Door Fasa C, 2026-10-10)
 *
 * Mandat owner Fasa C:
 *   - `system` WAJIB medan top-level (format Anthropic Messages rasmi)
 *   - `max_tokens` MANDATORI pada setiap request (keperluan API Anthropic)
 *   - Kekalkan kekangan temperature/thinking provider (temperature=1 bila
 *     thinking aktif; top_p digugurkan pada konflik — auto-compliance retry
 *     terbina dalam AnthropicProvider)
 *   - non-stream default (kelulusan owner #4 — stream eksklusif rootsys/Caddy)
 */

const AnthropicProvider = require('../providers/anthropic');
const { FORMAT_ANTHROPIC } = require('./keyDetector');

// Anthropic menghadkan max_tokens pada 64000 (klau/claudette era); nilai
// mandat provider 65536 > siling API — clamp kepada siling sah max.
const ANTHROPIC_MAX_TOKENS_CAP = 64000;

/**
 * Bina payload /v1/messages (non-stream) — bentuk tulen untuk ujian.
 *
 * @param {Object} input
 * @param {string} input.model - Model Claude (cth. 'claude-sonnet-4')
 * @param {string} input.userPrompt - Kandungan dinamik (role user)
 * @param {string} [input.systemPrompt] - Arahan statik → system top-level
 * @param {number} [input.maxTokens] - MANDATORI (lalai 64000, clamp ke cap)
 * @param {number} [input.temperature]
 * @returns {{url:string, body:Object, headers:Object}}
 */
function buildRequest({
    model,
    userPrompt,
    systemPrompt = '',
    maxTokens = ANTHROPIC_MAX_TOKENS_CAP,
    temperature = undefined
} = {}) {
    const safeMaxTokens = Math.max(
        1024,
        Math.min(Number(maxTokens) || ANTHROPIC_MAX_TOKENS_CAP, ANTHROPIC_MAX_TOKENS_CAP)
    );

    const body = {
        model: String(model || '').trim() || 'claude-sonnet-4',
        max_tokens: safeMaxTokens, // MANDATORI — Anthropic menolak request tanpanya
        messages: [
            {
                role: 'user',
                content: String(userPrompt || '')
            }
        ]
    };
    if (systemPrompt && String(systemPrompt).trim()) {
        // Format rasmi: system ialah string top-level, BUKAN mesej dalam array messages.
        body.system = String(systemPrompt);
    }
    if (temperature !== undefined && Number.isFinite(Number(temperature))) {
        body.temperature = Number(temperature);
    }

    return {
        url: 'https://api.anthropic.com/v1/messages',
        body,
        headers: {
            'x-api-key': 'CHANNEL_KEY_PLACEHOLDER',
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
        }
    };
}

/**
 * Bina transport AnthropicProvider duck-typed untuk delegasi AgentB.
 * translateSubtitle() terbina dalam split sempadan + auto-compliance retry
 * (isThinkingTemperatureConstraint → temperature=1 + drop top_p).
 *
 * @param {Object} options - Constructor options AgentBInspector
 * @returns {AnthropicProvider}
 */
function buildProvider(options = {}) {
    const model = String(options.model || options.preflightModel || 'claude-sonnet-4').trim();
    return new AnthropicProvider({
        apiKey: options.apiKey || '',
        model,
        providerName: 'anthropic',
        // maxOutputTokens provider melebihi cap API — clamp bawah siling sah.
        maxOutputTokens: ANTHROPIC_MAX_TOKENS_CAP,
        // Fail fast — retry dikendalikan _callWithFailover AgentB (pariti
        // maxRetries:0 dengan openaiChannel/geminiChannel).
        maxRetries: 0,
        enableJsonOutput: false, // kesahan JSON oleh parser tahan lasak AgentB
        // thinking adaptive mengikut laluan provider; temperature default
        // dikawal provider (kekangan temperature/thinking dikekalkan).
        thinking: options.thinking !== undefined ? options.thinking : { type: 'adaptive' }
    });
}

module.exports = {
    format: FORMAT_ANTHROPIC,
    ANTHROPIC_MAX_TOKENS_CAP,
    buildRequest,
    buildProvider
};
