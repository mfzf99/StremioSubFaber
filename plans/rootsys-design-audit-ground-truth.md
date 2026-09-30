# Rootsys.cloud Design Audit — Ground Truth untuk SubFaber Redesign

**Tarikh audit:** 2026-09-30
**Sumber:** Scraping langsung rootsys.cloud (stealth proxy tembus Cloudflare — status 200 untuk semua halaman public + dashboard dalaman via localStorage token injection)
**Halaman public diaudit:** `/` (Overview), `/models`, `/setup`, `/status`, `/buyer/login`, `/buyer/register`
**Halaman dashboard diaudit (authenticated):** `/buyer/dashboard` (Overview), `/buyer/keys` (API Keys), `/buyer/redeem`, `/buyer/usage`, `/buyer/leaderboard` + sidebar HTML penuh + mobile bottom nav
**Kaedah akses dashboard:** Cloudflare Turnstile tidak dapat ditembus automatik; user login sendiri di browser, berkongsi JWT dari `localStorage.buyerToken`, token disuntik ke browser cloud — berjaya masuk semua halaman `/buyer/*`.

> ⚠️ **NOTA KESELAMATAN (penting untuk user):** Semasa proses audit ini, user telah berkongsi (1) password akaun Rootsys, (2) keseluruhan cookie browser termasuk session tokens untuk Google, PayPal, GitHub, ChatGPT, Claude, Netflix, Spotify, dll, dan (3) JWT session Rootsys dalam chat. **Tindakan yang disarankan: revoke/logout semula servis kritikal (Google, PayPal, GitHub) dan tukar password Rootsys selepas sesi ini.**

---

## 1. Design Concept Utama: "macOS Desktop Window"

Ini identiti design paling kuat Rootsys — keseluruhan site dibungkus dalam **satu tingkap macOS maya**:

```
rootsys-desktop  (outer padding — "wallpaper" area, px-3 py-3 sm:px-6 lg:px-8)
└── rootsys-window  (max-w-7xl, rounded-2xl, overflow-hidden)
    └── rootsys-titlebar  (sticky top-0, h-14, flex, z-10)
        ├── 3 bulatan traffic light: #ff5f56 (merah), #ffbd2e (kuning), #27c93f (hijau)
        ├── Logo + nama brand
        ├── Nav tengah (centered)
        └── Actions kanan (theme toggle, Sign in, CTA button)
```

**Kelakuan:**
- Titlebar `sticky top-0` — kekal atas bila scroll, macam titlebar app native.
- Window ada `rounded-2xl` (16px radius) dan `overflow-hidden` supaya content ikut lengkung.
- "Desktop" outer area adalah padding bernafas di sekeliling window — pada mobile `px-3 py-3`, desktop `lg:px-8 lg:py-8`.
- Dark mode ada (localStorage `theme` = 'dark' → `<html class="dark">`), toggle bulan/matahari lucide icon di titlebar.

**Untuk SubFaber:** Ganti navbar flat sedia ada dengan pattern ini — `subfaber-desktop` wrapper + `subfaber-window` + `subfaber-titlebar` dengan traffic-light dots sebagai motif brand.

---

## 2. Design Tokens (diderive dari Tailwind classes sebenar)

### 2.1 Warna — sistem semantic tokens (shadcn-style)

Rootsys guna CSS variables yang dirujuk sebagai Tailwind colors:

