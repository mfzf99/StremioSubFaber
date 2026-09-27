# Laporan Pembedahan BETA RUN 9 — Penyatuuan DeepSeek Stack & Hierarki Kebenaran

**Tarikh**: 2026-09-27
**Status**: PELAKSANAAN DILULUSKAN (SENIOR ARCHITECTURE SPECIFICATION)
**Pelaksana**: GLM 5.3 (Lead Backend Engineer)
**Mod**: Backend

---

## 1. Logik Empirikal & Keputusan Terminal

| Bukti Empirikal | Keputusan Terminal |
|---|---|
| Had masa hulu pelayan Caddy `rootsys.cloud` | **Tepat 300s** (Kimi K3 mencetus ralat **502** akibat letupan token penaakulan) |
| `deepseek-v4-pro` analisis Pre-Flight 4-tiang | **3.45 saat** dengan struktur JSON yang sah |
| Risiko mitigasi | *Upstream Error Propagation* — racun tekaan Pre-Flight tidak menular ke semua kelompok |

---

## 2. Tindakan Pembedahan Kod

### A. Penyelarasan Model Agent B (TRINITY BETA RUN 9)

| Fasa | Model Lama (BETA RUN 8) | Model Baharu (BETA RUN 9) | Timeout |
|---|---|---|---|
| Fasa 0 — Pre-Flight Makro | `kimi-k3` | **`deepseek-v4-pro`** | **60,000ms / 60s** (dari 180s) |
| Fasa 1 — Pemeriksa Utama | `deepseek-v4-pro` | `deepseek-v4-pro` (kekalkan) | 45,000ms / 45s |
| Fallback Universal | `deepseek-v4.1-flash` | `deepseek-v4.1-flash` | Dinamik (mewarisi fasa) |

- [`src/utils/config.js`](../src/utils/config.js) — `AGENT_B_PREFLIGHT_MODEL` env default `'kimi-k3'` → `'deepseek-v4-pro'`; ulasan trinity dikemas kini ke BETA RUN 9.
- [`src/services/agentBInspector.js`](../src/services/agentBInspector.js) — `AGENT_B_PREFLIGHT_MODEL = 'deepseek-v4-pro'`, `AGENT_B_PREFLIGHT_TIMEOUT_MS = 60000`; `preflightHierarchy` lalai kini `[deepseek-v4-pro, deepseek-v4.1-flash]`.

### B. Penambahbaikan Prompt Pre-Flight — Disiplin Bukti

[`src/services/subfaberPreflight.js`](../src/services/subfaberPreflight.js):

- Seksyen baharu **`## FACT VS INFERENCE DISCIPLINE (MANDATORY)`** disuntik ke dalam [`buildPreflightPrompt()`](../src/services/subfaberPreflight.js) dengan arahan verbatim mandat:

  > *"FACT VS INFERENCE DISCIPLINE: Only lock relationships or canonical_address in 'characters' if there is EXPLICIT, UNAMBIGUOUS textual evidence in the source. If gender, social hierarchy, or formal title is unclear, DO NOT GUESS; mark canonical_address as null or omit the character."*

- Direktif `canonical_address` dalam Task pillar 3 diperkuat: kunci **HANYA** dengan bukti teks eksplisit; jika tidak jelas → `null` (bukan tekaan).
- Skema JSON contract turut menyatakan pilihan `null` untuk `canonical_address`.
- **Skema 4-tiang bersih dikekalkan**: `{ theme, terms, characters, credits_and_titles }` — tiada perubahan struktur.

### C. Suntikan Hierarki Kebenaran ke Agent A

[`src/services/translationEngine.js`](../src/services/translationEngine.js) — [`_formatPreflightForChunk()`](../src/services/translationEngine.js):

- Setiap blok konteks kelompok Agent A kini membuka dengan seksyen **`### HIERARCHY OF TRUTH`** berisi arahan tegar verbatim mandat:

  > *"HIERARCHY OF TRUTH: Pre-flight context provides macro-guidance. However, the SOURCE DIALOGUE in the current batch is the absolute ground truth. If the source dialogue explicitly contradicts a pre-flight title, gender, or assumption, ALWAYS FOLLOW THE SOURCE DIALOGUE."*

- Ini ialah **jaring keselamatan Agent A (Gemini)**: dialog sumber sebenar sentiasa mengatasi andaian Pre-Flight — menghalang penularan racun Fasa 0.

### D. Kemas Kina Sokongan Runtime & Konfig

- [`src/handlers/subtitles.js`](../src/handlers/subtitles.js) — fallback lalai `preflightModel` `'kimi-k3'` → `'deepseek-v4-pro'` + ulasan BETA RUN 9.
- [`.env.example`](../.env.example) — dokumentasi trinity dikemas kini (`Fasa 0: deepseek-v4-pro — timeout 60s`).

---

## 3. Ujian Regresi

### Ujian Dikemas Kini ([`src/services/agentB-inspector-regression.test.js`](../src/services/agentB-inspector-regression.test.js))

| Kontrak | Asal | Baharu |
|---|---|---|
| Fasa 0 default | `kimi-k3` | `deepseek-v4-pro` |
| `preflightHierarchy` lalai | `[kimi-k3, deepseek-v4.1-flash]` | `[deepseek-v4-pro, deepseek-v4.1-flash]` |
| `AGENT_B_PREFLIGHT_TIMEOUT_MS` | `180000` | `60000` |
| Log `Running pre-flight... [kimi-k3]` | — | `[deepseek-v4-pro]` |
| Failover Fasa 0 | `kimi 504 → flash` | `pro 504 → flash` |
| TRINITY dual-hierarchy test | Fasa 0 = kimi | Fasa 0 = pro |

### Ujian Baharu (Seksyen 17 — BETA RUN 9)

1. **`BETA RUN 9 — Pre-Flight lalai deepseek-v4-pro dengan timeout 60s`** — mandat (a): model lalai utama + timeout.
2. **`BETA RUN 9 — fallback universal deepseek-v4.1-flash pada Fasa 0 dan Fasa 1`** — mandat (c): kedua-dua fasa beralih ke flash pada HTTP 502.
3. **`BETA RUN 9 — hierarki kebenaran hadir dalam suntikan konteks kelompok Agent A`** — mandat (b): `### HIERARCHY OF TRUTH` + arahan verbatim dalam [`_formatPreflightForChunk()`](../src/services/translationEngine.js).
4. **`SubFaberPreflight: prompt enforces FACT VS INFERENCE DISCIPLINE`** ([`src/services/subfaber-preflight-regression.test.js`](../src/services/subfaber-preflight-regression.test.js)) — larangan tekaan wajib hadir verbatim.

---

## 4. Keputusan Ujian

- Baseline wajib: **230+ PASS, 0 FAIL** (`npm test` — test:tracked).
- Semua kontrak warisan (universal payload `{model, temperature: 0.0, messages}`, fail-open, circuit breaker, resilient parser, disiplin skema 4-tiang) **dikekalkan 100%**.

---

## 5. Mesej Commit Rasmi

```
feat(agentb): adopt full deepseek frontier stack for preflight and enforce source hierarchy of truth
```

**Push**: `git push origin main`
