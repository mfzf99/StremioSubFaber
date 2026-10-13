# LAPORAN CADANGAN UI/UX — SECONDARY FALLBACK PROVIDER (FRONTEND)

> **Tarikh:** 2026-10-13  
> **Mod:** Frontend (Kimi K3)  
> **Status:** Brainstorming / Cadangan sahaja — TIADA kod produksi disentuh  
> **Sasaran:** Owner + Backend Lead (GLM 5.3) untuk keputusan muktamad

---

## 1. RINGKASAN EKSEKUTIF

Cadangan ini mengemukakan **Sub-seksyen Collapsible "🛟 Secondary Fallback Provider"** di dalam kad **Agent Translation** (Trinity UI), menggantikan sepenuhnya "kotak semak hantu" di Translation Settings. Ia mengguna semula pola komponen Trinity yang sedia ada (togol, input kunci dengan mata, butang ✓ Test) untuk memastikan konsistensi visual dan interaksi, sambil memenuhi kontrak backend `config.providers.<key>` tanpa sebarang perubahan skema.

---

## 2. AUDIT KOD UI LEGASI vs TRINITY

### 2.1 Keadaan Semasa (Legacy "Beta Mode")

| Komponen | Lokasi | Masalah |
|----------|--------|---------|
| `enableMultiProviders` checkbox | `main.html:1067-1076` | Gated oleh `betaMode` (`config.js:11242`). Hanya muncul dalam mod beta. |
| `multiProvidersContainer` | `main.html:1078-1148+` | Senarai provider (OpenAI, Anthropic, XAI, DeepSeek, DeepL) dengan checkbox + input key + dropdown model + butang "Load Models". **Tiada medan Base URL** untuk Custom/OpenAI-compatible. |
| `mainProviderSelect` | `main.html:2430-2440` | Dropdown pilih provider utama. Hanya aktif jika `multiProviderEnabled=true`. |
| `enableSecondaryProvider` checkbox | `main.html:2443-2453` | **Kotak semak hantu** — boleh ditanda tetapi tiada medan konfigurasi kunci/model untuk provider sekunder. |
| `secondaryProviderSelect` | `main.html:2454-2464` | Disabled + row disembunyikan (`display:none`). |
| `toggleMultiProviderUI()` | `config.js:9071` | Show/hide container; reset secondary state jika dimatikan. |
| `toggleSecondaryProviderUI()` | `config.js:9114` | Show/hide row dropdown; force uncheck jika tiada provider lain. |
| `updateSecondaryProviderOptions()` | `config.js:9184` | Populate dropdown dengan provider yang enabled (kecuali main). |
| Validasi | `config.js:13207-13302` | Semak `secondaryProvider` valid, bukan sama dengan main, dan `configuredProviders.size >= 2`. |

**Isu Utama Legacy:**
1. **Tiada input dedikasi untuk kunci API/model/baseUrl provider sekunder** — pengguna boleh tanda checkbox tetapi tiada cara mengkonfigurasi pembekal sandaran.
2. **Gated oleh beta mode** — tidak mesra pengguna biasa.
3. **Tiada butang Test** untuk provider sekunder — pengguna tidak boleh mengesahkan konfigurasi sebelum simpan.
4. **Rehydration race** — `loadConfigToForm()` memanggil `toggleMultiProviderUI()` selepas hydrate, tetapi jika DOM belum sedia, state secondary boleh hilang.

### 2.2 Keadaan Semasa (Trinity UI)

| Komponen | Lokasi | Kekuatan |
|----------|--------|----------|
| `trinity-agents.js` | `public/js/trinity-agents.js` | Modul mandiri dengan `buildAgentCard()` untuk setiap ejen. |
| `trinity-agent-card` | `trinity-agents.css:68` | Kad modular dengan border, radius, padding konsisten. |
| Provider dropdown | `trinity-agents.js:211-217` | Dinamik, dengan placeholder. |
| API Key input | `trinity-agents.js:219-264` | `type=password`, dengan **butang mata (👁️)** dan **badge autodetect**. |
| Base URL row | `trinity-agents.js:265-275` | Smart visibility — hanya muncul untuk Custom/Proxy. |
| Format / Door row | `trinity-agents.js:276-295` | Smart visibility — auto/gemini/openai/anthropic. |
| Model dropdown | `trinity-agents.js:296-311` | Standard select dengan placeholder. |
| Key Rotation row | `trinity-agents.js:377-482` | Collapsible dengan checkbox, frequency select, additional keys list. |
| Butang ✓ Test | `trinity-agents.js:508-515` | Ikon ✓/✕ dengan spinner; kelas `trinity-key-icon-btn`. |
| Butang Load Models | `trinity-agents.js:532-595` | Fetch models dari provider; populate dropdown. |
| `collectConfigPatch()` | `trinity-agents.js:1179-1268` | Serialisasi ke `trinity.*` + `agentB.*`. |

