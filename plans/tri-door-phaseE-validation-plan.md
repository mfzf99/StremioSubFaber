# FASA E — VALIDASI PRODUKSI VPS / E2E TRINITY ENGINE

**Tarikh disediakan:** 2026-10-10 (15:47 MYT)
**Prasyarat:** Fasa A+B (`6eafdbf`), Fasa C (`1a7fabb`), Fasa D (`e11f816`) — semua CI hijau. Baseline `npm test` 346/345/0/1.

---

## 0. OBJEKTIF

Membuktikan hujung-ke-hujung bahawa Trinity Engine berjalan pada **ketiga-tiga pintu format** di atas deployment VPS produksi — bukan sekadar unit test. Model rujukan sesi terdahulu (ledger 2026-10-09): Trinity ALL-GREEN pada pintu OpenAI sahaja (kimi-k3 + deepseek + gemini rotation). Fasa E mengulangi skrip sama pada pintu Gemini Native & Anthropic Messages tulen.

## 1. MATRIKS UJIAN (6 SKENARIO)

| # | Agent Preflight | Agent Translation | Agent Inspector | Pintu berkesan | Status |
|---|---|---|---|---|---|
| E1 | openai (kimi-k3) | openai (deepseek) | openai (deepseek-v4-pro) | Semua OpenAI | ✅ terbukti (ledger 2026-10-09) — smoke semula sahaja |
| E2 | gemini (gemini-3.5-flash, thinkingLevel low) | gemini | gemini | Semua Gemini Native | ⬜ ujian utama |
| E3 | anthropic (claude-sonnet-4) | anthropic | anthropic | Semua Anthropic | ⬜ ujian utama |
| E4 | gemini | openai | anthropic | Campuran (bukti independen per-ejen) | ⬜ |
| E5 | openai | gemini | openai | Campuran | ⬜ |
| E6 | openai | openai | gemini | Campuran | ⬜ |

Kaedah: `.env` VPS (`AGENT_B_FORMAT`, `agentB` via config UI Fasa D) ditukar per skenario; fail SRT rujukan sama (korpus SRT Happiness E1 — 745 entri, dipercayai masih di VPS).

## 2. KRITERIA LULUS (ALL-GREEN per skenario)

1. **Agent Preflight:** HTTP 200 + JSON sah melalui `parsePreflightResponse` + ≥1 tiang bible terisi (terms/characters) + log `[AgentB][AgentChannel] format=<pintu> source=<auto|override>` betul.
2. **Agent Translation:** sifar mismatch batch + sifar PROHIBITED_CONTENT + output SRT sah.
3. **Agent Inspector:** ≥1 batch diaudit + `valid:true` ATAU crimes di-retry dengan jayanya + fail-open tidak berlaku tanpa sebab rangkaian.
4. **Forensik payload:** log axios menunjukkan endpoint & bentuk betul per pintu:
   - Gemini: `/v1beta/models/{model}:generateContent` + `systemInstruction` top-level + tiada sampling pada model 3.x-strict.
   - Anthropic: `/v1/messages` + `system` top-level + `max_tokens` ≤ 64000.
5. **Tiada regresi laluan rootsys:** skenario E1 kekal 4m46s ± latensi normal, muatan 4-kunci god-tier.

## 3. LANGKAH PELAKSANAAN DI VPS

1. `git pull` ke `93f58aa` (atau HEAD semasa).
2. Restart service; buka `/configure` — **smoke test UI Fasa D dahulu**: kad Trinity mount, togol Basic↔Pro, badge autodetect (uji 3 jenis key), simpan & muat semula (round-trip).
3. Skenario E2: set Trinity UI (Pro mode) — semua 3 kad key Gemini `AIza…`, format Auto, model `gemini-3.5-flash`. Simpan. Jalankan terjemahan SRT ujian.
4. Skenario E3: sama dengan key `sk-ant-…`, format Auto → autodetect anthropic.
5. Skenario E4-E6: campuran per kad.
6. Setiap skenario: catat masa, kos, isu; append blok ledger.
7. Pasca: E1 smoke semula (regresi rootsys = sifar).

## 4. RISIKO & MITIGASI

| Risiko | Mitigasi |
|---|---|
| Latensi Gemini Fasa 0 tinggi (thinkingLevel terlepas) | `geminiChannel` default `thinkingLevel:'low'`; jika DQ 300s, turunkan model ke 3.5-flash / kurangkan korpus |
| Anthropic `max_tokens` 64000 ditolak model tertentu | builder clamp; jika 400, set `maxTokens` per kad lebih rendah (8192) |
| Kekurangan kredit Anthropic | skenario E3 boleh ditunda; E2/E4-E6 tidak bergantung Anthropic penuh |
| UI Fasa D: input legasi `#geminiApiKey` lapuk | sudah disegerak dalam payload fix; smoke test §3.2 mengesahkan |
| `agentB.baseUrl` kosong untuk pintu gemini/anthropic | channel builder menggunakan endpoint lalai rasmi (generativelanguage / api.anthropic.com) — tidak bergantung baseUrl rootsys |

## 5. OUTPUT & PENUTUP

- Laporan: `plans/tri-door-phaseE-validation-report.md` (papan skor 6 skenario + forensik).
- Ledger: blok Fasa E + keputusan (pintu default produksi, sama ada rootsys kekal lalai utama).
- Keputusan strategik owner pasca-E: sama ada Quick Setup baharu pengguna lalai = Trinity Pro campuran atau kekal legasi.
