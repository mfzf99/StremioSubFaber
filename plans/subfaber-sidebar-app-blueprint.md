# SubFaber Sidebar App Navigation — Blueprint (True App Navigation ala Rootsys Dashboard)

**Tarikh:** 2026-10-01
**Status:** ✅ SIAP — diimplementasikan dan lulus (287/287 tests PASS, visual verify lulus AI review)
**Matlamat:** Tukar Configure page dari single-column centered (expand ke bawah) kepada **sidebar app layout** macam `rootsys.cloud/buyer/dashboard` — sidebar 240px kiri + content kanan, flat `#F7F8FB`, satu "page" pada satu masa.
**Prinsip pegangan:** config.js (11.5k baris) mencari elemen ikut **ID** (220 getElementById), BUKAN ikut struktur section. Jadi selagi semua ID kekal dalam DOM, JS tak pecah walaupun layout berubah.

> **Nota pelaksanaan:** Rancangan asal 6-7 pages dipermudahkan kepada **5 pages** atas sebab keselamatan — `#settingsSection` dikekalkan UTUH (tidak dipecahkan kepada Translation/Providers/System berasingan) supaya collapse mechanism `subfaber_collapsed_sections` dan `data-collapse-section` dalam config.js kekal sah. Pages final: **Overview, API Keys, Languages, Settings, Sub Toolbox**.

---

## 0. TIGA PERKARA WAJIB (input semakan luar — kritikal)

Sebelum sebarang kerja, tiga perkara ini **mesti** diambil kira; mengabaikannya akan pecahkan UX atau borang:

1. **`novalidate` pada `<form>` (KRITIKAL):** Jika mana-mana input dalam page yang `display:none` mempunyai atribut HTML5 `required`/`pattern`, browser akan sekat submit dengan ralat senyap `An invalid form control ... is not focusable`. Tag `<form id="configForm">` MESTI ada `novalidate` (sudah ada dalam main.html — **mesti kekal selepas restructure**); semua validasi kekal dikendalikan oleh `config.js`.
2. **Butang tindakan utama (Save/Install/Copy) sentiasa nampak:** Jangan sembunyikan dalam mana-mana page tersembunyi. Letak **sticky action bar** — desktop: sticky di bahagian bawah content; mobile: terapung di atas bottom nav. Pengguna tidak perlu menukar tab semata-mata untuk save.
3. **Logik fallback URL hash:** Router mesti baca `window.location.hash` pada `DOMContentLoaded`; jika hash kosong/tidak sah, auto-set ke `#/overview` (bukan tunjuk page kosong atau semua pages bertindih).

---

## 1. KONTRAK JS YANG MESTI DIJAGA (ground truth dari scan)

| Aspek | Mekanisma sedia ada | Kontrak yang mesti kekal |
|---|---|---|
| Carian elemen | `getElementById(...)` — 220 ids | Semua ID mesti wujud dalam DOM pada load (walaupun hidden) |
| Collapse sections | `section.classList.toggle('collapsed')` + `data-collapse-section` + state `subfaber_collapsed_sections` | Kelas `section-block collapsed` + attr `data-collapse-section` mesti kekal pada sections |
| Visibility | `el.style.display = 'none'/''` | Pages yang tidak aktif diguna `display:none`, bukan buang dari DOM |
| Theme | 3-mode `data-theme` (light/system/dark) | Kekalkan — lebih baik dari Rootsys 2-mode |
| i18n | `data-i18n`, `data-i18n-attr` | Setiap teks baru mesti ada key atau fallback |
| Partial tokens | `__CONFIGURE_MAIN_PARTIAL__` dll | Jangan rename |
| Form | `<form id="configForm">` | Routing mesti berlaku DALAM form, bukan pecahkan form kepada banyak form |

