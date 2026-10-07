# 🔬 NOTA PENYELIDIKAN: KIMI K3 GROUND TRUTH (MOONSHOT RASMI + GATEWAY ROOTSYS)

**Tarikh:** 2026-10-07
**Status:** Fasa A + B + C + D SELESAI + Ground Truth #3 (standard industri preflight). Mode sembang — TIADA kod produksi diubah.
**Mis�si induk:** Polish prompt Pre-Flight (Fasa 0, `src/services/subfaberPreflight.js`). Owner mandate: hanya model **reasoning** layak kendalikan preflight — kimi-k3 (via gateway rootsys bos Afiq) adalah pilihan tunggal.
**Baseline projek semasa nota ini ditulis:** v3.8.39 (commit e08d7d8), `npm test` = 295 tests / 294 PASS / 0 FAIL / 1 SKIP.

---

## 1. LATAR BELAKANG — KENAPA NOTA INI WUJUD

Prompt Pre-Flight 4-tiang (theme/terms/characters/credits) adalah "Bible" yang diracun ke SEMUA batch Agent A. Bible lemah = terjemahan SAMPAH. Sebelum polish prompt, owner arahkan ground truth research dua lapisan:

1. **Ground truth #1 — spec rasmi Moonshot** (apa kimi-k3 sebenarnya)
2. **Ground truth #2 — tingkah laku SEBENAR melalui gateway rootsys** (`https://rootsys.cloud/v1`) — kerana ilmu rasmi hanya 100% terpakai jika direct ke `api.moonshot.ai`. Rootsys ialah proxy; dia boleh strip/normalize parameter.

---

## 2. GROUND TRUTH #1 — SPEC RASMI KIMI K3 (Moonshot AI)

Sumber: platform.kimi.ai docs (Model Parameter Reference, Reasoning Effort, Prompt Best Practices), kimi.ai/blog/kimi-k3 (tech blog rasmi), Unsloth, OpenRouter, pihak ketiga (Towards Data Science, Prompt Architects — disemak vs docs Moonshot Ogos 2026).

### 2.1 Kad calon
| Medan | Nilai |
|---|---|
| Saiz | **2.8T parameter total, ~104B aktif** (MoE 16/896 experts, Stable LatentMoE) |
| Arkitektur | Kimi Delta Attention (KDA) + Attention Residuals (AttnRes) |
| Context | **1,048,576 token (1M)** — input+output KONGSI kolam yang sama |
| Multimodal | Native vision |
| Status | **Model reasoning MURNI** — thinking sentiasa ON, tak boleh OFF |
| Reasoning | `reasoning_effort`: `"low"` / `"high"` / `"max"` — **DEFAULT "max"** |
| Sampling | `temperature` FIXED 1.0 (nilai lain → **error** pada API rasmi), `top_p` fixed 0.95, `n=1`, penalties fixed 0 — "Do not pass explicitly" |
| Output | `max_completion_tokens` lalai 131,072 |
| Benchmark | GPQA-Diamond 93.5, HLE 43.5, MMMU-Pro 81.6, BrowseComp 91.2 (effort max) |

### 2.2 Perangai penting
- **Default max thinking:** tidak hantar `reasoning_effort` = berfikir paling dalam, paling lambat, paling mahal.
- **Bajet kongsi:** output = 1M − prompt. **Token penaakulan dikira atas bajet OUTPUT** — eksperimen pihak ketiga: separuh jawapan kosong kerana thinking makan bajet habis (`finish_reason: "length"`).
- **Preserved Thinking:** multi-turn WAJIB pulangkan `reasoning_content` sejarah; kalau tak, "generation quality highly unstable". (Kita selamat — preflight single-turn.)
- **Excessive proactiveness:** K3 buat keputusan di luar sempadan bila arahan kabur. Ubat rasmi: "impose more explicit behavioral constraints in the system prompt" → justifikasi scope-fence/DECISION DISCIPLINE.
- **Prefix cache (API rasmi):** automatik, floor 256 token, append-never-insert, **menukar reasoning_effort mid-session = invalidate seluruh cache**. Harga rasmi: input miss $3/MTok, hit $0.30/MTok (10×), output $15/MTok.
- **Penempatan kandungan (panduan rasmi):** dokumen/konteks tetap DI KEPALA messages, arahan/soalan DI EKOR (selari Anthropic, bertentangan konvensyen OpenAI).

### 2.3 Pemetaan panduan prompting rasmi → prompt preflight semasa
Sudah ada: Role, XML delimiters, langkah bernombor, null-escape-hatch, panjang theme.
Belum ada: **system message berasingan** (kita flat 1 user message), **dokumen di kepala** (`<text>` kita di tengah-hujung), scope fence eksplisit, few-shot, quote-then-claim grounding.

### 2.4 Noda forensik lama
Keputusan lama membuang `reasoning_effort` dari payload ("pencetus overthinking +90-110s") datang dari eksperimen **muatan 7-kunci bercampur** (effort diuji bersama max_tokens/response_format/extra_body/top_p) — parameter disalah secara kolektif, tak pernah diasingkan. Docs rasmi kata `reasoning_effort:"low"` justru tuas rasmi KURANGKAN penaakulan. → Dibuktikan boleh diuji (lihat Fasa B).

---

## 3. GROUND TRUTH #2 — GATEWAY ROOTSYS (bos Afiq)

Akses dashboard: `https://rootsys.cloud/buyer/*` via localStorage `buyerToken` (JWT). Key API: **"SubFaber"** `fiq-8793841e07f78d440259b0bb9ccfeda6` (2.20B/2.70B token terpakai, ~27d berbaki semasa risikan). Akaun: Plus member.

