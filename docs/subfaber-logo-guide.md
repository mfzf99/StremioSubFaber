# SubFaber "S" Mark — Logo Usage Guide

## Sumber Rujukan

| Item | Detail |
|---|---|
| Logo asal | Rootsys "R" mark — [`/rootsys-mark-v2.png`](https://rootsys.cloud/rootsys-mark-v2.png) |
| Format asal | PNG 128×128, rendered 28×28 dalam sidebar Rootsys dashboard |
| Style | iOS app-icon squircle (rounded ~28% radius) + bold geometric monogram |
| Warna | dark navy `#1C2734` (1,818 px), blue `#0E7CE7` (922 px), white bg |

## Fail yang Dihasilkan

| Fail | Variasi | Bila Guna |
|---|---|---|
| [`public/assets/subfaber-mark-v2.svg`](../public/assets/subfaber-mark-v2.svg) | **Dengan squircle putih** (app-icon style, sama macam Rootsys) | Logo utama sidebar, app icons, favicon, PWA icons, light theme |
| [`public/assets/subfaber-mark-v2-transparent.svg`](../public/assets/subfaber-mark-v2-transparent.svg) | **Transparent bg** (tiada squircle) | Dark theme sidebar, overlay pada warna gelap, avatar/profile |
| [`public/assets/rootsys-mark-v2.png`](../public/assets/rootsys-mark-v2.png) | Rujukan asal Rootsys "R" | Perbandingan/benchmark sahaja |

## Cara Guna

### HTML (sidebar/nav)
```html
<img src="/assets/subfaber-mark-v2.svg" alt="SubFaber" width="28" height="28">
```

### Dark theme (transparent variant)
```html
<img src="/assets/subfaber-mark-v2-transparent.svg" alt="SubFaber" width="28" height="28">
```

### Favicon
```html
<link rel="icon" type="image/svg+xml" href="/assets/subfaber-mark-v2.svg">
```

### CSS background
```css
.brand-logo {
  background: url('/assets/subfaber-mark-v2.svg') center/contain no-repeat;
  width: 28px;
  height: 28px;
}
```

## Spesifikasi Teknikal

- **ViewBox:** `0 0 128 128` — skala bebas (SVG vektor, tajam pada mana-mana saiz)
- **Squircle radius:** `rx="32"` (25% daripada 128 — sama dengan Rootsys)
- **Stroke monogram:** 12px (sama dengan R mark)
- **Blue diagonal:** 45°, dari inner-mid S ke bawah-kanan (sama angle dengan R)
- **Warna:** `#1C2734` (dark navy), `#0E7CE7` (blue), `#FFFFFF` (bg/notch cuts)

## Kenapa "S" dan bukan "R"

Rootsys guna "R" untuk nama mereka. SubFaber guna "S" — huruf pertama nama kita. Geometri dibina semula dengan DNA yang sama (bars + curves + notch cuts + blue diagonal) supaya style family sepadan tapi identiti sendiri jelas.

---

*Dicipta 3 Okt 2026. Rujukan: audit langsung Rootsys buyer dashboard melalui Playwright MCP.*
