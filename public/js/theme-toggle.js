(function () {
    'use strict';

    // Modern 3-mode theme system: Light / Dark / System.
    // - localStorage 'theme' stores the *preference*: 'light' | 'dark' | 'system'.
    // - data-theme on <html> is always the *resolved* concrete theme ('light' | 'dark').
    // - data-theme-pref on <html> mirrors the preference so the segmented control
    //   can highlight the active choice (including 'system').
    var html = document.documentElement;
    var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    var VALID_PREFS = ['light', 'dark', 'system'];

    function normalizePref(pref) {
        if (pref === 'light' || pref === 'dark' || pref === 'system') return pref;
        // Legacy values migrate to a sensible concrete theme.
        if (pref === 'blackhole' || pref === 'true-dark') return 'dark';
        return null;
    }

    function readStoredPref() {
        try {
            return normalizePref(localStorage.getItem('theme'));
        } catch (_) {
            return null;
        }
    }

    function systemTheme() {
        return darkQuery && darkQuery.matches ? 'dark' : 'light';
    }

    function resolveTheme(pref) {
        return pref === 'system' ? systemTheme() : pref;
    }

    function getPreferredPref() {
        // Default to System when the user has never chosen explicitly.
        return readStoredPref() || 'system';
    }

    function updateSwitchState(pref) {
        var buttons = document.querySelectorAll('#themeToggle [data-theme-choice]');
        if (!buttons || !buttons.length) return;
        buttons.forEach(function (btn) {
            var active = btn.getAttribute('data-theme-choice') === pref;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
    }

    function applyPref(pref, persist) {
        var normalized = normalizePref(pref) || 'system';
        html.setAttribute('data-theme', resolveTheme(normalized));
        html.setAttribute('data-theme-pref', normalized);
        try {
            if (persist === true) {
                localStorage.setItem('theme', normalized);
            }
        } catch (_) {}
        updateSwitchState(normalized);
        return normalized;
    }

    function wireToggle() {
        // DESKTOP: if the page bootstrap forced light (dashboard Rootsys pattern),
        // do NOT re-apply the stored preference — desktop is light-only with no
        // toggle. The theme system stays available for mobile/tablet later.
        if (
            document.documentElement.getAttribute('data-theme-pref') === 'light' &&
            !document.getElementById('themeToggle')
        ) {
            return;
        }

        // Re-apply on boot so data-theme-pref + button state match the stored pref,
        // and legacy stored values ('blackhole') get migrated on disk.
        var stored = readStoredPref();
        applyPref(getPreferredPref(), stored != null);

        var control = document.getElementById('themeToggle');
        if (control && control.dataset.themeToggleBound !== 'true') {
            control.dataset.themeToggleBound = 'true';
            control.addEventListener('click', function (e) {
                var target = e.target && e.target.closest ? e.target.closest('[data-theme-choice]') : null;
                if (!target) return;
                var choice = normalizePref(target.getAttribute('data-theme-choice'));
                if (!choice) return;
                applyPref(choice, true);
            });
        }

        if (darkQuery && html.dataset.themeMediaListenerBound !== 'true') {
            html.dataset.themeMediaListenerBound = 'true';
            darkQuery.addEventListener('change', function () {
                // Only OS-follow mode reacts to system changes.
                if (getPreferredPref() === 'system') {
                    applyPref('system', false);
                }
            });
        }
    }

    (window.partialsReady || Promise.resolve()).finally(wireToggle);
})();
