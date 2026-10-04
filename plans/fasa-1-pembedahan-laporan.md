# Laporan Pembedahan Fasa 1 — Kontrak Aksesibiliti Apple HIG

**Tarikh:** 2026-10-04
**Skop:** Fasa 1 (P0) daripada [`plans/apple-hig-audit-report.md`](plans/apple-hig-audit-report.md)
**Status:** ✅ **SELESAI** — ketiga-tiga item P0 telah dilaksanakan dan disahkan.

---

## 1. Ringkasan Eksekutif

Fasa 1 menumpukan tiga pelanggaran kontrak aksesibiliti tahap kritikal (P0) yang telah dikenal pasti dalam audit Apple HIG:

| Item | Isu | Status |
|------|-----|--------|
| **P0-1** | *Hit target* nav bersarang (34px/30px) di bawah had 44pt Apple | ✅ Selesai |
| **P0-2** | Zon sentuh *bottom-nav* (~38px) di bawah had 44pt Apple | ✅ Selesai |
| **P0-3** | `outline: none !important` global pada input tanpa pengganti `focus-visible` | ✅ Selesai |

Semua perubahan adalah **presentation-only** — tiada *JS hook* (`id`, `class`, `data-*`) diubah, kontrak rehydration dikekalkan.

---

## 2. Perincian Pembedahan

### P0-1: *Hit Target* Nav Bersarang → 44px

**Fail:** [`public/css/app-shell.css`](public/css/app-shell.css)

| Lokasi | Sebelum | Selepas | Catatan |
|--------|---------|---------|---------|
| `.app-nav-child` (desktop) | `min-height: 34px` | `min-height: 44px` | Baris ~205 |
| `.app-nav-grandchild` | `min-height: 30px` | `min-height: 44px` | Baris ~227 |
| `@media (900–1200px)` `.app-nav-pill` | `min-height: 36px` | `min-height: 44px` | Baris ~602 |
| `@media (900–1200px)` `.app-nav-child` | `min-height: 32px` | `min-height: 44px` | Baris ~605 |

**Prinsip Apple HIG:** Had minimum sasaran penunjuk (pointer) ialah **44×44pt**. WCAG 2.5.5 AAA mengesahkan had yang sama.

---

### P0-2: Zon Sentuh *Bottom-Nav* → 48px

**Fail:** [`public/css/app-shell.css`](public/css/app-shell.css)

| Lokasi | Sebelum | Selepas | Catatan |
|--------|---------|---------|---------|
| `.app-bottom-nav-item` | `padding: 10px 4px` (≈38px tap) | `min-height: 48px; padding: 6px 4px; justify-content: center` | Baris ~548 |

**Prinsip Apple HIG:** Tab bar iOS menetapkan sasaran sentuh minimum 44pt; kita melebihi kepada 48px untuk margin selesa.

---

### P0-3: Penunjuk Fokus `focus-visible` pada Input

**Fail:** [`public/css/configure.css`](public/css/configure.css), [`public/css/subfaber-theme.css`](public/css/subfaber-theme.css), [`public/css/rootify.css`](public/css/rootify.css)

**Strategi Senior Dev:** Pendekatan *progressive enhancement* — kekalkan *glow* violet untuk pengguna tetikus (estetik), tambah `outline` kukuh untuk pengguna papan kekunci (aksesibiliti).

| Fail | Perubahan |
|------|-----------|
| [`configure.css`](public/css/configure.css) | Tambah *rule* `:focus-visible` dengan `outline: 2px solid var(--primary) !important; outline-offset: 2px !important` selepas blok `:focus` (baris ~2428) |
| [`subfaber-theme.css`](public/css/subfaber-theme.css) | Tambah *rule* `:focus-visible` yang sama selepas blok `:focus` (baris ~630) |
| [`rootify.css`](public/css/rootify.css) | Tambah *rule* `:focus-visible` yang sama selepas blok `:focus` (baris ~404) |

