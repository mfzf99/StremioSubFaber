# PLAN PEMBEDAHAN A-Z — Upgrade & Cleaning Rumah SubFaber (Governance + Tooling)

**Tarikh:** 2026-11-27 (KL) · **Status:** DRAF — menunggu semakan dan kelulusan Owner · **Asal:** Audit tadbir urus read-only sesi 2026-11-26 (GLM 5.4) · **Parent HEAD:** `b1541fc0` (v3.41.3, CI run `45856090913` = success)

> Setiap dakwaan dalam pelan ini disahkan terhadap fail sebenar atau output arahan dalam sesi audit. Tiada kod aplikasi disentuh oleh pelan ini sehingga Owner meluluskan peringkat berkenaan. Rujukan `F1`–`F12` ialah nombor temuan audit.

---

## 0. Prinsip Tidak Boleh Dinafikan

| # | Prinsip | Sumber |
|---|---|---|
| P1 | `git add -A` haram — senarai fail eksplisit sahaja pada setiap peringkat | SSOT §8 |
| P2 | Satu release = satu commit; Class 2/3 tidak menaikkan SemVer/CHANGELOG | SSOT §8, RELEASE_PIPELINE §1 |
| P3 | Sifar proses dibunuh tanpa kebenaran Owner — 6 daripada 24 `node.exe` ialah MCP server | F12, proc-triage |
| P4 | Sifar kekunci API dibaca/dicetak pada bila-bila masa | `.roomodes` Rule 9 |
| P5 | Skil ialah panduan bawahan kepada mandat Owner, SSOT dan `.roomodes`; tidak membenarkan delegasi, stack baharu, atau verifikasi lebih lemah | SSOT §1 |
| P6 | Sejarah kekal verbatim — ledger, CHANGELOG dan pelan lama tidak ditulis semula | SSOT §9, §13 |
| P7 | Komunikasi dengan Owner dalam BM; dokumen rasmi dalam English profesional | SSOT §13 |

---

## 1. Ringkasan Eksekutif

Audit menemui 12 temuan dan punca akhir insiden "MCP terpadam". Ia bukan disiplin agent semata-mata, tetapi **peraturan yang hilang ditambah jurang mekanikal**:

1. Commit `85bb9a69` (v3.9.47) ada seksyen penuh `[PROCESS LIFECYCLE, TERMINAL DISCIPLINE & MCP PRESERVATION]` dengan larangan "ZERO TOLERANCE BLANKET KILLS" dan senarai arahan terlarang.
2. Commit `3a533324` (2026-10-27) memampatkannya kepada satu baris.
3. Commit `33704232` (2026-11-10, "slim under 200 lines") memindahkan baki keluar SSOT dan **menggugurkan rasional MCP, senarai larangan `/IM`, had zombie, dan langkah pembersihan**.
4. Pada masa sama `dcg 0.7.7` **meluluskan** `taskkill /F /IM node.exe`, `Stop-Process -Name node -Force`, dan `Get-Content .env` (disahkan `dcg test`).

Pelan ini menutup jurang secara mekanikal dahulu (A–C), kemudian kontradiksi dokumen (D–F), kebersihan (G–H), skil (J), dan gate baharu (K–L).

---

## 2. Panduan Kelas Komit dan Gate

| Peringkat | Kelas | Gate minimum | Gate bersyarat |
|---|---|---|---|
| A, B | Class 2 (luar repo + `.roomodes`) | `dcg test` sebelum/selepas, PyYAML, Prettier berskop | Reload Zoo Code (Owner) |
| C–F, H | Class 2 (docs/governance/tooling) | Validasi kandungan, `node --check`, Prettier berskop, audit diff | ujian jika runner/CI berubah |
| G | Class 1 Patch (`package.json`) | full suite, Prettier, CI hijau | Live Redis |
| J | Class 2 (`.roo/skills`) | Validasi struktur skil | N/A |
| K, L | Class 2 (gate baharu) | RED→GREEN, full suite melalui pre-commit | CI hijau |

Semua peringkat berasingan. Owner boleh meluluskan satu, beberapa, atau semua.

---

## 3. Peringkat A — Kunci Mekanikal Larangan Bunuh Proses

**Masalah (F2/F3):** `dcg` meluluskan pembunuhan proses secara pukal dan pembacaan `.env`.

