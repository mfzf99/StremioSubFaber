/**
 * Trinity Agents UI — Modular Trinity Cards + Dual Mode Toggle (Fasa E, 2026-10-10)
 * Reka bentuk semula: Provider Registry Integration + Smart Visibility
 *
 * Reka bentuk:
 *   - DOM dibina programatik (defensif penuh, null-check ketat per peraturan #4).
 *   - Input legasi #geminiApiKey DIPETAHILKAN (tersembunyi) — kontrak
 *     penyimpanan backend (currentConfig.geminiApiKey) kekal utuh.
 *   - Blok konfigurasi bersih `trinity` + `agentInspector` dihantar melalui
 *     collectConfig hook sedia ada tanpa memecahkan laluan parseConfig.
 *   - Provider Registry: panggil GET /api/providers/registry semasa mount;
 *     fallback statik jika rangkaian gagal (UI tidak tergantung).
 *   - Smart Visibility: Base URL & Format/Door hanya dipaparkan untuk
 *     Custom/Proxy; pembekal rasmi menyembunyikan tetapan teknikal.
 *   - Rehydration: nilai tersimpan dipulihkan tanpa stale-value/race.
 *
 * Kontrak eksport (dipanggil config.js):
 *   window.TrinityAgents = { mount, collectConfigPatch, rehydrate }
 */
