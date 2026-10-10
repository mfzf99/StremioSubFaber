// ─────────────────────────────────────────────────────────────────────────────
// PROVIDER REGISTRY — KATALOG PEMBEKAL LLM SEJAGAT (GROUND TRUTH)
// ─────────────────────────────────────────────────────────────────────────────
// [MANDAT BACKEND 2026-10-10] Registri berpusat bagi ekosistem pembekal LLM
// global. GeminiService (src/services/gemini.js) kini 100% Google Gemini Native;
// proksi persendirian (cth: Crazy Router) HANYA disokong melalui entri Custom
// (Base URL bebas + pilihan pintu manual) — tiada lagi logik hardcoded.
//
// Kontrak data (stabil untuk Frontend — passthrough read-only):
//   {
//     id:        string unik kecil (kunci config.providers)
//     label:     nama paparan
//     door:      'gemini-native' | 'openai-compatible' | 'anthropic-messages'
//     baseUrl:   URL API rasmi (dengan versi laluan)
//     isCustom:  boolean — true hanya untuk entri Custom/Proxy
//     docsUrl:   pautan dokumentasi rasmi (pilihan)
//   }
// ─────────────────────────────────────────────────────────────────────────────

const DOOR_TYPES = ['gemini-native', 'openai-compatible', 'anthropic-messages'];

const OFFICIAL_PROVIDERS = [
    {
        id: 'gemini',
        label: 'Google Gemini',
        door: 'gemini-native',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
        isCustom: false,
        docsUrl: 'https://ai.google.dev/gemini-api/docs'
    },
    {
        id: 'openai',
        label: 'OpenAI',
        door: 'openai-compatible',
        baseUrl: 'https://api.openai.com/v1',
        isCustom: false,
        docsUrl: 'https://platform.openai.com/docs/api-reference'
    },
    {
        id: 'anthropic',
        label: 'Anthropic Claude',
        door: 'anthropic-messages',
        baseUrl: 'https://api.anthropic.com/v1',
        isCustom: false,
        docsUrl: 'https://docs.anthropic.com/en/api/getting-started'
    },
    {
        id: 'deepseek',
        label: 'DeepSeek',
        door: 'openai-compatible',
        baseUrl: 'https://api.deepseek.com/v1',
        isCustom: false,
        docsUrl: 'https://api-docs.deepseek.com'
    },
    {
        id: 'groq',
        label: 'Groq',
        door: 'openai-compatible',
        baseUrl: 'https://api.groq.com/openai/v1',
        isCustom: false,
        docsUrl: 'https://console.groq.com/docs'
    },
    {
        id: 'mistral',
        label: 'Mistral AI',
        door: 'openai-compatible',
        baseUrl: 'https://api.mistral.ai/v1',
        isCustom: false,
        docsUrl: 'https://docs.mistral.ai'
    },
    {
        id: 'xai',
        label: 'xAI (Grok)',
        door: 'openai-compatible',
        baseUrl: 'https://api.x.ai/v1',
        isCustom: false,
        docsUrl: 'https://docs.x.ai'
    },
    {
        id: 'openrouter',
        label: 'OpenRouter',
        door: 'openai-compatible',
        baseUrl: 'https://openrouter.ai/api/v1',
        isCustom: false,
        docsUrl: 'https://openrouter.ai/docs'
    },
    {
        id: 'together',
        label: 'Together AI',
        door: 'openai-compatible',
        baseUrl: 'https://api.together.xyz/v1',
        isCustom: false,
        docsUrl: 'https://docs.together.ai'
    },
    {
        id: 'cerebras',
        label: 'Cerebras',
        door: 'openai-compatible',
        baseUrl: 'https://api.cerebras.ai/v1',
        isCustom: false,
        docsUrl: 'https://inference-docs.cerebras.ai'
    },
    {
        id: 'sambanova',
        label: 'SambaNova',
        door: 'openai-compatible',
        baseUrl: 'https://api.sambanova.ai/v1',
        isCustom: false,
        docsUrl: 'https://docs.sambanova.ai'
    },
    {
        id: 'perplexity',
        label: 'Perplexity',
        door: 'openai-compatible',
        baseUrl: 'https://api.perplexity.ai',
        isCustom: false,
        docsUrl: 'https://docs.perplexity.ai'
    },
    {
        id: 'moonshot',
        label: 'Moonshot / Kimi',
        door: 'openai-compatible',
        baseUrl: 'https://api.moonshot.cn/v1',
        isCustom: false,
        docsUrl: 'https://platform.moonshot.cn/docs'
    },
    {
        id: 'zhipu',
        label: 'Zhipu AI / GLM',
        door: 'openai-compatible',
        baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
        isCustom: false,
        docsUrl: 'https://open.bigmodel.cn/dev/api'
    },
    {
        id: 'qwen',
        label: 'Qwen / Alibaba DashScope',
        door: 'openai-compatible',
        baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
        isCustom: false,
        docsUrl: 'https://www.alibabacloud.com/help/en/model-studio'
    },
    {
        id: 'custom',
        label: 'Custom / Proxy',
        door: 'openai-compatible',
        baseUrl: '',
        isCustom: true,
        docsUrl: ''
    }
];

const PROVIDER_INDEX_BY_ID = new Map(OFFICIAL_PROVIDERS.map((provider) => [provider.id, provider]));

/**
 * Senarai penuh pembekal rasmi (snapshot baharu setiap panggilan supaya
 * pengguna tidak boleh mutasi konstan dalaman).
 * @returns {Array<object>} salinan senarai pembekal
 */
function getOfficialProviders() {
    return JSON.parse(JSON.stringify(OFFICIAL_PROVIDERS));
}

/**
 * Dapatkan entri pembekal mengikut id (cth: 'gemini', 'groq').
 * @param {string} id
 * @returns {object|null} salinan entri, atau null jika tidak wujud
 */
function getProviderById(id) {
    const entry = PROVIDER_INDEX_BY_ID.get(
        String(id || '')
            .trim()
            .toLowerCase()
    );
    return entry ? { ...entry } : null;
}

/**
 * Dapatkan URL asas rasmi pembekal. Pulangkan '' jika tiada.
 * @param {string} id
 * @returns {string}
 */
function getProviderBaseUrl(id) {
    const entry = getProviderById(id);
    return entry ? entry.baseUrl : '';
}

/**
 * Validasi pintu (door) pembekal. Entri Custom menerima mana-mana pintu sah
 * (pilihan manual pengguna); entri rasmi mesti sepadan dengan pintu berdaftar.
 * @param {string} id
 * @param {string} door
 * @returns {boolean}
 */
function isValidProviderDoor(id, door) {
    const normalized = String(door || '')
        .trim()
        .toLowerCase();
    if (!DOOR_TYPES.includes(normalized)) return false;
    const entry = getProviderById(id);
    if (!entry) return false;
    if (entry.isCustom) return true; // Custom: pintu manual dibenarkan
    return entry.door === normalized;
}

module.exports = {
    DOOR_TYPES,
    getOfficialProviders,
    getProviderById,
    getProviderBaseUrl,
    isValidProviderDoor
};
