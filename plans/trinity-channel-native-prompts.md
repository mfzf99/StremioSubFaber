# Pelan Pembedahan: 3 Core + 9 Channel-Native Wrappers (Trinity Prompt Architecture)

- **Tarikh Pelan:** 2026-10-19
- **Status:** PERANCANGAN SAHAJA — SIFAR perubahan kod sehingga mandat pembedahan dikeluarkan Owner
- **Punca Kelulusan:** Mandat Owner 2026-10-19 (meluluskan penuh cadangan Backend "3 Kerangka Core + 9 Channel-Native Wrappers"; menolak 9 fail monolit berpecah)
- **Rujukan Ground Truth:**
  - [`plans/gemini-sampling-ground-truth-2026.md`](gemini-sampling-ground-truth-2026.md) + [`plans/trinity-params-ground-truth-2026.md`](trinity-params-ground-truth-2026.md)
  - [`plans/kimi-k3-rootsys-ground-truth-2026.md`](kimi-k3-rootsys-ground-truth-2026.md) (PAYLOAD-GODTIER 4-kunci)
  - Dokumentasi rasmi Context7 (2026-10-19): Anthropic prompt engineering (XML tags, data-first, prefill TIDAK disokong Claude 4.6+); OpenAI Structured Outputs (`json_schema` strict, hierarki `developer` > `user`)
  - Kod sedia ada: [`structuredPrompt.js`](../src/services/utils/structuredPrompt.js) (sentinel split), [`agentChannel.js`](../src/services/channels/agentChannel.js) (tri-door resolver), [`openaiCompatible.js`](../src/services/providers/openaiCompatible.js) (universalPayload), [`anthropic.js`](../src/services/providers/anthropic.js), [`gemini.js`](../src/services/gemini.js)

---

## 0. Ringkasan Eksekutif

Enjin SubFaber hari ini menggunakan SATU prompt per agent yang diangkut ke 3 pintu melalui sentinel `SUBFABER_PROMPT_BOUNDARY` + split di [`structuredPrompt.js`](../src/services/utils/structuredPrompt.js). Audit 2026-10-19 mengesahkan tiada prompt "bias Gemini" (semua arahan format-neutral), TETAPI setiap pintu mempunyai mekanisme output-enforcement RASMI yang tidak dieksploitasi penuh:

| Pintu | Mekanisme rasmi | Status semasa |
|---|---|---|
| Gemini Native | `systemInstruction` top-level + **prefill continuation** anchor `<s id="N">` | ✅ sudah dieksploitasi (satu-satunya pintu yang penuh) |
| OpenAI-Compatible | Peranan `developer`/`system` + **Structured Outputs `json_schema` strict** | ⚠️ separuh — `response_format` wujud tetapi DIGUGURKAN untuk semua gateway reasoner (PAYLOAD-GODTIER); tidak wujud pemilihan per-kelas-endpoint yang statik |
| Anthropic Messages | Medan `system` top-level + **XML tags konvensyen rasmi** + **susunan data-dahulu** (dokumen panjang di ATAS, query di HUJUNG) | ⚠️ separuh — split betul, tetapi susunan prompt songsang dengan best practice + prefill anchor `<answer>` tiada padanan arahan eksplisit |

**Matlamat pembedahan:** Gantikan "satu prompt + sesuaikan diri" dengan **3 kerangka core (Single Source of Truth) + 9 pembungkus channel-native**, dipilih secara STATIC semasa pembinaan provider — sifar guesswork dalam gelung terjemahan aktif.

**Kodrat perubahan:** Ini pembedahan PROMPT & DISPATCH sahaja — tiada perubahan taksonomi jenayah, tiada perubahan taksonomi 4-tiang, tiada perubahan rules parity, tiada perubahan behavior sampling (SEND-ALL DOCTRINE kekal utuh).

---

## 1. Struktur Direktori & Disiplin DRY (Single Source of Truth)

### 1.1 Struktur Fail Baharu

