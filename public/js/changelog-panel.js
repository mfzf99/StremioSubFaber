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

    // Escape everything first by building nodes manually — shared by
    // renderContent() and the Fasa 3 category-group renderer.
    function inline(text, parent) {
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
        parts.forEach((p) => parent.appendChild(p));
    }

    // Minimal, safe markdown-ish renderer for changelog content.
    // Handles: **bold**, `code`, - bullets, 1. numbered, ### headings, line breaks.
    function renderContent(target, raw) {
        target.textContent = ''; // clear
        const lines = String(raw || '').split(/\r?\n/);
        let list = null;

        lines.forEach((line) => {
            const trimmed = line.trim();
            if (!trimmed) {
                if (list) {
                    target.appendChild(list);
                    list = null;
                }
                return;
            }

            // Heading ### or ##
            if (/^#{1,4}\s+/.test(trimmed)) {
                if (list) {
                    target.appendChild(list);
                    list = null;
                }
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
            if (list) {
                target.appendChild(list);
                list = null;
            }
            const p = el('p');
            p.style.margin = '4px 0';
            inline(trimmed, p);
            target.appendChild(p);
        });

        if (list) target.appendChild(list);
    }

    /* ── [FASA 3 — SubMaker Pattern] helpers ────────────────────────────── */
    function escapeRegex(s) {
        return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    // Ordered display: emoji + label + accent color class.
    // Unrecognised groups fall through to 'other'.
    const CATEGORY_ORDER = [
        { key: 'new', match: /^🆕/, label: 'New Features' },
        { key: 'perf', match: /^🚀/, label: 'Performance' },
        { key: 'improve', match: /^⚡/, label: 'Improvements' },
        { key: 'bugs', match: /^🐛/, label: 'Bug Fixes' },
        { key: 'security', match: /^📌/, label: 'Security' },
        { key: 'breaking', match: /^🔄/, label: 'Breaking Changes' },
        { key: 'removed', match: /^🗑️?/, label: 'Removed' }
    ];

    function getCategoryMeta(headingText) {
        if (!headingText) return null;
        const text = String(headingText).trim();
        for (const cat of CATEGORY_ORDER) {
            if (cat.match.test(text)) return cat;
        }
        return null;
    }

    // Render a single bullet group (one category) with the SubMaker-style
    // category header. Mutates out and leaves `list` handled internally.
    function renderCategoryGroup(out, catKey, lines) {
        const meta = CATEGORY_ORDER.find((c) => c.key === catKey);
        if (!meta || !lines.length) return;
        const catHeader = el('div', 'app-changelog-category', meta.label);
        catHeader.classList.add(`cat-${catKey}`);
        out.appendChild(catHeader);
        const list = el('ul', 'app-changelog-category-list');
        lines.forEach((line) => {
            const li = el('li');
            inline(line, li);
            list.appendChild(li);
        });
        out.appendChild(list);
    }

    // Parses raw entry content into groups keyed by category.
    function groupContentByCategory(raw) {
        const groups = {};
        let activeKey = null;
        let activeLines = [];
        const pushActive = () => {
            if (activeKey && activeLines.length) {
                if (!groups[activeKey]) groups[activeKey] = [];
                groups[activeKey].push(...activeLines);
            }
            activeKey = null;
            activeLines = [];
        };
        String(raw || '')
            .split(/\r?\n/)
            .forEach((line) => {
                const trimmed = line.trim();
                if (!trimmed) return;
                const headingMatch = trimmed.match(/^#{1,4}\s+(.+)$/);
                if (headingMatch) {
                    pushActive();
                    const meta = getCategoryMeta(headingMatch[1]);
                    activeKey = meta ? meta.key : null;
                    return;
                }
                const bullet = trimmed.match(/^[-*]\s+(.+)$/);
                if (bullet) {
                    if (activeKey) activeLines.push(bullet[1]);
                    else {
                        // Untitled bullets under no category
                        if (!groups.other) groups.other = [];
                        groups.other.push(bullet[1]);
                    }
                    return;
                }
                // Non-bullet content (e.g. plain paragraphs) — render as 'other'
                if (!groups.other) groups.other = [];
                groups.other.push(trimmed);
            });
        pushActive();
        return groups;
    }

    // Renders grouped categories in CATEGORY_ORDER, then 'other'.
    function renderGroupedContent(target, raw) {
        target.textContent = '';
        const groups = groupContentByCategory(raw);
        CATEGORY_ORDER.forEach((cat) => {
            if (groups[cat.key] && groups[cat.key].length) {
                renderCategoryGroup(target, cat.key, groups[cat.key]);
            }
        });
        if (groups.other && groups.other.length) {
            renderContent(target, groups.other.join('\n'));
        }
    }

    function buildGithubLink(version) {
        const a = el('a', 'app-changelog-github-link', 'View full release on GitHub');
        a.href = `https://github.com/xtremexq/StremioSubFaber/releases/tag/v${version}`;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '11');
        svg.setAttribute('height', '11');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.innerHTML = '<path d="M7 17 17 7M8 7h9v9"/>';
        a.appendChild(svg);
        return a;
    }

    function makeEntryAccordion(version, isLatest, rawContent, card) {
        const header = el('button', 'app-changelog-entry-header');
        header.type = 'button';
        header.setAttribute('aria-expanded', isLatest ? 'true' : 'false');
        header.setAttribute('aria-controls', `changelog-entry-content-${version}`);

        const badge = el('span', 'app-changelog-version-badge');
        badge.textContent = 'v' + version;
        if (isLatest) badge.classList.add('is-current');

        const latestPill = isLatest ? el('span', 'app-changelog-latest-pill', 'Latest') : null;

        const chevron = el('span', 'app-changelog-entry-chevron');
        chevron.innerHTML =
            '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';

        header.appendChild(badge);
        if (latestPill) header.appendChild(latestPill);
        header.appendChild(chevron);

        const content = el('div', 'app-changelog-entry-content');
        content.id = `changelog-entry-content-${version}`;
        renderGroupedContent(content, rawContent);
        if (!isLatest) content.hidden = true;

        const ghLink = buildGithubLink(version);

        header.addEventListener('click', () => {
            const willOpen = content.hidden;
            content.hidden = !willOpen;
            header.setAttribute('aria-expanded', String(willOpen));
            card.classList.toggle('expanded', willOpen);
        });

        card.appendChild(header);
        card.appendChild(content);
        if (ghLink) card.appendChild(ghLink);
        if (isLatest) card.classList.add('expanded');
    }

    /* ── /FASA 3 ─────────────────────────────────────────────────────────── */

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
            const isLatest = idx === 0 && entry.version === currentVersion;
            makeEntryAccordion(entry.version, isLatest, entry.content, card);
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
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
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
                const errEl = el(
                    'div',
                    'app-changelog-entry',
                    'Failed to load changelog. Check your connection and try again.'
                );
                errEl.style.color = 'var(--danger, #dc2626)';
                body.appendChild(errEl);
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
        icon.innerHTML =
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4l2 2"/><circle cx="12" cy="12" r="9"/></svg>';

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
        closeBtn.innerHTML =
            '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
        closeBtn.addEventListener('click', close);

        header.appendChild(icon);
        header.appendChild(headerText);
        header.appendChild(closeBtn);

        // Body
        body = el('div', 'app-changelog-body');

        // Footer
        const footer = el('div', 'app-changelog-footer');
        const ghLink = el('a', 'app-changelog-footer-link', 'View full changelog on GitHub');
        ghLink.href = 'https://github.com/xtremexq/StremioSubFaber/blob/main/CHANGELOG.md';
        ghLink.target = '_blank';
        ghLink.rel = 'noopener noreferrer';
        ghLink.setAttribute('data-i18n', 'changelog.viewFull');
        ghLink.innerHTML =
            'View full changelog on GitHub <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>';
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

        escListener = function (e) {
            if (e.key === 'Escape') close();
        };
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