### 3.1 Dapatan dashboard
- **Models:** `kimi-k3` dilabel "1M context + Vision" (sahih dengan spec rasmi). Turut ada: kimi-k2.7, glm-5.1/5.2/5.3/5.3-flash/flashx, deepseek-v4-flash/v4-pro/v4.1-flash, minimax-m3, hy3/hy4, gpt-5.6-luna/sol/terra, gpt-6-astra.
- **Docs:** Base URL `https://rootsys.cloud/v1`; `POST /v1/chat/completions` (OpenAI-compatible); `GET /v1/models`; `GET /v1/quota`. Auth: teks kata `Authorization: Bearer`, contoh curl rasmi mereka guna `X-API-Key` (kedua-duanya nampak boleh). **Rate limit: 30 req/min per key, 120 req/min per IP** (429 + Retry-After). **SILING HARDCODE CADDY HULU: tepat 300s** (dari forensik lama beta-run9 — `--max-time 290` digunakan untuk semua curl).
- **Status:** kimi-k3 **Operational 99.6% answered (13,131 panggilan/24j)**. Nota samping: glm-5.3 (model Agent A) Degraded 97.3% pada masa risikan.
- **Usage/analytics:** respons API mendedahkan medan bonus yang API rasmi Moonshot tak tunjuk dalam bentuk sama: `usage.completion_tokens_details.reasoning_tokens`, `completion_thinking_tokens`, `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`, dan **`credit`** (kos sebenar per panggilan).
- Rootsys sendiri akui response time "set by the upstream provider" → pengesahan ia PROXY ke upstream (Moonshot sebenar), bukan deployment sendiri.

---

## 4. FASA A — UJIAN PARAMETER ACCEPTANCE (SELESAI, 19 panggilan)

Pelari: `.tmp-kimi-run.js` / `.tmp-kimi-run2.js` (PC tempatan, curl.exe; folder `.tmp-kimi/`). Prompt tiny "Reply with exactly: OK".

### 4.1 Keputusan acceptance (10 ujian — SEMUA HTTP 200)
| Ujian | Param dihantar | Hasil |
|---|---|---|
| a01 | baseline 2-kunci | 200 ✓ |
| a02 | +temperature 0.0 | 200 ✓ (payload god-tier semasa terima) |
| a03 | +temperature 0.5 | 200 ✓ |
| a04 | +top_p 0.9 | 200 ✓ |
| a05 | +reasoning_effort "low" | 200 ✓ |
| a06 | +reasoning_effort "max" | 200 ✓ |
| a07 | +max_tokens 500 | 200 ✓ |
| a08 | 4-kunci god-tier + stream | 200 ✓ |
| a09 | 3-kunci stream | 200 ✓ |
| a10 | stream + effort-low | 200 ✓ |

**KESIMPULAN A:** Gateway rootsys **LENIENT** — terima SEMUA parameter tanpa reject (berbeza dengan API rasmi yang menolak temperature≠1.0). Sama ada pass-through atau strip-senyap — perlu Fasa B.

### 4.2 Kitaran ulangan (3x config, prompt tiny)
god-tier: TTFT~3.82s, reasoning~21 tok, credit~0.14 | effort-low: ~3.94s, ~24, ~0.15 | plain-3key: ~3.83s, ~22, ~0.15
→ Pada prompt KECIL semua config statistik sama; tombol tak boleh disahkan. Perlu beban sebenar.

---

## 5. FASA B — PAYLOAD PREFLIGHT SEBENAR (SELESAI, 3 panggilan di VPS `root@subfaber`)

Payload dijana di VPS dengan kod produksi sebenar (`buildPreflightPrompt()` — 759 entri sintetik ~30k aksara dialog, target 'Malay', source 'detected'; prompt ~40.9KB / 7,965 prompt token). Varian:
- **B1-godtier**: `{model, messages, stream:true, temperature:0.0}` — IDENTIK muatan runtime Agent B semasa
- **B2-effortlow**: sama + `reasoning_effort:"low"`
- **B3-effortmax**: sama + `reasoning_effort:"max"` (kawalan positif = default rasmi)

### 5.1 KEPUTUSAN MENTAH
| Ujian | TTFT | TOTAL | reasoning_tokens | completion | prompt cache | credit |
|---|---|---|---|---|---|---|
| B1-godtier | 3.10s | 24.4s | **526** | 912 | miss 7965 (penuh) | **6.08** |
| B2-effortlow | 4.18s | 22.5s | **400** | 761 | **hit 7936 / miss 29** | **2.25** |
| B3-effortmax | 4.81s | 38.2s | **1,042** | 1,422 | **hit 7936 / miss 29** | **3.85** |

(content chars: B1=1406, B2=1310, B3=1372 — semua JSON Bible sah; prompt_tokens 7,965 ketiga-tiganya)

### 5.2 ANALISIS

**PENEMUAN #1 — Tombol `reasoning_effort` nampak HIDUP melalui rootsys:**
Ordering reasoning tokens: B2(400) < B1(526) < B3(1042) — monotonic ikut effort. TAPI ini single-sample pada temperature 1.0 (varian semula jadi tinggi). Dua hipotesis bersaing:
- **H1 (lulus):** reasoning_effort diteruskan ke upstream Moonshot; docs rasmi tentang cache-invalidation tak apply di gateway ini (B2/B3 dapat cache hit walaupun effort berbeza dari B1).
- **H2 (strip-senyap):** gateway buang reasoning_effort; beza 400/526/1042 hanyalah varian sampling; cache hit berlaku sebab request efektif identik.
**Penentu: Fasa C (ulangan interleaved 3x setiap config).**

**PENEMUAN #2 — PREFIX CACHE ROOTSYS BERFUNGSI (10:1):**
B1 (panggilan pertama) miss penuh; B2/B3 hit 7,936/7,965 token (99.6%). Model kos terbitan daripada medan credit (lihat 5.3) menunjukkan nisbah input miss:hit ≈ **10:1** — seiras struktur harga rasmi Moonshot ($3:$0.30). Penjimatan B2 (credit 2.25 vs B1 6.08) datang majoriti daripada cache, bukan semata effort.
**Implikasi produksi PENTING:** retry-same-model Fasa 0 kita (×5, payload identik byte-for-byte) automatik menikmati cache hit pada attempt ke-2+ — retry jauh lebih murah daripada attempt pertama. Ini mengukuhkan strategi retry-same-model sedia ada.

