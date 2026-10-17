/**
 * [REGRESSION v3.9.43] Trinity Mode Switch State Preservation (Basic <-> Pro)
 *
 * Bug v3.9.42: pengguna mengisi Provider/API Key/Model dalam kad Agent
 * Translation (Basic Mode) -> tekan Pro Mode -> tekan semula Basic Mode ->
 * KESEMUA input hilang kepada placeholder ('— Select provider —', 'No key').
 *
 * Punca akar (3 kecacatan):
 *   1. currentConfig (let, skop-IIFE config.js) TIDAK kelihatan kepada
 *      trinity-agents.js — guard typeof menelan ReferenceError -> null.
 *   2. Handler change togol mod memanggil renderCards() yang melakukan
 *      cardsWrap.innerHTML = '' tanpa merakam (snapshot) nilai DOM dahulu.
 *   3. collectConfigPatch() menghantar trinity.preflight/inspector sebagai {}
 *      dalam Basic Mode (kad tiada dalam DOM) -> Save memusnahkan kredential Pro.
 *
 * Ujian ini mengunci (pin) kontrak non-destructive pada kedua-dua peringkat:
 *   A. Kontrak sumber frontend (public/js/trinity-agents.js + public/config.js)
 *      — mekanisme snapshot, pemeliharaan pilihan, dan fallback rehidrasi.
 *   B. Kontrak normalisasi backend (src/utils/config.js) — blok trinity
 *      (translation/preflight/inspector) + secondaryProvider + providers
 *      tersimpan & dimuat semula secara penuh melalui normalizeConfig
 *      (laluan /?config=<hash> -> sessionManager -> normalizeConfig).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..', '..');
const trinitySrc = fs.readFileSync(path.join(projectRoot, 'public', 'js', 'trinity-agents.js'), 'utf8');
const configJsSrc = fs.readFileSync(path.join(projectRoot, 'public', 'config.js'), 'utf8');
const trinityCssSrc = fs.readFileSync(path.join(projectRoot, 'public', 'css', 'trinity-agents.css'), 'utf8');

// ---------------------------------------------------------------------------
// A. KONTRAK SUMBER FRONTEND
// ---------------------------------------------------------------------------

test('[A1] config.js mendedahkan getter LIVE __SUB__getCurrentConfig (jambatan skop-IIFE)', () => {
    // Punca akar #1: currentConfig ialah let skop-modul — tanpa getter ini,
    // trinity-agents.js sentiasa melihat null dan snapshot berundur ke DOM kosong.
    assert.match(configJsSrc, /__SUB__getCurrentConfig/, 'getter wajib didedahkan pada window');
    assert.match(configJsSrc, /return currentConfig/, 'getter mesti memulangkan objek semasa (LIVE, bukan salinan)');
});

test('[A2] getEffectiveConfig() mengutamakan getter LIVE dengan jaring keselamatan _lastKnownConfig', () => {
    assert.match(
        trinitySrc,
        /function getEffectiveConfig\(\)\s*\{[\s\S]*?__SUB__getCurrentConfig/,
        'getEffectiveConfig mesti membaca getter LIVE dahulu'
    );
    assert.match(trinitySrc, /_lastKnownConfig/, 'cache _lastKnownConfig wajib wujud sebagai fallback');
    // Rujukan langsung kepada pemboleh ubah skop-IIFE dilarang (punca bug asal).
    assert.doesNotMatch(
        trinitySrc,
        /typeof currentConfig !== 'undefined' \? currentConfig/,
        'corak typeof-currentConfig (yang menelan ReferenceError) dilarang kembali'
    );
});

test('[A3] Handler togol mod merakam SNAPSHOT sebelum renderCards (non-destructive)', () => {
    // Punca akar #2: renderCards() memusnahkan DOM (innerHTML='') — snapshot
    // mesti dipanggil SEBELUM renderCards dalam laluan togol manual.
    const handlerMatch = trinitySrc.match(
        /toggleInput\.addEventListener\('change', function \(\) \{[\s\S]*?\n        \}\);/
    );
    assert.ok(handlerMatch, 'handler change togol mod mesti wujud');
    const handlerSrc = handlerMatch[0];
    const snapIdx = handlerSrc.indexOf('snapshotVisibleAgentState');
    // Panggilan SEBENAR (baris arahan), bukan sebutan dalam komentar: cari
    // `renderCards(snapshotCfg` — panggilan yang menggunakan hasil snapshot.
    const renderIdx = handlerSrc.indexOf('renderCards(snapshotCfg');
    assert.ok(snapIdx !== -1, 'handler mesti memanggil snapshotVisibleAgentState');
    assert.ok(renderIdx !== -1, 'handler mesti memanggil renderCards(snapshotCfg)');
    assert.ok(
        snapIdx < renderIdx,
        'snapshotVisibleAgentState mesti dilaksanakan SEBELUM renderCards (elak DOM musnah tanpa rakaman)'
    );
    // Pengawal rehydrate terkawal mesti kekal SEBELUM snapshot — semasa
    // rehydrate, hook sudah membina kad dengan cfg sebenar; snapshot manual
    // tidak boleh dicampur.
    const guardIdx = handlerSrc.indexOf('if (_rehydratingMode) return;');
    assert.ok(guardIdx !== -1 && guardIdx < snapIdx, 'guard _rehydratingMode mesti mendahului snapshot');
});

test('[A4] snapshotVisibleAgentState melangkau ejen yang kadnya TIADA dalam mod semasa', () => {
    // Semantik non-destructive: dalam Basic Mode, kad Preflight/Inspector tiada
    // dalam DOM — nilai trinity lama mesti DIKEKALKAN (tidak ditimpa {} kosong).
    const fnMatch = trinitySrc.match(/function snapshotVisibleAgentState\(targetCfg\) \{[\s\S]*?\n    \}/);
    assert.ok(fnMatch, 'fungsi snapshotVisibleAgentState mesti wujud');
    const fnSrc = fnMatch[0];
    assert.match(
        fnSrc,
        /if \(!keyEl \|\| !providerEl\) return;/,
        'ejen tanpa kad dalam DOM mesti dilangkau (return awal)'
    );
});

test('[A5] collectConfigPatch memelihara trinity.preflight/inspector apabila kad tiada dalam DOM', () => {
    // Punca akar #3: blok {} kosong memadam kredential Pro semasa Save dalam
    // Basic Mode. Patch mesti memulihkan nilai lama daripada currentConfig.
    const fnMatch = trinitySrc.match(/function collectConfigPatch\(\) \{[\s\S]*?\n    \}/);
    assert.ok(fnMatch, 'fungsi collectConfigPatch mesti wujud');
    const fnSrc = fnMatch[0];
    assert.match(fnSrc, /prevTrinity/, 'patch mesti membaca trinity lama (prevTrinity)');
    assert.match(
        fnSrc,
        /if \(!cardPresent\)/,
        'cawangan pemeliharaan untuk kad yang tiada dalam mod semasa wajib wujud'
    );
    assert.match(
        fnSrc,
        /apiKey: prev\.apiKey \|\| ''/,
        'kredential lama (apiKey) mesti dipulihkan verbatim, bukan ditimpa kosong'
    );
});

test('[A6] populateProviderDropdown memelihara pilihan semasa merentas repopulasi (race registry async)', () => {
    const fnMatch = trinitySrc.match(/function populateProviderDropdown\(agentKey, providers\) \{[\s\S]*?\n    \}/);
    assert.ok(fnMatch, 'fungsi populateProviderDropdown mesti wujud');
    const fnSrc = fnMatch[0];
    assert.match(fnSrc, /var prev = sel\.value \|\| '';/, 'pilihan semasa mesti dirakam sebelum innerHTML dibersihkan');
    assert.match(fnSrc, /if \(prev\) \{[\s\S]*?sel\.value = prev;/, 'pilihan mesti dipulihkan selepas repopulasi');
});

test('[A7] applyFallbackValues tidak menulis nilai kosong ke medan fallback (tiada padam-dengan-kosong)', () => {
    const fnMatch = trinitySrc.match(/function applyFallbackValues\(cfg\) \{[\s\S]*?\n    \}/);
    assert.ok(fnMatch, 'fungsi applyFallbackValues mesti wujud');
    const fnSrc = fnMatch[0];
    // Corak lama (destruktif): k.value = saved.apiKey || '' — memadam input yang
    // telah ditaip apabila konfigurasi tidak membawa nilai.
    assert.doesNotMatch(fnSrc, /k\.value = saved\.apiKey \|\| ''/, 'corak tulis-kosong pada fallback key dilarang');
    assert.match(
        fnSrc,
        /if \(k && saved\.apiKey\) k\.value = saved\.apiKey;/,
        'fallback key hanya ditulis bila nilai sebenar wujud'
    );
    assert.match(
        fnSrc,
        /refreshFallbackProviderOptions\(true\)/,
        'repopulasi dropdown fallback mesti memelihara pilihan (keepSelection=true)'
    );
});

test('[A8] deriveTranslationFromProviders — fallback rehidrasi providers.<mainProvider> bila trinity.translation tiada', () => {
    // Kontrak /?config=<hash> lama: sesetengah hash menyimpan kredential hanya
    // dalam providers.<mainProvider>. Tanpa fallback ini kad Agent Translation
    // kosong ('— Select provider —', 'No key').
    const fnMatch = trinitySrc.match(/function deriveTranslationFromProviders\(cfg\) \{[\s\S]*?\n    \}/);
    assert.ok(fnMatch, 'fungsi deriveTranslationFromProviders mesti wujud');
    const fnSrc = fnMatch[0];
    assert.match(fnSrc, /cfg\.mainProvider/, 'fallback mesti membaca providers.<mainProvider> dahulu');
    assert.match(fnSrc, /cfg\.geminiApiKey/, 'lapisan legasi geminiApiKey mesti kekal sebagai fallback terakhir');
    // Didaftarkan dalam applyAgentValues untuk agent translation sahaja.
    assert.match(
        trinitySrc,
        /if \(!stored && agent\.key === 'translation'\) \{\s*\n\s*stored = deriveTranslationFromProviders\(cfg\);/,
        'fallback mesti digunakan dalam applyAgentValues untuk kad translation'
    );
});

// ---------------------------------------------------------------------------
// A2. KONTRAK 4-STATE DOM MORPH v3.9.44
// ---------------------------------------------------------------------------

test('[A9] renderCards TIDAK memusnahkan DOM kad semasa pertukaran mod (HIDE, bukan destroy)', () => {
    // Kecacatan v3.9.43: `cardsWrap.innerHTML = ''` dalam renderCards() memusnahkan
    // SEMUA input pada setiap togol Basic <-> Pro — kesan sampingan: dropdown
    // Format/Door custom menjadi KOSONG, status Secondary Fallback ter-reset,
    // dan lencana API key kembali ke 'No key'.
    const fnMatch = trinitySrc.match(/function renderCards\(cfgOverride\) \{[\s\S]*?\n        \}/);
    assert.ok(fnMatch, 'fungsi renderCards mesti wujud');
    const fnSrc = fnMatch[0];
    assert.doesNotMatch(
        fnSrc,
        /cardsWrap\.innerHTML/,
        'renderCards TIDAK boleh memusnahkan DOM kad (innerHTML) — gunakan applyModeVisibility'
    );
    assert.match(fnSrc, /ensureCardsBuilt\(\);/, 'renderCards mesti memastikan kad dibina sekali sahaja');
    assert.match(fnSrc, /applyModeVisibility\(\);/, 'renderCards mesti menogol visibiliti kad mengikut mod');

    // Pembinaan DOM dikurung dalam ensureCardsBuilt() sahaja (idempotent).
    const buildMatch = trinitySrc.match(/function ensureCardsBuilt\(\) \{[\s\S]*?\n        \}/);
    assert.ok(buildMatch, 'fungsi ensureCardsBuilt mesti wujud');
    assert.match(buildMatch[0], /if \(_cardsBuilt && cardsWrap\.children\.length\) return;/);

    // Togol visibiliti: kelas .trinity-mode-hidden + kelas mod pada bekas kad.
    const visMatch = trinitySrc.match(/function applyModeVisibility\(\) \{[\s\S]*?\n        \}/);
    assert.ok(visMatch, 'fungsi applyModeVisibility mesti wujud');
    assert.match(visMatch[0], /trinity-mode-hidden/, 'kad luar mod mesti disembunyikan via kelas trinity-mode-hidden');
    assert.match(visMatch[0], /trinity-mode-basic/, 'bekas kad mesti membawa kelas mod untuk hint Pro-only');
});

test('[A10] handler togol mod tidak memusnahkan DOM dan merakam snapshot dahulu', () => {
    const handlerMatch = trinitySrc.match(
        /toggleInput\.addEventListener\('change', function \(\) \{[\s\S]*?\n        \}\);/
    );
    assert.ok(handlerMatch, 'handler change togol mod mesti wujud');
    const handlerSrc = handlerMatch[0];
    assert.doesNotMatch(handlerSrc, /cardsWrap\.innerHTML/, 'laluan togol manual TIDAK boleh memusnahkan DOM kad');
});

test('[A11] deriveTranslationFromProviders hanya memetakan pembekal yang BENAR-BENAR dikonfigurasikan (fresh state kekal kosong)', () => {
    // Kecacatan v3.9.43: `entry.apiKey || entry.model` memadankan entri lalai
    // (mainProvider: 'gemini') → fresh state AUTO-memilih 'Google Gemini' +
    // 'gemini-3-flash-preview' walaupun tiada kunci API.
    const fnMatch = trinitySrc.match(/function deriveTranslationFromProviders\(cfg\) \{[\s\S]*?\n    \}/);
    assert.ok(fnMatch, 'fungsi deriveTranslationFromProviders mesti wujud');
    const fnSrc = fnMatch[0];
    assert.doesNotMatch(fnSrc, /entry\.apiKey \|\| entry\.model/, 'kriteria entry.model (lalai) mesti dibuang');
    assert.match(
        fnSrc,
        /if \(!entryApiKey && !entryBaseUrl\) continue;/,
        'entri tanpa apiKey DAN tanpa baseUrl mesti dilangkau (fresh state kekal kosong)'
    );
    assert.match(
        fnSrc,
        /if \(String\(cfg\.geminiApiKey \|\| ''\)\.trim\(\)\) \{/,
        'lapisan legasi gemini hanya dipakai bila kunci sebenar wujud'
    );
});

test('[A12] applyAgentValues memulihkan Format/Door (peta format→door) dan mengemas kini lencana kunci', () => {
    const fnMatch = trinitySrc.match(/function applyAgentValues\(cfg\) \{[\s\S]*?\n    \}/);
    assert.ok(fnMatch, 'fungsi applyAgentValues mesti wujud');
    const fnSrc = fnMatch[0];
    // Pemulihan Format/Door: nilai legacy ('gemini'|'openai'|'anthropic') mesti
    // dipetakan kepada nilai <option> penuh, jika tidak dropdown jadi KOSONG.
    assert.match(fnSrc, /var fmtValue = formatToDoorValue\(stored\.format\);/, 'format legacy mesti dipetakan');
    assert.match(
        fnSrc,
        /if \(fmtValue\) fmtEl\.value = fmtValue;/,
        'dropdown Format mesti dipulihkan bila peta berjaya'
    );
    // Lencana 'No key' kaku selepas pengisian programatik.
    assert.match(fnSrc, /updateKeyBadge\(agent\.key\)/, 'lencana kunci mesti dikemas kini selepas rehydrate');
    // Seed legasi hanya bila kunci sebenar wujud (fresh state kekal placeholder).
    assert.match(
        fnSrc,
        /var legacyKey = String\(cfg\.geminiApiKey \|\| ''\)\.trim\(\);/,
        'seed legasi mesti digate oleh kunci gemini sebenar'
    );
    assert.match(fnSrc, /if \(legacyKey\) \{/, 'blok seed legasi mesti bersyarat kepada legacyKey');

    // Peta songsang format→door + pembantu door berkesan mesti wujud.
    assert.match(trinitySrc, /var FORMAT_TO_DOOR_VALUE = \{/, 'peta FORMAT_TO_DOOR_VALUE mesti wujud');
    assert.match(trinitySrc, /function formatToDoorValue\(format\)/, 'pembantu formatToDoorValue mesti wujud');
    assert.match(
        trinitySrc,
        /function resolveEffectiveDoor\(providerEntry, fmtValue\)/,
        'resolveEffectiveDoor mesti wujud'
    );
});

test('[A13] CSS — tab aktif Biru SubFaber + sub-kad Secondary Fallback bernafas (v3.9.45)', () => {
    // Tab aktif sebelum ini putih (tiada kontra).
    assert.match(
        trinityCssSrc,
        /\.trinity-segment-btn\.active \{[\s\S]*?linear-gradient\(135deg, #2563eb 0%, #1d4ed8 100%\)/,
        'tab aktif mesti menggunakan gradien biru SubFaber'
    );
    assert.match(
        trinityCssSrc,
        /\.trinity-segment-btn\.active \{[\s\S]*?box-shadow: 0 4px 12px rgba\(37, 99, 235, 0\.25\)/,
        'tab aktif mesti mempunyai bayang biru halus'
    );
    assert.match(
        trinityCssSrc,
        /\.trinity-segment-btn \{[\s\S]*?color: #475569;/,
        'tab tidak aktif mesti menggunakan teks kelabu gelap #475569'
    );
    assert.match(
        trinityCssSrc,
        /\.trinity-segment-btn\.active \.trinity-segment-hint \{\s*color: rgba\(255, 255, 255, 0\.85\);/,
        'sub-keterangan tab aktif mesti putih lembut'
    );
    // Ruang bernafas sub-kad fallback.
    assert.match(
        trinityCssSrc,
        /\.trinity-fallback \{[\s\S]*?margin-top: 24px;/,
        'sub-kad fallback mesti margin-top 24px'
    );
    assert.match(
        trinityCssSrc,
        /\.trinity-fallback \{[\s\S]*?margin-bottom: 24px;/,
        'sub-kad fallback mesti margin-bottom 24px (simetri dengan margin atas)'
    );
    assert.match(
        trinityCssSrc,
        /\.trinity-fallback-head \{[\s\S]*?padding: 16px 20px;/,
        'baris kepala sub-kad fallback mesti padding 16px 20px'
    );
    // [F5 v3.9.45] Garisan putus-putus .trinity-agent-hint mesti bernafas.
    assert.match(
        trinityCssSrc,
        /\.trinity-agent-hint \{[\s\S]*?margin-top: 1\.5rem;/,
        'garisan putus-putus hint mesti margin-top 1.5rem'
    );
    // Kelas morf DOM.
    assert.match(
        trinityCssSrc,
        /\.trinity-cards \.trinity-agent-card\.trinity-mode-hidden \{\s*display: none;/,
        'kelas trinity-mode-hidden mesti menyembunyikan kad'
    );
});

// ---------------------------------------------------------------------------
// B. KONTRAK NORMALISASI BACKEND (roundtrip /?config=<hash>)
// ---------------------------------------------------------------------------

test('[B1] normalizeConfig memulangkan blok trinity lengkap (mode + 3 ejen) tanpa kehilangan medan', () => {
    const { normalizeConfig } = require('../utils/config');
    const saved = {
        trinity: {
            mode: 'pro',
            translation: {
                apiKey: 'tk-1',
                format: 'openai',
                baseUrl: 'https://a.example/v1',
                model: 'm-a',
                provider: 'deepseek',
                door: 'openai-compatible',
                isCustom: false,
                enabled: true
            },
            preflight: {
                apiKey: 'pk-1',
                format: 'gemini',
                baseUrl: '',
                model: 'm-p',
                provider: 'gemini',
                door: 'gemini-native',
                isCustom: false,
                enabled: true
            },
            inspector: {
                apiKey: 'ik-1',
                format: 'anthropic',
                baseUrl: 'https://b.example/v1',
                model: 'm-i',
                provider: 'custom',
                door: 'anthropic-messages',
                isCustom: true,
                enabled: true
            }
        }
    };
    const cfg = normalizeConfig(JSON.parse(JSON.stringify(saved)));
    assert.equal(cfg.trinity.mode, 'pro', 'trinity.mode dipelihara');
    assert.equal(cfg.trinity.translation.apiKey, 'tk-1', 'translation.apiKey dipelihara');
    assert.equal(cfg.trinity.translation.model, 'm-a', 'translation.model dipelihara');
    assert.equal(cfg.trinity.preflight.apiKey, 'pk-1', 'preflight.apiKey dipelihara');
    assert.equal(cfg.trinity.preflight.model, 'm-p', 'preflight.model dipelihara');
    assert.equal(cfg.trinity.inspector.apiKey, 'ik-1', 'inspector.apiKey dipelihara');
    assert.equal(cfg.trinity.inspector.model, 'm-i', 'inspector.model dipelihara');
});

test('[B2] normalizeConfig memulangkan secondaryProvider + providers untuk rehidrasi fallback', () => {
    const { normalizeConfig } = require('../utils/config');
    const saved = {
        multiProviderEnabled: true,
        secondaryProviderEnabled: true,
        secondaryProvider: 'openai',
        mainProvider: 'gemini',
        geminiApiKey: 'gk-1',
        geminiModel: 'gemini-2.5-flash',
        providers: {
            openai: { enabled: true, apiKey: 'ok-1', model: 'gpt-5-mini', baseUrl: '' }
        }
    };
    const cfg = normalizeConfig(JSON.parse(JSON.stringify(saved)));
    assert.equal(cfg.secondaryProvider, 'openai', 'secondaryProvider dipelihara untuk applyFallbackValues');
    assert.equal(cfg.secondaryProviderEnabled, true, 'secondaryProviderEnabled dipelihara');
    assert.ok(cfg.providers && cfg.providers.openai, 'providers.openai dipelihara');
    assert.equal(cfg.providers.openai.apiKey, 'ok-1', 'kredential fallback dipelihara');
});

test('[B3] Pertukaran mod basic->pro melalui normalizeConfig tidak memadam kredential agentInspector terbitan trinity', () => {
    // Simulasi Save dalam Basic Mode selepas pembaikan: patch membawa
    // trinity.mode='basic' TETAPI mengekalkan preflight/inspector lama.
    // Backend mesti kekal membina agentInspector daripada nilai tersebut.
    const { normalizeConfig } = require('../utils/config');
    const saved = {
        trinity: {
            mode: 'basic',
            translation: {
                apiKey: 'tk-1',
                format: 'auto',
                baseUrl: '',
                model: 'm-a',
                provider: 'gemini',
                door: 'gemini-native',
                isCustom: false,
                enabled: true
            },
            // [v3.9.43] kekal dikekalkan oleh collectConfigPatch walaupun kad
            // tiada dalam DOM Basic Mode:
            preflight: {
                apiKey: 'pk-1',
                format: 'gemini',
                baseUrl: '',
                model: 'm-p',
                provider: 'gemini',
                door: 'gemini-native',
                isCustom: false,
                enabled: true
            },
            inspector: {
                apiKey: 'ik-1',
                format: 'openai',
                baseUrl: 'https://x.example/v1',
                model: 'm-i',
                provider: 'custom',
                door: 'openai-compatible',
                isCustom: true,
                enabled: true
            }
        }
    };
    const cfg = normalizeConfig(JSON.parse(JSON.stringify(saved)));
    assert.equal(cfg.trinity.mode, 'basic', 'mod basic dipelihara');
    assert.equal(cfg.trinity.preflight.apiKey, 'pk-1', 'preflight terselamat merentas pertukaran mod');
    assert.equal(cfg.trinity.inspector.apiKey, 'ik-1', 'inspector terselamat merentas pertukaran mod');
    // agentInspector terbitan: keutamaan trinity.inspector/preflight (config.js Fasa D).
    assert.equal(
        cfg.agentInspector.apiKey,
        'ik-1',
        'agentInspector.apiKey terbit daripada trinity.inspector/preflight yang dipelihara'
    );
    assert.equal(
        cfg.agentInspector.preflightModel,
        'm-p',
        'agentInspector.preflightModel terbit daripada trinity.preflight yang dipelihara'
    );
    assert.equal(
        cfg.agentInspector.model,
        'm-i',
        'agentInspector.model terbit daripada trinity.inspector yang dipelihara'
    );
});

test('[B4] agentInspector tidak aktif secara tidak sengaja apabila hanya trinity.translation wujud (Basic Mode tulen)', () => {
    const { normalizeConfig } = require('../utils/config');
    const cfg = normalizeConfig({
        trinity: {
            mode: 'basic',
            translation: {
                apiKey: 'tk-1',
                format: 'auto',
                baseUrl: '',
                model: 'm-a',
                provider: 'gemini',
                door: 'gemini-native',
                isCustom: false,
                enabled: true
            },
            preflight: {},
            inspector: {}
        }
    });
    assert.equal(cfg.trinity.mode, 'basic', 'mod basic');
    assert.equal(
        cfg.agentInspector.enabled,
        false,
        'agentInspector dilumpuhkan — tiada kredential preflight/inspector'
    );
});
