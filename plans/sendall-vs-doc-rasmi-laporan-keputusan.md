# LAPORAN KEPUTUSAN: SEND-ALL DOCTRINE vs DOKUMEN RASMI GOOGLE (Gemini 3.6+ Sampling/Penalty)

**Tarikh:** 2026-10-25
**Status:** LAPORAN BUKA — tiada keputusan dibuat, tiada kod diubah. Dokumen ini membekalkan kedua-dua pihak (mazhab projek & dokumen rasmi) secara verbatim dan berimbang untuk AI keputusan Owner.

---

## BAHAGIAN A — MAZHAB PROJEK SEMASA (SEND-ALL DOCTRINE)

### A1. Teks mandat verbatim (komen kod, [`buildGenerationConfig()`](../src/services/gemini.js:784))

> `[MANDAT OWNER 2026-10-16 — SEND-ALL DOCTRINE] Gate STRICT-stripping DIGUGURKAN: temperature/topP/penalty WAJIB dihantar untuk SEMUA keluarga 3.x (STRICT & LEGACY). Tujuan: pemerhatian empirikal behaviour pelayan sebenar — biar pelayan provider tentukan sendiri (terima / abaikan / 400). Histori: 3.6+ pernah di-strip senyap berdasarkan ground truth lama; doktrin baharu mengatasi sementara sehingga pemerhatian Owner selesai. topK kekal tidak dihantar (haram sejak v1.6.0 — nucleus sampling).`

### A2. Tingkah laku kod semasa (apa yang sebenarnya berlaku dalam payload)

[`buildGenerationConfig()`](../src/services/gemini.js:784) menghasilkan `generationConfig` mengikut cabang keluarga:

**Cabang 1 — Gemini 3.x (STRICT & LEGACY), `thinking: 'level'`:**
```js
const levelConfig = {
    maxOutputTokens,
    thinkingConfig: { thinkingLevel: effectiveLevel }  // sanitized → 'low' fallback
};
if (this.temperature !== undefined) levelConfig.temperature = this.temperature;
if (this.topP !== undefined) levelConfig.topP = this.topP;
if (this.frequencyPenalty !== undefined) levelConfig.frequencyPenalty = this.frequencyPenalty;
if (this.presencePenalty !== undefined) levelConfig.presencePenalty = this.presencePenalty;
return levelConfig;
```
→ SEMUA parameter dihantar tanpa mengira klasifikasi STRICT/LEGACY. Gate stripping telah digugurkan sepenuhnya.

**Cabang 2 — Gemini 2.5, `thinking: 'budget'`:** `temperature` + `topP` + kedua-dua penalty (jika ditetapkan) + `thinkingConfig.thinkingBudget` (integer, clamp Pro min 128).

**Cabang 3 — 1.5/2.0/Gemma/unknown:** sampling penuh, tiada thinkingConfig.

**Sumber nilai parameter (constructor, baris 623-664):**
| Parameter | Lalai | Sumber override |
| --- | --- | --- |
| `temperature` | `0.2` | `advancedSettings.temperature` / env `GEMINI_TEMPERATURE` |
| `topP` | `0.95` | `advancedSettings.topP` / env `GEMINI_TOP_P` |
| `frequencyPenalty` | `undefined` (tidak dihantar) | `advancedSettings` / env `GEMINI_FREQUENCY_PENALTY` |
| `presencePenalty` | `undefined` (tidak dihantar) | `advancedSettings` / env `GEMINI_PRESENCE_PENALTY` |
| `thinkingLevel` | profile.default model | `advancedSettings` / env `GEMINI_THINKING_LEVEL` |
| `topK` | — HARAM, tidak wujud dalam kod sejak v1.6.0 | — |

**Nota penting:** Dalam konfigurasi lalai, `frequencyPenalty`/`presencePenalty` adalah `undefined` dan TIDAK dihantar. Ia hanya masuk payload jika Owner/pengguna menetapkannya secara eksplisit melalui env atau advanced settings. Ini mengurangkan risiko 400 hari ini — tetapi doktrin send-all membenarkan penghantaran bila ditetapkan, dan di situlah pertembungan dengan dokumen rasmi.

### A3. Klasifikasi keluarga model semasa ([`getModelFamily()`](../src/services/gemini.js:146))

