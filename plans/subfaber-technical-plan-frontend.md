# 🎨 LAPORAN PERANCANGAN TEKNIKAL SUBFABER — BAHAGIAN FRONTEND (KIMI K3)

**Status:** PLANNING MODE — MENUNGGU KELULUSAN. ZERO KOD DIMODIFIKASI.
**Tarikh:** 2026-09-25
**Rujukan Mandat:** Dokumen Taklimat Frontend & Mandat Operasi SubFaber
**Rujukan Backend:** [`plans/subfaber-technical-plan-backend.md`](plans/subfaber-technical-plan-backend.md) (GLM 5.3)

---

## 1. RINGKASAN EKSEKUTIF

Antaramuka SubFaber perlu memaparkan dua anjakan UX: (1) Fasa 0 Pre-Flight yang
memperlihatkan "AI sedang mengkaji skrip", dan (2) Live Parity Monitor yang
membuktikan integriti 1-ke-1 setiap batch secara masa nyata.

**Penemuan kritikal dari audit:** Aplikasi ini **bukan SPA** — setiap halaman
(konfigurasi, File Upload, Toolbox, subtitle-menu) dihasilkan berasingan di pelayan
(*server-generated HTML*). Ini bermakna reka bentuk komponen perlu mematuhi 4
peraturan frontend yang sedia ada: null-check strict, rehydration tanpa layout
shift, i18n `data-i18n`, dan hormati struktur partial yang di-suntik
oleh `init.js`/`config-page-state.js`.

**Keputusan seni bina utama:**
- Toggle SubFaber di-host di konfigurasi utama ([`public/partials/main.html`](../public/partials/main.html)) bersebelahan `enableBatchContext` — rehydration sedia ada dilanjutkan, bukan ditambah sistem baharu.
- Pre-Flight HUD dan Live Parity Monitor ditempatkan di **halaman File Upload** ([`src/utils/fileUploadPageGenerator.js`](../src/utils/fileUploadPageGenerator.js)) — satu-satunya lokasi yang mempunyai struktur `progress`/`queue`/`result` dan aliran `fetch('/api/translate-file')` sedia ada.
- Payload `onProgress` backend dibawa ke frontend melalui **SSE opt-in pada
  `/api/translate-file`** (infrastruktur SSE sudah wujud di [`index.js:2144`](../index.js:2144) — `wantsSse` guard) — bukan WebSocket, bukan polling. Streaming `partialSRT` yang sedia ada tidak diusik.
- State management: **flat object module-scoped** (sama corak `quick-setup.js`
  dan token-vault dalam `config.js`), **tiada framework** — elak re-render
  bloat dengan targeted DOM update per-batch, bukan re-render keseluruhan.

---

## 2. PETA KOMPONEN UI (HASIL AUDIT MENDALAM)

### 2.1 Komponen Sedia Ada & Peranan Mereka

| Fail | Peranan | Kaitan SubFaber |
|---|---|---|
| [`public/partials/main.html`](../public/partials/main.html) | Partial konfigurasi utama, dimuatkan oleh `init.js` | Host toggle SubFaber (bersebelahan L1411-1422) |
| [`public/config.js`](../public/config.js) | Skrip konfigurasi: rehydration, save, advanced-settings bypass | Daftarkan `subfaberEnabled` dalam load/save state |
| [`src/utils/fileUploadPageGenerator.js`](../src/utils/fileUploadPageGenerator.js) | HTML+CSS+JS halaman File Upload, server-generated | Host Pre-Flight HUD + Live Parity Monitor |
| [`public/css/configure.css`](../public/css/configure.css) | Styles konfigurasi | Warisi corak `.form-group`, `.label-description` |
| [`public/js/config-page-state.js`](../public/js/config-page-state.js) | State partial-loading (`SubMakerConfigPageState`) | Tidak diusik — partial dimuatkan sebelum config.js |
| [`public/js/init.js`](../public/js/init.js) | Suntik partial ke `#app`, fallback jika fetch gagal | Tidak diusik — toggle dalam partial sedia ada |
| [`public/js/quick-setup.js`](../public/js/quick-setup.js) | Wizard quick-setup, state module-scoped | Corak state untuk dijadikan rujukan |

