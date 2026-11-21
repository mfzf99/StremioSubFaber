/* Prompt Sandbox — explicit session/editor lifecycle with text-only rendering. */
(function () {
    'use strict';

    var API_ROOT = '/api/sandbox';
    var STORAGE_KEY = 'sandboxAdminKey';
    var MAX_FIELD_CHARS = 50000;
    // [SANDBOX-TUNING v3.39.7] Fallback defensif hanya jika backend lama tidak
    // membawa engineDefaults/limits; semasa runtime dibaca dari GET config.
    var TUNING_DEFAULTS = { batchSize: 200, previousContextSize: 20, futureContextSize: 10 };
    var TUNING_LIMITS = {
        batchSize: { min: 1, max: 400 },
        previousContextSize: { min: 0, max: 30 },
        futureContextSize: { min: 0, max: 15 }
    };
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
        if (!element) throw new Error('Panel structure is incomplete: ' + id);
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
            'tuning-status',
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
            'theme-label',
            'batch-size',
            'batch-size-error',
            'previous-context-size',
            'previous-context-size-error',
            'future-context-size',
            'future-context-size-error'
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
            throw new Error('Illegal state transition: ' + uiState + ' -> ' + nextState);
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
        elements['auth-submit-label'].textContent = isUnlocking ? 'Verifying…' : 'Unlock Sandbox';

        elements.enabled.disabled = isBusy;
        elements.translationSystemTemplate.readOnly = isBusy;
        elements.malayFewShot.readOnly = isBusy;
        elements['batch-size'].disabled = isBusy;
        elements['previous-context-size'].disabled = isBusy;
        elements['future-context-size'].disabled = isBusy;
        elements['lock-panel'].disabled = isBusy;
        elements['save-config'].disabled = isBusy || hasOversizedField();
        elements['reset-config'].disabled = isBusy;
        elements['copy-draft'].disabled = isBusy;
        elements['save-label'].textContent = isSaving ? 'Saving…' : 'Save & Activate';
        elements['reset-label'].textContent = isResetting ? 'Resetting…' : 'Reset to Official';
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
            setAuthMessage('Browser session storage is unavailable. Enable it to unlock the sandbox.');
            return '';
        }
    }

    function clearEditor() {
        elements.enabled.checked = false;
        elements.translationSystemTemplate.value = '';
        elements.malayFewShot.value = '';
        applyTuningValue('batch-size', null);
        applyTuningValue('previous-context-size', null);
        applyTuningValue('future-context-size', null);
        clearTuningErrors();
        elements['enabled-value'].textContent = 'OFF';
        elements['enabled-status'].textContent = 'OFF';
        elements['active-status'].textContent = 'Inactive';
        elements['status-beacon'].classList.remove('is-active');
        elements.hash8.textContent = '—';
        elements['source-status'].textContent = 'Official';
        elements['tuning-status'].textContent = 'Engine defaults';
        clearFeedback();
        updateEditorMetrics();
    }

    function clearTuningErrors() {
        ['batch-size', 'previous-context-size', 'future-context-size'].forEach(function (id) {
            elements[id].removeAttribute('aria-invalid');
            setInlineMessage(elements[id + '-error'], '');
        });
    }

    function normalizeLimits(snapshot) {
        var defaults = snapshot && snapshot.engineDefaults ? snapshot.engineDefaults : TUNING_DEFAULTS;
        var limits = snapshot && Array.isArray(snapshot.limits) ? snapshot.limits : [];
        ['batch-size', 'previous-context-size', 'future-context-size'].forEach(function (id, index) {
            var field = ['batchSize', 'previousContextSize', 'futureContextSize'][index];
            var def = defaults[field];
            if (typeof def === 'number' && Number.isInteger(def)) elements[id].placeholder = String(def);
            var bound = limits.find(function (entry) {
                return entry && entry.field === field;
            });
            var range = bound || TUNING_LIMITS[field];
            if (range && typeof range.min === 'number') elements[id].min = String(range.min);
            if (range && typeof range.max === 'number') elements[id].max = String(range.max);
        });
    }

    function applyTuningValue(id, value) {
        elements[id].value = value === null || value === undefined ? '' : String(value);
    }

    function readTuningValue(id) {
        var raw = elements[id].value.trim();
        if (raw === '') return null;
        var field =
            id === 'batch-size'
                ? 'batchSize'
                : id === 'previous-context-size'
                  ? 'previousContextSize'
                  : 'futureContextSize';
        var range = TUNING_LIMITS[field];
        var min = Number(elements[id].min);
        var max = Number(elements[id].max);
        if (!Number.isFinite(min)) min = range.min;
        if (!Number.isFinite(max)) max = range.max;
        var value = Number(raw);
        if (!Number.isInteger(value) || value < min || value > max) {
            elements[id].setAttribute('aria-invalid', 'true');
            setInlineMessage(
                elements[id + '-error'],
                'Use a whole number between ' + min + ' and ' + max + ', or leave it empty for the engine default.'
            );
            return { invalid: true };
        }
        elements[id].removeAttribute('aria-invalid');
        setInlineMessage(elements[id + '-error'], '');
        return value;
    }

    function validateTuningFields() {
        clearTuningErrors();
        var values = {
            batchSize: readTuningValue('batch-size'),
            previousContextSize: readTuningValue('previous-context-size'),
            futureContextSize: readTuningValue('future-context-size')
        };
        var hasError = Object.keys(values).some(function (key) {
            return values[key] && typeof values[key] === 'object' && values[key].invalid === true;
        });
        if (hasError) {
            showFeedback(
                'Please review the chunking and context fields',
                ['Correct the highlighted numeric fields before saving.'],
                'error'
            );
            return null;
        }
        return values;
    }

    function lockPanel(message) {
        operationSequence += 1;
        copySequence += 1;
        var storageCleared = clearStoredKey();
        elements['sandbox-key'].value = '';
        elements['sandbox-key'].type = 'password';
        elements['reveal-key'].setAttribute('aria-label', 'Show key');
        clearEditor();
        if (uiState !== UI_STATES.LOCKED) transitionTo(UI_STATES.LOCKED);
        else renderState();
        var finalMessage = message || 'Panel locked.';
        if (!storageCleared) finalMessage += ' Session storage could not be cleared; close this tab to stay safe.';
        setAuthMessage(finalMessage);
        elements['copy-label'].textContent = 'Copy Draft';
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
                wasUnlocking
                    ? 'Invalid admin key. Check it and try again.'
                    : 'Key session expired — please log in again.'
            );
        }
        if (!response.ok) throw new ApiError(response.status, payload);
        if (!payload || typeof payload !== 'object') throw new ApiError(response.status, { error: 'invalid_response' });
        return payload;
    }

    function friendlyError(error, action) {
        var code = error && error.payload ? error.payload.error : '';
        if (code === 'sandbox_admin_key_not_configured') return 'SANDBOX_ADMIN_KEY is not configured on the server.';
        if (code === 'storage_unavailable')
            return 'Sandbox storage is unavailable. Your draft stays in the boxes; try again in a moment.';
        if (code === 'session_storage_unavailable')
            return 'Your browser is blocking session storage. Enable it before logging in.';
        if (error && error.status === 429) return 'Too many attempts — please wait a moment.';
        if (error && error.status === 0)
            return 'Could not reach the server. Check your connection; the draft in the boxes is unchanged.';
        if (code === 'invalid_response' || (error && error.status === 200)) {
            return 'The server response was incomplete. No change was made to the displayed status.';
        }
        if (action === 'reset')
            return 'The official templates could not be restored yet. Your draft is kept; try again.';
        if (action === 'save') return 'The draft could not be saved. Please check the fields and try again.';
        return 'The sandbox could not be opened. Check your key and try again.';
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
                label: 'Malay Few-Shot Examples'
            }
        ].forEach(function (field) {
            var length = field.input.value.length;
            field.output.textContent = length.toLocaleString('en-US') + ' / 50,000 characters';
            field.output.classList.toggle('is-over-limit', length > MAX_FIELD_CHARS);
            if (length > MAX_FIELD_CHARS) {
                field.input.setAttribute('aria-invalid', 'true');
                setInlineMessage(
                    field.error,
                    field.label + ' exceeds the 50,000-character limit. Shorten it before saving.'
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
        if (fieldName === 'batchSize') return { input: elements['batch-size'], error: elements['batch-size-error'] };
        if (fieldName === 'previousContextSize')
            return { input: elements['previous-context-size'], error: elements['previous-context-size-error'] };
        if (fieldName === 'futureContextSize')
            return { input: elements['future-context-size'], error: elements['future-context-size-error'] };
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
        if (generalMessages.length) showFeedback('Please review your draft', generalMessages, 'error');
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
        elements['active-status'].textContent = snapshot.active ? 'Active' : 'Inactive';
        elements['status-beacon'].classList.toggle('is-active', snapshot.active);
        elements.hash8.textContent = typeof snapshot.hash8 === 'string' && snapshot.hash8 ? snapshot.hash8 : '—';
        elements['source-status'].textContent = snapshot.source === 'redis' ? 'Redis' : 'Official';
        // [SANDBOX-TUNING v3.39.8] Paparan sekali-imbas state tuning tersimpan:
        // nilai aktif (cth. 40 / 5 / 3) atau default enjin bila semua kosong.
        // Pembacaan daripada snapshot GET sedia ada — sifar logik baharu.
        var tuningValues = [snapshot.batchSize, snapshot.previousContextSize, snapshot.futureContextSize];
        elements['tuning-status'].textContent = tuningValues.some(function (v) {
            return v !== null && v !== undefined;
        })
            ? tuningValues
                  .map(function (v) {
                      return v === null || v === undefined ? '·' : String(v);
                  })
                  .join(' / ')
            : 'Engine defaults';
        var reasons = Array.isArray(snapshot.reasons)
            ? snapshot.reasons.filter(function (reason) {
                  return typeof reason === 'string';
              })
            : [];
        setStatusNote(
            reasons.length ? reasons[0] : 'This status reflects the configuration currently in effect on the server.'
        );
        normalizeLimits(snapshot);
        applyTuningValue('batch-size', snapshot.batchSize);
        applyTuningValue('previous-context-size', snapshot.previousContextSize);
        applyTuningValue('future-context-size', snapshot.futureContextSize);
        clearTuningErrors();
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
        var tuning = validateTuningFields();
        if (!tuning) return;
        var operation = ++operationSequence;
        var payload = {
            enabled: elements.enabled.checked,
            translationSystemTemplate: elements.translationSystemTemplate.value || null,
            malayFewShot: elements.malayFewShot.value || null,
            batchSize: tuning.batchSize,
            previousContextSize: tuning.previousContextSize,
            futureContextSize: tuning.futureContextSize
        };
        clearFeedback();
        setStatusNote('Saving all fields and syncing the prompt…');
        transitionTo(UI_STATES.SAVING);
        try {
            var result = await sandboxFetch('/config', { method: 'PUT', body: JSON.stringify(payload) });
            if (operation !== operationSequence) return;
            applySnapshot(result.effective);
            var warnings = warningMessages(result.warnings);
            showFeedback('Sandbox saved and activated.', warnings, warnings.length ? 'warning' : 'success');
            transitionTo(UI_STATES.READY);
        } catch (error) {
            if (operation !== operationSequence) return;
            transitionTo(UI_STATES.READY);
            if (error.status === 400 && Array.isArray(error.payload.fieldErrors)) {
                showFieldErrors(error.payload.fieldErrors);
                if (!error.payload.fieldErrors.length)
                    showFeedback('The draft was not saved', ['Please review both fields.'], 'error');
            } else {
                showFeedback('The draft was not saved', [friendlyError(error, 'save')], 'error');
            }
            setStatusNote('Your draft is still in the boxes. No new status is assumed.');
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
                'Sandbox reset to official templates.',
                ['The saved experiment was deleted and both boxes now use the official text.'],
                'success'
            );
            transitionTo(UI_STATES.READY);
        } catch (error) {
            if (operation !== operationSequence) return;
            transitionTo(UI_STATES.READY);
            showFeedback('Reset did not complete', [friendlyError(error, 'reset')], 'error');
        }
    }

    function draftText() {
        return [
            '<!-- promptSandbox draft — for AI-agent transfer into core.js / malay.js -->',
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
        elements['copy-label'].textContent = 'Copying…';
        try {
            await writeClipboard(draftText());
            if (operation !== copySequence) return;
            elements['copy-label'].textContent = 'Draft copied';
            showFeedback(
                'Draft copied to clipboard.',
                ['The promptSandbox marker is included for handing over to an AI agent.'],
                'success'
            );
        } catch (_) {
            if (operation !== copySequence) return;
            elements['copy-label'].textContent = 'Copy Draft';
            showFeedback(
                'Clipboard unavailable',
                ['Allow clipboard access in your browser settings, then try again.'],
                'error'
            );
        } finally {
            if (operation === copySequence) {
                elements['copy-draft'].disabled = uiState !== UI_STATES.READY;
                if (elements['copy-label'].textContent === 'Copying…')
                    elements['copy-label'].textContent = 'Copy Draft';
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
        setStatusNote('Unsaved changes. The status above still shows the last configuration saved on the server.');
    }

    function updateThemeControl() {
        var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        var label = isDark ? 'Light mode' : 'Dark mode';
        elements['theme-label'].textContent = label;
        elements['theme-toggle'].setAttribute('aria-label', 'Switch to ' + label.toLowerCase());
    }

    function toggleTheme() {
        var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        document.documentElement.setAttribute('data-theme-pref', next);
        try {
            window.localStorage.setItem('theme', next);
        } catch (_) {
            /* The theme still works for this session even if the preference cannot be saved. */
        }
        updateThemeControl();
    }

    function bindEvents() {
        elements['auth-form'].addEventListener('submit', function (event) {
            event.preventDefault();
            var key = elements['sandbox-key'].value;
            if (!key) {
                setAuthMessage('Enter the sandbox admin key.');
                elements['sandbox-key'].focus();
                return;
            }
            unlock(key);
        });
        elements['reveal-key'].addEventListener('click', function () {
            var reveal = elements['sandbox-key'].type === 'password';
            elements['sandbox-key'].type = reveal ? 'text' : 'password';
            elements['reveal-key'].setAttribute('aria-label', reveal ? 'Hide key' : 'Show key');
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
            lockPanel('Panel locked. The session key has been discarded.');
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
        ['batch-size', 'previous-context-size', 'future-context-size'].forEach(function (id) {
            elements[id].addEventListener('input', function () {
                markDirty();
                clearTuningErrors();
            });
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
