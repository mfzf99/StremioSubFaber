# SubFaber Engine — Deklarasi Taksonomi Komponen Rasmi

> **MANDAT OWNER 2026-10-09:** Standard penamaan rasmi bagi 3 komponen enjin
> SubFaber, berkuat kuasa serta-merta untuk SEMUA perbincangan seni bina, log
> operasi, dan interaksi ejen. Dokumen ini ialah **satu-satunya sumber kebenaran
> taksonomi** (single source of truth). Entri sejarah dalam `plans/*.md` dan
> `docs/SESSION_LEDGER.md` yang mengguna istilah lama KEKAL VERBATIM (arkib
> sejarah, tidak ditulis semula) — baca melalui kacamata pemetaan §2.

---

## 1. Taksonomi Rasmi (3 Komponen Enjin)

| # | Nama Rasmi | Fail Fizikal (KEKAL — jangan rename) | Peranan |
|---|-----------|---------------------------------------|---------|
| 1 | **Agent Preflight** | `src/services/subfaberPreflight.js` | Analisis semantik seluruh fail SEBELUM terjemahan bermula (Fasa 0): jana kontrak JSON 4-tiang (theme / terms / characters / credits_and_titles) yang menjadi konteks global "Bible" untuk semua kelompok terjemahan. Best-effort, non-blocking: kegagalan tidak menggagalkan pipeline. |
| 2 | **Agent Translation** | `src/services/translationEngine.js` | Penterjemah utama (Worker): kelola kelompok baris, suntik konteks Agent Preflight + sliding context, dispatch ke provider (Gemini / OpenAI-compatible / Anthropic / DeepL / Google Translate), stream hasil entri-demi-entri. |
| 3 | **Agent Inspector** | `src/services/agentBInspector.js` | Askar pertahanan semantik: semak setiap kelompok hasil (sumber vs hasil) bagi mengesan 6 jenayah (MERGE / SHIFT / PHANTOM / DROP / UNTRANSLATED / REGISTER) dan picu retry. Juga pelaksana fizikal offload Fasa 0 (model preflight = model inspector — seni bina Dual-AI). |

**Aliran enjin:** `Agent Preflight` (Fasa 0, sekali per fail) → `Agent Translation`
(kelompok demi kelompok) → `Agent Inspector` (audit setiap kelompok; FAIL-OPEN —
tidak pernah menggagalkan terjemahan).

## 2. Pemetaan Alias Lama → Rasmi (Rujukan Silang)

Semua istilah kiri berikut TERMAJLUK (deprecated) dalam perbincangan baharu.
Kod sedia ada yang mengguna nama-nama ini (nama fail, identifier, string log)
KEKAL TIDAK BERUBAH buat masa ini — pemetaan ini hanya untuk komunikasi
seni bina, log, dan dokumentasi.

| Istilah Lama (DEPRECATED) | Istilah Rasmi |
|---------------------------|---------------|
| Preflight / Pre-Flight / Pre-Flight Semantic Pass / Fasa 0 engine | **Agent Preflight** |
| Enginetranslation / Engine Translation / Translation Engine | **Agent Translation** |
| Agent A / AGENT A (Worker) | **Agent Translation** |
| Inspection / Agent B / AGENT B / Inspector / Agent B Inspector | **Agent Inspector** |

## 3. Peraturan Penggunaan (BERKUAT KUASA)

1. Semua perbincangan seni bina, laporan audit, entri SESSION_LEDGER baharu,
   komen kod baharu, dan dokumentasi baharu WAJIB guna nama rasmi §1.
2. Nama fail fizikal dalam `src/` dan signature fungsi TIDAK berubah buat masa
   ini (mandat owner 2026-10-09: kekalkan kod sedia ada & baseline ujian
   313 tests / 312 PASS / 0 FAIL / 1 SKIP). Rename fizikal hanya atas arahan
   owner eksplisit dengan pelan migrasi berasingan.
3. Bila merujuk kod fizikal, kekalkan nama sebenar fail/fungsi (cth
   `subfaberPreflight.js`, `runPreflightSemanticPass`) — taksonomi melapisi
   penamaan kod, bukan menggantikannya.
4. Entri sejarah (plans/, ledger lama) tidak ditulis semula — guna §2 untuk
   tafsiran.
5. Dokumen ini mesti dikemas kini sekiranya komponen baharu ditambah ke enjin
   atau peranan komponen sedia ada berubah.

## 4. Nota Seni Bina (Konteks)

- **Dual-role Agent Inspector:** Selain audit kelompok, Agent Inspector juga
  melaksanakan Fasa 0 secara fizikal (payload preflight dihantar melalui laluan
  OpenAI-compatible inspector — model preflight = model inspector, seni bina
  Dual-AI 2026-09-26). Bila log menunjukkan "pre-flight menggunakan model
  Agent B", itu ialah kelakuan direka, bukan bug.
- **Hierarki kebenaran:** dialog sumber sebenar mengatasi andaian Agent
  Preflight (HIERARCHY OF TRUTH) — jaring keselamatan Agent Translation.
- **Rantaian akses fizikal:** `translationEngine.js` (Agent Translation)
  memanggil `runPreflightSemanticPass()` dari `subfaberPreflight.js` (Agent
  Preflight) dan Namespace-import `sentry`-style untuk inspector
  (`agentBInspector.js`).

---

**Berkuat kuasa:** 2026-10-09 (16:20 MYT) — mandat owner, direkodkan dalam
`docs/SESSION_LEDGER.md` dan dikomit ke Git.