**Fail:** `C:/Users/khaty/.config/dcg/config.toml` (luar repo).

**Tindakan:**

1. Salin `config.toml` → `config.toml.bak-2026-11-27`.
2. Tambah dalam `[overrides] block` (corak diuji dengan `dcg test` **sebelum** disimpan):
   ```toml
   { pattern = "(?i)\\btaskkill\\b[^|;&]*\\s/IM\\s", reason = "Killing by image name takes every MCP server down with it. Kill the one PID you triaged." },
   { pattern = "(?i)\\bStop-Process\\b[^|;&]*\\s-Name\\s", reason = "Killing by process name takes every MCP server down with it. Kill the one Id you triaged." },
   { pattern = "(?i)^\\s*(type|cat|more)\\s+[^|;&]*\\.env", reason = "Printing an env file puts secrets into the transcript." },
   { pattern = "(?i)Get-Content\\b[^|;&]*\\.env", reason = "Printing an env file puts secrets into the transcript." },
   ```
3. Bukti RED→GREEN (`dcg test`, tiada arahan sebenar dilaksanakan):

   | Arahan | Sebelum | Selepas (wajib) |
   |---|---|---|
   | `taskkill /F /IM node.exe` | ALLOWED | BLOCKED |
   | `Stop-Process -Name node -Force` | ALLOWED | BLOCKED |
   | `Get-Process node \| Stop-Process -Force` | ALLOWED | BLOCKED |
   | `taskkill /F /PID 4242 /IM node.exe` | ALLOWED | BLOCKED |
   | `type .env`, `Get-Content .env`, `cat .env` | ALLOWED | BLOCKED |
   | `taskkill /F /PID 4242` | ALLOWED | ALLOWED |
   | `Stop-Process -Id 4242 -Force` | ALLOWED | ALLOWED |
   | `node scripts/proc-triage.js`, `git push origin main`, `npm test` | ALLOWED | ALLOWED |

**Had yang jujur:** regex tidak tahu PID mana milik MCP. Gate ini menghapuskan bentuk *by-name* (punca sebenar insiden), bukan semua pembunuhan. "Semak sebelum bunuh" datang dari Peringkat B + C.

**Rollback:** salin semula `.bak`.

---

## 4. Peringkat B — Pulihkan Peraturan Proses + MCP dalam SSOT

**Masalah (F3):** SSOT tidak ada peraturan proses; ia hanya merujuk ke RELEASE_PIPELINE §6.

**Fail:** `.roo/rules/00-subfaber-core-protocol.md`, `.roomodes`.

**Tindakan:**

1. Tambah sub-seksyen **`### 11.5 Process lifecycle & MCP preservation`** (≤ 8 baris) dalam SSOT §11:
   - Sebelum sebarang `kill`/`taskkill`/`Stop-Process`: senaraikan proses dengan **command line**, klasifikasikan pemiliknya (MCP server / editor / server aplikasi / ujian sendiri), dan bunuh hanya **PID yang dikenal pasti**.
   - Larangan keras: bunuh mengikut nama imej/proses (`/IM`, `-Name`, `pkill node`, `killall node`) — diletakkan **sebelah** sasaran positif di atas.
   - Sebelum memulakan ujian/pelayar baharu: semak proses lama yang menjalankan **skrip yang sama**; satu tugas = satu proses.
   - Sebarang pembunuhan direkod dalam `.tmp/RELAY_STATE.md` (field `Evidence`) dengan PID dan sebab.
   - Rasional satu baris: MCP server (Context7, Playwright, Firecrawl, Crawl4AI) tinggal dalam `node.exe`; satu `taskkill /IM` memutuskan kesemua tool MCP.
2. Tukar rujukan §11.2 supaya menyebut §11.5 bersama RELEASE_PIPELINE §6.
3. Dalam RELEASE_PIPELINE §6, tambah satu baris yang menunjuk balik ke SSOT §11.5 (tiada duplikasi teks).
4. Dalam `.roomodes` Rule 9, tambah satu ayat padat yang menunjuk ke SSOT §11.5.

**Gate:** PyYAML (1 entri, `slug=fullstack`, `groups=[read,edit,command,mcp]`, `source=project`), Prettier berskop SSOT, SSOT kekal ≤ 200 baris, `node scripts/relay-state-gate.js` PASS.

---

## 5. Peringkat C — Skrip Triaj Proses (read-only, di-track)

