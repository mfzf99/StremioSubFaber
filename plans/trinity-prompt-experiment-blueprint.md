# Trinity Prompt Experiment Blueprint

## Tujuan

Nota kekal untuk eksperimen Setup B/C/D dan seterusnya. Setup A ialah baseline terkunci; struktur prompt setup baharu TIDAK perlu mengekalkan bentuk, susunan atau placeholder Setup A.

Prinsip utama: **registry memilih eksperimen, composer membentuk prompt, wrapper menghantar mengikut provider, parser mengesahkan output.**

## 1. Penyimpanan Setup

- Simpan setiap bundle sebagai source-controlled backend module:
  - `src/services/prompts/trinity/setups/setupA.js` — baseline terkunci.
  - `src/services/prompts/trinity/setups/setupB.js` — eksperimen B.
  - `src/services/prompts/trinity/setups/setupC.js` — eksperimen C.
- Daftarkan bundle dalam `TRINITY_PROMPT_SETUPS` di `src/services/prompts/trinity/setups/index.js`.
- Jangan simpan prompt eksperimen dalam Redis, translation cache, database atau config pengguna.
- Setup A tidak boleh diubah tanpa mandat Owner eksplisit.

## 2. Bentuk Bundle Minimum

```js
const setupB = {
    id: 'B',
    label: 'Setup B — <nama eksperimen>',
    preflightTemplate: `...`,
    translationTemplate: `...`,
    inspectorInstruction: `...`
};

module.exports = setupB;
```

Satu setup memilih ketiga-tiga ejen sebagai satu bundle. Jangan campur Preflight A, Translation B dan Inspector C dalam satu run.

## 3. Eksperimen Struktur Biasa

Setup baharu bebas menggunakan:

- Markdown, XML, plain text atau JSON-style instructions.
- Susunan Role/Rules/Input/Output yang berbeza.
- Few-shot di awal, tengah atau hujung prompt.
- Placeholder baharu, subset placeholder lama atau tiada placeholder.
- Prompt panjang/ringkas berbeza bagi setiap ejen.

Interpolasi sedia ada hanya menggantikan placeholder yang wujud. Tiada keperluan mengekalkan `${targetSpecificRules}`, `${fewShot}`, `${src}`, `${tgt}` atau placeholder Setup A yang lain jika tidak digunakan.

Jika template string dan interpolasi sedia ada mencukupi, jangan tambah composer.

## 4. Composer untuk Eksperimen Radikal

Apabila eksperimen memerlukan perubahan kedudukan input, bentuk data atau komposisi konteks yang tidak dapat dilakukan melalui string replacement, bundle boleh membekalkan composer per-ejen:

```js
const setupB = {
    id: 'B',
    label: 'Setup B — Structured XML Experiment',
    preflightTemplate: `...`,
    translationTemplate: `...`,
    inspectorInstruction: `...`,

    composePreflight(context) {
        return {
            systemText: '...',
            dataText: `<episode>${context.rawText}</episode>`,
            queryText: '...'
        };
    },

    composeTranslation(context) {
        return {
            systemText: '...',
            dataText: `<batch>${context.batchText}</batch>`,
            queryText: '...'
        };
    },

    composeInspector(context) {
        return {
            systemText: '...',
            dataText: '...',
            queryText: '...'
        };
    }
};
```

Cadangan pelaksanaan masa depan:

- Setup A terus menggunakan laluan template sedia ada.
- Builder memilih composer hanya jika fungsi tersebut wujud dalam bundle aktif.
- Gunakan kontrak context yang didokumenkan; jangan bergantung pada DOM atau config UI.
- Jangan tambah `if (setup === 'B')` bertaburan dalam engine.
- Provider wrappers kekal mengurus kontrak Gemini/OpenAI/Anthropic; composer tidak membina payload HTTP provider.

## 5. Yang Boleh Berubah vs Kontrak Sistem

