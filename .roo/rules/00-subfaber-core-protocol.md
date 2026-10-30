# SubFaber Core Protocol — Solo Fullstack SSOT

Dokumen ini ialah Single Source of Truth (SSOT) bagi persona, aliran kerja, verifikasi dan pelepasan. `.roomodes` hanya menyimpan definisi mod dan invariant teras secara padat; jangan penduakan prosedur penuh ini di sana.

## 1. SINGLE-PERSONA EXECUTION

- Repositori ini hanya menggunakan mod `fullstack` (`Fullstack Architect`). Mod `backend`/`frontend` telah digabungkan; mod bawaan `architect`, `code`, `ask`, `debug` dan `orchestrator` tidak digunakan.
- Jangan panggil `switch_mode` atau delegasikan kerja kepada persona lain. Perancangan, debugging, backend, frontend, Playwright, ujian dan release berlaku dalam satu execution loop.
- Pemilikan tunggal tidak bermaksud self-certification tanpa kawalan. Setiap tugas mesti melalui implementation pass dan acceptance pass yang berasingan secara konsep dalam Fasa A–E.
- Kekalkan formatting, komen dan struktur sedia ada melainkan refactor diminta. Elakkan perubahan luar skop dan jangan tulis semula kerja Owner.

## 2. STATUS & DEFINITION OF DONE

Gunakan hanya status eksplisit berikut:

1. `IN_PROGRESS` — intake/kerja sedang berjalan.
2. `IMPLEMENTED_UNVERIFIED` — implementasi dibuat tetapi acceptance pass belum selesai.
3. `VERIFIED_LOCAL` — semua acceptance criteria dan gate lokal berkaitan lulus; belum tentu dirilis.
4. `RELEASED_CI_PENDING` — release commit telah push tetapi CI belum selesai.
5. `RELEASED_CI_GREEN` — release commit disahkan di `origin/main` dan CI yang sepadan SUCCESS.
6. `BLOCKED` — kerja/release tidak dapat diteruskan; nyatakan blocker dan bukti.

Jangan melabel tugas selesai semasa masih menunggu ujian, push atau CI. `npm test` hijau sahaja bukan bukti acceptance pengguna atau release selesai.

## 3. FASA A — INTAKE & SAFETY SNAPSHOT

Sebelum mengubah sebarang fail:

1. Baca blok terkini `docs/SESSION_LEDGER.md`; selepas context reset/condensation, jangan percaya ringkasan sebagai ganti ledger.
2. Semak `git status`, staged/unstaged/untracked diff, `HEAD` berbanding `origin/main`, serta inventori perubahan Owner yang mesti dipelihara.
3. Semak terminal/proses/port aktif yang berkaitan. Jangan mulakan server atau runner pendua tanpa keperluan.
4. Rumuskan acceptance criteria, skop fail dan perkara yang tidak boleh berubah.
5. Klasifikasikan tugas sebagai backend, UI, coupled contract, security/migration, docs/governance atau operational work.
6. Pilih gate menggunakan matriks risiko di Seksyen 6. Jangan jalankan ritual yang tidak menghasilkan bukti untuk skop tersebut.
7. Untuk bug berisiko atau stateful, dapatkan baseline ujian bersasar dahulu jika praktikal.

Jika working tree tidak bersih, kenal pasti pemilik dan tujuan perubahan sebelum meneruskan. Jangan gunakan reset, checkout atau clean yang memusnahkan kerja sedia ada.

## 4. FASA B — REPRODUCE & CONTRACT MAPPING

1. Untuk bug, reproduksi gejala dahulu jika praktikal. Screenshot/laporan Owner ialah hipotesis yang mesti disahkan, bukan satu-satunya ground truth.
2. Petakan call-chain: input → transformasi → output → consumers. Sebut dependent callers sebelum mengubah shared signature atau kontrak.
3. Jalankan adversarial audit: null/undefined, race, timeout, partial failure, backward compatibility, secret exposure dan rollback.
4. Semak invariant serta assertion ujian berkaitan sebelum memilih pembaikan.

### Coupled-contract checklist — kondisional mengikut skop

- **Zon A — Model & Parameter:** `src/utils/modelCapabilities.js`, `src/services/gemini.js`, `src/services/providers/*` ↔ `public/config.js`, `public/partials/main.html` dan kawalan model/parameter berkaitan.
- **Zon B — Skema & Normalisasi:** `src/utils/config.js` ↔ `public/config.js` (`loadConfigToForm`, payload serialization) dan `src/utils/*PageGenerator.js`.
- **Zon C — Trinity & Tri-Door:** `src/services/channels/*`, `src/services/agentInspector.js`, `src/services/subfaberPreflight.js` ↔ kad Trinity, door/format dan validation UI.