| Keluarga | Contoh | `sampling` | `thinking` |
| --- | --- | --- | --- |
| `3.x-strict` | 3.6+, 3.5-flash-lite, 3.5-flash, 3.7-flash (whitelist reroute v3.9.46), alias `-latest`, Gemini 4-9 | `stripped` *(kini diabaikan oleh SEND-ALL)* | `level` |
| `3.x-legacy` | 3.0, 3.1 | `warn-default-1.0` *(kini diabaikan oleh SEND-ALL)* | `level` |
| `2.5` | 2.5 Pro/Flash/Flash-Lite | `full` | `budget` |
| `2.0` / `1.5` / `gemma` / `unknown` | — | `full` | `none` |

Bidang `sampling` pada hasil `getModelFamily()` masih wujud tetapi tidak lagi mengetuai sebarang gate — doktrin send-all mengatasi. (Klasifikasi ini juga digunakan oleh lapisan lain — contoh kontrak penghantaran penalty dalam enjin — jadi ia tidak boleh dibuang tanpa audit pemanggil.)

### A4. Rasional asal doktrin (daripada histori mandate)

1. **Pemerhatian empirikal**: owner mahu melihat sendiri bagaimana pelayan sebenar (Google rasmi + gateway proksi Gemini-native) melayani parameter tersebut, bukan mengstripping berdasarkan anggapan dokumen.
2. **Dokumen vs realiti**: ground truth lama (ai.google.dev/deprecations, disedut 2026-09-24) mengesahkan penamatan pensampelan 21 Julai 2026, tetapi gelagat tepat pelayan (abaikan senyap vs 400) hanya boleh disahkan melalui ujian langsung.
3. **Gate stripping lama pernah wujud**: minor >= 6 → strip temperature/topP. Gate ini telah digugurkan oleh mandat 2026-10-16.
4. **topK dikecualikan daripada doktrin**: kekal haram (nucleus sampling, Holtzman 2019) — doktrin send-all tidak merangkumi topK.

---

## BAHAGIAN B — DOKUMEN RASMI TERKINI (docs.cloud.google.com, disedut 2026-10-25, halaman last updated 2026-10-22 UTC)

### B1. Kenyataan rasmi verbatim (halaman Inference, seksyen `generationConfig.temperature`)

> **"Warning:** For Gemini 3.6 Flash and later models, custom values for sampling parameters (`temperature`, `topP`, and `topK`) aren't supported and are ignored if set, and custom values for penalization parameters (`frequencyPenalty` and `presencePenalty`) return an error. Remove these parameters from your requests."

### B2. Pemecahan implikasi per parameter (model Gemini 3.6 Flash dan kemudian)

| Parameter | Gelagat pelayan rasmi | Implikasi |
| --- | --- | --- |
| `temperature` | **DIABAIKAN senyap** (ignored if set) | Tidak bererror, tetapi tiada kesan |
| `topP` | **DIABAIKAN senyap** | Tidak bererror, tetapi tiada kesan |
| `topK` | **DIABAIKAN senyap** | Tidak relevan — sudah haram v1.6.0 |
| `frequencyPenalty` | **PULANGKAN ERROR** | Request gagal dengan ralat (bukan senyap) |
| `presencePenalty` | **PULANGKAN ERROR** | Request gagal dengan ralat (bukan senyap) |
| `thinkingConfig.thinkingLevel` | Disokong (MINIMAL\*/LOW/MEDIUM/HIGH; *MINIMAL tidak disokong Gemini 4) | Mekanisme rasmi kawalan reasoning 3.x |
| `thinkingConfig.thinkingBudget` | Deprecated (Gemini 3), 400 INVALID_ARGUMENT (Gemini 4) | Jangan hantar ke 3.x/4.x |
| `maxOutputTokens` | Disokong | Kekal |
| `responseMimeType` + `responseSchema` | Disokong; JSON valid 100% hanya bila KEDUA-DUA hadir | Kekal |

### B3. Senarai model yang dokumen rasmi kini kenali sebagai generasi terkini

Gemini 4 Argon (Cyber Permissive/Argon), 3.8 Live/Flash, 3.7 Flash, 3.6 Flash, 3.5 Flash-Lite/Flash, 3.1 Pro (preview)/Flash-Lite, 3 Flash (preview), 2.5 series, plus varian khas (Nano Banana 2.1, 3.1 Flash Image, 3 Pro Image).

