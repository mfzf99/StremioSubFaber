/* ═══════════════════════════════════════════════════════════
   SubFaber App Shell — Sidebar Router (true app navigation)
   ───────────────────────────────────────────────────────────
   Virtual pages inside ONE DOM + ONE <form id="configForm">.
   Hash routing (#/overview … #/system), display:none for
   inactive pages so config.js can still read/write every
   input (220 getElementById hooks stay valid).

   Three mandatory behaviours (external review):
     1. <form> keeps novalidate — handled in markup.
     2. Sticky action bar always visible — handled in markup/CSS.
     3. Hash fallback on load — handled here: empty/invalid
        hash → #/overview (never a blank or stacked page).
   ═══════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    // Page registry — order defines sidebar + bottom-nav order.
    // Configuration is ONE parent page containing every settings section
    // (scrollable, like the original SubFaber layout) so users see the full
    // structure in the sidebar but never lose context. Sub-items in the
    // sidebar are anchor links that scroll within this page.
    const PAGES = [
        { id: 'overview',       hash: '/overview',       group: 'account', icon: 'grid' },
        { id: 'configuration',  hash: '/configuration',  group: 'account', icon: 'sliders' },
        { id: 'toolbox',        hash: '/toolbox',        group: 'explore', icon: 'package' }
    ];

    // Anchor map: sidebar sub-item -> element ID within the Configuration page
    // that we should scroll to (and expand) when clicked.
    const CONFIG_ANCHORS = {
        'api-keys':        'apiKeysSection',
        'subtitles-api':   'subtitleApiTitle',
        'ai-translation':  'geminiCard',
        'languages':       'languagesSection',
        'source-languages': 'sourceCard',
        'target-languages': 'targetCard',
        'settings':        'settingsSection',
        'translation-settings': 'translationSettingsCard',
        'other-settings':  'otherSettingsCard'
    };

    const DEFAULT_PAGE = 'overview';
    const HASH_PREFIX = '#/';

    const ICONS = {
        grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>',
        key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/></svg>',
        languages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>',
        sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="2" x2="6" y1="14" y2="14"/><line x1="10" x2="14" y1="8" y2="8"/><line x1="18" x2="22" y1="16" y2="16"/></svg>',
        layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>',
        package: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/></svg>',
        settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>'
    };

    let activePage = null;
    let initialized = false;

    function pageFromHash(hash) {
        const clean = (hash || '').replace(/^#\/?/, '').replace(/\/$/, '');
        const found = PAGES.find(p => p.id === clean);
        return found ? found.id : null;
    }

    function pageToHash(id) {
        const page = PAGES.find(p => p.id === id);
        return page ? HASH_PREFIX + page.hash.slice(1) : HASH_PREFIX + DEFAULT_PAGE;
    }

    function getPageEl(id) {
        return document.querySelector(`.app-page[data-page="${id}"]`);
    }

    function showPage(id, options) {
        const opts = options || {};
        const target = PAGES.find(p => p.id === id) ? id : DEFAULT_PAGE;

        // Hide all pages, show the target
        document.querySelectorAll('.app-page').forEach(el => {
            if (el.dataset.page === target) {
                el.hidden = false;
                // Within the app shell, top-level sections stay expanded — the
                // legacy collapse pattern was built for a single scrolling page,
                // not app navigation. Cards inside still collapse individually.
                el.querySelectorAll(':scope > section.section-block.collapsed').forEach(sec => {
                    sec.classList.remove('collapsed');
                });
            } else {
                el.hidden = true;
            }
        });

        // Update active states in sidebar + bottom nav
        document.querySelectorAll('[data-nav]').forEach(el => {
            const isActive = el.dataset.nav === target;
            el.classList.toggle('active', isActive);
            if (isActive) {
                el.setAttribute('aria-current', 'page');
            } else {
                el.removeAttribute('aria-current');
            }
        });

        activePage = target;

        // Update hash without adding duplicate history entries
        const desiredHash = pageToHash(target);
        if (window.location.hash !== desiredHash) {
            if (opts.replace) {
                history.replaceState(null, '', desiredHash);
            } else {
                history.pushState(null, '', desiredHash);
            }
        }

        // Scroll to top of content for a fresh page feel (unless suppressed)
        if (!opts.keepScroll) {
            const main = document.querySelector('.app-main');
            if (main) main.scrollTop = 0;
            window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
        }

        // Notify other modules (config.js may want to react)
        try {
            document.dispatchEvent(new CustomEvent('app:navigate', { detail: { page: target } }));
        } catch (_) { /* CustomEvent unsupported — ignore */ }
    }

    function navigate(id, options) {
        showPage(id, options);
    }

    // Scroll to (and expand) a specific section/card inside the Configuration page.
    // Used by sidebar sub-items so users land exactly where they clicked.
    function navigateToAnchor(anchorKey) {
        // Ensure the Configuration page is active first
        if (activePage !== 'configuration') {
            showPage('configuration', { keepScroll: true });
        }

        const targetId = CONFIG_ANCHORS[anchorKey];
        if (!targetId) return;

        // Small delay so the page becomes visible before we measure/scroll
        setTimeout(() => {
            const el = document.getElementById(targetId);
            if (!el) return;

            // Expand the target card/section if it's collapsed
            const card = el.closest('.card, .section-block') || el;
            card.classList.remove('collapsed');
            const collapseBtn = card.querySelector('.collapse-btn');
            if (collapseBtn) collapseBtn.classList.remove('collapsed');

            // Also expand the parent section if needed
            const parentSection = el.closest('section.section-block');
            if (parentSection) {
                parentSection.classList.remove('collapsed');
                parentSection.querySelectorAll('.section-collapse-btn, [data-collapse-section]').forEach(btn => btn.classList.remove('collapsed'));
            }

            el.scrollIntoView({ behavior: 'smooth', block: 'start' });

            // Focus the first input inside for keyboard users (nice touch)
            const focusable = el.querySelector('input, select, textarea, button:not(.collapse-btn)');
            if (focusable) {
                setTimeout(() => { try { focusable.focus({ preventScroll: true }); } catch (_) { focusable.focus(); } }, 320);
            }
        }, 60);
    }

    function handleHashChange() {
        const id = pageFromHash(window.location.hash);
        if (id && id !== activePage) {
            showPage(id, { replace: false, keepScroll: false });
        } else if (!id) {
            showPage(DEFAULT_PAGE, { replace: true, keepScroll: false });
        }
    }

    function init() {
        if (initialized) return;
        initialized = true;

        // Icons now live directly in the markup (configure.html) so they render
        // even without JS. We only bind behaviour here.

        // Bind nav clicks (sidebar pills + bottom nav)
        document.querySelectorAll('[data-nav]').forEach(el => {
            el.addEventListener('click', function (e) {
                e.preventDefault();
                navigate(this.dataset.nav);
            });
        });

        // Bind sidebar sub-item anchors (Configuration children)
        document.querySelectorAll('[data-anchor]').forEach(el => {
            el.addEventListener('click', function (e) {
                e.preventDefault();
                navigateToAnchor(this.dataset.anchor);
            });
        });

        // Configuration parent: expand/collapse its children AND navigate.
        const configParent = document.querySelector('[data-parent="configuration"]');
        if (configParent) {
            const parentWrap = configParent.closest('.app-nav-parent');
            configParent.addEventListener('click', function (e) {
                e.preventDefault();
                if (parentWrap) parentWrap.classList.toggle('expanded');
                navigate('configuration');
            });
        }

        // Persist the Configuration group's expanded state across sessions.
        try {
            const wrap = document.querySelector('[data-children="configuration"]')?.closest('.app-nav-parent');
            if (wrap) {
                const saved = localStorage.getItem('subfaber-nav-config-expanded');
                if (saved === '1') wrap.classList.add('expanded');
                wrap.addEventListener('click', () => {
                    try { localStorage.setItem('subfaber-nav-config-expanded', wrap.classList.contains('expanded') ? '1' : '0'); } catch (_) {}
                }, true);
            }
        } catch (_) { /* localStorage unavailable */ }

        // Bind hash changes (back/forward)
        window.addEventListener('hashchange', handleHashChange);

        // Initial route — mandatory fallback: empty/invalid hash → default page
        const initial = pageFromHash(window.location.hash);
        if (initial) {
            showPage(initial, { replace: true, keepScroll: true });
        } else {
            showPage(DEFAULT_PAGE, { replace: true, keepScroll: true });
        }
    }

    // Expose a tiny API for quick-setup.js and friends
    window.__appNavigate = navigate;
    window.__appNavigateToAnchor = navigateToAnchor;
    window.__appCurrentPage = () => activePage;
    window.__appPages = PAGES.map(p => p.id);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