### 2.2 Penemuan Penting dari Analisis

1. **Injection point toggle:** [`main.html:1411-1422`](../public/partials/main.html:1411)
   ialah blok `enableBatchContext` dengan corak `<div class="form-group">` →
   `<label>` → `<input type="checkbox" id="enableBatchContext">` →
   `<span data-i18n>` → `<span class="label-description" data-i18n>`.
   Toggle SubFaber akan meniru corak ini **secara verbatim** supaya
   rehydration, i18n, dan CSS warisan automatik.

2. **Rehydration block:** [`config.js:11523-11535`](../public/config.js:11523)
   memuatkan `enableBatchContext` + `contextSize` dengan corak:
   `const el = document.getElementById('enableBatchContext'); if (el) { el.checked = ... }`.
   Ini adalah corak null-check strict yang dikehendaki peraturan #4
   (`if (!el) return;` bersamaan dengan `if (el) { ... }`). Toggle SubFaber
   akan didaftarkan dalam blok yang sama.

3. **Progress structure File Upload:** [`fileUploadPageGenerator.js:2375-2379`](../src/utils/fileUploadPageGenerator.js:2375)
   mempunyai `#progress` container dengan `.spinner`, `.progress-text`,
   `.progress-subtext`. Queue system (L3643-3691) render `queue-status` per item.
   Live Parity Monitor akan **menggantikan** `.progress-subtext` dengan
   struktur HUD yang lebih kaya, sambil mengekalkan `#progress` container.

4. **SSE sudah wujud:** [`index.js:2144-2146`](../index.js:2144) — guard
   `wantsSse` mengelakkan compression untuk SSE, dan [`index.js:6285-6300`](../index.js:6285)
   menunjukkan corak `res.setHeader('Content-Type', 'text/event-stream')` +
   `res.write('data: ...\n\n')`. `/api/translate-file` (L3954) kini
   `Content-Type: text/plain` — perlu opt-in SSE branch apabila
   `req.headers.accept.includes('text/event-stream')` (sama corak L2837).

5. **Tiada side-by-side preview sedia ada.** Tiada fail dalam `public/`
   yang mempunyai struktur dua panel. Komponen Dwi-Panel adalah **100% baharu**
   — akan dibina sebagai modal/panel dalam File Upload page selepas
   terjemahan selesai, bukan semasa streaming (elak layout shift).

6. **`translationStats` tidak lagi dihantar ke frontend.** Dalam laporan
   backend, `translationStats` dibaca oleh caller (Telegram/Sub Toolbox
   history). Untuk File Upload, `parityRate` dan `verifiedCount` akan dibawa
   dalam payload SSE `onProgress({ phase: 'batch', ... })`, bukan
   dalam `translationStats` global.

---

## 3. WIREFRAME & STRUKTUR DOM

### 3.1 KOMPONEN 1: Suis Pengaktifan SubFaber

**Lokasi:** [`main.html`](../public/partials/main.html), selepas blok
`enableBatchContext` (L1411-1422), sebelum `databaseModeGroup` (L1424).

**Corak DOM (meniru `enableBatchContext` verbatim):**

```html
<div class="form-group">
    <label>
        <input type="checkbox" id="subfaberEnabled">
        <span data-i18n="config.advancedGemini.subfaber.label">Enable SubFaber Engine</span>
        <span class="label-description"
            data-i18n="config.advancedGemini.subfaber.description">
            Netflix-grade semantic context: Pre-Flight Pass + strict slot-boundary
            preservation. Improves translation coherence and guarantees 1:1 sync.
        </span>
    </label>
</div>
```

