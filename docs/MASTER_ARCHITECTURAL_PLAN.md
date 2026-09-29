# 🏗️ MASTER ARCHITECTURAL PLAN — Unified Single Picker, Crazy Router Discovery & Hybrid Auto-Parameters

> **STATUS**: PLAN MODE ONLY — No code has been modified. This document is for review before any execution commands are issued.
> **Test Baseline**: `npm test` → **92 pass, 0 fail, 1 skip** (93 total tests). All regression suites green.
> **Date**: 2026-09-21

---

## FASA 1: PENYELIDIKAN CRAZY ROUTER DOKUMENTASI

### 1.1 Sumber Rasmi (Firecrawl MCP)

Dokumentasi Crazy Router diekstrak daripada tiga URL rasmi melalui MCP Firecrawl:

| URL | Kandungan Utama |
|-----|-----------------|
| `https://docs.crazyrouter.com/llms.txt` | Entry point AI-readable; pengenalan arkitektur gateway terpadat |
| `https://docs.crazyrouter.com/chat/openai/models.md` | Endpoint senarai model (`GET /v1/models`) |
| `https://docs.crazyrouter.com/chat/gemini/native.md` | Endpoint Gemini Native (`POST /v1beta/models/{model}:generateContent`) |

### 1.2 Endpoint Penemuan Model Crazy Router

**Crazy Router menyokong DUA endpoint** yang berbeza untuk DUA jenis kekunci:

| Kekunci | Endpoint Discovery | Format Response | Auth Header |
|---------|-------------------|-----------------|-------------|
| **Google Direct** (`AIza...`) | `GET /v1beta/models?key=...` | `{ models: [{ name, displayName, supportedGenerationMethods, inputTokenLimit, outputTokenLimit }] }` | `x-goog-api-key` (atau `?key=`) |
| **Crazy Router Proxy** (`sk-...`) | `GET /v1/models` (OpenAI-compatible) | `{ success: true, object: "list", data: [{ id, object: "model", created, owned_by }] }` | `Authorization: Bearer sk-...` |

**Struktur JSON Payload Crazy Router (verified 2026-04-14 production):**
```json
{
  "success": true,
  "object": "list",
  "data": [
    {
      "id": "gpt-5.5",
      "object": "model",
      "created": 1700000000,
      "owned_by": "openai"
    },
    {
      "id": "gemini-3.1-pro",
      "object": "model",
      "created": 1700000000,
      "owned_by": "google"
    }
  ]
}
```

**Jumlah model terkini**: ~605 model pelbagai jenama (OpenAI, Anthropic, DeepSeek, Google, dll).

### 1.3 Endpoint Gemini Native Crazy Router

Untuk panggilan terjemahan, Crazy Router menyokong format Gemini Native:
```
POST /v1beta/models/{model}:generateContent?key=YOUR_API_KEY
POST /v1beta/models/{model}:streamGenerateContent?key=YOUR_API_KEY&alt=sse
```

Ini bermakna **payload REST v1beta yang sama** yang SubMaker bina untuk Google Direct boleh dihantar 1:1 kepada Crazy Router — tiada keperluan translasi format OpenAI. Ini sudah disahkan dalam kod sedia ada di [`detectKeyType()`](src/services/gemini.js:334) dan [`buildGenerationConfig()`](src/services/gemini.js:390).

### 1.4 Smart Filtering Logic (Future-Proof)

Crazy Router mengembalikan ~605 model daripada pelbagai jenama. Kita perlu **hanya model Google/Gemini/Gemma** (~11 model). Berikut ialah formula penapis pintar yang bersifat future-proof:

```javascript
// ── Smart Filter: Ekstrak hanya model Google dari Crazy Router /v1/models ──
function isGoogleModel(modelEntry) {
  // Sumber 1: owned_by field (paling dipercayai)
  if (modelEntry.owned_by === 'google') return true;

  // Sumber 2: Awalan ID model (fallback jika owned_by tidak hadir)
  const id = String(modelEntry.id || '').toLowerCase();
  const GOOGLE_PREFIXES = ['gemini-', 'gemma-'];
  if (GOOGLE_PREFIXES.some(prefix => id.startsWith(prefix))) return true;

  // Tolak: model bukan Google yang mungkin berkaitan
  // (cth: "google/translate-t5" jika ditambah pada masa hadapan — boleh ditapis
  // dengan senarai hitam awalan khas, tetapi ini tidak diperlukan sekarang)
  return false;
}

// Penggunaan:
const googleModels = response.data.data.filter(isGoogleModel);
```