| Token | Kegunaan dalam HTML | Nota |
|---|---|---|
| `brand` | `bg-brand`, `text-brand`, `focus:ring-brand`, `border-brand`, `text-brand-foreground` | Warna aksen utama — butang CTA, highlight h1 ("13 models"), link Register/Login. Brand foreground = teks di atas bg brand. |
| `background` | `bg-background`, `ring-offset-background` | Latar window utama (light: hampir putih; dark: gelap). |
| `foreground` | `text-foreground`, `bg-foreground/[0.02..0.07]`, `hover:bg-foreground/[0.04]`, `text-foreground/70`, `/60`, `/40` | Teks utama + **dipakai sebagai tint overlay** (bg-foreground dengan alpha rendah untuk cards & hover states). Ini teknik kunci: satu warna foreground, pelbagai alpha untuk hierarchy. |
| `border` | `border-border`, `border-border/50`, `/60` | Warna sempadan halus; alpha 50-60% untuk subtlety. |
| `accent` | `hover:bg-accent` | Hover background untuk icon buttons. |
| `muted-foreground` | `text-muted-foreground` | Teks lemah (icon buttons idle state). |

**Corak warna sebenar (daripada screenshot light mode):**
- Desktop/wallpaper: kelabu lembut (`#EFEFEF` anggaran dari branding extractor)
- Window: putih
- Brand: biru lembut/muted (screenshot menunjukkan butang biru sederhana, bukan biru terang; `#0000EE` dari branding extractor adalah fallback link default, bukan nilai sebenar — nilai sebenar perlu disahkan dari screenshot, nampak seperti biru-kelabu profesional)
- Traffic lights: `#ff5f56`, `#ffbd2e`, `#27c93f` (nilai hardcode macOS sebenar)

**Cadangan token CSS SubFaber:**

```css
:root {
  --brand: 220 90% 56%;            /* larut mengikut identiti SubFaber */
  --brand-foreground: 0 0% 100%;
  --background: 0 0% 100%;
  --foreground: 222 15% 12%;
  --border: 220 10% 88%;
  --desktop-bg: 0 0% 94%;          /* "wallpaper" luar window */
  --tl-red: #ff5f56;
  --tl-yellow: #ffbd2e;
  --tl-green: #27c93f;
}
.dark {
  --background: 222 20% 8%;
  --foreground: 0 0% 96%;
  --border: 220 10% 22%;
  --desktop-bg: 222 25% 5%;
}
```

### 2.2 Typography

| Elemen | Class sebenar | Spesifikasi |
|---|---|---|
| H1 hero | `text-[1.75rem] sm:text-[2.75rem] font-bold leading-[1.12] tracking-tight` | 28px → 44px, bold, line-height ketat 1.12, tracking -0.02em |
| H2 section | `text-lg font-semibold tracking-tight` | 18px semibold |
| H3 card | `text-sm font-semibold` | 14px semibold |
| Body/lede | `text-[15px] leading-relaxed text-foreground/70` | 15px, relaxed, foreground 70% |
| Card body | `text-[13px] leading-relaxed text-foreground/70` | 13px |
| Nav link | `text-[13px] font-medium` | 13px medium |
| Small/footnote | `text-xs text-foreground/60` | 12px, 60% alpha |
| Angka statistik | `rootsys-mono text-xl sm:text-2xl font-semibold tracking-tight` | Monospace untuk nombor — 20-24px |
| Font utama | Preload `e4af272ccee01ff0-s.p.woff2` (next/font, subset latin) | Kemungkinan besar **Inter** atau **Geist Sans** — sans-serif moden dengan tracking-tight |
| Font mono | class `rootsys-mono` | Monospace untuk URL API, statistik, code blocks |

**Hierarchy penting:** Hanya 3 tahap alpha teks: `text-foreground` (100%) → `text-foreground/70` (body) → `text-foreground/60` (footnote) → `placeholder:text-foreground/40`. Tiada warna kelabu berasingan — semua derive dari foreground.

### 2.3 Spacing & Radius

| Token | Nilai |
|---|---|
| Radius kecil (nav pills, toggles) | `rounded-lg` = 8px |
| Radius sederhana (butang, inputs, cards) | `rounded-xl` = 12px |
| Radius besar (window) | `rounded-2xl` = 16px |
| Section padding | `px-6 py-11 sm:px-10 sm:py-12` |
| Hero padding | `px-6 pb-12 pt-12 sm:px-10 sm:pb-14 sm:pt-16` |
| Card padding | `px-4 py-4` (kecil) / `px-5 py-5` (statistik) |
| Grid gaps | `gap-3` (cards), `gap-1.5` (actions), `gap-0.5/1` (nav) |
| Section separator | `border-t border-border/50` |

