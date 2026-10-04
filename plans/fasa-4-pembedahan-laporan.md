# Laporan Pembedahan Fasa 4 — Kemasan & Polish Apple HIG

**Tarikh:** 2026-10-04
**Skop:** Fasa 4 (P3) daripada [`plans/apple-hig-audit-report.md`](plans/apple-hig-audit-report.md)
**Status:** ✅ **SELESAI** — keempat-empat item P3 telah dilaksanakan dan disahkan secara langsung.

---

## 1. Ringkasan Eksekutif

Fasa 4 adalah fasa kemasan terakhir yang menutup empat item polish tahap rendah (P3) untuk menyempurnakan audit Apple HIG:

| Item | Isu | Status |
|------|-----|--------|
| **P3-1** | Modal close menggunakan `&times;` teks | ✅ Selesai |
| **P3-2** | Tiada `prefers-reduced-transparency` fallback | ✅ Selesai |
| **P3-3** | Emoji hati dalam footer | ✅ Selesai |
| **P3-4** | Install URL box tiada `aria-live` | ✅ Selesai |

Semua perubahan adalah **presentation-only** — tiada *JS hook* diubah.

---

## 2. Perincian Pembedahan

### P3-1: SVG × Menggantikan `&times;`

**Fail:** [`public/partials/overlays.html`](public/partials/overlays.html)

7 lokasi `&times;` digantikan dengan SVG × monoline (16px, stroke 2px, `currentColor`, `aria-hidden="true"`):

| Lokasi | Elemen |
|--------|--------|
| `closeInstructionsBtn` | `<button class="modal-close">` |
| `closeSubToolboxBtn` | `<div class="modal-close">` |
| `closeBulkImportBtn` | `<div class="modal-close">` |
| `closeResetConfirmBtn` | `<div class="modal-close">` |
| `close-vault` (Token Vault) | `<button class="token-vault-close">` |
| `close-creator` (Add Profile) | `<button class="token-vault-close">` |
| `cancel` (Override) | `<button class="token-vault-close">` |

**Prinsip Apple HIG:** Ikon mesti konsisten — SVG monoline selaras dengan ikon kad dan *chevron* sedia ada.

---

### P3-2: `prefers-reduced-transparency` Fallback

**Fail:** [`public/css/subfaber-theme.css`](public/css/subfaber-theme.css)

Ditambah blok `@media (prefers-reduced-transparency: reduce)`:
```css
.app-navbar,
.app-mobile-header {
    backdrop-filter: none !important;
    -webkit-backdrop-filter: none !important;
    background: var(--surface) !important;
}
```

**Prinsip Apple HIG Accessibility:** Menghormati tetapan Reduce Transparency pengguna dengan menggantikan *frosted glass* dengan permukaan legap.

---

### P3-3: SVG Heart dalam Footer

**Fail:** [`locales/en.json`](locales/en.json), [`locales/ar.json`](locales/ar.json), [`locales/es.json`](locales/es.json), [`locales/pt-br.json`](locales/pt-br.json), [`locales/pt-pt.json`](locales/pt-pt.json), [`public/partials/footer.html`](public/partials/footer.html)

**Penemuan kritikal:** Sistem i18n SubFaber menggantikan kandungan `.footer-heart` dengan teks dari fail locale, bukan dari HTML asal. Oleh itu, perubahan dalam [`footer.html`](public/partials/footer.html) sahaja tidak mencukupi — semua 5 fail locale perlu dikemas kini.

| Fail | Sebelum | Selepas |
|------|---------|---------|
| `en.json` | `❤️` | SVG hati (14px, `fill="currentColor"`) |
| `ar.json` | `❤️` | SVG hati (sama) |
| `es.json` | `❤️` | SVG hati (sama) |
| `pt-br.json` | `❤️` | SVG hati (sama) |
| `pt-pt.json` | `❤️` | SVG hati (sama) |
| `footer.html` | `&#10084;&#65039;` | SVG hati (sama) |