**Masalah (F12):** `dcg` menyekat `powershell -Command`/`-File` dari terminal agent, jadi agent buta terhadap command line.

**Bukti kebolehlaksanaan:** prototaip `.tmp/audit-governance-2026-11-26/proc-triage.js` berjalan melalui `node <fail>` (diluluskan `dcg`) dan mengelas 24 proses: 6 MCP server, 17 ujian tergantung, 1 triaj.

**Fail baharu:** `scripts/proc-triage.js` + `!scripts/proc-triage.js` dalam `.gitignore` + `.prettierignore` (pola sama dengan `relay-state-gate.js`).

**Tindakan:**

1. Promosikan prototaip: kekalkan `pid`, induk, masa mula, port, kelas, dan **penanda skrip** (nama fail sahaja, bukan argumen penuh) supaya tiada rahsia bocor.
2. Skrip **tidak pernah** membunuh; ia hanya mencetak dan tamat dengan `SUMMARY {...}`.
3. Ujian regresi kecil: sumber skrip tidak mengandungi `Stop-Process`, `taskkill`, `process.kill`, atau `.kill(` (pin sifat read-only).

**Kelas:** Class 2. **Rollback:** padam satu fail + dua baris konfigurasi.

---

## 6. Peringkat D — Betulkan Kontradiksi HYBRID GUARD (F1)

**Masalah:** SSOT:134 masih mengarahkan penindasan penalty untuk `3.x-strict`; `PROVIDER_CONTRACTS_REFERENCE.md §3` (mandat v3.39.5, commit `0dc20c9b`) memansuhkannya. Kod ikut yang baharu (`src/services/gemini.js:834`).

**Fail:** `.roo/rules/00-subfaber-core-protocol.md` (satu baris). `.roomodes` Rule 3 tidak berubah (ia hanya merujuk SSOT).

**Tindakan:** ganti baris HYBRID GUARD dengan:

> SEND-ALL v2 (Owner mandate 2026-11-20): the Gemini native door always sends `temperature`, `topP`, `thinkingLevel`, `frequencyPenalty`, `presencePenalty`; penalties default to `0.0`; the former `3.x-strict` penalty suppression is repealed and the engine no longer filters. `topK` is forbidden; DeepSeek `disabled` → `reasoning_effort: 'none'`. Ground truth: `plans/gemini-sampling-ground-truth-2026.md`, `plans/trinity-params-ground-truth-2026.md`.

**Gate:** padanan teks dengan `PROVIDER_CONTRACTS_REFERENCE.md §3`; sifar perubahan kod; `gemini-sendall-v2-regression.test.js` hijau.

---

## 7. Peringkat E — Selaraskan `PROVIDER_CONTRACTS_REFERENCE.md §5` (F9)

**Masalah:** dokumen menulis `const runtimeTrinityMode = 'basic';` tetapi kod ialah `resolveTrinityModeForConfig(config)` (`src/utils/cacheKeys.js:87`): `config.trinityMode` → `config.trinity.mode` → lalai `'basic'`. Dokumen itu ditulis pada `33704232` (2026-11-10) dan kod berubah pada `342babc3` (2026-11-15, "revive Pro mode") tanpa dokumen diikuti.

**Tindakan:** ganti ayat dengan:

> The server runtime is **Basic by default**: `src/handlers/subtitles.js` derives `runtimeTrinityMode` through `resolveTrinityModeForConfig(config)` (`src/utils/cacheKeys.js`), whose priority is explicit `config.trinityMode` > `config.trinity.mode` > `basic`. The Agent Inspector pipeline is only constructed when the resolved mode is `pro`; otherwise it is `null`. The current UI runtime stays on Basic, so the default applies in practice.

**Kenapa penting:** dokumen lama akan buat agent sangka Pro mustahil, padahal ia hanya *lalai*.

---

## 8. Peringkat F — Kemas Kini MCP Config (F4)

**Masalah:** 25 tool Firecrawl + 7 Playwright berada dalam `alwaysAllow` **dan** `disabledTools`; polisi "below 60 tools" sudah lapuk (realiti 27 aktif).

**Fail:** `.roo/mcp.json`, `docs/RELEASE_PIPELINE_REFERENCE.md §5` (satu ayat).

**Tindakan:**

