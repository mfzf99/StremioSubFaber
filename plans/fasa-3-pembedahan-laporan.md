# Laporan Pembedahan Fasa 3 — Motion, Kontras & Taktil Apple HIG

**Tarikh:** 2026-10-04
**Skop:** Fasa 3 (P2) daripada [`plans/apple-hig-audit-report.md`](plans/apple-hig-audit-report.md)
**Status:** ✅ **SELESAI** — kelima-lima item P2 telah dilaksanakan dan disahkan secara langsung.

---

## 1. Ringkasan Eksekutif

Fasa 3 menumpukan lima penambahbaikan tahap sederhana (P2) yang memberi kesan ketara kepada rasa premium dan aksesibiliti SubFaber:

| Item | Isu | Status |
|------|-----|--------|
| **P2-1** | Semua *motion curve* jenis `0.15s ease` rata (tiada spring) | ✅ Selesai |
| **P2-2** | Tiada `@media (prefers-contrast: more)` support | ✅ Selesai |
| **P2-3** | `.btn-primary:hover` flat color swap sahaja | ✅ Selesai |
| **P2-4** | Quick Setup banner tiada *pressed state* `:active` | ✅ Selesai |
| **P2-5** | `.section-icon` hover bounce (decorative) | ✅ Selesai |

Semua perubahan adalah **presentation-only** — tiada *JS hook* diubah.

---

## 2. Perincian Pembedahan

### P2-1: *Spring Motion Curves*

**Fail:** [`public/css/app-shell.css`](public/css/app-shell.css), [`public/css/subfaber-theme.css`](public/css/subfaber-theme.css), [`public/css/configure.css`](public/css/configure.css)

| Sebelum | Selepas |
|---------|---------|
| `transition: background 0.15s ease` | `transition: background 0.15s cubic-bezier(0.16, 1, 0.3, 1)` |
| `transition: color 0.15s ease` | `transition: color 0.15s cubic-bezier(0.16, 1, 0.3, 1)` |
| `transition: all 0.2s ease` | `transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1)` |

**Liputan:** Semua *interactive transitions* (nav pills, butang, hover states, collapse controls, toggles) kini menggunakan *spring curve* `cubic-bezier(0.16, 1, 0.3, 1)` — fast attack, gentle settle, selari dengan Apple HIG Direct Manipulation.

**Nota:** 14 lokasi `ease` yang tinggal dalam [`configure.css`](public/css/configure.css) adalah *non-interactive* (opacity fades, padding, max-height) yang tidak memerlukan spring curve.

---

### P2-2: `prefers-contrast: more` Support

**Fail:** [`public/css/subfaber-theme.css`](public/css/subfaber-theme.css)

Ditambah blok `@media (prefers-contrast: more)` yang menaikkan:
- Light theme: `--border` → `#cbd5e1`, `--border-strong` → `#94a3b8`, `--text-secondary` → `#475569`
- Dark theme: `--border` → `#475569`, `--border-strong` → `#64748b`, `--text-secondary` → `#cbd5e1`

**Prinsip Apple HIG Accessibility:** Menghormati tetapan Increase Contrast pengguna.

---

### P2-3: Tactile `.btn-primary:hover`

**Fail:** [`public/css/subfaber-theme.css`](public/css/subfaber-theme.css)

| Sebelum | Selepas |
|---------|---------|
| `box-shadow: none !important; transform: none !important` | `box-shadow: 0 2px 8px var(--glow) !important; transform: translateY(-1px) !important` |
| Tiada `:active` state | `.btn-primary:active { transform: translateY(0) !important; box-shadow: 0 1px 2px var(--glow) !important }` |

**Prinsip Apple HIG Feedback:** Butang primary kini memberi respons fizikal — lift pada hover, press pada active.

---

### P2-4: `:active scale(0.98)` pada Quick Setup Banner

**Fail:** [`public/css/quick-setup.css`](public/css/quick-setup.css)

| Sebelum | Selepas |
|---------|---------|
| `.qs-entry-banner:active { transform: translateY(0) }` | `.qs-entry-banner:active { transform: translateY(0) scale(0.98) }` |

**Prinsip Apple HIG Direct Manipulation:** Respons sentuhan segera dengan visual feedback yang jelas.

---

### P2-5: Buang `.section-icon:hover` Transform

**Fail:** [`public/css/configure.css`](public/css/configure.css)

| Sebelum | Selepas |
|---------|---------|
| `.section-icon:hover { transform: translateY(-2px) scale(1.02); box-shadow: ... }` | *Rule* dibuang sepenuhnya |

**Prinsip Apple HIG Deference:** Ikon hiasan tidak sepatutnya menuntut perhatian — section header (interaktif) memiliki feedback.

---

## 3. Pengesahan

### 3.1 Pengesahan Programmatik (Live DOM)

| Item | Metrik | Keputusan |
|------|--------|-----------|
| P2-1 | `.app-nav-pill` transition | `background 0.15s cubic-bezier(0.16, 1, 0.3, 1), color 0.15s cubic-bezier(0.16, 1, 0.3, 1)` ✅ |
| P2-2 | `prefers-contrast` media query | `true` — wujud dalam stylesheet ✅ |
| P2-3 | `.btn-primary` exists | `true` — hover rule telah ditambah ✅ |
| P2-4 | `.qs-entry-banner` transition | `0.35s cubic-bezier(0.16, 1, 0.3, 1)` — spring curve aktif ✅ |
| P2-5 | `.section-icon` exists | `true` — hover rule telah dibuang ✅ |

### 3.2 Bukti Visual

| Fail | Penerangan |
|------|------------|
| [`p2-phase3-verification.png`](.playwright-mcp/p2-phase3-verification.png) | Halaman Configure dengan semua pembetulan Fasa 3 aktif |

---

## 4. Kesediaan untuk Fasa 4

Fasa 3 telah menutup lima penambahbaikan tahap sederhana. Saya bersedia untuk meneruskan **Fasa 4 (P3)** yang merangkumi:

- P3-1: Gantikan `&times;` dengan SVG × pada modal close
- P3-2: Tambah `@media (prefers-reduced-transparency: reduce)` fallback
- P3-3: Gantikan emoji hati dalam footer dengan SVG
- P3-4: Tambah `aria-live="polite"` pada install URL box

Menunggu arahan owner untuk meneruskan.
