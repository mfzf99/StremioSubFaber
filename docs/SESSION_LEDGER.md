# SESSION LEDGER — StremioSubFaber

> Protokol kesinambungan sesi (mandat owner 2026-10-08): Setiap tugasan yang
> selesai SEBELUM release wajib di-append di sini sebagai satu blok log. Ini
> adalah memori episodic projek — melengkapi (bukan menggantikan) nota misi
> dalam `plans/*.md` dan struktur kod itu sendiri.
>
> Format blok: Tarikh / Komit SHA / Keputusan Owner / Fail Terlibat /
> Status npm test / Next Steps. Terkini di atas.

---

## 🧪 STATUS SEMASA SEBELUM MANUAL CONDENSATION (owner announcement 2026-10-09 00:39 MYT)

- **Tujuan blok ini:** Owner mengumumkan manual condensation sebagai UJIAN LANGSUNG prosedur rule #7. Blok ini ditulis SEBELUM butang ditekan, mengikut prosedur.
- **HEAD Git:** `a65a6cb` — semua kerja didorong ke origin/main, working tree bersih dari perubahan track.
- **Status tugasan:** Misi "Perfect Coherence" 2026-10-08 LENGKAP — TIADA tugasan tergendala.
  - Global rules: `.roo/rules/` (00-core-protocol + 10-context7 + 20-process-management) — semua dikomit & didorong (`74f2ad9`, `747f611`)
  - `.roomodes`: backend 7 + frontend 6 rules — condensation-proof (`5f12e1c`)
  - Ledger: lengkap sehingga `a65a6cb`
  - Graphify: skill + topology dalam repo (`f70a627`), graph dibina dari `5d0274f`
- **npm test baseline:** 305 / 304 PASS / 0 FAIL / 1 SKIP (terakhir disahkan semasa Fasa H; tiada kod produksi berubah sejak itu).
- **Ujian yang owner sedang jalankan:** Selepas condensation, owner dijangka menyuruh AI menyemak sama ada AI (pasca-condense) masih "sedar" keadaan melalui ledger ini. Inilah pengesahan empirikal prinsip "a summary is not a memory - verify against the ledger."
- **Arahan untuk AI pasca-condensation:** Baca blok ini, sahkan HEAD semasa dengan `git log --oneline -1` (sepatutnya `a65a6cb` atau lebih baharu), kemudian jawab owner dalam BM standard tanpa berhalusinasi. Semua yang kau perlu tahu ada dalam repo — bukan dalam ringkasan context kau.

---

## 2026-10-08 (SELESAI) — 2 rules user-global dipindahkan ke workspace — SEMUA rules kini version-controlled

- **Tarikh:** 2026-10-09 (00:29 MYT)
- **Komit SHA:** `747f611`
- **Keputusan Owner:** 2 rules user-global (`context7-docs.md` + `process-management.md`) dipindahkan MANUAL oleh owner ke workspace sebagai `10-context7-docs.md` + `20-process-management.md`; global `C:/Users/khaty/.roo/rules/` dikosongkan (zero-duplikasi). Sebelum ini owner juga mengosongkan Custom Instructions for All Modes UI — ujian AI baharu LULUS (4 sections dikenal pasti, source "Rules from .roo directories", jawapan dalam BM standard mengikut LANGUAGE POLICY).
- **Fail Terlibat:** `.roo/rules/10-context7-docs.md` (+6), `.roo/rules/20-process-management.md` (+16)
- **Pengesahan AI:** Kandungan kedua-dua fail utuh (ZERO TOLERANCE taskkill node.exe + Context7 discipline); global kosong (0 files); susunan abjad 00→10→20 betul.
- **Status npm test:** Tak dijalankan semula (tiada kod produksi disentuh sepanjang misi coherence).
- **Next Steps:** TIADA — misi "Perfect Coherence" 2026-10-08 lengkap. Sesi AI seterusnya mewarisi: 3 fail rules repo + .roomodes (7+6 rules) + ledger + Graphify topology — semuanya version-controlled.

---

## 2026-10-08 (final+++) — Rule #5 MODE-ACTIVATION AWARENESS + .roo/rules/00-subfaber-core-protocol.md