1. Buang 32 entri bertindih dari `alwaysAllow` (kekal di `disabledTools`).
2. `firecrawl_crawl` dan `firecrawl_extract` dibuang dari `alwaysAllow` tetapi **tidak** ditambah ke `disabledTools` — kekal boleh didayakan bila benar-benar perlu (polisi sedia ada).
3. Polisi ditukar kepada angka semasa: "27 enabled tools as of 2026-11-27; re-count on every `mcp.json` edit."
4. Buang `context7.env.DEFAULT_MINIMUM_TOKENS` (string kosong, tiada kesan).

**Kesan sampingan:** perlu **restart MCP dalam UI Zoo Code** oleh Owner. Sebab itu Peringkat F dilaksanakan di hujung sesi.

---

## 9. Peringkat G — Buang Skrip Mati dalam `package.json` (F5)

**Masalah:** `test:release`, `test:manual` → `scripts/run-tests.js`; `update:anime-list` → `update-anime-list.js`. Kedua-dua fail dipadam pada commit `82edaf1e` (2026-03-17, "Release v1.4.75"); skripnya masih diiklan. Satu-satunya rujukan lain ialah fail pelan ini.

**Fail:** `package.json` (3 baris).

**Tindakan:**

1. Buang ketiga-tiga skrip mati.
2. **Tidak** menambah `test:redis` — env lintas-platform dalam `package.json` perlukan `cross-env` (dependency baharu, melanggar SSOT). Arauhan sedia ada kekal: `set REDIS_INTEGRATION_PORT=6379 && npm test`.
3. Gate: `npm test` kekal 877 ujian / 78 fail; Prettier `package.json`; CI hijau.

**Nota:** ini satu-satunya peringkat yang menyentuh fail konfigurasi aplikasi, jadi ia di Class 1 Patch dengan SemVer + CHANGELOG.

---

## 10. Peringkat H — Kebersihan Artifak (F8) dan Ledger (F7)

### H1 — Artifak

**Bukti:** `.tmp` 476 fail / 27.3 MB; 21 fail `.tmp-*` di root; `.playwright-mcp` 564 fail; `.tmp/audit-kill.log` = 44 PID dibunuh (2026-11-10).

**Tindakan (hanya selepas Owner klik "ya"):**

1. Aku jana `.tmp/CLEANUP-MANIFEST-2026-11-27.txt` — setiap fail yang dicadangkan dipadam, dibahagikan: (a) log ujian `.log/.tap/.out` > 7 hari, (b) skrip probe satu kali `.tmp/*.js|ps1`, (c) snapshot `.playwright-mcp/*.yml` kecuali 24 jam terakhir, (d) fail root `.tmp-*`, (e) `.diag-t2.log`, `.server*.log`.
2. **JANGAN sentuh:** `.tmp/RELAY_STATE.md`, `.tmp/skills-eval/`, fail rekod `.tmp/*.md` (`KIMI_HANDOVER*.md`, `FRONTEND_HANDOFF*.md`, `CHATGPT_IDEAS_EVALUATION*.md`), `.tmp/audit-kill.log` (bukti insiden), `sbx-tuning-*.png`, `plans/v3.41.3-new-task-prompt.md`.
3. Owner semak manifest, baru padam dilaksanakan dengan senarai eksplisit.

### H2 — Ledger

**Bukti:** `docs/SESSION_LEDGER.md` 3,941 baris / 788 KB; 81 entri `VERIFIED_LOCAL` termasuk yang sudah dirilis.

**Cadangan (pilihan Owner):**

- **Pilihan 1 (konservatif, disyorkan):** tambah **indeks ringkas** (≤ 40 baris) di bahagian atas: 15 entri terkini dengan SHA + status muktamad, dan nota "sejarah penuh di bawah". Tiada entri lama diubah. SSOT §9 dipinda: "baca blok teratas" = baca indeks + blok semasa.
- **Pilihan 2 (agresif):** arkibkan entri > 30 hari ke `docs/SESSION_LEDGER_ARCHIVE_2026-10.md` secara **pemindahan verbatim**. Hanya dengan kelulusan eksplisit kerana ia menyentuh sejarah.

---

## 11. Peringkat J — Pasang Skil GOLD

**Keputusan penilaian 70 skil (26 Addy Osmani + 44 Matt Pocock; kedua-dua repo MIT):**