**Rehydration (config.js, bersebelahan blok L11523-11535):**
- `const subfaberEl = document.getElementById('subfaberEnabled');`
- `if (subfaberEl) subfaberEl.checked = currentConfig.advancedSettings?.subfaberEnabled === true;`
- Save path: tambah `subfaberEnabled: document.getElementById('subfaberEnabled')?.checked === true` dalam objek `advancedSettings` yang dibina untuk `saveConfig()`.

**i18n keys (5 lokal):**
- `config.advancedGemini.subfaber.label`
- `config.advancedGemini.subfaber.description`

### 3.2 KOMPONEN 2: Pre-Flight Semantic HUD

**Lokasi:** Dalam `#progress` container di File Upload page, menggantikan
`.progress-text` + `.progress-subtext` apabila `phase === 'preflight'`.

**Corak DOM (baharu, dalam `#progress`):**

```html
<div class="subfaber-preflight" id="subfaberPreflight" style="display:none;">
  <div class="preflight-status">
    <div class="spinner"></div>
    <div class="preflight-label" id="preflightLabel">
      Analyzing plot & building character profiles...
    </div>
  </div>
  <div class="preflight-result" id="preflightResult" style="display:none;">
    <details class="preflight-summary">
      <summary>Episode Summary</summary>
      <p id="preflightSummaryText"></p>
    </details>
    <div class="preflight-terms" id="preflightTerms"></div>
  </div>
</div>
```

**Tingkah laku:**
- `status === 'running'`: tunjuk `#subfaberPreflight` + `.preflight-status`
  dengan animasi pulse ringan (skeleton). Sembunyikan `.progress-text`.
- `status === 'done'`: sembunyikan `.preflight-status`, tunjuk
  `.preflight-result` — summary dalam `<details>` (expandable), terms dalam
  chips. **Auto-collapse selepas 3 saat** supaya tidak mengganggu aliran
  ke Fasa 1 (batch).
- `status === 'skipped'`: log ke console sahaja, tiada visual.

**Wireframe (desktop):**
```
┌─────────────────────────────────────────────┐
│  ⏳ Analyzing plot & building character...  │  ← running (pulse)
│─────────────────────────────────────────────│
│  ▸ Episode Summary                          │  ← done (details)
│  [Zhuang Xu] [Nie Xiguang] [CP Group]      │  ← terms chips
└─────────────────────────────────────────────┘
```

### 3.3 KOMPONEN 3: Live Parity & Batch Progress Monitor

**Lokasi:** Sama `#progress` container, menggantikan Pre-Flight HUD apabila
`phase === 'batch'`.

**Corak DOM (baharu):**

```html
<div class="subfaber-parity" id="subfaberParity" style="display:none;">
  <div class="parity-badges">
    <span class="badge badge-batch" id="badgeBatch">Batch 2/8</span>
    <span class="badge badge-parity" id="badgeParity">Parity: 50/50</span>
    <span class="badge badge-status" id="badgeStatus">100% Sync</span>
  </div>
  <div class="parity-alert" id="parityAlert" style="display:none;">
    <span class="parity-alert-icon">⚠️</span>
    <span id="parityAlertText">Healing parity slots...</span>
  </div>
</div>
```

**Tingkah laku:**
- Setiap `onProgress({ phase: 'batch', ... })` event: update teks
  `#badgeBatch`, `#badgeParity`, `#badgeStatus` — **textContent sahaja**
  (tiada innerHTML, tiada re-render).
- Jika `verifiedCount !== expectedCount` (mismatch/healing): tunjukkan
  `#parityAlert` dengan amaran lembut, ubah `#badgeStatus` kepada
  warna amber. Sembunyikan semula apabila pariti pulih.
- Bar kemajuan sedia ada (jika ada di masa hadapan) tidak diusik —
  monitor ini adalah **badges, bukan bar** — mengelakkan pertindihan
  dengan struktur `queue-status` sedia ada.

**Wireframe (desktop):**
```
┌─────────────────────────────────────────────┐
│  [Batch 2/8]  [Parity: 50/50]  [100% Sync]  │  ← badges
│  ⚠️ Healing parity slots...                 │  ← alert (jika mismatch)
└─────────────────────────────────────────────┘
```

