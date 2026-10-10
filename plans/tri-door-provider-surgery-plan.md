# LAPORAN PEMBEDAHAN MAJOR — TIGA PINTU FORMAT API UNTUK TRINITY ENGINE

**Tarikh:** 2026-10-10 (13:50 MYT)
**Status:** LAPORAN SAHAJA — TIADA KOD DIUBAH (arahan owner)
**Taksonomi:** [`docs/ENGINE_COMPONENT_TAXONOMY.md`](../docs/ENGINE_COMPONENT_TAXONOMY.md) — Agent Preflight, Agent Translation, Agent Inspector

---

## 0. RINGKASAN EKSEKUTIF

Diagnosis owner ("aku paksa semua LLM ikut satu pintu Gemini Native") adalah **SEPARUH BENAR**. Deep scan mendedahkan dua realiti berbeza mengikut komponen:

1. **Agent Translation (translationEngine.js)** — SALAH diagnosis. Ia SUDAH ada 3 pintu penuh melalui [`createTranslationProvider()`](../src/services/translationProviderFactory.js:483): Gemini Native ([`gemini.js`](../src/services/gemini.js:513)), OpenAI-Compatible ([`openaiCompatible.js`](../src/services/providers/openaiCompatible.js)), dan Anthropic Messages ([`anthropic.js`](../src/services/providers/anthropic.js:243)). Ini disahkan audit compliance 100% dalam ledger 2026-10-09 (sesi "VALIDASI PRODUKSI PENUH").
2. **Agent Preflight (Fasa 0) & Agent Inspector (Fasa 1)** — DIAGNOSIS BENAR. [`AgentBInspector`](../src/services/agentBInspector.js:422) `extends OpenAICompatibleProvider` dengan `universalPayload: true` — **terkurung pada SATU pintu OpenAI sahaja**. Pemilik kunci Gemini atau Anthropic TIDAK BOLEH menggunakan Trinity ini tanpa gateway OpenAI-compatible (rootsys.cloud hari ini).
3. **Autodetect format daripada API key** — **TIDAK WUJUD** dalam sistem. Pemilihan pintu hari ini manual (dropdown provider di UI + `config.agentB` env terpisah).

Barah sebenar: **Trinity tidak demokratik**. 2 daripada 3 enjin hanya boleh hidup di atas pintu OpenAI. Ini pembedahan yang perlu dilakukan — BUKAN membina 3 pintu dari kosong untuk Agent Translation, tetapi memperluaskan 3 pintu sedia ada kepada Preflight + Inspector, dan menambah lapisan autodetect.

---

## 1. GROUND TRUTH SEMASA (hasil deep scan)

### 1.1 Tiga pintu fizikal yang SUDAH wujud

| Pintu | Fail | Endpoint | Format payload | Ujian regresi |
|---|---|---|---|---|
| Gemini Native | [`gemini.js`](../src/services/gemini.js:1344) | `POST /v1beta/models/{model}:generateContent` | `systemInstruction` top-level + `contents[{role,parts}]` + `generationConfig` (ground truth sampling: 3.x-strict/legacy/2.5) | [`gemini-auth-model-regression.test.js`](../src/services/gemini-auth-model-regression.test.js) |
| OpenAI | [`openaiCompatible.js`](../src/services/providers/openaiCompatible.js:497) | `POST /chat/completions` (atau `/responses` untuk gpt-5-pro) | `messages[{role,content}]` + `temperature`/`reasoning_effort` pintar per-model | [`agentB-inspector-regression.test.js`](../src/services/agentBInspector.js) (PAYLOAD-GODTIER) |
| Anthropic | [`anthropic.js`](../src/services/providers/anthropic.js:255) | `POST /v1/messages` | `system` top-level + `messages` + header `x-api-key`/`anthropic-version` | [`provider-retry-backoff-regression.test.js`](../src/services/provider-retry-backoff-regression.test.js) |

Ketiga-tiganya menghormati sempadan [`SUBFABER_PROMPT_BOUNDARY`](../src/services/utils/structuredPrompt.js:24) (split system/user statik-dinamik) — pengasingan static/dynamic sudah solve secara format-agnostik. Ini aset penting: prompt Trinity TIDAK perlu ditulis semula; hanya lapisan penghantaran perlu diperluaskan.

### 1.2 Matriks sokongan semasa × Trinity

| Enjin | Gemini Native | OpenAI | Anthropic | Catatan |
|---|---|---|---|---|
| **Agent Translation** | ✅ penuh | ✅ penuh | ✅ penuh | melalui factory + FallbackTranslationProvider |
| **Agent Preflight (Fasa 0)** | ❌ | ✅ (universalPayload 4-kunci) | ❌ | AgentBInspector extends OpenAICompatibleProvider |
| **Agent Inspector (Fasa 1)** | ❌ | ✅ (universalPayload 4-kunci) | ❌ | sama — satu kelas menjalankan kedua-dua fasa |

### 1.3 Landskap konfigurasi semasa