**PENEMUAN #3 — Model kos `credit` rootsys (fit Fasa A+B):**
`credit ≈ hit×0.000049 + miss×0.000485 + completion×0.00243` (unit credit rootsys)
Nisbah: output ≈ 5× input-miss ≈ 50× input-hit — seiras $15:$3:$0.30 rasmi Moonshot. Boleh guna untuk anggaran kos per Bible.

**PENEMUAN #4 — Kelajuan pada beban sintetik:**
TTFT 3-5s, TOTAL 22-38s — jauh lebih pantas dari forensik S01E31 (98-407s). Kaveat: dialog sintetik berulang (10 ayat × 759) jauh lebih senang dari drama sebenar; reasoning 400-1042 vs 9182 pada probe slim dulu (kandungan berbeza). **Jangan ekstrapolasi kelajuan ke beban drama sebenar.**

### 5.3 Kaveat metodologi
- Single-sample per config; temperature dalaman K3 = 1.0 (fixed) → varian besar.
- Semua 3 panggilan berturut dalam tetingkat masa singkat (cache hangat).
- B1 jalan sebelum B2/B3 → B1 satu-satunya yang tanggung cache-miss penuh — perbandingan credit B1 vs B2/B3 TIDAK adil tanpa kawalan cache.

---

## 5.5 FASA C — ROSAK (percubaan 1) + ULANG BERJAYA (percubaan 2, naming betul)

### Percubaan 2 (9 panggilan interleaved b1→b2→b3 × 3 round, cache naming betul `resp-C{R}-b{N}`)
| Round | b1 godtier | b2 effortlow | b3 effortmax |
|---|---|---|---|
| R1 | reasoning 410, credit 5.75 (cache COLD=0!) | 521, 2.50 | 418, 2.35 |
| R2 | 398, 2.29 | **1,155**, 4.17 | 920, 3.57 |
| R3 | 494, 2.31 | 665, 2.99 | 457, 2.44 |

Purata: b1 ≈ 434 · b3 ≈ 598 · **b2 ≈ 780 (TERTINGGI!)**. contentChars semua 1,284–1,473 (Bible sah semua config).

### ⚖️ KEPUTUSAN MUKTAMAD: **H2 DISAHKAN — gateway rootsys STRIP `reasoning_effort` senyap.**
Bukti:
1. **Tiada ordering monotonic.** H1 menuntut b2 terendah — sebaliknya b2 TERTINGGI dalam SEMUA 3 round (bertentangan terus dengan arah sepatutnya; kalau tuas hidup, "low" mustahil hasilkan reasoning purata LEBIH TINGGI dari default-max).
2. **Gabungan semua sampel sintetik:** b1 [398–526] n=4 purata 457 · b2 [400–1155] n=4 purata 685 · b3 [268–1042] n=7 purata 526 — pertindihan penuh antara kumpulan; variance DALAM config (3–4×) mengatasi beza ANTARA config.
3. Ordering monotonic Fasa B (400<526<1042) terbukti **kebetulan sampling** pada temperature 1.0.
4. Bonus: R1-b1 cacheHit=0 (cache sejuk antara sesi) → credit 5.75; selebihnya hit → pengesahan ketiga ekonomi cache 10:1.

### Implikasi terus kepada Fasa E (pembedahan prompt):
- **JANGAN tambah `reasoning_effort` pada payload** — no-op di rootsys (harmless tapi sia-sia, dan melanggar prinsip muatan-minimum 4-kunci).
- **DECISION DISCIPLINE peringkat prompt kegal SATU-SATUNYA tuas** kawal kedalaman penaakulan melalui rootsys → pembedahan (b) system message berasingan, (c) scope fence, (d) quote-then-claim semakin kritikal.
- Fasa D dipermudahkan: b2/b3 kini diketahui permintaan IDENTIK dengan b1 selepas strip — cukup d1 (payload produksi semasa) × 3 ulangan pada SRT sebenar sebagai BASELINE "sebelum pembedahan" untuk perbandingan Fasa E.