### 3.4 KOMPONEN 4: Dwi-Panel Semakan (Side-by-Side Diff)

**Lokasi:** Selepas `#result` container di File Upload page, diaktifkan
oleh butang baharu "🔍 Review SubFaber Output" yang muncul selepas
`status === 'completed'`.

**Corak DOM (baharu, modal/panel):**

```html
<div class="subfaber-diff-modal" id="subfaberDiffModal" style="display:none;" role="dialog">
  <div class="diff-modal-content">
    <div class="diff-header">
      <h3>SubFaber Engine: 100% Parity Verified</h3>
      <button class="diff-close" id="diffCloseBtn" aria-label="Close">×</button>
    </div>
    <div class="diff-body">
      <div class="diff-panel diff-source">
        <h4>Original (Source)</h4>
        <pre id="diffSourceText"></pre>
      </div>
      <div class="diff-panel diff-target">
        <h4>SubFaber Translation (Target)</h4>
        <pre id="diffTargetText"></pre>
      </div>
    </div>
  </div>
</div>
```

**Tingkah laku:**
- Panel kiri: teks SRT asal (source) — dimuatkan dari `uploadQueue` job
  sedia ada (`fileContent` yang di-upload).
- Panel kanan: teks SRT terjemahan — dari `translatedContent` response.
- Highlighting: `[br]`, `<i>`, `<b>` dirender dengan warna kontras lembut
  menggunakan CSS `::selection` atau span injection pada `<pre>` content
  (bukan syntax highlighter library — kekalkan zero-dependency).
- Badge pengesahan di header: hanya muncul jika
  `translationStats.subfaberContextUsed === true` dalam response metadata
  (backend perlu sertakan ini dalam response SSE `done` event atau
  dalam header response terakhir).

**Wireframe (desktop):**
```
┌─────────────────────────────────────────────┐
│  SubFaber Engine: 100% Parity Verified  [×] │
│───────────────────────┬─────────────────────│
│  Original (Source)    │  SubFaber (Target)  │
│───────────────────────┼─────────────────────│
│  1                    │  1                  │
│  00:00:01,000 --> ... │  00:00:01,000 -->...│
│  Hello, [br]world.    │  Helo, [br]dunia.   │
│  ...                  │  ...                │
└───────────────────────┴─────────────────────┘
```

---

## 4. STRATEGI PENGURUSAN STATE (ELAK RE-RENDER BLOAT)

### 4.1 Corak State (Module-Scoped Flat Object)

Meniru [`quick-setup.js`](../public/js/quick-setup.js) (L56-77) dan
token-vault dalam [`config.js`](../public/config.js):

```javascript
// Dalam File Upload page script (server-generated, di dalam <script> tag)
const subfaberState = {
  enabled: false,           // dari config.advancedSettings.subfaberEnabled
  preflight: {
    status: 'idle',         // 'idle' | 'running' | 'done' | 'skipped' | 'error'
    summary: '',
    terms: [],
  },
  batch: {
    current: 0,
    total: 0,
    verified: 0,
    expected: 0,
    parityRate: '0%',
    healing: false,
  },
  diff: {
    sourceText: '',
    targetText: '',
  },
};
```

### 4.2 Update Strategy (Targeted, Bukan Re-Render)

| Event | DOM Update | Kos |
|---|---|---|
| `preflight running` | `preflightLabel.textContent = ...` | 1 textContent |
| `preflight done` | `summaryText.textContent`, `terms.innerHTML = chips.map(...)` | 1 innerHTML (kecil) |
| `batch progress` | `badgeBatch.textContent`, `badgeParity.textContent`, `badgeStatus.textContent` | 3 textContent per event |
| `healing` | `parityAlert.style.display = 'block'` | 1 style change |
| `healed` | `parityAlert.style.display = 'none'` | 1 style change |
| `diff open` | `diffSourceText.textContent`, `diffTargetText.textContent` | 2 textContent |

