/* Prompt Sandbox — explicit session/editor lifecycle with text-only rendering. */
(function () {
    'use strict';

    var API_ROOT = '/api/sandbox';
    var STORAGE_KEY = 'sandboxAdminKey';
    var MAX_FIELD_CHARS = 50000;
    var UI_STATES = Object.freeze({
        LOCKED: 'LOCKED',
        UNLOCKING: 'UNLOCKING',
        READY: 'READY',
        SAVING: 'SAVING',
        RESETTING: 'RESETTING'
    });
    var ALLOWED_TRANSITIONS = Object.freeze({
        LOCKED: ['UNLOCKING'],
        UNLOCKING: ['READY', 'LOCKED'],
        READY: ['SAVING', 'RESETTING', 'LOCKED'],
        SAVING: ['READY', 'LOCKED'],
        RESETTING: ['READY', 'LOCKED']
    });

    var uiState = UI_STATES.LOCKED;
    var sandboxKey = '';
    var operationSequence = 0;
    var copySequence = 0;
    var elements = {};

    function requiredElement(id) {
        var element = document.getElementById(id);
        if (!element) throw new Error('Struktur panel tidak lengkap: ' + id);
        return element;
    }

    function collectElements() {
        [
            'auth-screen',
            'auth-form',
            'sandbox-key',
            'reveal-key',
            'auth-submit',
            'auth-submit-label',
            'auth-feedback',
            'sandbox-panel',
            'lock-panel',
            'config-form',
            'enabled',
            'enabled-value',
            'enabled-status',
            'active-status',
            'status-beacon',
            'hash8',
            'source-status',
            'feedback-region',
            'status-note',
            'translationSystemTemplate',
            'malayFewShot',
            'template-count',
            'few-shot-count',
            'template-error',
            'few-shot-error',
            'save-config',
            'save-label',
            'copy-draft',
            'copy-label',
            'reset-config',
            'reset-label',
            'reset-dialog',
            'cancel-reset',
            'confirm-reset',
            'theme-toggle',
            'theme-label'
        ].forEach(function (id) {
            elements[id] = requiredElement(id);
        });
    }

    function setVisible(element, visible) {
        element.classList.toggle('hidden', !visible);
    }

    function setInlineMessage(element, message) {
        element.textContent = message || '';
        setVisible(element, Boolean(message));
    }

    function setAuthMessage(message) {
        setInlineMessage(elements['auth-feedback'], message);
    }

    function transitionTo(nextState) {
        if (nextState === uiState) {
            renderState();
            return;
        }
        if (!ALLOWED_TRANSITIONS[uiState].includes(nextState)) {
            throw new Error('Peralihan keadaan tidak sah: ' + uiState + ' -> ' + nextState);
        }
        uiState = nextState;
        document.body.dataset.sandboxState = nextState;
        renderState();
    }

    function hasOversizedField() {
        return (
            elements.translationSystemTemplate.value.length > MAX_FIELD_CHARS ||
            elements.malayFewShot.value.length > MAX_FIELD_CHARS
        );
    }

    function renderState() {
        var isLocked = uiState === UI_STATES.LOCKED || uiState === UI_STATES.UNLOCKING;
        var isBusy = uiState === UI_STATES.SAVING || uiState === UI_STATES.RESETTING;
        var isUnlocking = uiState === UI_STATES.UNLOCKING;
        var isSaving = uiState === UI_STATES.SAVING;
        var isResetting = uiState === UI_STATES.RESETTING;

        setVisible(elements['auth-screen'], isLocked);
        setVisible(elements['sandbox-panel'], !isLocked);
        elements['config-form'].setAttribute('aria-busy', String(isBusy));
        elements['auth-form'].setAttribute('aria-busy', String(isUnlocking));

        elements['sandbox-key'].disabled = isUnlocking;
        elements['reveal-key'].disabled = isUnlocking;
        elements['auth-submit'].disabled = isUnlocking;
        elements['auth-submit-label'].textContent = isUnlocking ? 'Mengesahkan…' : 'Buka sandbox';

        elements.enabled.disabled = isBusy;
        elements.translationSystemTemplate.readOnly = isBusy;
        elements.malayFewShot.readOnly = isBusy;
        elements['lock-panel'].disabled = isBusy;
        elements['save-config'].disabled = isBusy || hasOversizedField();
        elements['reset-config'].disabled = isBusy;
        elements['copy-draft'].disabled = isBusy;
        elements['save-label'].textContent = isSaving ? 'Menyimpan…' : 'Simpan & Aktifkan';
        elements['reset-label'].textContent = isResetting ? 'Memulihkan…' : 'Reset ke Rasmi';
    }

    function clearStoredKey() {
        sandboxKey = '';
        try {
            window.sessionStorage.removeItem(STORAGE_KEY);
            return true;
        } catch (_) {
            return false;
        }
    }

    function storeKey(key) {
        try {
            window.sessionStorage.setItem(STORAGE_KEY, key);
            sandboxKey = key;
            return true;
        } catch (_) {
            sandboxKey = '';
            return false;
        }
    }

    function readStoredKey() {
        try {
            return window.sessionStorage.getItem(STORAGE_KEY) || '';
        } catch (_) {
            setAuthMessage('Storan sesi pelayar tidak tersedia. Dayakannya untuk membuka sandbox.');
            return '';
        }
    }

    function clearEditor() {
        elements.enabled.checked = false;
        elements.translationSystemTemplate.value = '';
        elements.malayFewShot.value = '';
        elements['enabled-value'].textContent = 'OFF';
        elements['enabled-status'].textContent = 'OFF';
        elements['active-status'].textContent = 'Tidak Aktif';
        elements['status-beacon'].classList.remove('is-active');
        elements.hash8.textContent = '—';
        elements['source-status'].textContent = 'Rasmi';
        clearFeedback();
        updateEditorMetrics();
    }

    function lockPanel(message) {
        operationSequence += 1;
        copySequence += 1;
        var storageCleared = clearStoredKey();
        elements['sandbox-key'].value = '';
        elements['sandbox-key'].type = 'password';
        elements['reveal-key'].setAttribute('aria-label', 'Tunjukkan kunci');
        clearEditor();
        if (uiState !== UI_STATES.LOCKED) transitionTo(UI_STATES.LOCKED);
        else renderState();
        var finalMessage = message || 'Panel dikunci.';
        if (!storageCleared) finalMessage += ' Storan sesi tidak dapat dikosongkan; tutup tab ini untuk keselamatan.';
        setAuthMessage(finalMessage);
        elements['copy-label'].textContent = 'Salin Draf';
    }

    function ApiError(status, payload) {
        this.name = 'ApiError';
        this.status = status;
        this.payload = payload || {};
        this.message = 'Sandbox request failed with status ' + status;
    }
    ApiError.prototype = Object.create(Error.prototype);
    ApiError.prototype.constructor = ApiError;

    async function sandboxFetch(path, options, keyOverride) {
        var request = options || {};
        var key = typeof keyOverride === 'string' ? keyOverride : sandboxKey;
        var headers = { 'X-Sandbox-Key': key, Accept: 'application/json' };
        if (request.body !== undefined) headers['Content-Type'] = 'application/json';
        var response;
        try {
            response = await window.fetch(API_ROOT + path, {
                method: request.method || 'GET',
                headers: headers,
                body: request.body,
                credentials: 'same-origin',
                cache: 'no-store'
            });
        } catch (_) {
            throw new ApiError(0, { error: 'network_unavailable' });
        }

        var payload = null;
        try {
            payload = await response.json();
        } catch (_) {
            payload = null;
        }
        if (response.status === 401) {
            var wasUnlocking = uiState === UI_STATES.UNLOCKING;
            lockPanel(
                wasUnlocking ? 'Kunci salah. Semak semula dan cuba lagi.' : 'Sesi kunci tamat — log masuk semula.'
            );
        }
        if (!response.ok) throw new ApiError(response.status, payload);
        if (!payload || typeof payload !== 'object') throw new ApiError(response.status, { error: 'invalid_response' });
        return payload;
    }

    function friendlyError(error, action) {
        var code = error && error.payload ? error.payload.error : '';
        if (code === 'sandbox_admin_key_not_configured') return 'Pelayan belum menetapkan SANDBOX_ADMIN_KEY.';
        if (code === 'storage_unavailable')
            return 'Storan sandbox tidak tersedia. Draf anda kekal dalam kotak; cuba lagi sebentar.';
        if (code === 'session_storage_unavailable')
            return 'Pelayar tidak membenarkan storan sesi. Dayakannya sebelum log masuk.';
        if (error && error.status === 429) return 'Terlalu banyak percubaan. Tunggu seminit sebelum mencuba lagi.';
        if (error && error.status === 0)
            return 'Tidak dapat menghubungi pelayan. Semak sambungan; draf dalam kotak tidak diubah.';
        if (code === 'invalid_response' || (error && error.status === 200)) {
            return 'Respons pelayan tidak lengkap. Tiada perubahan dibuat pada status yang dipaparkan.';
        }
        if (action === 'reset') return 'Templat rasmi belum dapat dipulihkan. Draf anda kekal; cuba lagi.';
        if (action === 'save') return 'Draf belum dapat disimpan. Semak semula medan dan cuba lagi.';
        return 'Sandbox belum dapat dibuka. Semak kunci dan cuba lagi.';
    }

    function clearFeedback() {
        elements['feedback-region'].replaceChildren();
        setVisible(elements['feedback-region'], false);
        elements['feedback-region'].removeAttribute('data-tone');
        elements['feedback-region'].removeAttribute('role');
    }

    function showFeedback(title, messages, tone) {
        var region = elements['feedback-region'];
        region.replaceChildren();
        var heading = document.createElement('p');
        heading.className = 'feedback-title';
        heading.textContent = title;
        region.appendChild(heading);
        if (messages && messages.length) {
            var list = document.createElement('ul');
            list.className = 'feedback-list';
            messages.forEach(function (message) {
                var item = document.createElement('li');
                item.textContent = String(message);
                list.appendChild(item);
            });
            region.appendChild(list);
        }
        region.dataset.tone = tone || 'info';
        if (tone === 'error') region.setAttribute('role', 'alert');
        setVisible(region, true);
    }

    function setStatusNote(message) {
        setInlineMessage(elements['status-note'], message);
    }

    function updateEditorMetrics() {
        [
            {
                input: elements.translationSystemTemplate,
                output: elements['template-count'],
                error: elements['template-error'],
                label: 'System Prompt'
            },
            {
                input: elements.malayFewShot,
                output: elements['few-shot-count'],
                error: elements['few-shot-error'],
                label: 'Contoh Dialog Melayu'
            }
        ].forEach(function (field) {
            var length = field.input.value.length;
            field.output.textContent = length.toLocaleString('ms-MY') + ' / 50,000 aksara';
            field.output.classList.toggle('is-over-limit', length > MAX_FIELD_CHARS);
            if (length > MAX_FIELD_CHARS) {
                field.input.setAttribute('aria-invalid', 'true');
                setInlineMessage(
                    field.error,
                    field.label + ' melebihi had 50,000 aksara. Pendekkan sebelum menyimpan.'
                );
            } else if (field.input.getAttribute('aria-invalid') === 'true') {
                field.input.removeAttribute('aria-invalid');
                setInlineMessage(field.error, '');
            }
        });
        if (uiState === UI_STATES.READY) elements['save-config'].disabled = hasOversizedField();
    }

    function fieldElements(fieldName) {
        if (fieldName === 'translationSystemTemplate') {
            return { input: elements.translationSystemTemplate, error: elements['template-error'] };
        }
        if (fieldName === 'malayFewShot') return { input: elements.malayFewShot, error: elements['few-shot-error'] };
        return null;
    }

    function showFieldErrors(fieldErrors) {
        var generalMessages = [];
        (Array.isArray(fieldErrors) ? fieldErrors : []).forEach(function (entry) {
            if (!entry || typeof entry.message !== 'string') return;
            var target = fieldElements(entry.field);
            if (target) {
                target.input.setAttribute('aria-invalid', 'true');
                setInlineMessage(target.error, entry.message);
            } else {
                generalMessages.push(entry.message);
            }
        });
        if (generalMessages.length) showFeedback('Semak semula draf anda', generalMessages, 'error');
    }

    function assertSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') throw new ApiError(200, { error: 'invalid_response' });
        if (
            typeof snapshot.officialTemplate !== 'string' ||
            typeof snapshot.officialMalayFewShot !== 'string' ||
            typeof snapshot.active !== 'boolean'
        ) {
            throw new ApiError(200, { error: 'invalid_response' });
        }
    }

    function applySnapshot(snapshot) {
        assertSnapshot(snapshot);
        elements.translationSystemTemplate.value =
            typeof snapshot.translationSystemTemplate === 'string'
                ? snapshot.translationSystemTemplate
                : snapshot.officialTemplate;
        elements.malayFewShot.value =
            typeof snapshot.malayFewShot === 'string' ? snapshot.malayFewShot : snapshot.officialMalayFewShot;
        elements.enabled.checked = snapshot.enabled === true;
        elements['enabled-value'].textContent = elements.enabled.checked ? 'ON' : 'OFF';
        elements['enabled-status'].textContent = elements.enabled.checked ? 'ON' : 'OFF';
        elements['active-status'].textContent = snapshot.active ? 'Aktif' : 'Tidak Aktif';
        elements['status-beacon'].classList.toggle('is-active', snapshot.active);
        elements.hash8.textContent = typeof snapshot.hash8 === 'string' && snapshot.hash8 ? snapshot.hash8 : '—';
        elements['source-status'].textContent = snapshot.source === 'redis' ? 'Redis' : 'Rasmi';
        var reasons = Array.isArray(snapshot.reasons)
            ? snapshot.reasons.filter(function (reason) {
                  return typeof reason === 'string';
              })
            : [];
        setStatusNote(
            reasons.length ? reasons[0] : 'Status ini menunjukkan konfigurasi yang berkuat kuasa di pelayan.'
        );
        updateEditorMetrics();
    }

    function warningMessages(warnings) {
        return (Array.isArray(warnings) ? warnings : [])
            .filter(function (warning) {
                return warning && typeof warning.message === 'string';
            })
            .map(function (warning) {
                return warning.message;
            });
    }

    async function unlock(key) {
        if (uiState !== UI_STATES.LOCKED || !key) return;
        var operation = ++operationSequence;
        setAuthMessage('');
        transitionTo(UI_STATES.UNLOCKING);
        try {
            await sandboxFetch('/auth', { method: 'POST', body: '{}' }, key);
            if (operation !== operationSequence) return;
            if (!storeKey(key)) throw new ApiError(0, { error: 'session_storage_unavailable' });
            var config = await sandboxFetch('/config');
            if (operation !== operationSequence) return;
            applySnapshot(config);
            clearFeedback();
            transitionTo(UI_STATES.READY);
            elements['sandbox-key'].value = '';
            elements.translationSystemTemplate.focus({ preventScroll: true });
        } catch (error) {
            if (operation !== operationSequence) return;
            transitionTo(UI_STATES.LOCKED);
            setAuthMessage(friendlyError(error, 'unlock'));
            elements['sandbox-key'].focus();
        }
    }

    async function saveConfig() {
        if (uiState !== UI_STATES.READY || hasOversizedField()) return;
        var operation = ++operationSequence;
        var payload = {
            enabled: elements.enabled.checked,
            translationSystemTemplate: elements.translationSystemTemplate.value || null,
            malayFewShot: elements.malayFewShot.value || null
        };
        clearFeedback();
        setStatusNote('Menyimpan kedua-dua medan dan menyegerakkan prompt…');
        transitionTo(UI_STATES.SAVING);
        try {
            var result = await sandboxFetch('/config', { method: 'PUT', body: JSON.stringify(payload) });
            if (operation !== operationSequence) return;
            applySnapshot(result.effective);
            var warnings = warningMessages(result.warnings);
            showFeedback(
                'Draf disimpan. Status pelayan telah dikemas kini.',
                warnings,
                warnings.length ? 'warning' : 'success'
            );
            transitionTo(UI_STATES.READY);
        } catch (error) {
            if (operation !== operationSequence) return;
            transitionTo(UI_STATES.READY);
            if (error.status === 400 && Array.isArray(error.payload.fieldErrors)) {
                showFieldErrors(error.payload.fieldErrors);
                if (!error.payload.fieldErrors.length)
                    showFeedback('Draf belum disimpan', ['Semak semula kedua-dua medan.'], 'error');
            } else {
                showFeedback('Draf belum disimpan', [friendlyError(error, 'save')], 'error');
            }
            setStatusNote('Draf masih berada dalam kotak. Tiada status baharu diandaikan.');
        }
    }

    async function resetConfig() {
        if (uiState !== UI_STATES.READY) return;
        var operation = ++operationSequence;
        clearFeedback();
        transitionTo(UI_STATES.RESETTING);
        try {
            var result = await sandboxFetch('/reset', { method: 'POST', body: '{}' });
            if (operation !== operationSequence) return;
            applySnapshot(result.effective);
            var config = await sandboxFetch('/config');
            if (operation !== operationSequence) return;
            applySnapshot(config);
            showFeedback(
                'Templat rasmi dipulihkan',
                ['Eksperimen tersimpan telah dipadam dan kedua-dua kotak kini menggunakan teks rasmi.'],
                'success'
            );
            transitionTo(UI_STATES.READY);
        } catch (error) {
            if (operation !== operationSequence) return;
            transitionTo(UI_STATES.READY);
            showFeedback('Reset belum selesai', [friendlyError(error, 'reset')], 'error');
        }
    }

    function draftText() {
        return [
            '<!-- promptSandbox draft — untuk dipindahkan ejen AI ke core.js / malay.js -->',
            '=== translationSystemTemplate ===',
            elements.translationSystemTemplate.value,
            '=== malayFewShot ===',
            elements.malayFewShot.value
        ].join('\n');
    }

    async function writeClipboard(text) {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text);
            return;
        }
        var temporary = document.createElement('textarea');
        temporary.value = text;
        temporary.setAttribute('readonly', '');
        temporary.style.position = 'fixed';
        temporary.style.top = '-1000px';
        temporary.style.opacity = '0';
        document.body.appendChild(temporary);
        try {
            temporary.select();
            if (!document.execCommand('copy')) throw new Error('Clipboard unavailable');
        } finally {
            temporary.remove();
        }
    }

    async function copyDraft() {
        if (uiState !== UI_STATES.READY) return;
        var operation = ++copySequence;
        elements['copy-draft'].disabled = true;
        elements['copy-label'].textContent = 'Menyalin…';
        try {
            await writeClipboard(draftText());
            if (operation !== copySequence) return;
            elements['copy-label'].textContent = 'Draf disalin';
            showFeedback(
                'Draf disalin ke papan keratan',
                ['Penanda promptSandbox disertakan untuk serahan kepada ejen AI.'],
                'success'
            );
        } catch (_) {
            if (operation !== copySequence) return;
            elements['copy-label'].textContent = 'Salin Draf';
            showFeedback(
                'Papan keratan tidak tersedia',
                ['Benarkan akses papan keratan dalam tetapan pelayar, kemudian cuba lagi.'],
                'error'
            );
        } finally {
            if (operation === copySequence) {
                elements['copy-draft'].disabled = uiState !== UI_STATES.READY;
                if (elements['copy-label'].textContent === 'Menyalin…')
                    elements['copy-label'].textContent = 'Salin Draf';
            }
        }
    }

    function markDirty(changedField) {
        if (uiState !== UI_STATES.READY) return;
        if (changedField) {
            var target = fieldElements(changedField);
            if (target) {
                target.input.removeAttribute('aria-invalid');
                setInlineMessage(target.error, '');
            }
        }
        clearFeedback();
        updateEditorMetrics();
        setStatusNote('Perubahan belum disimpan. Status di atas masih menunjukkan konfigurasi terakhir di pelayan.');
    }

    function updateThemeControl() {
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        var label = isDark ? 'Mod cerah' : 'Mod gelap';
        elements['theme-label'].textContent = label;
        elements['theme-toggle'].setAttribute('aria-label', 'Tukar ke ' + label.toLowerCase());
    }

    function toggleTheme() {
        var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        document.documentElement.setAttribute('data-theme-pref', next);
        try {
            window.localStorage.setItem('theme', next);
        } catch (_) {
            /* Tema masih berfungsi untuk sesi ini walaupun pilihan tidak dapat disimpan. */
        }
        updateThemeControl();
    }

    function bindEvents() {
        elements['auth-form'].addEventListener('submit', function (event) {
            event.preventDefault();
            var key = elements['sandbox-key'].value;
            if (!key) {
                setAuthMessage('Masukkan kunci pentadbir sandbox.');
                elements['sandbox-key'].focus();
                return;
            }
            unlock(key);
        });
        elements['reveal-key'].addEventListener('click', function () {
            var reveal = elements['sandbox-key'].type === 'password';
            elements['sandbox-key'].type = reveal ? 'text' : 'password';
            elements['reveal-key'].setAttribute('aria-label', reveal ? 'Sembunyikan kunci' : 'Tunjukkan kunci');
        });
        elements['config-form'].addEventListener('submit', function (event) {
            event.preventDefault();
            saveConfig();
        });
        elements['reset-config'].addEventListener('click', function () {
            if (uiState !== UI_STATES.READY) return;
            elements['reset-dialog'].showModal();
        });
        elements['cancel-reset'].addEventListener('click', function () {
            elements['reset-dialog'].close('cancel');
        });
        elements['confirm-reset'].addEventListener('click', function () {
            elements['reset-dialog'].close('confirm');
            resetConfig();
        });
        elements['lock-panel'].addEventListener('click', function () {
            lockPanel('Panel dikunci. Kunci sesi telah dibuang.');
            elements['sandbox-key'].focus();
        });
        elements['copy-draft'].addEventListener('click', copyDraft);
        elements['theme-toggle'].addEventListener('click', toggleTheme);
        elements.enabled.addEventListener('change', function () {
            elements['enabled-value'].textContent = elements.enabled.checked ? 'ON' : 'OFF';
            markDirty(null);
        });
        elements.translationSystemTemplate.addEventListener('input', function () {
            markDirty('translationSystemTemplate');
        });
        elements.malayFewShot.addEventListener('input', function () {
            markDirty('malayFewShot');
        });
        window.addEventListener('storage', function (event) {
            if (event.key === 'theme' && (event.newValue === 'light' || event.newValue === 'dark')) {
                document.documentElement.setAttribute('data-theme', event.newValue);
                updateThemeControl();
            }
        });
    }

    function initialize() {
        collectElements();
        bindEvents();
        updateThemeControl();
        renderState();
        updateEditorMetrics();
        var savedKey = readStoredKey();
        if (savedKey) unlock(savedKey);
        else elements['sandbox-key'].focus({ preventScroll: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
    else initialize();
})();
