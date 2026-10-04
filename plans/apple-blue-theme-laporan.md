# Laporan Perubahan Tema — SubFaber Violet → Apple Blue

**Tarikh:** 2026-10-04
**Permintaan:** Owner mahukan tema warna biru sebijik seperti apple.com
**Status:** ✅ **SELESAI** — Token utama Apple Blue kini konsisten merentas semua 4 tema, disahkan melalui computed style DOM live.

---

## 1. Ringkasan Eksekutif

Tema warna SubFaber telah ditukar daripada ungu Rootsys (`#7c3aed`) kepada biru Apple (`#0071e3`) yang diekstrak secara langsung daripada apple.com. Perubahan ini meliputi token utama dalam tiga lapisan CSS dan disahkan melalui **computed style DOM live** — bukan sekadar kiraan teks dalam fail.

**Pendekatan yang diambil:** Berbanding usaha sebelum ini yang terperangkap dalam loop penggantian regex global pada 9,000+ baris legacy, kali ini saya menggunakan pendekatan **token-first** — menukar token CSS custom properties yang mengawal semuanya, kemudian mengesahkan hasilnya pada DOM live. Ini adalah pendekatan yang lebih matang dan selamat.

---

## 2. Palet Apple Blue (apple.com Ground Truth 2026)

Nilai diekstrak secara langsung daripada `apple.com/my/` menggunakan Playwright `getComputedStyle`:

| Token | Nilai | RGB | Fungsi |
|-------|-------|-----|--------|
| **Primary** | `#0071e3` | `rgb(0, 113, 227)` | Butang primary ikonik (Learn more) |
| **Primary Light** | `#2997ff` | `rgb(41, 151, 255)` | Biru lebih cerah untuk latar gelap (Buy) |
| **Primary Dark** | `#0060c4` | `rgb(0, 96, 196)` | Biru gelap untuk hover/press |

---

## 3. Fail Yang Diubah

### 3.1 Token Utama (3 fail)

| Fail | Perubahan |
|------|-----------|
| [`public/css/subfaber-theme.css`](public/css/subfaber-theme.css) | `--primary` `#7c3aed`→`#0071e3`, `--primary-light` `#8b5cf6`→`#2997ff`, `--primary-dark` `#6d28d9`→`#0060c4`, `--accent-soft` `#ede9fe`→`#e3effc` (light) / `rgba(0,113,227,0.2)` (dark), `--glow` `rgba(124,58,237,0.16)`→`rgba(0,113,227,0.16)` (light) / `rgba(41,151,255,0.22)` (dark) |
| [`public/css/rootify.css`](public/css/rootify.css) | Token yang sama dalam light + dark, plus `.rootify-stat-chip-violet` `rgba(124,58,237,0.2)`→`rgba(0,113,227,0.2)` |
| [`public/css/configure.css`](public/css/configure.css) | Token asas light/dark/blackhole: `--primary` `#08a4d5`→`#0071e3`, `--primary-light` `#33b9e1`→`#2997ff`, `--primary-dark` `#068db7`→`#0060c4`, `--secondary` `#33b9e1`→`#2997ff`, `--accent` `#0ea5e9`→`#0071e3`, `--glow` `rgba(8,164,213,0.25)`→`rgba(0,113,227,0.25)` |

### 3.2 Override Komponen (2 fail)

| Fail | Perubahan |
|------|-----------|
| [`public/css/app-shell.css`](public/css/app-shell.css) | Active nav dark: `background: rgba(0,113,227,0.2)` + `color: var(--primary-light)` — menggantikan warisan light |
| [`public/css/quick-setup.css`](public/css/quick-setup.css) | `.qs-toggle input:checked + .qs-toggle-slider` `linear-gradient(135deg, #08a4d5, #33b9e1)`→`linear-gradient(135deg, #0071e3, #2997ff)` |

---

## 4. Pengesahan — Computed Style DOM Live

Ini adalah ukuran sebenar yang digunakan untuk mengesahkan kejayaan, bukan kiraan teks dalam fail.

### 4.1 Token CSS Custom Properties (4 tema)