```
src/services/prompts/trinity/
  preflight/
    core.js          ← TAKSONOMI 4-TIANG + DECISION DISCIPLINE + FACT-VS-INFERENCE + skema JSON (SATU punca)
    gemini.js        ← wrapper: systemInstruction + arahan output
    openai.js        ← wrapper: developer/system role + json_schema strict (MAZHAB RASMI TUNGGAL)
    anthropic.js     ← wrapper: system + <text> XML wrap + data-dahulu + tiada prefill
  translation/
    core.js          ← Role + <translation_principles> + 6 Rules Parity + Reflect-in-One-Pass + injection few-shot pack
    gemini.js        ← wrapper: systemInstruction + prefill anchor <answer><s id="N"> (ENJIN SEBENAR)
    openai.js        ← wrapper: developer role + anchor sebagai arahan eksplisit (bukan prefill)
    anthropic.js     ← wrapper: system + <answer> sebagai tag XML kontrak + tiada prefill + data-dahulu
  inspector/
    core.js          ← 7 Jenayah (MERGE/DROP/PHANTOM/SHIFT/UNTRANSLATED/REGISTER/TERM) + Output Contract JSON
    gemini.js        ← wrapper: systemInstruction + arahan JSON
    openai.js        ← wrapper: developer/system role + json_schema strict (MAZHAB RASMI TUNGGAL)
    anthropic.js     ← wrapper: system + XML wrap <en>/<ms> + data-dahulu
  index.js           ← registry + resolveTrinityPrompt(agent, channel, options) — SATU pintu masuk
```

### 1.2 Kontrak Eksport `core.js` (setiap agent)

```js
module.exports = {
    // Blok teks kanonik — SATU punca kebenaran, tidak pernah mengandungi
    // arahan format pintu (tiada "Return ONLY" spesifik-pintu; itu tugas wrapper):
    roleBlock,            // Preflight: role + DECISION DISCIPLINE + FACT-VS-INFERENCE
                          // Translation: role Netflix + <translation_principles> + rules parity + style
                          // Inspector: role + taksonomi 7 jenayah + klausa keharmonian
    schemaContract,       // Preflight/Inspector: skema JSON kanonik (punca untuk json_schema strict OpenAI)
    outputContract,       // kontrak output neutral (anchor structure, id parity)
    buildDynamicBlock     // penyuntikan data dinamik (Bible context, <text>, <en>/<ms>, few-shot pack)
};
```

### 1.3 Kontrak Eksport Wrapper (setiap pintu)

```js
module.exports = {
    channel: 'gemini' | 'openai' | 'anthropic',
    buildPrompt(corePayload, options) → { systemPrompt, userPrompt, prefill?, responseFormat? }
    // gemini:    { systemPrompt, userPrompt, prefill: '<s id="N">' }  — prefill EKSKLUSIF Gemini
    // openai:    { systemPrompt(developer), userPrompt, responseFormat?: json_schema-strict-marker }
    // anthropic: { systemPrompt, userPrompt }  — SIFAR prefill (Claude 4.6+ + larangan thinking-mode)
};
```

### 1.4 Disiplin DRY Keras (keutamaan pengesahan pelan & code review)

1. **SIFAR** teks taksonomi berganda — satu ayat jenayah/rules wujud sekali sahaja di `core.js`. Wrapper dilarang menyalin/memparafrasa kandungan core; ia hanya MEMBUNGKUS.
2. **SIFAR** import lintasan (wrapper tidak import wrapper); semua komposisi melalui `index.js`.
3. Language packs ([`prompts/languagePacks/`](../src/services/prompts/languagePacks)) kekal di luar struktur ini — injection path melalui `core.buildDynamicBlock` sahaja (kekal target-conditional 400+ bahasa).
4. Sentinel `SUBFABER_PROMPT_BOUNDARY` **diabadikan sebagai laluan WARISAN** untuk custom prompt pengguna yang tidak melalui registry — [`structuredPrompt.js`](../src/services/utils/structuredPrompt.js) tidak dihapus.

---

## 2. Spesifikasi Kontrak Rasmi Setiap Pintu

### 2.1 Gemini Native (`gemini.js`)