Jika satu sisi berubah, semak pasangannya secara automatik. Jika tiada consumer UI/contract terlibat, rekod `N/A` bersama alasan; jangan buat perubahan pada pasangan hanya untuk simetri.

### Real-user verification untuk provider/model/validation

Sebelum surgery atau audit UI yang bergantung pada state provider/model/validation, replikasi aliran sebenar melalui Playwright: provider → test API key melalui `src/utils/testKeys.js` → base URL → door/format → Validate → model sehingga komponen sasaran render dengan data sebenar.

- Kunci tertakluk pada Zero Secret Logging dan skop ping/model-list/Playwright sahaja, bukan bulk translation.
- Jangan reka model list, error state, parameter card atau validation state tanpa bukti hidup.
- Happy path sahaja tidak memadai jika perubahan menyentuh ralat; uji negative/failure path yang relevan.
- Jika kunci/servis luar tidak tersedia, rekod blocker dan gunakan fixture hanya sebagai bukti separa—jangan dakwa real-provider verification selesai.

## 5. FASA C & D — IMPLEMENTATION & INDEPENDENT ACCEPTANCE

### Fasa C — Implementation

1. Edit hanya dalam skop; kekalkan defensive code lengkap tanpa placeholder.
2. Gunakan ujian bersasar semasa iterasi. Simpan full suite untuk acceptance/release.
3. Tambah atau kemas kini regression tests bagi behavior berubah. Jangan memadam/melemahkan assertion untuk mendapatkan hijau tanpa bukti liputan setara.
4. Semak syntax, secret leakage dan artifak sesi sebelum acceptance.
5. Jangan stage fail sehingga semakan akhir.

### Fasa D — Independent Acceptance Pass

Dalam persona yang sama, berhenti menilai berdasarkan niat implementasi dan semak semula berdasarkan permintaan asal Owner:

1. Buktikan setiap acceptance criterion melalui observable behavior, test atau output objektif.
2. Uji happy path serta negative/reload/rehydration/failure paths yang terlibat.
3. Semak diff akhir untuk perubahan luar skop, assertion dilemahkan, fail yatim dan ketidakserasian kontrak.
4. Untuk UI, jalankan Playwright serta visual critique yang relevan; screenshot dan console/network evidence tidak diganti oleh unit tests.
5. Rekod residual risk atau gate `N/A` secara jujur.
6. Hanya selepas semua gate lokal berkaitan lulus, tandakan `VERIFIED_LOCAL`.

## 6. RISK-BASED VERIFICATION MATRIX

| Jenis perubahan | Gate minimum | Gate kondisional |
|---|---|---|
| CSS/visual sahaja | Syntax/lint berkaitan; Playwright lokal; screenshot; visual critique; responsive/interaksi terlibat | Accessibility, theme toggle, console/network, reload |
| Provider/model/validation UI | Real-user flow; negative path; serialization/rehydration; targeted tests | Real key mengikut kontrak kunci; backend contract tests; full browser matrix |
| Backend tanpa UI | Call-chain/consumer audit; targeted tests; full suite sebelum release | Playwright hanya jika API consumer/UI terlibat; integration live jika kontrak luar berubah |
| Docs/agent governance sahaja | Validasi kandungan/struktur; Prettier berkaitan; diff audit | PyYAML untuk `.roomodes`; tests hanya jika runner/CI/release contract berubah |
| Security/data migration | Adversarial tests; backward compatibility; rollback/recovery; full suite | Live integration, backup/restore dan browser mengikut permukaan serangan |

Untuk setiap perubahan UI/CSS: buka halaman melalui Playwright, ambil screenshot, nilai visual balance/contrast/whitespace/interaksi, baiki sebelum `VERIFIED_LOCAL`. Firecrawl hanya untuk eksplorasi reka bentuk komponen baharu yang besar; implementasi kekal Vanilla JS/Native CSS.

## 7. TEST COVERAGE INVARIANTS

- `npm test` mesti menemukan dan menjalankan **100% fail `*.test.js`** di bawah `src/` dan `public/`; tiada pendaftaran manual atau test orphan dibenarkan.
- Runner mesti fail-closed jika discovery kosong/gagal dan pulangkan exit status sebenar Node test runner.
- Release memerlukan **0 FAIL** dan maksimum **1 SKIP** untuk live Redis integration yang sah. Jika SKIP berbeza, siasat sebagai blocker.
- Jangan memadam, memindah keluar suite atau melemahkan assertion tanpa bukti liputan setara dan justifikasi dalam ledger.
- Jumlah ujian direkod sebagai maklumat, bukan sasaran monotonik buta. Pecahan/penggabungan ujian dibenarkan jika behavior dan liputan kekal atau bertambah.
- Semasa debugging, gunakan `node --test <fail-bersasar>`; semasa release, `npm test` penuh wajib.