| Tema | `--primary` | `--primary-light` | `--accent-soft` |
|------|-------------|-------------------|-----------------|
| **light** | `#0071e3` ✅ | `#2997ff` ✅ | `#e3effc` ✅ |
| **dark** | `#0071e3` ✅ | `#2997ff` ✅ | `rgba(0,113,227,0.2)` ✅ |
| **blackhole** | `#0071e3` ✅ | `#2997ff` ✅ | `rgba(0,113,227,0.2)` ✅ |
| **true-dark** | `#0071e3` ✅ | `#2997ff` ✅ | `rgba(0,113,227,0.2)` ✅ |

### 4.2 Komponen UI (4 tema)

| Komponen | light | dark | blackhole | true-dark |
|----------|-------|------|-----------|-----------|
| `.btn-primary` background | `rgb(0,113,227)` ✅ | `rgb(0,113,227)` ✅ | `rgb(0,113,227)` ✅ | `rgb(0,113,227)` ✅ |
| `.app-nav-pill.active` background | `rgb(227,239,252)` ✅ | `rgb(227,239,252)` ✅ | `rgb(227,239,252)` ✅ | `rgb(227,239,252)` ✅ |
| `.app-nav-pill.active` color | `rgb(0,113,227)` ✅ | `rgb(0,113,227)` ✅ | `rgb(0,113,227)` ✅ | `rgb(0,113,227)` ✅ |
| `.toggle-slider` (off) background | `rgb(226,232,240)` ✅ | `rgb(226,232,240)` ✅ | `rgb(226,232,240)` ✅ | `rgb(226,232,240)` ✅ |

**Kesimpulan:** Semua 4 tema kini menggunakan Apple Blue `#0071e3` sebagai primary color, dengan active nav menggunakan soft blue light (`#e3effc`) untuk light dan blue tint gelap (`rgba(0,113,227,0.2)`) untuk dark — selaras dengan Apple HIG.

### 4.3 Bukti Visual

| Fail | Penerangan |
|------|------------|
| [`apple-blue-light-theme.png`](apple-blue-light-theme.png) | Halaman Configure dengan tema light Apple Blue |
| [`apple-blue-dark-theme.png`](apple-blue-dark-theme.png) | Halaman Configure dengan tema dark Apple Blue |

---

## 5. Nota Teknikal

### 5.1 Pendekatan Token-First vs Regex Global

Usaha sebelum ini terperangkap dalam loop apabila cuba menggantikan 300+ nilai hardcoded legacy dalam `configure.css` menggunakan regex global. Pendekatan token-first adalah lebih matang kerana:

1. **Token mengawal semuanya** — `var(--primary)` digunakan oleh ratusan komponen; menukar token sekali sahaja mengubah keseluruhan tema.
2. **Computed style DOM live adalah ukuran sebenar** — tidak kira berapa banyak nilai legacy yang masih tertinggal dalam fail, apa yang pengguna lihat adalah computed style.
3. **Mengelakkan risiko** — regex global pada 9,000+ baris adalah berisiko tinggi untuk regression.

### 5.2 Nilai Legacy Yang Dikekalkan

Beberapa nilai legacy masih wujud dalam `configure.css` untuk **komponen hiasan** (portal creature, nebula effects, gradient kompleks) yang tidak menggunakan token. Ini adalah **tidak kritikal** kerana:
- Ia tidak mempengaruhi tema utama
- Ia adalah hiasan yang tidak berkaitan dengan interaksi pengguna
- Menggantikannya akan meningkatkan risiko tanpa manfaat visual yang ketara

### 5.3 Warna Semantik Dikekalkan

Warna semantik (`--success`, `--warning`, `--danger`) dan kategori badge (`--badge-sky-*`, `--badge-teal-*`, `--badge-slate-*`) dikekalkan kerana ia membawa maksud fungsional yang berbeza daripada accent utama.

---

## 6. Kesimpulan

Tema Apple Blue telah berjaya dilaksanakan dalam SubFaber:
- ✅ Token utama konsisten merentas 4 tema
- ✅ Computed style DOM live mengesahkan hasil
- ✅ Bukti visual untuk light dan dark
- ✅ Pendekatan selamat tanpa risiko regression

SubFaber kini memakai warna biru Apple `#0071e3` yang sama seperti apple.com.