**Prinsip Apple HIG:** Satu gaya ikon konsisten merentas semua bahasa.

---

### P3-4: `aria-live="polite"` pada Install URL Box

**Fail:** [`public/partials/main.html`](public/partials/main.html)

| Sebelum | Selepas |
|---------|---------|
| `<div class="install-url-box" id="installUrlBox" hidden aria-hidden="true">` | `<div class="install-url-box" id="installUrlBox" hidden aria-hidden="true" aria-live="polite">` |

**Prinsip Apple HIG Accessibility:** Perubahan dinamik (URL install muncul selepas Save) mesti diumumkan kepada pembaca skrin.

---

## 3. Pengesahan

### 3.1 Pengesahan Programmatik (Live DOM)

| Item | Metrik | Keputusan |
|------|--------|-----------|
| P3-1 | `.modal-close svg` exists | `true` ✅ |
| P3-2 | `prefers-reduced-transparency` MQ | `true` ✅ |
| P3-3 | `.footer-heart svg` exists | `true` ✅ |
| P3-3 | `.footer-heart` innerHTML | `<svg width="14" height="14" viewBox="0 0 24 24"...` ✅ |
| P3-4 | `#installUrlBox` aria-live | `"polite"` ✅ |

### 3.2 Bukti Visual

| Fail | Penerangan |
|------|------------|
| [`p3-phase4-verification.png`](.playwright-mcp/p3-phase4-verification.png) | Halaman Configure dengan semua pembetulan Fasa 4 aktif |

---

## 4. Nota Teknikal

### Penemuan i18n Override

Semasa pengesahan P3-3, saya menemui bahawa sistem i18n SubFaber menggunakan `data-i18n` + `data-i18n-attr="innerHTML"` untuk menggantikan kandungan DOM dengan teks dari fail locale JSON. Ini bermakna:

1. Perubahan dalam fail HTML partial sahaja tidak mencukupi untuk elemen yang mempunyai `data-i18n`.
2. Fail locale JSON adalah sumber kebenaran (*source of truth*) untuk kandungan teks.
3. P3-3 memerlukan perubahan dalam **6 fail** (1 HTML + 5 JSON), bukan hanya 1.

Ini adalah pengajaran penting untuk Fasa 5+ atau audit masa depan: sentiasa semak sama ada elemen mempunyai `data-i18n` sebelum mengubah HTML.

### Template Caching Node.js

[`configurePageGenerator.js:80`](src/utils/configurePageGenerator.js:80) menggunakan `const CACHED_CONFIGURE_PAGE = renderConfigurePage()` — template diproses sekali semasa modul dimuat dan disimpan dalam pembolehubah global. Oleh itu, **restart proses Node.js adalah wajib** untuk melihat perubahan partial, bukan hanya *hard reload* pelayar.

---

## 5. Kesimpulan Audit Apple HIG

Dengan selesainya Fasa 4, **kesemua 17 penemuan** daripada audit Apple HIG telah ditangani:

| Fasa | Item | Status |
|------|------|--------|
| Fasa 1 (P0) | 3 | ✅ Selesai |
| Fasa 2 (P1) | 5 | ✅ Selesai |
| Fasa 3 (P2) | 5 | ✅ Selesai |
| Fasa 4 (P3) | 4 | ✅ Selesai |

**Jumlah: 17/17 (100%)**

SubFaber kini memenuhi standard Apple HIG untuk:
- **Accessibility** (44pt hit targets, focus-visible, aria-live, prefers-contrast, prefers-reduced-transparency)
- **Consistency** (satu gaya ikon SVG monoline, chevron controls, toggle switches)
- **Feedback** (spring motion curves, tactile hover/press, press states)
- **Deference** (tiada decorative bounce, calm canvas)
- **Clarity** (border contrast ≥1.4:1, label 11px+)

Laporan audit asal: [`plans/apple-hig-audit-report.md`](plans/apple-hig-audit-report.md)