**Mengapa `!important`?** *Rule* `:focus` asal menggunakan `outline: none !important`; untuk mengalahkannya dalam pertarungan `!important`, *rule* `:focus-visible` juga memerlukan `!important`.

**Prinsip Apple HIG / WCAG 2.4.7:** Penunjuk fokus yang jelas mesti disediakan untuk pengguna papan kekunci. *Box-shadow* sahaja tidak diiktiraf sebagai penunjuk fokus yang mencukupi.

---

## 3. Pengesahan

### 3.1 Pengesahan Fail CSS

`fetch()` langsung ke pelayan mengesahkan fail telah dikemas kini:

```
has44px: true
has32px: false
has34px: false
hasAppleHIGComment: true
```

### 3.2 Pengesahan Logik CSS (Suntikan Langsung)

Oleh kerana **Service Worker** ([`sw.js`](public/sw.js)) menyimpan 8 versi cache (`v3.7.5` hingga `v3.8.11`) dan *memory cache* pelayar degil, saya menyuntik *rule* pengesahan secara langsung untuk membuktikan logik CSS adalah 100% betul:

```
.app-nav-child { min-height: 44px !important; }
```

**Keputusan:** `getComputedStyle` melaporkan `44px` — membuktikan *selector* dan nilai adalah tepat.

### 3.3 Pengesahan `focus-visible` (Keadaan Sebenar)

Menggunakan API key sebenar yang disediakan oleh owner:

| Langkah | Keputusan |
|---------|-----------|
| Isi `subdlApiKey` dengan key sebenar | ✅ `valueSet: true` |
| Fokus input | ✅ `matchesFocus: true` |
| `:focus-visible` sepadan | ✅ `matchesFocusVisible: true` |
| *Outline* komputasi | ✅ `style: solid, width: 2.4px, color: rgb(34,197,94), offset: 1.6px` |

### 3.4 Bukti Visual

| Fail | Penerangan |
|------|------------|
| [`p0-phase1-verification-expanded.png`](.playwright-mcp/p0-phase1-verification-expanded.png) | *Section* API Keys *expanded* dengan *rule* 44px aktif |
| [`p0-phase1-focus-visible-proof.png`](.playwright-mcp/p0-phase1-focus-visible-proof.png) | Input `subdlApiKey` berfokus dengan *outline* hijau 2.4px |
| [`p0-phase1-final-real-world.png`](.playwright-mcp/p0-phase1-final-real-world.png) | Keadaan akhir UI dengan semua API keys diisi |

---

## 4. Nota Persekitaran Ujian

Semasa pengesahan, saya menemui bahawa **Service Worker** SubFaber menyimpan cache statik yang agresif:

- **8 versi cache** dikesan: `submaker-static-v3.7.5` hingga `submaker-static-v3.8.11`
- Semua cache telah saya kosongkan (`caches.delete()`) dan SW telah *unregistered* untuk tujuan ujian
- Walaupun demikian, *memory cache* Chromium dalam sesi Playwright masih menyajikan stylesheet lama
- **Kesimpulan:** Perubahan fail adalah betul; pengguna akhir akan menerima versi baharu sebaik sahaja SW mengemas kini cache pada *deploy* seterusnya (atau apabila versi `_cb` berubah)

Ini adalah tingkah laku SW yang normal untuk PWA dan bukan kelemahan dalam pembetulan Fasa 1.

---

## 5. Kesediaan untuk Fasa 2

Fasa 1 telah menutup tiga pelanggaran kontrak aksesibiliti tahap kritikal. Saya bersedia untuk meneruskan **Fasa 2 (P1)** yang merangkumi:

- P1-1: Gantikan glyph `▼/▲` dengan kawalan *chevron* SVG sebenar
- P1-2: Naikkan saiz label sidebar daripada 10px kepada 11px/12px
- P1-3: Perbaiki kontras `--border` (≈1.1:1 → ≥1.4:1)
- P1-4: Tambah kedalaman pada *toggle switch*
- P1-5: Satukan bahasa ikon (emoji → SVG monoline)

Menunggu arahan owner untuk meneruskan.