**Kekuatan Trinity:**
1. **Komponen seragam** — setiap kad ejen mempunyai pola yang sama (provider → key → baseUrl → format → model → rotation).
2. **Smart visibility** — medan Base URL dan Format hanya muncul untuk Custom/Proxy, mengurangkan clutter.
3. **Autodetect badge** — visual feedback segera untuk format kunci.
4. **Butang Test per kad** — pengguna boleh validate kunci sebelum simpan.
5. **Rehydration terurus** — `hydrate()` dipanggil selepas DOM sedia, dengan `populateProviderDropdown()` dan `populateModelDropdown()`.

**Jurang Trinity:**
- Tiada mekanisme untuk mengkonfigurasi **secondary/fallback provider** dalam kad Agent Translation.

---

## 3. CADANGAN KEDUDUKAN SEKSYEN

### 3.1 Pilihan A: Accordion dalam Kad Agent Translation ✅ **(DICADANGKAN)**

**Justifikasi:**
- **Konteks semula jadi:** Fallback adalah sebahagian daripada strategi "Agent Translation" — pengguna tidak perlu meninggalkan konteks kad utama.
- **Kurangkan pergerakan:** Semua konfigurasi berkaitan terjemahan dalam satu tempat.
- **Guna semula infrastruktur:** `buildAgentCard()` boleh diperluas dengan sub-kad tanpa mencipta partial baharu.
- **Konsisten dengan Key Rotation:** Key Rotation sudah menjadi sub-seksyen collapsible dalam kad Agent Translation — Secondary Fallback boleh mengikut pola yang sama.

**Struktur:**
```
┌─ Agent Translation ──────────────────────┐
│  Provider: [Gemini ▼]                    │
│  API Key: [********] [👁️] [✓ Test]      │
│  Model: [gemini-2.5-flash ▼]             │
│  ┌─ Key Rotation ──────────────────────┐ │
│  │  [✓] Enable key rotation            │ │
│  │  ...                                │ │
│  └─────────────────────────────────────┘ │
│  ┌─ 🛟 Secondary Fallback Provider ─────┐ │
│  │  [✓] Enable fallback rescue         │ │
│  │  Provider: [DeepSeek ▼]              │ │
│  │  API Key: [********] [👁️] [✓ Test]  │ │
│  │  Model: [deepseek-v4.1-flash ▼]      │ │
│  │  Base URL: [https://...]             │ │
│  └─────────────────────────────────────┘ │
└──────────────────────────────────────────┘
```

### 3.2 Pilihan B: Hidupkan Semula di Translation Settings ❌

**Kelemahan:**
- Jauh daripada konteks Agent Translation — pengguna perlu scroll ke bahagian lain untuk konfigurasi.
- Masih bergantung pada `multiProviderEnabled` beta gate.
- Tidak menyelesaikan masalah "tiada input kunci/model untuk provider sekunder" tanpa menambah lebih banyak elemen dalam Translation Settings (yang sudah penuh).

### 3.3 Pilihan C: Kad Berasingan "Agent Fallback" ❌

**Kelemahan:**
- Mencipta kad ke-4 dalam Trinity UI — memecahkan konsep "3 Agents" (Preflight, Translation, Inspector).
- Fallback bukan "agent" bebas — ia adalah ciri sokongan untuk Agent Translation.
- Menambah kompleksiti navigasi.

---

## 4. SPESIFIKASI KOMPONEN UI (CADANGAN)

### 4.1 Toggle Induk

| Atribut | Nilai |
|---------|-------|
| ID | `trinity-translation-fallback-enabled` |
| Label | **Enable fallback rescue** |
| Deskripsi | *If the main provider errors (429/503/prohibited), retry the failed batch with this provider, then continue with the main provider.* |
| Auto-set | `currentConfig.multiProviderEnabled = true` (kerana fallback memerlukan multi-provider) |
| Auto-uncheck | Jika dimatikan, reset `secondaryProviderEnabled = false` dan `secondaryProvider = ''` |

### 4.2 Dropdown Provider

| Atribut | Nilai |
|---------|-------|
| ID | `trinity-translation-fallback-provider` |
| Sumber data | Senarai provider yang enabled (kecuali provider utama semasa) |
| Placeholder | `— Select fallback provider —` |
| On-change | Populate model dropdown untuk provider terpilih; show/hide Base URL row |

### 4.3 Input API Key

| Atribut | Nilai |
|---------|-------|
| ID | `trinity-translation-fallback-key` |
| Type | `password` |
| Placeholder | `API key for fallback provider` |
| Kelas | `trinity-key-input` + `sensitive-input masked` |
| Butang Mata | `trinity-eye-btn` dengan SVG eye/eye-slash (sama seperti kad utama) |
| Butang Test | `trinity-key-icon-btn trinity-key-test-btn` dengan ikon ✓/✕ |
| Badge autodetect | `trinity-format-badge` (tone-green/tone-red/tone-muted) |

