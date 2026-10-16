// ─────────────────────────────────────────────────────────────────────────────
// MODEL CAPABILITY MAP — PUNCA TUNGGAL KEBENARAN PARAMETER PER-MODEL (v1.0)
// ─────────────────────────────────────────────────────────────────────────────
// [FASA 3 v3.9.46 — MANDAT OWNER 2026-10-15] Pemetaan berpusat daripada matriks
// Ground Truth 2026 (plans/trinity-params-ground-truth-2026.md §A) yang
// menentukan parameter mana yang sah, julat min/max, nilai lalai per-ejen
// Trinity (preflight / translation / secondary / inspector), dan kekangan
// eksklusif per model.
//
// Sumber: plans/trinity-params-ground-truth-2026.md (A1–A17) +
// plans/gemini-sampling-ground-truth-2026.md. SEBARANG perubahan mesti
// disertai kemas kini kedua-dua fail tersebut dan regression suite
// (src/utils/modelCapabilities-regression.test.js).
//
// KONTRAK API:
//   resolveCapabilityProfile(providerOrDoor, model) → profil keupayaan model
//   getAgentDefaultParams(agent, providerOrDoor, model) → lalai optimum ejen
//   sanitizeAgentParams(agent, params, providerOrDoor, model) → clamp + tapis
//   agentParamsDeviateFromDefault(agent, params, providerOrDoor, model) → bool
//
// AGEN: 'preflight' | 'translation' | 'secondary' | 'inspector'
// PINTU (door): 'gemini-native' | 'openai-compatible' | 'anthropic-messages'
//
// KEPUTUSAN OWNER #2 (SYARAT PROKSI): ID model legasi (deepseek-chat, gpt-4o,
// dll) TIDAK ditolak — ia dipetakan kepada profil generik pintu berkenaan
// kerana proksi pihak ketiga masih menggunakannya sebagai alias.
// ─────────────────────────────────────────────────────────────────────────────

const log = require('./logger');

const CAPABILITY_MAP_VERSION = '1.0.0';

const AGENTS = ['preflight', 'translation', 'secondary', 'inspector'];

// ── Parameter descriptor ringkas ────────────────────────────────────────────
// { min, max, default, fixed? (nilai terkunci — lain → error API), hidden?
//   (parameter tidak wujud bagi model ini), enum? ([nilai dibenarkan]) }
function param(min, max, def, extra = {}) {
    return { min, max, default: def, ...extra };
}

// ── A1. GOOGLE GEMINI (native) ──────────────────────────────────────────────
// Sempadan STRICT (changelog 21 Jul 2026): 3.6+, 3.5-flash-lite, alias
// -latest, 4+ → sampling STRIPPED; 3.0–3.5-flash (legacy) → sampling diterima
// (syor 1.0); 2.5 → full + thinkingBudget int; [KEPUTUSAN OWNER #1 v3.9.46]
// gemini-3.5-flash & gemini-3.7-flash DILAYAN SEBAGAI STRICT (server reroute
// → kelakuan strip walaupun nama legacy diterima).
const GEMINI_SAMPLING = param(0, 2, 0.3);
const GEMINI_TOP_P = param(0, 1, 0.95);
const GEMINI_THINKING_LEVEL_ENUM = ['disabled', 'minimal', 'low', 'medium', 'high'];
// [SEND-ALL UI PARITY v3.10.5] Penalty diisytiharkan dalam SEMUA profil
// bersampling — selari dengan trinity-agents.js (MP_FREQUENCY/PRESENCE_PENALTY
// mpParam(-2, 2, 0)). sanitizeAgentParams hanya meluluskan medan yang
// disenaraikan dalam profil; tanpa descriptor, nilai penalty dari UI Trinity
// dibuang senyap walaupun pintu provider menghantarnya (Send-All doctrine).
// Medan ini TIDAK bermakna API model menerima penalty (nota sampling tetap
// berkuasa) — ia hanya membenarkan nilai mengalir tanpa strip senyap.
const FREQUENCY_PENALTY = param(-2, 2, 0);
const PRESENCE_PENALTY = param(-2, 2, 0);

