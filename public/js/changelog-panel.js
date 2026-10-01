/* ═══════════════════════════════════════════════════════════
   SubFaber — Changelog slide-out panel
   ───────────────────────────────────────────────────────────
   Makes the version badge clickable. Fetches /api/changelog
   (already served by the backend with a 5-min cache) and
   renders a scrollable history panel that slides in from
   the right. Pure frontend — no backend changes required.
   ═══════════════════════════════════════════════════════════ */

(function () {
    'use strict';

    let overlay = null;
    let panel = null;
    let body = null;
    let loaded = false;
    let loading = false;
    let escListener = null;

    function el(tag, cls, text) {
        const node = document.createElement(tag);
        if (cls) node.className = cls;
        if (text != null) node.textContent = text;
        return node;
    }

    // Minimal, safe markdown-ish renderer for changelog content.
    // Handles: **bold**, `code`, - bullets, 1. numbered, ### headings, line breaks.
    function renderContent(target, raw) {
        target.textContent = ''; // clear
        const lines = String(raw || '').split(/\r?\n/);
        let list = null;

        function inline(text, parent) {
            // Escape everything first by building nodes manually
            const parts = [];
            let rest = text;
            const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
            let m;
            let last = 0;
            while ((m = pattern.exec(rest)) !== null) {
                if (m.index > last) parts.push(document.createTextNode(rest.slice(last, m.index)));
                const token = m[0];
                if (token.startsWith('**')) {
                    const strong = el('strong', null, token.slice(2, -2));
                    parts.push(strong);
                } else if (token.startsWith('`')) {
                    const code = el('code', null, token.slice(1, -1));
                    parts.push(code);
                }
                last = m.index + token.length;
            }
            if (last < rest.length) parts.push(document.createTextNode(rest.slice(last)));
            parts.forEach(p => parent.appendChild(p));
        }

        lines.forEach(line => {
            const trimmed = line.trim();
            if (!trimmed) {
                if (list) { target.appendChild(list); list = null; }
                return;
            }

            // Heading ### or ##
            if (/^#{1,4}\s+/.test(trimmed)) {
                if (list) { target.appendChild(list); list = null; }
                const h = el('div', null, trimmed.replace(/^#{1,4}\s+/, ''));
                h.style.fontWeight = '700';
                h.style.color = 'var(--text-primary)';
                h.style.margin = '6px 0 4px';
                target.appendChild(h);
                return;
            }

            // Bullet - or *
            const bullet = trimmed.match(/^[-*]\s+(.+)$/);
            if (bullet) {
                if (!list || list.tagName !== 'UL') {
                    if (list) target.appendChild(list);
                    list = el('ul');
                }
                const li = el('li');
                inline(bullet[1], li);
                list.appendChild(li);
                return;
            }

            // Numbered 1. or 1)
            const numbered = trimmed.match(/^\d+[.)]\s+(.+)$/);
            if (numbered) {
                if (!list || list.tagName !== 'OL') {
                    if (list) target.appendChild(list);
                    list = el('ol');
                }
                const li = el('li');
                inline(numbered[1], li);
                list.appendChild(li);
                return;
            }

            // Plain paragraph
            if (list) { target.appendChild(list); list = null; }
            const p = el('p');
            p.style.margin = '4px 0';
            inline(trimmed, p);
            target.appendChild(p);
        });

        if (list) target.appendChild(list);
    }

    function renderEntries(entries, currentVersion) {
        body.textContent = '';

        if (!entries || !entries.length) {
            const empty = el('div', 'app-changelog-entry');
            empty.textContent = 'No changelog entries available.';
            body.appendChild(empty);
            return;
        }

        entries.forEach((entry, idx) => {
            const card = el('div', 'app-changelog-entry');

            const header = el('div', 'app-changelog-entry-header');
            const badge = el('span', 'app-changelog-version-badge' + (idx === 0 && entry.version === currentVersion ? ' is-current' : ''));
            badge.textContent = 'v' + entry.version;
            header.appendChild(badge);

            if (idx === 0) {
                const latest = el('span', null, 'Latest');
                latest.style.cssText = 'font-size:11px;font-weight:600;color:var(--text-tertiary);';
                header.appendChild(latest);
            }

            card.appendChild(header);

            const content = el('div', 'app-changelog-entry-content');
            renderContent(content, entry.content);
            card.appendChild(content);

            body.appendChild(card);
        });
    }

    function loadChangelog() {
        if (loaded || loading) return;
        loading = true;

        body.textContent = '';
        const spinner = el('div', 'app-changelog-entry', 'Loading changelog…');
        spinner.style.textAlign = 'center';
        spinner.style.color = 'var(--text-tertiary)';
        body.appendChild(spinner);

        fetch('/api/changelog', { cache: 'no-store' })
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                loaded = true;
                loading = false;
                if (data && Array.isArray(data.entries)) {
                    renderEntries(data.entries, data.currentVersion);
                } else {
                    renderEntries([], null);
                }
            })
            .catch(() => {
                loading = false;
                body.textContent = '';
                const err = el('div', 'app-changelog-entry', 'Failed to load changelog. Check your connection and try again.');
                err.style.color = 'var(--danger, #dc2626)';
                body.appendChild(err);
            });
    }

    function buildPanel() {
        // Overlay
        overlay = el('div', 'app-changelog-overlay');
        overlay.addEventListener('click', close);

        // Panel
        panel = el('div', 'app-changelog-panel');
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', 'Changelog');
        panel.setAttribute('aria-modal', 'true');

        // Header
        const header = el('div', 'app-changelog-header');
        const icon = el('div', 'app-changelog-header-icon');
        icon.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l2 2"/><circle cx="12" cy="12" r="9"/></svg>';

        const headerText = el('div', 'app-changelog-header-text');
        const title = el('h3', 'app-changelog-title');
        title.setAttribute('data-i18n', 'changelog.title');
        title.textContent = 'Changelog';
        const subtitle = el('p', 'app-changelog-subtitle');
        subtitle.setAttribute('data-i18n', 'changelog.subtitle');
        subtitle.textContent = 'What changed in SubFaber recently';
        headerText.appendChild(title);
        headerText.appendChild(subtitle);

        const closeBtn = el('button', 'app-changelog-close');
        closeBtn.setAttribute('aria-label', 'Close changelog');
        closeBtn.setAttribute('data-i18n-attr', 'aria-label');
        closeBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
        closeBtn.addEventListener('click', close);

        header.appendChild(icon);
        header.appendChild(headerText);
        header.appendChild(closeBtn);

        // Body
        body = el('div', 'app-changelog-body');

        // Footer
        const footer = el('div', 'app-changelog-footer');
        const ghLink = el('a', 'app-changelog-footer-link', 'View full changelog on GitHub');
        ghLink.href = 'https://github.com/xtremexq/StremioSubMaker/blob/main/CHANGELOG.md';
        ghLink.target = '_blank';
        ghLink.rel = 'noopener noreferrer';
        ghLink.setAttribute('data-i18n', 'changelog.viewFull');
        ghLink.innerHTML = 'View full changelog on GitHub <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>';
        footer.appendChild(ghLink);

        panel.appendChild(header);
        panel.appendChild(body);
        panel.appendChild(footer);

        document.body.appendChild(overlay);
        document.body.appendChild(panel);
    }

    function open() {
        if (!panel) buildPanel();
        overlay.classList.add('open');
        panel.classList.add('open');
        document.body.style.overflow = 'hidden';

        if (!loaded) loadChangelog();

        escListener = function (e) { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', escListener);
    }

    function close() {
        if (!panel) return;
        overlay.classList.remove('open');
        panel.classList.remove('open');
        document.body.style.overflow = '';
        if (escListener) {
            document.removeEventListener('keydown', escListener);
            escListener = null;
        }
    }

    function init() {
        // Convert the version badge into a button
        const badge = document.getElementById('version-badge');
        if (!badge) return;

        const button = el('button', 'version-badge-button');
        button.type = 'button';
        button.setAttribute('aria-label', 'Open changelog');
        button.setAttribute('data-i18n-attr', 'aria-label');
        button.id = 'version-badge-button';

        // Move the badge span inside the button
        badge.parentNode.insertBefore(button, badge);
        button.appendChild(badge);
        badge.style.display = 'inline-flex';

        button.addEventListener('click', open);

        // Also expose globally in case other modules want to open it
        window.__openChangelog = open;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