- **Agent Translation:** [`createTranslationProvider()`](../src/services/translationProviderFactory.js:483) membaca `config.translations.providers[]` + multi-provider fallback. Pilihan pintu MANUAL (user pilih provider di UI).
- **Agent Preflight + Inspector:** [`config.agentB`](../src/utils/config.js:628) — SATU `baseUrl` + SATU `apiKey` + hierarki model `kimi-k3` (Fasa 0) / `deepseek-v4-pro` (Fasa 1). Tiada konsep "format" — diandaikan OpenAI-compatible selama-lamanya (mandat rootsys.cloud).
- **Autodetect key:** TIADA fungsi `detectProviderFromKey()` wujud. [`isCrazyRouter`](../src/handlers/subtitles.js:6691) semak `startsWith('sk-')` pada geminiKey untuk routing proxy — itu satu-satunya "heuristic key" dalam sistem, dan ia untuk tujuan lain.

---

## 2. KELEMAHAN (ADVERSARIAL AUDIT) PENDekatan SECARA LANGSUNG

Sebelum merancang, audit failure modes:

1. **AgentBInspector bukan sekadar HTTP wrapper** — ia membawa kontrak operasi berat: universalPayload 4-kunci (stream wajib untuk hidupkan Caddy gateway, temperature 0.0), hierarki model dual-fasa, retry-same-model + failover sibling, circuit breaker, timeout berfasa 300s, stripReasoningTags, `buildUserPrompt` self-contained override. Refactor buta akan memusnahkan kontrak-kontrak ini yang dikunci oleh ~40+ ujian regresi dalam `agentB-inspector-regression.test.js`.
2. **Kontrak god-tier 4-kunci TIDAK boleh dipindahkan 1:1 ke pintu lain.** `stream:true` adalah ubat khusus penyakit Caddy/rootsys. Gemini Native mempunyai `streamGenerateContent` (SSE) sendiri; Anthropic mempunyai SSE `/messages` dengan event `content_block_delta` — tapi parameter `thinking`/`temperature` constraint Anthropic (temperature=1 bila thinking aktif, lihat [`isThinkingTemperatureConstraint`](../src/services/providers/anthropic.js:287)) mesti dihormati.
3. **Fakta empirikal ledger:** Fasa 0 pada Gemini 3 Flash `thinkingLevel low` = 6.4s vs Kimi 207s — tetapi kualiti bible (istilah + NULL discipline) Kimi lebih kaya. Jadi pintu Gemini perlu jalur thinking yang betul; pintu Anthropic perlu `thinking` block yang betul.
4. **Autodetect key ada limitasi fizikal:** `sk-...` adalah prefix generik OpenAI-style yang dipakai juga oleh DeepSeek, Moonshot, rootsys, dan banyak relay. `AIza...` = Google, `sk-ant-...` = Anthropic. Heuristik mesti berperingkat (prefix kuat → baseUrl hint → user override) dan TIDAK BOLEH jadi sumber kegagalan senyap — mesti ada fallback eksplisit.
5. **Invariant wajib dikekalkan:** (a) `systemInstruction` kekal top-level dalam Gemini — HARAM pindah ke `contents`; (b) baseline `npm test` semasa **313 / 312 PASS / 1 SKIP** — sebarang fasa mesti hijau penuh; (c) taksonomi nama kekal; (d) `.roomodes` tidak disentuh.

---

## 3. SENI BINA SASARAN (PROPOSAL)

### 3.1 Prinsip: satu kontrak laksana (duck-typing) + tiga adapter

Kod sedia ada sudah menunjukkan pola yang betul: [`runPreflightSemanticPass()`](../src/services/subfaberPreflight.js:524) menerima `provider` duck-typed (`translateSubtitle()` sahaja) — itulah sebabnya Fasa 0 boleh dijalankan oleh `AgentBInspector` ATAU enjin Gemini hari ini tanpa perubahan. Kita perlukan kontrak canai yang sama untuk Inspector.

**Lapisan baru dicadangkan — `AgentChannel` (provider channel untuk Trinity):**

```
src/services/agents/
  agentChannel.js          ← kontrak duck-typed: { complete(prompt, {systemPrompt, timeoutMs, signal}) }
  channels/
    openaiChannel.js       ← balut OpenAICompatibleProvider (universalPayload kekal untuk rootsys)
    geminiChannel.js       ← balut GeminiService (systemInstruction top-level, thinkingLevel low default)
    anthropicChannel.js    ← balut AnthropicProvider (system top-level, thinking constraints)
  keyDetector.js           ← autodetect format daripada apiKey + baseUrl + model hint
```

- `AgentBInspector` tidak lagi `extends OpenAICompatibleProvider` secara tegar; ia memiliki `channel` yang disuntik (komposisi > pewarisan). Laluan rootsys semasa = `openaiChannel` — **zero behavior change** untuk deployment produksi hari ini.
- Prompt Preflight/Inspector (`buildPreflightPrompt`, `INSPECTOR_INSTRUCTION`) **kekal verbatim** — sempadan system/user sudah format-agnostik.