**Risiko tertinggi:** Jika sesuatu page di-`display:none` dan JS cuba `focus()` atau `scrollIntoView()` pada elemen dalam page tu, browser akan silently gagal — ini OK, bukan error. Tapi kalau JS cuba baca `offsetWidth`/`getBoundingClientRect` untuk measurement, ia akan dapat 0 — perlu audit kalau ada measurement code. (Setakat scan, tiada measurement kritikal pada load.)

---

## 2. MODEL NAVIGASI YANG DIPILIH

**"Virtual pages" dalam satu DOM** — semua kandungan kekal dalam SATU `<form id="configForm">` dan SATU DOM, tapi dipecahkan kepada 6 "pages" yang di-display satu-pada-satu-masa. Routing dikawal oleh satu modul JS kecil baru (`panel-nav.js` diperluaskan) yang:

1. Baca hash URL (`#/api-keys`, `#/languages`, `#/translation`, `#/providers`, `#/toolbox`, `#/system`)
2. Set `display:block` pada page yang sepadan, `display:none` pada yang lain
3. Update active state pada sidebar pill (violet `bg-[#EDE7FE] text-[#7C3AED]`)
4. Kekalkan hash dalam history (back/forward button berfungsi)

**Kelebihan model ini:** Tiada pecahan form, tiada perubahan kepada kontrak JS sedia ada, dan pages yang tidak aktif hanya `display:none` (JS boleh masih baca/tulis nilai input dalam page tersembunyi — penting untuk save/load config).

### Pecahan pages (mapping dari markup sedia ada)

| Page ID (hash) | Label sidebar (i18n) | Sumber markup sedia ada | Group |
|---|---|---|---|
| `#/overview` | Overview | Quick Setup banner + No Translation toggle + Install URL + actions (Save/Install/Copy) | ACCOUNT |
| `#/api-keys` | API Keys | `#apiKeysSection` (Token Vault + Subtitle API providers + Other API keys) | ACCOUNT |
| `#/languages` | Languages | `#languagesSection` (source/target/learn languages) | ACCOUNT |
| `#/translation` | Translation | Translation settings + Gemini advanced + provider advanced cards | ACCOUNT |
| `#/providers` | Providers | Multi-providers + secondary provider config | EXPLORE |
| `#/toolbox` | Sub Toolbox | Sub Toolbox launcher + embedded settings + season packs + ASS conversion | EXPLORE |
| `#/system` | System | Dev mode + database mode + extended languages + reset | HELP |

**Nota:** Ini hanya *mapping visual* — markup asal TIDAK dipindahkan antara sections sebenar; sebaliknya aku akan balut kumpulan elemen sedia ada dalam `div.app-page` containers. Cards yang berada dalam `apiKeysSection`/`languagesSection`/`settingsSection` kekal di tempatnya; pages lain dibungkus mengikut kedudukan semula jadi mereka dalam DOM.

**Lebih selamat:** Kekalkan 3 `<section>` asal sebagai pages teras (API Keys, Languages, Settings) dan tambah pages baru hanya dengan *membungkus* kandungan sedia ada tanpa memindahkan ID. Cards "translation settings" yang sekarang berada dalam `settingsSection` kekal di situ; page "Translation" hanya menunjukkan `settingsSection` manakala page "Providers" menunjukkan subset lain. **Keputusan final: pages adalah *tambahan wrapper*, bukan *pecahan semula* struktur.**

---

## 3. STRUKTUR DOM SASARAN