| Keputusan | Skil | Sebab |
|---|---|---|
| **GOLD** | `constraint-driven-development` (Addy) | Menyediakan **skrip sebenar** (`floor-guard`, `quality-gate`) yang menukar prosa SSOT §5.4 kepada gate mekanikal; sifar dependency. Diuji live: fixture jahat → exit 1 dengan 3 temuan betul. |
| **GOLD** | `diagnosing-bugs` (Matt) | Disiplin gelung diagnosis yang SSOT tiada: gelung *red-capable* ketat, 3–5 hipotesis boleh-palsu, instrumentasi bertanda `[DEBUG-xxxx]`. |
| **GOLD** | `writing-for-agents` (Matt) | *Context pointer*, *leading word*, larangan dalam bentuk positif, pemangkasan *no-op*. Tepat untuk SSOT/`.roomodes`/skil. |
| NICHE | `codebase-design`, `domain-modeling`, `code-review-and-quality`, `security-and-hardening`, `documentation-and-adrs` | Berguna tetapi bertindih SSOT Phase B/D; boleh dipasang kemudian bila perlu. |
| BUANG | 21 skil yang perlukan sub-agent / agent latar / issue tracker | Melanggar SSOT "Never invoke `switch_mode` or delegate" |
| BUANG | `frontend-ui-engineering`, `improve-codebase-architecture`, `setup-pre-commit`, `browser-testing-with-devtools` | React/Tailwind (haram), Husky (dependency baharu), chrome-devtools MCP (tiada; Playwright sudah ada) |
| BUANG | `debugging-and-error-recovery`, `tdd`, `test-driven-development`, `using-agent-skills`, `context-engineering`, semua `writing-*`/`scaffold`/`triage`/`to-*`/`retro`/`wizard`/`ask-matt`/`migrate-to-shoehorn`/`setup-*` | Bertindih SSOT §4.1/§5 atau bukan relevan |

**Pemasangan:**

1. Salin ke `.roo/skills/`: `constraint-driven-development/` (dengan `references/floor-guard.md` + `scripts/quality-gate.mjs`), `diagnosing-bugs/` (dengan `scripts/hitl-loop.template.sh`), `writing-for-agents/` (dengan `SKILL-MECHANICS.md`). Setiap satu dengan `LICENSE.txt` MIT.
2. Fail `agents/openai.yaml` (metadata Codex) **tidak** disalin — bukan keperluan Zoo Code.
3. `diagnosing-bugs` merujuk `scripts/hitl-loop.template.sh` (bash HITL). Di Windows tanpa bash, langkah itu digantikan dengan nota "Windows: guna `node <skrip>`" — satu baris tambahan dalam SKILL.md, direkodkan dalam ledger.
4. Temuramah 4 soalan `constraint-driven-development` dijalankan **sekali** oleh Owner sebagai Peringkat K.

**Gate:** setiap skil ada `SKILL.md` + frontmatter `name`/`description`; beban konteks diukur (panjang `description` kerana ia dimuat setiap sesi).

---

## 12. Peringkat K — `CONSTRAINTS.md` + Floor Guard

**Prasyarat:** Peringkat J.

**Tindakan:**

1. Temuramah 4 soalan dengan Owner (satu soalan pada satu masa, setiap satu ada lalai). **Cadangan lalai SubFaber:** Q1 = liputan kod baru + keselamatan; Q2 = blok pada *floor*, amaran untuk yang lain; Q3 = *ratchet* (ukur dan tahan); Q4 = 90 saat.
2. Tulis `CONSTRAINTS.md` di root; setiap baris ada lajur "Checked by" (arahan sebenar yang menghasilkan veredik).
3. Adaptasi `floor-guard.mjs` untuk SubFaber:
   - Skop hanya `*.js` (atau `.constraintsignore` untuk `plans/`, `docs/`, `CHANGELOG.md`) — menghapuskan positif palsu yang ditemui semasa ujian live.
   - `catch (_)` kosong yang disengajakan **tidak** dilaporkan bila baris sebelumnya ada komen `// intentional: <sebab>`.
4. **Wiring (pilih SATU):**
   - **Pilihan 1 (disyorkan):** `npm run check:floor` + satu baris dalam `.git/hooks/pre-commit` **selepas** relay gate dan **sebelum** suite penuh (gate murah jalan dulu).
   - **Pilihan 2:** CI sahaja.