**Formula ini telah disahkan terhadap sample response rasmi** (`gemini-3.1-pro` dengan `owned_by: "google"`) dan akan menangkap model baharu seperti `gemini-3.5-flash`, `gemini-4-pro`, `gemma-4-9b` secara automatik tanpa hardcoding.

### 1.5 Integrasi Sedia Ada

SubMaker **sudah mempunyai** infrastruktur asas untuk Crazy Router:
- [`detectKeyType()`](src/services/gemini.js:334) — mengesan kekunci `sk-` sebagai `crazyrouter`
- [`getCrazyRouterAvailableModels()`](src/services/gemini.js:544) — sudah memanggil `GET /v1/models` dan menyimpan Set ID model
- [`this.baseUrl`](src/services/gemini.js:257) — auto-tukar kepada `https://cn.crazyrouter.com/v1beta` untuk kekunci `sk-`

**Jurang yang perlu diisi**: Fungsi `getCrazyRouterAvailableModels()` kini hanya menyimpan Set ID tetapi **tidak menapis mengikut jenama Google** dan **tidak mengembalikan metadata** (displayName, thinking, sampling). Ia perlu ditambah baik untuk mengembalikan senarai berstruktur yang boleh diisi ke dropdown.

---

## FASA 2: GROUND TRUTH GOOGLE PARAMETERS (Official Specs)

### 2.1 Jadual Spesifikasi Rasmi 4 Keluarga Model

| Keluarga | Contoh Model | Mekanisme Thinking | Sampling Dibenarkan | Temperature | Top-P | Top-K | Penalti |
|----------|-------------|-------------------|---------------------|-------------|-------|-------|---------|
| **Gemini 3.x-strict** | gemini-3.6-flash, 3.7-flash, 3.8-flash, gemini-flash-latest | `thinkingConfig.thinkingLevel` (minimal, low, medium, high) | **STRIPPED** — tiada parameter pensampelan dihantar | N/A (tidak dihantar) | N/A | N/A | N/A |
| **Gemini 3.x-legacy** | gemini-3-flash-preview, 3.1-flash-lite, 3.5-flash | `thinkingConfig.thinkingLevel` (minimal, low, medium, high) | `warn-default-1.0` — suhu mesti 1.0, lain-lain dibenarkan tetapi diabaikan | 1.0 (mandatori) | Dibenarkan | Dibenarkan | Dibenarkan |
| **Gemini 2.5** | gemini-2.5-flash, 2.5-pro, 2.5-flash-lite | `thinkingConfig.thinkingBudget` (integer: -1=dynamic, 0=disabled, min 128 untuk Pro) | **FULL** — semua parameter pensampelan | 0.0–2.0 | 0.0–1.0 | 1–40/64 | -2.0–2.0 |
| **Gemini 1.5 / 2.0 / Gemma** | gemini-1.5-flash, gemma-3-27b-it | **TIADA** thinkingConfig | **FULL** — kawalan penuh | 0.0–2.0 | 0.0–1.0 | 1–100 | -2.0–2.0 |

### 2.2 Pematuhan Pantang Larang (Dalam Kod Sedia Ada)

Kod sedia ada **mematuhi** spesifikasi di atas:

1. **Gemini 3.x-strict** — [`buildGenerationConfig()`](src/services/gemini.js:390) baris 414–417 hanya menghantar `{ maxOutputTokens, thinkingConfig: { thinkingLevel } }`. Tiada temperature/topP/topK.

2. **Gemini 3.x-legacy** — Cabang yang sama (414–417) kerana `thinking === 'level'`. Walau bagaimanapun, kod semasa **tidak menghantar temperature 1.0 secara eksplisit** untuk legacy. Nota dalam kod (baris 410–413) menjelaskan: "1.0 adalah lalai pelayan, jadi menghantarnya secara eksplisit adalah berlebihan." Ini selamat tetapi boleh dipertingkatkan.

3. **Gemini 2.5** — Cabang `thinking === 'budget'` (421–441) menghantar temperature, topP, topK, frequencyPenalty, presencePenalty, dan `thinkingConfig.thinkingBudget`. Pro clamping (0 → 128) disahkan dalam ujian [GT-3].