(function () {
    'use strict';

    var MODE_BASIC = 'basic';
    var MODE_PRO = 'pro';

    // Pintu protokol backend (door)
    var DOOR_TYPES = {
        GEMINI: 'gemini-native',
        OPENAI: 'openai-compatible',
        ANTHROPIC: 'anthropic-messages'
    };

    // Pemetaan door → format legacy keyDetector/agentInspector ('gemini'|'openai'|'anthropic').
    // [INTEGRATION AUDIT 2026-10-10] Backend VALID_FORMATS (keyDetector.js) dan
    // enum agentInspector.format hanya menerima nilai pendek ini — nilai door penuh
    // (cth 'gemini-native') akan dibuang senyap oleh normalizeFormatOverride.
    var DOOR_TO_FORMAT = {
        'gemini-native': 'gemini',
        'openai-compatible': 'openai',
        'anthropic-messages': 'anthropic'
    };

    function doorToFormat(door) {
        return DOOR_TO_FORMAT[door] || 'openai';
    }

    // Fallback statik jika GET /api/providers/registry gagal (UI tidak tergantung)
    var FALLBACK_PROVIDERS = [
        { id: 'gemini', label: 'Google Gemini', door: DOOR_TYPES.GEMINI, baseUrl: '', isCustom: false },
        { id: 'openai', label: 'OpenAI', door: DOOR_TYPES.OPENAI, baseUrl: '', isCustom: false },
        { id: 'anthropic', label: 'Anthropic Claude', door: DOOR_TYPES.ANTHROPIC, baseUrl: '', isCustom: false },
        { id: 'deepseek', label: 'DeepSeek', door: DOOR_TYPES.OPENAI, baseUrl: '', isCustom: false },
        { id: 'groq', label: 'Groq', door: DOOR_TYPES.OPENAI, baseUrl: '', isCustom: false },
        { id: 'mistral', label: 'Mistral AI', door: DOOR_TYPES.OPENAI, baseUrl: '', isCustom: false },
        { id: 'xai', label: 'xAI (Grok)', door: DOOR_TYPES.OPENAI, baseUrl: '', isCustom: false },
        { id: 'openrouter', label: 'OpenRouter', door: DOOR_TYPES.OPENAI, baseUrl: '', isCustom: false },
        { id: 'together', label: 'Together AI', door: DOOR_TYPES.OPENAI, baseUrl: '', isCustom: false },
        { id: 'cerebras', label: 'Cerebras', door: DOOR_TYPES.OPENAI, baseUrl: '', isCustom: false },
        { id: 'sambanova', label: 'SambaNova', door: DOOR_TYPES.OPENAI, baseUrl: '', isCustom: false },
        { id: 'perplexity', label: 'Perplexity', door: DOOR_TYPES.OPENAI, baseUrl: '', isCustom: false },
        { id: 'moonshot', label: 'Moonshot / Kimi', door: DOOR_TYPES.OPENAI, baseUrl: '', isCustom: false },
        { id: 'zhipu', label: 'Zhipu AI / GLM', door: DOOR_TYPES.OPENAI, baseUrl: '', isCustom: false },
        { id: 'qwen', label: 'Qwen / Alibaba DashScope', door: DOOR_TYPES.OPENAI, baseUrl: '', isCustom: false },
        { id: 'custom', label: 'Custom / Proxy', door: DOOR_TYPES.OPENAI, baseUrl: '', isCustom: true }
    ];

    // Katalog model statik per pintu (fallback bila API tidak mengembalikan senarai)
    var MODEL_CATALOG = {
        'gemini-native': ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
        'anthropic-messages': ['claude-sonnet-4', 'claude-opus-4.1', 'claude-haiku-4.5'],
        'openai-compatible': ['deepseek-v4-pro', 'deepseek-v4.1-flash', 'kimi-k3', 'glm-5.3', 'gpt-5-mini', 'qwen3-max']
    };

    // Katalog model per provider id (fallback bila API tidak mengembalikan senarai)
    var PROVIDER_MODEL_CATALOG = {
        gemini: ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
        openai: ['gpt-5-mini', 'gpt-4.1-mini', 'gpt-4o-mini'],
        anthropic: ['claude-sonnet-4', 'claude-opus-4.1', 'claude-haiku-4.5'],
        deepseek: ['deepseek-v4-pro', 'deepseek-v4.1-flash', 'deepseek-reasoner'],
        groq: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
        mistral: ['mistral-large-latest', 'mistral-small-latest', 'codestral-latest'],
        xai: ['grok-4', 'grok-3-mini-beta', 'grok-2-vision-1212'],
        openrouter: ['deepseek-v4-pro', 'deepseek-v4.1-flash', 'kimi-k3', 'glm-5.3', 'qwen3-max'],
        together: ['deepseek-v4-pro', 'deepseek-v4.1-flash', 'llama-3.3-70b'],
        cerebras: ['llama-3.3-70b', 'qwen-2.5-coder-32b'],
        sambanova: ['llama-3.3-70b', 'llama-3.1-405b'],
        perplexity: ['sonar', 'sonar-pro', 'sonar-reasoning'],
        moonshot: ['kimi-k3', 'kimi-k2-instruct', 'moonshot-v1-auto'],
        zhipu: ['glm-5.3', 'glm-4.5-air', 'glm-4-plus'],
        qwen: ['qwen3-max', 'qwen3-coder-480b', 'qwen-plus-latest']
    };

    // Ikon SVG 32×32 (stroke currentColor) — gaya sama dengan .card-icon kad utama.
    var AGENT_ICON_PATHS = {
        preflight:
            '<path d="M8 6h12l4 4v16H8z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/><path d="M12 16h8M12 20h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
        translation:
            '<path d="M5 9h13M11 6v3M8 9c1 4 4 7 8 8" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M16 26l5-11 5 11M18 22h6" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>',
        inspector:
            '<circle cx="14" cy="14" r="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="M19 19l7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'
    };

    var AGENTS = [
        {
            key: 'preflight',
            title: 'Agent Preflight',
            subtitle: 'Phase 0 — builds the context Bible (terms, characters, credits) before translation',
            description:
                'Builds the context Bible (terms, characters, credits) before translation starts. Output is passed to Agent Translation.',
            configPath: 'trinity.preflight'
        },
        {
            key: 'translation',
            // [TOTAL UNLOCK FASA 2] Duplikasi deskripsi dibuang (subtitle ≠
            // description) — deskripsi kini fokus tingkah laku, bukan ulangan.
            title: 'Agent Translation',
            subtitle: 'Core translation engine (batch XML → SRT)',
            description:
                'Processes each batch through the active provider and uses the Bible from Preflight for context.',
            configPath: 'trinity.translation'
        },
        {
            key: 'inspector',
            title: 'Agent Inspector',
            subtitle: 'Phase 1 — per-batch semantic audit (split/merge/drop/phantom crimes)',
            description:
                'Semantic audit of each batch after translation: detects split, merge, drop and phantom entries.',
            configPath: 'trinity.inspector'
        }
    ];

    // --- Utiliti kecil ---

    function $(id) {
        return document.getElementById(id);
    }

    function createEl(tag, className, text) {
        var el = document.createElement(tag);
        if (className) el.className = className;
        if (text !== undefined) el.textContent = text;
        return el;
    }

    function detectFormatFromKey(rawKey) {
        var k = String(rawKey || '').trim();
        if (!k) return null;
        if (k.startsWith('AIza')) return 'gemini';
        if (k.startsWith('sk-ant-')) return 'anthropic';
        return 'openai';
    }

    // [LOCK/EYE ICONS v3.9.24] Togol penglihatan kunci — semasa medan
    // bertopeng (password, hidden=true) papar IKON MANGGA (Lock); semasa
    // medan dibuka (text, hidden=false) papar IKON MATA (Eye). Stroke
    // currentColor supaya seiring warna teks butang (gaya legasi SubFaber).
    function eyeIconSvg(hidden) {
        var eye =
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
        var lock =
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>';
        return hidden ? lock : eye;
    }

    function formatBadgeMeta(format) {
        if (format === 'gemini') return { label: 'Google Gemini Native', tone: 'blue' };
        if (format === 'anthropic') return { label: 'Anthropic Messages', tone: 'orange' };
        if (format === 'openai') return { label: 'OpenAI-Compatible', tone: 'green' };
        return { label: 'No key', tone: 'muted' };
    }

    // --- Provider Registry ---

    var _registryCache = null;
    var _registryPromise = null;
    // [BUG FIX v3.9.41] Hook diregistri oleh mount(): membenarkan applyAgentValues()
    // (dipanggil dari config.js sebagai rehydrate) memaksa mount() membina semula
    // kad + segmented UI untuk mod baharu TANPA kehilangan nilai cfg sebenar.
    // Sebelum ini applyAgentValues() early-return selepas dispatch 'change',
    // bergantung pada renderCards() yang membaca global currentConfig yang mungkin
    // belum siap semasa muat halaman — punca setting Trinity hilang pada
    // reconfigure (config hash sedia ada).
    var modelSyncHook = null;
    // Pengawal re-entrancy: menghalang gelung tak terhingga apabila hook/change
    // handler memanggil applyAgentValues() semula semasa sync mod.
    var _rehydratingMode = false;
    // [BUG FIX v3.9.43] Cache cfg TERAKHIR yang dilihat oleh modul ini (melalui
    // mount()/rehydrate()). Jaring keselamatan jika getter LIVE
    // window.__SUB__getCurrentConfig tidak tersedia (cth modul dimuat berasingan).
    var _lastKnownConfig = null;

    function fetchProviderRegistry() {
        if (_registryPromise) return _registryPromise;
        _registryPromise = fetch('/api/providers/registry', { method: 'GET', headers: { Accept: 'application/json' } })
            .then(function (resp) {
                if (!resp.ok) throw new Error('HTTP ' + resp.status);
                return resp.json();
            })
            .then(function (data) {
                if (data && data.success && Array.isArray(data.providers) && data.providers.length) {
                    _registryCache = data.providers;
                    return _registryCache;
                }
                throw new Error('Invalid registry payload');
            })
            .catch(function (err) {
                console.warn('[Trinity] Provider registry fetch failed, using static fallback:', err.message);
                _registryCache = FALLBACK_PROVIDERS;
                return _registryCache;
            });
        return _registryPromise;
    }

    function getProviderById(providers, id) {
        if (!providers || !Array.isArray(providers)) return null;
        var lower = String(id || '').toLowerCase();
        for (var i = 0; i < providers.length; i++) {
            if (providers[i].id === lower) return providers[i];
        }
        return null;
    }

    function getProviderDoor(provider) {
        if (!provider) return DOOR_TYPES.OPENAI;
        return provider.door || DOOR_TYPES.OPENAI;
    }

    function isCustomProvider(provider) {
        return provider && provider.isCustom === true;
    }

    // [BUG FIX v3.9.44] Door BERKESAN satu kad: pilihan Format/Door eksplisit
    // (Custom/Proxy) menang; 'auto' → door lalai registry pembekal. Digunakan
    // oleh snapshot + collectConfigPatch supaya medan `door` dalam payload
    // SENTIASA sepadan dengan pilihan dropdown pengguna (bukan door lalai).
    function resolveEffectiveDoor(providerEntry, fmtValue) {
        var baseDoor = getProviderDoor(providerEntry);
        if (isCustomProvider(providerEntry) && fmtValue && fmtValue !== 'auto') return fmtValue;
        return baseDoor;
    }

    // --- Pembina kad modular (reka bentuk semula Fasa E) ---

    // [BUG FIX v3.9.44] Parameter `mode` dibuang: kad dibina SEKALI untuk semua
    // ejen (mod ditentukan oleh visibiliti, bukan pembinaan semula DOM).
    function buildAgentCard(agent) {
        var card = createEl('div', 'trinity-agent-card');
        card.dataset.agent = agent.key;

        // Header berstruktur sama dengan kad utama: .card-header > .card-title-group
        // (.card-icon SVG + tajuk + keterangan).
        var head = createEl('div', 'card-header trinity-agent-head');
        var titleGroup = createEl('div', 'card-title-group');

        var icon = createEl('div', 'card-icon');
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML =
            '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">' +
            (AGENT_ICON_PATHS[agent.key] || '') +
            '</svg>';
        titleGroup.appendChild(icon);

        var titles = createEl('div', 'trinity-agent-titles');
        titles.appendChild(createEl('h3', 'section-title trinity-agent-title', agent.title));
        titles.appendChild(createEl('p', 'section-description trinity-agent-sub', agent.subtitle));
        titleGroup.appendChild(titles);
        head.appendChild(titleGroup);

        // Butang lipat di penjuru kanan header — struktur sama dengan kad anak
        // Languages (Source/Target): .card-header > .collapse-btn (data-collapse).
        var collapseBtn = createEl('button', 'collapse-btn');
        collapseBtn.type = 'button';
        collapseBtn.setAttribute('data-collapse', agent.key);
        collapseBtn.setAttribute('aria-expanded', 'true');
        collapseBtn.setAttribute('aria-label', 'Collapse ' + agent.title);
        head.appendChild(collapseBtn);

        card.appendChild(head);
        if (agent.description) {
            card.appendChild(createEl('p', 'trinity-agent-desc', agent.description));
        }

        // Baris 1: Provider dropdown (paling atas)
        var providerRow = createEl('div', 'trinity-field');
        providerRow.appendChild(createEl('label', '', 'Provider'));
        var providerSelect = createEl('select', 'trinity-provider-select');
        providerSelect.id = 'trinity-' + agent.key + '-provider';
        providerSelect.appendChild(createEl('option', '', '— Select provider —'));
        providerRow.appendChild(providerSelect);
        card.appendChild(providerRow);

        // Baris 2: API Key + Validate (satu butang tunggal)
        var keyRow = createEl('div', 'trinity-field');
        keyRow.appendChild(createEl('label', '', 'API Key'));
        var keyWrap = createEl('div', 'trinity-input-wrap');
        var keyInput = createEl('input', 'trinity-key-input');
        keyInput.type = 'password';
        keyInput.id = 'trinity-' + agent.key + '-key';
        keyInput.autocomplete = 'off';
        keyInput.spellcheck = false;
        keyInput.placeholder = 'Enter your API key…';
        keyWrap.appendChild(keyInput);

        var eyeBtn = createEl('button', 'trinity-eye-btn');
        eyeBtn.type = 'button';
        eyeBtn.setAttribute('aria-label', 'Show API key');
        eyeBtn.innerHTML = eyeIconSvg(true);
        eyeBtn.addEventListener('click', function () {
            var showing = keyInput.type === 'text';
            keyInput.type = showing ? 'password' : 'text';
            eyeBtn.innerHTML = eyeIconSvg(showing);
            eyeBtn.setAttribute('aria-label', showing ? 'Show API key' : 'Hide API key');
        });
        keyWrap.appendChild(eyeBtn);

        var validateBtn = createEl('button', 'validate-api-btn btn-sm');
        validateBtn.type = 'button';
        validateBtn.dataset.agentValidate = agent.key;
        validateBtn.innerHTML = '<span class="validate-icon">✓</span><span class="validate-text">Test</span>';
        keyWrap.appendChild(validateBtn);
        keyRow.appendChild(keyWrap);

        // Autodetect badge
        var badge = createEl('span', 'trinity-format-badge tone-muted');
        badge.id = 'trinity-' + agent.key + '-badge';
        badge.textContent = 'No key';
        keyRow.appendChild(badge);
        card.appendChild(keyRow);

        // [SUSUNAN MEDAN CUSTOM v3.9.19] Hierarki untuk Custom/Proxy:
        //   1. Provider (sudah ada di atas)
        //   2. API Key + Validate (sudah ada di atas)
        //   3. Base URL
        //   4. Format / Door
        //   5. Model (searchable)
        // Bagi pembekal rasmi, Base URL & Format disembunyikan; Model kekal nampak.

        // Baris 3: Base URL (hanya untuk Custom/Proxy — Smart Visibility)
        var urlRow = createEl('div', 'trinity-field trinity-custom-only');
        urlRow.id = 'trinity-' + agent.key + '-baseurl-row';
        urlRow.appendChild(createEl('label', '', 'Base URL'));
        var urlInput = createEl('input', 'trinity-baseurl-input');
        urlInput.type = 'text';
        urlInput.id = 'trinity-' + agent.key + '-baseurl';
        urlInput.placeholder = 'https://…/v1 (e.g. Crazy Router, Ollama, your own proxy)';
        urlRow.appendChild(urlInput);
        card.appendChild(urlRow);

        // Baris 4: Format / Door (hanya untuk Custom/Proxy — Smart Visibility)
        var fmtRow = createEl('div', 'trinity-field trinity-custom-only');
        fmtRow.id = 'trinity-' + agent.key + '-format-row';
        fmtRow.appendChild(createEl('label', '', 'Format / Door'));
        var fmtSelect = createEl('select', 'trinity-format-select');
        fmtSelect.id = 'trinity-' + agent.key + '-format';
        var fmtOptions = [
            { value: 'auto', label: 'Auto (Recommended)' },
            { value: DOOR_TYPES.GEMINI, label: 'Gemini Native' },
            { value: DOOR_TYPES.OPENAI, label: 'OpenAI-Compatible' },
            { value: DOOR_TYPES.ANTHROPIC, label: 'Anthropic Messages' }
        ];
        fmtOptions.forEach(function (f) {
            var opt = createEl('option', '', f.label);
            opt.value = f.value;
            fmtSelect.appendChild(opt);
        });
        fmtRow.appendChild(fmtSelect);
        card.appendChild(fmtRow);

        // Baris 5: Model — STANDARD <select> DROPDOWN
        var modelRow = createEl('div', 'trinity-field');
        modelRow.appendChild(createEl('label', '', 'Model'));
        var modelSelect = createEl('select', 'trinity-model-select');
        modelSelect.id = 'trinity-' + agent.key + '-model';
        var modelPlaceholder = createEl('option', '', '— Select model —');
        modelPlaceholder.value = '';
        modelSelect.appendChild(modelPlaceholder);
        modelRow.appendChild(modelSelect);
        card.appendChild(modelRow);

        // [FASA 4 v3.9.46] Sub-accordion "⚙️ Model Parameters" — medan dibina
        // dinamik daripada capability map (provider-agnostic) setiap kali
        // provider/model kad berubah. DOM dibina sekali; medan dirender semula.
        card.appendChild(buildModelParamsAccordion(agent.key));
        modelSelect.addEventListener('change', function () {
            refreshModelParams(agent.key);
        });

        // Key Rotation (hanya untuk Gemini — Smart Visibility)
        var rotationRow = buildKeyRotationRow(agent.key);
        card.appendChild(rotationRow);

        // Secondary Fallback Provider — hanya pada kad Agent Translation (sub-kad collapsible)
        if (agent.key === 'translation') {
            card.appendChild(buildSecondaryFallbackRow());
        }

        // [BUG FIX v3.9.44] Hint Pro-only dibina SENTIASA (kad dibina sekali
        // sahaja), tetapi disembunyikan oleh CSS melalui kelas mod pada bekas
        // kad (`.trinity-cards.trinity-mode-basic .trinity-pro-only`). Ini
        // mengekalkan pariti visual lama (hint hanya dalam Pro Mode) TANPA
        // membina semula DOM semasa pertukaran mod.
        var hint = createEl('div', 'trinity-agent-hint trinity-pro-only');
        hint.textContent = 'Save → backend keyDetector autodetects (this dropdown override wins).';
        card.appendChild(hint);

        // Lipat kad via butang collapse header (pola kad anak Languages:
        // Source/Target). Tiada footer "Close section" dalam kad — section API
        // Keys hanya ada SATU close footer di bawah (dikawal config.js).
        collapseBtn.addEventListener('click', function () {
            var collapsed = card.classList.toggle('collapsed');
            collapseBtn.classList.toggle('collapsed', collapsed);
            collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        });
        // Klik header (luar butang) juga melipat — selari dengan kad utama.
        head.addEventListener('click', function (e) {
            if (e.target.closest('.collapse-btn')) return;
            e.stopPropagation();
            var collapsed = card.classList.toggle('collapsed');
            collapseBtn.classList.toggle('collapsed', collapsed);
            collapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        });

        return card;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // [FASA 4 v3.9.46] SUB-ACCORDION "⚙️ MODEL PARAMETERS" — capability-driven
    // ═══════════════════════════════════════════════════════════════════════════
    // Mirror front-end bagi src/utils/modelCapabilities.js (CAPABILITY_MAP 1.0.0).
    // Backend TIADA endpoint capability — maka resolver ini disalin VERBATIM
    // (audit Fasa 3 mengunci pariti melalui trinity-params-regression.test.js).
    // Medan UI dibina dinamik daripada profil: hanya parameter yang disokong
    // model dipaparkan; parameter fixed dipaparkan sebagai nota terkunci.
    // ═══════════════════════════════════════════════════════════════════════════

    // Descriptor: { min, max, default, fixed?, enum? }
    function mpParam(min, max, def, extra) {
        var d = { min: min, max: max, default: def };
        if (extra) {
            for (var k in extra) {
                if (Object.prototype.hasOwnProperty.call(extra, k)) d[k] = extra[k];
            }
        }
        return d;
    }

    var MP_GEMINI_SAMPLING = mpParam(0, 2, 0.3);
    var MP_GEMINI_TOP_P = mpParam(0, 1, 0.95);
    var MP_GEMINI_THINKING_LEVELS = ['disabled', 'minimal', 'low', 'medium', 'high'];
    // [SEND-ALL UI GAP FIX v3.10.5] Presence/Frequency Penalty dirender dalam
    // Model Parameters untuk SEMUA profil bersampling — backend menghantar
    // penalty ke semua pintu (gemini.js / openaiCompatible.js / anthropic.js);
    // sanitizeAgentParams hanya meluluskan medan yang disenaraikan dalam profil,
    // maka UI mesti mengisytihar descriptor mereka. Julat -2..2, step 0.1,
    // lalai 0 (label sedia ada dalam MP_FIELD_LABELS; susunan selepas
    // reasoningEffort dalam MP_FIELD_ORDER).
    var MP_FREQUENCY_PENALTY = mpParam(-2, 2, 0);
    var MP_PRESENCE_PENALTY = mpParam(-2, 2, 0);

    // [GROUND TRUTH 2026-10-24 — rasmi vendor + aliran Rootsys sebenar]
    // Satu resolver dikongsi semua ejen, Basic/Pro, official + Custom/Proxy,
    // termasuk Secondary Fallback. Nilai OFF kekal 'disabled' pada wire config.
    var MP_K3_REASONING_EFFORTS = ['low', 'high', 'max'];
    var MP_DEEPSEEK_REASONING_EFFORTS = ['disabled', 'low', 'high', 'max'];

    function mpGlmProfile(modelId) {
        var m = String(modelId || '')
            .trim()
            .toLowerCase();
        var parameters = {
            temperature: mpParam(0, 1, 1.0),
            topP: mpParam(0, 1, 0.95),
            maxOutputTokens: mpParam(1, 131072, 32768),
            frequencyPenalty: MP_FREQUENCY_PENALTY,
            presencePenalty: MP_PRESENCE_PENALTY
        };
        if (/^glm-5\.3(?:-|$)/.test(m)) {
            parameters.reasoningEffort = mpParam(0, 0, 'max', { enum: ['low', 'high', 'max'] });
        } else if (/^glm-5\.2(?:-|$)/.test(m)) {
            parameters.reasoningEffort = mpParam(0, 0, 'max', { enum: ['disabled', 'low', 'high', 'max'] });
        } else if (/^glm-5\.1(?:-|$)/.test(m)) {
            parameters.reasoningEffort = mpParam(0, 0, 'disabled', { enum: ['disabled', 'low'] });
        }
        return {
            family: 'glm',
            parameters: parameters,
            notes: ['thinking-mode-temperature-1.0']
        };
    }

    function mpDeepseekProfile() {
        return {
            family: 'deepseek-thinking',
            parameters: {
                temperature: mpParam(0, 2, 0.3),
                topP: mpParam(0, 1, 0.95),
                maxOutputTokens: mpParam(1, 200000, 32768),
                reasoningEffort: mpParam(0, 0, 'high', { enum: MP_DEEPSEEK_REASONING_EFFORTS }),
                frequencyPenalty: MP_FREQUENCY_PENALTY,
                presencePenalty: MP_PRESENCE_PENALTY
            },
            notes: []
        };
    }

    function mpGeminiProfile(modelId) {
        var m = String(modelId || '')
            .trim()
            .toLowerCase();
        if (/^gemini-2\.5/.test(m)) {
            return {
                family: 'gemini-2.5',
                parameters: {
                    temperature: MP_GEMINI_SAMPLING,
                    topP: MP_GEMINI_TOP_P,
                    thinkingBudget: mpParam(-1, 200000, -1),
                    // [GEMINI METADATA OVERHAUL 2026-10-19] Siling output sebenar
                    // pelayan = 65,536 (docs/GEMINI_MODELS_METADATA_GROUND_TRUTH.md
                    // §a) — betulkan off-by-one 65535 → 65536.
                    maxOutputTokens: mpParam(1, 65536, 32768),
                    frequencyPenalty: MP_FREQUENCY_PENALTY,
                    presencePenalty: MP_PRESENCE_PENALTY
                },
                notes: []
            };
        }
        var rerouteStrict = m === 'gemini-3.5-flash' || m === 'gemini-3.7-flash';
        var minorMatch = m.match(/^gemini-3\.(\d+)/);
        var minor = minorMatch ? parseInt(minorMatch[1], 10) : /^gemini-3(?:-|$)/.test(m) ? 0 : null;
        var isStrict =
            rerouteStrict ||
            /^gemini-[4-9]/.test(m) ||
            /^gemini-(flash|flash-lite|pro)-latest$/.test(m) ||
            (minor !== null && (minor >= 6 || (minor === 5 && /flash-lite/.test(m))));
        if (isStrict) {
            // [TRINITY TOTAL UNLOCK FASA 2 — K8] Descriptor sampling DIISYHTARKAN
            // semula dengan uiHint (selari backend modelCapabilities.js) supaya
            // UI memaparkan medan + nota; nilai pengguna dihantar, pelayan
            // putuskan sendiri.
            return {
                family: 'gemini-3.x-strict',
                parameters: {
                    temperature: mpParam(0, 2, 0.3, { uiHint: 'server-strips-for-this-model' }),
                    topP: mpParam(0, 1, 0.95, { uiHint: 'server-strips-for-this-model' }),
                    thinkingLevel: mpParam(0, 0, 'medium', { enum: MP_GEMINI_THINKING_LEVELS }),
                    maxOutputTokens: mpParam(1, 65536, 32768),
                    // [FASA 2 A1 2026-10-26] Penalty strict: enjin MENAHAN medan
                    // ini pada wire (HTTP 400) — beri amaran tepat pada medan.
                    frequencyPenalty: mpParam(-2, 2, 0, { uiHint: 'penalties-blocked-3x-strict' }),
                    presencePenalty: mpParam(-2, 2, 0, { uiHint: 'penalties-blocked-3x-strict' })
                },
                notes: ['sampling-controlled', rerouteStrict ? 'server-reroute-stripped' : 'sampling-stripped-by-api']
            };
        }
        if (minor !== null) {
            // [GEMINI METADATA OVERHAUL 2026-10-19] 3.x-legacy (3-flash, 3.1-pro,
            // 3.1-flash-lite, 3.5-flash pra-reroute): cadangan rasmi Google =
            // temperature 1.0 (KEPUTUSAN OWNER 2026-10-19 — placeholder cadangan,
            // kekal boleh ubah; HIDE ≠ LOCK).
            return {
                family: 'gemini-3.x-legacy',
                parameters: {
                    temperature: mpParam(0, 2, 1.0, { uiHint: 'google-recommends-temperature-1.0' }),
                    topP: MP_GEMINI_TOP_P,
                    thinkingLevel: mpParam(0, 0, 'high', { enum: MP_GEMINI_THINKING_LEVELS }),
                    maxOutputTokens: mpParam(1, 65536, 32768),
                    frequencyPenalty: MP_FREQUENCY_PENALTY,
                    presencePenalty: MP_PRESENCE_PENALTY
                },
                notes: ['google-recommends-temperature-1.0']
            };
        }
        return {
            family: 'gemini-legacy',
            parameters: {
                temperature: MP_GEMINI_SAMPLING,
                topP: MP_GEMINI_TOP_P,
                maxOutputTokens: mpParam(1, 65536, 32768),
                frequencyPenalty: MP_FREQUENCY_PENALTY,
                presencePenalty: MP_PRESENCE_PENALTY
            },
            notes: []
        };
    }

    function mpAnthropicProfile(modelId) {
        var m = String(modelId || '')
            .trim()
            .toLowerCase();
        var hasThinking =
            /claude-(3-7|opus-4|sonnet-4|haiku-4|fable-5|opus-5|sonnet-5|haiku-5)/.test(m) || !/claude/.test(m);
        var isAdaptiveAlways = /claude-(fable-5|opus-5|sonnet-5|haiku-5)/.test(m);
        var parameters = {
            temperature: mpParam(0, 1, 0.3),
            topP: mpParam(0, 1, 0.95),
            maxOutputTokens: mpParam(1, 128000, 32768),
            frequencyPenalty: MP_FREQUENCY_PENALTY,
            presencePenalty: MP_PRESENCE_PENALTY
        };
        if (hasThinking) parameters.thinkingBudget = mpParam(1024, 200000, 0);
        return {
            family: isAdaptiveAlways ? 'anthropic-5.x-adaptive' : hasThinking ? 'anthropic-thinking' : 'anthropic-3.5',
            parameters: parameters,
            notes: hasThinking ? ['thinking-locks-temperature-1.0'] : []
        };
    }

    var MP_DEEPL_PROFILE = {
        family: 'deepl',
        parameters: {
            modelType: mpParam(0, 0, 'quality_optimized', { enum: ['quality_optimized'] }),
            formality: mpParam(0, 0, 'default', { enum: ['default', 'less', 'more'] }),
            preserveFormatting: mpParam(0, 0, true)
        },
        notes: ['no-llm-sampling']
    };

    function mpKimiProfile(modelId) {
        var m = String(modelId || '')
            .trim()
            .toLowerCase();
        // [TRINITY TOTAL UNLOCK FASA 2 — K2] fixed DIGUGURKAN — nilai pengguna
        // dihantar apa adanya; 1.0/0.95 kekal CADANGAN lalai (placeholder) sahaja.
        // [KIMI-K3 THINKING RESTORE 2026-10-19] reasoningEffort dikembalikan —
        // backend applySmartModelPayload() memetakan 'low/high/max' →
        // reasoning_effort (K3/K3.1-pro) atau auto-managed (k2.7). 'disabled'
        // dihormati (tiada parameter dihantar; model guna lalai semula jadi).
        // K3 dan K3.1-pro berkongsi profil verbatim: low/high/max, default max.
        if (/kimi-k3|kimi-k2\.7/.test(m)) {
            return {
                family: 'kimi-fixed-sampling',
                parameters: {
                    temperature: mpParam(0, 2, 1.0, { uiHint: 'ground-truth-suggests-1.0' }),
                    topP: mpParam(0, 1, 0.95, { uiHint: 'ground-truth-suggests-0.95' }),
                    maxOutputTokens: mpParam(1, 131072, 32768),
                    reasoningEffort: mpParam(0, 0, 'max', {
                        enum: MP_K3_REASONING_EFFORTS
                    }),
                    frequencyPenalty: MP_FREQUENCY_PENALTY,
                    presencePenalty: MP_PRESENCE_PENALTY
                },
                notes: ['ground-truth-suggests-temp-1.0-topP-0.95']
            };
        }
        return {
            family: 'kimi-hybrid',
            parameters: {
                temperature: mpParam(0, 2, 1.0),
                topP: mpParam(0, 1, 0.95, { uiHint: 'ground-truth-suggests-0.95' }),
                maxOutputTokens: mpParam(1, 131072, 32768),
                frequencyPenalty: MP_FREQUENCY_PENALTY,
                presencePenalty: MP_PRESENCE_PENALTY
            },
            notes: ['thinking-mode-temperature-1.0']
        };
    }

    function mpOpenaiProfile(modelId) {
        var m = String(modelId || '')
            .trim()
            .toLowerCase();
        var isReasoningOnly = /^o\d/.test(m) || /^gpt-5$/.test(m) || /^gpt-5-(?!5)/.test(m) || /^gpt-5\.1/.test(m);
        if (isReasoningOnly) {
            return {
                family: 'openai-reasoning-no-sampling',
                parameters: {
                    reasoningEffort: mpParam(0, 0, 'medium', { enum: ['low', 'medium', 'high'] }),
                    maxOutputTokens: mpParam(1, 128000, 32768)
                },
                notes: ['sampling-not-supported']
            };
        }
        var modern = /^gpt-(5\.[2-9]|5\.\d\d|6)/.test(m);
        var parameters = {
            temperature: mpParam(0, 2, 0.3),
            topP: mpParam(0, 1, 0.95),
            maxOutputTokens: mpParam(1, 128000, 32768),
            frequencyPenalty: MP_FREQUENCY_PENALTY,
            presencePenalty: MP_PRESENCE_PENALTY
        };
        if (modern) {
            parameters.reasoningEffort = mpParam(0, 0, 'low', { enum: ['none', 'low', 'medium', 'high', 'xhigh'] });
        }
        return {
            family: modern ? 'openai-modern-sampling' : 'openai-legacy-alias',
            parameters: parameters,
            notes: modern ? [] : ['legacy-alias-proxy-compatible']
        };
    }

    var MP_DOOR_GENERIC_OPENAI = {
        family: 'openai-compatible-generic',
        parameters: {
            temperature: mpParam(0, 2, 0.3),
            topP: mpParam(0, 1, 0.95),
            maxOutputTokens: mpParam(1, 200000, 32768),
            reasoningEffort: mpParam(0, 0, undefined, {
                enum: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh']
            }),
            frequencyPenalty: MP_FREQUENCY_PENALTY,
            presencePenalty: MP_PRESENCE_PENALTY
        },
        notes: []
    };

    // Mirror resolveCapabilityProfile(providerOrDoor, modelId) backend.
    function resolveCapabilityProfile(providerOrDoor, modelId) {
        var key = String(providerOrDoor || '')
            .trim()
            .toLowerCase();
        var m = String(modelId || '')
            .trim()
            .toLowerCase();
        switch (key) {
            case 'gemini':
            case 'gemini-native':
                return mpGeminiProfile(m);
            case 'anthropic':
            case 'anthropic-messages':
                return mpAnthropicProfile(m);
            case 'deepl':
                return MP_DEEPL_PROFILE;
            case 'moonshot':
                return m && !/kimi/.test(m) ? MP_DOOR_GENERIC_OPENAI : mpKimiProfile(m);
            case 'openai':
                return mpOpenaiProfile(m);
            case 'custom':
            case 'custom_secondary':
            case 'openai-compatible': {
                if (/^gemini|^gemma/.test(m)) return mpGeminiProfile(m);
                if (/^claude|^anthropic/.test(m)) return mpAnthropicProfile(m);
                if (/kimi/.test(m)) return mpKimiProfile(m);
                if (/^gpt-|^o\d/.test(m)) return mpOpenaiProfile(m);
                if (/^glm/.test(m)) return mpGlmProfile(m);
                if (/^deepseek/.test(m)) return mpDeepseekProfile(m);
                return MP_DOOR_GENERIC_OPENAI;
            }
            default:
                // [SYNC OFFICIAL ↔ CUSTOM/PROXY 2026-10-24] Keupayaan ditentukan
                // oleh nama model, bukan oleh ketersediaan kunci official. Semua
                // varian DeepSeek berkongsi profil; GLM 5.3 dipisah daripada 5.2.
                if (/^deepseek/.test(m)) return mpDeepseekProfile(m);
                if (/^glm/.test(m)) return mpGlmProfile(m);
                return MP_DOOR_GENERIC_OPENAI;
        }
    }

    // Lalai per-ejen (diperakui Owner 2026-10-15) — mirror AGENT_TUNING_BASE.
    var MP_AGENT_TUNING_BASE = {
        preflight: { temperature: 0.0, topP: 0.9, reasoningEffort: 'medium', thinkingLevel: 'medium' },
        translation: { temperature: 0.3, topP: 0.95, reasoningEffort: 'low', thinkingLevel: 'low' },
        secondary: { temperature: 0.3, topP: 0.95, reasoningEffort: 'low', thinkingLevel: 'low' },
        inspector: { temperature: 0.0, topP: 0.9, reasoningEffort: 'low', thinkingLevel: 'low' }
    };

    // Mirror getAgentDefaultParams(agent, providerOrDoor, modelId).
    function getAgentDefaultParams(agent, providerOrDoor, modelId) {
        var profile = resolveCapabilityProfile(providerOrDoor, modelId);
        var tuning = MP_AGENT_TUNING_BASE[agent] || MP_AGENT_TUNING_BASE.translation;
        var defaults = {};
        // [TRINITY TOTAL UNLOCK FASA 2 — K2] Cabang descriptor.fixed dibuang —
        // tiada lagi nilai dikunci; cadangan lalai sahaja (mirror backend).
        var normalizedModel = String(modelId || '')
            .trim()
            .toLowerCase();
        var hasVendorReasoningDefault =
            /^deepseek/.test(normalizedModel) ||
            /^glm-5\.[23](?:-|$)/.test(normalizedModel) ||
            /kimi-k3/.test(normalizedModel);
        for (var name in profile.parameters) {
            if (!Object.prototype.hasOwnProperty.call(profile.parameters, name)) continue;
            var descriptor = profile.parameters[name];
            // Lalai vendor hanya untuk keluarga yang diperakui Owner; semua model
            // lain kekal menggunakan hierarki AGENT_TUNING_BASE sedia ada.
            if (name === 'reasoningEffort' && hasVendorReasoningDefault && descriptor.default !== undefined) {
                defaults[name] = descriptor.default;
            } else if (tuning[name] !== undefined && tuning[name] !== null) {
                defaults[name] = tuning[name];
            } else if (descriptor.default !== undefined) {
                defaults[name] = descriptor.default;
            }
        }
        return defaults;
    }

    // Mirror agentParamsDeviateFromDefault(agent, params, providerOrDoor, modelId).
    function agentParamsDeviateFromDefault(agent, params, providerOrDoor, modelId) {
        if (!params || typeof params !== 'object') return false;
        var keys = Object.keys(params);
        if (!keys.length) return false;
        var defaults = getAgentDefaultParams(agent, providerOrDoor, modelId);
        var profile = resolveCapabilityProfile(providerOrDoor, modelId);
        // [TRINITY TOTAL UNLOCK FASA 2 — K2] fixed-clamp dibuang — deviasi diukur
        // terhadap cadangan lalai sahaja.
        for (var i = 0; i < keys.length; i++) {
            var name = keys[i];
            var value = params[name];
            var descriptor = profile.parameters[name];
            if (!descriptor) return true;
            if (defaults[name] !== value) return true;
        }
        return false;
    }

    // Semantik nota kunci (diselaraskan dengan ground truth matriks §C).
    // [TRINITY TOTAL UNLOCK FASA 2] Teks nota dikemas kini — fixed → cadangan.
    var MP_NOTE_TEXT = {
        'fixed-sampling-temp-1.0-topP-0.95':
            'Kimi works best with temperature 1.0 and topP 0.95 — other values may be rejected by the API.',
        'ground-truth-suggests-temp-1.0-topP-0.95':
            'Kimi works best with temperature 1.0 and topP 0.95 — other values may be rejected by the API.',
        // [FASA 2 A1 — MANDAT OWNER 2026-10-26] Ketepatan semantik Hybrid Guard:
        // temperature/topP DIHANTAR (Google mengabaikannya secara SENYAP pada
        // 3.6+), manakala frequencyPenalty/presencePenalty DISEKAT oleh enjin
        // kerana API memulangkan HTTP 400 — dua tingkah laku berbeza, jangan
        // digabung dalam satu ayat.
        'sampling-stripped-by-api':
            'Temperature and Top-P are sent but silently ignored by the API for this model. Frequency/Presence penalties are not sent at all (the API rejects them with HTTP 400).',
        'server-reroute-stripped':
            'The server reroutes this model name to the Gemini 3.x strict family. Temperature and Top-P are sent but silently ignored; Frequency/Presence penalties are withheld to avoid HTTP 400.',
        'penalties-blocked-3x-strict':
            'Penalties are withheld for Gemini 3.x strict models — the API rejects frequency/presence penalties with HTTP 400.',
        'thinking-locks-temperature-1.0':
            'When extended thinking is enabled, Anthropic forces temperature to 1.0 and drops topP.',
        'sampling-unsupported-in-thinking-mode':
            'DeepSeek thinking mode does not accept sampling parameters — only maxOutputTokens is configurable.',
        'no-llm-sampling': 'DeepL is not a generative LLM — model type, formality and formatting controls only.',
        'sampling-not-supported': 'This reasoning model does not accept sampling parameters — reasoning effort only.',
        'sampling-controlled':
            'This Gemini 3 model manages sampling automatically: Temperature/Top-P are sent but may be ignored, and penalties are withheld to prevent HTTP 400.',
        'thinking-mode-temperature-1.0':
            'Thinking mode forces temperature 1.0 — lower values are ignored while thinking is on.',
        'google-recommends-temperature-1.0': 'Google recommends temperature 1.0 for Gemini 3.x models.'
    };

    // Resolve provider/door + model semasa bagi SATU slot params.
    // agent 'secondary' dibaca daripada dropdown fallback kad translation.
    function mpResolveAgentContext(agentKey) {
        if (agentKey === 'secondary') {
            var fbProviderSel = $('trinity-translation-fallback-provider');
            var fbProviderId = fbProviderSel ? fbProviderSel.value : '';
            var fbCustomModel = $('trinity-translation-fallback-model-custom');
            var fbModelSel = $('trinity-translation-fallback-model');
            var model = isFallbackCustom(fbProviderId)
                ? fbCustomModel
                    ? fbCustomModel.value
                    : ''
                : fbModelSel
                  ? fbModelSel.value
                  : '';
            var provider = resolveFallbackProvider(fbProviderId);
            var fmtSel = $('trinity-translation-fallback-format');
            var door = isFallbackCustom(fbProviderId)
                ? resolveFallbackCustomDoor(fmtSel ? fmtSel.value : 'auto')
                : getProviderDoor(provider);
            var isCustom = isCustomProvider(provider);
            // Custom: capability ikut nama model; provider lain: id registry.
            var providerOrDoor = isCustom
                ? isFallbackCustom(fbProviderId)
                    ? 'custom_secondary'
                    : door
                : fbProviderId || door;
            return { providerOrDoor: providerOrDoor, model: String(model || '').trim(), isCustom: isCustom };
        }
        var providerSel = $('trinity-' + agentKey + '-provider');
        var modelSel = $('trinity-' + agentKey + '-model');
        var providerId = providerSel ? providerSel.value : '';
        var entry = getProviderById(_registryCache || FALLBACK_PROVIDERS, providerId);
        var isCustom = isCustomProvider(entry);
        var fmtEl = $('trinity-' + agentKey + '-format');
        var baseUrlEl = $('trinity-' + agentKey + '-baseurl');
        var baseUrl = baseUrlEl ? String(baseUrlEl.value || '').trim() : '';
        // Custom/Proxy dengan baseUrl /v1beta → capability ikut door gemini-native.
        var door = resolveEffectiveDoor(entry, fmtEl ? fmtEl.value : 'auto');
        var providerOrDoor;
        if (isCustom) {
            var customModel = modelSel ? modelSel.value : '';
            if (/\/v1beta/i.test(baseUrl)) {
                providerOrDoor = DOOR_TYPES.GEMINI;
            } else if (/^gemini|^gemma|^claude|^anthropic|kimi|^gpt-|^o\d|^glm|^deepseek/i.test(customModel)) {
                providerOrDoor = 'custom';
            } else {
                providerOrDoor = door;
            }
        } else {
            providerOrDoor = providerId || door;
        }
        return {
            providerOrDoor: providerOrDoor,
            model: modelSel ? String(modelSel.value || '').trim() : '',
            isCustom: isCustom
        };
    }

    // --- UI builder & renderer ---

    function mpFieldLabel(text) {
        return createEl('label', 'trinity-mp-label', text);
    }

    // [TRINITY TOTAL UNLOCK FASA 2] Nilai sebagai PLACEHOLDER (cadangan kelabu
    // lembut) — bukan nilai input sebenar. Kotak kosong = tiada nilai disimpan;
    // enjin tidak mencipta nilai (pelayan guna lalai asalnya). placeholderValue
    // diisi dari cadangan lalai ejen; savedValue diisi dari konfigurasi
    // pengguna yang sebenar (null/'' → kosong).
    // [GEMINI METADATA OVERHAUL 2026-10-19 — FASA 3 STEPPER] Langkah klik
    // per-parameter: integer besar (token/bajet) = 1024 (KEPUTUSAN OWNER);
    // lain-lain ikut `step` descriptor (0.1 / 0.01).
    function mpStepperStep(name, descriptor) {
        if (name === 'maxOutputTokens' || name === 'thinkingBudget') return 1024;
        var s = parseFloat(descriptor && descriptor.step);
        if (Number.isFinite(s) && s > 0) return s;
        return name === 'topP' ? 0.01 : 0.1;
    }

    function mpStepperNudge(input, direction) {
        if (!input) return;
        var min = parseFloat(input.min);
        var max = parseFloat(input.max);
        var step = parseFloat(input.dataset.mpStep || '0.1');
        var raw = String(input.value || '').trim();
        var base;
        if (raw === '') {
            // Placeholder doctrine: input kosong = tiada nilai disimpan. Stepper
            // bermula dari cadangan placeholder sebagai titik mula interaktif.
            base = parseFloat(input.placeholder);
            if (!Number.isFinite(base)) base = Number.isFinite(min) ? min : 0;
        } else {
            base = parseFloat(raw);
            if (!Number.isFinite(base)) base = 0;
        }
        var next = base + direction * step;
        if (Number.isFinite(min)) next = Math.max(min, next);
        if (Number.isFinite(max)) next = Math.min(max, next);
        // Kekalkan ketepatan perpuluhan mengikut step (elak 0.3000000000004).
        var decimals = (String(step).split('.')[1] || '').length;
        input.value = decimals > 0 ? next.toFixed(decimals) : String(Math.round(next));
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function mpBuildStepperButton(input, direction, label) {
        var btn = createEl('button', 'trinity-mp-step-btn', direction > 0 ? '+' : '−');
        btn.type = 'button';
        btn.setAttribute('aria-label', (direction > 0 ? 'Increase ' : 'Decrease ') + label);
        btn.addEventListener('click', function () {
            mpStepperNudge(input, direction);
        });
        return btn;
    }

    function mpBuildNumberField(agentKey, name, label, descriptor, savedValue, placeholderValue, uiHint) {
        var wrap = createEl('div', 'trinity-mp-field');
        wrap.dataset.mpParam = name;
        wrap.dataset.mpAgent = agentKey;
        wrap.appendChild(mpFieldLabel(label));
        var stepperWrap = createEl('div', 'trinity-mp-stepper');
        var input = createEl('input', 'trinity-mp-input');
        input.type = 'number';
        input.id = 'trinity-mp-' + agentKey + '-' + name;
        input.min = String(descriptor.min);
        input.max = String(descriptor.max);
        input.step = name === 'topP' ? '0.01' : '0.1';
        input.dataset.mpStep = String(mpStepperStep(name, descriptor));
        // Nilai SEBENAR pengguna hanya bila wujud (bukan lalai auto-isi).
        input.value =
            savedValue !== undefined && savedValue !== null && String(savedValue) !== '' ? String(savedValue) : '';
        // Cadangan lalai dipaparkan sebagai placeholder kelabu (tidak dihantar).
        if (placeholderValue !== undefined && placeholderValue !== null && String(placeholderValue) !== '') {
            input.placeholder = String(placeholderValue);
        }
        input.dataset.mpName = name;
        input.dataset.mpAgent = agentKey;
        stepperWrap.appendChild(input);
        var btnCol = createEl('div', 'trinity-mp-stepper-btns');
        btnCol.appendChild(mpBuildStepperButton(input, 1, label));
        btnCol.appendChild(mpBuildStepperButton(input, -1, label));
        stepperWrap.appendChild(btnCol);
        wrap.appendChild(stepperWrap);
        // [TOTAL UNLOCK] Nota panduan uiHint (ground-truth-suggests-*, server-strips) —
        // bersaiz mikro, token CSS tema, tanpa kod warna keras.
        if (uiHint) {
            var hint = createEl('div', 'trinity-mp-uihint', MP_UIHINT_TEXT[uiHint] || uiHint);
            wrap.appendChild(hint);
        }
        return wrap;
    }

    function mpBuildSelectField(agentKey, name, label, descriptor, value) {
        var wrap = createEl('div', 'trinity-mp-field');
        wrap.dataset.mpParam = name;
        wrap.dataset.mpAgent = agentKey;
        wrap.appendChild(mpFieldLabel(label));
        var select = createEl('select', 'trinity-mp-input');
        select.id = 'trinity-mp-' + agentKey + '-' + name;
        select.dataset.mpName = name;
        select.dataset.mpAgent = agentKey;
        (descriptor.enum || []).forEach(function (optVal) {
            var label = optVal.charAt(0).toUpperCase() + optVal.slice(1);
            if (name === 'reasoningEffort' && optVal === 'disabled') label = 'Off';
            if (name === 'reasoningEffort' && optVal === descriptor.default) label += ' (Provider default)';
            var opt = createEl('option', '', label);
            opt.value = optVal;
            select.appendChild(opt);
        });
        if (value !== undefined && value !== null && String(value) !== '') {
            select.value = String(value);
        } else if (descriptor.default !== undefined && descriptor.default !== null) {
            select.value = String(descriptor.default);
        }
        if (select.selectedIndex < 0 && select.options.length) select.selectedIndex = 0;
        wrap.appendChild(select);
        return wrap;
    }

    function mpBuildCheckboxField(agentKey, name, label, value) {
        var wrap = createEl('div', 'trinity-mp-field trinity-mp-field-check');
        wrap.dataset.mpParam = name;
        wrap.dataset.mpAgent = agentKey;
        var labelEl = createEl('label', 'trinity-mp-label trinity-mp-label-check');
        var input = createEl('input', 'trinity-mp-checkbox');
        input.type = 'checkbox';
        input.id = 'trinity-mp-' + agentKey + '-' + name;
        input.dataset.mpName = name;
        input.dataset.mpAgent = agentKey;
        input.checked = value === true;
        labelEl.appendChild(input);
        labelEl.appendChild(createEl('span', '', label));
        wrap.appendChild(labelEl);
        return wrap;
    }

    // Susunan medan stabil (capability map iteration order backend preserved
    // melalui array ini — elak perbezaan peta objek antara pelayar).
    var MP_FIELD_ORDER = [
        'temperature',
        'topP',
        'maxOutputTokens',
        'thinkingBudget',
        'thinkingLevel',
        'reasoningEffort',
        'frequencyPenalty',
        'presencePenalty',
        'modelType',
        'formality',
        'preserveFormatting'
    ];
    // [TRINITY TOTAL UNLOCK FASA 2] Peta teks uiHint — panduan mikro daripada
    // descriptor.backend (server-strips / ground-truth-suggests). Kekal token
    // CSS tema (kelas .trinity-mp-uihint), sifar kod warna keras.
    var MP_UIHINT_TEXT = {
        // [FASA 2 A1 2026-10-26] Sampling 3.x-strict: nilai DIHANTAR, pelayan
        // rasmi Google mengabaikannya secara senyap (bukan dibuang oleh enjin).
        'server-strips-for-this-model': 'Sent, but the provider may ignore this value for this model.',
        // [FASA 2 A1 2026-10-26] Penalty 3.x-strict: DISEKAT oleh enjin (HTTP 400).
        'penalties-blocked-3x-strict': 'Not sent for this model — withheld to avoid HTTP 400.',
        'ground-truth-suggests-1.0': 'Suggested value: 1.0 (other values may be rejected by the server).',
        'ground-truth-suggests-0.95': 'Suggested value: 0.95 (other values may be rejected by the server).',
        'thinking-locks-temperature-1.0': 'When thinking is enabled, temperature is set to 1.0 by the provider.',
        // [GEMINI METADATA OVERHAUL 2026-10-19] 3.x-legacy — cadangan rasmi Google.
        'google-recommends-temperature-1.0': 'Google recommends temperature 1.0 for this model.'
    };

    var MP_FIELD_LABELS = {
        temperature: 'Temperature',
        topP: 'Top-P',
        maxOutputTokens: 'Max output tokens',
        thinkingBudget: 'Thinking budget',
        thinkingLevel: 'Thinking level',
        reasoningEffort: 'Reasoning effort',
        frequencyPenalty: 'Frequency penalty',
        presencePenalty: 'Presence penalty',
        modelType: 'Model type',
        formality: 'Formality',
        preserveFormatting: 'Preserve formatting'
    };

    // [TRINITY TOTAL UNLOCK FASA 2] Paparan medan: nilai SEBENAR pengguna
    // (savedParams) menjadi input.value; cadangan lalai (defaults) menjadi
    // placeholder kelabu. descriptor.fixed telah digugurkan di semua profil —
    // tiada lagi medan read-only terkunci.
    function mpRenderFields(agentKey, profile, defaults, savedParams) {
        var container = $('trinity-mp-fields-' + agentKey);
        if (!container) return;
        container.innerHTML = '';
        var params = savedParams && typeof savedParams === 'object' ? savedParams : {};
        MP_FIELD_ORDER.forEach(function (name) {
            var descriptor = profile.parameters[name];
            if (!descriptor) return; // hanya parameter yang disokong model
            // Nilai sebenar pengguna = params[name]; cadangan lalai = defaults[name].
            var savedValue = params[name];
            // Legacy K3/GLM-5.3 'disabled' tidak lagi sah dalam enum vendor.
            // Pulihkan kepada minimum selamat untuk paparan; jangan hantar token
            // legacy itu semula ke pelayan semasa collect/render seterusnya.
            if (
                name === 'reasoningEffort' &&
                savedValue === 'disabled' &&
                Array.isArray(descriptor.enum) &&
                !descriptor.enum.includes('disabled')
            ) {
                savedValue = descriptor.enum.includes('low') ? 'low' : descriptor.enum[0];
            }
            var placeholderValue = defaults[name];
            var uiHint = descriptor.uiHint;
            var field = null;
            if (descriptor.enum && Array.isArray(descriptor.enum)) {
                // Select: nilai sebenar pengguna dipilih; tanpa nilai → pilihan pertama.
                var selValue =
                    savedValue !== undefined && savedValue !== null && String(savedValue) !== ''
                        ? savedValue
                        : placeholderValue;
                field = mpBuildSelectField(agentKey, name, MP_FIELD_LABELS[name] || name, descriptor, selValue);
                if (field && uiHint)
                    field.appendChild(createEl('div', 'trinity-mp-uihint', MP_UIHINT_TEXT[uiHint] || uiHint));
            } else if (name === 'preserveFormatting') {
                field = mpBuildCheckboxField(agentKey, name, MP_FIELD_LABELS[name] || name, savedValue === true);
            } else {
                field = mpBuildNumberField(
                    agentKey,
                    name,
                    MP_FIELD_LABELS[name] || name,
                    descriptor,
                    savedValue,
                    placeholderValue,
                    uiHint
                );
            }
            if (field) container.appendChild(field);
        });
        mpSyncDeviatedWarning(agentKey);
    }

    // [TRINITY TOTAL UNLOCK FASA 2] Papar nota panduan: uiHint descriptor +
    // notes yang dikenali. Nota fixed telah digugurkan (tiada lagi medan
    // terkunci). Kelas .trinity-mp-note kekal (token CSS tema).
    function mpRenderNotes(agentKey, profile) {
        var notesBox = $('trinity-mp-notes-' + agentKey);
        if (!notesBox) return;
        notesBox.innerHTML = '';
        var seen = {};
        // [VISUAL DEDUP 2026-10-24] uiHint per-medan sudah membawa teks penuh di
        // bawah setiap input; mengulanginya sebagai blok nota di atas menolak
        // medan sebenar ke bawah lipatan (3 lapisan mesej sama). Hanya nota yang
        // TIADA perwakilan medan dipaparkan di sini.
        Object.keys(profile.parameters).forEach(function (name) {
            var descriptor = profile.parameters[name];
            if (descriptor && descriptor.uiHint && !seen['hint:' + name]) seen['hint:' + name] = true;
        });
        (profile.notes || []).forEach(function (key) {
            if (seen['note:' + key]) return;
            seen['note:' + key] = true;
            if (/ground-truth-suggests|fixed-sampling|thinking-mode-temperature|thinking-locks-temperature/.test(key))
                return;
            var text = MP_NOTE_TEXT[key];
            if (text) notesBox.appendChild(createEl('div', 'trinity-mp-note', text));
        });
        notesBox.style.display = notesBox.children.length ? '' : 'none';
    }

    // Amaran bypass-cache apabila params menyimpang daripada lalai ejen.
    function mpSyncDeviatedWarning(agentKey) {
        var warn = $('trinity-mp-deviated-' + agentKey);
        if (!warn) return;
        var ctx = mpResolveAgentContext(agentKey);
        var params = mpCollectFieldValues(agentKey);
        var deviated = agentParamsDeviateFromDefault(agentKey, params, ctx.providerOrDoor, ctx.model);
        warn.style.display = deviated ? '' : 'none';
    }

    // [FASA 2 B2 — MANDAT OWNER 2026-10-26] Kesan enjin Gemini 2.5 Pro:
    // custom thinkingBudget > 0 tetapi < 128 akan di-clamp ke 128 oleh
    // src/services/gemini.js buildGenerationConfig(). Nilai -1 (dinamik) dan
    // 0 (mati) KEKAL sah. Fungsi ini cermin tepat kelakuan enjin untuk UI.
    var GEMINI_25_PRO_MIN_BUDGET = 128;
    function mpIsGemini25Pro(modelId) {
        return /^gemini-2\.5-pro/.test(
            String(modelId || '')
                .trim()
                .toLowerCase()
                .replace(/^models\//, '')
        );
    }
    function mpClampGemini25ProBudget(value, modelId) {
        var num = parseInt(value, 10);
        if (!Number.isFinite(num)) return value;
        if (!mpIsGemini25Pro(modelId)) return num;
        // -1 = dinamik, 0 = mati — kedua-duanya sah (tiada paksaan).
        if (num <= 0) return num;
        return num < GEMINI_25_PRO_MIN_BUDGET ? GEMINI_25_PRO_MIN_BUDGET : num;
    }

    // Kumpul nilai medan semasa → params ringkas (hanya medan yang wujud).
    function mpCollectFieldValues(agentKey) {
        var container = $('trinity-mp-fields-' + agentKey);
        if (!container) return {};
        var params = {};
        var ctx = mpResolveAgentContext(agentKey);
        Array.prototype.forEach.call(container.querySelectorAll('[data-mp-name]'), function (el) {
            var name = el.dataset.mpName;
            if (el.type === 'checkbox') {
                params[name] = el.checked === true;
            } else {
                var v = String(el.value || '').trim();
                if (v === '') return;
                var num = parseFloat(v);
                // [FASA 2 B2] Cermin clamp enjin Gemini 2.5 Pro (min 128 custom).
                if (name === 'thinkingBudget' && Number.isFinite(num) && ctx && ctx.model) {
                    var clamped = mpClampGemini25ProBudget(num, ctx.model);
                    if (clamped !== num) {
                        el.value = String(clamped);
                    }
                    params[name] = clamped;
                    return;
                }
                params[name] = Number.isFinite(num) ? num : v;
            }
        });
        return params;
    }

    // Payload params untuk kontrak trinity.<agent>.params: kembalikan HANYA
    // medan yang dilawati pengguna daripada lalai ejen (kosong jika semua lalai).
    // [TRINITY TOTAL UNLOCK FASA 2] Pulang null apabila tiada deviasi eksplisit
    // daripada lalai ejen — konfigurasi backend menerima null (bukan objek
    // kosong) supaya enjin tahu pengguna tidak menetapkan apa-apa.
    function mpCollectDeviatedParams(agentKey) {
        var ctx = mpResolveAgentContext(agentKey);
        var params = mpCollectFieldValues(agentKey);
        var defaults = getAgentDefaultParams(agentKey, ctx.providerOrDoor, ctx.model);
        var profile = resolveCapabilityProfile(ctx.providerOrDoor, ctx.model);
        var out = {};
        var hasDev = false;
        Object.keys(params).forEach(function (name) {
            var descriptor = profile.parameters[name];
            if (!descriptor) return; // tidak disokong — dibuang senyap
            if (defaults[name] !== params[name]) {
                out[name] = params[name];
                hasDev = true;
            }
        });
        return hasDev ? out : null;
    }

    // [BUG FIX] Fresh state gate: semakan provider DAN model mesti dipilih
    // sebelum parameter boleh dirender. Fallback generik (MP_DOOR_GENERIC_OPENAI)
    // tidak boleh dipaparkan seolah-olah konfigurasi sudah aktif.
    function mpHasSelection(ctx) {
        return (
            String(ctx.providerOrDoor || '')
                .trim()
                .replace(/^-+$/, '') !== '' &&
            String(ctx.model || '')
                .trim()
                .replace(/^-+$/, '') !== ''
        );
    }

    // Render placeholder "pilih provider/model dahulu" + bersihkan notes/warning.
    // Dipanggil oleh refreshModelParams() dan handler Reset to Default.
    function mpRenderPlaceholder(agentKey) {
        var fieldsBox = $('trinity-mp-fields-' + agentKey);
        var notesBox = $('trinity-mp-notes-' + agentKey);
        if (fieldsBox) {
            fieldsBox.innerHTML = '';
            var placeholder = createEl(
                'div',
                'trinity-mp-placeholder',
                'Select a provider and model first to adjust parameters.'
            );
            placeholder.id = 'trinity-mp-placeholder-' + agentKey;
            fieldsBox.appendChild(placeholder);
        }
        if (notesBox) notesBox.innerHTML = '';
        var warn = $('trinity-mp-deviated-' + agentKey);
        if (warn) warn.style.display = 'none';
    }

    function refreshModelParams(agentKey) {
        var accordion = $('trinity-mp-' + agentKey);
        if (!accordion) return;
        var ctx = mpResolveAgentContext(agentKey);
        if (!mpHasSelection(ctx)) {
            mpRenderPlaceholder(agentKey);
            return;
        }
        var profile = resolveCapabilityProfile(ctx.providerOrDoor, ctx.model);
        var defaults = getAgentDefaultParams(agentKey, ctx.providerOrDoor, ctx.model);
        // Params tersimpan KEKAL merentas pertukaran provider/model (famili boleh
        // berubah; medan yang tidak lagi disokong dibuang oleh collect).
        var saved = _modelParamsState[agentKey] || {};
        mpRenderFields(agentKey, profile, defaults, saved);
        mpRenderNotes(agentKey, profile);
        // Suntik katalog model baharu selepas render (state kekal).
        var modelSel =
            agentKey === 'secondary' ? $('trinity-translation-fallback-model') : $('trinity-' + agentKey + '-model');
        if (modelSel) ensureModelOption(modelSel, ctx.model);
    }

    // Cache params medan semasa setiap kali input berubah — membolehkan
    // pertukaran model kekal memulihkan nilai yang ditaip (state preservation).
    var _modelParamsState = {};

    function mpSnapshot(agentKey) {
        _modelParamsState[agentKey] = mpCollectFieldValues(agentKey);
    }

    // PENTING: pasang listener pada nod accordion (`wrap`) — BUKAN melalui $()
    // kerana kad dibina TERPISAH sebelum di-append ke DOM (getElementById → null).
    function mpWireInputs(agentKey, wrap) {
        if (!wrap) return;
        var handler = function () {
            mpSnapshot(agentKey);
            mpSyncDeviatedWarning(agentKey);
        };
        wrap.addEventListener('input', handler);
        wrap.addEventListener('change', handler);
    }

    // Sub-accordion: tertutup secara lalai; kad dibina SEKALI per slot ejen.
    function buildModelParamsAccordion(agentKey) {
        var wrap = createEl('div', 'trinity-mp collapsed');
        wrap.id = 'trinity-mp-' + agentKey;

        var head = createEl('div', 'trinity-mp-head');
        var title = createEl('span', 'trinity-mp-title', '⚙️ Model Parameters');
        head.appendChild(title);
        var resetBtn = createEl('button', 'trinity-mp-reset');
        resetBtn.type = 'button';
        resetBtn.textContent = 'Reset to Default';
        resetBtn.setAttribute('aria-label', 'Reset model parameters to agent defaults');
        head.appendChild(resetBtn);
        var chevron = createEl('span', 'trinity-mp-chevron', '▾');
        head.appendChild(chevron);
        wrap.appendChild(head);

        var body = createEl('div', 'trinity-mp-body');
        var warn = createEl('div', 'trinity-mp-warning', '⚠️ Custom parameters will bypass the translation cache.');
        warn.id = 'trinity-mp-deviated-' + agentKey;
        warn.style.display = 'none';
        body.appendChild(warn);
        var notesBox = createEl('div', 'trinity-mp-notes');
        notesBox.id = 'trinity-mp-notes-' + agentKey;
        body.appendChild(notesBox);
        var fields = createEl('div', 'trinity-mp-fields');
        fields.id = 'trinity-mp-fields-' + agentKey;
        body.appendChild(fields);
        wrap.appendChild(body);

        head.addEventListener('click', function (e) {
            if (e.target === resetBtn || resetBtn.contains(e.target)) return;
            wrap.classList.toggle('collapsed');
        });
        resetBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            var ctx = mpResolveAgentContext(agentKey);
            delete _modelParamsState[agentKey];
            // [BUG FIX] Gate sama seperti refreshModelParams(): dalam fresh state
            // (provider/model kosong), Reset mesti KEKALKAN placeholder — jangan
            // render profil generik MP_DOOR_GENERIC_OPENAI menimpa placeholder.
            if (!mpHasSelection(ctx)) {
                mpRenderPlaceholder(agentKey);
                return;
            }
            var defaults = getAgentDefaultParams(agentKey, ctx.providerOrDoor, ctx.model);
            var profile = resolveCapabilityProfile(ctx.providerOrDoor, ctx.model);
            mpRenderFields(agentKey, profile, defaults, defaults);
            mpSyncDeviatedWarning(agentKey);
        });

        mpWireInputs(agentKey, wrap);
        return wrap;
    }

    // --- Secondary Fallback Provider (sub-kad Agent Translation) ---

    // [CUSTOM SECONDARY v3.9.33] Slot berasingan untuk Fallback Custom - tiada
    // collision dengan providers.custom milik Primary (senario Primary Custom +
    // Secondary Custom disokong). Kontrak backend: providers.custom_secondary
    // = { enabled, apiKey, baseUrl, model, door }.
    var CUSTOM_SECONDARY_ID = 'custom_secondary';
    var CUSTOM_SECONDARY_ENTRY = {
        id: CUSTOM_SECONDARY_ID,
        label: 'Custom / Proxy',
        door: DOOR_TYPES.OPENAI,
        baseUrl: '',
        isCustom: true
    };

    function isFallbackCustom(providerId) {
        return String(providerId || '').toLowerCase() === CUSTOM_SECONDARY_ID;
    }

    // Resolve entri pembekal fallback; 'custom_secondary' dipetakan ke entri Custom berasingan.
    function resolveFallbackProvider(providerId) {
        if (isFallbackCustom(providerId)) return CUSTOM_SECONDARY_ENTRY;
        var providers = _registryCache || FALLBACK_PROVIDERS;
        return getProviderById(providers, providerId);
    }

    // Door untuk fallback Custom: 'gemini-native' jika dipilih; selain itu openai-compatible (lalai untuk 'auto').
    function resolveFallbackCustomDoor(fmtValue) {
        return fmtValue === DOOR_TYPES.GEMINI ? DOOR_TYPES.GEMINI : DOOR_TYPES.OPENAI;
    }

    // [REKA BENTUK 2026-10-14] Sub-kad fallback dinaik taraf:
    //   - Tiada lagi klik-header-untuk-buka; kandungan sentiasa terlihat.
    //   - Toggle on/off dipindah ke penjuru kanan header (pola iOS switch).
    //   - Status ON/OFF teks kecil untuk kejelasan.
    //   - Medan HIDE (bukan LOCK) bila toggle mati — kekal editable via toggle.
    function buildSecondaryFallbackRow() {
        var wrap = createEl('div', 'trinity-fallback');

        // Header: label kiri + status teks + toggle switch kanan
        var head = createEl('div', 'trinity-fallback-head');

        var headLeft = createEl('div', 'trinity-fallback-head-left');
        headLeft.appendChild(createEl('span', 'trinity-fallback-title', '🛟 Secondary Fallback Provider'));
        var statusChip = createEl('span', 'trinity-fallback-status', 'OFF');
        statusChip.id = 'trinity-translation-fallback-status';
        headLeft.appendChild(statusChip);
        head.appendChild(headLeft);

        // Toggle switch (checkbox disembunyikan + label slider)
        var toggle = createEl('input', 'trinity-fallback-switch-input');
        toggle.type = 'checkbox';
        toggle.id = 'trinity-translation-fallback-enabled';
        toggle.setAttribute('aria-label', 'Enable fallback rescue');
        var toggleLabel = createEl('label', 'trinity-fallback-switch');
        toggleLabel.setAttribute('for', toggle.id);
        toggleLabel.appendChild(createEl('span', 'trinity-fallback-switch-slider'));
        head.appendChild(toggle);
        head.appendChild(toggleLabel);

        wrap.appendChild(head);

        // Body sentiasa terlihat (tiada collapse). Medan HIDE bila OFF.
        var body = createEl('div', 'trinity-fallback-body');

        function syncStatusChip() {
            statusChip.textContent = toggle.checked ? 'ON' : 'OFF';
            statusChip.classList.toggle('is-on', toggle.checked);
        }
        toggle.addEventListener('change', function () {
            syncStatusChip();
            updateFallbackFieldVisibility();
        });
        // Sync status awal
        syncStatusChip();

        // Medan-medan (disembunyikan bila togol mati — HIDE, bukan LOCK)
        var fields = createEl('div', 'trinity-fallback-fields');
        fields.id = 'trinity-translation-fallback-fields';
        fields.style.display = 'none';

        var provRow = createEl('div', 'trinity-field');
        provRow.appendChild(createEl('label', '', 'Fallback provider'));
        var provSel = createEl('select', 'trinity-provider-select');
        provSel.id = 'trinity-translation-fallback-provider';
        provRow.appendChild(provSel);
        fields.appendChild(provRow);
        provSel.addEventListener('change', function () {
            populateFallbackModels(provSel.value, false);
            updateFallbackFieldVisibility();
            // [FASA 4 v3.9.46] Capability profile fallback berubah — bina semula
            // medan Model Parameters slot 'secondary'.
            mpSnapshot('secondary');
            refreshModelParams('secondary');
        });

        var keyRow = createEl('div', 'trinity-field');
        keyRow.appendChild(createEl('label', '', 'Fallback API Key'));
        var keyWrap = createEl('div', 'trinity-input-wrap');
        var keyInput = createEl('input', 'trinity-key-input');
        keyInput.type = 'password';
        keyInput.id = 'trinity-translation-fallback-key';
        keyInput.autocomplete = 'off';
        keyInput.spellcheck = false;
        keyInput.placeholder = 'Enter fallback API key...';
        keyWrap.appendChild(keyInput);

        var eyeBtn = createEl('button', 'trinity-eye-btn');
        eyeBtn.type = 'button';
        eyeBtn.setAttribute('aria-label', 'Show API key');
        eyeBtn.innerHTML = eyeIconSvg(true);
        eyeBtn.addEventListener('click', function () {
            var showing = keyInput.type === 'text';
            keyInput.type = showing ? 'password' : 'text';
            eyeBtn.innerHTML = eyeIconSvg(showing);
            eyeBtn.setAttribute('aria-label', showing ? 'Show API key' : 'Hide API key');
        });
        keyWrap.appendChild(eyeBtn);

        var testBtn = createEl('button', 'trinity-key-icon-btn trinity-key-test-btn', '✓');
        testBtn.type = 'button';
        testBtn.setAttribute('aria-label', 'Test fallback API key');
        testBtn.addEventListener('click', function () {
            testFallbackKey(keyInput, testBtn);
        });
        keyWrap.appendChild(testBtn);
        keyRow.appendChild(keyWrap);
        fields.appendChild(keyRow);

        // [SUSUNAN MEDAN FALLBACK] Hierarki sama seperti kad utama:
        //   1. Provider  2. API Key (+ Test)  3. Base URL  4. Format / Door  5. Model
        // Base URL (Custom sahaja, smart visibility) diletak SEBELUM Format/Door.
        var urlRow = createEl('div', 'trinity-field trinity-custom-only');
        urlRow.id = 'trinity-translation-fallback-baseurl-row';
        urlRow.appendChild(createEl('label', '', 'Base URL'));
        var urlInput = createEl('input', 'trinity-baseurl-input');
        urlInput.type = 'text';
        urlInput.id = 'trinity-translation-fallback-baseurl';
        urlInput.placeholder = 'https://.../v1';
        urlRow.appendChild(urlInput);
        fields.appendChild(urlRow);

        // [CUSTOM SECONDARY v3.9.33] Format / Door — hanya bila fallback = Custom (smart visibility)
        var fmtRow = createEl('div', 'trinity-field trinity-custom-only');
        fmtRow.id = 'trinity-translation-fallback-format-row';
        fmtRow.appendChild(createEl('label', '', 'Format / Door'));
        var fmtSel = createEl('select', 'trinity-format-select');
        fmtSel.id = 'trinity-translation-fallback-format';
        [
            { value: 'auto', label: 'Auto (Recommended)' },
            { value: DOOR_TYPES.OPENAI, label: 'OpenAI-Compatible' },
            { value: DOOR_TYPES.GEMINI, label: 'Gemini Native' }
        ].forEach(function (f) {
            var opt = createEl('option', '', f.label);
            opt.value = f.value;
            fmtSel.appendChild(opt);
        });
        fmtRow.appendChild(fmtSel);
        fields.appendChild(fmtRow);

        // Model — dropdown katalog (pembekal rasmi)
        var modelRow = createEl('div', 'trinity-field');
        modelRow.id = 'trinity-translation-fallback-model-row';
        modelRow.appendChild(createEl('label', '', 'Fallback model'));
        var modelSel = createEl('select', 'trinity-model-select');
        modelSel.id = 'trinity-translation-fallback-model';
        modelRow.appendChild(modelSel);
        fields.appendChild(modelRow);

        // Model — input teks bebas (Custom sahaja, smart visibility)
        var modelCustomRow = createEl('div', 'trinity-field trinity-custom-only');
        modelCustomRow.id = 'trinity-translation-fallback-model-custom-row';
        modelCustomRow.appendChild(createEl('label', '', 'Fallback model'));
        var modelInput = createEl('input', 'trinity-fallback-model-input');
        modelInput.type = 'text';
        modelInput.id = 'trinity-translation-fallback-model-custom';
        modelInput.placeholder = 'e.g. gemini-2.5-flash, deepseek-v4.1-flash';
        modelInput.autocomplete = 'off';
        modelInput.spellcheck = false;
        modelCustomRow.appendChild(modelInput);
        fields.appendChild(modelCustomRow);

        body.appendChild(fields);
        // [FASA 4 v3.9.46] Sub-accordion Model Parameters slot ke-4 ('secondary')
        // — capability profile dijejak daripada provider/model fallback semasa.
        body.appendChild(buildModelParamsAccordion('secondary'));
        wrap.appendChild(body);
        // Event fallback model (dropdown + custom input) mencetuskan render semula
        // medan params slot secondary.
        modelSel.addEventListener('change', function () {
            refreshModelParams('secondary');
        });
        modelInput.addEventListener('change', function () {
            refreshModelParams('secondary');
        });

        refreshFallbackProviderOptions(true);
        return wrap;
    }

    // Isi semula dropdown provider fallback: kecualikan provider utama semasa.
    // [CUSTOM SECONDARY v3.9.33] Entri 'custom' registry DIGANTI slot berasingan
    // 'custom_secondary' yang SENTIASA tersedia (walaupun Primary = Custom).
    function refreshFallbackProviderOptions(keepSelection) {
        var sel = $('trinity-translation-fallback-provider');
        if (!sel) return;
        var primary = $('trinity-translation-provider');
        var primaryId = primary ? String(primary.value || '').toLowerCase() : '';
        var current = keepSelection === false ? '' : sel.value;
        var providers = _registryCache || FALLBACK_PROVIDERS;

        sel.innerHTML = '';
        var placeholder = createEl('option', '', '— Select provider —');
        placeholder.value = '';
        sel.appendChild(placeholder);
        providers.forEach(function (p) {
            if (!p || !p.id) return;
            if (p.isCustom === true || p.id === 'custom') return;
            if (p.id === primaryId) return;
            var o = createEl('option', '', p.label);
            o.value = p.id;
            sel.appendChild(o);
        });
        var customOpt = createEl('option', '', CUSTOM_SECONDARY_ENTRY.label);
        customOpt.value = CUSTOM_SECONDARY_ID;
        customOpt.dataset.isCustom = 'true';
        sel.appendChild(customOpt);

        sel.value = current || '';
        if (sel.selectedIndex < 0) sel.value = '';
        populateFallbackModels(sel.value, true);
        updateFallbackFieldVisibility();
    }

    // Auto-populate model daripada PROVIDER_MODEL_CATALOG (tanpa klik Load Models)
    function populateFallbackModels(providerId, preserveSelection) {
        var m = $('trinity-translation-fallback-model');
        if (!m) return;
        var prev = preserveSelection ? m.value : '';
        m.innerHTML = '';
        var placeholder = createEl('option', '', '— Select model —');
        placeholder.value = '';
        m.appendChild(placeholder);
        if (!providerId) return;
        // [CUSTOM SECONDARY v3.9.33] Custom: model = input teks bebas, tiada katalog.
        if (isFallbackCustom(providerId)) return;
        var provider = resolveFallbackProvider(providerId);
        var door = getProviderDoor(provider);
        var list = PROVIDER_MODEL_CATALOG[providerId] || MODEL_CATALOG[door] || MODEL_CATALOG['openai-compatible'];
        list.forEach(function (name) {
            var o = createEl('option', '', name);
            o.value = name;
            m.appendChild(o);
        });
        if (prev) ensureModelOption(m, prev);
        m.value = prev || '';
    }

    function updateFallbackFieldVisibility() {
        var fields = $('trinity-translation-fallback-fields');
        var toggle = $('trinity-translation-fallback-enabled');
        var sel = $('trinity-translation-fallback-provider');
        var urlRow = $('trinity-translation-fallback-baseurl-row');
        var fmtRow = $('trinity-translation-fallback-format-row');
        var modelRow = $('trinity-translation-fallback-model-row');
        var modelCustomRow = $('trinity-translation-fallback-model-custom-row');
        if (fields) fields.style.display = toggle && toggle.checked ? '' : 'none';
        var custom = !!sel && isCustomProvider(resolveFallbackProvider(sel.value));
        // [ROOT-CAUSE FIX 2 2026-10-10] Show mesti 'grid' eksplisit (inline display:'' tidak mengatasi .trinity-custom-only)
        if (urlRow) urlRow.style.display = custom ? 'grid' : 'none';
        if (fmtRow) fmtRow.style.display = custom ? 'grid' : 'none';
        if (modelRow) modelRow.style.display = custom ? 'none' : '';
        if (modelCustomRow) modelCustomRow.style.display = custom ? 'grid' : 'none';
    }

    // Baca keadaan fallback semasa dari DOM (medan kontrak sedia ada).
    function readFallbackState() {
        var t = $('trinity-translation-fallback-enabled');
        var p = $('trinity-translation-fallback-provider');
        var k = $('trinity-translation-fallback-key');
        var m = $('trinity-translation-fallback-model');
        var mc = $('trinity-translation-fallback-model-custom');
        var u = $('trinity-translation-fallback-baseurl');
        var f = $('trinity-translation-fallback-format');
        var providerId = p ? p.value : '';
        var provider = resolveFallbackProvider(providerId);
        var custom = isCustomProvider(provider);
        var isCustomSecondary = isFallbackCustom(providerId);
        var door = isCustomSecondary ? resolveFallbackCustomDoor(f ? f.value : 'auto') : getProviderDoor(provider);
        var model = custom ? (mc ? mc.value : '') : m ? m.value : '';
        return {
            enabled: !!(t && t.checked && providerId),
            providerId: providerId,
            isCustomSecondary: isCustomSecondary,
            apiKey: k ? k.value.trim() : '',
            model: String(model || '').trim(),
            baseUrl: custom && u ? u.value.trim() : '',
            door: door
        };
    }

    // Uji kunci fallback — sempadan hijau (#15803d) / merah (#b91c1c) seperti kad Trinity.
    async function testFallbackKey(input, btn) {
        if (!input || !btn) return;
        var key = String(input.value || '').trim();
        input.classList.remove('is-valid', 'is-invalid');
        btn.classList.remove('is-valid', 'is-invalid');
        if (!key) {
            input.classList.add('is-invalid');
            btn.classList.add('is-invalid');
            return;
        }
        var fb = readFallbackState();
        var door = fb.door;
        btn.disabled = true;
        try {
            var resp = await fetch('/api/validate-provider', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: fb.isCustomSecondary ? 'custom' : fb.providerId,
                    apiKey: key,
                    door: door,
                    baseUrl: fb.baseUrl
                })
            });
            var data = null;
            try {
                data = await resp.json();
            } catch (_) {
                data = null;
            }
            var ok = !!(data && data.valid === true);
            input.classList.add(ok ? 'is-valid' : 'is-invalid');
            btn.classList.add(ok ? 'is-valid' : 'is-invalid');
        } catch (_) {
            input.classList.add('is-invalid');
            btn.classList.add('is-invalid');
        } finally {
            btn.disabled = false;
        }
    }

    // Rehidrasi nilai fallback (backward-compat: secondaryProvider* + providers.*).
    // [CUSTOM SECONDARY v3.9.33] secondaryProvider 'custom_secondary' → slot Custom berasingan
    // (providers.custom_secondary). Config lama 'custom' dipetakan ke slot yang sama dan dibaca
    // dari providers.custom_secondary, dengan fallback ke providers.custom (kompatibiliti legacy).
    function applyFallbackValues(cfg) {
        if (!cfg) return;
        var t = $('trinity-translation-fallback-enabled');
        var p = $('trinity-translation-fallback-provider');
        var k = $('trinity-translation-fallback-key');
        var m = $('trinity-translation-fallback-model');
        var mc = $('trinity-translation-fallback-model-custom');
        var u = $('trinity-translation-fallback-baseurl');
        var f = $('trinity-translation-fallback-format');
        if (!t || !p) return;

        var rawPid = String(cfg.secondaryProvider || '').toLowerCase();
        var isCustomSec = rawPid === CUSTOM_SECONDARY_ID || rawPid === 'custom';
        var pid = isCustomSec ? CUSTOM_SECONDARY_ID : rawPid;
        var on = cfg.multiProviderEnabled === true && cfg.secondaryProviderEnabled === true && !!pid;
        t.checked = on;
        // [INTEGRATION FIX 2026-10-14] Programmatic .checked tidak menyalakan event
        // 'change' — status chip mesti disegerakkan manual di sini (race rehydrate).
        var statusChip = $('trinity-translation-fallback-status');
        if (statusChip) {
            statusChip.textContent = on ? 'ON' : 'OFF';
            statusChip.classList.toggle('is-on', on);
        }
        // [BUG FIX v3.9.43] NON-DESTRUCTIVE: kekalkan pilihan provider/model
        // fallback semasa merentas repopulasi (dahulunya `false` menetapkan
        // semula ke placeholder dan memadam pilihan pengguna).
        refreshFallbackProviderOptions(true);
        if (pid) {
            p.value = pid;
            populateFallbackModels(pid, true);
        }
        var providersMap = cfg.providers || {};
        var saved = {};
        if (pid) {
            saved = isCustomSec
                ? providersMap[CUSTOM_SECONDARY_ID] || providersMap.custom || {}
                : providersMap[pid] || {};
        }
        // [BUG FIX v3.9.43] Tulis HANYA apabila data konfigurasi benar-benar
        // mempunyai nilai — medan kosong tidak lagi memadam input yang telah
        // ditaip pengguna (mandat non-destructive rehydrate).
        if (k && saved.apiKey) k.value = saved.apiKey;
        if (isCustomSec) {
            if (mc && saved.model) mc.value = saved.model;
            if (f && (saved.door === DOOR_TYPES.GEMINI || saved.door === DOOR_TYPES.OPENAI)) {
                f.value = saved.door;
            }
        } else if (saved.model && m) {
            ensureModelOption(m, saved.model);
            m.value = saved.model;
        }
        if (u && saved.baseUrl) u.value = saved.baseUrl;
        updateFallbackFieldVisibility();
    }

    // --- Populate Provider dropdown ---

    function populateProviderDropdown(agentKey, providers) {
        var sel = $('trinity-' + agentKey + '-provider');
        if (!sel) return;
        // [BUG FIX v3.9.43] Kekalkan pilihan semasa merentas repopulasi.
        // Sebelum ini innerHTML='' menetapkan semula ke placeholder
        // "— Select provider —" — dan kerana registry dimuat secara ASYNC
        // (mount().fetchProviderRegistry().then), repopulasi boleh berlaku
        // SELEPAS rehydrate dan memadam provider yang telah dipilih.
        var prev = sel.value || '';
        sel.innerHTML = '';
        var def = createEl('option', '', '— Select provider —');
        def.value = '';
        sel.appendChild(def);
        providers.forEach(function (p) {
            var o = createEl('option', '', p.label);
            o.value = p.id;
            o.dataset.door = p.door;
            o.dataset.isCustom = p.isCustom === true ? 'true' : 'false';
            sel.appendChild(o);
        });
        if (prev) {
            sel.value = prev;
            if (sel.value !== prev) {
                // Provider tersimpan tiada dalam senarai registry/fallback semasa —
                // sisip entri supaya nilai tidak terpadam secara senyap.
                var extra = createEl('option', '', prev);
                extra.value = prev;
                sel.appendChild(extra);
                sel.value = prev;
            }
        }
    }

    // --- Smart Visibility ---

    function updateVisibility(agentKey) {
        var providerSel = $('trinity-' + agentKey + '-provider');
        var urlRow = $('trinity-' + agentKey + '-baseurl-row');
        var fmtRow = $('trinity-' + agentKey + '-format-row');
        var rotationRow = $('trinity-' + agentKey + '-rotation-row');
        if (!providerSel || !urlRow || !fmtRow) return;

        var providers = _registryCache || FALLBACK_PROVIDERS;
        var selectedProvider = getProviderById(providers, providerSel.value);
        var isCustom = isCustomProvider(selectedProvider);
        var isGemini = isGeminiNativeCard(agentKey);

        // [ROOT-CAUSE FIX 2 2026-10-10] inline display:'' TIDAK mengatasi rule CSS
        // .trinity-custom-only { display: none } — untuk SHOW mesti set nilai eksplisit
        // 'grid' (nilai asal .trinity-field). Hide kekal 'none' (inline mengatasi class).
        urlRow.style.display = isCustom ? 'grid' : 'none';
        fmtRow.style.display = isCustom ? 'grid' : 'none';
        if (rotationRow) {
            rotationRow.style.display = isGemini ? 'grid' : 'none';
        }

        if (agentKey === 'translation') refreshFallbackProviderOptions(true);

        // Auto-detect format for Custom (hanya bila Custom dipilih)
        if (isCustom) {
            var keyInput = $('trinity-' + agentKey + '-key');
            var fmtSelect = $('trinity-' + agentKey + '-format');
            if (keyInput && fmtSelect && fmtSelect.value === 'auto') {
                var detected = detectFormatFromKey(keyInput.value);
                if (detected) {
                    // Biarkan 'auto' — autodetect backend yang membuat keputusan muktamad
                }
            }
        }
    }

    // --- Key Rotation Row (Gemini Native official/custom) ---

    function keyState() {
        return window.SubFaberTrinityKeyState;
    }

    function isGeminiNativeCard(agentKey) {
        var providerSel = $('trinity-' + agentKey + '-provider');
        var fmtEl = $('trinity-' + agentKey + '-format');
        var provider = getProviderById(_registryCache || FALLBACK_PROVIDERS, providerSel ? providerSel.value : '');
        return resolveEffectiveDoor(provider, fmtEl ? fmtEl.value : 'auto') === DOOR_TYPES.GEMINI;
    }

    function readRotationPool(agentKey, apiKey) {
        var toggle = $('trinity-' + agentKey + '-rotation-enabled');
        var mode = $('trinity-' + agentKey + '-rotation-mode');
        var list = $('trinity-' + agentKey + '-rotation-keys-list');
        var additionalKeys = [];
        if (list) {
            Array.prototype.forEach.call(list.querySelectorAll('.trinity-key-input'), function (input) {
                additionalKeys.push(input.value);
            });
        }
        return keyState().buildGeminiKeyPool({
            primaryKey: apiKey,
            additionalKeys: additionalKeys,
            keyRotationEnabled: toggle ? toggle.checked === true : false,
            keyRotationMode: mode ? mode.value : 'per-batch'
        });
    }

    function applyRotationPool(agentKey, slot, cfg) {
        var toggle = $('trinity-' + agentKey + '-rotation-enabled');
        var mode = $('trinity-' + agentKey + '-rotation-mode');
        var list = $('trinity-' + agentKey + '-rotation-keys-list');
        if (!toggle || !mode || !list) return;
        var legacy = agentKey === 'translation';
        var pool = keyState().buildGeminiKeyPool({
            primaryKey: slot.apiKey || (legacy ? cfg.geminiApiKey : ''),
            storedKeys: Array.isArray(slot.apiKeys) ? slot.apiKeys : legacy ? cfg.geminiApiKeys : [],
            keyRotationEnabled:
                typeof slot.keyRotationEnabled === 'boolean'
                    ? slot.keyRotationEnabled
                    : legacy
                      ? cfg.geminiKeyRotationEnabled
                      : false,
            keyRotationMode: slot.keyRotationMode || (legacy ? cfg.geminiKeyRotationMode : 'per-batch')
        });
        toggle.checked = pool.keyRotationEnabled;
        toggle.dispatchEvent(new Event('change'));
        mode.value = pool.keyRotationMode;
        list.innerHTML = '';
        keyState()
            .getAdditionalGeminiKeys(pool.apiKey, pool.apiKeys)
            .forEach(function (key) {
                addRotationKeyInput(agentKey, key);
            });
    }

    function buildKeyRotationRow(agentKey) {
        var row = createEl('div', 'trinity-field trinity-gemini-only');
        row.id = 'trinity-' + agentKey + '-rotation-row';

        var toggleWrap = createEl('div', 'trinity-rotation-toggle');
        var toggle = createEl('input', 'trinity-rotation-checkbox');
        toggle.type = 'checkbox';
        toggle.id = 'trinity-' + agentKey + '-rotation-enabled';
        toggleWrap.appendChild(toggle);
        toggleWrap.appendChild(createEl('label', '', 'Enable Gemini API key rotation'));
        row.appendChild(toggleWrap);

        // Rotation frequency (hidden unless enabled)
        var freqRow = createEl('div', 'trinity-field trinity-rotation-dependent');
        freqRow.id = 'trinity-' + agentKey + '-rotation-freq-row';
        freqRow.style.display = 'none';
        freqRow.appendChild(createEl('label', '', 'Rotation Frequency'));
        var freqSelect = createEl('select', 'trinity-rotation-freq');
        freqSelect.id = 'trinity-' + agentKey + '-rotation-mode';
        [
            { v: 'per-batch', label: 'Per batch' },
            { v: 'per-request', label: 'Per request' }
        ].forEach(function (f) {
            var o = createEl('option', '', f.label);
            o.value = f.v;
            freqSelect.appendChild(o);
        });
        freqRow.appendChild(freqSelect);
        row.appendChild(freqRow);

        // Additional API Keys list (hidden unless enabled)
        var keysRow = createEl('div', 'trinity-field trinity-rotation-dependent');
        keysRow.id = 'trinity-' + agentKey + '-rotation-keys-row';
        keysRow.style.display = 'none';
        keysRow.appendChild(createEl('label', '', 'Additional API Keys'));

        var keysList = createEl('div', 'trinity-keys-list');
        keysList.id = 'trinity-' + agentKey + '-rotation-keys-list';
        keysRow.appendChild(keysList);

        var btnWrap = createEl('div', 'trinity-keys-actions');
        var addBtn = createEl('button', 'trinity-btn-secondary');
        addBtn.type = 'button';
        addBtn.textContent = '+ Add Key';
        addBtn.addEventListener('click', function () {
            addRotationKeyInput(agentKey, '');
        });
        btnWrap.appendChild(addBtn);

        var bulkBtn = createEl('button', 'trinity-btn-secondary');
        bulkBtn.type = 'button';
        bulkBtn.textContent = 'Bulk Import…';
        bulkBtn.addEventListener('click', function () {
            // Sambung semula modal import pukal sedia ada
            if (window.BulkKeyImport && typeof window.BulkKeyImport.open === 'function') {
                window.BulkKeyImport.open(function (importedKeys) {
                    // [SMART DEDUPLICATION v3.9.22] Saring kunci pendua sebelum
                    // memasukkan baris baharu:
                    //   1. kunci yang sama persis dengan API Key utama di atas;
                    //   2. kunci yang sudah wujud dalam senarai Additional API Keys;
                    //   3. (dedup dalaman tampal sudah dikendalikan parser — Set).
                    var primaryInput = $('trinity-' + agentKey + '-key');
                    var seen = {};
                    if (primaryInput && primaryInput.value.trim()) {
                        seen[primaryInput.value.trim()] = true;
                    }
                    var keysList = $('trinity-' + agentKey + '-rotation-keys-list');
                    if (keysList) {
                        var existing = keysList.querySelectorAll('.trinity-key-input');
                        existing.forEach(function (el) {
                            var v = el.value.trim();
                            if (v) seen[v] = true;
                        });
                    }
                    var imported = 0;
                    var skipped = 0;
                    (Array.isArray(importedKeys) ? importedKeys : []).forEach(function (k) {
                        var v = String(k || '').trim();
                        if (!v || seen[v]) {
                            skipped++;
                            return;
                        }
                        seen[v] = true;
                        addRotationKeyInput(agentKey, v);
                        imported++;
                    });
                    return { imported: imported, skipped: skipped };
                });
            } else {
                console.warn('[Trinity] Bulk key import modal not loaded');
            }
        });
        btnWrap.appendChild(bulkBtn);
        keysRow.appendChild(btnWrap);
        row.appendChild(keysRow);

        // Toggle listener
        toggle.addEventListener('change', function () {
            var enabled = toggle.checked;
            freqRow.style.display = enabled ? '' : 'none';
            keysRow.style.display = enabled ? '' : 'none';
        });

        return row;
    }

    function addRotationKeyInput(agentKey, value) {
        var keysList = $('trinity-' + agentKey + '-rotation-keys-list');
        if (!keysList) return;
        var wrap = createEl('div', 'trinity-key-entry');
        var input = createEl('input', 'trinity-key-input');
        input.type = 'password';
        input.value = value || '';
        input.placeholder = 'AIzaSy… or AQ.Ab8… or sk-…';
        wrap.appendChild(input);
        // [BUTANG MATA v3.9.23] SVG eye/eye-slash profesional (bukan emoji).
        var eyeBtn = createEl('button', 'trinity-eye-btn trinity-key-icon-btn');
        eyeBtn.type = 'button';
        eyeBtn.setAttribute('aria-label', 'Show API key');
        eyeBtn.innerHTML = eyeIconSvg(true);
        eyeBtn.addEventListener('click', function () {
            var showing = input.type === 'text';
            input.type = showing ? 'password' : 'text';
            eyeBtn.innerHTML = eyeIconSvg(showing);
            eyeBtn.setAttribute('aria-label', showing ? 'Show API key' : 'Hide API key');
        });
        wrap.appendChild(eyeBtn);
        // [BUTANG TEST PER-BARIS v3.9.23] Uji kunci individu terus ke endpoint
        // /api/validate-provider dengan konteks agent (provider + door + baseUrl
        // custom). Hasil: border input hijau (sah) / merah (tidak sah) +
        // ikon butang ✓/✕ sepadan; spinner '…' semasa ujian berjalan.
        var testBtn = createEl('button', 'trinity-key-icon-btn trinity-key-test-btn');
        testBtn.type = 'button';
        testBtn.setAttribute('aria-label', 'Test API key');
        testBtn.textContent = '✓';
        testBtn.addEventListener('click', function () {
            testRotationKey(agentKey, input, testBtn);
        });
        wrap.appendChild(testBtn);
        var removeBtn = createEl('button', 'trinity-key-remove trinity-key-icon-btn');
        removeBtn.type = 'button';
        removeBtn.textContent = '×';
        removeBtn.setAttribute('aria-label', 'Remove key');
        removeBtn.addEventListener('click', function () {
            wrap.remove();
        });
        wrap.appendChild(removeBtn);
        keysList.appendChild(wrap);
    }

    // [TEST KUNCI PER-BARIS v3.9.23] Mengesahkan satu kunci tambahan menggunakan
    // konteks provider/door/baseUrl kad agent yang sama (Universal endpoint).
    async function testRotationKey(agentKey, input, testBtn) {
        if (!input || !testBtn) return;
        var key = String(input.value || '').trim();
        input.classList.remove('is-valid', 'is-invalid');
        testBtn.classList.remove('is-valid', 'is-invalid');
        if (!key) {
            input.classList.add('is-invalid');
            testBtn.classList.add('is-invalid');
            testBtn.textContent = '✕';
            return;
        }
        var providerSel = $('trinity-' + agentKey + '-provider');
        var fmtSelect = $('trinity-' + agentKey + '-format');
        var baseUrlInput = $('trinity-' + agentKey + '-baseurl');
        var providerId = providerSel ? providerSel.value : '';
        var providers = _registryCache || FALLBACK_PROVIDERS;
        var provider = getProviderById(providers, providerId);
        var door = getProviderDoor(provider);
        var isCustom = isCustomProvider(provider);
        var payloadDoor = isCustom && fmtSelect && fmtSelect.value !== 'auto' ? fmtSelect.value : door;
        var payloadBaseUrl = isCustom && baseUrlInput ? baseUrlInput.value.trim() : '';

        // [TOTAL UNLOCK FASA 2] (d) Keadaan memuatkan: kelas is-loading —
        // CSS .is-loading::before membekalkan spinner pusingan + denyut (elak
        // double-submit melalui disabled + pointer-events).
        testBtn.disabled = true;
        testBtn.textContent = '';
        testBtn.classList.add('is-loading');
        try {
            var resp = await fetch('/api/validate-provider', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: providerId,
                    apiKey: key,
                    door: payloadDoor,
                    baseUrl: payloadBaseUrl
                })
            });
            var data = null;
            try {
                data = await resp.json();
            } catch (_) {
                data = null;
            }
            if (data && data.valid === true) {
                input.classList.add('is-valid');
                testBtn.classList.add('is-valid');
                testBtn.textContent = '✓';
            } else {
                input.classList.add('is-invalid');
                testBtn.classList.add('is-invalid');
                testBtn.textContent = '✕';
                if (typeof showAlert === 'function') {
                    var msg = data && data.error ? String(data.error).slice(0, 80) : 'authentication failed';
                    showAlert('Invalid API key — ' + msg, 'error');
                }
            }
        } catch (err) {
            input.classList.add('is-invalid');
            testBtn.classList.add('is-invalid');
            testBtn.textContent = '✕';
            if (typeof showAlert === 'function') {
                showAlert('Invalid API key — ' + (err && err.message ? err.message : 'network error'), 'error');
            }
        } finally {
            // [TOTAL UNLOCK FASA 2] Tanggalkan keadaan memuatkan (spinner + denyut)
            // selepas ujian tamat; butang kembali interaktif.
            testBtn.classList.remove('is-loading');
            testBtn.disabled = false;
        }
    }

    // --- Populate Model <select> dropdown ---

    function populateModelDropdown(agentKey, models, preserveSelection) {
        var select = $('trinity-' + agentKey + '-model');
        if (!select) return;
        var prev = preserveSelection ? select.value : '';
        select.innerHTML = '';
        var placeholder = createEl('option', '', '— Select model —');
        placeholder.value = '';
        select.appendChild(placeholder);
        var seen = {};
        models.forEach(function (m) {
            var name = typeof m === 'string' ? m : m.name || m.id || '';
            if (!name) return;
            var clean = name.replace(/^models\//, '');
            if (!clean || seen[clean]) return;
            seen[clean] = true;
            var o = createEl('option', '', clean);
            o.value = clean;
            select.appendChild(o);
        });
        // Pastikan nilai sedia ada (stored/current) kekal sebagai <option> supaya
        // penetapan .value melekat — walaupun model tiada dalam katalog baharu.
        if (prev && !seen[prev]) {
            var extra = createEl('option', '', prev);
            extra.value = prev;
            select.appendChild(extra);
        }
        if (prev) select.value = prev;
    }

    // Pastikan nilai model wujud sebagai <option> dalam <select> — penetapan
    // .value pada <select> diabaikan oleh pelayan jika tiada option sepadan.
    function ensureModelOption(select, value) {
        if (!select || !value) return;
        for (var i = 0; i < select.options.length; i++) {
            if (select.options[i].value === value) return;
        }
        var o = createEl('option', '', value);
        o.value = value;
        select.appendChild(o);
    }

    // --- Bulk Import Modal (Trinity) ---
    //
    // Bridge yang menjana modal secara dinamik (zero-network — parser daripada
    // window.SubFaberBulkKeyImport). Dieksport sebagai window.BulkKeyImport supaya
    // butang "Bulk Import…" pada kad Trinity membukanya; kunci yang diimport
    // disalurkan terus ke baris "Additional API Keys" melalui addRotationKeyInput.

    var _bulkModalEl = null;

    function ensureBulkImportModal() {
        if (_bulkModalEl && document.body.contains(_bulkModalEl)) return _bulkModalEl;
        var modal = createEl('div', 'trinity-bulk-modal');
        modal.id = 'trinityBulkImportModal';

        var box = createEl('div', 'trinity-bulk-box');
        box.appendChild(createEl('div', 'trinity-bulk-title', 'Bulk Import API Keys'));
        box.appendChild(
            createEl(
                'div',
                'trinity-bulk-hint',
                'Paste keys in any format — one per line, numbered lists, CSV or JSON. Keys are detected automatically.'
            )
        );

        var ta = createEl('textarea', 'trinity-bulk-textarea');
        ta.id = 'trinityBulkImportTextarea';
        ta.placeholder = 'AIzaSy…\nAQ.Ab8…\nsk-…';
        ta.spellcheck = false;
        ta.autocomplete = 'off';
        box.appendChild(ta);

        var status = createEl('div', 'trinity-bulk-status');
        status.id = 'trinityBulkImportStatus';
        box.appendChild(status);

        var actions = createEl('div', 'trinity-bulk-actions');
        var cancelBtn = createEl('button', 'trinity-btn-secondary');
        cancelBtn.type = 'button';
        cancelBtn.textContent = 'Cancel';
        cancelBtn.addEventListener('click', closeBulkImportModal);
        actions.appendChild(cancelBtn);

        var confirmBtn = createEl('button', 'trinity-btn-primary');
        confirmBtn.type = 'button';
        confirmBtn.id = 'trinityBulkImportConfirm';
        confirmBtn.textContent = 'Import';
        actions.appendChild(confirmBtn);
        box.appendChild(actions);

        modal.appendChild(box);
        modal.addEventListener('click', function (e) {
            if (e.target === modal) closeBulkImportModal();
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && modal.classList.contains('show')) closeBulkImportModal();
        });

        document.body.appendChild(modal);
        _bulkModalEl = modal;
        return modal;
    }

    function closeBulkImportModal() {
        if (!_bulkModalEl) return;
        _bulkModalEl.classList.remove('show');
        var ta = $('trinityBulkImportTextarea');
        if (ta) ta.value = '';
        var status = $('trinityBulkImportStatus');
        if (status) {
            status.className = 'trinity-bulk-status';
            status.textContent = '';
        }
    }

    function openBulkImportModal(onKeys) {
        var modal = ensureBulkImportModal();
        if (!modal) return;
        var ta = $('trinityBulkImportTextarea');
        var status = $('trinityBulkImportStatus');
        var confirmBtn = $('trinityBulkImportConfirm');
        if (!ta || !confirmBtn) return;

        if (status) status.textContent = '';

        // Ganti listener confirm lama (anti-pendengar-berlonggok antara panggilan).
        var freshConfirm = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(freshConfirm, confirmBtn);
        freshConfirm.addEventListener('click', function () {
            var parser =
                typeof window !== 'undefined' && window.SubFaberBulkKeyImport
                    ? window.SubFaberBulkKeyImport.parseBulkKeys
                    : null;
            if (!parser) {
                if (status) {
                    status.className = 'trinity-bulk-status is-error';
                    status.textContent = 'Parser module not loaded.';
                }
                return;
            }
            var result = parser(ta.value || '', {});
            if (!result.keys.length) {
                if (status) {
                    status.className = 'trinity-bulk-status is-error';
                    status.textContent = 'No valid API keys detected.';
                }
                return;
            }
            var summary = null;
            if (typeof onKeys === 'function') summary = onKeys(result.keys);
            // [STATUS IMPORT v3.9.22] Modal kekal terbuka dengan mesej status —
            // bilangan kunci berjaya diimport + bilangan disaring keluar
            // (pendua kunci utama / senarai sedia ada). Textarea dikosongkan
            // supaya tampal semula tidak mengimport ganda.
            var imported = summary && typeof summary.imported === 'number' ? summary.imported : result.keys.length;
            var skipped = summary && typeof summary.skipped === 'number' ? summary.skipped : 0;
            if (status) {
                status.className = 'trinity-bulk-status is-success';
                status.textContent =
                    'Imported ' +
                    imported +
                    ' key' +
                    (imported === 1 ? '' : 's') +
                    (skipped > 0
                        ? ' · ' + skipped + ' duplicate' + (skipped === 1 ? '' : 's') + ' filtered out.'
                        : '.');
            }
            ta.value = '';
        });

        modal.classList.add('show');
        ta.focus();
    }

    // Bridge global untuk butang "Bulk Import…" Trinity.
    if (typeof window !== 'undefined') {
        window.BulkKeyImport = { open: openBulkImportModal };
    }

    // --- Validate handler (satu butang tunggal) ---

    function wireValidate(agentKey) {
        var btn = document.querySelector('[data-agent-validate="' + agentKey + '"]');
        if (!btn) return;
        btn.addEventListener('click', function () {
            runAgentValidate(agentKey, btn);
        });
    }

    async function runAgentValidate(agentKey, btn) {
        var keyInput = $('trinity-' + agentKey + '-key');
        var badge = $('trinity-' + agentKey + '-badge');
        var providerSel = $('trinity-' + agentKey + '-provider');
        if (!keyInput || !badge) return;

        var key = keyInput.value.trim();
        if (!key) {
            badge.textContent = 'Enter a key first';
            badge.className = 'trinity-format-badge tone-red';
            return;
        }

        btn.disabled = true;
        var old = btn.innerHTML;
        btn.innerHTML = '<span class="validate-icon">…</span>';

        try {
            var providerId = providerSel ? providerSel.value : '';
            var providers = _registryCache || FALLBACK_PROVIDERS;
            var provider = getProviderById(providers, providerId);
            var door = getProviderDoor(provider);

            // Custom: door + baseUrl manual daripada medan yang dipaparkan
            var isCustom = isCustomProvider(provider);
            var fmtSelect = $('trinity-' + agentKey + '-format');
            var baseUrlInput = $('trinity-' + agentKey + '-baseurl');
            var payloadDoor = isCustom && fmtSelect && fmtSelect.value !== 'auto' ? fmtSelect.value : door;
            var payloadBaseUrl = isCustom && baseUrlInput ? baseUrlInput.value.trim() : '';

            // [MANDAT FRONTEND 2026-10-10] Universal endpoint — gantikan legasi /api/validate-gemini
            var resp = await fetch('/api/validate-provider', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    provider: providerId,
                    apiKey: key,
                    door: payloadDoor,
                    baseUrl: payloadBaseUrl
                })
            });
            var data = null;
            try {
                data = await resp.json();
            } catch (_) {
                data = null;
            }

            if (data && data.valid === true) {
                badge.textContent = 'Valid ✓ (' + providerId + ')';
                badge.className = 'trinity-format-badge tone-green';
                // [GELUNG HIJAU KUNCI UTAMA v3.9.24] Sempadan/gelung hijau pekat
                // seragam dengan baris Additional API Keys.
                keyInput.classList.remove('is-invalid');
                keyInput.classList.add('is-valid');
                // Isi senarai model terus ke dropdown Model
                if (Array.isArray(data.models) && data.models.length) {
                    populateModelDropdown(agentKey, data.models.slice(0, 50), true);
                } else {
                    // Fallback ke katalog statik jika API tiada senarai model
                    var providerModels =
                        PROVIDER_MODEL_CATALOG[providerId] || MODEL_CATALOG[door] || MODEL_CATALOG['openai-compatible'];
                    populateModelDropdown(agentKey, providerModels, true);
                }
                // [RESOLVEDDOOR SYNC 2026-10-10] Backend memulangkan resolvedDoor
                // apabila pintu ditentukan secara automatik (auto-detect/fallback).
                // Petakan ke nilai dropdown Format frontend supaya pengguna melihat
                // pintu sebenar yang berjaya disahkan — contoh: Crazy Router /v1beta
                // disahkan sebagai gemini-native walaupun kunci sk-.
                if (data.resolvedDoor) {
                    var fmtSelect = $('trinity-' + agentKey + '-format');
                    if (fmtSelect) {
                        var mapped = doorToDropdownValue(data.resolvedDoor);
                        if (mapped) fmtSelect.value = mapped;
                    }
                }
            } else {
                var errMsg = data && data.error ? String(data.error).slice(0, 60) : 'Invalid key';
                badge.textContent = 'Invalid: ' + errMsg;
                badge.className = 'trinity-format-badge tone-red';
                keyInput.classList.remove('is-valid');
                keyInput.classList.add('is-invalid');
            }
        } catch (err) {
            badge.textContent = 'Failed: ' + (err && err.message ? err.message : 'network error');
            badge.className = 'trinity-format-badge tone-red';
            keyInput.classList.remove('is-valid');
            keyInput.classList.add('is-invalid');
        } finally {
            btn.disabled = false;
            btn.innerHTML = old;
        }
    }

    // --- Autodetect badge update + reaktif URL-to-Door ---

    // [BUG FIX v3.9.44] Kemas kini lencana autodetect untuk SATU ejen tanpa
    // menyentuh kelas sempadan input (is-valid/is-invalid). Diperlukan kerana
    // `applyAgentValues()` mengisi `keyInput.value` secara PROGRAMATIK —
    // penetapan `.value` tidak mencetuskan event 'input', jadi lencana kekal
    // memaparkan 'No key' walaupun kunci telah diisi (kecacatan v3.9.43).
    function updateKeyBadge(agentKey) {
        var keyInput = $('trinity-' + agentKey + '-key');
        var badge = $('trinity-' + agentKey + '-badge');
        if (!keyInput || !badge) return;
        var value = String(keyInput.value || '').trim();
        var meta = value ? formatBadgeMeta(detectFormatFromKey(value)) : { label: 'No key', tone: 'muted' };
        badge.textContent = meta.label;
        badge.className = 'trinity-format-badge tone-' + meta.tone;
    }

    // [URL-TO-DOOR SYNC 2026-10-10] Pemetaan door backend → nilai dropdown
    // Format frontend. Kekal selari dengan DOOR_TO_FORMAT (legacy pendek).
    var DOOR_TO_FORMAT_VALUE = {
        'gemini-native': 'gemini',
        'openai-compatible': 'openai',
        'anthropic-messages': 'anthropic'
    };

    function doorToDropdownValue(door) {
        return DOOR_TO_FORMAT_VALUE[door] || null;
    }

    // [BUG FIX v3.9.44] Pemetaan songsang format legacy ('gemini'|'openai'|
    // 'anthropic') → nilai penuh dropdown Format/Door. Nilai yang sudah menjadi
    // door penuh dikekalkan; 'auto' kekal 'auto'. Tanpa peta ini, penetapan
    // fmtEl.value='openai' TIDAK padan sebarang <option> → dropdown Format/Door
    // menjadi KOSONG selepas pertukaran mod (kecacatan v3.9.43).
    var FORMAT_TO_DOOR_VALUE = {
        gemini: 'gemini-native',
        openai: 'openai-compatible',
        anthropic: 'anthropic-messages'
    };

    function formatToDoorValue(format) {
        if (!format) return null;
        if (format === 'auto') return 'auto';
        if (DOOR_TO_FORMAT_VALUE[format]) return format; // sudah door penuh
        return FORMAT_TO_DOOR_VALUE[format] || null;
    }

    function wireAutodetect(agentKey) {
        var keyInput = $('trinity-' + agentKey + '-key');
        var badge = $('trinity-' + agentKey + '-badge');
        var providerSel = $('trinity-' + agentKey + '-provider');
        if (!keyInput || !badge || !providerSel) return;

        function refresh() {
            var detected = detectFormatFromKey(keyInput.value);
            var meta = formatBadgeMeta(detected);
            badge.textContent = meta.label;
            badge.className = 'trinity-format-badge tone-' + meta.tone;
            // [RESET GELUNG v3.9.24] Sebarang perubahan nilai kunci membatalkan
            // status ujian terdahulu — sempadan hijau/merah dibersihkan semula.
            keyInput.classList.remove('is-valid', 'is-invalid');
            updateVisibility(agentKey);
        }

        keyInput.addEventListener('input', refresh);
        providerSel.addEventListener('change', function () {
            updateVisibility(agentKey);
            // Auto-populate model catalog untuk provider baharu
            var providers = _registryCache || FALLBACK_PROVIDERS;
            var provider = getProviderById(providers, providerSel.value);
            var door = getProviderDoor(provider);
            var providerModels =
                PROVIDER_MODEL_CATALOG[providerSel.value] || MODEL_CATALOG[door] || MODEL_CATALOG['openai-compatible'];
            populateModelDropdown(agentKey, providerModels, true);
            // [FASA 4 v3.9.46] Capability profile berubah — bina semula medan
            // Model Parameters (fresh state medan, nilai tersimpan dikekalkan).
            mpSnapshot(agentKey);
            refreshModelParams(agentKey);
        });

        // [REAL-TIME URL-TO-DOOR 2026-10-10] Pendengar input/change pada Base URL:
        // menaip/menampal '/v1beta' → Format auto gemini-native; '/v1' (bukan beta)
        // → openai-compatible. Hanya aktif untuk Custom/Proxy (medan ini memang
        // tersembunyi untuk rasmi). Tidak merosakkan pilihan manual pengguna —
        // penukaran berlaku SEKALI setiap input, pengguna bebas menukar semula
        // kemudian (tiada watcher berterusan).
        var urlInput = $('trinity-' + agentKey + '-baseurl');
        var fmtSelect = $('trinity-' + agentKey + '-format');
        if (urlInput && fmtSelect) {
            var syncDoorFromUrl = function () {
                var providers = _registryCache || FALLBACK_PROVIDERS;
                var provider = getProviderById(providers, providerSel.value);
                if (!isCustomProvider(provider)) return;
                var url = String(urlInput.value || '').trim();
                if (!url) return;
                if (url.includes('/v1beta')) {
                    fmtSelect.value = 'gemini-native';
                } else if (/\/v1(?!beta)/.test(url)) {
                    fmtSelect.value = 'openai-compatible';
                }
                updateVisibility(agentKey);
                refreshModelParams(agentKey);
            };
            urlInput.addEventListener('input', syncDoorFromUrl);
            urlInput.addEventListener('change', syncDoorFromUrl);
        }
        // Pertukaran door turut mengawal Smart Visibility rotation; pool input
        // kekal dalam DOM walaupun row disembunyikan untuk door bukan-Gemini.
        if (fmtSelect) {
            fmtSelect.addEventListener('change', function () {
                updateVisibility(agentKey);
                refreshModelParams(agentKey);
            });
        }

        refresh();
    }

    // --- Mount utama ---

    function getAgentConfig(cfg, agentKey) {
        if (!cfg) return null;
        var t = cfg.trinity || {};
        return t[agentKey] || null;
    }

    // [BUG FIX v3.9.43] Fallback kontrak rehidrasi: sesetengah hash config lama
    // menyimpan kredential hanya dalam `providers.<mainProvider>` (bukan blok
    // trinity.translation). Tanpa fallback ini, kad Agent Translation dirender
    // kosong walaupun kunci sebenarnya wujud. Utamakan `trinity.translation`,
    // kemudian `providers.<mainProvider>` / `providers.gemini`.
    // [BUG FIX v3.9.44 — FRESH STATE] Entri pembekal HANYA dipetakan apabila ia
    // benar-benar dikonfigurasikan (apiKey tidak kosong, atau Custom/Proxy dengan
    // baseUrl). Sebelum ini `entry.apiKey || entry.model` memadankan entri lalai
    // (mainProvider: 'gemini' daripada objek konfigurasi kosong) → kad Agent
    // Translation auto-memilih 'Google Gemini' + 'gemini-3-flash-preview'
    // walaupun pengguna belum memasukkan sebarang kunci API.
    function deriveTranslationFromProviders(cfg) {
        if (!cfg || typeof cfg !== 'object') return null;
        var providersMap = cfg.providers || {};
        var mainKey = String(cfg.mainProvider || '').toLowerCase();
        var candidates = [];
        if (mainKey) candidates.push(mainKey);
        if (candidates.indexOf('gemini') === -1) candidates.push('gemini');
        for (var i = 0; i < candidates.length; i++) {
            var entry = providersMap[candidates[i]];
            if (!entry || typeof entry !== 'object') continue;
            var entryApiKey = String(entry.apiKey || '').trim();
            var entryBaseUrl = String(entry.baseUrl || '').trim();
            // Kredential sebenar sahaja — jangan petakan entri lalai/kosong.
            if (!entryApiKey && !entryBaseUrl) continue;
            return {
                apiKey: entryApiKey,
                format: entry.door === DOOR_TYPES.GEMINI ? DOOR_TYPES.GEMINI : entry.door || 'auto',
                baseUrl: entryBaseUrl,
                model: entry.model || '',
                provider: candidates[i]
            };
        }
        // Legasi terakhir: medan gemini langsung (kunci sebenar sahaja).
        if (String(cfg.geminiApiKey || '').trim()) {
            return {
                apiKey: String(cfg.geminiApiKey).trim(),
                format: 'gemini',
                baseUrl: '',
                model: String(cfg.geminiModel || '').replace(/^models\//, ''),
                provider: 'gemini'
            };
        }
        return null;
    }

    function mount(cfg) {
        var section = $('apiKeysSection');
        if (!section) return;
        if (cfg && typeof cfg === 'object') _lastKnownConfig = cfg;

        // Fetch registry (async — tidak sekat DOM)
        fetchProviderRegistry().then(function (providers) {
            // Isi semula dropdown provider untuk semua kad yang sedang dipaparkan
            AGENTS.forEach(function (agent) {
                populateProviderDropdown(agent.key, providers);
            });
            // [BUG FIX 2026-10-10] Panggil updateVisibility SELEPAS populate —
            // registry sudah ada, nilai provider mungkin sudah direhydrate.
            AGENTS.forEach(function (agent) {
                updateVisibility(agent.key);
            });
        });

        // Semak sedia ada (idempotent — dipanggil semula semasa rehydrate)
        var existing = $('trinityRoot');
        if (existing) existing.remove();

        var currentMode = (cfg && cfg.trinity && cfg.trinity.mode) || (cfg && cfg.mode) || MODE_BASIC;

        // Kad induk "Translation API Keys" ialah ROOT itu sendiri (satu elemen,
        // satu id 'trinityRoot') — tiada bekas luar tambahan.
        var root = null; // ditetapkan di bawah selepas parentCard dibina

        // ── Togol dwimod (segmented control) ──
        // Kontrak kekal: input checkbox #trinityModeToggle disembunyikan dan
        // dipacu oleh dua butang segmented. applyAgentValues()/collectConfigPatch()
        // masih membaca/menulis .checked + event 'change'.
        var toggleBar = createEl('div', 'trinity-mode-bar');

        var toggleInput = createEl('input');
        toggleInput.type = 'checkbox';
        toggleInput.id = 'trinityModeToggle';
        toggleInput.checked = currentMode === MODE_PRO;
        toggleInput.className = 'trinity-mode-input';
        toggleInput.setAttribute('aria-hidden', 'true');
        toggleInput.tabIndex = -1;
        toggleBar.appendChild(toggleInput);

        var seg = createEl('div', 'trinity-segmented');
        seg.setAttribute('role', 'radiogroup');
        seg.setAttribute('aria-label', 'Trinity agent mode');

        function modeBtn(modeKey, label, hint) {
            var b = createEl('button', 'trinity-segment-btn');
            b.type = 'button';
            b.dataset.mode = modeKey;
            b.setAttribute('role', 'radio');
            b.setAttribute('aria-checked', 'false');
            b.appendChild(createEl('span', 'trinity-segment-label', label));
            b.appendChild(createEl('span', 'trinity-segment-hint', hint));
            b.addEventListener('click', function () {
                if (toggleInput.checked === (modeKey === MODE_PRO)) return;
                toggleInput.checked = modeKey === MODE_PRO;
                toggleInput.dispatchEvent(new Event('change'));
            });
            return b;
        }
        seg.appendChild(modeBtn(MODE_BASIC, 'Basic Mode', 'Agent Translation only'));
        seg.appendChild(modeBtn(MODE_PRO, 'Pro Mode', 'Preflight + Translation + Inspector'));
        toggleBar.appendChild(seg);
        // ── Kad induk "Translation API Keys" (Anak 2 dalam keluarga API Keys) ──
        // Trinity DIBUNGKUS dalam satu kad berstruktur sama dengan kad anak lain
        // (Source/Target Languages): header + collapse-btn kanan, collapsed default;
        // kandungan = togol Basic/Pro + kad agent. Expand → baru kandungan muncul.
        // Kelas 'card'/'card-header' diperlukan supaya helper section config.js
        // (collapseSectionCards/expandHeaderlessCards) mengenalinya. SELAMAT dari
        // double-bind: semua listener legacy dipasang pada page load, SEBELUM
        // Trinity mount (elemen dinamik tidak pernah terikat).
        var parentCard = createEl('div', 'card trinity-parent-card collapsed');
        parentCard.id = 'trinityRoot';
        root = parentCard;

        var pHead = createEl('div', 'card-header trinity-parent-head');
        var pTitleGroup = createEl('div', 'card-title-group');
        var pIcon = createEl('div', 'card-icon');
        pIcon.setAttribute('aria-hidden', 'true');
        pIcon.innerHTML =
            '<svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">' +
            (AGENT_ICON_PATHS.translation || '') +
            '</svg>';
        pTitleGroup.appendChild(pIcon);
        var pTitles = createEl('div', 'trinity-agent-titles');
        pTitles.appendChild(createEl('h2', 'section-title', 'Translation API Keys'));
        pTitles.appendChild(
            createEl('p', 'section-description', 'Trinity agents (Preflight, Translation, Inspector) live here.')
        );
        pTitleGroup.appendChild(pTitles);
        pHead.appendChild(pTitleGroup);

        var pCollapseBtn = createEl('button', 'collapse-btn collapsed');
        pCollapseBtn.type = 'button';
        pCollapseBtn.setAttribute('aria-expanded', 'false');
        pCollapseBtn.setAttribute('aria-label', 'Collapse Translation API Keys');
        pHead.appendChild(pCollapseBtn);
        parentCard.appendChild(pHead);

        var pContent = createEl('div', 'card-content trinity-parent-content');
        pContent.appendChild(toggleBar);
        parentCard.appendChild(pContent);

        // parentCard ADALAH root (satu elemen, satu id) — tiada append diperlukan.

        function syncParentCollapse() {
            var collapsed = parentCard.classList.contains('collapsed');
            pCollapseBtn.classList.toggle('collapsed', collapsed);
            pCollapseBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
        }
        pCollapseBtn.addEventListener('click', function () {
            parentCard.classList.toggle('collapsed');
            syncParentCollapse();
        });
        pHead.addEventListener('click', function (e) {
            if (e.target.closest('.collapse-btn')) return;
            e.stopPropagation();
            parentCard.classList.toggle('collapsed');
            syncParentCollapse();
        });
        syncParentCollapse();

        function syncSegmented() {
            var isPro = toggleInput.checked;
            Array.prototype.forEach.call(seg.querySelectorAll('.trinity-segment-btn'), function (btn) {
                var active = (btn.dataset.mode === MODE_PRO) === isPro;
                btn.classList.toggle('active', active);
                btn.setAttribute('aria-checked', active ? 'true' : 'false');
                btn.tabIndex = active ? 0 : -1;
            });
        }
        toggleInput.addEventListener('change', syncSegmented);
        syncSegmented();

        // ── Bekas kad ──
        var cardsWrap = createEl('div', 'trinity-cards');
        cardsWrap.id = 'trinityCards';
        pContent.appendChild(cardsWrap);

        // [BUG FIX v3.9.44 — NON-DESTRUCTIVE DOM MORPH]
        // Kecacatan v3.9.43: `renderCards()` melakukan `cardsWrap.innerHTML = ''`
        // pada SETIAP pertukaran Basic <-> Pro. Walaupun snapshot dipulihkan,
        // kesan sampingan kekal: (a) medan format/door pada kad dibina semula
        // daripada katalog lalai sehinggakan `door` custom tidak dipulihkan
        // (dropdown Format kembali kosong); (b) status pemilihan dropdown
        // Secondary Fallback ter-reset; (c) lencana API key kembali ke 'No key'
        // (badge hanya dikemas kini oleh listener 'input' — pengisian
        // PROGRAMATIK oleh applyAgentValues tidak mencetuskannya).
        // Penyelesaian: bina DOM kad SEKALI SAHAJA, kemudian pertukaran mod
        // HANYA menogol visibiliti kad (HIDE, bukan LOCK — medan kekal editable
        // dan nilai kekal 100% utuh).
        var _cardsBuilt = false;

        // Bina semua kad Trinity (3 ejen) + wayar listener input kunci →
        // lencana. Dipanggil sekali sahaja; idempotent.
        function ensureCardsBuilt() {
            if (_cardsBuilt && cardsWrap.children.length) return;
            cardsWrap.innerHTML = '';
            var providers = _registryCache || FALLBACK_PROVIDERS;
            AGENTS.forEach(function (agent) {
                cardsWrap.appendChild(buildAgentCard(agent));
                wireAutodetect(agent.key);
                wireValidate(agent.key);
                populateProviderDropdown(agent.key, providers);
            });
            _cardsBuilt = true;
        }

        // Togol visibiliti kad mengikut mod semasa — HIDE sahaja, tiada
        // pembinaan semula DOM. Kad yang tersembunyi kekal dalam DOM dengan
        // SEMUA nilai input (termasuk door custom + Secondary Fallback) utuh.
        function applyModeVisibility() {
            var isBasic = !toggleInput.checked;
            cardsWrap.classList.toggle('trinity-mode-basic', isBasic);
            var cards = cardsWrap.querySelectorAll('.trinity-agent-card');
            Array.prototype.forEach.call(cards, function (card) {
                var isTranslation = card.dataset.agent === 'translation';
                var hide = isBasic && !isTranslation;
                card.classList.toggle('trinity-mode-hidden', hide);
            });
        }

        // Muatkan nilai config ke input TANPA memusnahkan DOM. `cfgOverride`
        // = objek config SEBENAR yang sedang direhydrate (dihantar oleh
        // applyAgentValues melalui hook) supaya kad diisi dengan nilai betul
        // walaupun global currentConfig belum siap.
        function renderCards(cfgOverride) {
            ensureCardsBuilt();
            applyModeVisibility();
            applyAgentValues(cfgOverride || getEffectiveConfig());
            // [BUG FIX 2026-10-10] Panggil updateVisibility SELEPAS applyAgentValues
            // (rehydration menetapkan providerEl.value daripada config — visibility
            // mesti mencerminkan nilai sebenar, bukan nilai kosong lalai).
            AGENTS.forEach(function (agent) {
                updateVisibility(agent.key);
            });
        }

        // [BUG FIX v3.9.41] Daftar hook supaya applyAgentValues(cfg) boleh
        // memaksa bina semula kad + sync segmented untuk mod baharu, sambil
        // menghantar cfg SEBENAR — bukan global currentConfig yang mungkin
        // belum siap semasa muat halaman (punca setting Trinity hilang).
        modelSyncHook = function (realCfg) {
            syncSegmented();
            renderCards(realCfg);
        };

        toggleInput.addEventListener('change', function () {
            var mode = toggleInput.checked ? MODE_PRO : MODE_BASIC;
            var c = getEffectiveConfig();
            if (c) {
                c.trinity = c.trinity || {};
                c.trinity.mode = mode;
                if (mode === MODE_BASIC) {
                    c.previousContextSize = 4;
                    c.batchSize = 50;
                    c.futureContextSize = 2;
                }
            }
            // [BUG FIX v3.9.41] Semasa rehydrate terkawal (_rehydratingMode),
            // hook (modelSyncHook) sudah pun menogol visibiliti kad + mengisi
            // nilai menggunakan cfg SEBENAR. Jangan ulang di sini.
            if (_rehydratingMode) return;
            // [BUG FIX v3.9.44] NON-DESTRUCTIVE MODE SWITCH (Basic <-> Pro):
            // renderCards() TIDAK lagi memusnahkan DOM (tiada innerHTML='' pada
            // laluan togol) — kad dibina SEKALI (ensureCardsBuilt) dan pertukaran
            // mod hanya menogol visibiliti (applyModeVisibility). Semua nilai
            // input, pilihan Format/Door, dan status Secondary Fallback kekal
            // 100% utuh. Snapshot DOM → currentConfig dirakam dahulu supaya
            // nilai yang ditaip tersedia untuk Save tanpa menunggu rehydrate.
            var snapshotCfg = null;
            try {
                snapshotCfg = snapshotVisibleAgentState(c);
            } catch (_) {
                snapshotCfg = c;
            }
            renderCards(snapshotCfg || c);
        });

        // [ROOT-CAUSE FIX 2026-10-10 — Integration Audit Fasa G]
        // "Subtitles API Keys" mesti kekal ATAS SEKALI. Sisipan root ke document
        // mesti berlaku SEBELUM renderCards(): wireAutodetect()/wireValidate()
        // menggunakan document.getElementById() — yang memulangkan NULL untuk
        // elemen dalam pokok detached. Susunan lama (renderCards dahulu)
        // menyebabkan SEMUA listener (change/input/click Validate) tidak
        // dipasang — punca sebenar Smart Visibility gagal berfungsi.
        // Footer close section berada DALAM .section-grid (main.html) — cari dan
        // sisip kad induk SEBELUM footer supaya close kekal paling bawah.
        var grid = null;
        var gridFooter = null;
        for (var i = 0; i < section.children.length; i++) {
            var c = section.children[i];
            if (c.classList && c.classList.contains('section-grid')) {
                grid = c;
                gridFooter = grid.querySelector(':scope > .section-footer');
                break;
            }
        }
        if (grid) {
            if (gridFooter) {
                grid.insertBefore(root, gridFooter);
            } else {
                grid.appendChild(root);
            }
        } else {
            section.appendChild(root);
        }

        renderCards();

        // Sembunyikan kad legasi gemini
        var legacyCard = $('geminiCard');
        if (legacyCard) legacyCard.style.display = 'none';

        applyAgentValues(cfg);
    }

    // [BUG FIX v3.9.43] Akses konfigurasi SEMASA yang boleh dipercayai.
    // `currentConfig` dalam public/config.js ialah pemboleh ubah skop-modul (IIFE),
    // jadi rujukan langsung dari modul ini SELALU gagal (guard typeof menelan
    // ReferenceError → null). Ini adalah punca sebenar nilai input hilang semasa
    // pertukaran mod: snapshot/save membaca null lalu berundur ke DOM kosong.
    // Keutamaan: (1) getter LIVE yang didedahkan config.js; (2) cache cfg terakhir
    // yang dihantar melalui mount()/rehydrate() sebagai jaring keselamatan.
    function getEffectiveConfig() {
        try {
            if (typeof window !== 'undefined' && typeof window.__SUB__getCurrentConfig === 'function') {
                var live = window.__SUB__getCurrentConfig();
                if (live && typeof live === 'object') return live;
            }
        } catch (_) {
            /* defensif — jatuh ke cache di bawah */
        }
        return _lastKnownConfig && typeof _lastKnownConfig === 'object' ? _lastKnownConfig : null;
    }

    // --- Rehydrate nilai sedia ada ke dalam input baharu ---

    function applyAgentValues(cfg) {
        if (!cfg) return;
        if (typeof cfg === 'object') _lastKnownConfig = cfg;

        var modeToggle = $('trinityModeToggle');
        var storedMode = (cfg.trinity && cfg.trinity.mode) || cfg.mode || MODE_BASIC;
        if (modeToggle && !_rehydratingMode) {
            var wantPro = storedMode === MODE_PRO;
            if (modeToggle.checked !== wantPro) {
                modeToggle.checked = wantPro;
                // [BUG FIX v3.9.41] JANGAN early-return di sini.
                // Sebelum ini: dispatch 'change' → handler dalam mount() panggil
                // renderCards() → applyAgentValues(getEffectiveConfig()), tetapi
                // semasa muat halaman currentConfig global BELUM siap, jadi
                // semua nilai agent hilang. Kini:
                //   1. hook bina semula kad + segmented untuk mod baharu, dengan
                //      cfg SEBENAR (bukan global yang belum siap);
                //   2. kita teruskan ke bawah untuk mengisi nilai agent.
                // Pengawal _rehydratingMode menghalang gelung tak terhingga
                // apabila renderCards() → applyAgentValues() dipanggil semula.
                _rehydratingMode = true;
                try {
                    if (typeof modelSyncHook === 'function') {
                        modelSyncHook(cfg);
                    }
                    modeToggle.dispatchEvent(new Event('change'));
                } finally {
                    _rehydratingMode = false;
                }
            }
        }

        AGENTS.forEach(function (agent) {
            var stored = getAgentConfig(cfg, agent.key);
            // [BUG FIX v3.9.43] Fallback kontrak: sesetengah hash lama tidak
            // menyimpan blok trinity.translation tetapi menyimpan
            // providers.<mainProvider> = { apiKey, model, baseUrl }. Tanpa ini,
            // kad Agent Translation muncul kosong ("— Select provider —",
            // "No key") walaupun kunci sebenarnya ada.
            if (!stored && agent.key === 'translation') {
                stored = deriveTranslationFromProviders(cfg);
            }
            var keyEl = $('trinity-' + agent.key + '-key');
            var fmtEl = $('trinity-' + agent.key + '-format');
            var urlEl = $('trinity-' + agent.key + '-baseurl');
            var modelEl = $('trinity-' + agent.key + '-model');
            var providerEl = $('trinity-' + agent.key + '-provider');
            if (!keyEl || !fmtEl || !urlEl || !modelEl || !providerEl) return;

            if (stored) {
                if (stored.apiKey) keyEl.value = stored.apiKey;
                // [BUG FIX v3.9.44] Pulihkan dropdown Format/Door melalui peta
                // format→door. stored.format mungkin nilai legacy pendek
                // ('gemini'|'openai'|'anthropic') yang BUKAN nilai <option>
                // dropdown — menulisnya terus menjadikan dropdown kosong.
                var fmtValue = formatToDoorValue(stored.format);
                if (!fmtValue && stored.door) fmtValue = formatToDoorValue(stored.door);
                if (fmtValue) fmtEl.value = fmtValue;
                if (stored.baseUrl) urlEl.value = stored.baseUrl;
                if (stored.model) {
                    ensureModelOption(modelEl, stored.model);
                    modelEl.value = stored.model;
                }
                // Provider rehydration: pilih provider yang sepadan dengan door/format
                if (stored.provider) {
                    providerEl.value = stored.provider;
                } else if (stored.format) {
                    // Warisan: format 'gemini'/'openai'/'anthropic' → provider id
                    var legacyMap = { gemini: 'gemini', openai: 'openai', anthropic: 'anthropic' };
                    providerEl.value = legacyMap[stored.format] || stored.format;
                }
                applyRotationPool(agent.key, stored, cfg);
            } else if (agent.key === 'translation') {
                // [BUG FIX v3.9.44 — FRESH STATE] Seed legasi (gemini) HANYA bila
                // kunci sebenar wujud. Sebelum ini blok ini dipacu oleh
                // cfg.geminiModel lalai ('gemini-3-flash-preview') dan
                // providerEl.value='gemini' → kad Agent Translation AUTO-memilih
                // 'Google Gemini' walaupun pengguna belum memasukkan sebarang kunci.
                // Fresh state mesti kekal '— Select provider —' / '— Select model —'.
                var legacyKey = String(cfg.geminiApiKey || '').trim();
                if (legacyKey) {
                    keyEl.value = legacyKey;
                    if (cfg.geminiModel) {
                        var name = String(cfg.geminiModel).replace(/^models\//, '');
                        ensureModelOption(modelEl, name);
                        modelEl.value = name;
                    }
                    // Hanya paksa 'gemini' bila tiada nilai provider semasa di DOM
                    // — elak memadam pilihan pengguna (non-destructive).
                    if (!providerEl.value) providerEl.value = 'gemini';
                }
                applyRotationPool('translation', { apiKey: legacyKey }, cfg);
            }

            // [FASA 4 v3.9.46] Rehidrasi trinity.<agent>.params — baca cfg
            // SEBENAR (BUKAN DOM prevValue — elak stale-value trap), simpan ke
            // cache state, kemudian render medan Model Parameters mengikut
            // capability profile semasa provider/model.
            // PENTING: JANGAN panggil mpSnapshot() selepas menetapkan state —
            // ia akan menimpa nilai cfg dengan DOM lama (stale-value trap).
            var slot = getAgentConfig(cfg, agent.key);
            if (slot && slot.params && typeof slot.params === 'object') {
                _modelParamsState[agent.key] = Object.assign({}, slot.params);
            }
            // Rehidrasi slot secondary (slot ejen ke-4) daripada trinity.secondary.
            if (agent.key === 'translation') {
                var secSlot = (cfg.trinity && cfg.trinity.secondary) || null;
                if (secSlot && secSlot.params && typeof secSlot.params === 'object') {
                    _modelParamsState.secondary = Object.assign({}, secSlot.params);
                }
                applyFallbackValues(cfg);
            }
            refreshModelParams(agent.key);
            if (agent.key === 'translation') {
                refreshModelParams('secondary');
            }

            // [BUG FIX v3.9.44] Lencana 'No key' kaku selepas pengisian
            // PROGRAMATIK (applyAgentValues menulis keyEl.value tanpa mencetuskan
            // event 'input'). Kemas kini HANYA bila lencana masih neutral —
            // jangan timpa status ujian Valid/Invalid yang baru dijalankan.
            var keyBadge = $('trinity-' + agent.key + '-badge');
            if (keyBadge && keyBadge.textContent === 'No key' && String(keyEl.value || '').trim()) {
                updateKeyBadge(agent.key);
            }

            // Pastikan visibility dikemas kini selepas rehydrate
            updateVisibility(agent.key);
        });
    }

    // --- Snapshot non-destruktif DOM → currentConfig (pertukaran mod) ---

    // [BUG FIX v3.9.43] Rakam nilai input SEMASA dari DOM ke dalam objek
    // konfigurasi SEBELUM renderCards() membina semula kad. Entri ejen yang
    // kadnya TIDAK wujud dalam mod semasa (cth Preflight/Inspector dalam Basic
    // Mode) DILANGKAU — nilai lama dalam `cfg.trinity` dikekalkan supaya
    // pertukaran Pro → Basic → Pro tidak memadam data yang telah diisi.
    // Juga tidak menulis nilai kosong ke medan fallback/rotation.
    function snapshotVisibleAgentState(targetCfg) {
        var cfg = targetCfg || getEffectiveConfig();
        if (!cfg) return null;
        cfg.trinity = cfg.trinity || {};
        var providers = _registryCache || FALLBACK_PROVIDERS;

        // [FASA 4 v3.9.46] Simpan params Model Parameters semasa ke cfg.trinity
        // SEBELUM pertukaran mod — memastikan nilai kekal utuh Basic↔Pro.
        AGENTS.forEach(function (agent) {
            var present = !!$('trinity-mp-' + agent.key);
            if (!present) return;
            mpSnapshot(agent.key);
            if (_modelParamsState[agent.key] && Object.keys(_modelParamsState[agent.key]).length) {
                cfg.trinity[agent.key] = cfg.trinity[agent.key] || {};
                cfg.trinity[agent.key].params = Object.assign({}, _modelParamsState[agent.key]);
            }
        });
        var secPresent = !!$('trinity-mp-secondary');
        if (secPresent) {
            mpSnapshot('secondary');
            if (_modelParamsState.secondary && Object.keys(_modelParamsState.secondary).length) {
                cfg.trinity.secondary = cfg.trinity.secondary || {};
                cfg.trinity.secondary.params = Object.assign({}, _modelParamsState.secondary);
            }
        }

        AGENTS.forEach(function (agent) {
            var keyEl = $('trinity-' + agent.key + '-key');
            var providerEl = $('trinity-' + agent.key + '-provider');
            // Kad tiada dalam DOM mod semasa → jangan sentuh entri sedia ada.
            if (!keyEl || !providerEl) return;

            var fmtEl = $('trinity-' + agent.key + '-format');
            var urlEl = $('trinity-' + agent.key + '-baseurl');
            var modelEl = $('trinity-' + agent.key + '-model');
            var provider = providerEl.value || '';
            var providerEntry = getProviderById(providers, provider);
            // [BUG FIX v3.9.44] Door direkod melalui resolveEffectiveDoor —
            // pilihan Format/Door eksplisit Custom dirakam VERBATIM (sebelum ini
            // door lalai registry ditulis → tidak sepadan dengan format pilihan).
            var isCustom = isCustomProvider(providerEntry);
            var rawFormat = fmtEl ? fmtEl.value : 'auto';
            var door = resolveEffectiveDoor(providerEntry, rawFormat);
            var apiKey = String(keyEl.value || '').trim();

            cfg.trinity[agent.key] = Object.assign(
                {
                    apiKey: apiKey,
                    format: rawFormat === 'auto' ? 'auto' : doorToFormat(rawFormat),
                    baseUrl: isCustom && urlEl ? String(urlEl.value || '').trim() : '',
                    model: modelEl ? String(modelEl.value || '').trim() : '',
                    provider: provider,
                    door: door,
                    isCustom: isCustom,
                    enabled: !!apiKey
                },
                readRotationPool(agent.key, apiKey)
            );
        });

        // Seed legasi + key rotation (kad translation wujud dalam kedua-dua mod).
        var t = cfg.trinity.translation;
        if (t) {
            if (t.apiKey) {
                cfg.geminiApiKey = t.apiKey;
                if (t.model) cfg.geminiModel = t.model;
            }
            cfg.geminiKeyRotationEnabled = t.keyRotationEnabled === true;
            cfg.geminiKeyRotationMode = t.keyRotationMode || 'per-batch';
            cfg.geminiApiKeys = Array.isArray(t.apiKeys) ? t.apiKeys.slice() : [];
        }

        // Secondary fallback (sub-kad dalam kad translation — kedua-dua mod).
        if ($('trinity-translation-fallback-enabled')) {
            var fb = readFallbackState();
            if (fb.enabled) {
                cfg.multiProviderEnabled = true;
                cfg.secondaryProviderEnabled = true;
                cfg.secondaryProvider = fb.isCustomSecondary ? CUSTOM_SECONDARY_ID : fb.providerId;
                cfg.providers = cfg.providers || {};
                if (fb.isCustomSecondary) {
                    cfg.providers[CUSTOM_SECONDARY_ID] = {
                        enabled: true,
                        apiKey: fb.apiKey,
                        baseUrl: fb.baseUrl,
                        model: fb.model,
                        door: fb.door
                    };
                } else {
                    cfg.providers[fb.providerId] = {
                        enabled: true,
                        apiKey: fb.apiKey,
                        model: fb.model,
                        baseUrl: fb.baseUrl
                    };
                }
            }
        }

        return cfg;
    }

    // --- Pengumpulan konfigurasi (disuntik ke saveConfig) ---

    function collectConfigPatch() {
        var modeToggle = $('trinityModeToggle');
        var mode = modeToggle && modeToggle.checked ? MODE_PRO : MODE_BASIC;
        var trinity = { mode: mode, preflight: {}, translation: {}, inspector: {} };

        // [BUG FIX v3.9.43] NON-DESTRUCTIVE SAVE merentas mod: dalam Basic Mode
        // kad Preflight/Inspector TIDAK wujud dalam DOM. Sebelum ini blok
        // `trinity.preflight`/`trinity.inspector` dihantar sebagai {} dan
        // memusnahkan kredential Pro yang telah disimpan apabila pengguna
        // menekan Save semasa berada dalam Basic Mode. Nilai lama dibaca
        // daripada currentConfig dan dipulihkan untuk ejen yang kadnya tiada.
        var prevTrinity = (getEffectiveConfig() || {}).trinity || {};

        AGENTS.forEach(function (agent) {
            var key = ($('trinity-' + agent.key + '-key') || {}).value || '';
            var format = ($('trinity-' + agent.key + '-format') || {}).value || 'auto';
            var baseUrl = ($('trinity-' + agent.key + '-baseurl') || {}).value || '';
            var model = ($('trinity-' + agent.key + '-model') || {}).value || '';
            var provider = ($('trinity-' + agent.key + '-provider') || {}).value || '';

            var providers = _registryCache || FALLBACK_PROVIDERS;
            var providerEntry = getProviderById(providers, provider);
            // [BUG FIX v3.9.44] Door mesti sepadan dengan pilihan Format/Door
            // eksplisit Custom (konsisten dengan snapshotVisibleAgentState).
            var isCustom = isCustomProvider(providerEntry);
            var door = resolveEffectiveDoor(providerEntry, format);

            // Untuk pembekal rasmi, format di-derive daripada pintu (tidak disimpan)
            // [INTEGRATION AUDIT FIX v3.9.7] format payload mesti nilai LEGACY pendek
            // (keyDetector VALID_FORMATS), bukan door penuh.
            // [INTEGRATION AUDIT FIX v3.9.13 — Fasa H] Dropdown Format Custom kini
            // membawa nilai DOOR PENUH (Fasa E) dan listener reaktif/resolvedDoor
            // (Fasa H) menetapkannya — 'gemini-native' dll. Mapped kepada nilai
            // legacy pendek SEBELU dihantar; 'auto' dikekalkan untuk autodetect backend.
            var effectiveFormat = format === 'auto' ? 'auto' : doorToFormat(format);
            var effectiveBaseUrl = isCustom ? baseUrl.trim() : '';

            var cardPresent = !!$('trinity-' + agent.key + '-key');
            if (!cardPresent) {
                // Kad tiada dalam mod semasa — kekalkan nilai konfigurasi lama
                // (jangan hantar blok kosong yang akan memadam data Pro).
                var prev = prevTrinity[agent.key];
                trinity[agent.key] =
                    prev && typeof prev === 'object'
                        ? {
                              apiKey: prev.apiKey || '',
                              format: prev.format || 'auto',
                              baseUrl: prev.baseUrl || '',
                              model: prev.model || '',
                              provider: prev.provider || '',
                              door: prev.door || '',
                              isCustom: prev.isCustom === true,
                              enabled: prev.enabled === true,
                              apiKeys: Array.isArray(prev.apiKeys) ? prev.apiKeys.slice() : [],
                              keyRotationEnabled: prev.keyRotationEnabled === true,
                              keyRotationMode: prev.keyRotationMode || 'per-batch'
                          }
                        : {};
                return;
            }

            trinity[agent.key] = Object.assign(
                {
                    apiKey: key.trim(),
                    format: effectiveFormat,
                    baseUrl: effectiveBaseUrl,
                    model: model.trim(),
                    provider: provider,
                    door: door,
                    isCustom: isCustom,
                    enabled: !!key.trim(),
                    // [FASA 4 v3.9.46] Kontrak trinity.<agent>.params — HANYA medan
                    // yang dilawati pengguna daripada lalai ejen (kosong = lalai).
                    params: mpCollectDeviatedParams(agent.key)
                },
                readRotationPool(agent.key, key)
            );
        });

        // [FASA 4 v3.9.46] Slot secondary (ejem ke-4) — params diukur terhadap
        // capability profile fallback semasa; slot disimpan tanpa kredential
        // (kredential secondary diuruskan providers.custom_secondary / providers.<id>).
        trinity.secondary = {
            params: (function () {
                var fb = readFallbackState();
                if (!fb.enabled && !_modelParamsState.secondary) return {};
                return mpCollectDeviatedParams('secondary');
            })()
        };

        var patch = { trinity: trinity };

        // [TRINITY→PROVIDER BRIDGE v3.9.49] Routing provider-aware — slot translation
        // kini menjadi sumber kebenaran utama ruting enjin (insiden 2026-10-15:
        // 404 MODEL_NOT_FOUND akibat geminiModel tercemar model bukan-gemini,
        // kerana serialization buta tanpa semak provider). Bila provider bukan
        // gemini: (1) geminiApiKey/geminiModel DIBIARKAN tidak disentuh, dan
        // (2) patch.mainProvider/patch.multiProviderEnabled/patch.providers[<id>]
        // ditetapkan SEGERA supaya validasi frontend (mainProvider literal)
        // & jambatan backend (syncTrinityTranslationToProvider) melihat enjin
        // utama yang sama. Slot tidak layak (tiada kredential) → kekal legasi.
        var t = trinity.translation;
        if (t.apiKey) {
            if (t.provider === 'gemini' || !t.provider) {
                // Laluan Gemini legasi: hanya geminiApiKey/geminiModel.
                patch.geminiApiKey = t.apiKey;
                if (t.model) patch.geminiModel = t.model;
            } else {
                // Provider bukan-gemini → sengaja TIADA patch.geminiModel
                // (elak pencemaran stale-value). Ruting diurus di sini + disahkan
                // semula oleh jambatan backend (defense in depth).
                var tModel = String(t.model || '').trim();
                var tBaseUrl = String(t.baseUrl || '').trim();
                var tCustom = t.isCustom === true || t.provider === 'custom';
                var tEligible = tCustom ? !!(tBaseUrl && tModel) : !!(t.apiKey && tModel);
                if (tEligible) {
                    patch.multiProviderEnabled = true;
                    patch.mainProvider = t.provider;
                    patch.providers = patch.providers || {};
                    var mainEntry = {
                        enabled: true,
                        apiKey: t.apiKey,
                        model: tModel
                    };
                    if (tCustom) {
                        mainEntry.baseUrl = tBaseUrl;
                        // [FASA 1 C1 — MANDAT OWNER 2026-10-26] Kedaulatan pintu:
                        // door pilihan pengguna (gemini-native | anthropic-messages |
                        // openai-compatible) MESTI kekal. Sebelum ini pintu
                        // anthropic-messages dipaksa ke openai-compatible →
                        // kontrak pintu hilang pada routing (hutang kritikal C1).
                        // Fallback 'openai-compatible' hanya untuk nilai kosong/tak dikenali.
                        var tDoor = String(t.door || '').toLowerCase();
                        mainEntry.door =
                            tDoor === 'gemini-native' || tDoor === 'anthropic-messages' || tDoor === 'openai-compatible'
                                ? tDoor
                                : 'openai-compatible';
                    }
                    patch.providers[t.provider] = mainEntry;
                }
            }
        }

        // Alias global dikekalkan untuk Translation; pool ejen lain kekal dalam slot masing-masing.
        patch.geminiKeyRotationEnabled = t.keyRotationEnabled === true;
        patch.geminiKeyRotationMode = t.keyRotationMode || 'per-batch';
        patch.geminiApiKeys = Array.isArray(t.apiKeys) ? t.apiKeys.slice() : [];

        // Secondary Fallback — serialisasi ke kontrak sedia ada (multiProviderEnabled/secondaryProvider*/providers.<key>)
        var fb = readFallbackState();
        if (fb.enabled) {
            patch.multiProviderEnabled = true;
            patch.secondaryProviderEnabled = true;
            patch.secondaryProvider = fb.isCustomSecondary ? CUSTOM_SECONDARY_ID : fb.providerId;
            // [TRINITY→PROVIDER BRIDGE v3.9.49] MERGE (bukan ganti) — entri main
            // provider daripada blok bridge di atas MESTI kekal walaupun fallback
            // aktif; pembekal legasi lain dikekalkan oleh pemanggil
            // (buildConfigFromForm merge providers — line 12562).
            patch.providers = patch.providers || {};
            if (fb.isCustomSecondary) {
                // [CUSTOM SECONDARY v3.9.33] Slot berasingan — TIDAK menimpa providers.custom (Primary)
                patch.providers[CUSTOM_SECONDARY_ID] = {
                    enabled: true,
                    apiKey: fb.apiKey,
                    baseUrl: fb.baseUrl,
                    model: fb.model,
                    door: fb.door
                };
            } else {
                patch.providers[fb.providerId] = {
                    enabled: true,
                    apiKey: fb.apiKey,
                    model: fb.model,
                    baseUrl: fb.baseUrl
                };
            }
        } else {
            patch.secondaryProviderEnabled = false;
            patch.secondaryProvider = '';
        }

        var pf = trinity.preflight;
        var insp = trinity.inspector;
        var hasAgentInspector = mode === MODE_PRO && (pf.apiKey || insp.apiKey);
        if (hasAgentInspector) {
            var bKey = insp.apiKey || pf.apiKey;
            var bUrl = insp.baseUrl || pf.baseUrl || '';
            patch.agentInspector = {
                enabled: true,
                apiKey: bKey,
                baseUrl: bUrl,
                format: insp.format !== 'auto' ? insp.format : pf.format !== 'auto' ? pf.format : 'auto',
                model: insp.model || 'deepseek-v4-pro',
                preflightModel: pf.model || 'kimi-k3',
                // [FASA 1 C3 — MANDAT OWNER 2026-10-26] Kredensial per-fasa
                // BERASINGAN: kad Preflight dan kad Inspector boleh menggunakan
                // provider/kunci/baseUrl/pintu berbeza. Nilai kosong → backend
                // mewarisi kredensial utama (backward compatible). JANGAN gabung
                // atau padam nilai salah satu kad.
                preflightApiKey: pf.apiKey || '',
                preflightBaseUrl: pf.baseUrl || '',
                preflightFormat: pf.format !== 'auto' ? pf.format : 'auto',
                preflightFormatDoor: pf.door || 'auto',
                preflightProvider: pf.provider || '',
                inspectorApiKey: insp.apiKey || '',
                inspectorBaseUrl: insp.baseUrl || '',
                inspectorFormat: insp.format !== 'auto' ? insp.format : 'auto',
                inspectorFormatDoor: insp.door || 'auto',
                inspectorProvider: insp.provider || ''
            };
        } else {
            patch.agentInspector = { enabled: false };
        }

        if (mode === MODE_BASIC) {
            patch.previousContextSize = 4;
            patch.batchSize = 50;
            patch.futureContextSize = 2;
        }

        return patch;
    }

    // Eksport global (dipanggil config.js)
    window.TrinityAgents = {
        mount: mount,
        collectConfigPatch: collectConfigPatch,
        rehydrate: applyAgentValues,
        MODES: { BASIC: MODE_BASIC, PRO: MODE_PRO },
        // API untuk debugging/testing
        fetchProviderRegistry: fetchProviderRegistry,
        getRegistryCache: function () {
            return _registryCache;
        }
    };
})();