```html
<body class="app-shell">
  <div class="app-desktop">              <!-- flat #F7F8FB penuh skrin (bukan macOS window lagi) -->
    <aside class="app-sidebar">          <!-- 240px, fixed kiri, bg putih, border-r #ECEFF4 -->
      <div class="app-sidebar-brand">    <!-- traffic dots + logo + "SubFaber" -->
        <span class="rootify-traffic">…</span>
        <img class="app-navbar-logo" src="/logo.png" alt="SubFaber logo">
        <span class="app-sidebar-name" data-i18n="config.heroTitle">SubFaber</span>
      </div>
      <nav class="app-sidebar-nav">
        <div class="app-nav-group">
          <div class="app-nav-label" data-i18n="nav.groupAccount">Account</div>
          <a class="app-nav-pill" href="#/overview"   data-nav="overview"   data-i18n="nav.overview">Overview</a>
          <a class="app-nav-pill" href="#/api-keys"   data-nav="api-keys"   data-i18n="nav.apiKeys">API Keys</a>
          <a class="app-nav-pill" href="#/languages"  data-nav="languages"  data-i18n="nav.languages">Languages</a>
          <a class="app-nav-pill" href="#/translation" data-nav="translation" data-i18n="nav.translation">Translation</a>
        </div>
        <div class="app-nav-group">
          <div class="app-nav-label" data-i18n="nav.groupExplore">Explore</div>
          <a class="app-nav-pill" href="#/providers"  data-nav="providers"  data-i18n="nav.providers">Providers</a>
          <a class="app-nav-pill" href="#/toolbox"    data-nav="toolbox"    data-i18n="nav.toolbox">Sub Toolbox</a>
        </div>
        <div class="app-nav-group">
          <div class="app-nav-label" data-i18n="nav.groupHelp">Help</div>
          <a class="app-nav-pill" href="#/system"     data-nav="system"     data-i18n="nav.system">System</a>
          <a class="app-nav-pill app-nav-docs" href="https://github.com/xtremexq/StremioSubMaker#readme" target="_blank" rel="noopener noreferrer" data-i18n="config.support.link">Docs</a>
        </div>
      </nav>
      <div class="app-sidebar-footer">
        <!-- Language flags + theme switch (dipindahkan dari navbar ke sini) -->
        <div class="ui-language-dock" id="uiLanguageDock">…</div>
        <div class="theme-switch" id="themeToggle">…</div>
      </div>
    </aside>

    <div class="app-main">               <!-- lg:pl-60, flat #F7F8FB -->
      <header class="app-mobile-header"> <!-- mobile sahaja: dots + logo + theme -->
        …
      </header>
      <main class="app-content">
        <form id="configForm" novalidate>  <!-- SATU form sahaja; novalidate WAJIB -->
          <div class="app-page" data-page="overview">…Quick Setup + No Translation…</div>
          <div class="app-page" data-page="api-keys">…#apiKeysSection…</div>
          <div class="app-page" data-page="languages">…#languagesSection…</div>
          <div class="app-page" data-page="translation">…translation settings cards…</div>
          <div class="app-page" data-page="providers">…providers config…</div>
          <div class="app-page" data-page="toolbox">…toolbox settings…</div>
          <div class="app-page" data-page="system">…dev/system/reset…</div>

          <!-- Sticky action bar — Save/Install/Copy sentiasa nampak (perkara wajib #2) -->
          <div class="app-action-bar">
            <button type="submit" class="btn btn-primary" id="saveBtn">Save Configuration</button>
            <button type="button" class="btn btn-secondary" id="installBtn">Install in Stremio</button>
            <button type="button" class="btn btn-secondary" id="copyBtn">Copy Install URL</button>
          </div>
        </form>
      </main>
    </div>

    <nav class="app-bottom-nav">          <!-- mobile sahaja, fixed bottom, 5 item -->
      <a href="#/overview" data-nav="overview">…</a>
      <a href="#/api-keys" data-nav="api-keys">…</a>
      <a href="#/languages" data-nav="languages">…</a>
      <a href="#/translation" data-nav="translation">…</a>
      <a href="#/toolbox" data-nav="toolbox">…</a>
    </nav>
  </div>
</body>
```

**Kekalkan:** `header.app-navbar` lama akan dibuang dan digantikan dengan sidebar — TAPI semua elemen dalamnya (language dock, theme switch, docs link) dipindahkan ke sidebar/footer dengan ID yang SAMA supaya `theme-toggle.js` dan i18n JS masih berfungsi.

---

