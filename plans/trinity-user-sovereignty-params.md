# Pelan Pembedahan: Kedaulatan Parameter Pengguna 100% (Trinity Total Unlock)

- **Tarikh Pelan:** 2026-10-19
- **Status:** PERANCANGAN SAHAJA — SIFAR perubahan kod sehingga mandat pembedahan dikeluarkan Owner
- **Mandat Owner 2026-10-19:** Semua agent Trinity (Preflight, Translation, Inspector) mesti mematuhi 100% parameter yang diset pengguna di UI SubFaber. Tiada lagi sekatan/kunci tersembunyi di belakang. Bebaskan semua kunci hardcoded yang mengganggu model selama ini. Termasuk audit penuh mandat/pembedahan lama yang seumpama.
- **Rujukan:** [`plans/trinity-params-ground-truth-2026.md`](trinity-params-ground-truth-2026.md), [`plans/gemini-sampling-ground-truth-2026.md`](gemini-sampling-ground-truth-2026.md), [`plans/trinity-channel-native-prompts.md`](trinity-channel-native-prompts.md)

---

## 0. Audit Mandat Lama yang Sepada (Permintaan Owner)

Empat mandat/pembedahan terdahulu berkaitan parameter — status masing-masing pada HEAD v3.15.0:

| Mandat | Tarikh | Status Semasa | Perkara yang masih bertentangan dengan mandat baharu |
|---|---|---|---|
| **SEND-ALL DOCTRINE** | 2026-10-16 | Dilaksana & aktif — gate `omitSampling`/`applyFrontierModelRules` digugurkan | Sudah sebahagian jalan tujuan ini, TETAPI hanya untuk laluan Translation; laluan god-tier Inspector & clamp `fixed` capability map masih memintas nilai user |
| **Pembedahan Pengasingan Parameter Pintu OpenAI-Compatible** (v3.14.2) | 2026-10-18 | Dilaksana & aktif — reasoning lalai Translation 'disabled', Inspector god-tier terpisah | Laluan Inspector masih `temperature: 0.0` hardcoded (K1); ALWAYS-ON families masih dipaksa 'low' (K4) |
| **TRINITY PARAMS FASA 3** (v3.9.46, 2026-10-15) | laluan | Dilaksana & aktif — 4 slot ejen + sanitasi capability map | Sanitasi inilah yang mencipta clamp `fixed` senyap (K2) dan auto-fill lalai ejen (K3) yang kini perlu dibebaskan |
| **Mazhab Rasmi Tunggal OpenAI** (v3.15.0, 2026-10-19) | laluan | Dilaksana & aktif — `response_format json_schema strict` Inspector | Tidak bertentangan; `stream: true` kekal sebagai keperluan infrastruktur (bukan parameter model) |

**Kesimpulan audit:** Tiada mandat lama yang perlu di-revert — semuanya perlu dITERUSKAN sehingga logik akhirnya: nilai user dihantar apa adanya.

---

## 1. Inventori Kunci Tersembunyi (Audit Forensik Kod, 2026-10-19)

