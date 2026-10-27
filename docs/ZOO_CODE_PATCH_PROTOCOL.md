# ZOO CODE PATCH PROTOCOL — Single-Mode Lock (fullstack)

> **Status:** Operational tool of the SubFaber project.
> **Script:** [`scripts/patch-zoo-code.js`](../scripts/patch-zoo-code.js)
> **Applies to:** Zoo Code VS Code extension (`zoocodeorganization.zoo-code-*`), verified against v3.88.0, v3.90.0 and v3.92.0; single-mode re-patch verified against v3.92.0 on 2026-10-27.
> **Authority basis:** `.roo/rules/00-subfaber-core-protocol.md` — [CLOSED SINGLE-MODE UNIVERSE & ANTI-MODE-JUMPING LOCK].

## 1. Tujuan

Repositori SubFaber beroperasi secara **tertutup dengan 1 mod sahaja** — `fullstack` (`Fullstack Architect`). Mod bawaan Zoo Code (`architect`, `code`, `ask`, `debug`, `orchestrator`) dan mod projek bersara (`backend`, `frontend`) adalah TERLARANG dan perlu dibuang daripada sambungan setiap kali ia dipasang atau dikemas kini. Protokol ini mengabadikan kaedah pembedahan (surgical patch) supaya boleh diulang dengan satu arahan.

## 2. Punca Seni Bina (Mengapa Perlu Dua Patch)

Zoo Code mempunyai **DUA salinan tatasusunan mod** dalam dua runtime berbeza:

| Runtime | Fail | Pemboleh ubah | Gaya string | Kegunaan |
|---|---|---|---|---|
| **Node.js Extension Host** | `dist/extension.js` | `xV=[{slug:"architect",...}]` (3.88.0) / `e6=[{slug:"architect",...}]` (3.90.0) — **nama pemboleh ubah auto-dikesan oleh skrip** | double-quote `"` | Logik mod, `switch_mode`, default mode slug |
| **React Webview UI** | `webview-ui/build/assets/index.js` | `oa=[{slug:\`architect\`,...}]` | backtick `` ` `` | **Dropdown UI pemilih mod** |

**Perangkap yang telah ditemui (insiden 2026-10-17):** Patch pada `dist/extension.js` sahaja TIDAK mencukupi — dropdown UI masih memaparkan 5 mod bawaan bertanda "DO NOT USE. DEPRECATED." kerana Webview membaca salinannya sendiri. **Kedua-dua bundle mesti dipatch.**

**Perangkap kedua (insiden 2026-10-19, Zoo Code v3.90.0):** Minifier menukar nama pemboleh ubah host bundle antara versi (`xV` → `e6`), menyebabkan skrip lama hard-coded `xV` gagal dengan `marker-not-found`. Skrip kini AUTO-DETECT nama pemboleh ubah melalui analisis assignment `identifier=[` sebelum tatasusunan mod — tiada lagi hard-coded variable name.

Nota tambahan:
- Default mode slug dalam host bundle adalah dinamik (`hs=Xd[0].slug` di mana `Xd=xV`) — selepas patch, default automatik menjadi `fullstack` (elemen pertama). Tiada patch berasingan diperlukan.
- `assets/marketplace/modes.yml` hanya mengandungi mod marketplace contoh (mode-writer, skill-writer, dll.) — BUKAN mod bawaan, tidak perlu disentuh.
- Cache VS Code `globalState` / `state.vscdb` **tidak** menyimpan senarai mod Zoo Code — isu dropdown bukan punca cache.

## 3. Cara Menjalankan

```bash
# Semak status sahaja (tiada penulisan):
node scripts/patch-zoo-code.js --check

# Patch sebenar:
node scripts/patch-zoo-code.js
```

Skrip akan:
1. **Auto-discover** folder `~/.vscode/extensions/zoocodeorganization.zoo-code-*` dan pilih versi tertinggi (jika beberapa versi dipasang).
2. Cipta sandaran `.bak` bagi setiap bundle **sekali sahaja** (tidak ditulis semula jika sudah wujud).
3. Bracket-matching sedar string/backtick untuk mengesan julat tepat tatasusunan (koma dalam `roleDefinition` template-literal tidak boleh menyebabkan false match).
4. Gantikan kedua-dua tatasusunan dengan definisi satu-mod `fullstack` (`Fullstack Architect`, `groups:["read","edit","command","mcp"]`). Input bundle asal mahupun patch dua-mod lama dikesan secara automatik.
5. Sahkan integriti sintaks kedua-dua fail menggunakan `node --check` dan imbas sisa definisi mod bawaan serta `backend`/`frontend`.

**Selepas patch:** mulakan semula (restart) VS Code sepenuhnya — reload window sahaja tidak memadai kerana Webview perlu dibina semula.

## 4. Mematikan Auto-Update Zoo Code di VS Code

Kemas kini automatik akan memulihkan bundle asal dan melenyapkan patch. Matikan seperti berikut:

1. Buka Command Palette (`Ctrl+Shift+P`) → **Extensions: Show Installed Extensions**.
2. Cari **Zoo Code** → klik ikon gear ⚙️ → **Extension Settings**.
3. ATAU lebih terus: **Disable Auto Update untuk sambungan ini** — dalam VS Code terbaru, klik menu `...` pada kad sambungan → **Disable Auto Update**.
4. Alternatif global dalam `settings.json`:
   ```jsonc
   "extensions.autoUpdate": false,
   // atau kecualikan Zoo Code sahaja (VS Code 1.90+):
   "extensions.autoUpdateExceptions": ["zoocodeorganization.zoo-code"]
   ```

Jika kemas kini berlaku juga: jalankan semula `node scripts/patch-zoo-code.js` dan restart VS Code.

## 5. Prosedur Selepas Kemas Kini Versi Baru

1. `node scripts/patch-zoo-code.js --check` — jika marker tidak ditemui (status `marker-not-found`), minifier mungkin menukar nama pemboleh ubah dalam versi baharu; audit manual diperlukan (cari `slug:"architect"`, `slug:"backend"` atau varian backtick yang sepadan dalam kedua-dua bundle).
2. `node scripts/patch-zoo-code.js`.
3. Restart penuh VS Code.
4. Sahkan dropdown Zoo Code hanya memaparkan **Fullstack Architect**.

## 6. Rollback

Setiap patch menyimpan salinan asal dalam direktori yang sama:
- `dist/extension.js.bak`
- `webview-ui/build/assets/index.js.bak`

Untuk rollback: salin semula `.bak` ke nama fail asal dan restart VS Code.