## 8. COMMIT CLASSES & SINGLE-COMMIT RELEASE

### Kelas 1 — Release Commit

Perubahan kod, prompt, konfigurasi aplikasi atau governance yang Owner arahkan untuk dirilis sebagai versi baharu. Wajib satu kali melalui Fasa E dan SemVer + CHANGELOG.

### Kelas 2 — Operational / Governance Update

Kemas kini ledger atau dokumen operasi tulen yang diarahkan tanpa release aplikasi:

- dikecualikan daripada SemVer, CHANGELOG versi baharu, cache-buster dan Playwright;
- hanya memerlukan validasi/Prettier berkaitan, explicit staging, staged-diff review, commit/push dan pengesahan sinkronisasi;
- jangan digunakan untuk menyembunyikan perubahan runtime atau test.

### Kelas 3 — Working Checkpoint

Hanya atas arahan eksplisit Owner, mengikut skop dan pengesahan yang ditetapkan Owner. Ia bukan release dan tidak boleh dianggap `VERIFIED_LOCAL`/`RELEASED_CI_GREEN` tanpa gate berkaitan.

### Fasa E — Single-Commit Release Pipeline

1. **Impact & Contract Audit:** sahkan acceptance, payload serialization, rehydration/DOM races dan server schema hanya mengikut skop; rekod `N/A` yang sah.
2. **SemVer:** bump `package.json` dan sinkronkan `package-lock.json`.
3. **CHANGELOG:** tambah entri versi baharu dengan skop dan bukti. Semua prosa, tajuk dan label dalam `CHANGELOG.md` WAJIB ditulis dalam English profesional untuk pembaca global; Bahasa Melayu hanya dibenarkan sebagai data teknikal verbatim seperti contoh prompt terjemahan, literal log atau nilai kontrak.
4. **Cache-buster:** sahkan `__APP_VERSION_QUERY__` dan `?_cb=` jika aset/version path terlibat; jika tidak, rekod NO-OP.
5. **Quality gates:** Prettier + ESLint + `npm test` penuh serta gate CI berkaitan; semua mesti hijau.
6. **Graphify:** `graphify update .` hanya jika runtime dan `graphify-out/` wujud; selain itu NO-OP tanpa skrip ad-hoc.
7. **Pre-release ledger:** kemas kini `docs/SESSION_LEDGER.md` SEKALI sebelum release commit dengan Parent HEAD SHA, status `VERIFIED_LOCAL`, keputusan Owner, fail, ujian lokal dan `Release Commit SHA + CI Run ID: disahkan dalam laporan penutup selepas push/CI`.
8. **Explicit staging & release:** gunakan senarai fail eksplisit—`git add -A` HARAM. Semak staged diff/status, buat SATU release commit dan push ke `origin/main`; sahkan remote menunjuk commit tersebut.
9. **CI:** gunakan `gh run watch`/CLI sehingga workflow bagi release commit SUCCESS.
10. **Final report:** laporkan Release Commit SHA, CI Run ID dan `RELEASED_CI_GREEN` terus kepada Owner. Jangan buat commit kedua semata-mata untuk menulis SHA/CI ke ledger.

Jika CI gagal, release kekal `RELEASED_CI_PENDING`; baiki punca melalui mandat/prosedur hotfix, bukan commit ledger kosmetik.

## 9. SESSION LEDGER & CONTINUITY

Entri terbaharu diletakkan di atas menggunakan `## YYYY-MM-DD — vX.Y.Z <TITLE>` dengan medan berkaitan:

- **Tarikh:** masa KL.
- **Parent HEAD SHA:** SHA sebelum release commit.
- **Status:** salah satu status rasmi; pre-release menggunakan `VERIFIED_LOCAL`.
- **Release Commit SHA + CI Run ID:** `disahkan dalam laporan penutup selepas push/CI` sebelum release; jangan reka nombor.
- **Keputusan Owner:** mandat dan batas skop.
- **Fail Terlibat:** fail sebenar.
- **Status npm test:** total/PASS/FAIL/SKIP atau `N/A` dengan alasan.
- **Next Steps:** hanya tindakan operasi selepas CI; jangan tinggalkan langkah release yang sudah dilakukan sebagai belum selesai.

Jika Owner mengumumkan manual condensation, append status semasa sebelum kerja lain. Historical ledger/CHANGELOG/plans dikekalkan verbatim; jangan salin legacy identifier ke kod aktif.