function geminiProfile(modelId) {
    const m = String(modelId || '')
        .trim()
        .toLowerCase();
    // 2.5 — full sampling + thinkingBudget integer (Pro min 128; 0=off; -1 dyn)
    if (/^gemini-2\.5/.test(m)) {
        return {
            family: 'gemini-2.5',
            parameters: {
                temperature: GEMINI_SAMPLING,
                topP: GEMINI_TOP_P,
                thinkingBudget: param(-1, 200000, -1),
                maxOutputTokens: param(1, 65535, 32768),
                frequencyPenalty: FREQUENCY_PENALTY,
                presencePenalty: PRESENCE_PENALTY
            },
            notes: []
        };
    }
    // [KEPUTUSAN OWNER #1] Reroute whitelist: 3.5-flash & 3.7-flash → STRICT.
    const rerouteStrict = m === 'gemini-3.5-flash' || m === 'gemini-3.7-flash';
    const minorMatch = m.match(/^gemini-3\.(\d+)/);
    const minor = minorMatch ? parseInt(minorMatch[1], 10) : /^gemini-3(?:-|$)/.test(m) ? 0 : null;
    const isStrict =
        rerouteStrict ||
        /^gemini-[4-9]/.test(m) ||
        /^gemini-(flash|flash-lite|pro)-latest$/.test(m) ||
        (minor !== null && (minor >= 6 || (minor === 5 && /flash-lite/.test(m))));
    if (isStrict) {
        return {
            family: 'gemini-3.x-strict',
            parameters: {
                // Sampling deprecated & diabaikan (HTTP 400 pada generasi akan datang)
                thinkingLevel: param(0, 0, 'medium', { enum: GEMINI_THINKING_LEVEL_ENUM }),
                maxOutputTokens: param(1, 65536, 32768),
                frequencyPenalty: FREQUENCY_PENALTY,
                presencePenalty: PRESENCE_PENALTY
            },
            notes: ['sampling-controlled', rerouteStrict ? 'server-reroute-stripped' : 'sampling-stripped-by-api']
        };
    }
    if (minor !== null) {
        // 3.x LEGACY (3.0 / 3.1 / 3.5-flash pra-reroute dilindungi oleh keputusan
        // #1 — semua 3.5-flash kini STRICT; cabang ini meliputi 3.0/3.1 sahaja).
        return {
            family: 'gemini-3.x-legacy',
            parameters: {
                temperature: GEMINI_SAMPLING,
                topP: GEMINI_TOP_P,
                thinkingLevel: param(0, 0, 'high', { enum: GEMINI_THINKING_LEVEL_ENUM }),
                maxOutputTokens: param(1, 65536, 32768),
                frequencyPenalty: FREQUENCY_PENALTY,
                presencePenalty: PRESENCE_PENALTY
            },
            notes: ['google-recommends-temperature-1.0']
        };
    }
    // 1.5 / 2.0 / gemma / tidak dikenali — pensampelan penuh, tiada thinking.
    return {
        family: 'gemini-legacy',
        parameters: {
            temperature: GEMINI_SAMPLING,
            topP: GEMINI_TOP_P,
            maxOutputTokens: param(1, 65535, 32768),
            frequencyPenalty: FREQUENCY_PENALTY,
            presencePenalty: PRESENCE_PENALTY
        },
        notes: []
    };
}

// ── A3. ANTHROPIC (messages door) ───────────────────────────────────────────
// Thinking ON → temp=1.0 & topP digugur (auto-compliance provider sedia ada).
// 3.5-era: tiada thinking. 5.5: adaptive always-on.
function anthropicProfile(modelId) {
    const m = String(modelId || '')
        .trim()
        .toLowerCase();
    const hasThinking =
        /claude-(3-7|opus-4|sonnet-4|haiku-4|fable-5|opus-5|sonnet-5|haiku-5)/.test(m) || !/claude/.test(m);
    const isAdaptiveAlways = /claude-(fable-5|opus-5|sonnet-5|haiku-5)/.test(m);
    return {
        family: isAdaptiveAlways ? 'anthropic-5.x-adaptive' : hasThinking ? 'anthropic-thinking' : 'anthropic-3.5',
        parameters: {
            temperature: param(0, 1, 0.3),
            topP: param(0, 1, 0.95),
            maxOutputTokens: param(1, 128000, 32768),
            ...(hasThinking ? { thinkingBudget: param(1024, 200000, 0) } : {}),
            frequencyPenalty: FREQUENCY_PENALTY,
            presencePenalty: PRESENCE_PENALTY
        },
        notes: hasThinking ? ['thinking-locks-temperature-1.0'] : []
    };
}