### Bebas untuk R&D

- Struktur, susunan, gaya, persona dan panjang prompt.
- Format arahan: Markdown/XML/plain text/JSON-style.
- Bilangan, kandungan dan kedudukan few-shot.
- Cara preflight context dan language pack digunakan.
- Strategi setiap ejen dalam bundle yang sama.

### Mesti disahkan

- Output masih boleh dihuraikan oleh parser aktif.
- Preflight mematuhi `PREFLIGHT_SCHEMA_CONTRACT` jika schema sedia ada digunakan.
- Inspector mematuhi `INSPECTOR_SCHEMA_CONTRACT` jika schema sedia ada digunakan.
- Translation mengekalkan ID, slot, order dan markup jika parser sedia ada digunakan.
- Semua nilai yang dirujuk composer dibekalkan melalui context secara eksplisit.
- `systemInstruction`, thinking/sampling parameters dan channel payload tidak berubah secara sampingan.

Jika eksperimen mengubah FORMAT OUTPUT (contohnya Translation XML → JSON atau Inspector menambah medan baharu), ia bukan lagi perubahan prompt sahaja. Setup tersebut memerlukan adapter/parser/schema tersendiri supaya Setup A dan setup lain tidak terjejas.

## 6. Registry dan Runtime Switching

Keutamaan sedia ada:

1. `trinity.promptSetup` config passthrough.
2. `TRINITY_PROMPT_SETUP` environment variable.
3. Legacy Translation config/environment fallback.
4. Default `A`.

Untuk eksperimen VPS/runtime, lebih stabil menggunakan:

```env
TRINITY_PROMPT_SETUP=B
```

Kemudian restart service. Tukar kepada `A` atau buang variable untuk kembali ke baseline. Unknown ID fail-safe ke Setup A dengan warning. Runtime log mesti menunjukkan setup aktif.

Non-A setup memaksa translation-cache bypass kerana cache key tidak mempunyai prompt discriminator. Jangan longgarkan perlindungan ini semasa eksperimen.

## 7. Regression dan Acceptance Setiap Setup

1. Kekalkan semua assertion literal Setup A; jangan gunakan assertion A terhadap B/C.
2. Tambah fixtures khusus setup baharu untuk struktur, placeholder/composer dan output contract.
3. Uji resolver memilih setup yang betul dan ketiga-tiga ejen menerima bundle sama.
4. Uji default A dan unknown-ID fallback A.
5. Uji semua channel wrappers yang terlibat.
6. Uji parser dengan output valid, malformed dan partial/failure path yang relevan.
7. Untuk composer: uji null/undefined context, tiada placeholder tertinggal dan backward compatibility.
8. Jalankan targeted tests kemudian full `npm test`: wajib 0 FAIL dan maksimum satu valid live-Redis SKIP.
9. Bandingkan A vs B menggunakan input, model dan parameter sama.
10. Promosikan eksperimen menjadi baseline baharu hanya melalui mandat Owner eksplisit; simpan baseline lama sebagai rujukan sejarah.

## 8. Checklist Menambah Setup Baharu

- [ ] Cipta `setupX.js` dengan id/label unik dan bundle tiga ejen.
- [ ] Tentukan eksperimen sebagai template-only atau composer-based.
- [ ] Dokumentasikan hipotesis eksperimen dan output contract.
- [ ] Daftarkan bundle dalam `TRINITY_PROMPT_SETUPS`.
- [ ] Tambah regression fixtures khusus setup.
- [ ] Sahkan Setup A byte-identical dan semua assertion asal lulus.
- [ ] Sahkan cache bypass untuk non-A.
- [ ] Jalankan targeted/full tests dan quality gates mengikut skop.
- [ ] Gunakan `TRINITY_PROMPT_SETUP=X` untuk run eksperimen.
- [ ] Rekod hasil perbandingan sebelum sebarang promosi baseline.
