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

    var AGENTS = [
        {
            key: 'preflight',
            title: 'Agent Preflight',
            subtitle: 'Phase 0 — builds the context Bible (terms, characters, credits) before translation',
            configPath: 'trinity.preflight'
        },
        {
            key: 'translation',
            title: 'Agent Translation',
            subtitle: 'Core translation engine (batch XML → SRT)',
            configPath: 'trinity.translation'
        },
        {
            key: 'inspector',
            title: 'Agent Inspector',
            subtitle: 'Phase 1 — per-batch semantic audit (split/merge/drop/phantom crimes)',
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

        var head = createEl('div', 'trinity-agent-head');
        head.appendChild(createEl('div', 'trinity-agent-title', agent.title));
        head.appendChild(createEl('div', 'trinity-agent-sub', agent.subtitle));
        card.appendChild(head);

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
        eyeBtn.setAttribute('aria-label', 'Show/hide API key');
        eyeBtn.textContent = '👁';
        eyeBtn.addEventListener('click', function () {
            keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
        });
        keyWrap.appendChild(eyeBtn);

        var validateBtn = createEl('button', 'validate-api-btn btn-sm');
        validateBtn.type = 'button';
        validateBtn.dataset.agentValidate = agent.key;
        validateBtn.innerHTML = '<span class="validate-icon">✓</span><span class="validate-text">Validate</span>';
        keyWrap.appendChild(validateBtn);
        keyRow.appendChild(keyWrap);

        // Autodetect badge
        var badge = createEl('span', 'trinity-format-badge tone-muted');
        badge.id = 'trinity-' + agent.key + '-badge';
        badge.textContent = 'No key';
        keyRow.appendChild(badge);
        card.appendChild(keyRow);

        // Baris 3: Model dropdown (tanpa butang Load)
        var modelRow = createEl('div', 'trinity-field');
        modelRow.appendChild(createEl('label', '', 'Model'));
        var modelSelect = createEl('select', 'trinity-model-select');
        modelSelect.id = 'trinity-' + agent.key + '-model';
        modelSelect.appendChild(createEl('option', '', '— Select model —'));
        modelRow.appendChild(modelSelect);
        card.appendChild(modelRow);

        // Baris 4: Base URL (hanya untuk Custom/Proxy — Smart Visibility)
        var urlRow = createEl('div', 'trinity-field trinity-custom-only');
        urlRow.id = 'trinity-' + agent.key + '-baseurl-row';
        urlRow.appendChild(createEl('label', '', 'Base URL'));
        var urlInput = createEl('input', 'trinity-baseurl-input');
        urlInput.type = 'text';
        urlInput.id = 'trinity-' + agent.key + '-baseurl';
        urlInput.placeholder = 'https://…/v1 (e.g. Crazy Router, Ollama, your own proxy)';
        urlRow.appendChild(urlInput);
        card.appendChild(urlRow);

        // Baris 5: Format / Door (hanya untuk Custom/Proxy — Smart Visibility)
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

        // Pro-only detail rows
        if (mode === MODE_PRO) {
            var hint = createEl('div', 'trinity-agent-hint');
            hint.textContent = 'Save → backend keyDetector autodetects (this dropdown override wins).';
            card.appendChild(hint);
        }

        return card;
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
        if (!providerSel || !urlRow || !fmtRow) return;

        var providers = _registryCache || FALLBACK_PROVIDERS;
        var selectedProvider = getProviderById(providers, providerSel.value);
        var isCustom = isCustomProvider(selectedProvider);

        // [ROOT-CAUSE FIX 2 2026-10-10] inline display:'' TIDAK mengatasi rule CSS
        // .trinity-custom-only { display: none } — untuk SHOW mesti set nilai eksplisit
        // 'grid' (nilai asal .trinity-field). Hide kekal 'none' (inline mengatasi class).
        urlRow.style.display = isCustom ? 'grid' : 'none';
        fmtRow.style.display = isCustom ? 'grid' : 'none';

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

    // --- Populate Model dropdown ---

    function populateModelDropdown(agentKey, models, preserveSelection) {
        var sel = $('trinity-' + agentKey + '-model');
        if (!sel) return;
        var prev = preserveSelection ? sel.value : '';
        sel.innerHTML = '';
        var def = createEl('option', '', '— Select model —');
        def.value = '';
        sel.appendChild(def);
        models.forEach(function (m) {
            var name = typeof m === 'string' ? m : m.name || m.id || '';
            if (!name) return;
            var clean = name.replace(/^models\//, '');
            var o = createEl('option', '', clean);
            o.value = clean;
            sel.appendChild(o);
        });
        if (prev) {
            var found = false;
            for (var i = 0; i < sel.options.length; i++) {
                if (sel.options[i].value === prev) found = true;
            }
            if (found) sel.value = prev;
        }
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
            }
        } catch (err) {
            badge.textContent = 'Failed: ' + (err && err.message ? err.message : 'network error');
            badge.className = 'trinity-format-badge tone-red';
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

        var root = createEl('div', '');
        root.id = 'trinityRoot';

        // ── Togol dwimod ──
        var toggleBar = createEl('div', 'trinity-mode-bar');
        toggleBar.appendChild(createEl('span', 'trinity-mode-label', 'Basic Mode'));

        var switchWrap = createEl('label', 'trinity-switch');
        var toggleInput = createEl('input');
        toggleInput.type = 'checkbox';
        toggleInput.id = 'trinityModeToggle';
        toggleInput.checked = currentMode === MODE_PRO;
        var slider = createEl('span', 'trinity-slider');
        switchWrap.appendChild(toggleInput);
        switchWrap.appendChild(slider);
        toggleBar.appendChild(switchWrap);
        toggleBar.appendChild(createEl('span', 'trinity-mode-label', 'Pro Mode'));
        root.appendChild(toggleBar);

        // ── Bekas kad ──
        var cardsWrap = createEl('div', 'trinity-cards');
        cardsWrap.id = 'trinityCards';
        root.appendChild(cardsWrap);

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
        var grid = null;
        for (var i = 0; i < section.children.length; i++) {
            var c = section.children[i];
            if (c.classList && c.classList.contains('section-grid')) {
                grid = c;
                break;
            }
        }
        if (grid && grid.parentNode === section) {
            section.insertBefore(root, grid.nextSibling);
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
                    // Masukkan sebagai option kalau tiada dalam katalog
                    var found = false;
                    for (var i = 0; i < modelEl.options.length; i++) {
                        if (modelEl.options[i].value === stored.model) found = true;
                    }
                    if (!found) {
                        var o = createEl('option', '', stored.model);
                        o.value = stored.model;
                        modelEl.appendChild(o);
                    }
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
            } else if (agent.key === 'translation') {
                // Seed daripada konfigurasi legasi (gemini)
                if (cfg.geminiApiKey) keyEl.value = cfg.geminiApiKey;
                if (cfg.geminiModel) {
                    var name = String(cfg.geminiModel).replace(/^models\//, '');
                    modelEl.appendChild(Object.assign(createEl('option', '', name), { value: name }));
                    modelEl.value = name;
                }
                providerEl.value = 'gemini';
            }

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
                preflightModel: pf.model || 'kimi-k3',
                fallbackModel: 'deepseek-v4.1-flash'
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