### 4.4 Input Model

| Atribut | Nilai |
|---------|-------|
| ID | `trinity-translation-fallback-model` |
| Placeholder | `— Select model —` |
| Sumber data | Diisi oleh butang "Load Models" (pola sama seperti kad utama) |
| On-change | Simpan ke `currentConfig.secondaryModel` |

### 4.5 Input Base URL (Kondisional)

| Atribut | Nilai |
|---------|-------|
| ID | `trinity-translation-fallback-baseurl` |
| Placeholder | `https://…/v1 (e.g. Crazy Router, Ollama, your own proxy)` |
| Visibility | Hanya muncul jika provider = `custom` atau `openai` (atau mana-mana yang memerlukan baseUrl) |
| Kelas | `trinity-baseurl-input` |

### 4.6 Butang ✓ Test (Fallback)

| Atribut | Nilai |
|---------|-------|
| Kelas | `trinity-key-icon-btn trinity-key-test-btn` |
| Fungsi | Hantar test request ke provider dengan kunci + model + baseUrl fallback |
| Visual | Gelang sempadan hijau (`is-valid`) / merah (`is-invalid`) pada input kunci |
| Badge | Teks ringkas: `Valid ✓ (deepseek)` / `Invalid: 401` / `Failed: network error` |

### 4.7 Butang Load Models (Fallback)

| Atribut | Nilai |
|---------|-------|
| Kelas | `validate-api-btn` (sama seperti legacy) |
| Ikon | `↻` |
| Teks | `Load Models` |
| Fungsi | Fetch model list untuk provider fallback; populate dropdown model |

---

## 5. ALIRAN INTERAKSI PENGGUNA

### 5.1 Aliran Konfigurasi Baru

```
1. Pengguna buka Configure → Trinity UI → Agent Translation
2. Scroll ke sub-seksyen "🛟 Secondary Fallback Provider"
3. Tandakan "Enable fallback rescue"
   → auto-set multiProviderEnabled = true
   → sub-kad expand (atau muncul)
4. Pilih provider dari dropdown (contoh: DeepSeek)
   → Base URL row muncul jika provider memerlukan
5. Masukkan API Key
   → Badge autodetect muncul (contoh: "DeepSeek key detected")
6. Klik ✓ Test
   → Spinner → Badge hijau "Valid ✓ (deepseek)" + gelang hijau pada input
7. Klik "Load Models"
   → Dropdown model diisi (contoh: deepseek-v4.1-flash)
8. Pilih model
9. Simpan konfigurasi
```

### 5.2 Aliran Semasa Runtime (Backend)

```
Agent Translation (Gemini) ──429──► tryFallback()
                                      │
                                      ▼
                              FallbackTranslationProvider
                              (DeepSeek, model: deepseek-v4.1-flash)
                                      │
                              ┌───────┴───────┐
                              │  Success      │ ──► Continue with main provider
                              │  (usedSecondaryProvider=true)
                              └───────────────┘
```

### 5.3 Aliran Rehidrasi (Page Load)

```
1. config.js parseConfig() → currentConfig.secondaryProviderEnabled = true
2. trinity-agents.js mount() → hydrate()
3. hydrate() baca currentConfig.trinity.translation
4. Jika fallback enabled:
   a. Set checkbox #trinity-translation-fallback-enabled = true
   b. Expand sub-kad
   c. populateProviderDropdown() → pilih currentConfig.secondaryProvider
   d. Set key input value = currentConfig.providers.<secondary>.apiKey
   e. populateModelDropdown() → pilih currentConfig.secondaryModel
   f. Set baseUrl jika ada
5. updateVisibility() → show/hide baseUrl row mengikut provider
```

---

## 6. PELAN PEMBERSIHAN KOTAK SEMAK HANTU

### 6.1 Buang Elemen Legacy

| Elemen | Tindakan |
|--------|----------|
| `#enableMultiProviders` + label | **BUANG** — digantikan oleh toggle dalam Trinity UI |
| `#multiProvidersContainer` | **BUANG** — senarai provider legacy tidak lagi diperlukan |
| `#mainProviderSelect` | **BUANG** — provider utama ditentukan oleh dropdown Trinity utama |
| `#secondaryProviderGroup` | **BUANG** — digantikan oleh sub-kad Trinity |
| `#secondaryProviderSelect` | **BUANG** |

### 6.2 Alih Fungsi JS