**Peraturan:** Tiada `innerHTML` untuk struktur yang berubah kerap —
hanya `textContent` untuk badges. `innerHTML` hanya untuk chips terms
(satu kali selepas preflight done).

### 4.3 SSE Client Handler

```javascript
// Opt-in SSE: hanya jika subfaberEnabled
const eventSource = new EventSource('/api/translate-file', { /* config */ });
eventSource.addEventListener('message', (e) => {
  const data = JSON.parse(e.data);
  if (data.phase === 'preflight') { /* update preflight state + DOM */ }
  if (data.phase === 'batch') { /* update batch state + DOM */ }
});
eventSource.addEventListener('done', () => { eventSource.close(); });
```

**Catatan:** `EventSource` hanya untuk GET. Untuk POST `/api/translate-file`,
gunakan `fetch` dengan `Accept: text/event-stream` dan `ReadableStream`
reader (corak yang sama digunakan oleh streaming sedia ada di
[`index.js:6226`](../index.js:6226)). Ini adalah perincian pelaksanaan
yang akan disahkan semasa fasa kod.

---

## 5. PELAN RESPONSIF

### 5.1 Breakpoints (Meniru Corak Sedia Ada)

Merujuk [`fileUploadPageGenerator.js`](../src/utils/fileUploadPageGenerator.js)
dan [`configure.css`](../public/css/configure.css), breakpoints sedia ada:
- Mobile: `< 768px`
- Desktop: `>= 768px`

### 5.2 Pre-Flight HUD & Parity Monitor

**Mobile (< 768px):**
- Badges wrap ke baris baharu (flex-wrap).
- Font size badges: `0.75rem` (lebih kecil).
- Alert mengambil lebar penuh.

**Desktop (>= 768px):**
- Badges inline, satu baris.
- Font size badges: `0.875rem`.

### 5.3 Dwi-Panel Semakan

**Mobile (< 768px):**
- Tukar kepada **tab view**: butang "Original" / "Translation" di atas,
  satu panel aktif pada satu masa. Mengelakkan scroll mendatar.
- `.diff-body { flex-direction: column; }`

**Desktop (>= 768px):**
- Side-by-side dua panel, `.diff-body { flex-direction: row; }`
- Setiap panel `max-width: 50%`, `overflow-x: auto` untuk baris panjang.

### 5.4 Animasi

- Pre-Flight pulse: `@keyframes subfaber-pulse` dengan
  `prefers-reduced-motion: reduce` fallback (tiada animasi).
- Badge transition: `transition: background-color 0.2s ease` sahaja —
  tiada transform yang menyebabkan layout shift.

---

## 6. PELAN PEMBEDAHAN FAIL (SURGICAL PLAN)

### 6.1 Fail yang Diubahsuai

| Fail | Pembedahan | Risiko |
|---|---|---|
| [`public/partials/main.html`](../public/partials/main.html) | Tambah toggle SubFaber (corak verbatim `enableBatchContext`) | Minimal — partial, tiada JS |
| [`public/config.js`](../public/config.js) | Daftar `subfaberEnabled` dalam load (bersebelahan L11523) + save path | Rendah — corak null-check sedia ada |
| [`src/utils/fileUploadPageGenerator.js`](../src/utils/fileUploadPageGenerator.js) | Tambah DOM Pre-Flight HUD + Parity Monitor + Dwi-Panel + CSS + SSE client handler | Sederhana — fail besar, perlu hati-hati |
| [`locales/en.json`](../locales/en.json) | Tambah i18n keys `config.advancedGemini.subfaber.*` | Minimal |
| [`locales/es.json`](../locales/es.json), [`locales/pt-br.json`](../locales/pt-br.json), [`locales/pt-pt.json`](../locales/pt-pt.json), [`locales/ar.json`](../locales/ar.json) | Terjemahan i18n keys | Minimal |

### 6.2 Fail yang TIDAK Diubahsuai (Dikekalkan)

