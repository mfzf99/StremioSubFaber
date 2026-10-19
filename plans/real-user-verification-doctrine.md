# Pelan Pembedahan: Doktrin REAL-USER VERIFICATION (Anti Blind-Coding) — Penambahan Rules Dua Fail

- **Tarikh Pelan:** 2026-10-19
- **Status:** PERANCANGAN SAHAJA — menunggu kelulusan Owner (selepas rujukan AI Owner). SIFAR kod disentuh.
- **Punca:** Laporan Owner selepas pelepasan v3.16.0.

---

## 0. Isu yang Owner Utarakan (Verbatim Intipati)

> Frontend pada mulanya membedah UI/UX secara buta — tidak memasukkan API key, tidak masuk URL, tidak pilih format/door, tidak tekan Validate, tidak pilih model. Bila Owner tegur, barulah dia jalankan aliran sebenar dan barulah dia nampak, faham, dan rasa pengalaman user sebenar — dan baru betulkan kesilapan dia.
>
> Selama ini Owner sendiri silap tak sediakan bahan cukup untuk pembedahan, TETAPI kini Owner dah sediakan maklumat lengkap (API keys real via `.env.test.local`) — jadi tiada lagi alasan pembedahan buta.
>
> Screenshot/laporan Owner BUKAN gambaran sebenar — frontend perlu berinteraksi as a real user barulah nampak masalah sebenar. Setiap kitaran "fix berulang kali" akibat tekaan membazir masa DAN membakar token API berbayar Owner — itu duit, bukan free.

**Bukti empirikal insiden (sesi v3.16.0 Fasa 2, hari ini):**
1. Frontend mula ujian dengan mengklik butang ✓ Test tanpa isi kunci/URL → 401 → kesimpulan salah "kunci tidak sah".
2. Owner tegur: *"kenapa tak sah? key itu key real, kau wajib test macam user real — masuk api key, masuk url, pilih door, tekan validate, baru model muncul."*
3. Selepas teguran, Frontend jalankan aliran sebenar (provider custom → kunci real `SUBFABER_TEST_ROOTSYS_KEY` → URL `https://rootsys.cloud/v1` → door OpenAI-Compatible → Validate) → **HTTP 200 / valid:true / 22 model** → pilih kimi-k3 → barulah kad Model Parameters render sebenar dengan placeholder + uiHint → barulah bug DOM sebenar dapat dikesan & dibuktikan (kosong → tiada dihantar; 0.7 → dihantar 0.7).
4. **Kesimpulan: SATU teguran Owner = SATU kitaran fix berulang yang boleh dielak sepenuhnya = token berbayar terbuang.**

---

## 1. Jawapan/Kedudukan Backend kepada Isu Owner

Backend faham 100% dan bersetuju penuh: **YA, wajib tambah rules di KEDUA-DUA fail** (`00-subfaber-core-protocol.md` DAN `.roomodes` blok frontend). Alasan:

1. **Satu sumber sahaja tidak mencukupi.** `.roomodes` ialah definisi persona yang dibaca semasa mod frontend aktif; core-protocol ialah perlembagaan rentas-mode yang diwarisi kedua-dua persona. Insiden hari ini menunjukkan Item 8 sedia ada (Visual Critique Loop) TIDAK memadai kerana ia hanya mewajibkan screenshot + self-critique — ia tidak mewajibkan **aliran interaksi sebenar sebelum pembedahan**. Frontend patuh Item 8 (dia ambil screenshot!) tetapi masih buta terhadap aliran provider→validate→model kerana tidak pernah menjalaninya.
2. **Ekonomi token.** Setiap kitaran tekaan→salah→tegu→ulang membakar panggilan API berbayar Owner. Rules ini adalah kawalan kos rasmi, bukan formaliti.
3. **Infrastruktur sudah sedia.** Kunci real + loader Zero-Secret-Logging (`src/utils/testKeys.js`, v3.14.4) sudah wujud sejak 2026-10-18 — yang hilang hanyalah MANDAT prosedur yang mengikat frontend menggunakannya sebagai langkah pertama pembedahan, bukan langkah selepas ditegur.

---

## 2. Naskhah Rules yang Dicadangkan

### 2.1 `00-subfaber-core-protocol.md` — seksyen baharu selepas [MULTI-AGENT ORCHESTRATION PROTOCOL]