### B4. Nota `systemInstruction` (sah — tiada pertembungan)

Dokumen rasmi mengesahkan `systemInstruction` field top-level bertipe `Content` (`{ role, parts: [{ text }] }`), `role` diabaikan pelayan. Kod projek sudah patuh sepenuhnya — tiada isu.

### B5. Nota `continuationToken` (baru, belum relevan)

Long decode sehingga 1,048,576 token pada Gemini 4 melalui `continuationToken` — hanya `v1beta1`. Endpoint projek sudah `v1beta` (L17). Belum diperlukan kerana `maxOutputTokens` projek 65,536 < had per-request.

---

## BAHAGIAN C — MATRIKS PERTENGAHAN (untuk AI keputusan)

### C1. Senario gelagat gabungan (kod semasa × dokumen rasmi)

| Model | temperature/topP dihantar? | Penalty dihantar? (bila ditetapkan) | Gelagat pelayan 3.6+ | Hasil bersih |
| --- | --- | --- | --- | --- |
| 3.6+ / 3.5-flash (reroute) / 3.7-flash / `-latest` / 4+ | Ya (send-all) | Ya (send-all) | sampling diabaikan; penalty **ERROR** | ✅ Selamat HANYA jika penalty tidak ditetapkan; ❌ 400 jika penalty ditetapkan |
| 3.0 / 3.1 (legacy) | Ya (send-all) | Ya (send-all) | Dokumen lama: masih diterima; Google syor suhu 1.0 | ⚠️ Berfungsi; kualiti mungkin tidak mengikut suhu 0.2 tersuai |
| 2.5 | Ya (full) | Ya (jika ditetapkan) | Disokong penuh | ✅ Selamat |
| 2.0 / 1.5 / Gemma | Ya (full) | Ya (jika ditetapkan) | Disokong | ✅ Selamat |

### C2. Juris di antara dua ground truth

