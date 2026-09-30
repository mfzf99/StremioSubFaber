# SubFaber Frontend Deep Scan + Blueprint Redesign (gaya Rootsys)

**Tarikh:** 2026-09-30
**Status:** FASA 1 selesai — peta lengkap sebelum sebarang perubahan kod
**Prinsip pegangan:** Jangan rosakkan JS hooks (id, class, data-*) yang dipakai oleh `config.js`, `combobox.js`, `quick-setup.js`, `theme-toggle.js`, `panel-nav.js`, `subtitle-menu.js`. Perubahan hanya pada presentation (CSS + markup struktur), bukan pada kontrak JS.

---

## 1. PETA "DUA DUNIA" SUBFABER

### Dunia 1 — DEPAN (Configure / Public Pages)

| Komponen | Lokasi | Saiz | Nota |
|---|---|---|---|
| Shell utama | `public/configure.html` | 130 baris | `<header class="app-navbar">` + 4 partial placeholders + script tags |
| Main content | `public/partials/main.html` | 2469 baris | Borang config penuh: API keys, providers, languages, translation settings, Sub Toolbox launcher |
| Quick Setup | `public/partials/quick-setup.html` | 445 baris | Wizard modal langkah-bertahap |
| Overlays | `public/partials/overlays.html` | 191 baris | Instructions modal, loading overlay, keyboard hint |
| Footer | `public/partials/footer.html` | 10 baris | Simple footer |
| CSS utama | `public/css/configure.css` | 8226 baris | Base styles — BESAR, legacy |
| CSS theme | `public/css/subfaber-theme.css` | 1112 baris | "Modern Minimalist" override, dimuat TERAKHIR — dah ada partial redesign (violet #7C3AED!) |
| CSS quick-setup | `public/css/quick-setup.css` | 1852 baris | Wizard styles |
| CSS combobox | `public/css/combobox.css` | 116 baris | Dropdown component |
| CSS mario | `public/themes/mario.css` | 567 baris | Legacy theme (boleh retire/kekal sebagai easter egg) |
| JS utama | `public/config.js` | 11508 baris | Logic borang — JANGAN sentuh |
| JS lain | `public/js/*.js` | ~6000 baris total | init, combobox, quick-setup, panel-nav, subtitle-menu, theme-toggle, dll |

**Routes backend (dunia depan):**
- `GET /configure` → `configurePageGenerator.js` (71 baris — template string assembly: configure.html + swap 4 partial placeholders + inject `__APP_VERSION__`, `__CONFIG_LIMITS__`)

### Dunia 2 — BELAKANG (Sub Toolbox — embedded translation UI dalam Stremio)

| Generator | Fungsi | Saiz | Route |
|---|---|---|---|
| `toolboxPageGenerator.js` (9593 baris!) | `generateSubToolboxPage` — hub utama toolbox | besar | `/sub-toolbox/:configStr/:videoId?/:filename?` |
| | `generateEmbeddedSubtitlePage` — embedded subtitle picker | besar | `/embedded-subtitles/...` |
| | `generateAutoSubtitlePage` — auto-subtitle page | besar | `/auto-subtitles/...` |
| `fileUploadPageGenerator.js` (4155 baris) | `generateFileTranslationPage` — upload & translate file SRT/ASS | besar | `/file-upload/...` |
| `syncPageGenerator.js` (4058 baris) | `generateSubtitleSyncPage` — sync/shift subtitle timing | besar | `/sync/...` |
| `historyPageGenerator.js` (1384 baris) | `generateHistoryPage` — translation history | sederhana | `/history/...` |
| `smdbPageGenerator.js` (1452 baris) | `generateSmdbPage` — subtitle metadata DB browser | sederhana | `/smdb/...` |

**Ciri-ciri penting dunia belakang:**
- HTML dijana sebagai **template literal string** dalam JS — CSS inline dalam `<style>` dalam setiap template
- 3 blok `<style>` berasingan dalam toolboxPageGenerator (setiap halaman ada CSS sendiri — banyak duplikasi)
- Guna Google Fonts: **Inter + Space Grotesk** (public guna system font + theme CSS)
- Theme bootstrap berbeza dari dunia depan: `data-third-theme="true-dark"` + `localStorage.theme` (`light`/`dark`/`blackhole`/`true-dark`)
- Warna semasa toolbox: **merah `#e11d2a`/`#ff4655`** (bukan violet!) — inconsistent dengan subfaber-theme.css depan
- Background gelap `#0A0E27` (dark) / `#000000` (true-dark); light `#f5f8fd`
- i18n via `getTranslator()` + `buildClientBootstrap(loadLocale())` — locale JSON disuntik sebagai `<script>` inline
- Ada sw-register, favicon-toolbox.svg, version query `?_cb=`

---

## 2. RISIKO & KEKANGAN (JANGAN ROSAKKAN)

1. **JS hooks dalam main.html** — `config.js` (11.5k baris) cari elemen ikut `id` dan class tertentu (`#configForm`, `#apiKeysSection`, `.section-header`, `.toggle-switch`, dsb). Markup boleh distruktur semula TAPI id/class/data-* mesti kekal.
2. **Partial placeholder tokens** — `__CONFIGURE_MAIN_PARTIAL__`, `__CONFIGURE_FOOTER_PARTIAL__`, `__CONFIGURE_OVERLAYS_PARTIAL__`, `__CONFIGURE_QUICK_SETUP_PARTIAL__`, `__APP_VERSION_JSON__`, `__CONFIG_LIMITS_JSON__`, `__APP_VERSION_QUERY__` — jangan rename.
3. **Theme bootstrap** — inline script dalam `<head>` configure.html (3-mode light/system/dark via `data-theme` + `data-theme-pref`). Rootsys guna 2-mode je — kita KEKALKAN 3-mode (lebih baik).
4. **i18n attributes** — `data-i18n`, `data-i18n-attr` mesti kekal pada setiap elemen.
5. **Toolbox theme bootstrap** — berbeza dari depan (`data-third-theme`, `blackhole`/`true-dark`). Perlu selaraskan TAPI jangan pecahkan localStorage theme sharing antara dua dunia (user set dark di depan, toolbox patut ikut).
6. **Service worker** — `sw.js` cache assets dengan version query; CSS baru akan di-cache dengan `?_cb=` baru secara automatik.
7. **Combobox component** — `combobox.css` + `combobox.js` bergantung pada struktur DOM tertentu.
8. **Quick Setup wizard** — `quick-setup.js` (2043 baris) ada state machine; hanya restyle CSS, jangan ubah markup wizard.
9. **Toolbox inline CSS** — 3 blok `<style>` dalam toolboxPageGenerator perlu diganti dengan satu design system; pastikan CSS variables baru ditakrif dalam setiap template (kerana tiada external stylesheet dikongsi).
10. **Regression tests** — ada test files yang check struktur HTML (`subfaber-preflight-regression.test.js`, dll). Semak test selepas setiap fasa.

---

## 3. BLUEPRINT REDESIGN

### Keputusan reka bentuk utama

| Aspek | Keputusan | Rasional (dari audit Rootsys) |
|---|---|---|
| **Dua gaya berbeza** | Dunia DEPAN = "macOS window" (public Rootsys). Dunia BELAKANG (toolbox) = "sidebar app" (dashboard Rootsys). | Sama macam Rootsys sendiri — dua personaliti, satu motif traffic-light |
| **Warna aksen** | Violet `#7C3AED` untuk kedua-dua dunia | Rootsys dashboard violet; subfaber-theme.css DAH guna violet — selari |
| **Motif pemersatu** | Traffic-light dots `#ff5f56 #ffbd2e #27c93f` + dark mode + Lucide-style icons + radius xl/2xl | Motif Rootsys yang kekal di public & dashboard |
| **Typography** | Inter untuk UI (toolbox dah guna); Space Grotesk untuk display/headings (toolbox dah guna — kekalkan); JetBrains Mono untuk kod/API keys | Toolbox sudah 90% align; depan perlu import font |
| **Theme** | Kekalkan 3-mode (light/system/dark) di depan; toolbox selaraskan ikut token yang sama | Lebih baik dari Rootsys (2-mode) |
| **Toolbox colors** | Buang merah `#e11d2a`, ganti violet `#7C3AED`; light bg `#F7F8FB`, dark `#14161F` (ikut Rootsys dashboard palette sebenar) | Konsisten dengan audit Rootsys dashboard |

### Struktur kerja (fasa demi fasa)

**FASA 3 — Design tokens + asas (tiada perubahan visual ketara)**
- Tambah CSS variables Rootsys-style ke `subfaber-theme.css`: app bg `#F7F8FB`, surface `#FFFFFF`, border `#ECEFF4`, text `#1C1D2C/#6B7280/#9CA3AF`, dark `#14161F/#1B1D29/#232534/#2A2C3A`
- Import Inter + JetBrains Mono di configure.html `<head>` (preconnect + stylesheet, dengan `?_cb=`)
- Fail baru `public/css/rootify.css` (dimuat selepas subfaber-theme.css) untuk komponen baru: macOS window, traffic dots, titlebar, sidebar, stat cards, pills

**FASA 4 — Dunia depan (configure)**
- `configure.html`: balut body dalam `subfaber-desktop` + `subfaber-window` + tukar `header.app-navbar` kepada `subfaber-titlebar` dengan traffic dots (KEKAL semua id/class JS hooks dalamnya — hanya tambah wrapper + restyle)
- `subfaber-theme.css` + `rootify.css`: restyle cards kepada `rounded-2xl border #ECEFF4 bg-white shadow-sm`, butang `min-h-[44px] rounded-xl`, inputs `h-11 focus:ring`, section separators `border-t`
- Footer: gaya Rootsys (centered, kecil)
- Jangan sentuh `main.html` markup secara besar — kekalkan struktur, hanya kelas CSS tambahan bila perlu (risk rendah)

**FASA 5 — Dunia belakang (Sub Toolbox)**
- `toolboxPageGenerator.js`: tukar inline `:root` tokens kepada palette Rootsys dashboard (violet, `#F7F8FB`, `#14161F`, `#ECEFF4`, `#1C1D2C`, dsb) dalam ketiga-tiga halaman (sub-toolbox, embedded, auto-subtitle)
- Tambah traffic-light dots + titlebar mini dalam setiap halaman toolbox (motif pemersatu)
- Sidebar untuk Sub Toolbox hub (Overview/File Translate/Sync/History/SMDB/Auto) ikut gaya dashboard Rootsys — TAPI hanya jika markup sedia ada membenarkan tanpa pecahkan JS; jika tidak, kekalkan grid cards tapi restyle ikut tokens baru
- `fileUploadPageGenerator.js`, `syncPageGenerator.js`, `historyPageGenerator.js`, `smdbPageGenerator.js`: samakan tokens (violet, surfaces, borders) supaya satu dunia belakang konsisten
- Selaraskan theme bootstrap toolbox dengan depan: hormat `localStorage.theme` = `light|dark|system` (map system→prefers-color-scheme), kekalkan `blackhole`/`true-dark` sebagai alias dark untuk backward-compat

**FASA 6 — Ujian & polish**
- `npm test` (regression suites: subfaber-preflight, gemini-auth-model, streamUrlIdentity, bulk-key-import)
- Semak visual: light + dark + system; depan + semua 5 halaman toolbox
- Semak sw.js cache version bump
- Update CHANGELOG.md

---

## 4. INVENTORI FAIL YANG AKAN DIUBAH

**Diubah (CSS/markup presentation sahaja):**
- `public/configure.html` (tambah font links + wrapper macOS window)
- `public/css/subfaber-theme.css` (kemas kini tokens)
- `public/css/rootify.css` (BARU — komponen Rootsys-style)
- `public/partials/main.html` (minimum — tambah kelas bila perlu sahaja)
- `public/partials/footer.html` (restyle kecil)
- `src/utils/toolboxPageGenerator.js` (3 blok inline CSS + markup titlebar/sidebar)
- `src/utils/fileUploadPageGenerator.js` (inline CSS tokens)
- `src/utils/syncPageGenerator.js` (inline CSS tokens)
- `src/utils/historyPageGenerator.js` (inline CSS tokens)
- `src/utils/smdbPageGenerator.js` (inline CSS tokens)

**TIDAK diubah (JS logic, kontrak):**
- `public/config.js`, semua `public/js/*.js`, `src/utils/configurePageGenerator.js` (kecuali kalau perlu suntik rootify.css link — semak), routes, i18n, sw.js

---

## 5. RISIKO TERTINGGI & MITIGASI

| Risiko | Mitigasi |
|---|---|
| Pecah `config.js` (11.5k baris JS yang cari DOM hooks) | Jangan ubah id/class/data-* dalam main.html; hanya tambah wrapper di configure.html dan CSS |
| Pecah toolbox inline CSS yang kompleks (3 template, ~10k baris) | Ubah hanya blok `:root` tokens dan tambah markup titlebar; kekalkan class names sedia ada |
| Theme tak selari antara dua dunia (localStorage key sama tapi value set berbeza) | Selaraskan bootstrap: hormat `light|dark|system`; map `blackhole|true-dark`→dark |
| Regression tests gagal | Lari `npm test` selepas setiap fasa; rollback fasa jika gagal |
| Service worker cache CSS lama | `?_cb=__APP_VERSION_QUERY__` auto-bump; semak sw.js precache list untuk rootify.css baru |