// ── A16. DEEPL — bukan LLM generatif; tiada sampling ────────────────────────
const DEEPL_PROFILE = {
    family: 'deepl',
    parameters: {
        modelType: param(0, 0, 'quality_optimized', { enum: ['quality_optimized'] }),
        formality: param(0, 0, 'default', { enum: ['default', 'less', 'more'] }),
        preserveFormatting: param(0, 0, true)
    },
    notes: ['no-llm-sampling']
};

// ── A8. MOONSHOT KIMI — sampling FIXED ──────────────────────────────────────
function kimiProfile(modelId) {
    const m = String(modelId || '')
        .trim()
        .toLowerCase();
    // kimi-k3 / k2.7: FIXED 1.0 / 0.95 (nilai lain → 400).
    if (/kimi-k3|kimi-k2\.7/.test(m)) {
        return {
            family: 'kimi-fixed-sampling',
            parameters: {
                temperature: param(1, 1, 1.0, { fixed: 1.0 }),
                topP: param(0.95, 0.95, 0.95, { fixed: 0.95 }),
                maxOutputTokens: param(1, 131072, 32768),
                frequencyPenalty: FREQUENCY_PENALTY,
                presencePenalty: PRESENCE_PENALTY
            },
            notes: ['fixed-sampling-temp-1.0-topP-0.95']
        };
    }
    // k2.6 / k2.5: temp mengikut mod (0.6 non-thinking / 1.0 thinking) —
    // guna 1.0 selamat; topP tetap FIXED 0.95.
    return {
        family: 'kimi-hybrid',
        parameters: {
            temperature: param(0, 1, 1.0),
            topP: param(0.95, 0.95, 0.95, { fixed: 0.95 }),
            maxOutputTokens: param(1, 131072, 32768),
            frequencyPenalty: FREQUENCY_PENALTY,
            presencePenalty: PRESENCE_PENALTY
        },
        notes: ['thinking-mode-temperature-1.0']
    };
}

// ── A2. OPENAI — keluarga reasoning menolak sampling; 5.2+ menyokong semula ─
function openaiProfile(modelId) {
    const m = String(modelId || '')
        .trim()
        .toLowerCase();
    // Reasoning models: o-series, gpt-5 (varian tanpa minor / '-mini'/'-nano'
    // suffix), gpt-5.1 → tiada sampling; reasoning_effort sahaja.
    // PERBAIKAN 2026-10-15: corak lama `^gpt-5($|[-.])` secara silap
    // menelan `gpt-5.5` (kelas `.` memadankan mana-mana aksara) — 5.2+
    // menyokong sampling semula (matriks A2 ground truth).
    const isReasoningOnly = /^o\d/.test(m) || /^gpt-5$/.test(m) || /^gpt-5-(?!5)/.test(m) || /^gpt-5\.1/.test(m);
    if (isReasoningOnly) {
        return {
            family: 'openai-reasoning-no-sampling',
            parameters: {
                reasoningEffort: param(0, 0, 'medium', { enum: ['low', 'medium', 'high'] }),
                maxOutputTokens: param(1, 128000, 32768)
            },
            notes: ['sampling-not-supported']
        };
    }
    // 5.2+ / 5.5 / 5.6 / 6: sampling disokong semula + reasoning_effort diperluas.
    const modern = /^gpt-(5\.[2-9]|5\.\d\d|6)/.test(m);
    return {
        family: modern ? 'openai-modern-sampling' : 'openai-legacy-alias',
        parameters: {
            temperature: param(0, 2, 0.3),
            topP: param(0, 1, 0.95),
            maxOutputTokens: param(1, 128000, 32768),
            ...(modern
                ? { reasoningEffort: param(0, 0, 'low', { enum: ['none', 'low', 'medium', 'high', 'xhigh'] }) }
                : {}),
            frequencyPenalty: FREQUENCY_PENALTY,
            presencePenalty: PRESENCE_PENALTY
        },
        notes: modern ? [] : ['legacy-alias-proxy-compatible']
    };
}

// ── Profil generik pintu (fallback selamat — proksi/legasi) ─────────────────
const DOOR_GENERIC_PROFILES = {
    'gemini-native': geminiProfile(''),
    'openai-compatible': {
        family: 'openai-compatible-generic',
        parameters: {
            temperature: param(0, 2, 0.3),
            topP: param(0, 1, 0.95),
            maxOutputTokens: param(1, 200000, 32768),
            reasoningEffort: param(0, 0, undefined, { enum: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] }),
            frequencyPenalty: FREQUENCY_PENALTY,
            presencePenalty: PRESENCE_PENALTY
        },
        notes: []
    },
    'anthropic-messages': anthropicProfile('')
};

