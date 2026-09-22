# Laporan Ground Truth: Prompt Engineering Rasmi Google untuk Gemini 3 Flash Preview

## Tujuan
Mengumpul dan menyatukan panduan rasmi Google (`ai.google.dev` / `cloud.google.com`) tentang pembinaan prompt untuk model `gemini-3-flash-preview`, kemudian mencadangkan System Instruction + Critical Rules yang paling sesuai untuk enjin penterjemahan sarikata SubMaker.

---

## 1. Mazhab Rasmi Google — Prinsip Teras

Sumber rujukan:
- [`ai.google.dev/gemini-api/docs/prompting-strategies`](https://ai.google.dev/gemini-api/docs/prompting-strategies)
- [`ai.google.dev/gemini-api/docs/gemini-3`](https://ai.google.dev/gemini-api/docs/gemini-3)
- [`docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/system-instructions`](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/prompts/system-instructions)

### 1.1 Strategi Umum Pembinaan Prompt
| Prinsip | Apa yang Google Tekankan |
|---------|--------------------------|
| **Arahan jelas & spesifik** | Nyatakan matlamat dengan terang. Gunakan input jenis soalan, tugas, entiti, atau pengayaan. |
| **Batasan / constraints** | Beritahu model apa yang **boleh** dan apa yang **tidak boleh** dibuat. |
| **Format output** | Minta jadual, senarai, JSON, perenggan, dsb. |
| **Few-shot > zero-shot** | Google secara eksplisit mengesyorkan **sentiasa** sertakan contoh; prompt tanpa contoh "kemungkinan kurang berkesan". |
| **Konsisten formatting** | Samakan tag XML, jarak, baris baharu, dan pemisah contoh. |
| **Tambah konteks** | Jangan anggap model tahu segalanya — beri maklumat domain. |
| **Pecahkan prompt kompleks** | Rantaikan prompt atau agregasi selari. |
| **Parameter** | Eksperimen dengan `temperature`, `topP`, `topK`, `maxOutputTokens`, `stopSequences`. |

### 1.2 Best Practice Khas untuk Gemini 3
Google menegaskan Gemini 3 ialah **reasoning model**, jadi cara prompt mestilah berbeza dari model lama:

| Prinsip | Panduan |
|---------|---------|
| **Tepat & terus** | Elakkan bahasa berbunga atau persuasif. |
| **Struktur konsisten** | Guna tag XML (contoh: `<context>`, `<task>`) atau tajuk Markdown; pilih satu format dan kekalkannya. |
| **Definisi parameter** | Jelaskan sebarang istilah kabur. |
| **Kawal keluasan output** | Gemini 3 secara lalai jawapan ringkas. Jika mahu panjang, minta secara eksplisit. |
| **Prioritikan arahan kritikal** | Letakkan batasan kelakuan, definisi peranan, dan keperluan format dalam **System Instruction** atau di bahagian teratas prompt. |
| **Struktur untuk konteks panjang** | Letakkan semua konteks dahulu, kemudian letakkan arahan khusus di **hujung** prompt. Ikat dengan ayat seperti "Berdasarkan maklumat di atas...". |
| **Temperature** | **Sangat disyorkan kekalkan `temperature = 1.0`** untuk semua model Gemini 3. Nilai rendah boleh menyebabkan gelung / prestasi jatuh. |

### 1.3 Spesifikasi `gemini-3-flash-preview`
| Atribut | Nilai |
|-----------|-------|
| ID model | `gemini-3-flash-preview` |
| Tetingkap konteks | 1 juta token input / 64k output |
| Sempatan pengetahuan | Januari 2025 |
| Harga | $0.50 / 1 juta input token, $3 / 1 juta output token |
| Aras pemikiran | `minimal`, `low`, `medium`, `high` |
| Lalai pemikiran | `high` |
| Percuma | Ada tier percuma dalam Gemini API |

#### Panduan Aras Pemikiran
| Aras | Penggunaan |
|------|------------|
| `minimal` | Latensi paling rendah, kelajuan tinggi, arahan mudah. Nota: tidak menjamin thinking dimatikan. |
| `low` | Arahan mudah, sembang, aplikasi high-throughput. |
| `medium` | Seimbang. |
| `high` | Reasoning mendalam; lebih lambat tetapi lebih teliti. |

Untuk penterjemahan batch berstruktur (mesti tepat bilangan slot & format XML), aras `low` atau `medium` mungkin paling sesuai — cukup reasoning untuk faham konteks, tetapi tidak terlalu bebas sehingga ubah struktur.

### 1.4 Best Practice System Instruction (Google Cloud)
- System instruction diproses **sebelum** user prompt.
- Fungsinya: peranan/persona, format output, gaya/nada, peraturan/matlamat, sempatan pengetahuan, bahasa output.
- Gunakan ayat yang **jelas & ringkas**; jangan penuhkan dengan contoh jika contoh sepatutnya ada dalam user prompt.

---

## 2. Penilaian Prompt SubMaker Kini

Fail berkaitan:
- [`src/services/gemini.js`](src/services/gemini.js:264) — `DEFAULT_TRANSLATION_PROMPT` dan penghantaran `systemInstruction`.
- [`src/services/translationEngine.js`](src/services/translationEngine.js:34) — `PROMPT_TEMPLATES.primary/fallback`, `createXmlBatchPrompt()`.

### 2.1 Kekuatan Kini
1. System Instruction API digunakan dengan betul — `systemInstruction` dihantar sebagai medan berasingan, bukan digabung dalam contents.
2. Struktur XML konsisten — `<s id="N">...</s>` sama untuk input dan output.
3. Ada few-shot demonstration — contoh Malay dalam Critical Rules.
4. Critical Rules guna bahasa batasan kuat — pasangan `NEVER ... INSTEAD ...`.
5. Prompt fallback wujud — untuk retry `PROHIBITED_CONTENT`.

### 2.2 Kelemahan vs Panduan Google
1. **Temperature 0.2 secara lalai** — Google amat mengesyorkan `1.0` untuk Gemini 3. Nilai rendah boleh menyebabkan gelung atau output rapuh.
2. **System Instruction terlalu kecil** — `DEFAULT_TRANSLATION_PROMPT` umum; peraturan berat berada dalam user prompt.
3. **Penggunaan `NEVER/INSTEAD` berlebihan** — walaupun jelas, ianya verbose dan mungkin bertentangan dengan nasihat Google supaya ringkas untuk reasoning model Gemini 3.
4. **Tiada peranan/persona eksplisit dalam system instruction** — Google syorkan letakkan peranan di sana.
5. **Tidak ada arahan eksplisit memelihara `[br]`** — wujud dalam peraturan tetapi boleh dinaikkan taraf.
6. **Susunan arahan tidak mengikut rekomendasi Gemini 3** — batasan kritikal sepatutnya di System Instruction atau bahagian teratas; kini diletakkan selepas demonstrasi.

---

## 3. System Instruction yang Dicadangkan untuk SubMaker

Target model: `gemini-3-flash-preview` dan varian Flash 3.x akan datang.

```
You are SubMaker, an expert subtitle localization engine. Your job is to translate subtitle dialogue from a source language into a target language while preserving timing, structure, and formatting.

CORE BEHAVIOR:
- Translate each <s id="N"> slot independently. Never merge, split, reorder, or drop slots.
- Preserve all [br] line-break markers, inline tags (<i>, <b>), speaker dashes, and music notes (♪/♫) exactly where they appear.
- Preserve numbers, dates, times, measurements, and proper nouns accurately.
- Keep titles of creative works, brand names, and legal entities verbatim in their original language.
- Use spoken, conversational register. Avoid formal essay tone and literal word-for-word translation.
- Do not add explanations, notes, markdown fences, or thinking blocks.

OUTPUT FORMAT:
- Return only raw <s id="N">...</s> tags.
- Output exactly as many tags as the input batch contains, with identical IDs in identical order.
- Emit only the inner text of the first pre-filled slot at the very first character; do not repeat the opening tag.

LANGUAGE-SPECIFIC:
- For Malay (ms/my/mya/zsm): use Bahasa Melayu Malaysia register. Common English loanwords used in daily Malaysian speech (e.g., okay, confirm, check, settle, try, call, parking, boss) are acceptable. Avoid Indonesianisms (bisa, banget, gimana, cewek/cowok, kalian, ngomong, kok, dong, sih). Choose self-reference by context: saya/awak default, aku/kau intimate, saya/anda formal.

SAFETY FALLBACK:
- If a line contains sensitive, profane, or mature content, translate it with an objective, non-glorified equivalent. Do not refuse the task or omit the slot.
```

### Mengapa struktur ini selari dengan panduan Google
| Prinsip Google | Bagaimana System Instruction Ini Menggunakannya |
|----------------|------------------------------------------------|
| Definisi peranan | "You are SubMaker, an expert subtitle localization engine" |
| Definisi format output | "Return only raw <s id=\"N\">...</s> tags" |
| Definisi matlamat/peraturan | Senarai Core behavior, language-specific, safety fallback |
| Ringkas | Tiada contoh, tiada ulangan, bullet point terus |
| Batasan di bahagian atas | Diletakkan dalam `systemInstruction`, diproses sebelum kandungan user |

---

## 4. User Prompt yang Dicadangkan (Critical Rules + Demonstration)

### 4.1 Susunan yang Disyorkan untuk Gemini 3
Mengikut panduan "Long context structure" Google:
1. Konteks (input batch XML)
2. Arahan tugas di hujung

Tetapi kerana batch sarikata adalah data berstruktur pendek, susunan optimum ialah:
1. **Task statement** (satu baris)
2. **Few-shot demonstration** (ringkas, format konsisten)
3. **Critical Rules** (pendek, bernombor, tanpa ulangan)
4. **Input block** dengan ayat penambat hujung: `Translate the above subtitles into {target}. Output:`

### 4.2 Templat User Prompt yang Dicadangkan

```
<task>
Translate each <s id="N"> tag below from {source} to {target}.
</task>

<demonstration>
Input:
<s id="1">The chief director was the one</s>
<s id="2">responsible for the approval.</s>
<s id="3">You are coming with us,</s>
<s id="4">aren't you?</s>
<s id="5">We already warned him[br]during the meeting.</s>
<s id="6">First,</s>

Output:
<s id="1">Pengarah utama yang</s>
<s id="2">bertanggungjawab atas kelulusan itu.</s>
<s id="3">Awak ikut kami sekali,</s>
<s id="4">kan?</s>
<s id="5">Kami dah ingatkan dia[br]masa mesyuarat hari tu.</s>
<s id="6">Pertama,</s>
</demonstration>

<critical_rules>
1. Cardinality: output exactly {expectedCount} tags with these IDs in order: {idList}.
2. Slot isolation: translate only the text inside each <s id> tag; do not borrow words from neighboring tags.
3. Format preservation: keep [br], <i>, <b>, speaker dashes, and music notes in their original positions.
4. Fidelity: do not add, drop, or change numbers, dates, names, or punctuation intent.
5. Air-gapped memory: any <m id> tags are read-only context; do not output or translate them.
6. Clean output: no markdown fences, explanations, notes, or thinking blocks. Only raw <s id> tags.
</critical_rules>

<input>
{batchText}
</input>

Based on the demonstration and rules above, translate the input into {target}. Output:
<s id="{startId}">
```

### 4.3 Kenapa Ini Lebih Baik untuk Gemini 3
- **Kurang verbose** berbanding ulangan `NEVER/INSTEAD` yang ada sekarang.
- **Bahagian XML jelas** (`<task>`, `<demonstration>`, `<critical_rules>`, `<input>`), selari dengan nasihat Google untuk struktur konsisten.
- **Few-shot example dikekalkan** — Google kata sentiasa sertakan contoh.
- **Arahan akhir di hujung konteks panjang** — selari dengan panduan long-context Google.
- **Prefix siap-lengkap** `<s id="{startId}">` membantu model sambung dengan betul (strategi completion).

---

## 5. Cadangan Parameter untuk `gemini-3-flash-preview`

| Parameter | Lalai Kini | Cadangan / Panduan Google |
|-----------|------------|---------------------------|
| `temperature` | 0.2 | **1.0** (Google sangat syorkan lalai untuk Gemini 3) |
| `topP` | 0.95 | 0.95 (kekalkan) |
| `topK` | undefined | **buang untuk model 3.x** (Google nyatakan buang parameter tidak disokong seperti topK) |
| `thinking_level` | lalai profil model | **low atau medium** untuk penterjemahan batch berstruktur |
| `maxOutputTokens` | 65536 | kekalkan; had output model 64k |
| `frequencyPenalty` / `presencePenalty` | undefined | **buang untuk 3.x** (tidak disokong) |

> Nota: SubMaker sudah ada percabangan per-model dalam [`gemini.js`](src/services/gemini.js:330) yang membuang `temperature`, `topP`, `topK`, dan penalty untuk model 3.x-strict. Cadangan ini ialah untuk **naikkan temperature kepada 1.0 khusus untuk Gemini 3 Flash Preview**, bukan kekalkan 0.2, kerana panduan rasmi Google menyatakan nilai rendah boleh merosakkan reasoning/output berstruktur.

---

## 6. Pelan Perlaksanaan

1. **Fasa 1 — Refactor System Instruction**
   - Pindahkan behavior, format output, peraturan bahasa, dan safety fallback ke dalam `systemInstruction`.
   - User prompt kekal untuk task, demonstration, critical rules, dan input.

2. **Fasa 2 — Redesign User Prompt Template**
   - Ganti ulangan `NEVER/INSTEAD` dengan `critical_rules` bernombor ringkas.
   - Kekalkan contoh few-shot Melayu.
   - Guna tag bahagian XML secara konsisten.
   - Letakkan arahan akhir selepas input block.

3. **Fasa 3 — Kemas Kini Parameter Lalai Gemini 3**
   - Untuk `gemini-3-flash-preview` (dan varian Flash 3.x), tetapkan `temperature = 1.0` dan `thinking_level = low` atau `medium`.
   - Pastikan `topK`, `frequencyPenalty`, `presencePenalty` dibuang untuk model ini.

4. **Fasa 4 — Ujian Regression**
   - Jalankan `npm test`.
   - Jalankan ujian A/B secara langsung pada fail sarikata multi-batch menggunakan prompt lama dan prompt baharu.
   - Metrik: kesepaduan bilangan slot, pemeliharaan ID, pemeliharaan `[br]`, kesemulaan Bahasa Melayu, kadar penolakan pada kandungan sensitif, kos token per entry.

5. **Fasa 5 — Version Bump & Deploy**
   - Naikkan versi (ikut peraturan projek: setiap fix/feature mesti bump version).
   - Commit, push, tag, dan rebuild container Docker.

---

## 7. Risiko & Mitigasi

| Risiko | Mitigasi |
|--------|----------|
| `temperature = 1.0` meningkatkan varians / mismatch bilangan slot | Perkukuh System Instruction constraints; kekalkan `topP = 0.95`. |
| Critical Rules yang lebih pendek mengurangkan kekuatan enforcement | System Instruction kini memikul beban behavioral; user prompt rules hanya ringkasan fokus. |
| `thinking_level: low` mungkin terlepas konteks antara batch | Sudah ditangani oleh SubMaker dengan tag `<m>` context-memory dan konteks 5 baris per batch. |
| `gemini-3-flash-preview` masih preview | Dokumenkan bahawa parameter diselaraskan untuk preview; tukar semula apabila `gemini-3-flash` stabil keluar. |

---

## 8. Kesimpulan

Mazhab rasmi Google untuk `gemini-3-flash-preview` boleh dirumuskan: **tepat, ringkas, struktur konsisten, letak batasan kritikal dalam System Instruction, kekalkan temperature pada 1.0, dan guna `thinking_level` untuk mengimbangi latensi/kos dengan kedalaman reasoning.**

Reka bentuk baharu yang dicadangkan mengubah seni bina prompt SubMaker dari model "user prompt besar yang penuh peraturan" kepada model bersih **System Instruction + user prompt fokus**, selari dengan cara Google mengesyorkan pembinaan prompt untuk model reasoning Gemini 3. Hasilnya dijangka lebih teguh untuk penterjemahan per-slot, kurang regresi formatting, dan kurang token dibazirkan oleh ulangan peraturan yang verbose.