- **Punca rosak:** loop shell guna `SHORT=$(echo $CFG | cut -d- -f2)` — field ke-2 bagi SEMUA nama config (`b1-preflight-godtier` dll.) ialah "preflight" → ketiga-tiga config dalam round yang sama menulis ke fail SAMA `resp-C{ROUND}-preflight.txt` → b1 ditimpa b2, kemudian b2 ditimpa b3. Fail akhir setiap round = **b3-effortmax sahaja**. (Pembetulan Fasa D: guna `-f1` atau hardcode `d1/d2/d3` unik.)
- **Metadata timing konsol (satu-satunya jejak per-config):** R1: b1=25.8s / b2=23.1s / b3=34.2s · R2: b1=50.5s / b2=45.6s / b3=18.3s · R3: b1=22.6s / b2=28.8s / b3=31.7s — berserabut, TIDAK konklusif (b3 paling pantas pada R2!).
- **Usage fail yang tinggal (semuanya b3-effortmax):** reasoning **798 / 268 / 780** — variance b3 sahaja ~3× ganda. Ini menyokong berat H2 (varians temperature-1.0 liar) TAPI tidak memutuskan H1/H2. Semua cache hit 7,936 (konsisten dengan Penemuan #2).
- **Keputusan (DIKEMAS KINI arahan owner 2026-10-07):** Fasa C WAJIB DIULANG dengan naming betul — pembetulan: `SHORT=$(echo $CFG | cut -d- -f1)` beri `b1/b2/b3` unik; fail respons `resp-C{ROUND}-b{N}.txt`. Skop kesahan kekal: sintetik hanya jawab soalan MEKANISME (H1/H2 — adakah tombol hidup); kedalaman reasoning realistik + kualiti Bible tetap Fasa D (SRT sebenar).

## 5.6 MANDAT OWNER (asal daripada kolaborasi ChatGPT lama) — SAH

Payload SINTETIK berulang TIDAK mewakili beban sebenar: LLM kesan pattern berulang → tiada "beban kognitif sebenar" → hasil reasoning/latensi/kualiti Bible daripada payload sintetik TIDAK BOLEH dijadikan ukuran. Kedudukan rasmi selepas Fasa C:
- Ujian sintetik (Fasa A/B/C) hanya sah untuk: **penerimaan parameter**, **tingkah laku prefix-cache**, **model kos credit**.
- Kedalaman reasoning + kualiti Bible + latensi sebenar HANYA diukur pada **SRT sebenar** (Fasa D — fail drama sebenar yang owner muat turun sendiri, seperti sumber OpenSubtitles/SubDL/SubSource).

---

## 5.7 FASA D — SRT SEBENAR (SELESAI 2026-10-07, 3 panggilan di VPS)

**Korpus:** `real-srt.srt` (owner download sendiri) — K-drama "Happiness" (tvN 2021): watak Yoon Sae-bom, Jung Yi-hyun, Han Tae-seok; plot "Mad Human Disease" + dadah "Next" + kontrak kahwin + apartment Seyang Forest Le Ciel. 745 entri, 3,248 baris, 51KB. Prompt 31,653 aksara (~8k token), payload 33KB.
**Metodologi (mandat owner, selari kolaborasi ChatGPT lama):** token/masa SAHAJA tak cukup — mesti ukur KUALITI Bible 4-tiang + stabiliti antara run. Akaun: SCP bantuan AI (ssh alias `stremiosubmaker` → root@51.79.242.80, key id_ed25519 sedia di ~/.ssh) — owner telah dimaklumkan dan faham rantaian akses.

### 5.7.0 Konfigurasi payload D + bukti muktamad temperature NO-OP (jawapan soalan owner)

Ketiga-tiga run menggunakan fail `d1-real-godtier.json` yang SAMA byte-for-byte: `{model:"kimi-k3", messages:[...], stream:true, temperature:0.0}` — mematuhi 4-kunci god-tier: **temperature 0.0 ADA**, **stream:true WAJIB** (tanpa stream, Caddy hulu putus sambungan pada ~300s → 502; pembelajaran forensik lama kekal sah, dan TTFT rendah 3-8s dalam Fasa D mengesahkannya).

**BUKTI MUKTAMAD temperature 0.0 = NO-OP pada kimi-k3/rootsys:** 3 panggilan payload IDENTIK masih menghasilkan reasoning 4,442/4,315/4,785 (varians ±10%), terms 24/29/34 (Jaccard 0.51-0.62), canonical null-rate 40%/33%/22%. Jika temperature 0 benar-benar deterministik di sisi pelayan, output 3 run sepatutnya hampir identik — tetapi TIDAK. Ini selari dengan (a) docs rasmi Moonshot: temperature FIXED 1.0, "do not pass explicitly", nilai lain → error; (b) Fasa A: rootsys terima apa sahaja tanpa ralat (lenient/strip). **Kesimpulan: deterministik TIDAK wujud pada kimi-k3 melalui rootsys walau temp 0.0 dihantar** — varians kualiti Bible adalah sifat semula jadi model pada sampling dalaman temperature 1.0. Satu-satunya jalan mengurangkan varians = disiplin peringkat prompt (Fasa E), bukan parameter sampling. Nota sejarah: persepsi "temp 0 = deterministik" dari ujian ChatGPT lama kemungkinan datang dari model berlainan yang benar-benar menghormati temp 0 — kimi-k3 TIDAK.

### 5.7.1 Metrik prestasi (3 run payload god-tier semasa)
| Run | TTFT | TOTAL | reasoningTok | completionTok | cacheHit | credit |
|---|---|---|---|---|---|---|
| D1 | 3.20s | 133.6s | 4,442 | 5,782 | 0 (cold) | 17.94 |
| D2 | 4.30s | 130.6s | 4,315 | 5,680 | 7,936 | 14.22 |
| D3 | 8.45s | 152.8s | 4,785 | 6,275 | 7,936 | 15.66 |

→ Reasoning sebenar **~4,500 tok (10× sintetik!)**, TOTAL ~130-153s — lingkungan S01E31. Kos/Bible ~15.9 credit (~$0.04 nilai pasaran). TTFT rendah (3-8s) — stream:true menghidupkan sambungan seperti forensik lama.

### 5.7.2 Metrik KUALITI Bible (analisis .tmp-kimi-analyze-quality.js, report .tmp-kimi/quality-report.txt)
| Metrik | Run 1 | Run 2 | Run 3 | Tafsiran |
|---|---|---|---|---|
| theme len | 776 | 634 | 643 | Isi konsisten (disease+Next+kontrak kahwin+Le Ciel+Han Tae-seok) — kualiti tinggi ketiga-tiganya |
| terms | 24 | 29 | 34 | **Tidak stabil** — Jaccard R1∩R2=0.51, R1∩R3=0.57, R2∩R3=0.62 |
| characters | 10 | 9 | 9 | **Sangat stabil** — Jaccard 0.90 / 0.90 / 1.00 |
| canonical null | 4/10 (40%) | 3/9 (33%) | 2/9 (22%) | Disiplin bukti BERVARIANS antara run |
| credits_and_titles | 1 | 1 | 1 | Konsisten (disclaimer pembuka dikesan betul) |

### 5.7.3 Isu kualiti ditemui (sasaran Fasa E)
1. **PENCEMARAN terms:** gelaran watak ("ms. yoon sae-bom", "corporal jung yi-hyun", "lawyer kook hae-seong") tersekat masuk 'terms' — itu data characters, bukan istilah teknikal. Skema tak larang secara eksplisit.
2. **Ketidakstabilan terms** (Jaccard ~0.55) — model tak konsisten menentukan istilah mana layak dimasukkan.
3. **Null-rate canonical_address bervarians** (22-40%) — disiplin FACT-VS-INFERENCE tidak deterministik merentas run.
4. Theme + characters + credits = kuat; tiang lemah = **terms** (definisi kabur) + **canonical_address** (varians bukti).

### 5.7.4 KPI BASELINE untuk perbandingan Fasa E (sebelum → sasaran selepas)
| KPI | Baseline semasa | Sasaran Fasa E |
|---|---|---|
| terms Jaccard antar-run | 0.51–0.62 | ≥0.75 |
| characters Jaccard | 0.90–1.00 | kekal ≥0.90 |
| gelaran-waktu-dalam-terms | wujud (pollution) | sifar |
| canonical null-rate variance | 22–40% (spread 18pt) | spread ≤10pt |
| reasoning tokens | ~4,500 | turun (tanpa korban kualiti) |
| credit/Bible | 14.2–17.9 | turun |

---

## 5.9 GROUND TRUTH #3 — STANDARD INDUSTRI "PREFLIGHT" (kajian 2026-10-07)

Soalan owner: "Ada tak guideline preflight standard industri? Benchmark?" — JAWAPAN: YA, tiga aras:

### 5.9.1 ISO 17100:2015 (standard antarabangsa perkhidmatan terjemahan)
Wajib ada "pre-production processes": takrif spesifikasi projek + **analisis kandungan sumber SEBELUM terjemahan** — iaitu preflight kita ialah pematuhan literal ISO 17100. Generik (bukan khusus subtitle).

### 5.9.2 Netflix KNP (Key Names and Phrases) — "preflight" DE-FAKTO industri subtitle
Sumber: partnerhelp.netflixstudios Terminology Tool + TTSG General Requirements §6 ("KNP/formality tables must be created and used... across episodes and seasons").
- **Pangkalan data istilah terpusat per show** (semua musim satu KNP); dicipta oleh "Template/Dialog List creators" SEBELUM penterjemah mula.
- **JENIS TERM RASMI (dropdown tool Netflix):** `Character` | `Location` | `Organization` | `Phrase` | `Main Title` | `Episode Title` — **kategori berasingan!**
- **"Rule of the First":** terjemahan pertama mengunci istilah; penterjemah kemudian WAJIB ikut.
- Episode/Main titles auto-populate + LOCK (kredit = data rasmi, bukan tekaan).
- "Sensitive Terminology Management" — istilah sensitif diurus berasingan.
- Form
ality tables (daftar formal/informal per watak).

### 5.9.3 ATA AVD "What Makes a Great KNP?" (Mara Campbell, veteran 20 thn Netflix/Prime/Disney+)
- **Kategori**: Person / Location / Organization / Term-or-Phrase — selari Netflix.
- **NTBT (Not To Be Translated):** masukkan istilah source + salin ke target = isyarat "kekal asal" (contoh: muggle).
- **Peraturan emas:** "If you researched it, include it" — tapi JANGAN masukkan istilah kamus standard.
- **Characters:** nama penuh + SETIAP nickname/alias sebagai entri berasingan yang saling-linked; nota watak deskriptif ("Goobler—Alien pretending to be female human teenager...").
- **Gender watak wajib dinyatakan** (bahasa genitif/ artikel gendered).
- **Treatments list (lembaran berasingan):** cara watak MEMANGGIL satu sama (formal/informal), perubahan daftar dicatat + **nombor subtitle/timecode perubahan**.
- Notes: rujukan sumber, style (italik/huruf besar), usage (perkataan biasa guna luar biasa).

### 5.9.4 CAT tools industri (memoQ/Trados/Phrase)
Aliran kerja standard: **term extraction → termbase → QA term-match semasa terjemahan**. Trados kini ada "AI Terminology Extraction" (LLM ekstrak istilah) — amalan LLM-preflight kita SELARI dengan arah industri 2026.

### 5.9.5 Pemetaan kepada Bible 4-tiang SubFaber + implikasi Fasa E
| Industri | Bible kita | Status |
|---|---|---|
| KNP Character (kategori berasingan) | characters + canonical_address | ✅ selari |
| KNP Location/Organization/Phrase | terms | ⚠️ **kita CAMPUR semua dalam satu array 'terms' tanpa pemisahan jenis — punca pollution (gelaran watak tersekat masuk terms)** |
| Treatments list (siapa panggil siapa, formal/informal) | pernah ada pronoun_register → DIGUGURKAN 2026-09-29 (pencetus deliberation) | ⚠️ industri sah konsepnya; bentuk lama kita terbukti beracun untuk kimi-k3 |
| Episode/Main Title auto-populate | credits_and_titles | ✅ selari |
| Form
ality tables | (tiada — diputuskan Agent A per-chunk) | ok |
| NTBT | terms.target = original (implicit) | ✅ selari |
| "If you researched it, include it" | UNBOUNDED-CONTEXT mandate | ✅ selari |

**INSIGHT UTAMA untuk Fasa E:** Standard industri menyelesaikan masalah terms-pollution kita melalui **PENGKATEGORIAN** — Netflix tak pernah letak Character dan Organization dalam senarai sama. Pembedahan prompt patut tambah medan `type` pada setiap term (location/organization/object/phrase/technical) + larangan eksplisit "character names & titles belong ONLY in characters" — bukan mengecil skop, tapi menstruktur semula ikut KNP. (Definisi kategori term dalam prompt = permintaan POST-parse, bukan tambahan reasoning — patut selari DECISION DISCIPLINE.)

---

## 5.10 AUDIT KNP WORKING TREE (deep scan 2026-10-07, arahan owner pasca Ground Truth #3)

Rantaian diimbas: subfaberPreflight.js (prompt + parser), languagePacks (malay/generic), translationEngine.js (`_formatPreflightForChunk` + system prompt Agent A + sliding context), agentBInspector.js (`INSPECTOR_INSTRUCTION` + `formatPreflightContextForInspection` + taksonomi jenayah).

### 5.10.1 SUDAH SELARI dengan mazhab KNP
- Pemisahan 4-tiang terms/characters/credits ≈ kategori KNP (80% struktur ada).
- credits_and_titles = KNP Main Title / Episode Title.
- "one canonical title per character, never alternate" = Rule of the First.
- NTBT implicit (target "or original").
- Technical Glossary dynamic term-matching per-chunk = aliran kerja QA term-match CAT tools.
- Inspection context-aware (Locked Terms + Character Address Reference disuntik) = audit konsistensi KNP.
- UNTRANSLATED exception (proper nouns/brands/titles dikekalkan) = amalan KNP.

### 5.10.2 🔴 PUNCA AKAR #1 (KRITIKAL) — honorificMatrix mengarahkan gelaran watak MASUK terms
- malay.js:29 — "In the 'terms' list, you MUST include and lock the official ${tgt} titles/honorifics for recurring entities" + pemetaan Ms./Mr./Director/Auntie.
- Kesan terukur Fasa D: pollution "ms. yoon sae-bom", "corporal jung yi-hyun", "lawyer kook hae-seong" dalam terms.
- Honorifik DIMINTA DUA KALI merentasi tiang: sekali dalam terms ([honorificMatrix], malay.js:29-34), sekali dalam characters ([canonicalAddressMatrix], malay.js:40-41 merujuk "the SAME mandatory Malay honorific matrix from the 'terms' pillar").
- Rantai sebab-akibat terbukti: arahan bercanggah → model waver merentasi tiang → terms Jaccard 0.51-0.62 (tak stabil) vs characters 0.90-1.00 (stabil — tiang khusus + arahan ketat). Pollution BUKAN kecuaian model — KITA YANG ARRAHKAN.
- generic.js:26 mempunyai kecacatan sama (lebih lembut).

### 5.10.3 🔴 GAP #2 — tiada medan `type` pada terms
- Prompt Task 2 (subfaberPreflight.js:162): "Extract technical terms, location names, and industry entities" — 3+ kategori dicampur dalam SATU array rata.
- Parser (subfaberPreflight.js:337-350) hanya menyimpan {source, target, note}.

### 5.10.4 🟡 KONTRADIKSI #3 — mandat MANDATORY vs null-discipline pada medan sama
- honorificMatrix: "you MUST include and lock" (mandat keras).
- DECISION DISCIPLINE + FACT VS INFERENCE: "null when in doubt" (mandat null).
- Dua arahan bertentangan → model selesai secara rawak per run → canonical null-rate variance 22%/33%/40% (spread 18pt).

### 5.10.5 🟡 GAP #4 — Agent B tiada jenayah TERM-CONSISTENCY
- Locked Terms disuntik ke inspector (agentBInspector.js:215 "use for consistency judgement") TAPI taksonomi 6 jenayah (agentBInspector.js:141) tiada cara melaporkan pelanggaran istilah terkunci — REGISTER hanya cover gelaran/kata ganti WATAK. Pelanggaran locked term terlepas audit sepenuhnya.

### 5.10.6 🟢 PENYIMPANGAN SEDAR #5 — HIERARCHY OF TRUTH (translationEngine.js:1316)
- Netflix KNP: term LOCKED mengatasi keutamaan penterjemah (KNP di-vet manusia sebelum edaran).
- Kita: dialog sumber MENGATASI Bible ("ALWAYS FOLLOW THE SOURCE DIALOGUE") — songsang doktrin KNP.
- Justifikasi sah: Bible kita LLM-generated dengan instabiliti terukur (Fasa D) — HIERARCHY OF TRUTH ialah jaring keselamatan anti-racun (Upstream Error Propagation). BARE-NAME FIX (jangan inject gelaran pada nama kosong) juga amalan subtitling baik (reading speed).
- Nota ketegangan: Bible jadi advisory, bukan kontrak — melemahkan intipati KNP. Keseimbangan muktamad = keputusan owner dalam Fasa E.

### 5.10.7 Ringkasan input pembedahan Fasa E
1. Baiki honorificMatrix: alihkan arahan gelaran watak KELUAR dari terms → characters sahaja + larangan eksplisit silang-tiang.
2. Tambah medan `type` pada terms (location/organization/object/technical/phrase) — post-parse labeling, selari DECISION DISCIPLINE.
3. Selesaikan kontradiksi MANDATORY vs null (satu suara sahaja pada medan sama).
4. (Pilihan owner) jenayah TERM ke-7 Agent B untuk penguatkuasaan KNP penuh.

---

## 6. FASA E — PELAKSANAAN (diluluskan owner 2026-10-07 "mandat penuh", v3.8.40)

**Kelulusan owner (petikan):** "Aku bagi mandat penuh untuk kau repair dan sapu bersih semua masalah, semua songsang yang berlawanan dengan mazhab rasmi KNP."

Semua 4 pembedahan §5.10.7 dilaksanakan dalam v3.8.40:
1. **Bedah #1 — punca akar pollution:** honorificMatrix (malay.js + generic.js) berpindah terms → characters; klausa "recorded EXCLUSIVELY as character addresses — never as terms entries". Arahan lama verbatim DIGUGURKAN.
2. **Bedah #2 — kategori KNP:** medan `type` (location/organization/object/technical/phrase) pada setiap term — prompt task + skema JSON + parser (clamp enum) + kedua-dua formatter render `[type]` tag.
3. **Bedah #3 — kontradiksi mandat:** canonicalAddressMatrix tidak lagi merujuk balik "from the 'terms' pillar" — matriks berdiri sendiri pada characters; satu suara.
4. **Bedah #4 — penguatkuasaan:** jenayah TERM ke-7 (taksonomi + kontrak inspector + telemetry + header Locked Terms memerintah render eksak).

Pengesahan: 4 suit terkesan MERAH dulu (154/155 — anchor lama 6-jenayah/2-kunci pecah seperti dijangka) → dibaiki → HIJAU 155/155. Full suite: **298 tests, 297 PASS / 0 FAIL / 1 SKIP** (+3 ujian KNP baharu; baseline 294 → 297).

Nota prestasi: pembedahan ini menukar KONTRAK, bukan parameter (H2 — rootsys strip reasoning_effort; temp no-op). Menurut bukti Fasa D, tiang dengan kontrak per-medan ketat (characters) kekal stabil (Jaccard 0.90-1.00) walaupun kimi-k3 berjalan pada temp 1.0 tetap — strategi "kawal kontrak, bukan model" direplikasi ke terms. Validasi empirikal KUALITI Bible pasca-bedah (Fasa F dicadangkan): ulang Fasa D 3-run pada SRT sebenar, sasaran KPI §5.7 — terms Jaccard ≥0.75 (baseline 0.51-0.62), pollution sifar, null-rate spread ≤10pt.

**Baki cadangan (belum dilaksanakan — menunggu arahan owner):**
- (b) System message berasingan + `<text>` di KEPALA messages + arahan di EKOR (panduan penempatan rasmi Moonshot)
- (c) Scope fence eksplisit (anti excessive-proactiveness — ubat rasmi Moonshot)
- (d) Quote-then-claim grounding untuk terms/characters (cookbook rasmi: potong output ~⅓ + anti-halusinasi)

---

## 6.1 FASA F — VALIDASI EMPIRIKAL PASCA-KNP (2026-10-07, dilaksanakan)

Metodologi: sama dengan Fasa D (SRT sebenar sama, 3 run, payload god-tier, kunci daripada .env VPS). CI v3.8.40 hijau disahkan dahulu (GitHub Actions run #211: completed/success). Skrip: `.tmp-kimi-gen-f.js` (payload 32,269 chars prompt KNP), `.tmp-kimi-f-run.sh`, `.tmp-kimi-analyze-f.js` — semua di VPS, TIDAK di-commit.

### 6.1.1 Data mentah
| Metrik | F1 | F2 | F3 | D-baseline (avg) |
|---|---|---|---|---|
| HTTP / TOTAL | 200 / 68.9s | 200 / 166.8s | 200 / 103.6s | 200 / ~139s |
| reasoning | 2303 | 7015 | 3943 | 4514 |
| credit | 12.31 | 20.22 | 12.93 | 15.9 |
| terms | 16 | 15 | 18 | 29 (24/29/34) |
| characters | 10 | 10 | 9 | 9-10 |
| **POLLUTION** | **0 ✓** | **0 ✓** | **0 ✓** | 3+ (gelaran watak dalam terms) |
| type valid | 16/16 | 15/15 | 18/18 | — (medan tiada) |
| null canonical | 6/10 (60%) | 4/10 (40%) | 5/9 (56%) | 22-40% |
| credits | 1 | 1 | 1 | 1 |

### 6.1.2 KPI vs sasaran §5.7
1. **Pollution sifar — SASARAN DICAPAI sepenuhnya.** Bedah #1 membunuh punca akar: SEMUA gelaran watak kini hanya dalam characters. terms sample F tulen: seyang, le ciel, cdschq, sou, next, mad human disease, myungwon rice cake shop — 100% kosakata dunia cerita.
2. **type 100% compliance — SASARAN DICAPAI.** Setiap term dikategorikan (taburan sihat: location/organization/object/technical/phrase).
3. **Terms Jaccard 0.38-0.55 — TIDAK capai ≥0.75.** TAPI interpretasi berubah: senarai kini lebih ketat (16 vs 29 avg — pollution dibuang) dan TERAS berulang (seyang/le ciel/cdschq/sou/next/mad human disease/competitiveness reinforcement team) hadir dalam SEMUA run — varians datang daripada istilah periferi sekali-muncul (kedai/lokasi one-off), bukan kesilapan. Kesan produksi rendah: Agent A hanya menerima term yang MATCH chunk semasa (dynamic matching) — istilah periferi jarang padan.
4. **Null-rate spread 20pt (40/56/60%) — TIDAK capai ≤10pt.** Null-rate LEBIH TINGGI daripada D (22-40%) = model lebih konservatif mengunci canonical_address (kontradiksi MUST-include dibuang → disiplin null menang). Ini SELAMAT: HIERARCHY OF TRUTH + NOT-LOCKED guidance membolehkan Agent A infer per-chunk.
5. **Characters Jaccard 0.90-1.00 — kekal muktamad stabil.**
6. **Theme — kualiti tinggi konsisten** (fakta sama merentas run: kontrak kahwin, Le Ciel, Mad Human Disease, Next, Han Tae-seok).
7. **Masa avg 113s vs 139s D — ~19% lebih laju** (variance kimi kekal: 68.9-166.8s).

### 6.1.3 Kesimpulan Fasa F
Pembedahan KNP berjaya pada objektif utamanya: **Bible kini tulen ikut doktrin** (tiada pencemaran silang-tiang, kategori lengkap, watak stabil). Dua KPI stabiliti (terms Jaccard, null spread) tidak capai sasaran ketat — had fizikal kimi-k3 @ temp 1.0 tetap (parameter di-strip rootsys — H2): keputusan borderline (istilah periferi mana nak dimasukkan; bila bukti "cukup jelas") kekal sampling. Ubat lanjut (jika owner mahu): cadangan Moonshot (b)(c)(d) — system message berasingan + scope fence + quote-then-claim — yang belum dilaksanakan.

---

## 6.2 FASA G — EKSPERIMEN MOONSHOT (2026-10-07, diluluskan owner: "Teruskan berkesksperimen, yang penting kau deliver result yang akan buat aku tersenyum")

Metodologi: 3 varian payload dijana daripada prompt produksi v3.8.40 SAMA (split statik/dinamik automatik pada penanda `## INPUT` / `</text>` — tiada duplikasi manual, tiada drift), SRT sebenar sama (745 baris), 3 run setiap varian = 9 panggilan (semua HTTP 200; G3-R3 terpotong pada siling curl 290s). Baseline perbandingan = Fasa F (single user message). Skrip probe di VPS (tidak di-commit): `.tmp-kimi-gen-g.js`, `.tmp-kimi-g-run.sh`, `.tmp-kimi-analyze-g.js`.

- **G1** = teknik (b): arahan statik (Role→FINAL CHECK, 7,120 chars) di saluran `system`; input dinamik `<text>` (25,399 chars) di saluran `user`.
- **G2** = G1 + teknik (c): blok SCOPE FENCE (IN/OUT-OF-SCOPE + PRECISION OVER RECALL + larangan padding).
- **G3** = G2 + teknik (d): QUOTE-THEN-CLAIM — setiap entri terms/characters WAJIB medan `evidence` (petikan VERBATIM 5-15 patah perkataan); NO QUOTE = NO ENTRY.

### 6.2.1 Jadual KPI (F = baseline Fasa F)

| KPI (sasaran) | F | G1 system | G2 +fence | G3 +QTC |
|---|---|---|---|---|
| terms Jaccard avg (≥0.75) | 0.47 | **0.72** | 0.72 | 0.69 (2 run sahaja) |
| null spread (≤10pt) | 20pt | **7pt ✓** | 16pt | **0pt ✓** (2 run) |
| POLLUTION (0) | 0 ✓ | 0 ✓ | 0 ✓ | 0 ✓ |
| type compliance (100%) | 100% ✓ | 100% ✓ | 100% ✓ | 100% ✓ |
| chars Jaccard min (≥0.90) | 0.90 ✓ | **0.90 ✓** | **0.67 ✗✗** | 1.00 ✓ (2 run) |
| evidence verbatim (≥95%) | n/a | n/a | n/a | **97% ✓** (33/34) |
| masa avg | 113.1s | 162.0s | 239.1s | 241.6s (R3 timeout) |
| credit avg | 15.2 | 19.2 | 27.7 | 29.0 |
| reasoning avg | 4,420 | 6,177 | 9,766 | 9,834 |

### 6.2.2 Temuan per teknik

1. **G1 (system message berasingan) — PEMENANG JELAS.**
   - terms Jaccard 0.47 → 0.72 (+53% relatif) — hampir sasaran 0.75; senarai lebih ketat (11-13 vs 15-18) dengan TERAS stabil.
   - **null spread 20pt → 7pt — sasaran ≤10pt DICAPAI buat kali pertama** (33/33/40%). Kontradiksi mandat pada keputusan canonical_address selesai: arahan di saluran system diberi bobot lebih tinggi, keputusan konsisten merentasi run.
   - Semua KPI lain KEKAL HIJAU: pollution 0, type 100%, chars 0.90, theme berkualiti.
   - Kos: +43% masa (113→162s), +27% credit (15.2→19.2), reasoning +40%. MASIH jauh bawah siling 290s — selamat produksi.
   - Bonus: prompt cache berfungsi merentas panggilan (cacheHit 8,192 tokens pada R2/R3 — saluran system 7,120 chars di-cache; panggilan preflight berikutnya lebih murah).
2. **G2 (scope fence) — BAHAYA, JANGAN GUNA pada preflight.**
   - chars Jaccard RUNTUH 0.90 → 0.67: "PRECISION OVER RECALL" membuat kimi memotong watak sebenar (7-8 vs 9-10 baseline) — terlalu konservatif. Pelanggan akan hilang watak sekunder daripada Bible.
   - null-rate turun (13-29%) bukan kerana lebih yakin — tapi kerana senarai pendek. reasoning +58% vs G1 tanpa ganjaran.
   - Kesimpulan: scope fence direka Moonshot untuk tugasan GENERATIF (anti proactiveness penulisan) — BUKAN untuk tugasan EKSTRAKSI yang kita perlukan recall.
3. **G3 (quote-then-claim) — disiplin sempurna, tidak praktikal.**
   - Evidence 97% verbatim (1/33 hampir — "-are you leaving the public official dorm?" punca: sempang pembuka yang dinormalisasi tak padan); chars J=1.00; null spread 0pt — teknik ini benar-benar menjadikan keputusan borderline binari seperti diramal.
   - TAPI: reasoning ~2x lipat F (9.8k vs 4.4k), masa 242s avg, dan **G3-R3 TIMEOUT pada 290s** (stream terpotong tengah JSON — parse gagal). Untuk SRT 745 baris ini sempit; SRT lebih besar pasti melebihi siling Caddy 300s.
   - Kesimpulan: kos/risiko terlalu tinggi untuk Bible; sesuai (jika mahu) untuk tugasan kecil kritikal sahaja.

### 6.2.3 Keputusan & cadangan integrasi (Fasa H — menunggu kelulusan owner)

**Integrasi produksi dicadangkan: G1 SAHAJA.**
1. Pecahkan `buildPreflightPrompt()` kepada dua: arahan statik (system) + pembalut input dinamik (user) — struktur data dikembalikan { systemPrompt, userPrompt }.
2. Lulusan `runPreflightSemanticPass` menghantar `messages: [{role:'system'...}, {role:'user'...}]` melalui buildChatRequest.
3. Fence (G2) & QTC (G3) TIDAK diintegrasikan — G2 merosakkan pillar characters; G3 terlalu mahal + risiko timeout.
4. Kos G1 diterima: +43% masa preflight (satu kali setiap fail) untuk stabiliti Bible yang jauh lebih baik + cache prefix pada panggilan berikut.

---

## 7. ARAHAN TETAP UNTUK SESI SAMBUNGAN (jika context reset)

1. Kita dalam **mode eksperimen** — Fasa E (v3.8.40) & Fasa G (eksperimen Moonshot) selesai. Dilarang ubah kod produksi sehingga owner luluskan **Fasa H** (integrasi G1 system-split ke buildPreflightPrompt/buildChatRequest) secara eksplisit.
2. Semua ujian curl dijalankan **di VPS `root@subfaber:~/StremioSubFaber`** (bukan PC tempatan) — folder kerja `.tmp-kimi/` di VPS. PC tempatan juga ada `.tmp-kimi/` (Fasa A sahaja).
3. Key API rootsys & buyerToken dipegang owner (dalam sejarah sembang); jangan simpan dalam fail yang di-commit.
4. Payload Fasa B di VPS dijana semula dengan blok `gen-phaseB.js` (heredoc) — guna kod produksi `buildPreflightPrompt()` sebenar.
5. Analisis respons SSE: parse baris `data: `, kumpul `delta.reasoning_content` (chars) + `delta.content` (chars) + `usage` terakhir (reasoning_tokens, prompt_cache_hit/miss, credit).
6. Command curl sentiasa `--max-time 290` (siling Caddy hulu 300s) + jeda ≥2s antara panggilan (rate limit 30 req/min).
7. Pasca-eksperimen: fail `.tmp-*` dan `.tmp-kimi/` tidak di-commit; bersih sebelum release.