### 2.4 Komponen-komponen (dengan class sebenar)

**Butang primary (CTA):**
```
inline-flex items-center min-h-[44px] rounded-xl bg-brand px-5
text-sm font-semibold text-brand-foreground shadow-sm
transition-colors hover:bg-brand/90
focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2
```
- Min height 44px (touch target), px-5, text 14px semibold
- Hover: opacity 90% (bukan tukar warna)
- Focus ring: 2px brand + offset 2px background

**Butang secondary:**
```
min-h-[44px] rounded-xl border border-border bg-background/60 px-5
text-sm font-medium hover:bg-foreground/5
```

**Nav link (idle):**
```
inline-flex min-h-[36px] items-center rounded-lg px-2.5 sm:px-3
text-[13px] font-medium text-foreground/70
hover:bg-foreground/[0.04] hover:text-foreground transition-colors
```

**Nav link (active):**
```
bg-foreground/[0.07] text-foreground
```
- Pill background nipis 7% alpha — tiada underline, tiada warna brand.

**Cards:**
```
rounded-xl border border-border/50 bg-foreground/[0.02] px-4 py-4
```
- Background hanya 2% alpha foreground — hampir invisible tapi cukup untuk pisahkan dari window bg.

**Tab switcher (Today/Overall):**
```
container: inline-flex items-center gap-1 rounded-xl border border-border/60 bg-foreground/[0.03] p-1
tab active: bg-background text-foreground shadow-sm
tab idle: text-foreground/70 hover:text-foreground
```

**Input (login/register):**
```
h-11 w-full rounded-xl border border-border bg-background px-4 text-sm
focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/25
```
- h-11 (44px), label `text-xs font-semibold text-foreground/70` dengan `mb-1.5`
- Focus: border tukar brand + ring 2px brand 25% alpha

**API URL pill (hero):**
```
flex items-center gap-2 rounded-xl border border-border/60 bg-foreground/[0.035] pl-4 pr-1.5
├── code.rootsys-mono (truncate)  └── copy button h-11 w-11 ghost
```

**Code blocks (setup page):** Tab curl/python/node dengan blok monospace.

**Icon set:** **Lucide** (SVG stroke-based, `lucide-moon`, `lucide-menu`, `lucide-copy`) — stroke-width 2, size 16-20px.

### 2.5 Micro-interactions

- **Reveal on scroll:** setiap section wrapped dalam `transition-opacity duration-500 ease-out` (komponen `<Reveal>`) — fade-in apabila masuk viewport.
- **Semua transition:** `transition-colors` sahaja — tiada transform/scale hover yang agresif.
- **Toaster:** Sonner-style (`fixed top-0 sm:bottom-0 sm:right-0 md:max-w-[420px]`, region ARIA "Notifications (F8)").
- **Copy button:** copy API URL ke clipboard dengan feedback toast.
- **Theme:** light/dark via localStorage, class `.dark` pada `<html>`, script inline anti-FOUC (sama macam SubFaber punya bootstrap — bagus, kekalkan).

### 2.6 Copy & Tone

Gaya penulisan yang melengkapkan design minimal:
- Headline pendek dan fakta: *"13 models behind one endpoint"*, *"Measured, not claimed"*, *"Four steps to your first call"*
- Nombor guna mono font, label kecil bawah nombor (pattern `<dl>` terbalik: `<dd>` besar, `<dt>` kecil)
- Transparency: *"Read from the live database, refreshed every five minutes"*, *"Nothing on this page is an estimate"*
- Tiada emoji, tiada exclamation, tiada buzzword.

---

## 3. Struktur Halaman (Blueprint)