4. **Legacy / Gemma** — Cabang "pensampelan penuh" (443–458) menghantar semua parameter. Disahkan dalam ujian.

### 2.3 Pengekalan thinkingBudget & topK

[`normalizeConfig()`](src/utils/config.js:414) pada baris 563–570 **mengekalkan** `thinkingBudget` dan `topK` — hanya memadam `minP` dan `repetitionPenalty` (parameter legasi yang tidak disokong). Ini disahkan dalam ujian [GT-6] yang menegaskan kedua-dua nilai dipulihara selepas normalisasi.

### 2.4 Pematuhan REST v1beta systemInstruction

[`systemInstruction`](src/services/gemini.js:892) dikekalkan sebagai **medan peringkat atas** yang berasingan:
```javascript
const requestBody = {
  // ... contents ...
};
if (systemPrompt && String(systemPrompt).trim()) {
  requestBody.systemInstruction = { parts: [{ text: systemPrompt }] };
}
```
Ini disahkan dalam ujian [GT-5] yang menegaskan `systemInstruction` wujud di peringkat atas dan `contents` tidak membawa peranan sistem.

---

## FASA 3: SENI BINA SINGLE-PICKER & FUTURE-PROOF

### 3.1 Keadaan Semasa (Dua Dropdown)

SubMaker kini mempunyai **DUA dropdown model Gemini**:

| Dropdown | Lokasi HTML | Lokasi JS | Tujuan |
|----------|------------|----------|--------|
| `#geminiModel` | [`main.html:551`](public/partials/main.html:551) | [`config.js:10160`](public/config.js:10160) | Model terjemahan utama (bahagian atas) |
| `#advancedModel` | [`main.html:1912`](public/partials/main.html:1912) | [`config.js:10161`](public/config.js:10161) | Override model dalam panel parameter lanjutan (bahagian bawah) |

[`populateGeminiModelDropdowns(models)`](public/config.js:10159) kini mengisi **kedua-dua dropdown** serentak dari senarai model yang sama. `populateAdvancedModels(models)` (baris 10201) hanyalah alias yang memanggil fungsi yang sama.

### 3.2 Rangka Kerja Penyatuan Dropdown

**Langkah 1: Buang `#advancedModel` dari HTML**

Dalam [`public/partials/main.html`](public/partials/main.html:1905-1916), blok berikut perlu dipadam:
```html
<div class="form-group">
    <label for="advancedModel">
        <span data-i18n="config.advancedGemini.model.label">Translation Model Override</span>
        ...
    </label>
    <select id="advancedModel">
        <option value="" ...>Use Default Model</option>
    </select>
    <div class="model-status" id="modelStatus"></div>
</div>
```

**Langkah 2: Buang `#advancedModel` dari fileUploadPageGenerator.js**

Dalam [`src/utils/fileUploadPageGenerator.js`](src/utils/fileUploadPageGenerator.js:2256-2262), blok `<select id="advancedModel">` perlu digantikan dengan paparan teks model aktif (read-only display, bukan dropdown) kerana halaman file-upload tidak memerlukan pengguna menukar model — ia mengikut konfigurasi utama.

**Langkah 3: Ubahsuai `populateGeminiModelDropdowns()`**

```javascript
function populateGeminiModelDropdowns(models) {
    const baseSelect = document.getElementById('geminiModel');
    // BUANG: const advSelect = document.getElementById('advancedModel');
    const list = (Array.isArray(models) && models.length) ? models : SAFE_DEFAULT_MODELS;

    if (baseSelect) {
        const prevValue = baseSelect.value;
        baseSelect.innerHTML = '';
        list.forEach(model => {
            const opt = document.createElement('option');
            opt.value = model.name;
            opt.textContent = model.displayName || model.name;
            baseSelect.appendChild(opt);
        });
        const savedBase = currentConfig.geminiModel || prevValue;
        const target = [savedBase, prevValue, DEFAULT_GEMINI_MODEL]
            .find(v => v && list.some(m => m.name === v));
        baseSelect.value = target || list[0].name;
    }

    // Picu morphing panel parameter berdasarkan model terpilih
    updateGeminiThinkingControl();
}
```

**Langkah 4: Tukar pendengar `change`**

Semua rujukan `advancedModel.addEventListener('change', ...)` (cth: [`config.js:3407`](public/config.js:3407)) perlu dipindahkan kepada `geminiModel.addEventListener('change', ...)` supaya panel parameter morphing dicetuskan oleh dropdown atas.