| # | Kunci | Lokasi | Kesan kepada Pengguna |
|---|---|---|---|
| **K1** | Laluan god-tier `universalPayload`: `temperature: 0.0` hardcoded | [`openaiCompatible.js`](../src/services/providers/openaiCompatible.js) `buildChatRequest` (~baris 466) | Inspector/Preflight: user set temp di UI → dihantar 0.0 |
| **K2** | `sanitizeAgentParams`: clamp `descriptor.fixed` senyap (kimi-k3 temp 1.0 / topP 0.95) | [`modelCapabilities.js`](../src/utils/modelCapabilities.js) (~baris 376-385) | User set temp 0.7 → dicampak balik 1.0 tanpa dimaklumkan |
| **K3** | `sanitizeAgentParams`: auto-fill `out[name] = defaults[name]` (AGENT_TUNING_BASE) | [`modelCapabilities.js`](../src/utils/modelCapabilities.js) (~baris 405-408) | Medan yang user TIDAK set tetap dihantar dengan nilai lalai ejen (enjin mencipta nilai yang tidak diminta) |
| **K4** | `applySmartModelPayload`: keluarga ALWAYS-ON (GLM-5.3/Kimi-k3) abaikan 'disabled' → paksa 'low'; Claude dipaksa `thinking: adaptive` | [`openaiCompatible.js`](../src/services/providers/openaiCompatible.js) (~baris 287-391) | User pilih 'disabled' → tetap dapat 'low'/'adaptive' |
| **K5** | `applySmartModelPayload`: `effort = rawEffort \|\| 'disabled'` — lalai paksa | sama (~baris 289) | User kosongkan → enjin mencipta 'disabled' (bukan "tiada parameter") |
| **K6** | `providers/anthropic.js`: constructor clamp temp 0–2 / topP 0–1 + auto-force temp 1.0 bila thinking | [`anthropic.js`](../src/services/providers/anthropic.js) (~baris 22-25, 80-88) | Nilai di luar julat clamp diam-diam; thinking aktif menimpa temp user |
| **K7** | `anthropicChannel`: `ANTHROPIC_MAX_TOKENS_CAP = 64000` clamp | [`anthropicChannel.js`](../src/services/channels/anthropicChannel.js) (~baris 17-41) | Siling API sebenar — kekalkan sebagai amaran, bukan clamp senyap |
| **K8** | `geminiProfile` STRICT: descriptor temperature/topP tidak diisytihar → UI sembunyikan medan | [`modelCapabilities.js`](../src/utils/modelCapabilities.js) (~baris 89-101) | Enjin hantar (SEND-ALL) tetapi UI tidak benarkan user set |
| **K9** | `getCappedMaxOutputTokens`: `Math.max(raw, 65536)` bagi model reasoning | [`openaiCompatible.js`](../src/services/providers/openaiCompatible.js) (~baris 630-639) | User set maxOutputTokens 4096 → dihantar 65536 |
| **K10** | `buildTokenBudgets` Anthropic: gabung output+thinking lalu cap 200k | [`anthropic.js`](../src/services/providers/anthropic.js) (~baris 126-155) | Siling API sebenar — kekalkan (elak 400 pasti), tambah amaran |

**Kodrat perubahan:** Fasa ini membebaskan **parameter generation sahaja** (sampling, reasoning/thinking, max tokens). Ia TIDAK menyentuh: timeout, retry/backoff, siling konteks keselamatan preflight (250k), sane caps parser Inspector (10 id/120 aksara), circuit breaker, atau struktur protokol (systemInstruction top-level, response_format mazhab rasmi).

---

## 2. Prinsip Teras: TIGA PERINGKAT

| Peringkat | Maksud | Tindakan |
|---|---|---|
| **P1 — Nilai Lalai UI** | Cadangan awal apabila user belum sentuh (cth. temp 0.3) | **KEKAL** — ini UX. UI tunjuk nilai cadangan; user bebas ubah. |
| **P2 — Validasi Kebolehlaksanaan** | Julat sah API & enum | **AMARAN, BUKAN clamp senyap.** Nilai user dihantar apa adanya; jika 400, itu keputusan pelayan. |
| **P3 — Kunci Tersembunyi** | Enjin menimpa/mencipta nilai tanpa pengetahuan user | **BEBASKAN SEMUA (K1–K6, K9).** |

**Prinsip baharu — USER-FIRST ABSOLUTE:**
> Jika pengguna menetapkan nilai eksplisit di UI, enjin MESTI menghantarnya apa adanya. Jika pengguna TIDAK menetapkan, enjin TIDAK menghantar parameter itu sama sekali (model guna lalai pelayannya sendiri). Enjin tidak lagi "membantu" memilih nilai.