// ── Resolusi profil mengikut provider id / door + nama model ────────────────
function resolveCapabilityProfile(providerOrDoor, modelId) {
    const key = String(providerOrDoor || '')
        .trim()
        .toLowerCase();
    const m = String(modelId || '')
        .trim()
        .toLowerCase();
    switch (key) {
        case 'gemini':
        case 'gemini-native':
            return geminiProfile(m);
        case 'anthropic':
        case 'anthropic-messages':
            return anthropicProfile(m);
        case 'deepl':
            return DEEPL_PROFILE;
        case 'moonshot':
            return m && !/kimi/.test(m) ? DOOR_GENERIC_PROFILES['openai-compatible'] : kimiProfile(m);
        case 'openai':
            return openaiProfile(m);
        // Custom / Proxy (A17): keupayaan ikut Format/Door + nama model ditaip.
        // [KEPUTUSAN OWNER #2] ID legasi dipetakan tanpa ralat.
        case 'custom':
        case 'custom_secondary':
        case 'openai-compatible': {
            if (/^gemini|^gemma/.test(m)) return geminiProfile(m);
            if (/^claude|^anthropic/.test(m)) return anthropicProfile(m);
            if (/kimi/.test(m)) return kimiProfile(m);
            if (/^gpt-|^o\d/.test(m)) return openaiProfile(m);
            if (/^glm/.test(m)) {
                // A9 Zhipu GLM: temp def 1.0 / topP 0.95; thinking kekal temp 1.0.
                return {
                    family: 'glm',
                    parameters: {
                        temperature: param(0, 1, 1.0),
                        topP: param(0, 1, 0.95),
                        maxOutputTokens: param(1, 131072, 32768),
                        frequencyPenalty: FREQUENCY_PENALTY,
                        presencePenalty: PRESENCE_PENALTY
                    },
                    notes: ['thinking-mode-temperature-1.0']
                };
            }
            if (/^deepseek/.test(m)) {
                // A4: sampling tidak disokong dalam mod thinking — deepseek-flash
                // default thinking ON → guna reasoning_effort sahaja.
                return {
                    family: 'deepseek-thinking',
                    parameters: {
                        maxOutputTokens: param(1, 384000, 32768)
                    },
                    notes: ['sampling-unsupported-in-thinking-mode']
                };
            }
            return DOOR_GENERIC_PROFILES['openai-compatible'];
        }
        default:
            // Provider lain (groq/mistral/xai/openrouter/together/cerebras/
            // sambanova/perplexity/qwen/zhipu) → pintu openai-compatible generik
            // (temp 0–2, topP 0–1; n=1; tiada topK — haram sejak v1.6.0).
            return DOOR_GENERIC_PROFILES['openai-compatible'];
    }
}

// ── B. NILAI LALAI OPTIMUM PER-EJEN (diperakui Owner 2026-10-15) ────────────
// Guna lalai generik sebagai asas, kemudian tapis melalui profil model.
const AGENT_TUNING_BASE = {
    // Preflight (Glosari/Bible): ekstraksi faktual deterministik.
    preflight: { temperature: 0.0, topP: 0.9, reasoningEffort: 'medium', thinkingLevel: 'medium' },
    // Translation: kreatif terkawal, elak overthinking.
    translation: { temperature: 0.3, topP: 0.95, reasoningEffort: 'low', thinkingLevel: 'low' },
    // Secondary Fallback: sandaran — ikut profil Translation.
    secondary: { temperature: 0.3, topP: 0.95, reasoningEffort: 'low', thinkingLevel: 'low' },
    // Inspector: audit deterministik.
    inspector: { temperature: 0.0, topP: 0.9, reasoningEffort: 'low', thinkingLevel: 'low' }
};

/**
 * Lalai optimum ejen bagi gabungan provider/door + model. Hanya parameter yang
 * DISOKONG oleh profil dikembalikan (parameter lain disembunyikan).
 * @param {string} agent - 'preflight' | 'translation' | 'secondary' | 'inspector'
 * @param {string} providerOrDoor
 * @param {string} modelId
 * @returns {object} params lalai ejen (subset sah keupayaan model)
 */