| Aspek | Ground truth lama (ai.google.dev/deprecations 2026-09-24, dalam kod L91-103) | Ground truth baharu (docs.cloud.google.com 2026-10-25) | Juris? |
| --- | --- | --- | --- |
| Sempadan penamatan sampling | Tarikh GA 21 Jul 2026 → minor >= 6 STRICT; 3.5-flash-lite STRICT; 3.5-flash LEGACY | "Gemini 3.6 Flash and later" — tidak senaraikan per-model | ✅ Selari (3.6+ consistent) |
| Nasib sampling params | Dinyah-guna (implisit diabaikan) | "ignored if set" — SAH, diabaikan senyap | ✅ Selari |
| Nasib penalty params | Tidak dinyatakan secara eksplisit | "return an error" — BARU, eksplisit ralat | ⚠️ **JURIS BARU**: dokumen lama tidak memberi amaran error; dokumen baharu mengesahkan ERROR |
| Cadangan tindakan | (tiada cadangan eksplisit remove) | "Remove these parameters from your requests" | ⚠️ **JURIS**: bertentangan dengan SEND-ALL DOCTRINE secara terus |
| 3.5-flash | LEGACY (pra-sempadan; GA 19 Mei 2026) | "3.6 Flash and later" sahaja → 3.5-flash tidak termasuk amaran | ⚠️ Projek sudah whitelist-reroute 3.5-flash sebagai STRICT (Keputusan Owner #1 v3.9.46: pelayan Google MEREROUTE 3.5-flash → 3.6). Dokumen baharu TIDAK mengesahkan/denyahkan reroute ini secara eksplisit pada halaman inference — keputusan v3.9.46 kekal berdasarkan pemerhatian empirikal Owner sendiri |

### C3. Soalan keputusan yang perlu dijawab oleh AI Owner

1. **Pilihan A — Kekal SEND-ALL mutlak (status quo):** penalty params hanya menyebabkan 400 bila Owner menetapkannya sendiri; sampling diabaikan tanpa mudarat. Risiko terletak pada pengguna akhir yang menetapkan penalty pada model 3.6+. Kos: tiada kod berubah; pengalaman pengguna penalty 400 dengan mesej 400-debug (L66-84) yang mencetak payload ralat.
2. **Pilihan B — Hybrid guard:** kekal send-all untuk sampling (diabaikan senyap, tiada risiko); gugurkan HANYA `frequencyPenalty`/`presencePenalty` untuk keluarga 3.x-strict (kerana ia satu-satunya kategori yang mengesahkan ERROR, bukan ignore). Ini mengembalikan semangat gate stripping lama tetapi sempit — hanya pada parameter yang bererror, bukan yang diabaikan.
3. **Pilihan C — Patuh dokumen rasmi penuh:** remove SEMUA sampling + penalty untuk 3.6+ ("Remove these parameters"). Ini menggugurkan SEND-ALL sepenuhnya dan menghidupkan semula gate yang dimatikan pada 2026-10-16.
4. **Pertimbangan tambahan:** gateway proksi Gemini-native pihak ketiga (Crazy Router dsb.) mungkin TIDAK mengikuti gelagat Google rasmi — sesetengah gateway menerima dan memproses sampling walaupun Google mengabaikannya. SEND-ALL wujud sebahagiannya kerana realiti pelbagai pintu ini. Pilihan B/C memboikot keupayaan itu pada pintu proksi.
5. **Kes 3.5-flash/3.7-flash reroute:** keputusan v3.9.46 menandakan ia STRICT berdasarkan pemerhatian reroute pelayan. Jika Pilihan B/C diambil, model-model ini turut terkena gate penalty/sampling. Perlu keputusan sama ada whitelist reroute kekal.

### C4. Fakta sokongan keputusan (tidak berpolemik)

- Lalai projek TIDAK menetapkan penalty (undefined) → hari ini, tiada 400 berlaku melainkan pengguna menetapkan env/advanced settings penalty.
- `topK` sudah haram dan dikecualikan daripada doktrin — tiada isu.
- `systemInstruction` top-level, `thinkingLevel`, `thinkingBudget` 2.5, `maxOutputTokens`, `responseMimeType` — semua patuh dokumen rasmi, tiada isu.
- Endpoint `v1beta` (L17) konsisten dengan keperluan `continuationToken` dan selari dengan dokumentasi.
- Dokumen rasmi mengesahkan gelagat "ignored" untuk sampling — bermakna SEND-ALL sampling params TIDAK membahayakan pada 3.6+ (hanya tidak berkesan). Satu-satunya bahaya sebenar ialah penalty params.

---

## BAHAGIAN D — RINGKASAN EKSEKUTIF (satu perenggan untuk AI keputusan)

SEND-ALL DOCTRINE (Mandat Owner 2026-10-16) mengarahkan penghantaran `temperature`/`topP`/`frequencyPenalty`/`presencePenalty` untuk SEMUA keluarga Gemini 3.x tanpa gate. Dokumen rasmi Google terkini (2026-10-22) mengesahkan bahawa untuk model Gemini 3.6 Flash dan kemudian: sampling params **diabaikan senyap** (selari dengan doktrin, tanpa mudarat), tetapi penalty params **pulangkan ERROR 400** (bertentangan dengan doktrin apabila penalty ditetapkan) dan Google menyarankan "Remove these parameters". Dalam konfigurasi lalai SubFaber, penalty tidak dihantar (undefined) jadi tiada 400 hari ini; risiko hanya muncul bila pengguna menetapkan penalty secara eksplisit dan menggunakan model 3.6+. Keputusan yang perlu dibuat: (A) kekal status quo, (B) gate sempit — gugurkan penalty sahaja untuk keluarga strict sambil kekal send-all sampling, atau (C) patuh penuh dokumen — remove semua sampling+ penalty untuk 3.6+. Pertimbangan khusus: pintu gateway proksi pihak ketiga mungkin berkelakuan berbeza daripada Google rasmi, dan keputusan reroute 3.5-flash/3.7-flash (v3.9.46) menandakan model-model tersebut sebagai strict.

---

**Fail rujukan:**
- Ground truth sedutan penuh: [`plans/gemini-enterprise-agent-platform-ground-truth-2026.md`](gemini-enterprise-agent-platform-ground-truth-2026.md)
- Kod pintu: [`src/services/gemini.js`](../src/services/gemini.js) (constructor L580-675, `buildGenerationConfig` L784-859, `getModelFamily` L146-185, whitelist reroute L127-140)
- Ground truth lama (dalaman kod): komen L91-103
- Ground truth trinity: `plans/trinity-params-ground-truth-2026.md`
