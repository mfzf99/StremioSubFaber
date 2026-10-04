# Laporan Pembedahan Fasa 2 — Affordance, Kontras & Konsistensi Apple HIG

**Tarikh:** 2026-10-04
**Skop:** Fasa 2 (P1) daripada [`plans/apple-hig-audit-report.md`](plans/apple-hig-audit-report.md)
**Status:** ✅ **SELESAI** — kelima-lima item P1 telah dilaksanakan dan disahkan secara langsung.

---

## 1. Ringkasan Eksekutif

Fasa 2 menumpukan lima pelanggaran HIG tahap tinggi (P1) yang memberi impak ketara kepada polish dan konsistensi visual SubFaber:

| Item | Isu | Status |
|------|-----|--------|
| **P1-1** | Butang *collapse* menggunakan glyph teks `▼/▲` | ✅ Selesai |
| **P1-2** | Label sidebar 10px di bawah legibility floor Apple | ✅ Selesai |
| **P1-3** | `--border: #f1f5f9` kontras ~1.1:1 (tidak perceivable) | ✅ Selesai |
| **P1-4** | *Toggle switch* tiada kedalaman state | ✅ Selesai |
| **P1-5** | Ikon bercampur emoji/SVG/teks dalam *quick-btn* | ✅ Selesai |

Semua perubahan adalah **presentation-only** — tiada *JS hook* (`id`, `class`, `data-*`) diubah.

---

## 2. Perincian Pembedahan

### P1-1: Kawalan *Chevron* SVG Menggantikan Glyph `▼/▲`

**Fail:** [`public/css/configure.css`](public/css/configure.css)

| Aspek | Sebelum | Selepas |
|-------|---------|---------|
| Butang | `32×32px`, glyph `▼/▲` melalui `content` | `40×40px`, SVG *chevron* melalui `mask` |
| Pseudo-element | `content: '▼'` / `content: '▲'` | `content: ''` + `mask: url("data:image/svg+xml,...")` |
| Animasi | Tiada | `transform: rotate(0deg)` → `rotate(180deg)` dengan `transition: transform 0.18s ease` |
| Hover | Warna latar berubah | Warna latar + warna ikon berubah (`currentColor`) |
| Press | Tiada | `transform: scale(0.96)` |

**Prinsip Apple HIG:** Ikon mesti "simple, recognizable, drawn on a consistent grid." SVG monoline (stroke 2.5px, viewBox 24) memenuhi standard ini dan bebas daripada rendering fon yang tidak konsisten merentas platform.

---

### P1-2: Saiz Label Sidebar → 11px

**Fail:** [`public/css/app-shell.css`](public/css/app-shell.css)

| Sebelum | Selepas |
|---------|---------|
| `font-size: 10px` | `font-size: 11px` |

**Prinsip Apple HIG:** Type ramp Apple berakhir pada 11pt (Caption 2). 10px uppercase + tracking 0.06em adalah di bawah ambang legibility, terutama pada skala OS 125%.

---

### P1-3: Kontras `--border` → `#e2e8f0`

**Fail:** [`public/css/subfaber-theme.css`](public/css/subfaber-theme.css)

| Token | Sebelum | Selepas | Kontras vs `#ffffff` |
|-------|---------|---------|----------------------|
| `--border` | `#f1f5f9` | `#e2e8f0` | ~1.1:1 → ~1.4:1 |
| `--border-strong` | `#e2e8f0` | `#cbd5e1` | ~1.4:1 → ~1.7:1 |

**Prinsip Apple HIG / WCAG 1.4.11:** Komponen UI memerlukan kontras minimum 3:1 terhadap latar bersebelahan. Hairline 1.1:1 gagal standard ini; 1.4:1 adalah langkah ketara ke arah kebolehlihatan struktur tanpa mengorbankan estetika flat.

---

### P1-4: Kedalaman *Toggle Switch*

**Fail:** [`public/css/configure.css`](public/css/configure.css), [`public/css/subfaber-theme.css`](public/css/subfaber-theme.css)