- **System channel:** arahan statik → `systemInstruction` top-level `{ parts: [{ text }] }` (Rule #1 BACKEND — HARAM masuk `contents`; invariant sedia ada di [`geminiChannel.js`](../src/services/channels/geminiChannel.js) dikekalkan).
- **Prefill continuation anchor:** `<answer>\n<s id="${startId}">` di hujung user content — **EKSKLUSIF Gemini**. Mekanisme ini enjin sebenar ([gemini.js anchor fix PROMPT-SLIM](../src/services/gemini.js)); Smart Preamble Scrubber dalam `parseXmlBatchResponse` dikekalkan untuk membersihkan preambel patuh.
- **Preflight/Inspector:** arahan JSON standard + skema dalam systemInstruction; tiada `response_config` khas (parser tahan lasak kekal lapisan kesahan).
- **Pengecualian:** `getModelFamily` STRICT vs LEGACY (rule #3) tidak tersentuh — pelan ini hanya prompt, bukan sampling.

### 2.2 OpenAI-Compatible (`openai.js`) — MAZHAB RASMI TUNGGAL (KEPUTUSAN MUKTAMAD OWNER 2026-10-19)

Owner MENOLAK sub-mod dwi-cabang. SATU standard rasmi sahaja untuk SEMUA endpoint OpenAI-compatible, tanpa sebarang mod ganti — untuk Preflight & Inspector: `response_format: { type: 'json_schema', strict: true }` (Structured Outputs, dibina daripada `core.schemaContract`) bersama peranan `developer`/`system`. Standard rasmi diuji dahulu secara menyeluruh; jika isu latensi/overthinking timbul kelak, penalaan dibuat berdasarkan data empirikal sebenar, bukan andaian pra-matang. Translation kekal text biasa + anchor eksplisit (Structured Outputs tidak terpakai pada output sari kata XML).

- **Peranan:** mesej statik dihantar sebagai `role: 'system'` pada chat/completions standard; `developer` hanya bila endpoint membuktikan sokongan (laluan Responses API sedia ada dihormati). Kontrak hierarki: developer/system > user — bobot arahan parity dinaikkan.
- **Anchor Translation:** disebut sebagai **arah eksplisit** dalam developer/system message ("begin your output with `<answer>` and the first entry `<s id="N">`") — BUKAN prefill continuation (mekanisme itu tidak wujud dalam API OpenAI).

### 2.3 Anthropic Messages (`anthropic.js`)

- **System channel:** medan `system` top-level (sedia ada di [`anthropic.js`](../src/services/providers/anthropic.js)).
- **Susunan DATA-DAHULU (best practice rasmi Anthropic):** user content disusun `data → arahan` — data dinamik (`<text>`, `<input>`, `<en>/<ms>`) di ATAS, query/instruksi ringkas di HUJUNG. (Dokumen Anthropic: "Put longform data at the top… Queries at the end can improve response quality by up to 30%.") — INI PERBEZAAN STRUKTURAL terbesar dari prompt semasa.
- **XML tags konvensyen rasmi:** blok dinamik dibalut tag XML berkualiti (`<subtitle_input>`, `<answer_contract>`), selari amaran rasmi (tag mudah diimitasi → kekal sebagai pembatas data, bukan kawalan keselamatan).
- **LARANGAN MUTLAK PREFILL:** tiada assistant prefill dalam mana-mana wrapper Anthropic — mematuhi (a) Claude 4.6+ tidak menyokong prefill, (b) larangan prefill semasa `thinking` aktif (sedia dipatuhi). Anchor `<answer>` digantikan arahan eksplisit dalam system + ditutup query di hujung user.
- **JSON assurance:** Preflight/Inspector kekal pada parser tahan lasak (Anthropic tiada `response_format`; prefill `[` sedia ada pada laluan `enableJsonOutput` DIHENTIKAN untuk prompt Trinity baharu — arahan eksplisit + parser memadai).

---

## 3. Peta Penghantaran Statik (Static Dispatch)

### 3.1 Titik Sambung

```
Config (user) ──▶ resolveChannelFormat() [agentChannel.js, sedia ada]
                        ▼
              TrinityPromptRegistry.resolve(agent, channel)
                        │  (index.js — pilih wrapper, freeze pilihan)
                        ▼
        Engine (Preflight/Translation/Inspector) menerima { buildPrompt } terikat
                        │
                        ▼
        Provider transport (gemini.js / openaiCompatible.js / anthropic.js)
              — menerima { systemPrompt, userPrompt, prefill?, responseFormat? }
              — SIFAR cabangan if-channel dalam gelung terjemahan
```

### 3.2 Disiplin Penghapusan Guesswork

1. `resolveTrinityPrompt()` dipanggil **sekali setiap pembinaan provider/engine** (lazimnya sekali setiap permintaan fail); hasilnya di-freeze pada instance.
2. DILARANG: sebarang `if (format === ...)` di dalam `translateBatch` / `runPreflightPass` / `runInspection` — cabangan format hidup HANYA dalam wrapper + provider transport.
3. Laluan custom prompt pengguna (textarea konfigurasi) terus menggunakan laluan warisan sentinel — tidak dipaksa ke registry.
4. Cache key terjemahan mesti mengekalkan semantik sedia ada; medan channel ditambah hanya bila prompt berbeza secara tekstual antara pintu (elak cache poisoning merentas pintu).

---

## 4. Matriks Ujian & Keselamatan Regresi

### 4.1 Suite Baharu: `src/services/trinity-prompt-matrix-regression.test.js` (9 sel)

| Sel | Assertion kontrak wajib |
|---|---|
| preflight × gemini | systemInstruction top-level; tiada prefill; skema dalam system; sentinel TIDAK bocor |
| preflight × openai | developer/system role + `json_schema strict` dibina dari `core.schemaContract`; strict:true; additionalProperties:false — MAZHAB RASMI TUNGGAL untuk semua endpoint |
| preflight × anthropic | data-first (`<text>` mendahului arahan); system top-level; SIFAR prefill |
| translation × gemini | prefill anchor `<answer>\n<s id="N">` hadir di hujung user content (ENJIN continuation) |
| translation × openai | anchor sebagai ARAHAN EKSPLISIT (string arahan hadir); TIADA prefill mekanikal; developer/system role |
| translation × anthropic | data-first (Bible `<input>` di atas, query di hujung); `<answer>` sebagai tag kontrak XML; SIFAR prefill; susunan diverifikasi indexOf |
| inspector × gemini | systemInstruction top-level; Output Contract JSON dalam system |
| inspector × openai + anthropic | selari kontrak preflight (skema strict vs data-first) |

### 4.2 Parity Test Anti-Drift (Kualiti BM)

1. **Core-identity test:** semua 9 sel mesti mengandungi frasa taksonomi kanonik dari `core.js` (contoh: `ANTI-MERGE`, `DECISION DISCIPLINE`, `MERGE: Two source lines merged`) — mengesahkan tiada pintu menjatuhkan kandungan core.
2. **Translation↔Inspector harmony:** definisi jenayah dalam `inspector/core.js` mesti terus dipetakan 1:1 kepada rules dalam `translation/core.js` (sambungan langsung kontrak [HARMONY-FIX 2026-09-29](../src/services/agentInspector.js)) — test assert kewujudan label ANTI-* ↔ jenayah berpasangan.
3. **Bahasa Melayu sentinel metrics:** metrik Jaccard istilah (baseline 0.72 Fasa G) dikekalkan sebagai ujian integrasi manual dalam pelan validasi (bukan unit test) — dijadualkan semasa Fasa 4 sebelum release.

### 4.3 Jaminan Baseline

- **Monotonik ketat:** jumlah ujian ≥ 428; sasaran pasca-pembedahan ≥ 428 + (9 sel matriks + parity tests) ≈ 442–448; **0 FAIL, maks 1 SKIP** (live Redis).
- Suite warisan yang menguji laluan lama ([`subfaber-context-regression.test.js`](../src/services/subfaber-context-regression.test.js), [`subfaber-fasah-regression.test.js`](../src/services/subfaber-fasah-regression.test.js), [`channels-triDoor-phaseC-regression.test.js`](../src/services/channels-triDoor-phaseC-regression.test.js), 40+ ujian AgentInspector) mesti hijau **tanpa edit assertion** untuk laluan yang tidak berubah; assertion yang mengunci teks prompt lama dinaik taraf mengikut fasa (lihat 5.4).

---

## 5. Fasa Pelaksanaan Berperingkat (Phased Rollout)

> Setiap fasa berakhir dengan `npx jest <fail-sasaran>` hijau + komit terasing melalui pipeline 8-langkah penuh. Fasa berikut tidak bermula sebelum CI hijau.

### Fasa 1 — Struktur Core (PEMBINAAN, sifar integrasi)
1. Bina `src/services/prompts/trinity/{preflight,translation,inspector}/core.js` + `index.js` — kandungan dipindahkan VERBATIM dari punca sedia ada ([`subfaberPreflight.js`](../src/services/subfaberPreflight.js) blok statik, [`translationEngine.js createXmlBatchPrompt`](../src/services/translationEngine.js) systemPart, [`agentInspector.js INSPECTOR_INSTRUCTION`](../src/services/agentInspector.js)). Fail lama masih punca aktif — core.js belum dirujuk produksi.
2. Refactor dalaman: fail lama `require()` core.js dan guna sebagai punca (behavior identik, prompt tekstual identik). Full `npm test` mesti 428 hijau — tiada assertion berubah.

### Fasa 2 — Unit Wrappers (9 pembungkus + matriks ujian)
1. Bina 9 wrapper pintu + sub-mod dwi-cabang OpenAI (official vs gateway).
2. Bina `trinity-prompt-matrix-regression.test.js` (9 sel + parity tests) — menguji wrapper secara unit (tiada wiring produksi lagi).
3. Endpoint-class resolver statik dalam `agentChannel.js` + medan konfigurasi (normalizeConfig — hormat rule #2: hanya medan baharu diperlukan; purge rules dikekalkan).

### Fasa 3 — Wiring Produksi (Static Dispatch)
1. [`translationProviderFactory`](../src/services/translationProviderFactory.js) / [`agentChannel`](../src/services/channels/agentChannel.js) / AgentInspector mengambil `buildPrompt` terikat daripada registry — sekali setiap pembinaan.
2. Provider transport menerima `{ systemPrompt, userPrompt, prefill?, responseFormat? }`: Gemini path guna prefill sedia ada; OpenAI path aktifkan `response_format` strict untuk endpointClass official; Anthropic path susun data-dahulu + buang prefill laluan Trinity.
3. Naik taraf assertion suite warisan yang mengunci teks/struktur prompt lama (dokumen setiap perubahan assertion dalam CHANGELOG — auditability).
4. Kekalkan laluan warisan sentinel untuk custom prompt; kekalkan Smart Preamble Scrubber.

### Fasa 4 — Pipeline Pelepasan SemVer
1. Minor bump (fitur baharu: `4.x` → rangka sedia ada; cadangan Backend: **v3.15.0**).
2. CHANGELOG entri penuh + rujukan pelan ini.
3. Validasi kualiti BM (Jaccard manual spot-check pada pintu Anthropic & gateway — pintu yang menerima perubahan struktur terbesar).
4. Prettier + ESLint + `npm test` (baseline monotonik ≥ 428 + suite baharu, 0 FAIL) → graphify (NO-OP jika tiada runtime/out) → SESSION_LEDGER → commit/push → `gh run watch` SUCCESS.

### Risiko & Pengurangan (Adversarial)

| Risiko | Pengurangan |
|---|---|
| Prompt drift merosakkan kualiti BM (Jaccard 0.72) | Core verbatim di Fasa 1 + parity tests + spot-check manual Fasa 4 |
| `response_format` merosakkan gateway reasoner | Sub-mod statik — god-tier payload TIDAK berubah untuk kimi/glm/deepseek; test sel mengunci HARAM response_format |
| Cache poisoning merentas pintu (prompt berbeza tekstual) | Audit cache key Fasa 3 — sertakan channel dalam derivasi key bila prompt berbeza |
| Custom prompt pengguna rosak | Laluan warisan sentinel dikekalkan; tiada paksaan registry |
| Prefill Anthropic violation (4.6+ / thinking) | Wrapper Anthropic SIFAR prefill oleh reka bentuk; test sel mengunci |

---

## 6. Deliverable & Pintu Kelulusan

- **Dokumen ini** = deliverable Fasa Perancangan. Kod SIFAR disentuh.
- Pintu kelulusan seterusnya: Owner semak ringkasan eksekutif ini → keluarkan [MANDAT PEMBEDAHAN: FASA 1] untuk mula pelaksanaan berperingkat.