function getAgentDefaultParams(agent, providerOrDoor, modelId) {
    const profile = resolveCapabilityProfile(providerOrDoor, modelId);
    const tuning = AGENT_TUNING_BASE[agent] || AGENT_TUNING_BASE.translation;
    const defaults = {};
    for (const [name, descriptor] of Object.entries(profile.parameters)) {
        if (descriptor.fixed !== undefined) {
            defaults[name] = descriptor.fixed;
            continue;
        }
        if (tuning[name] !== undefined && tuning[name] !== null) {
            defaults[name] = tuning[name];
        } else if (descriptor.default !== undefined) {
            defaults[name] = descriptor.default;
        }
    }
    return defaults;
}

/**
 * Sanitasi params ejen: clamp kepada julat keupayaan, kunci nilai fixed, buang
 * parameter yang tidak disokong model (degrade senyap + debug-log — bukan crash).
 * @param {string} agent
 * @param {object} params - params mentah pengguna
 * @param {string} providerOrDoor
 * @param {string} modelId
 * @returns {object} params selamat (subset keupayaan model)
 */
function sanitizeAgentParams(agent, params, providerOrDoor, modelId) {
    const profile = resolveCapabilityProfile(providerOrDoor, modelId);
    const defaults = getAgentDefaultParams(agent, providerOrDoor, modelId);
    const raw = params && typeof params === 'object' ? params : {};
    const out = {};
    for (const [name, descriptor] of Object.entries(profile.parameters)) {
        // Nilai FIXED (cth: kimi-k3 temp 1.0) — sentiasa dikunci; percubaan lain
        // di-clamp kembali secara senyap (API akan tolak 400 jika dihantar).
        if (descriptor.fixed !== undefined) {
            out[name] = descriptor.fixed;
            if (raw[name] !== undefined && raw[name] !== descriptor.fixed) {
                log.debug(
                    () =>
                        `[ModelCapabilities] ${modelId || '(default)'} locks ${name}=${descriptor.fixed}; user value ${raw[name]} clamped`
                );
            }
            continue;
        }
        if (raw[name] === undefined || raw[name] === null || raw[name] === '') continue;
        if (descriptor.enum) {
            const allowed = descriptor.enum;
            const val = typeof raw[name] === 'string' ? raw[name].trim().toLowerCase() : raw[name];
            if (allowed.includes(val)) out[name] = val;
            else
                log.debug(
                    () => `[ModelCapabilities] ${modelId || '(default)'} rejects ${name}=${raw[name]} (enum); dropped`
                );
            continue;
        }
        if (typeof raw[name] === 'boolean') {
            out[name] = raw[name] === true;
            continue;
        }
        const parsed = typeof raw[name] === 'number' ? raw[name] : parseFloat(raw[name]);
        if (!Number.isFinite(parsed)) continue;
        out[name] = Math.max(descriptor.min, Math.min(descriptor.max, parsed));
    }
    // Pastikan medan krusial bukan kosong (fallback ke lalai ejen).
    for (const name of Object.keys(defaults)) {
        if (out[name] === undefined) out[name] = defaults[name];
    }
    return out;
}

/**
 * Adakah params ejen menyimpang daripada lalai provider/ejen? (Pencetus
 * bypassCache automatik — konsisten logik keselamatan pangkalan data sedia ada.)
 * @param {string} agent
 * @param {object} params
 * @param {string} providerOrDoor
 * @param {string} modelId
 * @returns {boolean}
 */
function agentParamsDeviateFromDefault(agent, params, providerOrDoor, modelId) {
    if (!params || typeof params !== 'object' || Object.keys(params).length === 0) return false;
    const defaults = getAgentDefaultParams(agent, providerOrDoor, modelId);
    const profile = resolveCapabilityProfile(providerOrDoor, modelId);
    for (const [name, value] of Object.entries(params)) {
        const descriptor = profile.parameters[name];
        if (!descriptor) return true; // parameter tidak disokong = deviasi eksplisit
        if (descriptor.fixed !== undefined) continue; // fixed sentiasa sama
        if (defaults[name] !== value) return true;
    }
    return false;
}

module.exports = {
    CAPABILITY_MAP_VERSION,
    AGENTS,
    resolveCapabilityProfile,
    getAgentDefaultParams,
    sanitizeAgentParams,
    agentParamsDeviateFromDefault
};