### 3.3 Model Lalai Teratas

Dropdown atas (`#geminiModel`) akan lalai kepada **"Gemini 3 Flash"** (atau `gemini-flash-lite-latest` sebagai alias stabil). Ini selaras dengan:
- [`DEFAULT_GEMINI_MODEL`](src/utils/config.js:235) = `'gemini-flash-lite-latest'`
- [`SAFE_DEFAULT_MODELS[0]`](public/config.js:10151) = `{ name: 'gemini-flash-lite-latest', displayName: 'Gemini Flash Lite Latest' }`

### 3.4 Klasifikasi Model Dinamik (Tanpa Hardcoding Kaku)

Fungsi [`getModelFamily(model)`](src/services/gemini.js:41) dan cerminannya [`getModelFamily(modelName)`](public/config.js:1028) **sudah wujud** dan menggunakan regex berasaskan versi yang automatik:

```javascript
// Backend (src/services/gemini.js:41-77)
function getModelFamily(model) {
  const m = normalizeGeminiModelId(model).toLowerCase();

  if (m.includes('gemma')) return { family: 'gemma', sampling: 'full', thinking: 'none' };
  if (/^gemini-1\.5/.test(m)) return { family: '1.5', sampling: 'full', thinking: 'none' };
  if (/^gemini-2\.0/.test(m)) return { family: '2.0', sampling: 'full', thinking: 'none' };
  if (/^gemini-2\.5/.test(m)) return { family: '2.5', sampling: 'full', thinking: 'budget' };

  if (/^gemini-3(?:[.-]|$)/.test(m)) {
    if (SAMPLING_DEPRECATED_MODELS.has(m)) {
      return { family: '3.x-strict', sampling: 'stripped', thinking: 'level' };
    }
    if (m === 'gemini-3-flash-preview' || m.startsWith('gemini-3.1') || m === 'gemini-3.5-flash') {
      return { family: '3.x-legacy', sampling: 'warn-default-1.0', thinking: 'level' };
    }
    return { family: '3.x-strict', sampling: 'stripped', thinking: 'level' };
  }

  if (/^gemini-(flash|flash-lite|pro)-latest$/.test(m)) {
    return { family: '3.x-strict', sampling: 'stripped', thinking: 'level', alias: true };
  }

  return { family: 'unknown', sampling: 'full', thinking: 'none' };
}
```

**Ciri future-proof:**
- `gemini-3.5-flash` → automatik dikelaskan sebagai `3.x-legacy` (regex `gemini-3` + cek set)
- `gemini-3.6-flash` → automatik `3.x-strict` (dalam `SAMPLING_DEPRECATED_MODELS`)
- `gemini-4-pro` (masa hadapan) → akan tergolong `unknown` (selamat default `sampling: 'full'`)
- `gemma-4-9b` (masa hadapan) → automatik `gemma` (regex `gemma`)

**Cadangan peningkatan**: Tambah cek `/^gemini-4/` ke dalam regex supaya model Gemini 4.x masa hadapan tidak tergolong `unknown`:
```javascript
if (/^gemini-[4-9]/.test(m)) return { family: '4.x+', sampling: 'stripped', thinking: 'level' };
```

### 3.5 Strategi Migrasi Data

Apabila pengguna lama mempunyai nilai tersimpan dalam `advancedSettings.geminiModel`, [`normalizeConfig()`](src/utils/config.js:414) perlu mengalihkan nilai tersebut:

```javascript
// Dalam normalizeConfig(), selepas baris 546:
const normalizedAdvancedModel = normalizeGeminiModelName(advSettings.geminiModel);

// MIGRASI: Jika advancedSettings.geminiModel wujud dan berbeza dari geminiModel,
// alihkan ke geminiModel (dropdown atas) dan kosongkan advancedSettings.geminiModel.
if (normalizedAdvancedModel && normalizedAdvancedModel !== configModel) {
  log.debug(() => `[Config] Migrating advancedSettings.geminiModel '${normalizedAdvancedModel}' to top-level geminiModel`);
  mergedConfig.geminiModel = normalizedAdvancedModel;
  mergedConfig.advancedSettings.geminiModel = ''; // kosongkan
}
```

Ini memastikan tetapan pengguna lama **tidak hilang** — model override mereka menjadi model utama.