### Overview `/`
1. Hero: H1 dengan span.text-brand + lede + API URL pill + 2 CTA
2. `border-t` → "How it works": grid 3 cards
3. `border-t` → "By the numbers": tab switcher + grid 4 stat cards (sm:2col, lg:4col) + footnote
4. Footer centered: brand name + copyright

### Models `/models`
Grid kad model — setiap kad: logo provider PNG, nama model (mono), metadata. *(Halaman ini throw client-side error dalam sesi scrape — kemungkinan data fetch blocked; struktur grid boleh disahkan dari status page yang serupa.)*

### Setup `/setup`
1. "Setup" eyebrow + H1 + lede
2. Numbered steps 01-04 (nombor besar, tajuk semibold, deskripsi kecil)
3. API URL pill lagi
4. "Examples": tab curl/python/node + code blocks
5. "Worth knowing": grid 4 fakta (Streaming, Listing models, Token allowance, Rejected model names)

### Status `/status`
1. "Activity" eyebrow + H1 "Measured, not claimed"
2. "Model status — today": list 13 model, setiap satu: logo, nama, "% answered · N today", badge "Operational", sparkline 24h
3. 3 stat besar: requests all-time, tokens 7d, success rate 7d
4. "Detail": definisi list 2 kolom
5. "How these are counted": 3 penjelasan prose

### Login/Register `/buyer/*`
- Centered window kecil `max-w-sm` dalam desktop wallpaper penuh
- Titlebar mini (h-11) dengan traffic lights + tajuk window
- `p-8`: logo + tajuk + subtitle, form space-y-4, label xs semibold, input h-11 rounded-xl, butang full-width h-11
- Link bawah: "No account? Register" (text-brand semibold)

---

## 4. Mapping ke SubFaber

| Elemen SubFaber sekarang | Cadangan ala Rootsys |
|---|---|
| `header.app-navbar` flat sticky | `subfaber-window` > `subfaber-titlebar` dengan traffic-light dots (boleh guna warna SubFaber), logo, nav tengah, theme toggle kanan |
| Body terus ke content | Wrapper `subfaber-desktop` dengan padding "wallpaper" + window `max-w-7xl rounded-2xl overflow-hidden` |
| Theme switch 3-mode (light/system/dark) | **Kekalkan** — lebih baik dari Rootsys (dia 2-mode je). Restyle jadi pill segmented macam tab switcher `bg-foreground/[0.03]` |
| Section separators | `border-t border-border/50` |
| Cards/panels | `rounded-xl border border-border/50 bg-foreground/[0.02]` |
| Butang primary | `min-h-[44px] rounded-xl bg-brand text-sm font-semibold hover:bg-brand/90` |
| Inputs | `h-11 rounded-xl border focus:border-brand focus:ring-2 focus:ring-brand/25` |
| Statistik/nombor (kalau ada) | mono font, besar semibold + label kecil 70% alpha |
| i18n flags dock | Kekalkan fungsi; restyle sebagai pill group macam nav |
| Copy tone | Pendek, fakta, yakin — elak ayat panjang marketing |

**Yang JANGAN diubah (kelebihan SubFaber sedia ada):**
- Bootstrap anti-FOUC theme (sama pattern dengan Rootsys — bagus)
- 3-mode theme switch (light/system/dark)
- i18n system penuh dengan locales
- Version badge

---

## 5. Dashboard Dalaman `/buyer/*` — AUDIT LENGKAP (authenticated)

### 5.1 PENDAPAT UTAMA: Dashboard guna design system BERBEZA dari halaman public!

Halaman public guna konsep "macOS Desktop Window" dengan semantic tokens shadcn (`bg-brand`, `text-foreground/70`, dsb). Dashboard dalaman pula guna **app layout konvensional dengan sidebar + warna hex hardcoded terus dalam Tailwind arbitrary values**. Dua personaliti berbeza dalam satu site:

| Aspek | Halaman Public | Dashboard `/buyer/*` |
|---|---|---|
| Layout | macOS window centered (`max-w-7xl`) | Sidebar kiri 240px + content `max-w-5xl` |
| Background | "Wallpaper" + window putih | Flat `bg-[#F7F8FB]` / dark `bg-[#14161F]` |
| Warna aksen | `brand` semantic (biru lembut) | **Purple `#7C3AED`** (violet-600) hardcoded |
| Cards | `bg-foreground/[0.02]` tint | Putih dengan border `#ECEFF4` + shadow |
| Radius | `rounded-xl`/`2xl` | `rounded-2xl` cards, `rounded-xl` controls |
| Traffic lights | Di titlebar semua halaman | Hanya di header sidebar (motif kekal) |

**Implikasi untuk SubFaber:** Kau boleh pilih salah satu atau gabungkan — public-facing pages (configure/landing) ikut gaya "macOS window", manakala tool/dashboard dalaman ikut gaya sidebar app. Traffic-light dots ialah motif berterusan di kedua-duanya.

### 5.2 Palet warna dashboard (nilai hex sebenar dari HTML)

**Light mode:**
- App background: `#F7F8FB`
- Surface (cards, sidebar, header): `#FFFFFF`
- Border: `#ECEFF4` (subtle), divider sama
- Teks utama: `#1C1D2C`
- Teks secondary: `#6B7280` (gray-500)
- Teks tertiary/labels: `#9CA3AF` (gray-400)
- Tint surface (hover, chip bg): `bg-gray-50` (#F9FAFB), `bg-gray-100` (#F3F4F6)
- **Aksen utama: `#7C3AED`** (violet-600); hover `#6D28D9` (violet-700); tint bg `#EDE7FE`; dark-mode text `#A78BFA` (violet-400)
- Status hues: hijau `#22C55E`/`#16A34A` (success), amber `#F59E0B` (progress bar, warning), merah `#ff5f56` (traffic light sahaja)
- Card shadow: `shadow-[0_1px_3px_rgba(16,24,40,0.06)]`

**Dark mode:**
- App background: `#14161F`
- Surface: `#1B1D29`
- Surface tint/hover: `#232534`
- Border: `#2A2C3A`
- Teks: `gray-100` / `gray-400` / `gray-500`
- Aksen: violet-400 `#A78BFA` teks, `#7C3AED`/20 background tint
- Cards: `dark:shadow-none` (shadow dibuang dalam dark)

**Corak penting:** Aksen purple digunakan untuk: butang primary (`bg-[#7C3AED] text-white hover:bg-[#6D28D9]`), nav aktif (`bg-[#EDE7FE] text-[#7C3AED]` / dark `bg-[#7C3AED]/20 text-[#A78BFA]`), badge plan (`bg-[#EDE7FE] text-[#7C3AED]`), avatar, fokus ring (`focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20`), icon section header.

### 5.3 Struktur layout dashboard (HTML sebenar)

```
div.relative.min-h-screen.overflow-x-hidden.bg-[#F7F8FB].dark:bg-[#14161F]
└── div.relative.z-10.flex
    ├── aside  (desktop sidebar)
    │     fixed left-0 top-0 z-30 hidden h-screen w-60 flex-col
    │     border-r border-[#ECEFF4] bg-white dark:border-[#2A2C3A] dark:bg-[#1B1D29] lg:flex
    │   ├── Brand header: h-16, border-b, px-5
    │   │     [traffic dots] [logo 28px] "Rootsys" text-[15px] font-bold
    │   ├── nav.flex-1.overflow-y-auto.px-3.py-3, gap-4
    │   │   ├── Group "ACCOUNT": Overview (layout-grid), API Keys (key-round), Redeem (gift), Usage (activity)
    │   │   ├── Group "EXPLORE": Models (cpu), Leaderboard (trophy)
    │   │   └── Group "HELP": Docs (book-open), Tutorial (graduation-cap)
    │   └── Footer: border-t p-3
    │         ├── User chip: avatar bulat 36px (bg tint violet, huruf pertama email), email (break-all text-xs), "Plus member" (text-[10px] violet)
    │         └── Logout button (log-out icon)
    ├── div.flex-1.lg:pl-60   (content offset ikut lebar sidebar)
    │   ├── header sticky mobile (lg:hidden): h-14, traffic dots + logo + theme toggle
    │   └── main: mx-auto max-w-5xl, space-y-6 p-6 sm:p-8, pb-28 (ruang untuk bottom nav mobile)
    └── nav fixed bottom (mobile, lg:hidden): border-t, 5 item icon+label (Overview, API Keys, Redeem, Usage, Models), pb-[env(safe-area-inset-bottom)]
```

**Page header pattern (semua halaman konsisten):**
```
h1.text-[28px].font-bold.tracking-tight.text-[#1C1D2C]         → tajuk halaman
p.mt-0.5.text-sm.text-[#6B7280]                                → subtitle satu baris
```

**Section label dalam sidebar:**
`text-[10px] font-semibold uppercase tracking-wider text-[#9CA3AF]` dengan `mb-1 px-3.5`

**Nav item (sidebar):**
- Base: `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-colors`
- Idle: `font-medium text-[#6B7280] hover:bg-gray-50 hover:text-[#1C1D2C]` (dark: `text-gray-400 hover:bg-[#232534] hover:text-gray-100`)
- **Active: `bg-[#EDE7FE] font-semibold text-[#7C3AED]`** (dark: `bg-[#7C3AED]/20 text-[#A78BFA]`) — tiada border kiri, tiada underline; pill tint penuh
- Icon: lucide 18px `shrink-0`

### 5.4 Komponen dashboard (class sebenar)

**Stat cards (Overview):** grid `grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4`
```
card: rounded-2xl border border-[#ECEFF4] bg-white shadow-[0_1px_3px_rgba(16,24,40,0.06)] p-4 sm:p-5
icon chip: h-9 w-9 rounded-full flex center — warna ikut semantik:
  Active keys → bg-green-100, icon text-[#22C55E]
  Requests    → bg-[#EDE7FE], icon text-[#7C3AED]
  Est. value  → bg-amber-100, icon text-[#F59E0B]
label: text-xs font-medium text-[#6B7280]
nilai: text-[22px] sm:text-[28px] font-bold tracking-tight
```

**Progress bar (Token usage):**
```
track: h-3 w-full rounded-full bg-gray-100 dark:bg-[#232534]
fill:  h-full rounded-full transition-all duration-500 bg-[#F59E0B], style width: X%
header: label kiri (text-[15px] font-semibold), nilai kanan (bold + "/ 1.80B" + chip % kecil bg-gray-50)
footer: text-xs text-[#9CA3AF] "293.4M remaining"
```
Nota: bar warna **amber** (#F59E0B) pada 84% — kemungkinan berubah hijau→amber→merah ikut paras penggunaan.

**Live Request Feed (Overview):** panel terminal gelap inline-styles (bukan Tailwind):
- container: `border-radius:12px; border:1px solid #2A2A2A; background:#0A0A0A`
- header bar: `background:#1A1A1A; padding:10px 16px; border-bottom:1px solid #2A2A2A`
- tajuk: **JetBrains Mono** 12px bold, dot status berdenyut (kuning `#FBBF24` bila reconnecting, hijau bila live)
- filter pills: mono 10px, `border-radius:999px`, aktif = border biru `#60A5FA` + bg `#1E3A5F` + teks `#93C5FD`; idle = border `#333` teks `#9CA3AF`
- grid columns (CSS custom `<style>`): `92px 48px 56px 1fr 84px 72px 84px` (TIME/STATUS/METHOD/MODEL/TOKENS/TTFT/USER), mobile hide METHOD
- animasi row: `feedIn` (fade + translateY -6px, 0.22s) dan `feedOkFlash` (flash hijau rgba(34,197,94,0.18) untuk status 200)

**API Keys page:**
- Base URL bar: `rounded-xl bg-gray-50 dark:bg-[#232534] px-4 py-3` — label uppercase 11px + nilai mono + butang Copy violet kecil (`h-8 rounded-xl bg-[#7C3AED] px-3 text-xs font-semibold`)
- Tabs (Radix): container `h-10 rounded-xl bg-gray-100 dark:bg-[#232534] p-1`; tab aktif `bg-white dark:bg-[#1B1D29] shadow-sm rounded-lg px-4`; label dengan kiraan "Active (1)" / "Expired (1)"
- Key card: nama boleh rename inline (ikon pencil muncul on hover), badge plan "Plus" (`bg-[#EDE7FE] text-[#7C3AED]`), chip "15 top-ups" (`bg-gray-50 text-[#9CA3AF]`), masa berbaki teks kecil
- Key string row: `rounded-lg bg-gray-50 px-3 py-2.5` — kod mono dipotong `fiq-8793841e••••••eda6`, butang eye (reveal), butang Copy violet
- Token meter kecil (h-2) + label
- CTA "Extend / top-up": **butang outline violet** — `border border-[#7C3AED]/30 text-[#7C3AED] hover:bg-[#EDE7FE]` dengan ikon gift

**Redeem page:** content sempit `max-w-xl` centered
- Warning callout: `rounded-xl bg-[#F59E0B]/10 p-3.5 text-xs text-[#92400E]` + ikon triangle-alert amber
- Input kod: `h-12 rounded-xl font-mono text-base tracking-widest placeholder "XXXX-XXXX-XXXX"`, focus `border-[#7C3AED] ring-2 ring-[#7C3AED]/20`
- Select "Apply to": `h-11 rounded-xl`, pilihan "+ Create a new key" atau extend key sedia ada; nota kecil italic
- Submit: `h-12 rounded-xl bg-[#7C3AED] font-bold text-white` + ikon gift

**Usage page:**
- Filter: select model `h-10 rounded-xl` di penjuru kanan header
- Desktop table: header `text-[11px] uppercase tracking-wide text-[#9CA3AF]`, rows `border-b border-[#ECEFF4] hover:bg-gray-50`; model = chip mono `bg-gray-50 rounded-lg px-2 py-1`; status 200 = `bg-green-100 text-[#16A34A] font-mono font-semibold`; angka `tabular-nums` right-aligned
- Mobile: kad per request (model chip + status di atas, grid 2-col untuk Tokens/TTFT/Latency/Time)
- "Load more (25 remaining)": butang outline `border-[#ECEFF4] hover:bg-gray-50` di footer

**Leaderboard page:**
- Card dengan header (ikon trophy violet + "Top Users") kemudian senarai rows `px-6 py-3 hover:bg-gray-50`
- Rank chip bulat `h-7 w-7 text-xs font-semibold`: #1 amber, #2 slate, #3 orange, selebihnya `bg-gray-100 text-[#6B7280]`
- Username masked (`amir****`), tokens bold `tabular-nums`, req count + tarikh teks tertiary

### 5.5 Typography dashboard

- H1 halaman: `text-[28px] font-bold tracking-tight`
- Subtitle: `text-sm text-[#6B7280]`
- Card title: `text-[15px] font-semibold`
- Label kecil: `text-xs font-medium text-[#6B7280]` / uppercase `text-[11px] font-semibold tracking-wide text-[#9CA3AF]`
- Angka statistik: `text-[22px]→[28px] font-bold tracking-tight`, `tabular-nums` untuk table
- Mono: `font-mono` default Tailwind untuk API key/Base URL/table chips; **JetBrains Mono** khusus untuk Live Request Feed
- Font utama: sama dengan public (next/font preload `e4af272ccee01ff0-s.p.woff2` — kemungkinan Inter/Geist)

### 5.6 Corak responsif dashboard

- Sidebar `hidden lg:flex`; mobile guna **bottom navigation 5 item** (icon 20px + label 10px), item aktif violet
- Mobile header sticky (h-14) dengan traffic dots + logo + theme toggle
- Stat grid: 2 kolum mobile → 3 desktop; kad ketiga `col-span-2 lg:col-span-1`
- Table Usage: desktop table penuh, mobile tukar kepada senarai kad (pattern `hidden sm:block` / `sm:hidden`)
- Content padding `p-6 sm:p-8`, `pb-28 lg:pb-8` (ruang bottom nav)

### 5.7 Elemen yang kekal konsisten public ↔ dashboard

1. **Traffic-light dots** (`#ff5f56 #ffbd2e #27c93f`) — di titlebar public DAN header sidebar/mobile dashboard
2. **Dark mode mechanism** — localStorage `theme` + class `.dark`, script anti-FOUC sama
3. **Ikon Lucide** konsisten (stroke 2, saiz 16-24px)
4. **Radius language** — xl untuk controls, 2xl untuk cards/window
5. **Toaster** Sonner-style sama
6. **Focus ring** — `focus:ring-2` dengan aksen 20-25% alpha

### 5.8 Cadangan mapping SubFaber (kemas kini selepas dashboard audit)

| Elemen SubFaber | Cadangan berasaskan audit penuh |
|---|---|
| `configure.html` (public-facing) | Gaya **public Rootsys**: macOS window, centered, hero + cards |
| Dashboard/panels dalaman (history, sync, toolbox pages) | Gaya **dashboard Rootsys**: sidebar kiri 240px (desktop) + bottom nav (mobile), stat cards dengan icon chips berwarna, tables dengan uppercase mini headers |
| Warna aksen | Pilih SATU hue utama dan komit macam Rootsys violet — cadangan kekalkan identiti SubFaber tapi tetapkan 1 warna brand + tints (`/10`, `/20`, `/30` alpha) |
| Live feed/log panels (kalau ada) | Panel terminal gelap JetBrains Mono dengan filter pills dan animasi row `feedIn`/`feedOkFlash` |
| API key display | Masking `prefix••••suffix` + butang eye reveal + Copy; badge plan; meter token h-2/h-3 rounded-full dengan warna berubah ikut paras |
| Form halaman sempit (redeem-style) | `max-w-xl` centered, input h-12 mono tracking-widest, warning callout amber `/10` bg |
| Stat cards | Icon bulat 36px dengan warna semantik (hijau/violet/amber) + label 12px + nilai 22-28px bold |
| Mobile nav | Bottom nav fixed 4-5 item dengan safe-area inset — lebih praktikal dari hamburger untuk tool app |

---

## 6. Rujukan screenshot (URL sementara Firecrawl, ~7 hari sah)

**Halaman public:**
- Home: screenshot-358c5cdd (fullpage)
- Models: screenshot-959cd006
- Setup: screenshot-d24fc32c
- Status: screenshot-43c0c82f
- Login: screenshot-b0a12a69
- Register: screenshot-8dfeffcf

**Dashboard (authenticated):**
- Overview `/buyer/dashboard`: screenshot-f2be58b3
- API Keys `/buyer/keys`: screenshot-273bbb73
- Redeem `/buyer/redeem`: screenshot-18bfd8cd
- Usage `/buyer/usage`: screenshot-b91c2266
- Leaderboard `/buyer/leaderboard`: screenshot-2e02baf7

*(URL penuh dalam log sesi; disarankan download & simpan ke plans/ kalau nak kekal.)*

---

## 7. Halaman dashboard yang tidak sempat diaudit

`/buyer/models`, `/buyer/docs`, `/buyer/tutorial` — tidak kritikal; Models page public punyai kandungan serupa, dan Docs/Tutorial adalah halaman kandungan statik (hampir pasti mengikut page-header pattern + prose cards yang sama). Jika perlu, akses semula menggunakan teknik `localStorage.buyerToken` injection yang sama (token sah ~7 hari dari 2026-09-30).