### 3.2 Peta pintu × enjin selepas pembedahan

| Enjin | Gemini | OpenAI | Anthropic | Autodetect |
|---|---|---|---|---|
| Agent Preflight | 🎯 geminiChannel | ✅ kekal | 🎯 anthropicChannel | ya |
| Agent Translation | ✅ sedia | ✅ sedia | ✅ sedia | ya (baru di UI save) |
| Agent Inspector | 🎯 geminiChannel | ✅ kekal | 🎯 anthropicChannel | ya |

### 3.3 Autodetect format (keyDetector)

Peringkat keputusan (first-match, boleh dioverride manual):
1. **Prefix kuat:** `AIza` → gemini; `sk-ant-` → anthropic; `sk-`/`gsk_`/lain-lain → openai-compatible (default selamat).
2. **baseUrl hint:** mengandungi `generativelanguage` → gemini; `anthropic` → anthropic; selain itu → openai.
3. **Model hint:** `gemini-*` / `claude-*` sebagai pengukuhan.
4. **Override manual sentiasa menang** (dropdown "Format: Auto / Gemini / OpenAI / Anthropic") — autodetect mesti log keputusan (transparan, bukan senyap).
5. Autodetect berlaku di **server** semasa save config + semasa instantiasi channel; keputusan dicerminkan dalam log `[AgentChannel] format=... source=key-prefix|baseUrl|manual`.

### 3.4 Halatuju parameter per pintu (ground truth sedia ada dipelihara)

- **Gemini channel:** ikut [`getModelFamily`](../src/services/gemini.js) ground truth sepenuhnya (3.x-strict strip sampling; 2.5 full sampling + thinkingBudget integer). Fasa 0 default `thinkingLevel: 'low'` (empirikal 6.4s, elak DQ 300s high).
- **OpenAI channel:** kekal universalPayload 4-kunci `{model, messages, stream:true, temperature:0.0}` untuk laluan rootsys; laluan DeepSeek/Moonshot rasmi dibenarkan reasoning_effort mengikut [`applySmartModelPayload`](../src/services/providers/openaiCompatible.js:420).
- **Anthropic channel:** system top-level + `max_tokens` WAJIB; thinking adaptive; auto-retry compliance (temperature=1, drop top_p) sudah sedia dalam provider.

---

## 4. PELAN PELAKSANAAN BERFASE (cadangan)

| Fasa | Skop | Risiko | Ujian |
|---|---|---|---|
| **A** | `keyDetector.js` + unit test (prefix/baseUrl/model/override) — tiada wiring | Rendah | +~8 test |
| **B** | Ekstrak `agentChannel` kontrak; `AgentBInspector` diubah kepada komposisi dengan `openaiChannel` yang membungkus laluan semasa 1:1 | Sederhana (regresi 40+ test mesti hijau tanpa edit assertion) | 0 perubahan assertion |
| **C** | `geminiChannel` + `anthropicChannel` + wiring config (`agentB.format: auto`) + regression payload baharu per pintu | Sederhana tinggi | +~15-20 test (payload shape, system top-level, thinking) |
| **D** | UI: dropdown format Agent B + paparan keputusan autodetect (delegasi Frontend mode) | Rendah | — |
| **E** | Integrasi penuh Trinity × 3 pintu + validasi produksi VPS (Trinity ALL-GREEN semula pada kombinasi bukan-rootsys) | Tinggi (kos API) | E2E |

Setiap fasa: `npx prettier --check .` + `npx eslint .` + `npm test` (313/312/0/1 hijau) + ledger append.

---

## 5. KELULUSAN YANG DIPERLUKAN DARIPADA OWNER

1. Saham struktur `src/services/agents/` baharu (atau kekal dalam `src/services/` datar — tiada subfolder).
2. Fasa B: persetujuan refaktor `AgentBInspector` komposisi (warisan `extends` → channel injection) — ini satu-satunya pembedahan struktur yang menyentuh kod stabil.
3. Default autodetect semasa `agentB` hanya ada apiKey+baseUrl (tiada format): cadangan = openai-compatible (backward-compatible dengan deployment rootsys hari ini).
4. Sama ada laluan non-stream dibenarkan untuk pintu Gemini/Anthropic (cadangan: ya — stream adalah ubat Caddy, bukan keperluan format; keputusan empirikal Q1 ledger mengesahkan stream OFF untuk preflight Gemini).

---

## 6. RUMUSAN

- **Bukan pembinaan dari kosong** — Agent Translation sudah bertiga pintu; infrastruktur prompt sudah format-agnostik.
- **Pembedahan sebenar** = menyeragamkan Agent Preflight & Agent Inspector kepada kontrak channel + autodetect key.
- **Kontrak god-tier, circuit breaker, hierarki model, parser tahan lasak — SEMUA dikekalkan verbatim**; hanya lapisan pengangkutan diluaskan.
- Tiada kod diubah dalam sesi ini. Baseline kekal: 313 tests / 312 PASS / 0 FAIL / 1 SKIP.