```
[REAL-USER VERIFICATION DOCTRINE — ANTI BLIND-CODING (2026-10-19, insiden v3.16.0 Fasa 2)]
1. WAJIB-REPLIKASI-ALIRAN: Sebelum pembedahan/audit UI/UX yang melibatkan aliran
   provider/model/validation (kad Trinity, parameter, kunci), ejen WAJIB menjalankan
   aliran pengguna sebenar melalui Playwright MCP: pilih provider → isi API key real
   (SUBFABER_TEST_* via src/utils/testKeys.js) → isi base URL → pilih door/format →
   tekan Validate → pilih model — SEHINGGA komponen sasaran render dengan data sebenar.
   Hanya selepas itu pembedahan/audit dibenarkan bermula.
2. SCREENSHOT = HIPOTESIS: Screenshot/laporan Owner adalah hipotesis awal, BUKAN
   kebenaran tunggal. Setiap isu yang dilaporkan mesti disahkan melalui interaksi
   langsung sebelum sebarang kod diubah.
3. LARANGAN KARANG-STATE: DILARANG membina/membetulkan UI state (model list, kad
   parameter, status validation, paparan ralat) atas dasar tekaan tanpa pernah
   melihat state itu hidup hasil aliran sebenar. Pelanggaran = protokol breach;
   handover mesti dinyatakan & kerja diulang.
4. KONTRAK KUNCI: Kunci ujian tertakluk penuh kepada Zero Secret Logging (sifar
   nilai ke terminal/log/screenshot/ledger) dan skop ping/model-list + Playwright
   sahaja (bukan bulk translation).
5. RATIONALE EKONOMI: Setiap kitaran "fix berulang" akibat tekaan membakar token
   API berbayar Owner — doktrin ini ialah kawalan kos rasmi projek.
```

### 2.2 `.roomodes` frontend `customInstructions` — APPEND Item 9 (item 1–8 KEKAL VERBATIM)

```
Item 9 — Real-User Interaction Mandate (Anti Blind-Coding, 2026-10-19): Sebelum
pembedahan/audit UI/UX yang melibatkan aliran provider/model/validation, WAJIB
menjalankan aliran pengguna sebenar melalui Playwright MCP (provider → API key
real SUBFABER_TEST_* → base URL → door/format → tekan Validate → pilih model)
sehingga komponen sasaran render dengan data sebenar; screenshot/laporan Owner
adalah hipotesis yang mesti disahkan melalui interaksi. Pembedahan atas tekaan
tanpa replikasi aliran = pelanggaran protokol yang wajib dinyatakan dalam
handover dan dikerja semula.
```

---

## 3. Prosedur Pelaksanaan (Sekunder terhadap peraturan sedia ada)

1. **`.roomodes` (Insiden 2026-10-08):** skrip Python text-splice ditulis & dijalankan dari `$TEMP` (LUAR repo), dipadam dalam rantaian command sama; anchor: selepas Item 8 dalam blok frontend; **gate validasi PyYAML wajib**: customModes=2, per-mode `groups=[read,edit,command,mcp]`, `source=project`, item 1–8 frontend kekal verbatim, blok backend tidak tersentuh, Item 9 hadir.
2. **`00-subfaber-core-protocol.md`:** `apply_diff` biasa (fail markdown selamat, bukan `.roomodes`).
3. **Pipeline 8-langkah penuh:** SemVer 3.16.0 → **3.16.1** (patch — penambahan peraturan proses, tiada perubahan runtime kod aplikasi) → CHANGELOG → cache-buster (runtime-driven, NO-OP dijangka) → Prettier + ESLint + `npm test` (baseline 461 monotonik, 0 FAIL, maks 1 SKIP) → graphify NO-OP → SESSION_LEDGER → commit/push verified (`git rev-parse origin/main`) → `gh run watch` SUCCESS.

---

## 4. Risiko & Pengurangan

| Risiko | Pengurangan |
|---|---|
| Item 9 `.roomodes` merosakkan YAML | Skrip $TEMP + auto-detect line-ending + guard idempotency + gate PyYAML (proven v3.14.5) |
| Rules bertindih dengan Item 8 (Visual Critique) | Item 8 = TUNTUTAN PASCA-pembedahan (screenshot+critique); Item 9 = TUNTUTAN PRA-pembedahan (aliran sebenar) — komplementari, bukan bertindih; doktrin core menyatakan perkaitan |
| Frontend lambat sebab wajib aliran penuh | Hanya WAJIB bagi pembedahan yang melibatkan aliran provider/model/validation; suntingan CSS/daripada teks statik bebas (doktrin skop jelas) |
| Kunci real terdedah dalam proses | Zero Secret Logging sedia terbina dalam testKeys.js; Item 9 merujuk loader, bukan nilai |

## 5. Pintu Kelulusan

Owner semak pelan ini (dengan rujukan AI Owner) → keluarkan [MANDAT PELAKSANAAN] → Backend laksanakan §3.