| Fungsi Legacy | Tindakan |
|---------------|----------|
| `toggleMultiProviderUI()` | **BUANG** — ganti dengan logik expand/collapse dalam `trinity-agents.js` |
| `toggleSecondaryProviderUI()` | **BUANG** |
| `updateSecondaryProviderOptions()` | **BUANG** — ganti dengan `populateFallbackProviderDropdown()` |
| `updateMainProviderOptions()` | **BUANG** |
| Validasi `config.js:13207-13302` | **KEKAL** — tetapi baca dari `currentConfig.trinity.translation.fallback` (bukan `secondaryProviderSelect`) |

### 6.3 Kekalkan Kontrak Backend

| Medan Config | Sumber Baru |
|--------------|-------------|
| `multiProviderEnabled` | Auto-set oleh `trinity-translation-fallback-enabled` |
| `mainProvider` | Dari `trinity.translation.provider` |
| `secondaryProviderEnabled` | Dari `trinity-translation-fallback-enabled` |
| `secondaryProvider` | Dari `trinity-translation-fallback-provider` |
| `providers.<key>.apiKey` | Dari `trinity-translation-fallback-key` |
| `providers.<key>.model` | Dari `trinity-translation-fallback-model` |
| `providers.<key>.baseUrl` | Dari `trinity-translation-fallback-baseurl` (jika ada) |

---

## 7. ISU REHIDRASI / RACE DOM LIFECYCLE

### 7.1 Risiko Semasa

1. **`loadConfigToForm()` memanggil `toggleMultiProviderUI()`** sebelum `trinity-agents.js` mount — jika DOM Trinity belum wujud, state secondary tidak dipulihkan.
2. **`updateSecondaryProviderOptions()` bergantung pada `#secondaryProviderSelect`** yang akan dibuang — perlu ganti dengan fungsi Trinity.
3. **Race antara `populateModelDropdown()` dan `updateGeminiThinkingControl()`** — jika model fallback berbeza daripada utama, thinking control mungkin salah render.

### 7.2 Mitigasi

1. **Event `partialsReady`** — `trinity-agents.js` mount hanya selepas partials siap; pastikan `loadConfigToForm()` tidak memanggil fungsi legacy yang bergantung pada elemen yang dibuang.
2. **Fungsi `hydrateFallback()` baharu** dalam `trinity-agents.js`:
   - Dipanggil selepas `hydrate()` utama.
   - Baca `currentConfig.trinity.translation.fallback` (atau fallback ke `currentConfig.secondaryProvider*` untuk backward compatibility).
   - Populate dropdown → set key → populate model → set baseUrl → update visibility.
3. **Guard `if (!el) return;`** untuk semua elemen fallback (ikut pattern 112 lokasi sedia ada).
4. **Serialisasi dalam `collectConfigPatch()`** — tambah blok `fallback` dalam `trinity.translation`:
   ```javascript
   trinity.translation.fallback = {
       enabled: fallbackEnabled,
       provider: fallbackProvider,
       apiKey: fallbackKey,
       model: fallbackModel,
       baseUrl: fallbackBaseUrl
   };
   ```
   Backend `src/utils/config.js` boleh map ini ke `secondaryProviderEnabled`/`secondaryProvider`/`providers.*` tanpa perubahan skema.

---

## 8. RINGKASAN CADANGAN

| Aspek | Cadangan |
|-------|----------|
| **Kedudukan** | Sub-seksyen collapsible dalam kad **Agent Translation** (Trinity UI) |
| **Toggle** | "Enable fallback rescue" — auto-set `multiProviderEnabled` |
| **Komponen** | Dropdown provider, API Key (👁️+✓Test), Model dropdown, Base URL kondisional |
| **Pembersihan** | Buang `#enableMultiProviders`, `#multiProvidersContainer`, `#mainProviderSelect`, `#secondaryProviderGroup` |
| **Kontrak** | Serialisasi ke `trinity.translation.fallback` → backend map ke `providers.<key>` |
| **Rehidrasi** | `hydrateFallback()` dalam `trinity-agents.js` dengan guard null-check |
| **Gaya visual** | Konsisten dengan Key Rotation (collapsible, border, padding) |

---

## 9. LANGKAH SETERUSNYA (UNTUK OWNER/BACKEND)

1. **Owner approval** — tentukan sama ada Pilihan A (accordion dalam Agent Translation) diterima.
2. **Backend mapping** — sahkan `src/utils/config.js` boleh membaca `trinity.translation.fallback` dan map ke `secondaryProviderEnabled`/`secondaryProvider`/`providers.*`.
3. **Frontend implementation** — setelah approval, implementasi dalam `trinity-agents.js` + `trinity-agents.css`.
4. **Integration testing** — pastikan fallback berfungsi hujung-ke-hujung (UI → config → engine).

---

*Disediakan oleh: Kimi K3 (Frontend Mode)*  
*Untuk: Owner + Backend Lead (GLM 5.3)*