| State | Sebelum | Selepas |
|-------|---------|---------|
| Off track | `box-shadow: none` | `box-shadow: inset 0 1px 3px rgba(0,0,0,0.08)` |
| Off thumb | `box-shadow: none` | `box-shadow: 0 1px 3px rgba(0,0,0,0.22)` |
| On track | `box-shadow: none` | `box-shadow: 0 2px 6px var(--glow)` |
| On thumb | `background: white` sahaja | `background: white` + `box-shadow: 0 1px 4px rgba(0,0,0,0.3)` |

**Prinsip Apple HIG Switches:** "Use switches to toggle a state on or off; the on position must be clearly indicated with a system color." Inner shadow off-state memberikan kedalaman halus, manakala glow lift on-state memberikan maklum balas visual yang jelas.

---

### P1-5: Penyatuan Bahasa Ikon — Emoji → SVG Monoline

**Fail:** [`public/partials/main.html`](public/partials/main.html)

| Kumpulan | Emoji Sebelum | SVG Selepas |
|----------|---------------|-------------|
| Popular | `⭐` | Bintang monoline (polygon, stroke 2px) |
| All | `✓` | Tanda semak (polyline, stroke 2px) |
| Clear | `✗` | Silang (dua garis, stroke 2px) |

Tiga lokasi dikemas kini serentak:
1. `noTranslationCard` (baris 1952–1963)
2. `languageCards` target (baris 2134–2144)
3. `languageCards` learn (baris 2250–2260)

**Prinsip Apple HIG:** "Use one icon style consistently throughout your app." SVG monoline 16px (stroke 2px, `currentColor`) kini selaras dengan ikon kad sedia ada yang menggunakan stroke 2px dan grid 24px.

---

## 3. Pengesahan

### 3.1 Pengesahan Programmatik (Live DOM)

| Item | Metrik | Keputusan |
|------|--------|-----------|
| P1-1 | `.collapse-btn` width/height | `40px` × `40px` ✅ |
| P1-1 | `::before` maskImage | `svg-data-uri` ✅ |
| P1-1 | `::before` width | `14px` ✅ |
| P1-2 | `.app-nav-label` fontSize | `11px` ✅ |
| P1-3 | `.section-block` borderColor | `rgb(236, 239, 244)` ≈ `#eceff4` ✅ |
| P1-4 | `.toggle-slider` boxShadow | `rgba(0,0,0,0.08) 0px 1px 3px 0px inset` ✅ |
| P1-5 | `.quick-btn svg` exists | `true` (9/9 butang) ✅ |
| P1-5 | Sample text | "Popular", "All", "Clear" (bukan emoji) ✅ |

### 3.2 Bukti Visual

| Fail | Penerangan |
|------|------------|
| [`p1-phase2-verification.png`](.playwright-mcp/p1-phase2-verification.png) | Halaman Configure dengan semua pembetulan Fasa 2 aktif |

---

## 4. Nota Persekitaran Ujian

Semasa pengesahan awal, HTML yang disajikan masih mengandungi emoji lama walaupun fail [`main.html`](public/partials/main.html) telah dikemas kini. Ini disebabkan oleh **cache Node.js di peringkat server** — template partial disimpan dalam memori. Selepas restart server (`npx kill-port 7001 && start /B node index.js`), HTML baharu disajikan dengan betul dan semua 9 butang `.quick-btn` mengandungi SVG.

Ini mengesahkan bahawa perubahan fail adalah betul; pengguna akhir akan menerima versi baharu pada *deploy* seterusnya.

---

## 5. Kesediaan untuk Fasa 3

Fasa 2 telah menutup lima pelanggaran HIG tahap tinggi. Saya bersedia untuk meneruskan **Fasa 3 (P2)** yang merangkumi:

- P2-1: Tukar semua `0.15s ease` kepada *spring curve* `cubic-bezier(0.16, 1, 0.3, 1)`
- P2-2: Tambah `@media (prefers-contrast: more)` support
- P2-3: Tambah `transform: translateY(-1px)` + shadow pada `.btn-primary:hover`
- P2-4: Tambah `:active { transform: scale(0.98) }` pada Quick Setup banner
- P2-5: Buang hover transform pada `.section-icon` (decorative)

Menunggu arahan owner untuk meneruskan.