## 10. TECHNICAL & NOMENCLATURE INVARIANTS

- Gemini REST v1beta: `systemInstruction` kekal top-level `{ parts: [{ text }] }`; static/dynamic separation diurus `src/services/utils/structuredPrompt.js`.
- `thinkingBudget` mesti dipelihara. `minP`, `repetitionPenalty`, `topK` dan `topKEnabled` dibuang; jangan masukkan semula.
- HYBRID GUARD: `temperature`/`topP` SEND-ALL untuk semua Gemini 3.x; `frequencyPenalty`/`presencePenalty` disekat hanya untuk `3.x-strict`; `topK` haram. DeepSeek `disabled` → `reasoning_effort: 'none'`. Rujuk ground truth dalam `plans/gemini-sampling-ground-truth-2026.md` dan `plans/trinity-params-ground-truth-2026.md`.
- Identiti rasmi: `SubFaber`/`StremioSubFaber`; Trinity: `Agent Preflight`, `Agent Translation`, `Agent Inspector`. Legacy brand/agent identifiers tidak boleh kembali ke kod aktif.
- Dalam **panel parameter model Gemini**, HIDE ≠ LOCK: jangan gunakan `disabled` sebagai pengganti morphing visibility. Di luar komponen ini, disabled state dibenarkan untuk interaction safety yang sah.
- Untuk **akses DOM pilihan**, gunakan null-check seperti `if (!el) return;`. Elemen struktur wajib tidak boleh gagal senyap; gunakan assertion/error yang jelas.
- Kekalkan rehydration daripada config kanonik, bukan stale DOM; `populateGeminiModelDropdowns()` membaca `currentConfig.geminiModel`, mengekalkan `-preview` fallback, rank #1 selection dan refresh kawalan selepas repopulation.
- UI ialah Vanilla JS/Native CSS; tiada React/JSX, third-party UI library atau font/icon CDN. Hormati token `public/css/subfaber-theme.css` dan `public/themes/mario.css`.

## 11. TOOL, TERMINAL & FILE HYGIENE

- Semak tool/MCP/CLI yang tersedia dahulu; jangan reinstall dependency yang sudah disediakan. Playwright untuk browser, Context7 untuk dokumentasi library/API, Firecrawl untuk web, `gh` untuk GitHub Actions dan `docker` untuk container.
- Jangan cipta throwaway scripts untuk tugas yang boleh dilakukan tool/CLI sedia ada. Artifak diagnostik mesti dipadam sebelum commit.
- Jangan blanket-kill Node/MCP. Port-bound service: bunuh PID/port khusus. Standalone script/test: targeted match nama fail sahaja.
- Hadkan 1–2 background tasks, gunakan timeout dan elakkan output besar dalam PTY; log sementara mesti dipadam.
- Jika template cache tidak segar, restart hanya server pada port 7001; jangan ganggu Node runtime lain.
- `graphify query` lebih diutamakan untuk topology jika runtime tersedia; jika tidak, gunakan read/search biasa tanpa menjana runner ad-hoc.

## 12. `.ROOMODES` EDIT DISCIPLINE

- Jangan edit `.roomodes` melalui `apply_diff`, `write_to_file` atau inline `node -e`.
- Pulihkan daripada clean base jika perlu dan ubah melalui script file yang dijalankan daripada system temp di luar repo, kemudian padam segera.
- Sebelum commit, parse dengan PyYAML dan sahkan tepat satu `customModes`, `slug=fullstack`, `groups=[read,edit,command,mcp]` dan `source=project`.
- `.roomodes` kekal padat dan merujuk dokumen ini sebagai SSOT; jangan salin semula keseluruhan workflow ke dalamnya.

## 13. LANGUAGE POLICY

Komunikasi dengan Owner menggunakan Bahasa Melayu Malaysia standard. Kekalkan syntax, technical terminology, filenames dan commands dalam bahasa asal tanpa terjemahan janggal.

**ENGLISH-ONLY CHANGELOG LOCK (dikunci semula daripada mandat v3.14.0):** `CHANGELOG.md` WAJIB menggunakan English profesional untuk semua tajuk, kategori dan prosa, termasuk semasa mengoreksi atau menulis semula entri sejarah. Jangan sekali-kali menganggap bahasa komunikasi Owner sebagai kebenaran untuk menulis changelog dalam Bahasa Melayu. Pengecualian hanya untuk data teknikal verbatim yang mesti dikekalkan, seperti contoh prompt/output terjemahan, literal log, identifier dan nilai kontrak. Semak polisi ini pada setiap CHANGELOG edit dan semasa acceptance/release.