## 4. ROUTING MODULE (`public/js/panel-nav.js` — diperluaskan)

Modul sedia ada `panel-nav.js` (389 baris) akan digantikan dengan router ringkas:

```js
// Kontrak:
//  - Pada DOMContentLoaded: baca location.hash; jika kosong/tidak sah, set ke #/overview (perkara wajib #3)
//  - Pilih page sepadan, display yang lain none
//  - Active pill: bg-[#EDE7FE] text-[#7C3AED] (light) / bg-[#7C3AED]/20 text-[#A78BFA] (dark)
//  - Default page: #/overview
//  - Kemas kini hash tanpa reload (history.pushState) — back/forward OK
//  - Expose window.__appNavigate(pageId) untuk quick-setup dan lain-lain
```

**Integrasi dengan sedia ada:**
- `quick-setup.js` akan panggil `__appNavigate('api-keys')` selepas wizard selesai supaya user mendarat di page API keys
- `config.js` save flow kekal — dia baca nilai dari semua input walaupun hidden
- Reset flow kekal

---

## 5. CSS BARU (`public/css/app-shell.css` — BARU)

Aku akan kekalkan `rootify.css` (untuk tokens + komponen) dan tambah `app-shell.css` untuk layout:

- `.app-desktop` — flat `var(--bg-primary)` `#F7F8FB` (bukan wallpaper lagi — buang macOS window frame)
- `.app-sidebar` — fixed, 240px, bg `var(--surface)` putih, border-r `var(--border)`, full height
- `.app-nav-pill` — `min-h-40px rounded-xl px-3.5 text-sm font-medium text-secondary hover:bg-gray-50`, active `bg-[var(--accent-soft)] text-[var(--primary)] font-semibold`
- `.app-main` — `lg:pl-60`, min-height 100vh
- `.app-content` — `max-w-5xl mx-auto p-6 sm:p-8 pb-28` (ruang bottom nav mobile)
- `.app-page[hidden]` — `display:none` (routing)
- `.app-bottom-nav` — fixed bottom, 5 item, `lg:hidden`, border-t, safe-area inset
- `.app-mobile-header` — `lg:hidden` sticky top, dots + logo + theme

**Kekalkan dark mode** — semua warna guna `var(--…)` yang sudah ada dalam `rootify.css`.

---

## 6. PERUBAHAN MARKUP (main.html — minimum, berhati-hati)

1. **Tambah wrapper** `div.app-page` di sekeliling kumpulan elemen sedia ada (bukan pindahkan ID).
2. **Kekalkan 3 `<section>` asal** dengan class + attrs collapse.
3. **Pindahkan** language dock + theme switch + docs link dari navbar lama ke sidebar/footer (dengan ID sama).
4. **Buang** `header.app-navbar` (diganti sidebar). Kekalkan semua JS hooks yang berpindah.
5. **Buang** `rootify-titlebar` + macOS window frame (ganti flat app).

---

## 7. RESPONSIVE (macam Rootsys dashboard)

- **Desktop (lg+):** Sidebar visible, content `pl-60`
- **Mobile (<lg):** Sidebar hidden; mobile header sticky (dots + logo + theme toggle); bottom nav fixed 5 item dengan icon+label; content `pb-28` untuk ruang bottom nav

---

## 8. RISIKO & MITIGASI

| Risiko | Mitigasi |
|---|---|
| config.js pecah kerana ID hilang | Scan semula selepas setiap perubahan markup — semua 220 ID mesti masih ada dalam DOM final |
| Pages hidden `display:none` menyebabkan JS measurement salah | Tiada measurement kritikal pada load dalam config.js; quick-setup hanya target `geminiModel` (boleh navigate dulu) |
| Theme switch / language dock tak berfungsi selepas pindah | Kekalkan ID sama (`themeToggle`, `uiLanguageDock`, `uiLanguageFlags`) — JS cari ikut ID, bukan lokasi |
| Quick Setup wizard tak tahu page mana | Expose `__appNavigate(pageId)`; quick-setup panggil untuk mendarat di page yang betul |
| Hash routing pecah dalam Stremio webview | Fallback ke page overview jika hash invalid; routing tidak bergantung pada server |
| Regression tests gagal | Jalankan `npm test` selepas setiap fasa; rollback fasa jika gagal |
| i18n keys baru (nav.*) tiada dalam locales | Tambah keys dalam `locales/en.json` + fallback dalam JS; bahasa lain fallback ke en |

