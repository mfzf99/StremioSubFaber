/**
 * Trinity Agents UI — Modular Trinity Cards + Dual Mode Toggle (Fasa E, 2026-10-10)
 * Reka bentuk semula: Provider Registry Integration + Smart Visibility
 *
 * Reka bentuk:
 *   - DOM dibina programatik (defensif penuh, null-check ketat per peraturan #4).
 *   - Input legasi #geminiApiKey DIPETAHILKAN (tersembunyi) — kontrak
 *     penyimpanan backend (currentConfig.geminiApiKey) kekal utuh.
 *   - Blok konfigurasi bersih `trinity` + `agentB` dihantar melalui
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

    // Pemetaan door → format legacy keyDetector/agentB ('gemini'|'openai'|'anthropic').
    // [INTEGRATION AUDIT 2026-10-10] Backend VALID_FORMATS (keyDetector.js) dan
    // enum agentB.format hanya menerima nilai pendek ini — nilai door penuh
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
            title: 'Agent Translation',
            subtitle: 'Core translation engine (batch XML → SRT)',
            description:
                'Core translation engine (batch XML → SRT). Processes each batch and uses the Bible from Preflight.',
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
    // currentColor supaya seiring warna teks butang (gaya legasi SubMaker).
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

    // --- Pembina kad modular (reka bentuk semula Fasa E) ---

    function buildAgentCard(agent, mode) {
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

        // Key Rotation (hanya untuk Gemini — Smart Visibility)
        var rotationRow = buildKeyRotationRow(agent.key);
        card.appendChild(rotationRow);

        // Secondary Fallback Provider — hanya pada kad Agent Translation (sub-kad collapsible)
        if (agent.key === 'translation') {
            card.appendChild(buildSecondaryFallbackRow());
        }

        // Pro-only detail rows
        if (mode === MODE_PRO) {
            var hint = createEl('div', 'trinity-agent-hint');
            hint.textContent = 'Save → backend keyDetector autodetects (this dropdown override wins).';
            card.appendChild(hint);
        }

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

    function buildSecondaryFallbackRow() {
        var wrap = createEl('div', 'trinity-fallback');

        var head = createEl('button', 'trinity-fallback-head', '🛟 Secondary Fallback Provider');
        head.type = 'button';
        head.setAttribute('aria-expanded', 'false');

        var body = createEl('div', 'trinity-fallback-body');
        body.style.display = 'none';
        head.addEventListener('click', function () {
            var open = body.style.display === 'none';
            body.style.display = open ? '' : 'none';
            head.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
        wrap.appendChild(head);

        // Togol utama "Enable fallback rescue"
        var toggleWrap = createEl('div', 'trinity-rotation-toggle');
        var toggle = createEl('input', 'trinity-rotation-checkbox');
        toggle.type = 'checkbox';
        toggle.id = 'trinity-translation-fallback-enabled';
        toggleWrap.appendChild(toggle);
        toggleWrap.appendChild(createEl('label', '', 'Enable fallback rescue'));
        body.appendChild(toggleWrap);
        toggle.addEventListener('change', updateFallbackFieldVisibility);

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
        wrap.appendChild(body);

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
        } catch (err) {
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
        refreshFallbackProviderOptions(false);
        if (pid) {
            p.value = pid;
            populateFallbackModels(pid, false);
        }
        var providersMap = cfg.providers || {};
        var saved = {};
        if (pid) {
            saved = isCustomSec
                ? providersMap[CUSTOM_SECONDARY_ID] || providersMap.custom || {}
                : providersMap[pid] || {};
        }
        if (k) k.value = saved.apiKey || '';
        if (isCustomSec) {
            if (mc) mc.value = saved.model || '';
            if (f) {
                f.value = saved.door === DOOR_TYPES.GEMINI || saved.door === DOOR_TYPES.OPENAI ? saved.door : 'auto';
            }
        } else if (saved.model && m) {
            ensureModelOption(m, saved.model);
            m.value = saved.model;
        }
        if (u) u.value = saved.baseUrl || '';
        updateFallbackFieldVisibility();
    }

    // --- Populate Provider dropdown ---

    function populateProviderDropdown(agentKey, providers) {
        var sel = $('trinity-' + agentKey + '-provider');
        if (!sel) return;
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
        var isGemini = selectedProvider && selectedProvider.id === 'gemini';

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

    // --- Key Rotation Row (Gemini only) ---

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

        testBtn.disabled = true;
        testBtn.textContent = '…';
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
    // window.SubMakerBulkKeyImport). Dieksport sebagai window.BulkKeyImport supaya
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
                typeof window !== 'undefined' && window.SubMakerBulkKeyImport
                    ? window.SubMakerBulkKeyImport.parseBulkKeys
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
            };
            urlInput.addEventListener('input', syncDoorFromUrl);
            urlInput.addEventListener('change', syncDoorFromUrl);
        }

        refresh();
    }

    // --- Mount utama ---

    function getAgentConfig(cfg, agentKey) {
        if (!cfg) return null;
        var t = cfg.trinity || {};
        return t[agentKey] || null;
    }

    function mount(cfg) {
        var section = $('apiKeysSection');
        if (!section) return;

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

        // Render kad mengikut mod
        function renderCards() {
            var mode = toggleInput.checked ? MODE_PRO : MODE_BASIC;
            cardsWrap.innerHTML = '';
            var agentsToShow =
                mode === MODE_BASIC
                    ? AGENTS.filter(function (a) {
                          return a.key === 'translation';
                      })
                    : AGENTS;
            agentsToShow.forEach(function (agent) {
                cardsWrap.appendChild(buildAgentCard(agent, mode));
                wireAutodetect(agent.key);
                wireValidate(agent.key);
            });
            // Isi provider dropdown (jika registry sudah siap)
            var providers = _registryCache || FALLBACK_PROVIDERS;
            agentsToShow.forEach(function (agent) {
                populateProviderDropdown(agent.key, providers);
            });
            applyAgentValues(getEffectiveConfig());
            // [BUG FIX 2026-10-10] Panggil updateVisibility SELEPAS applyAgentValues
            // (rehydration menetapkan providerEl.value daripada config — visibility
            // mesti mencerminkan nilai sebenar, bukan nilai kosong lalai).
            agentsToShow.forEach(function (agent) {
                updateVisibility(agent.key);
            });
        }

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
            renderCards();
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

    function getEffectiveConfig() {
        return typeof currentConfig !== 'undefined' ? currentConfig : null;
    }

    // --- Rehydrate nilai sedia ada ke dalam input baharu ---

    function applyAgentValues(cfg) {
        if (!cfg) return;

        var modeToggle = $('trinityModeToggle');
        var storedMode = (cfg.trinity && cfg.trinity.mode) || cfg.mode || MODE_BASIC;
        if (modeToggle) {
            var wantPro = storedMode === MODE_PRO;
            if (modeToggle.checked !== wantPro) {
                modeToggle.checked = wantPro;
                modeToggle.dispatchEvent(new Event('change'));
                return; // renderCards() akan memanggil applyAgentValues semula
            }
        }

        AGENTS.forEach(function (agent) {
            var stored = getAgentConfig(cfg, agent.key);
            var keyEl = $('trinity-' + agent.key + '-key');
            var fmtEl = $('trinity-' + agent.key + '-format');
            var urlEl = $('trinity-' + agent.key + '-baseurl');
            var modelEl = $('trinity-' + agent.key + '-model');
            var providerEl = $('trinity-' + agent.key + '-provider');
            if (!keyEl || !fmtEl || !urlEl || !modelEl || !providerEl) return;

            if (stored) {
                if (stored.apiKey) keyEl.value = stored.apiKey;
                if (stored.format) fmtEl.value = stored.format;
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
                // Key rotation rehydration (hanya untuk Gemini)
                if (stored.provider === 'gemini' || (stored.provider === '' && agent.key === 'translation')) {
                    var rotToggle = $('trinity-' + agent.key + '-rotation-enabled');
                    var rotMode = $('trinity-' + agent.key + '-rotation-mode');
                    var keysList = $('trinity-' + agent.key + '-rotation-keys-list');
                    if (rotToggle) {
                        rotToggle.checked = cfg.geminiKeyRotationEnabled === true;
                        rotToggle.dispatchEvent(new Event('change'));
                    }
                    if (rotMode && cfg.geminiKeyRotationMode) rotMode.value = cfg.geminiKeyRotationMode;
                    if (keysList && Array.isArray(cfg.geminiApiKeys)) {
                        // [AUDIT v3.9.20] Kosongkan senarai dahulu — rehydrate boleh
                        // dipanggil berulang kali oleh config.js; tanpa ini, kunci
                        // akan duplikasi pada setiap panggilan.
                        keysList.innerHTML = '';
                        cfg.geminiApiKeys.forEach(function (k) {
                            addRotationKeyInput(agent.key, k);
                        });
                    }
                }
            } else if (agent.key === 'translation') {
                // Seed daripada konfigurasi legasi (gemini)
                if (cfg.geminiApiKey) keyEl.value = cfg.geminiApiKey;
                if (cfg.geminiModel) {
                    var name = String(cfg.geminiModel).replace(/^models\//, '');
                    ensureModelOption(modelEl, name);
                    modelEl.value = name;
                }
                providerEl.value = 'gemini';
                // Key rotation seed untuk legacy
                var rotToggle = $('trinity-translation-rotation-enabled');
                var rotMode = $('trinity-translation-rotation-mode');
                var keysList = $('trinity-translation-rotation-keys-list');
                if (rotToggle) {
                    rotToggle.checked = cfg.geminiKeyRotationEnabled === true;
                    rotToggle.dispatchEvent(new Event('change'));
                }
                if (rotMode && cfg.geminiKeyRotationMode) rotMode.value = cfg.geminiKeyRotationMode;
                if (keysList && Array.isArray(cfg.geminiApiKeys)) {
                    // [AUDIT v3.9.20] Kosongkan senarai dahulu — anti-duplikasi rehydrate
                    keysList.innerHTML = '';
                    cfg.geminiApiKeys.forEach(function (k) {
                        addRotationKeyInput('translation', k);
                    });
                }
            }

            if (agent.key === 'translation') applyFallbackValues(cfg);

            // Pastikan visibility dikemas kini selepas rehydrate
            updateVisibility(agent.key);
        });
    }

    // --- Pengumpulan konfigurasi (disuntik ke saveConfig) ---

    function collectConfigPatch() {
        var modeToggle = $('trinityModeToggle');
        var mode = modeToggle && modeToggle.checked ? MODE_PRO : MODE_BASIC;
        var trinity = { mode: mode, preflight: {}, translation: {}, inspector: {} };

        AGENTS.forEach(function (agent) {
            var key = ($('trinity-' + agent.key + '-key') || {}).value || '';
            var format = ($('trinity-' + agent.key + '-format') || {}).value || 'auto';
            var baseUrl = ($('trinity-' + agent.key + '-baseurl') || {}).value || '';
            var model = ($('trinity-' + agent.key + '-model') || {}).value || '';
            var provider = ($('trinity-' + agent.key + '-provider') || {}).value || '';

            var providers = _registryCache || FALLBACK_PROVIDERS;
            var providerEntry = getProviderById(providers, provider);
            var door = getProviderDoor(providerEntry);
            var isCustom = isCustomProvider(providerEntry);

            // Untuk pembekal rasmi, format di-derive daripada pintu (tidak disimpan)
            // [INTEGRATION AUDIT FIX v3.9.7] format payload mesti nilai LEGACY pendek
            // (keyDetector VALID_FORMATS), bukan door penuh.
            // [INTEGRATION AUDIT FIX v3.9.13 — Fasa H] Dropdown Format Custom kini
            // membawa nilai DOOR PENUH (Fasa E) dan listener reaktif/resolvedDoor
            // (Fasa H) menetapkannya — 'gemini-native' dll. Mapped kepada nilai
            // legacy pendek SEBELU dihantar; 'auto' dikekalkan untuk autodetect backend.
            var effectiveFormat = format === 'auto' ? 'auto' : doorToFormat(format);
            var effectiveBaseUrl = isCustom ? baseUrl.trim() : '';

            trinity[agent.key] = {
                apiKey: key.trim(),
                format: effectiveFormat,
                baseUrl: effectiveBaseUrl,
                model: model.trim(),
                provider: provider,
                door: door,
                isCustom: isCustom,
                enabled: !!key.trim()
            };
        });

        var patch = { trinity: trinity };

        var t = trinity.translation;
        if (t.apiKey) {
            patch.geminiApiKey = t.apiKey;
            if (t.model) patch.geminiModel = t.model;
        }

        // Key rotation patch (hanya untuk Gemini)
        var rotToggle = $('trinity-translation-rotation-enabled');
        var rotMode = $('trinity-translation-rotation-mode');
        var keysList = $('trinity-translation-rotation-keys-list');
        if (rotToggle && rotToggle.checked) {
            patch.geminiKeyRotationEnabled = true;
            patch.geminiKeyRotationMode = rotMode ? rotMode.value : 'per-batch';
            if (keysList) {
                var keys = [];
                var inputs = keysList.querySelectorAll('.trinity-key-input');
                inputs.forEach(function (input) {
                    var v = input.value.trim();
                    if (v) keys.push(v);
                });
                patch.geminiApiKeys = keys;
            }
        } else {
            patch.geminiKeyRotationEnabled = false;
            patch.geminiApiKeys = [];
        }

        // Secondary Fallback — serialisasi ke kontrak sedia ada (multiProviderEnabled/secondaryProvider*/providers.<key>)
        var fb = readFallbackState();
        if (fb.enabled) {
            patch.multiProviderEnabled = true;
            patch.secondaryProviderEnabled = true;
            patch.secondaryProvider = fb.isCustomSecondary ? CUSTOM_SECONDARY_ID : fb.providerId;
            // Merge (bukan ganti): hanya entri pembekal fallback disentuh; pembekal lain
            // dalam currentConfig.providers dikekalkan oleh pemanggil (buildConfigFromForm).
            patch.providers = {};
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
        var hasAgentB = mode === MODE_PRO && (pf.apiKey || insp.apiKey);
        if (hasAgentB) {
            var bKey = insp.apiKey || pf.apiKey;
            var bUrl = insp.baseUrl || pf.baseUrl || '';
            patch.agentB = {
                enabled: true,
                apiKey: bKey,
                baseUrl: bUrl,
                format: insp.format !== 'auto' ? insp.format : pf.format !== 'auto' ? pf.format : 'auto',
                model: insp.model || 'deepseek-v4-pro',
                preflightModel: pf.model || 'kimi-k3'
            };
        } else {
            patch.agentB = { enabled: false };
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