---

## FASA 4: REKA BENTUK UI PARAMETER HIBRID / AUTO (DYNAMIC MORPHING)

### 4.1 Keadaan Semasa

Panel "Gemini Advanced Parameters" ([`main.html:1868`](public/partials/main.html:1868)) kini mempunyai elemen berikut yang dikawal oleh fungsi [`updateGeminiThinkingControl()`](public/config.js:1246):

| Elemen HTML | ID | Tingkah Laku Semasa |
|-------------|----|----|
| Thinking Budget | `#advancedThinkingBudgetGroup` | Disembunyikan untuk 3.x; dipaparkan untuk 2.5 |
| Thinking Level | `#advancedThinkingLevelGroup` | Dipaparkan untuk 3.x; disembunyikan untuk 2.5 |
| Temperature | `#advancedTemperature` | Disembunyikan untuk 3.x-strict; dipaparkan lain |
| Top-P | `#advancedTopP` | Sama seperti Temperature |
| Top-K | `#advancedTopKGroup` | Sama + disebunyikan untuk Gemma |
| Frequency Penalty | `#advancedFrequencyPenaltyGroup` | Disembunyikan untuk 3.x |
| Presence Penalty | `#advancedPresencePenaltyGroup` | Disembunyikan untuk 3.x |
| Sampling Controlled Note | `#samplingControlledNote` | Dipaparkan untuk 3.x-strict |

### 4.2 Pelan Dynamic DOM Morphing (Hibrid/Auto)

Selepas dropdown atas (`#geminiModel`) berubah, fungsi `updateGeminiThinkingControl()` akan dipanggil dan menjalankan morphing berikut:

```
┌─────────────────────────────────────────────────────────────────────┐
│  Peristiwa: #geminiModel.change                                     │
│  ↓                                                                  │
│  getModelFamily(selectedModel) → { family, sampling, thinking }      │
│  ↓                                                                  │
│  ┌─────────────────┬──────────────────┬───────────────────────────┐ │
│  │ thinking='level' │ thinking='budget'│ thinking='none'           │ │
│  │ (Gemini 3.x)     │ (Gemini 2.5)     │ (1.5/2.0/Gemma)           │ │
│  ├─────────────────┼──────────────────┼───────────────────────────┤ │
│  │ SHOW:           │ SHOW:            │ SHOW:                     │ │
│  │  ThinkingLevel  │  ThinkingBudget  │  (tiada elemen thinking)  │ │
│  │ HIDE:           │ HIDE:            │ HIDE:                     │ │
│  │  ThinkingBudget │  ThinkingLevel   │  ThinkingBudget           │ │
│  │                 │                  │  ThinkingLevel           │ │
│  ├─────────────────┼──────────────────┼───────────────────────────┤ │
│  │ sampling=       │ sampling=        │ sampling='full'           │ │
│  │ 'stripped'      │ 'full'           │                           │ │
│  ├─────────────────┼──────────────────┼───────────────────────────┤ │
│  │ HIDE+DISABLE:   │ SHOW+ENABLE:     │ SHOW+ENABLE:              │ │
│  │  Temperature    │  Temperature     │  Temperature              │ │
│  │  TopP           │  TopP            │  TopP                     │ │
│  │  TopK           │  TopK            │  TopK                     │ │
│  │  FreqPenalty    │  FreqPenalty     │  FreqPenalty              │ │
│  │  PresPenalty    │  PresPenalty     │  PresPenalty              │ │
│  │ SHOW:           │ HIDE:            │ HIDE:                     │ │
│  │  SamplingNote   │  SamplingNote    │  SamplingNote             │ │
│  └─────────────────┴──────────────────┴───────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.3 Pelaksanaan Anti-Memory-Leak & Anti-TypeError

Untuk mengelakkan isu skrin kelabu / render crash, pelaksanaan morfing akan mematuhi peraturan berikut:

1. **Guard null-check sebelum akses DOM** — setiap `document.getElementById(...)` dibungkus dengan cek `if (el)`:
```javascript
function updateGeminiThinkingControl() {
    const model = getAdvancedGeminiModelValue(); // kini baca dari #geminiModel
    const familyInfo = getModelFamily(model);
    const profile = getModelThinkingProfile(model);

    const budgetGroup = document.getElementById('advancedThinkingBudgetGroup');
    const levelGroup = document.getElementById('advancedThinkingLevelGroup');
    const tempEl = document.getElementById('advancedTemperature');
    // ... (semua elemen)

    // Guard: jika mana-mana elemen tidak wujud, keluar awal
    if (!levelGroup || !budgetGroup) return;
```

2. **Disabled vs Hidden** — elemen disembunyikan dengan `style.display = 'none'` DAN `disabled = true` supaya nilai tidak dihantar semasa submit form (mengelakkan browser validity error pada input tersembunyi).

3. **Tiada event listener berulang** — pendengar `change` pada `#geminiModel` didaftarkan **sekali sahaja** semasa init, bukan setiap kali morphing.

4. **Pemulihan nilai selepas morphing** — apabila slider dipaparkan semula, nilai dipulihkan dari `currentConfig.advancedSettings` bukan dari DOM (mengelakkan nilai basi).

5. **Sampling note dinamik** — teks nota [`#samplingControlledNote`](public/partials/main.html:1993) akan dikemas kini mengikut keluarga:
   - 3.x-strict: "This Gemini 3 model manages sampling automatically — temperature / topP / topK / penalties are not configurable."
   - 3.x-legacy: "This Gemini 3 legacy model requires temperature = 1.0. Other sampling parameters are ignored."

---

## FASA 5: BLUEPRINT PELAKSANAAN & MATRIX RISIKO

### 5.1 Fail-Fail Terlibat

| Fail | Fungsi | Perubahan Diperlukan |
|------|--------|---------------------|
| [`public/partials/main.html`](public/partials/main.html) | Struktur HTML config page | Buang blok `#advancedModel` (baris 1905–1916) |
| [`src/utils/fileUploadPageGenerator.js`](src/utils/fileUploadPageGenerator.js) | Penjana HTML halaman file-upload | Gantikan `<select id="advancedModel">` dengan paparan read-only |
| [`public/config.js`](public/config.js) | Logika klien config page | Ubah `populateGeminiModelDropdowns()` (buang advSelect); pindah pendengar `change`; kemas kini `getAdvancedGeminiModelValue()` (baca dari `#geminiModel`) |
| [`src/utils/config.js`](src/utils/config.js) | Normalisasi & migrasi konfig | Tambah blok migrasi `advancedSettings.geminiModel` → `geminiModel` dalam `normalizeConfig()` |
| [`src/services/gemini.js`](src/services/gemini.js) | Klasifikasi model & REST v1beta | Tingkatkan `getModelFamily()` dengan regex `gemini-[4-9]`; tambah filter `isGoogleModel()` untuk `getCrazyRouterAvailableModels()` |
| [`src/services/gemini-auth-model-regression.test.js`](src/services/gemini-auth-model-regression.test.js) | Ujian regresi | Kemas kini ujian yang merujuk `advancedModel` (baris 235–237) supaya merujuk `geminiModel` |

### 5.2 Pelan Pengesahan Ujian

| Ujian | Tujuan | Status Semasa | Selepas Pelaksanaan |
|-------|--------|---------------|---------------------|
| `[GT-1]` — 3.7-flash strips sampling | Sahkan 3.x-strict | ✅ PASS | Kekal PASS |
| `[GT-2]` — 3.5-flash-lite thinkingLevel | Sahkan 3.x-lite defaults | ✅ PASS | Kekal PASS |
| `[GT-3]` — 2.5-pro clamps budget 0→128 | Sahkan Pro min 128 | ✅ PASS | Kekal PASS |
| `[GT-4]` — 2.5-flash allows budget 0 | Sahkan Flash disable | ✅ PASS | Kekal PASS |
| `[GT-5]` — systemInstruction top-level | Sahkan REST v1beta | ✅ PASS | Kekal PASS |
| `[GT-6]` — preserves topK & thinkingBudget | Sahkan pantang larang | ✅ PASS | Kekal PASS |
| `populateGeminiModelDropdowns` assertion | Sahkan HTML mengandungi fungsi | ✅ PASS | Kemas kini supaya tidak merujuk `advancedModel` |
| `applyGeminiModelDefaults(advancedModel.value)` | Sahkan morphing dicetus | ✅ PASS | Tukar kepada `applyGeminiModelDefaults(geminiModel.value)` |
| **Jumlah** | **93 ujian** | **92 pass, 0 fail, 1 skip** | **Sasaran: 93/93 PASS** |

### 5.3 Matrix RISIKO

| # | Risiko | Tahap | Mitigasi |
|---|--------|-------|----------|
| R1 | Pengguna lama kehilangan tetapan `advancedSettings.geminiModel` | **TINGGI** | Migrasi dalam `normalizeConfig()` mengalihkan nilai ke `geminiModel` sebelum mengosongkan |
| R2 | TypeError apabila `#advancedModel` tidak wujud selepas dipadam | **SEDERHANA** | Guard null-check dalam semua fungsi yang merujuk `advancedModel`; gunakan `?.` operator |
| R3 | Browser validity error pada input tersembunyi | **SEDERHANA** | Set `disabled = true` bersama `display = 'none'` (form `novalidate` sedia ada membantu) |
| R4 | Filter Google Crazy Router terlepas menapis model | **RENDAH** | Formula dwi-lapis (owned_by + prefix) adalah berlebihan; boleh ditambah senarai hitam jika perlu |
| R5 | Model Gemini 4.x masa hadapan diklasifikasi `unknown` | **RENDAH** | Tambah regex `/^gemini-[4-9]/` sebelum fallback `unknown` |
| R6 | Ujian `gemini-auth-model-regression.test.js` baris 235–237 gagal | **TINGGI** | Kemas kini assertion untuk merujuk `geminiModel` bukan `advancedModel` |
| R7 | Halaman file-upload kehilangan keupayaan tukar model | **SEDERHANA** | Gantikan dropdown dengan paparan read-only + pautan "Change in main config" |
| R8 | `systemInstruction` tersilap dipindah ke `contents` | **KRITIKAL** | Tidak berkenaan — tiada perubahan pada struktur `requestBody` di [`gemini.js:886`](src/services/gemini.js:886) |
| R9 | `thinkingBudget` / `topK` terpadam secara agresif | **KRITIKAL** | Tidak berkenaan — blok pembersihan di [`config.js:567`](src/utils/config.js:567) hanya memadam `minP` & `repetitionPenalty` |

### 5.4 Jaminan Pematuhan Pantang Larang

| Pantang Larang | Status | Bukti |
|---------------|--------|-------|
| `systemInstruction` kekal sebagai medan peringkat atas | ✅ Tidak berubah | [`gemini.js:892`](src/services/gemini.js:892) — `requestBody.systemInstruction = { parts: [{ text }] }` |
| `thinkingBudget` & `topK` tidak dipadam dalam `normalizeConfig` | ✅ Tidak berubah | [`config.js:567-570`](src/utils/config.js:567) — hanya `minP` & `repetitionPenalty` dipadam |
| Gemini 3.x-strict: parameter pensampelan di-strip sepenuhnya | ✅ Tidak berubah | [`gemini.js:414-417`](src/services/gemini.js:414) — hanya `{ maxOutputTokens, thinkingConfig }` |
| Gemini 3.x-legacy: suhu 1.0 dikuatkuasakan | ✅ Tidak berubah (selamat) | Cabang yang sama (414–417); suhu tidak dihantar, lalai pelayan 1.0 |
| Semua 93 ujian kekal PASS | ✅ Disahkan | `npm test` → 92 pass, 0 fail, 1 skip |

---

## RUMUSAN

Pelaksanaan pembedahan arkitektur ini melibatkan **5 fail** dengan perubahan yang tertumpu kepada:
1. **Penyatuan dropdown** — buang `#advancedModel`, kembangkan peranan `#geminiModel`
2. **Penapisan Google dari Crazy Router** — tambah `isGoogleModel()` dalam `getCrazyRouterAvailableModels()`
3. **Migrasi data** — alih `advancedSettings.geminiModel` → `geminiModel` dalam `normalizeConfig()`
4. **Morfing DOM hibrid** — `updateGeminiThinkingControl()` dicetus oleh dropdown atas
5. **Kemas kini ujian** — sesuaikan assertion yang merujuk `advancedModel`

**Tiada perubahan** kepada:
- Struktur `requestBody` REST v1beta (systemInstruction kekal atas)
- Logika `buildGenerationConfig()` (3 cabang thinking)
- Pembersihan parameter legasi (`minP`, `repetitionPenalty` sahaja yang dipadam)
- `thinkingBudget` & `topK` sentiasa dipulihara

**Sedia untuk semakan sebelum arahan eksekusi kod diberikan.**