**Gate RED→GREEN wajib:** fixture jahat (eslint-disable + empty catch + `.skip` + test dipadam) mesti gagal; diff bersih mesti lulus; repo sebenar mesti lulus tanpa positif palsu.

---

## 13. Peringkat L — Redis Service dalam CI (F6)

**Masalah:** CI tiada service Redis dan tiada `REDIS_INTEGRATION_PORT`, jadi **14 ujian live-Redis sentiasa SKIP di CI** (disahkan daripada log run `45856090913`: `tests 877 / fail 0 / skipped 14` pada Node 22 dan 24).

**Fail:** `.github/workflows/ci.yml`.

**Tindakan:**

1. Tambah `services: redis: image: redis:7-alpine` dengan `ports: 6379:6379` dan health check.
2. Set `REDIS_INTEGRATION_PORT: 6379` pada langkah "Run regression tests".
3. Keputusan sasaran: `tests 877 / fail 0 / skipped 0` pada kedua-dua Node.

**Kelas:** Class 2 (CI). Gate: CI pertama selepas push mesti menunjukkan `skipped 0`.

---

## 14. Peringkat M — Gate Terminal-State Insiden (F10, gap SSOT §5.4)

**Masalah:** gap direkod 2026-11-14 masih terbuka: tiada gate mekanikal untuk "insiden mesti sampai ke terminal state".

**Tindakan:**

1. Ujian regresi yang mengimbas output telemetri insiden selepas setiap kitaran hidup dan menegaskan **sifar `in_progress`** pada akhir.
2. Bukti RED→GREEN dengan satu insiden yang sengaja dibiarkan `in_progress`.
3. Selepas gate wujud, ayat "open gap" dalam SSOT §5.4 digugurkan dan digantikan dengan nama ujian.

**Nota:** ini ujian aplikasi (bukan docs), jadi ianya **mandat berasingan** yang memerlukan pembedahan `translationEngine.js`. Dicadangkan sebagai pelan susulan, bukan sebahagian batch ini.

---

## 15. Peringkat N — 17 Ujian Tergantung (keputusan Owner diperlukan)

**Bukti (proc-triage, read-only):** 17 proses `node --test --test-reporter=tap --test-timeout=40000 src/storage/redis-live-purge-integration.test.js` dari 2026-11-26 18:32–20:32, semuanya **induk sudah keluar**. `--test-timeout` tidak menghentikan `before()`/`after()` hook yang menunggu sambungan Redis. Tiada satu pun menguasai port.

**Cadangan:**

1. Owner lulus: aku bunuh **17 PID spesifik tersebut sahaja** (senarai direkod dalam relay), **bukan** `taskkill /IM`.
2. Kemudian siasat punca: sama ada `--test-force-exit` (seperti `run-tracked-tests.js`) mesti ditambah pada arahan ujian bersasar, atau hook `after()` perlu `quit()` yang lebih defensif. Ini ujian + kemungkinan satu baris dalam fail ujian — mandate kecil berasingan.

**Sifar proses dibunuh dalam sesi audit ini.**

---

## 16. Susunan Cadangan dan Anggaran

| Giliran | Peringkat | Kelas | Anggaran |
|---|---|---|---|
| 1 | A + B + C | Class 2 | satu sesi |
| 2 | D + E + G | Class 1 Patch (G) + Class 2 (D, E) | satu sesi |
| 3 | L | Class 2 (CI) | separuh sesi |
| 4 | J + K | Class 2 | satu sesi (temuramah K memerlukan Owner) |
| 5 | F + H | Class 2 | hujung sesi (F perlu restart MCP) |
| 6 | M + N(2) | mandate berasingan | kemudian |

---

## 17. Risiko dan Had

| Risiko | Mitigasi |
|---|---|
| Corak `dcg` baharu terlalu luas (sekadar arahan sah) | diuji dengan `dcg test` pada 10 arahan sebelum disimpan; rollback `.bak` |
| Floor guard positif palsu (prosa docs) | skop `*.js` + `.constraintsignore`; diuji pada repo sebenar |
| Restart MCP selepas Peringkat F | dilaksanakan di hujung sesi, Owner yang restart |
| Temuramah K mengambil masa | lalai disediakan untuk setiap soalan; "saya tak tahu" ialah jawaban sah |
| Peringkat M menyentuh enjin terjemahan | mandate berasingan, bukan batch ini |