- **Tarikh:** 2026-10-08 (23:10 MYT)
- **Komit SHA:** `5f12e1c` (frontend #6 self-sufficient) + `74f2ad9` (fail core protocol)
- **Keputusan Owner:**
  1. Rule #5 MODE-ACTIVATION AWARENESS ditambah dalam Custom Instructions UI (kesan forensik pelanggaran: commit dibuat semasa mode Frontend aktif — kelompongan: tiada arahan bila arahan owner bercanggah dengan domain mode; AI wajib flag dulu, owner sahkan override, tak pernah senyap).
  2. Frontend rule #6 diperkukuh prosedur amaran condensation (self-sufficient — customInstructions di-inject per-mode; frontend tak nampak rules backend).
  3. Fail `.roo/rules/00-subfaber-core-protocol.md` (24 baris) ditambah MANUAL oleh owner (workspace, general rules) — 4 seksyen: MULTI-AGENT PROTOCOL 5 item + LANGUAGE POLICY + SESSION CONTINUITY + .ROOMODES DISCIPLINE (pelajaran insiden). Global instructions kini version-controlled.
  4. Perbincangan `.roo/rules/`: kelebihan (version-controlled, ikut repo, modul alphabetical, AGENTS.md support) + kos (token per sesi, satu sumber kebenaran). Owner akan kosongkan UI global selepas sahkan fail load pada sesi baharu.
- **Fail Terlibat:** `.roo/rules/00-subfaber-core-protocol.md` (baharu), `.roomodes` (frontend #6), Custom Instructions UI (rule #5)
- **Status npm test:** Tak dijalankan semula (tiada kod produksi disentuh).
- **Next Steps:** Owner kosongkan "Custom Instructions for All Modes" UI selepas verify fail load pada sesi baharu (elak double-load token + drift).

---

## 2026-10-08 (final++) — Rule SESSION LEDGER diperluas kepada condensation/compression oleh owner

- **Tarikh:** 2026-10-08 (22:07 MYT)
- **Komit SHA:** `f372502`
- **Keputusan Owner:** Ayat baharu untuk backend rule #7 dan frontend rule #6 — menutup loophol condensing manual yang owner tanya ("kalau aku tekan butang context condesing secara manual sebab dah rasa berat"). Owner paste manual, AI sahkan & komit.
- **Butiran perubahan (owner-mandated):**
  - Trigger baharu: `context reset, new session, OR context condensation/compression (conversation history replaced by a summary)`
  - Anti-PALATAU: `a summary is not a memory: never trust condensed recall for commit SHAs, test baselines, or task state; always verify against the ledger`
  - Prosedur baharu: `If the owner announces an upcoming manual condensation, append current task status to ledger BEFORE proceeding` (backend sahaja)
- **Pengesahan AI sebelum komit (protokol insiden):** PyYAML SAH — customModes 2; backend 7 rules + frontend 6 rules; `condensation: True`, `summary is not a memory: True`, `upcoming manual condensation: True` (backend); groups+source lengkap; diff seimbang 19/19 = penukaran teks tulen.
- **Status npm test:** Tak dijalankan semula (tiada kod produksi disentuh).
- **Next Steps:** Tiada tindakan berbaki — sistem Trinity kini lengkap dengan trigger condensation.

---

## 2026-10-08 (final+) — Skill Graphify dipulihkan semula (dangling 91dd8d4)

- **Tarikh:** 2026-10-08 (21:39 MYT)
- **Komit SHA:** `f70a627`
- **Keputusan Owner:** Soalan owner "benda pertama AI akan buat adalah tengok map graphify?" membuka forensik — didapati komit `91dd8d4` (skill Graphify 10 fail) HILANG dari main: ia jadi mangsa `git reset --hard HEAD~2` semasa pemulihan insiden .roomodes (reset melangkau 2 komit). Komit masih wujud (dangling) → dipulihkan verbatim via `git checkout 91dd8d4 -- .codebuddy/` (protokol: checkout, bukan tulis semula).
- **Fail Terlibat:** `.codebuddy/skills/graphify/` (10 fail, +1,589 baris)
- **Demo live query Graphify:** query "what connects runPreflightSemanticPass to buildChatRequest" pulangkan topology sebenar (Community 17→19, melalui AgentBInspector/OpenAICompatibleProvider, termasuk splitStructuredPrompt + fail test) — bukti nilai query-first discipline.
- **Status npm test:** Tak dijalankan semula (tiada kod produksi disentuh — hanya restore fail skill yang sama dari komit sedia ada).
- **Next Steps:** Tiada tindakan berbaki.

---

## 2026-10-08 (final) — .roomodes diseragamkan English oleh owner

- **Tarikh:** 2026-10-08 (20:06 MYT)
- **Komit SHA:** `91813bd` (entri ini — .roomodes English) + `2371db0` (nota insiden 856da99)
- **Keputusan Owner:** Arahan modes Backend & Frontend diseragamkan kepada Bahasa English sepenuhnya oleh owner sendiri (tiada lagi bahasa rojak) — perubahan dibuat tangan owner, AI hanya mengesahkan & mengomit.
- **Fail Terlibat:** `.roomodes` (29 baris ditukar, struktur + bilangan rule kekal)
- **Pengesahan AI sebelum komit (protokol insiden):** PyYAML SAH — customModes 2; backend 7 rules (CORE PROHIBITION, PRESERVATION, GROUND TRUTH, TEST BASELINE 305/304, DELEGATION, RELEASE PIPELINE, SESSION LEDGER) + frontend 6 rules (semua kekal, termasuk SESSION LEDGER); groups [read,edit,command,mcp] + source project lengkap; diff seimbang 29/29 = penukaran bahasa tulen, tiada rule hilang.
- **Status npm test:** 305 / 304 PASS / 0 FAIL / 1 SKIP (diaturkan selepas pemulihan insiden — kekal hijau)
- **Next Steps:** Tiada tindakan berbaki. `npm test` baseline stabil; CI hijau dijangka pada 91813bd.

---

## 2026-10-08 (later) — Imbasan topologi kod pertama (Graphify) — MANDAT SELESAI

- **Tarikh:** 2026-10-08 (18:43–18:50 MYT)
- **Komit SHA:** `425dff6` (entri ini) + `91dd8d4` (skill `.codebuddy/` dikomit arahan owner - 10 fail, +1,589 baris) + `856da99` (rule SESSION LEDGER dalam `.roomodes`: backend #7 + frontend #6 - pemulihan muktamad via git checkout 425dff6 + insert programatik Python + validasi PyYAML, hanya +2 baris)
- **NOTA INSIDEN (jujur):** Percubaan #1 (apply_diff, `40aeefa`) dan #2 (write_to_file, `394ed84`) MEROSAKKAN `.roomodes` - modes hilang dari zoo code owner. Punca #1: indentation salah diwarisi; punca #2: kandungan tercemar lapisan markdown. PEMULIHAN MUKTAMAD `856da99`: `git checkout 425dff6` (base bersih) + insert programatik script Python + validasi PyYAML (customModes 2; backend 7 rules + frontend 6 rules; groups + source lengkap). **PELAJARAN KEKAL: `.roomodes` HANYA selamat diubah via git checkout dari komit bersih + insert programatik script fail + validasi PyYAML SEBELUM komit. DILARANG mutlak: apply_diff, write_to_file terus ke `.roomodes`, node -e inline - ketiga-tiganya terbukti gagal dalam insiden ini.**
- **Keputusan Owner (mandat AI owner):**
  1. Imbasan topologi `graphify . --code-only` dijalankan — exit code 0, sifar kos API (AST tempatan).
  2. Integriti fail disahkan: `graphify-out/GRAPH_REPORT.md` (36.7KB) + `graph.json` (4.96MB, 3,697 nodes / 9,004 edges / 149 communities) + `graph.html` (3.83MB) wujud; `git status` membuktikan sifar fail output terlepas ke staged/untracked — `.gitignore` (rule `:62-63`) bekerja seperti dijangka.
  3. Entri ledger ini merakam status pemasangan Graphify + baseline ujian 304 PASS kekal hijau + ketersediaan peta topologi untuk sesi seterusnya.
- **Butiran imbasan:** 196 fail kod diparse (84 fail tak berkaitan di-skip; 3 fail sensitif di-skip selamat: `.npmrc`, `a07-max-tokens.json`, `resp-a07-max-tokens.txt`); 321 non-code di-skip (270 docs, 51 images) — TIADA panggilan LLM. Extraction: 94% EXTRACTED / 6% INFERRED (531 edges, avg confidence 0.85) / 0% AMBIGUOUS. Token cost: 0 input / 0 output. Graph dibina dari komit `5d0274f` — segar.
- **Toolchain:** graphifyy 0.9.80 (uv tool) + skill CodeBuddy `.codebuddy/skills/graphify/SKILL.md` (project-scoped) + `~/.codebuddy/CODEBUDDY.md` global.
- **Next Steps:**
  1. Sesi seterusnya boleh mulakan dengan `graphify query "<soalan>"` untuk navigasi topologi berbanding baca fail mentah.
  2. Selepas sebarang perubahan kod: `graphify update .` (sifar kos API) supaya peta kekal segar.
  3. Penilaian nilai sebenar Graphify: adakah query discipline jimat token vs baca fail — direkod dalam ledger bila ada data sebenar.

---

## 2026-10-08 — Alias SSH canonical `stremiosubfaber` + Protokol Session Ledger

- **Tarikh:** 2026-10-08 (17:40–18:30 MYT)
- **Komit SHA:** `69717ec` (alias SSH) + `17aa659` (ledger + .gitignore + .roomodes baseline)
- **Keputusan Owner:**
  - Pemindahan penamaan total ke `stremiosubfaber` dilaksanakan cara senior dev: deprecation transition — alias canonical `stremiosubfaber` ditambah dalam `~/.ssh/config`, alias legacy `stremiosubmaker` dikekalkan semasa tempoh burn-in (backup: `~/.ssh/config.bak-stremiosubfaber`).
  - Mandat PROTOKOL SESSION LEDGER diterima daripada AI owner: (1) fail ini wajib di-append setiap tugasan selesai; (2) `graphify-out/` wajib diabaikan git; (3) persediaan imbasan topologi Graphify disahkan.
- **Fail Terlibat:**
  - `~/.ssh/config` (luar repo — backup + blok `Host stremiosubfaber stremiosubmaker`)
  - `plans/kimi-k3-rootsys-ground-truth-2026.md` — §5.7 nota rantaian akses dikemas kini
  - `docs/SESSION_LEDGER.md` — fail ini (wujud)
  - `.gitignore` — +`graphify-out/` (guard sebelum imbasan pertama)
- **Status npm test:** 305 tests / 304 PASS / 0 FAIL / 1 SKIP (baseline kekal, `stremio-subfaber@3.8.41`)
- **Next Steps:**
  1. Install `uv` + `graphifyy` (Python 3.12.2 ✓) — persediaan imbasan topologi pertama.
  2. Jalankan `/graphify . --code-only` selepas persediaan disahkan → nilai `GRAPH_REPORT.md` untuk codebase SubFaber.
  3. Rekod keputusan penilaian Graphify dalam ledger ini.
  4. Selepas tempoh burn-in, buang `stremiosubmaker` dari `~/.ssh/config` (pemindahan 100% penuh).

---

## 2026-10-07/08 — Fasa H: Pre-Flight system/user split (G1 Moonshot) — v3.8.41

- **Tarikh:** 2026-10-07–08
- **Komit SHA:** `16bc5a0` (Fasa H, 9 fail +311/−24) + `8456307` (nota baseline)
- **Keputusan Owner:**
  - "Teruskan fasa H" — integrasi varian G1 (system/user split) pemenang eksperimen Fasa G ke produksi, melalui konvensyen `SUBFABER_PROMPT_BOUNDARY` + `splitStructuredPrompt()`; kontrak single-string prompt kekal (cache key/token counting/retry tak berubah); Gemini & Anthropic dapat split percuma.
  - Bug legasi ditemui & dibunuh: `meta.systemPrompt` diterima tapi tak pernah digunakan dalam laluan fallback `buildChatRequest`.
- **Fail Terlibat:** `src/services/subfaberPreflight.js`, `src/services/agentBInspector.js`, `src/services/providers/openaiCompatible.js`, `make-preflight-payload.js`, `make-preflight-payload-slim.js`, `src/services/subfaber-fasah-regression.test.js` (baharu, 8 ujian), `package.json` (3.8.41 + test:tracked), `CHANGELOG.md`, `plans/kimi-k3-rootsys-ground-truth-2026.md` (§6.2–§6.3, §7)
- **Status npm test:** 305 / 304 PASS / 0 FAIL / 1 SKIP (297→304 selepas suit Fasa H didaftarkan)
- **Deployment:** VPS `stremiosubfaber` — `git pull` + `docker compose up -d --build subfaber`, kontena sihat @ 3.8.41, CI SUCCESS (`16bc5a0`)
- **Next Steps:** (direkod dalam §6.3/§7 nota misi) — validasi empirikal pasca-integrasi 3 run SRT sebenar di VPS (menunggu kelulusan owner).

---

## 2026-10-07 — Fasa G: Eksperimen Moonshot 9 panggilan (G1/G2/G3 × 3)

- **Tarikh:** 2026-10-07
- **Komit SHA:** `dd1d2f5` (Fasa F+G docs)
- **Keputusan Owner:** "Aku beri keizinan Fasa G" — eksperimen 3 varian struktur prompt dijalankan di VPS (kimi-k3 via rootsys, payload god-tier 4-kunci).
- **Keputusan eksperimen:** G1 MENANG (terms J 0.72, null spread 7pt ≤10pt, pollution 0, type 100%); G2 DIBUANG (chars J 0.67 — precision-over-recall potong watak sebenar); G3 TIDAK PRAKTIKAL (reasoning ~2×, timeout R3 290s).
- **Fail Terlibat:** `.tmp-kimi-gen-g.js`, `.tmp-kimi-g-run.sh`, `.tmp-kimi-analyze-g.js` (probe — tidak dikomit), `plans/kimi-k3-rootsys-ground-truth-2026.md` (§6.2)
- **Status npm test:** 298 / 297 PASS / 0 FAIL / 1 SKIP
- **Next Steps:** Fasa H integrasi G1 (selesai — lihat blok atas).
