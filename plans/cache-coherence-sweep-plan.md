# PLAN PEMBEDAHAN V3 — Cache Coherence Sweep (Telegram ↔ Storage ↔ Stremio)

**Tarikh:** 2026-11-24 · **Status:** DRAF V3 — titik tengah antara Draf V2 (aku) dan 4 pembetulan AI Owner · **Kelas:** Class 1 Release (bugfix) · **Skop Owner:** Peringkat 1-4 (K1 ditangguh; `translationEngine.js` tidak disentuh)

> Setiap dakwaan di bawah disahkan terhadap kod sebenar dalam sesi ini. Kolum **Veredik** ialah keputusan selepas semakan; **Bukti** ialah baris kod yang dibaca. Tiada dakwaan diterima tanpa bukti.

---

## 0. Prinsip Tidak Boleh Dinafikan

| # | Prinsip | Sumber |
|---|---|---|
| P1 | Format kunci cache **tidak berubah**: `t2s__{baseKey}`, `{baseKey}__u_{hash}`, struktur `cacheKeys.js:224` | Kedua-dua pihak setuju |
| P2 | **Satu fungsi purge pusat**; semua laluan (Telegram, 3-klik, cap) panggil ia | Kedua-dua pihak setuju |
| P3 | **Sifar kitaran import** — helper kunci duduk di modul daun (`cacheKeys.js`); `telegramBot ↔ subtitles` hanya lazy-require **dalam fungsi** | Kedua-dua pihak setuju (AI #4 minta nota seni bina + ujian dua hala) |
| P4 | **Cap 200 registry = had menu sahaja**, bukan eviction Redis | Kedua-dua pihak setuju |
| P5 | **`adapter.delete()` pulang kebenaran** di Redis (bukan `true` keras) | Kedua-dua pihak setuju |
| P6 | **Padam ikut jenis entri**: bypass → bypass sahaja; kekal → kekal sahaja | Kedua-dua pihak setuju |
| P7 | **Zombie gate** = monotonic counter pada `runtimeKey` | Titik tengah (lihat §1.2) |
| P8 | **Migrasi entri lama** wajib ada PIN khusus | Titik tengah (lihat §1.1) |

---

## 1. Verifikasi 4 Pembetulan AI Owner Terhadap Kod Sebenar

### 1.1 Entri bypass lama — **✔ AI BETUL, V2 aku ada lubang**

**Dakwaan AI:** entri lama tiada `entry.userHash` → `if (entry.bypass && entry.userHash)` jatuh ke no-op senyap; `entry.keys[0]` untuk bypass lama **sudah** bawa `__u_{hash}` → double-append akan jadi `__u_x__u_x`.

**Bukti:**
- [`telegramBot.js:477`](src/services/telegramBot.js:477): `keys: Array.isArray(keys) ? keys : [keys]` — registry lama hanya array `keys`.
- [`subtitles.js:7019`](src/handlers/subtitles.js:7019): `keys: [runtimeKey, sourceFileId]`.
- [`cacheKeys.js:268`](src/utils/cacheKeys.js:268): `runtimeKey = bypass && bypassEnabled ? cacheKey : baseKey` — untuk bypass, `runtimeKey === cacheKey === baseKey__u_{hash}`.
- [`subtitles.js:7114`](src/handlers/subtitles.js:7114): bypass disimpan di `saveToBypassStorage(cacheKey)` → Redis `bypass:{baseKey}__u_{hash}`.

**Kesimpulan:** Untuk entri bypass lama, `keys[0]` ialah **kunci bypass penuh**. Membina `${cleanBaseKey}__u_${userHash}` daripadanya memerlukan parse, dan sebarang kesilapan parse menghasilkan `__u_x__u_x`. AI **betul**.

**Keputusan V3 — helper deterministik `normalizeRegistryEntry(raw)`** di `cacheKeys.js` (modul daun):

```
raw.keys?.[0]  →  rawKey
__u_ wujud?    →  bypass=true, baseKey = rawKey sebelum __u_, userHash = selepas
tiada __u_     →  bypass=false, baseKey = rawKey, userHash = raw.userHash ?? ''
(raw.baseKey / raw.bypass / raw.userHash menang jika ada — entri baharu)
```

Purge bypass **guna `rawKey` terus** (tidak pernah membina semula `__u_`). **PIN migrasi:** `{ keys: ['X__u_abc'] }` tanpa `bypass`/`userHash` → `bypass=true`, `baseKey='X'`, `userHash='abc'`, padam `bypass:X__u_abc` + `partial:X__u_abc`, **tidak sentuh** `translation:t2s__X`.

### 1.2 Zombie gate — **✔ AI BETUL pada 3 sub-titik**

| Sub-titik | Dakwaan AI | Bukti kod | Keputusan V3 |
|---|---|---|---|
| Kaunter | Guna monotonic `(get ?? 0) + 1`, bukan `Date.now()` | Tiada kod sedia ada; prinsip ketepatan | ✔ Monotonic |
| Kunci | Guna `runtimeKey`, bukan `baseKey` | [`subtitles.js:4912-4913`](src/handlers/subtitles.js:4912): `sharedLockKey = sharedInFlightKey \|\| runtimeKey`; untuk bypass `runtimeKey = baseKey__u_hash` | ✔ `runtimeKey` — padam bypass tidak bunuh in-flight kekal untuk `baseKey` sama |
| Lock bypass | Semak sama ada bypass guna `clearSharedTranslationInFlight(runtimeKey)` | [`subtitles.js:5535`](src/handlers/subtitles.js:5535) `markSharedTranslationInFlight(sharedLockKey)` — **untuk bypass, `sharedLockKey === runtimeKey`** → ya, bypass **turut** guna lock | ✔ Purge pusat panggil `clearSharedTranslationInFlight(runtimeKey)` **untuk kedua-dua jenis** |

**Titik tengah:** V2 aku kata "kekal sahaja yang clear lock". AI betul — bypass juga ada lock (di `runtimeKey`). V3: clear lock pada `runtimeKey` untuk semua entri.

### 1.3 xEmbed `videoHash` hilang — **✔ AI BETUL**

**Bukti:** [`embeddedCache.js:118-125`](src/utils/embeddedCache.js:118) kunci = `{videoHash}_{type}_{lang}_{track}[_{target}]`; [`removeFromIndex(adapter, videoHash, type, cacheKey)`](src/utils/embeddedCache.js:110) perlukan `videoHash` **berasingan**; [`index.js:9132`](index.js:9132) `saveResult = { cacheKey, entry }` — `entry.videoHash` **ada** dalam hasil.

**Keputusan V3:** Registry simpan `embeddedKeys: [{ videoHash, cacheKey }]` (ambil `saveResult.entry.videoHash`). `deleteTranslatedEmbedded(videoHash, cacheKey)` kekal 2-arg. **Tiada parse dari kunci** (kunci disanitasi `normalizeString` — hash boleh berubah bentuk; parse tidak selamat).

### 1.4 Grep semua `.delete(` sebelum ubah Redis — **✔ AI BETUL, dan hasilnya penting**

**Aku grep 48 panggilan `.delete(` merentas produksi + ujian. Klasifikasi:**

| Kategori | Lokasi | Kegelapan `false` hari ini | Kesan selepas fix |
|---|---|---|---|
| **Abai nilai pulangan** (`await adapter.delete()` tanpa semak) | [`index.js:8847`](index.js:8847), [`subtitles.js:5103/5145/7220/7227/7313/7320/7458/7464/7484/7488/7515`](src/handlers/subtitles.js:5103), [`telegramBot.js:929-939/973-978`](src/services/telegramBot.js:929), [`embeddedCache.js:91/373/430`](src/utils/embeddedCache.js:91), [`promptSandboxLiveStore.js:317`](src/services/promptSandboxLiveStore.js:317), [`sharedCache.js:92`](src/utils/sharedCache.js:92), [`smdbCache.js:265`](src/utils/smdbCache.js:265), [`startupValidation.js:177`](src/utils/startupValidation.js:177), [`syncCache.js:128/426`](src/utils/syncCache.js:128), [`autoSubCache.js:274`](src/utils/autoSubCache.js:274), [`providerMetadataCache.js:170`](src/utils/providerMetadataCache.js:170), [`sessionManager.js:1934/2061/2410/2461/2473/2482/2675`](src/utils/sessionManager.js:1934) | Tiada | **Tiada perubahan** — `false` diabaikan sama seperti `true` diabaikan |
| **Semak `if (deleted)`** | [`autoSubCache.js:233`](src/utils/autoSubCache.js:233), [`syncCache.js:358`](src/utils/syncCache.js:358) | Redis selalu `true` → sentiasa masuk blok (removeFromIndex + log) | Redis kini `false` bila kunci tiada → **melangkau** removeFromIndex/log. **Ini lebih tepat** (index sudah bersih). Filesystem **sudah** berkelakuan begini. |
| **`=== true` sebagai "wujud"** | [`sessionManager.js:1862`](src/utils/sessionManager.js:1862) `deleteSessionEverywhere` | Redis selalu `true` → `deletedCanonical=true` walaupun sesi tiada di Redis tapi ada di cache memori | Selepas fix: `deletedCanonical=false` bila tiada di Redis → [`:1901`](src/utils/sessionManager.js:1901) `if (storedSession !== null && !deletedCanonical) throw` — `storedSession` diambil [`:1851`](src/utils/sessionManager.js:1851) **sebelum** delete, jadi jika sesi **memang wujud**, delete → `true`. Jika **tidak wujud**, `storedSession===null` → tiada throw; `existed` [`:1889`](src/utils/sessionManager.js:1889) masih `true` jika ada di memori. **Kelakuan betul, tiada regresi.** |
| **`filter(r => r === true).length`** | [`sessionManager.js:1818`](src/utils/sessionManager.js:1818) `_purgeHistoryNamespace` | Redis selalu `true` → `deletedCount` terlalu besar | Selepas fix: kiraan **tepat**. Log sahaja; tiada logik bergantung padanya. |
| **Ujian `=== true` selepas `set`** | [`redis-command-timeout:451`](src/storage/redis-command-timeout-regression.test.js:451) | `true` | `contentDeleted=1` → `true`. **Kekal hijau.** |

**Kesimpulan:** Tiada pemanggil yang melayan `false` sebagai kegagalan sistem atau trigger retry. Perubahan `:1198` **selamat** dan menjadikan Redis seragam dengan Filesystem. Satu ujian tambahan untuk `deleteSessionEverywhere` pada sesi tiada-wujud (pin `existed`-logic).

**P3 nota seni bina:** `telegramBot.js` dan `subtitles.js` saling lazy-require **dalam fungsi** (bukan top-level). Ujian dua hala A→B dan B→A dalam Peringkat 2.

---

## 2. Senarai Cacat (tak berubah dari V2 — disahkan)

W1 (padam kekal tak kena) · W2 (`sourceFileId` komponen) · W7 (import mati) · W9 (`return true` keras) · W10 (dedup tajuk) · W3 (status/lock/zombie) · W4 (xEmbed derived) · W5 (rev per-user) · K3 (tiada metadata). **Ditangguh:** K1, K6.

---

## 3. Urutan Pembedahan (4 peringkat — RED → GREEN → PIN)

### Peringkat 1 — Asas kunci + Tutup W7

**Fail:** [`cacheKeys.js`](src/utils/cacheKeys.js:1) · [`subtitles.js`](src/handlers/subtitles.js:1) · [`index.js`](index.js:1)

1. Pindah `TRANSLATION_STORAGE_PREFIX`, `getTranslationStorageKey()`, `isValidTranslationKey()` ke `cacheKeys.js`; `subtitles.js:380-397` jadi re-export.
2. Buang [`index.js:8992-8997`](index.js:8992) (`registerDeletionTarget` + `deleteToken`).
3. **RED:** import-surface test (`registerDeletionTarget` tidak wujud). **PIN:** byte-identiti 3 fungsi kunci.

### Peringkat 2 — Purge pusat + Zombie gate + Redis truth

**Fail:** [`cacheKeys.js`](src/utils/cacheKeys.js:1) · [`subtitles.js`](src/handlers/subtitles.js:1) · [`RedisStorageAdapter.js`](src/storage/RedisStorageAdapter.js:1) · [`telegramBot.js`](src/services/telegramBot.js:1)

1. **Redis `:1198`:** `return Number(Array.isArray(result) ? result[0] : result) > 0;`
2. **`normalizeRegistryEntry(raw)`** di `cacheKeys.js` (§1.1).
3. **`translationGeneration`** LRU modul (max 500) di `subtitles.js`, dikunci **`runtimeKey`**, monotonic `(get ?? 0) + 1`.
4. **Zombie gate** pada 4 titik tulisan ([`:6616`](src/handlers/subtitles.js:6616), [`:7114`](src/handlers/subtitles.js:7114), [`:7138`](src/handlers/subtitles.js:7138), [`:7284/:7292`](src/handlers/subtitles.js:7284)): `handleTranslation` tangkap `gen` pada mula; setiap tulisan semak `translationGeneration.get(runtimeKey) ?? 0 === gen`.
5. **`purgeTranslationCacheByKeys(entry)`** di `subtitles.js`:
   ```
   entry = normalizeRegistryEntry(entry)
   translationGeneration.set(entry.runtimeKey, (get ?? 0) + 1)
   if (entry.bypass):
       n += delete(bypass:{entry.runtimeKey})
       n += delete(partial:{entry.runtimeKey})
   else:
       n += delete(translation:t2s__{entry.baseKey})
       n += delete(partial:{entry.runtimeKey})
   clearSharedTranslationInFlight(entry.runtimeKey)   // kedua-dua jenis (§1.2)
   translationStatus.delete(entry.runtimeKey); inFlightTranslations.delete(entry.runtimeKey)
   bump SUBTITLE_SEARCH_REV untuk entry.userHash (jika ada)
   return { deleted: n }
   ```
6. `telegramBot.js` `del_reg`/`flush_do` → `const { purgeTranslationCacheByKeys } = require('../handlers/subtitles')` **dalam callback**; mesej `Padam: {n}` / `Tiada kunci`.
7. **RED (5):** (a) `t2s__X` terpadam; (b) Redis `delete` kunci tiada → `false`; (c) bypass entry → kekal **tidak** tersentuh; (d) zombie: gen naik → tulisan dibuang; (e) **PIN migrasi** `{keys:['X__u_abc']}` → padam `bypass:X__u_abc`, `t2s__X` kekal.
8. **PIN kitaran:** `require('telegramBot')` selepas `require('subtitles')` dan sebaliknya → kedua-dua berjaya.

### Peringkat 3 — Metadata + dedup

**Fail:** [`telegramBot.js`](src/services/telegramBot.js:1) · [`subtitles.js:7015`](src/handlers/subtitles.js:7015) · [`index.js:9069`](index.js:9069)

1. `registerCompletedSubtitle({ …, baseKey, runtimeKey, bypass, userHash, trinityMode, trinityChannel })`.
2. Dedup `(baseKey, bypass, userHash)`. Cap 200 = menu sahaja.
3. Papar `📁 {Pro|Basic} · {door} · {Kekal|Bypass}`.
4. **RED:** 2 entri tajuk sama, kunci berbeza → kedua kekal.

### Peringkat 4 — xEmbed

**Fail:** [`embeddedCache.js`](src/utils/embeddedCache.js:1) · [`subtitles.js:7158`](src/handlers/subtitles.js:7158) · [`index.js:9134`](index.js:9134)

1. Registry simpan `embeddedKeys: [{ videoHash, cacheKey }]`.
2. Eksport `deleteTranslatedEmbedded(videoHash, cacheKey)` — padam + `removeFromIndex(videoHash, 'translation', cacheKey)`.
3. Purge pusat panggil untuk setiap `embeddedKeys`.
4. **RED:** simpan xEmbed → padam → `listEmbeddedTranslations(videoHash)` kosong; original kekal.

---

## 4. Kontrak TIDAK Berubah

`t2s__` / `__u_` / `cacheKeys.js:224` / `CACHE_TYPES` / `REGISTRY_REDIS_KEY` / prompt / `systemInstruction` / **`translationEngine.js`** / `FilesystemStorageAdapter.delete` ([`:503`](src/storage/FilesystemStorageAdapter.js:503) sudah betul) / pin [`redis-command-timeout:451`](src/storage/redis-command-timeout-regression.test.js:451).

---

## 5. Risiko & Sempadan

| Item | Tindakan |
|---|---|
| Rev per-userHash → pengguna lain stale ≤10 min selepas padam cache kongsi | Sempadan sedia ada; TTL [`:361`](src/handlers/subtitles.js:361) menyelesaikan |
| ioredis bentuk array Lua | `Array.isArray` defensif + ujian Redis live |
| `autoSubCache:233`/`syncCache:358` kini melangkau blok bila kunci tiada | **Lebih tepat** — index sudah bersih; Filesystem sudah begitu |
| `sessionManager:1862` `=== true` kini bermakna | Dianalisis §1.4 — `storedSession` diambil sebelum delete; tiada regresi; PIN tambahan |
| Registry lama tanpa metadata | `normalizeRegistryEntry` + PIN migrasi bypass lama |

---

## 6. Fail Terlibat

| Fail | Perubahan |
|---|---|
| [`src/utils/cacheKeys.js`](src/utils/cacheKeys.js:1) | M: + 3 fungsi kunci + `normalizeRegistryEntry` |
| [`src/handlers/subtitles.js`](src/handlers/subtitles.js:1) | M: re-export; + `translationGeneration`, `purgeTranslationCacheByKeys`; gate 4 titik; hantar entry penuh |
| [`src/storage/RedisStorageAdapter.js`](src/storage/RedisStorageAdapter.js:1) | M: `:1198` |
| [`src/services/telegramBot.js`](src/services/telegramBot.js:1) | M: schema, dedup, paparan, panggil purge pusat |
| [`index.js`](index.js:1) | M: buang `:8992-8997`; hantar `embeddedKeys` |
| [`src/utils/embeddedCache.js`](src/utils/embeddedCache.js:1) | M: + `deleteTranslatedEmbedded` |
| `src/services/telegram-registry-regression.test.js` | A: RED/PIN P1-P4 + PIN migrasi + PIN kitaran |
| `src/storage/redis-delete-truthiness-regression.test.js` | A: Redis/Filesystem seragam + `deleteSessionEverywhere` sesi tiada |
| `package.json` / `package-lock.json` / `CHANGELOG.md` / `docs/SESSION_LEDGER.md` | M: patch + entri |

**Kod produksi: 6 fail. `translationEngine.js` tidak disentuh. Tiada dependensi.**

---

## 7. Matriks Persetujuan (titik tengah)

| Topik | V2 (aku) | AI Owner | V3 (titik tengah) | Status |
|---|---|---|---|---|
| Cap 200 | V1 silap → V2 betul | Betul | Had menu sahaja | ✔ Setuju |
| Redis `delete()` | Betul | Betul + grep pemanggil | `result[0] > 0`; grep selesai, 0 pemanggil bergantung `true` | ✔ Setuju |
| Kitaran import | Pindah ke `cacheKeys.js` | + nota seni bina + ujian dua hala | Kedua-dua | ✔ Setuju |
| Entri bypass lama | Lubang: no-op + double-append | Betul | `normalizeRegistryEntry` + PIN migrasi | ✔ Setuju |
| Zombie kunci | `baseKey` | `runtimeKey` | `runtimeKey` | ✔ Setuju |
| Zombie kaunter | `Date.now()` | Monotonic | Monotonic | ✔ Setuju |
| Lock bypass | Kekal sahaja | Semak bypass | `clearSharedTranslationInFlight(runtimeKey)` kedua-dua jenis | ✔ Setuju |
| xEmbed `videoHash` | Hilang | Betul | Simpan `{videoHash, cacheKey}` | ✔ Setuju |
| Skop | P1-P4 | P1-P4 | P1-P4 | ✔ Setuju (Owner) |
| K1 / K6 | Tangguh / hutang | Setuju | Sama | ✔ Setuju (Owner) |

**Tiada pergeseran tinggal.** Menunggu lampu hijau Owner untuk Phase A.