| Fail | Sebab |
|---|---|
| [`public/js/init.js`](../public/js/init.js) | Partial loading sedia ada — toggle dalam partial dimuatkan automatik |
| [`public/js/config-page-state.js`](../public/js/config-page-state.js) | State partial sedia ada — tiada perubahan struktur |
| [`public/css/configure.css`](../public/css/configure.css) | Toggle warisi corak `.form-group` sedia ada — tiada CSS baharu perlu untuk toggle |
| [`public/js/subtitle-menu.js`](../public/js/subtitle-menu.js) | SubFaber tidak menyentuh subtitle-menu (Skop: File Upload sahaja) |
| [`public/js/quick-setup.js`](../public/js/quick-setup.js) | Corak state dijadikan rujukan sahaja, tiada perubahan |

### 6.3 Urutan Pelaksanaan (Selepas Kelulusan)

1. i18n keys dalam 5 fail lokal — hari 1
2. Toggle dalam [`main.html`](../public/partials/main.html) + rehydration/save dalam [`config.js`](../public/config.js) — hari 1
3. CSS baharu dalam [`fileUploadPageGenerator.js`](../src/utils/fileUploadPageGenerator.js) (Pre-Flight, Parity, Diff) — hari 1-2
4. DOM structure + SSE client handler dalam [`fileUploadPageGenerator.js`](../src/utils/fileUploadPageGenerator.js) — hari 2
5. Backend SSE branch dalam [`index.js`](../index.js) `/api/translate-file` — hari 2 (koordinasi dengan GLM 5.3)
6. Ujian manual: toggle rehydration, preflight HUD, parity badges, diff modal — hari 3
7. Responsif: mobile tab view, reduced-motion — hari 3

---

## 7. RISIKO & MITIGASI

| Risiko | Tahap | Mitigasi |
|---|---|---|
| SSE tidak disokong oleh semua pelayar (IE11) | Rendah | Fallback ke `text/plain` response sedia ada — HUD hanya muncul jika SSE aktif |
| Layout shift apabila HUD muncul/sembunyi | Sederhana | HUD berada dalam `#progress` container yang sudah `display: none`/`block` — tiada shift baharu |
| `innerHTML` injection untuk chips terms | Sederhana | Sanitize `term.src`, `term.tgt`, `term.note` dengan `escapeHtml` sedia ada dalam generator |
| Dwi-Panel memori besar untuk fail SRT besar | Rendah | Hadkan kepada 200 baris pertama (truncate dengan nota "showing first 200 entries") |
| i18n keys hilang dalam lokal selain EN | Rendah | Fallback ke EN keys — corak `data-i18n` sedia ada mengendalikan ini |
| Konflik SSE dengan streaming `partialSRT` | Sederhana | SSE adalah opt-in terpisah; `partialSRT` streaming kekal melalui `text/plain` untuk keserasian |

---

## 8. KOORDINASI DENGAN GLM 5.3 (BACKEND)

Perkara yang perlu disahkan oleh backend semasa pelaksanaan:

1. **SSE branch dalam `/api/translate-file`:** Apabila
   `req.headers.accept.includes('text/event-stream')`, response perlu
   `Content-Type: text/event-stream` dan emit events:
   - `data: {"phase":"preflight","status":"running"}\n\n`
   - `data: {"phase":"preflight","status":"done","summary":"...","terms":[...]}\n\n`
   - `data: {"phase":"batch","currentBatch":N,"totalBatches":M,"verifiedCount":V,"expectedCount":E}\n\n`
   - `event: done\ndata: {"translationStats":{...}}\n\n`
2. **`translationStats.subfaberContextUsed`** perlu disertakan dalam
   `done` event untuk badge Dwi-Panel.
3. **`subfaberEnabled`** perlu dibaca dari `advancedSettings` dalam
   config yang di-resolve oleh `resolveConfigGuarded` — tiada perubahan
   API contract diperlukan.

---

**LAPORAN SELESAI — MENUNGGU KELULUSAN PENUH SEBELUM KERJA PENGKODAN DIMULAKAN.**
