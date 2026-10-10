/**
 * Trinity Agents UI — Modular Trinity Cards + Dual Mode Toggle (Fasa D, 2026-10-10)
 * plans/tri-door-provider-surgery-plan.md — pemisahan seni bina UI SubFaber
 *
 * Reka bentuk:
 *   - DOM dibina programatik (defensif penuh, null-check ketat per peraturan #4).
 *   - Input legasi #geminiApiKey DIPETAHILKAN (tersembunyi) — kontrak
 *     penyimpanan backend (currentConfig.geminiApiKey) kekal utuh.
 *   - Blok konfigurasi bersih `trinity` + `agentB` dihantar melalui
 *     collectConfig hook sedia ada tanpa memecahkan laluan parseConfig.
 *
 * Kontrak eksport (dipanggil config.js):
 *   window.TrinityAgents = { mount, collectConfigPatch, rehydrate }
 */
(function () {
    'use strict';

    var MODE_BASIC = 'basic';
    var MODE_PRO = 'pro';

    var FORMATS = [
        { value: 'auto', label: 'Auto (Disyorkan)' },
        { value: 'gemini', label: 'Google Gemini Native' },
        { value: 'openai', label: 'OpenAI-Compatible' },
        { value: 'anthropic', label: 'Anthropic Messages' }
    ];

    // Katalog model statik (asas — fallback bila Load Models gagal).
    // Kandungan diperkaya pada masa nyata oleh butang Test/Load melalui backend.
    var MODEL_CATALOG = {
        gemini: ['gemini-3.7-flash', 'gemini-3.5-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
        anthropic: ['claude-sonnet-4', 'claude-opus-4.1', 'claude-haiku-4.5'],
        openai: ['deepseek-v4-pro', 'deepseek-v4.1-flash', 'kimi-k3', 'glm-5.3', 'gpt-5-mini', 'qwen3-max']
    };

    var AGENTS = [
        {
            key: 'preflight',
            title: 'Agent Preflight',
            subtitle: 'Fasa 0 — bina Bible konteks (terms, watak, credits) sebelum terjemahan',
            configPath: 'trinity.preflight'
        },
        {
            key: 'translation',
            title: 'Agent Translation',
            subtitle: 'Enjin terjemahan utama (batch XML → SRT)',
            configPath: 'trinity.translation'
        },
        {
            key: 'inspector',
            title: 'Agent Inspector',
            subtitle: 'Fasa 1 — audit semantik per-batch (split/merge/drop/phantom crimes)',
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
        return { label: 'Tiada kunci', tone: 'muted' };
    }

    // --- Pembina kad modular ---

    function buildAgentCard(agent, mode) {
        var card = createEl('div', 'trinity-agent-card');
        card.dataset.agent = agent.key;

        var head = createEl('div', 'trinity-agent-head');
        head.appendChild(createEl('div', 'trinity-agent-title', agent.title));
        head.appendChild(createEl('div', 'trinity-agent-sub', agent.subtitle));
        card.appendChild(head);

        // API key row (password + toggle + test)
        var keyRow = createEl('div', 'trinity-field');
        keyRow.appendChild(createEl('label', '', 'API Key'));
        var keyWrap = createEl('div', 'trinity-input-wrap');
        var keyInput = createEl('input', 'trinity-key-input');
        keyInput.type = 'password';
        keyInput.id = 'trinity-' + agent.key + '-key';
        keyInput.autocomplete = 'off';
        keyInput.spellcheck = false;
        keyInput.placeholder = 'Masukkan API key…';
        keyWrap.appendChild(keyInput);

        var eyeBtn = createEl('button', 'trinity-eye-btn');
        eyeBtn.type = 'button';
        eyeBtn.setAttribute('aria-label', 'Tunjuk/sembunyi kunci');
        eyeBtn.textContent = '👁';
        eyeBtn.addEventListener('click', function () {
            keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
        });
        keyWrap.appendChild(eyeBtn);

        var testBtn = createEl('button', 'validate-api-btn btn-sm');
        testBtn.type = 'button';
        testBtn.dataset.agentTest = agent.key;
        testBtn.innerHTML = '<span class="validate-icon">✓</span><span class="validate-text">Test</span>';
        keyWrap.appendChild(testBtn);
        keyRow.appendChild(keyWrap);

        // Autodetect badge
        var badge = createEl('span', 'trinity-format-badge tone-muted');
        badge.id = 'trinity-' + agent.key + '-badge';
        badge.textContent = 'Tiada kunci';
        keyRow.appendChild(badge);
        card.appendChild(keyRow);

        // Format dropdown
        var fmtRow = createEl('div', 'trinity-field');
        fmtRow.appendChild(createEl('label', '', 'Format / Pintu'));
        var fmtSelect = createEl('select', 'trinity-format-select');
        fmtSelect.id = 'trinity-' + agent.key + '-format';
        FORMATS.forEach(function (f) {
            var opt = createEl('option', '', f.label);
            opt.value = f.value;
            fmtSelect.appendChild(opt);
        });
        fmtRow.appendChild(fmtSelect);
        card.appendChild(fmtRow);

        // Base URL
        var urlRow = createEl('div', 'trinity-field');
        urlRow.appendChild(createEl('label', '', 'Base URL'));
        var urlInput = createEl('input', 'trinity-baseurl-input');
        urlInput.type = 'text';
        urlInput.id = 'trinity-' + agent.key + '-baseurl';
        urlInput.placeholder = 'https://…/v1 (pilihan — gateway/proksi)';
        urlRow.appendChild(urlInput);
        card.appendChild(urlRow);

        // Model dropdown + Load models button
        var modelRow = createEl('div', 'trinity-field');
        modelRow.appendChild(createEl('label', '', 'Model'));
        var modelWrap = createEl('div', 'trinity-input-wrap');
        var modelSelect = createEl('select', 'trinity-model-select');
        modelSelect.id = 'trinity-' + agent.key + '-model';
        modelSelect.appendChild(createEl('option', '', '— Pilih model —'));
        modelWrap.appendChild(modelSelect);
        var loadBtn = createEl('button', 'validate-api-btn btn-sm');
        loadBtn.type = 'button';
        loadBtn.dataset.agentLoad = agent.key;
        loadBtn.innerHTML = '<span class="validate-icon">↻</span><span class="validate-text">Load</span>';
        modelWrap.appendChild(loadBtn);
        modelRow.appendChild(modelWrap);
        card.appendChild(modelRow);

        // Pro-only detail rows (boleh ditambah: timeout, fallback dll.)
        if (mode === MODE_PRO) {
            var hint = createEl('div', 'trinity-agent-hint');
            hint.textContent = 'Simpan → autodetect keyDetector backend mengambil alih (override dropdown ini menang).';
            card.appendChild(hint);
        }

        return card;
    }

    // --- Autodetect badge update ---

    function wireAutodetect(agentKey) {
        var keyInput = $('trinity-' + agentKey + '-key');
        var badge = $('trinity-' + agentKey + '-badge');
        var fmtSelect = $('trinity-' + agentKey + '-format');
        if (!keyInput || !badge || !fmtSelect) return;

        function refresh() {
            var detected = detectFormatFromKey(keyInput.value);
            var meta = formatBadgeMeta(detected);
            badge.textContent = meta.label;
            badge.className = 'trinity-format-badge tone-' + meta.tone;

            // Dropdown auto → isyaratkan pintu yang dikesan (tanpa mengubah nilai
            // 'auto' itu sendiri — autodetect backend yang membuat keputusan muktamad).
            if (fmtSelect.value === 'auto' && detected) {
                badge.textContent = meta.label + ' (auto)';
            }

            // Model catalog mengikut pintu berkesan (dropdown > detect > openai)
            var effective = fmtSelect.value !== 'auto' ? fmtSelect.value : detected || 'openai';
            repopulateModels(agentKey, effective);
        }

        keyInput.addEventListener('input', refresh);
        fmtSelect.addEventListener('change', refresh);
        refresh();
    }

    function repopulateModels(agentKey, format) {
        var sel = $('trinity-' + agentKey + '-model');
        if (!sel) return;
        var list = MODEL_CATALOG[format] || MODEL_CATALOG.openai;
        var prev = sel.value;
        sel.innerHTML = '';
        var def = createEl('option', '', '— Pilih model —');
        def.value = '';
        sel.appendChild(def);
        list.forEach(function (m) {
            var o = createEl('option', '', m);
            o.value = m;
            sel.appendChild(o);
        });
        // Kekal pilihan sedia ada jika masih sah dalam katalog baharu
        if (prev && list.indexOf(prev) !== -1) sel.value = prev;
    }

    // --- Test / Load models handlers ---

    function wireTestAndLoad(agentKey) {
        var testBtn = document.querySelector('[data-agent-test="' + agentKey + '"]');
        var loadBtn = document.querySelector('[data-agent-load="' + agentKey + '"]');

        if (testBtn) {
            testBtn.addEventListener('click', function () {
                runAgentTest(agentKey, testBtn);
            });
        }
        if (loadBtn) {
            loadBtn.addEventListener('click', function () {
                loadModels(agentKey, loadBtn);
            });
        }
    }

    async function runAgentTest(agentKey, btn) {
        var keyInput = $('trinity-' + agentKey + '-key');
        var badge = $('trinity-' + agentKey + '-badge');
        if (!keyInput || !badge) return;
        var key = keyInput.value.trim();
        if (!key) {
            badge.textContent = 'Masukkan kunci dahulu';
            badge.className = 'trinity-format-badge tone-red';
            return;
        }
        btn.disabled = true;
        var old = btn.innerHTML;
        btn.innerHTML = '<span class="validate-icon">…</span>';
        try {
            // Laluan validasi sedia ada (format-agnostik di peringkat backend —
            // endpoint validate-gemini menerima sebarang key dan mengembalikan senarai model).
            var resp = await fetch('/api/validate-gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: key })
            });
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            var data = await resp.json();
            badge.textContent = 'Sah ✓ (' + (detectFormatFromKey(key) || 'openai') + ')';
            badge.className = 'trinity-format-badge tone-green';
            if (Array.isArray(data.models)) {
                var sel = $('trinity-' + agentKey + '-model');
                if (sel && data.models.length) {
                    var prev = sel.value;
                    sel.innerHTML = '';
                    data.models.slice(0, 50).forEach(function (m) {
                        var name = typeof m === 'string' ? m : m.name || m.id || '';
                        if (!name) return;
                        var o = createEl('option', '', name.replace(/^models\//, ''));
                        o.value = name.replace(/^models\//, '');
                        sel.appendChild(o);
                    });
                    if (prev) sel.value = prev;
                }
            }
        } catch (err) {
            badge.textContent = 'Gagal: ' + (err && err.message ? err.message : 'tidak sah');
            badge.className = 'trinity-format-badge tone-red';
        } finally {
            btn.disabled = false;
            btn.innerHTML = old;
        }
    }

    async function loadModels(agentKey, btn) {
        // Alias Test — kedua-duanya memuatkan senarai model melalui laluan sama.
        await runAgentTest(agentKey, btn);
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

        // Semak sedia ada (idempotent — dipanggil semula semasa rehydrate)
        var existing = $('trinityRoot');
        if (existing) existing.remove();

        var currentMode = (cfg && cfg.trinity && cfg.trinity.mode) || (cfg && cfg.mode) || MODE_BASIC;

        var root = createEl('div', '');
        root.id = 'trinityRoot';

        // ── Togol dwimod ──
        var toggleBar = createEl('div', 'trinity-mode-bar');
        toggleBar.appendChild(createEl('span', 'trinity-mode-label', 'Mod Asas'));

        var switchWrap = createEl('label', 'trinity-switch');
        var toggleInput = createEl('input');
        toggleInput.type = 'checkbox';
        toggleInput.id = 'trinityModeToggle';
        toggleInput.checked = currentMode === MODE_PRO;
        var slider = createEl('span', 'trinity-slider');
        switchWrap.appendChild(toggleInput);
        switchWrap.appendChild(slider);
        toggleBar.appendChild(switchWrap);
        toggleBar.appendChild(createEl('span', 'trinity-mode-label', 'Mod Lanjutan'));
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
                wireTestAndLoad(agent.key);
            });
            applyAgentValues(getEffectiveConfig());
        }

        toggleInput.addEventListener('change', function () {
            var mode = toggleInput.checked ? MODE_PRO : MODE_BASIC;
            var c = getEffectiveConfig();
            if (c) {
                c.trinity = c.trinity || {};
                c.trinity.mode = mode;
                // Basic mode: kunci formula legasi kelompok (4 prev / 50 batch / 2 future)
                if (mode === MODE_BASIC) {
                    c.previousContextSize = 4;
                    c.batchSize = 50;
                    c.futureContextSize = 2;
                }
            }
            renderCards();
        });

        renderCards();
        section.insertBefore(root, section.querySelector('.card[data-card="subtitle-api"]'));

        // Sembunyikan kad legasi gemini (borang hardcoded + multi-providers beta).
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

        // [Ulasan Backend 2026-10-10] Segerak mod togol dengan nilai tersimpan
        // (trinity.mode) — mount awal mungkin berlaku sebelum config server
        // tiba; toggle mesti mencerminkan mod sebenar selepas rehydrate.
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
            if (!keyEl || !fmtEl || !urlEl || !modelEl) return;

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
            } else if (agent.key === 'translation') {
                // Seed daripada konfigurasi legasi (gemini) supaya pengguna
                // sedia ada tidak kehilangan kunci mereka.
                if (cfg.geminiApiKey) keyEl.value = cfg.geminiApiKey;
                if (cfg.geminiModel) {
                    var name = String(cfg.geminiModel).replace(/^models\//, '');
                    modelEl.appendChild(Object.assign(createEl('option', '', name), { value: name }));
                    modelEl.value = name;
                }
            }
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
            trinity[agent.key] = {
                apiKey: key.trim(),
                format: format,
                baseUrl: baseUrl.trim(),
                model: model.trim(),
                enabled: !!key.trim()
            };
        });

        // Pemetaan legasi (keserasian backend sedia ada):
        //   - Agent Translation → konfigurasi gemini (laluan parseConfig utama)
        //   - Agent Preflight + Inspector → blok agentB (Fasa 0/1)
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

        // Basic mode: kunci formula legasi kelompok
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
        MODES: { BASIC: MODE_BASIC, PRO: MODE_PRO }
    };
})();