**Kekangan yang dikekalkan (bukan parameter model):**
- `systemInstruction` top-level (Rule #1) — struktur protokol.
- `response_format json_schema strict` Inspector — Mazhab Rasmi Tunggal (Keputusan Owner 2026-10-19).
- `stream: true` Inspector — keperluan infrastruktur Caddy 300s. (Sila sahkan dengan Owner: jadikan toggle UI? — soalan terbuka #1.)
- `max_tokens` MANDATORI Anthropic — jika user tak set, gunakan lalai UI 32768 (bukan clamp senyap ke atas nilai user bawah siling).

---

## 3. Peta Pembedahan Mengikut Fail

### 3.1 `src/services/providers/openaiCompatible.js`

**(a) K1 — god-tier conditional (buildChatRequest):**
```js
if (this.universalPayload === true) {
    const universalBody = { model: this.model, messages, stream: stream === true };
    // [USER-SOVEREIGNTY] Hantar HANYA nilai eksplisit user — sifar penciptaan nilai.
    if (this.temperature !== undefined && this.temperature !== null) {
        universalBody.temperature = this.temperature;
    }
    if (this.topP !== undefined && this.topP !== null) universalBody.top_p = this.topP;
    if (this.presencePenalty !== undefined) universalBody.presence_penalty = this.presencePenalty;
    if (this.frequencyPenalty !== undefined) universalBody.frequency_penalty = this.frequencyPenalty;
    ...
}
```
NotA adversarial: laluan `__activeAgentParams` override AgentInspector (F3-F5 trinity-params) kekal — ia sudah sunnat "kunci tambahan eksplisit".

**(b) K4 + K5 — applySmartModelPayload explicit-only:**
```js
applySmartModelPayload(body, modelName, rawEffort) {
    const m = String(modelName || '').toLowerCase();
    // [USER-SOVEREIGNTY] Tiada nilai eksplisit → JANGAN sentuh body (model guna lalai pelayan).
    if (rawEffort === undefined || rawEffort === null || String(rawEffort).trim() === '') return;
    const effort = String(rawEffort).trim().toLowerCase();
    const isDisable = effort === 'disabled' || effort === 'none' || effort === 'no_think';
    // Pemetaan keluarga KEKAL (terjemahan effort → dialect vendor), TETAPI:
    //   - Keluarga ALWAYS-ON (GLM-5.3/Kimi-k3) + isDisable → RETURN tanpa parameter
    //     (bukan paksa 'low') — biar model guna lalai semula jadinya.
    //   - Claude: hanya set thinking/adaptive BILA user set effort eksplisit.
}
```

**(c) K9 — getCappedMaxOutputTokens:** buang `Math.max(raw, 65536)`; kekalkan clamp atas siling API sahaja (`131072`); clamp bawah `1` (bukan 1024). Nilai tiada → lalai UI (bukan dipaksa naik).

### 3.2 `src/utils/modelCapabilities.js`

**(a) K2 — buang clamp `fixed`:** nilai user dihantar apa adanya + `log.warn` (bukan debug senyap) memaklumkan pelayan mungkin tolak. Buang `out[name] = descriptor.fixed`.

**(b) K3 — buang auto-fill lalai:** padam blok `for (const name of Object.keys(defaults)) { if (out[name] === undefined) out[name] = defaults[name]; }`. `sanitizeAgentParams` hanya memulangkan medan yang user benar-benar set. `getAgentDefaultParams` KEKAL — tetapi hanya untuk paparan lalai UI.

**(c) K8 — pulihkan descriptor STRICT Gemini:** tambah semula `temperature`/`topP` dengan `uiHint: 'server-strips-for-this-model'` supaya UI memaparkan medan + nota; enjin terus hantar (SEND-ALL). `kimiProfile`: buang `{fixed:...}`, tukar kepada julat normal + `notes` panduan.

**(d) `agentParamsDeviateFromDefault`** — kekal (pencetus `bypassCache`) tetapi kini deviasi diukur terhadap medan eksplisit sahaja.

### 3.3 `src/services/providers/anthropic.js`

**(a) K6 — buang clamp constructor + auto-force temp 1.0:** simpan nilai mentah user (validate nombor sahaja). Dalam `buildRequestBody`, hantar temp user apa adanya walaupun thinking aktif; 400 daripada pelayan (thinking memerlukan 1.0) adalah maklum balas sah kepada user — UI papar nota `thinking-locks-temperature-1.0` (sedia ada dalam profil).

**(b) K10 — buildTokenBudgets kekal** (cap 200k elak 400 pasti) + tambah `log.warn` bila cap diaktifkan.

### 3.4 `src/utils/config.js`

- `normalizeTrinityAgentParams`: params kosong → `slot.params = null` (bukan objek lalai) — membenarkan enjin bezakan "tidak set" vs "set kepada lalai".
- `agentParamsDeviateFromDefault` pencetus bypassCache kekal.

### 3.5 `src/services/agentInspector.js`

- Semak `openaiChannel.buildSuperOptions`: nilai `temperature`/`topP` yang dihantar kepada constructor asas mesti datang daripada `inspectorParams` (sudah sebahagian, F2-F5) — pastikan sifar hardcode 0.0 tersisa dalam channel builder.

### 3.6 `src/services/channels/anthropicChannel.js` (K7)

Kekal `ANTHROPIC_MAX_TOKENS_CAP = 64000` (siling API sebenar — sahkan semula via Context7 semasa pelaksanaan) tetapi: nilai user bawah siling dihantar apa adanya; nilai melebihi → `log.warn` jelas + clamp (elak 400 pasti) — atau hantar mentah mengikut keputusan Owner (soalan terbuka #2).

---

## 4. Perubahan UI (DELEGASI FRONTEND — WAJIB `switch_mode`)

1. Paparkan SEMUA medan parameter untuk SEMUA model (buang `supportsTemperature=false` untuk STRICT Gemini; gunakan `uiHint` + nota).
2. Nota "pelayan mengekang" per `notes`/`uiHint`.
3. (Terbuka) Toggle streaming Inspector.
4. Playwright verification + handover balik backend.

---

## 5. Matriks Ujian & Keselamatan Regresi

### 5.1 Suite baharu `src/utils/user-sovereignty-params-regression.test.js` (S1–S10)

| Test | Kontrak |
|---|---|
| S1 | kimi-k3: user temp 0.7 → output 0.7 + log.warn (bukan 1.0) |
| S2 | medan tidak set → TIDAK muncul dalam output sanitasi |
| S3 | `applySmartModelPayload` rawEffort kosong → body tidak disentuh |
| S4 | kimi-k3 + 'disabled' → tiada `reasoning_effort`/`thinking` dihantar |
| S5 | god-tier: user temp 0.8 → `body.temperature === 0.8` |
| S6 | god-tier: temp tidak set → tiada kunci temperature |
| S7 | Anthropic: temp 1.5 diterima tanpa clamp |
| S8 | `getCappedMaxOutputTokens`: 4096 → 4096 (bukan 65536) |
| S9 | Gemini STRICT: descriptor temperature/topP wujud |
| S10 | params kosong → `slot.params === null` |

### 5.2 Naik taraf assertion warisan (dokumentasi audit telus)
- `agent-inspector-regression.test.js` [PAYLOAD-GODTIER]: "temp 0.0 WAJIB" → "temp hanya bila user set".
- `trinity-params-regression.test.js` A4 (Kimi FIXED): → "nilai dihormati + warn". B2 (sanitasi clamp): → "tiada clamp fixed". AD1/AD2 (lalai ejen): → "lalai = UI sahaja, bukan dihantar".
- `channels-triDoor-phaseC-regression.test.js`: Anthropic max_tokens — kekal (siling API) atau selari keputusan soalan terbuka #2.

### 5.3 Baseline
- Monotonik: 451 → **sasaran ≥ 461** (+S1–S10), 0 FAIL, maks 1 SKIP.

---

## 6. Risiko Adversarial & Pengurangan

| Risiko | Kesan | Pengurangan |
|---|---|---|
| 400-error meningkat (nilai tak sah dihantar) | TINGGI | UI papar julat + nota; `log.warn` jelas; retry/failover sedia ada. Kos ini diterima Owner secara eksplisit ("pelayan tentukan sendiri"). |
| Overthinking/latensi kembali (kimi/glm tanpa 'disabled' paksa) | SEDERHANA | Tiada parameter dihantar = model guna lalai semula jadi (neutral, bukan 'low'). User yang mahu boleh set eksplisit. |
| Kualiti BM berubah bila user set temp tinggi | SEDERHANA | Pilihan user; UI syorkan 0.3; parity tests kekal. |
| Cache poisoning | RENDAH | `agentParamsDeviateFromDefault` → bypassCache automatik kekal. |
| Regresi Gemini | RENDAH | Perubahan tertumpu OpenAI/Anthropic + capability map. |

---

## 7. Fasa Pelaksanaan

1. **Fasa 1 — Backend Core:** §3.1–3.5 + suite S1–S10 + naik taraf assertion warisan → `npm test` ≥ 461 hijau.
2. **Fasa 2 — Frontend (WAJIB delegasi):** §4 + Playwright + handover.
3. **Fasa 3 — Release:** pipeline 8-langkah, SemVer **v3.16.0** (minor — perubahan tingkah laku parameter), CHANGELOG, ledger, CI SUCCESS.

---

## 8. Soalan Terbuka untuk Owner (sebelum mandat Fasa 1)

1. `stream: true` Inspector — kekal wajib (infrastruktur) atau dijadikan toggle UI?
2. Clamp siling API keras (Anthropic 64000 / OpenAI 131072 / total 200k) — kekal sebagai "warn + clamp" (elak 400 pasti) atau hantar mentah dan biar pelayan tolak?
3. `AGENT_TUNING_BASE` (lalai per-ejen) — kekal sebagai nilai cadangan UI, atau UI mula kosong sepenuhnya?
