# SESSION LEDGER — StremioSubFaber

> Protokol kesinambungan sesi (mandat owner 2026-10-08): Setiap tugasan yang
> selesai SEBELUM release wajib di-append di sini sebagai satu blok log. Ini
> adalah memori episodic projek — melengkapi (bukan menggantikan) nota misi
> dalam `plans/*.md` dan struktur kod itu sendiri.
>
> Format blok: Tarikh / Komit SHA / Keputusan Owner / Fail Terlibat /
> Status npm test / Next Steps. Terkini di atas.

---

## 2026-10-08 — Alias SSH canonical `stremiosubfaber` + Protokol Session Ledger

- **Tarikh:** 2026-10-08 (17:40–18:30 MYT)
- **Komit SHA:** `69717ec` (alias SSH) + komit sesi ini (ledger + .gitignore — SHA di-append selepas komit)
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