---

## 9. PELAKSANAAN BERFASA (slow & steady)

- **FASA 2:** Bina skeleton — sidebar + content shell + routing module + app-shell.css, TANPA memindahkan markup sebenar. Render dan verify layout secara visual. `npm test`.
- **FASA 3:** Pindahkan markup ke dalam pages, wire routing, verify semua ID masih ada, verify config.js save/load berfungsi. `npm test`.
- **FASA 4:** Responsive + dark mode polish + bottom nav mobile. Visual check.
- **FASA 5:** Full regression + dokumentasi + CHANGELOG.

Setiap fasa mesti lulus `npm test` (287 PASS / 0 FAIL) sebelum terus ke fasa seterusnya. Rollback menggunakan `plans/redesign-backup/` jika perlu.

---

## 10. REKOD PELAKSANAAN (apa yang sebenar dibuat)

**Fail baru:**
- `public/css/app-shell.css` — layout sidebar (240px), flat canvas `#F7F8FB`, cards dual-tone, mobile header + bottom nav, sticky action bar, retire macOS window frame
- `plans/subfaber-sidebar-app-blueprint.md` — dokumen ini

**Fail diubah:**
- `public/configure.html` — ditulis semula: sidebar dengan traffic dots + icons + nav pills, mobile header, action bar (Save/Install/Copy dengan `.btn-group` legacy class), bottom nav; macOS window frame dibuang; semua JS hooks (themeToggle, uiLanguageDock, version-badge) dipindahkan dengan ID sama
- `public/partials/main.html` — dibalut dalam 5 `div.app-page` (overview/api-keys/languages/settings/toolbox); butang Save/Install/Copy dibuang (duplicate dengan action bar); hero "SubFaber" diganti "Overview"; settingsSection kekal UTUH; bogus i18n attrs dibuang
- `public/js/panel-nav.js` — diganti dengan router ringkas: hash routing `#/page`, display:none untuk pages lain, auto-expand sections dalam page aktif, fallback ke `#/overview`, expose `__appNavigate()`; icon injection dibuang (icons sekarang dalam markup)
- `public/js/quick-setup.js` — patched `openMainConfigLanguageCard` untuk navigate ke page Languages dulu sebelum scroll/focus
- `locales/en.json` — blok `nav` baru (groupAccount/groupExplore/groupHelp/overview/apiKeys/languages/settings/toolbox/actionHint)

**Keputusan keselamatan yang diambil:**
1. `settingsSection` TIDAK dipecahkan — kekal sebagai satu page "Settings" dengan semua cards (translation/other/advanced/dev) supaya collapse mechanism config.js sah
2. Butang Save/Install/Copy hanya SATU salinan dalam action bar (dengan `.btn-group` legacy class untuk reset-bar positioning config.js)
3. Pages hidden guna `[hidden]`/`display:none` — semua 220 ID config.js kekal dalam DOM
4. `novalidate` pada form dikekalkan (mandatory #1)
5. Sticky action bar sentiasa nampak (mandatory #2)
6. Hash fallback pada DOMContentLoaded (mandatory #3)

**Ujian:** `npm test` selepas setiap fasa — 287 PASS / 0 FAIL (1 skipped) konsisten merentasi FASA 2, 3, 4.
**Visual verify:** preview self-contained (`.tmp-shell-preview-full.html`) — lulus semakan AI rakan: active pill ungu, icons sidebar, kontras canvas/kad, page header per-page.
