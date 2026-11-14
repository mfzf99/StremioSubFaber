/**
 * Regression — single canonical Trinity prompt contract.
 *
 * The former A/B/C registry is intentionally removed. [SINGLE-TEMPLATE
 * 2026-11-14] Pro and Basic now share ONE canonical template; the only
 * runtime difference is data: Basic never receives a Preflight context, so
 * the <preflight_knp> block is absent. Few-shot from the language pack and
 * the active-ID manifest are injected for BOTH modes (Owner Mandate D5/D5b).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { PREFLIGHT_STATIC_TEMPLATE } = require('./prompts/trinity/preflight/core');
const { TRANSLATION_SYSTEM_TEMPLATE } = require('./prompts/trinity/translation/core');
const { INSPECTOR_INSTRUCTION } = require('./prompts/trinity/inspector/core');
const { buildPreflightPrompt } = require('./subfaberPreflight');
const { buildInspectionPayload } = require('./agentInspector');
const TranslationEngine = require('./translationEngine');
const { normalizeConfig } = require('../utils/config');
const { generateCacheKeys } = require('../utils/cacheKeys');
const { splitStructuredPrompt } = require('./utils/structuredPrompt');
const { normalizeTargetLanguageForPrompt } = require('./utils/normalizeTargetLanguageForPrompt');

function makeEngine(options = {}) {
    return new TranslationEngine(
        { translateSubtitle: async () => '', estimateTokenCount: () => 10 },
        'gemini-2.5-flash',
        {},
        options
    );
}

test('[TRINITY-CORE-1] Canonical cores retain the approved prompt contracts without setup labels', () => {
    assert.ok(PREFLIGHT_STATIC_TEMPLATE.includes("'terms' are the distinctive vocabulary"));
    assert.ok(PREFLIGHT_STATIC_TEMPLATE.includes('${honorificMatrix}'));
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('mentally translate the complete sentence first'));
    // [SINGLE-TEMPLATE 2026-11-14] ${targetSpecificRules} is retired (Owner
    // D3); ${fewShot} stays and is now interpolated for BOTH modes.
    assert.ok(!TRANSLATION_SYSTEM_TEMPLATE.includes('${targetSpecificRules}'));
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('${fewShot}'));
    assert.ok(INSPECTOR_INSTRUCTION.includes('universal interjections/vocalizations'));
    assert.ok(INSPECTOR_INSTRUCTION.includes('weaving in target-language discourse particles'));
    for (const template of [PREFLIGHT_STATIC_TEMPLATE, TRANSLATION_SYSTEM_TEMPLATE, INSPECTOR_INSTRUCTION]) {
        assert.doesNotMatch(template, /Setup [ABC]|The Invisible Editor/);
    }
});

test('[TRINITY-CORE-2] Preflight and Inspector always use their canonical cores', () => {
    const preflight = buildPreflightPrompt('Dialogue', 'Malay', 'English', 'openai');
    assert.ok(preflight.includes('specializing in English comprehension and Malay expression optimization'));
    assert.ok(preflight.includes("'terms' are the distinctive vocabulary"));
    assert.ok(preflight.includes('"credits_and_titles"'));

    const inspection = buildInspectionPayload([{ id: 1, text: 'Okay, boss' }], [{ index: 0, text: 'Okay, boss' }]);
    assert.ok(inspection.prompt.startsWith(INSPECTOR_INSTRUCTION));
    assert.ok(inspection.prompt.includes('{"valid":true,"crimes":[]}'));
    assert.ok(inspection.prompt.includes('accounting for valid clause reordering'));
});

test('[TRINITY-CORE-3] Legacy setup options and environment values cannot change the active prompt', () => {
    const previousCanonical = process.env.TRINITY_PROMPT_SETUP;
    const previousLegacy = process.env.TRINITY_TRANSLATION_PROMPT_SETUP;
    try {
        process.env.TRINITY_PROMPT_SETUP = 'C';
        process.env.TRINITY_TRANSLATION_PROMPT_SETUP = 'A';
        const control = makeEngine({ trinityMode: 'pro' });
        const legacy = makeEngine({ trinityMode: 'pro', promptSetup: 'A' });
        assert.equal(control.translationTemplate, TRANSLATION_SYSTEM_TEMPLATE);
        assert.equal(legacy.translationTemplate, TRANSLATION_SYSTEM_TEMPLATE);
        control.sourceLanguage = 'English';
        legacy.sourceLanguage = 'English';
        const input = '<s id="1">Hello.</s>';
        assert.equal(
            legacy.createXmlBatchPrompt(input, 'Malay', null, 1, null, 0, 1),
            control.createXmlBatchPrompt(input, 'Malay', null, 1, null, 0, 1)
        );
        assert.equal(
            buildPreflightPrompt('Dialogue', 'Malay', 'English'),
            buildPreflightPrompt('Dialogue', 'Malay', 'English')
        );
    } finally {
        if (previousCanonical === undefined) delete process.env.TRINITY_PROMPT_SETUP;
        else process.env.TRINITY_PROMPT_SETUP = previousCanonical;
        if (previousLegacy === undefined) delete process.env.TRINITY_TRANSLATION_PROMPT_SETUP;
        else process.env.TRINITY_TRANSLATION_PROMPT_SETUP = previousLegacy;
    }
});

test('[TRINITY-CORE-4] ONE template serves Basic and Pro — Basic rejects an Inspector but keeps pack few-shot', async () => {
    // [SINGLE-TEMPLATE 2026-11-14, Owner D5b] Basic dan Pro berkongsi SATU
    // templat; perbezaan ialah data (Basic tiada konteks preflight). Few-shot
    // pack disuntik pada KEDUA-DUA mod — templat tetap sifar nama bahasa
    // konkrit (R3 kekal: kekunci universaliti berpindah kepada pack, pembawa
    // per-sasaran yang sah).
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('${fewShot}'), 'few-shot placeholder hadir (kedua-dua mod)');
    assert.ok(!TRANSLATION_SYSTEM_TEMPLATE.includes('${targetSpecificRules}'), 'specificRules dipensiunkan (D3)');
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('STRICT 1:1 SLOT PARITY'), 'R1 — ID pariti');
    assert.ok(
        TRANSLATION_SYSTEM_TEMPLATE.includes('mentally translate the complete sentence first'),
        'R2 — ayat dipecah'
    );
    assert.ok(
        TRANSLATION_SYSTEM_TEMPLATE.includes('Convert meaning, not sounds or word order'),
        'R3 — dialog semula jadi'
    );
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('SDH & SYMBOLS'), 'R4 — label penutur, SDH');
    assert.ok(
        TRANSLATION_SYSTEM_TEMPLATE.includes('PRESERVE markup') &&
            TRANSLATION_SYSTEM_TEMPLATE.includes('preserve the exact count of [br]'),
        'R5 — pemeliharaan format'
    );
    assert.ok(
        TRANSLATION_SYSTEM_TEMPLATE.includes('ZERO translator notes in parentheses'),
        'R6 — tiada catatan penterjemah'
    );
    // R3: templat tunggal tidak boleh menamakan bahasa konkrit.
    assert.ok(!TRANSLATION_SYSTEM_TEMPLATE.includes('Malay'), 'R3 — tiada nama bahasa konkrit (Malay)');
    assert.ok(!TRANSLATION_SYSTEM_TEMPLATE.includes('Indonesian-dub'), 'R3 — tiada klausa kraf bersyarat');
    // Templat statik sifar rujukan preflight (arahan KNP hidup dalam blok
    // <preflight_knp> user-lane; Basic tak pernah nampaknya).
    assert.doesNotMatch(
        TRANSLATION_SYSTEM_TEMPLATE,
        /pre-?flight|Agent Inspector|Locked Terms?|locked Character Addresses?/i
    );

    const injectedInspector = {
        circuitOpen: false,
        runPreflightPass: async () => {
            throw new Error('Basic must not run Preflight');
        },
        runSemanticInspection: async () => {
            throw new Error('Basic must not run Inspector');
        }
    };
    const basic = makeEngine({ trinityMode: 'basic', agentInspector: injectedInspector });
    const pro = makeEngine({ trinityMode: 'pro', agentInspector: injectedInspector });
    assert.equal(basic.translationTemplate, TRANSLATION_SYSTEM_TEMPLATE, 'Basic uses the single canonical template');
    assert.equal(pro.translationTemplate, TRANSLATION_SYSTEM_TEMPLATE, 'Pro uses the same single canonical template');
    assert.equal(basic.agentInspector, null, 'Basic must reject an Inspector even with preserved/imported credentials');
    assert.equal(pro.agentInspector, injectedInspector, 'Pro must retain the configured Inspector');

    const source = '1\n00:00:01,000 --> 00:00:02,000\nHello.\n';
    const basicProvider = {
        translateSubtitle: async () => '<s id="1">Hai.</s>',
        estimateTokenCount: () => 10
    };
    const basicRuntime = new TranslationEngine(
        basicProvider,
        'gemini-2.5-flash',
        {},
        {
            trinityMode: 'basic',
            agentInspector: injectedInspector
        }
    );
    const basicOutput = await basicRuntime.translateSubtitle(source, 'Malay', null, null, 'English');
    assert.ok(basicOutput.includes('Hai.'), 'Basic standalone translation must still complete');
    assert.equal(basicRuntime.preflightContext, null, 'Basic must not create pre-flight context');
    assert.equal(basicRuntime.translationStats.agentInspectorUsed, false);
    assert.equal(basicRuntime.translationStats.agentInspectorBatchesInspected, 0);
});

test('[TRINITY-CORE-5] Pack few-shot is injected for BOTH modes and every placeholder survives interpolation', () => {
    // [SINGLE-TEMPLATE 2026-11-14] few-shot pack (contoh isometrik baharu)
    // kini disuntik TANPA SYARAT — Basic dan Pro sama. specificRules sudah
    // tidak lagi diinterpolasi (D3: placeholder dipensiunkan; craft BM
    // kekal tersedia melalui P8 composer lalai gemini.js).
    for (const mode of ['basic', 'pro']) {
        const engine = makeEngine({ trinityMode: mode });
        engine.sourceLanguage = 'English';
        const prompt = engine.createXmlBatchPrompt('<s id="1">Hello.</s>', 'Malay', null, 1, null, 0, 1);
        assert.ok(prompt.includes('Biar betul.'), `${mode}: contoh few-shot BM hadir (pack disuntik)`);
        assert.ok(!prompt.includes('Spoken Malaysian Cadence'), `${mode}: specificRules TIADA (dipensiunkan)`);
        assert.ok(!prompt.includes('Register-Gated Loanwords'), `${mode}: tiada peraturan pack lama`);
        for (const placeholder of ['${sourceLabel}', '${targetLabel}', '${targetLabelShort}', '${fewShot}']) {
            assert.equal(prompt.includes(placeholder), false, `${mode}: ${placeholder}`);
        }
    }
});

test('[TRINITY-CORE-6] Legacy setup IDs no longer trigger experimental cache bypass', () => {
    for (const trinity of [
        { promptSetup: 'A' },
        { promptSetup: 'B' },
        { promptSetup: 'C' },
        { translation: { promptSetup: 'c' } }
    ]) {
        const cfg = normalizeConfig({ trinity });
        assert.notEqual(cfg.bypassCache, true);
    }
});

test('[TRINITY-CORE-7] Runtime modules no longer expose the retired setup registry', () => {
    assert.equal(fs.existsSync(path.join(__dirname, 'prompts', 'trinity', 'setups')), false);
    assert.equal(fs.existsSync(path.join(__dirname, 'prompts', 'trinity', 'translation', 'setups')), false);
});

test('[TRINITY-CORE-8] v5 namespace discriminates mode + channel and retains user/format scoping', () => {
    // [P1 F6 FIX 2026-11-10] Channel discriminator (`_ch-gemini` default).
    // [STRUCTURE-V5 2026-11-14] Namespace advanced v4 → v5 with a MODE
    // discriminator: the prompt was redesigned (8-section single template,
    // pack few-shot both modes, <previous_translated>/<future_source>,
    // verbatim <preflight_knp>), so v4 output must never be served under
    // v5; and Pro (KNP-guided) output must never be served to Basic runs
    // (cross-mode poisoning), hence trinity-{basic|pro}.
    const permanent = generateCacheKeys({}, 'tt123_en', 'ms');
    assert.equal(permanent.baseKey, 'tt123_en_ms_trinity-basic-universal-v5_ch-gemini');
    assert.equal(permanent.cacheKey, permanent.baseKey);

    const pro = generateCacheKeys({ trinityMode: 'pro' }, 'tt123_en', 'ms');
    assert.equal(pro.baseKey, 'tt123_en_ms_trinity-pro-universal-v5_ch-gemini', 'Pro namespace must differ from Basic');

    const bypass = generateCacheKeys({ bypassCache: true, __configHash: 'config-hash' }, 'tt123_en', 'ms');
    assert.equal(bypass.cacheKey, 'tt123_en_ms_trinity-basic-universal-v5_ch-gemini__u_config-hash');
    assert.equal(bypass.runtimeKey, bypass.cacheKey);

    const ass = generateCacheKeys({ convertAssToVtt: false }, 'tt123_en', 'ms');
    assert.equal(ass.baseKey, 'tt123_en_ms_trinity-basic-universal-v5_ch-gemini_ass');
});

test('[TRINITY-CORE-9] The single template retains the owner-vetted evidence + split/entity contract', () => {
    // [SINGLE-TEMPLATE 2026-11-14] Kontrak bukti (evidence discipline) Pro
    // diserap ke dalam templat tunggal; SOURCE-EVIDENCE HIERARCHY berpindah
    // ke blok <preflight_knp> user-lane (sifar rujukan preflight statik) —
    // jadi pin untuk fragmen itu kini diuji pada OUTPUT enjin Pro melalui
    // blok KNP, bukan pada teks statik.
    for (const fragment of [
        'These exceptions apply only to the affected entity, never to the surrounding sentence',
        'retaining or transliterating that entity as appropriate',
        'otherwise retain the original title',
        'Never invent an official rendering',
        'Distribution follows meaning and readable phrase boundaries, not equal character or word counts'
    ]) {
        assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes(fragment), fragment);
    }
    // Static lane mesti SIFAR rujukan preflight — hierarki kebenaran hidup
    // bersama blok KNP (user lane), supaya Basic tidak nampaknya.
    assert.ok(!/pre-?flight/i.test(TRANSLATION_SYSTEM_TEMPLATE), 'Static lane tiada rujukan preflight');
    const proEngine = makeEngine({ trinityMode: 'pro' });
    proEngine.preflightContext = {
        theme: 'A heist movie in Blackwood.',
        terms: [{ source: 'Blackwood', target: 'Hutan Hitam' }],
        characters: [],
        credits_and_titles: []
    };
    proEngine.sourceLanguage = 'English';
    // KNP hidup dalam user lane melalui parameter context (bukan hardcode) —
    // bina konteks cara produksi supaya blok <preflight_knp> terbentuk.
    const ctx = {
        previousContent: [],
        subsequentContent: [],
        previousMemory: [],
        preflight: proEngine.preflightContext
    };
    const proPrompt = proEngine.createXmlBatchPrompt('<s id="1">Hello.</s>', 'Malay', null, 1, ctx, 0, 1);
    assert.ok(proPrompt.includes('HIERARCHY OF TRUTH'), 'Hierarchy-of-truth guidance hadir dalam blok KNP (Pro)');
    assert.ok(
        proPrompt.includes('If the source explicitly contradicts this context'),
        'Source-over-context precedence hadir (Pro)'
    );

    assert.ok(!TRANSLATION_SYSTEM_TEMPLATE.includes('distribute the clauses proportionally'));
    // [SINGLE-TEMPLATE] Kontrak teras kekal dalam templat tunggal.
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('identical IDs in identical order'));
    assert.ok(
        TRANSLATION_SYSTEM_TEMPLATE.includes(
            'distribute the translated meaning naturally across those exact same slots'
        )
    );
    assert.ok(
        TRANSLATION_SYSTEM_TEMPLATE.includes('proper name or brand'),
        'Names-intact default kekal (kontrak entiti 5-V; frasa "keep proper nouns..." dipensiunkan bersama kemas kini)'
    );
    assert.ok(
        TRANSLATION_SYSTEM_TEMPLATE.includes('titles intact unless official localization demands otherwise') === false,
        'Kontrak baharu 5-V menggantikan frasa legasi'
    );
    assert.ok(TRANSLATION_SYSTEM_TEMPLATE.includes('Anything outside <input> is read-only context'));
    // [SINGLE-TEMPLATE] Kontrak 5-V: jangka mengekalkan entiti kekal melalui
    // frasa "retaining or transliterating" (dipin di atas) + larangan rekaan
    // ("Never invent an official rendering") — koverans setara penuh.
});

test('[TRINITY-CORE-11] Both modes place the exact active-ID manifest before input on every provider door', () => {
    // [SINGLE-TEMPLATE 2026-11-14, Owner D5] idManifest dilanjutkan ke Pro —
    // perlindungan anti-drop entri terakhir kini untuk KEDUA-DUA mod.
    const input = '<s id="8">First.</s>\n<s id="11">Second.</s>\n<s id="19">Last.</s>';
    const manifest =
        'Required output ids in exact order (translate every listed id, including the last one):\n8,11,19\n\n<input>';
    for (const trinityChannel of ['gemini', 'openai', 'anthropic']) {
        for (const mode of ['basic', 'pro']) {
            const engine = makeEngine({ trinityMode: mode, trinityChannel });
            engine.sourceLanguage = 'English';
            const structured = splitStructuredPrompt(engine.createXmlBatchPrompt(input, 'Malay', null, 3, null, 0, 1));
            assert.ok(structured, `${trinityChannel}/${mode} must retain the structured boundary`);
            assert.ok(structured.user.includes(manifest), `${trinityChannel}/${mode} must contain the exact manifest`);
            assert.equal(
                structured.user.includes('Required output ids in exact order'),
                true,
                `${trinityChannel}/${mode} manifest must be present`
            );
            const expectedSystem = engine.translationTemplate
                .replaceAll('${sourceLabel}', 'English')
                .replaceAll('${targetLabel}', 'Malay')
                .replaceAll('${targetLabelShort}', 'Malay')
                .replaceAll('${fewShot}', require('./prompts/languagePacks').getLanguagePack('Malay').fewShot);
            assert.equal(structured.system, expectedSystem, `${trinityChannel}/${mode} system lane exact`);
            // specificRules dipensiunkan — tiada teksnya pada mana-mana mod.
            assert.ok(!structured.system.includes('Spoken Malaysian Cadence'), `${trinityChannel}/${mode}: D3`);
            // Templat statik tidak menamakan bahasa konkrit (universaliti
            // dibawa oleh label interpolasi + pack few-shot sahaja).
            assert.ok(!structured.system.includes('when it is Malay'));
            assert.ok(!structured.system.includes('Indonesian-dub'));
        }
    }
});

test('[TRINITY-CORE-10] System instruction is IDENTICAL for every target except the language label', () => {
    const input = '<s id="1">Hello.</s>';
    const engine = makeEngine({ trinityMode: 'basic' });
    engine.sourceLanguage = 'English';

    // [SINGLE-TEMPLATE 2026-11-14] Templat tunggal tidak boleh menamakan
    // SEBARANG bahasa konkrit. Few-shot pack (Malay sahaja dapat contoh BM)
    // DIBUANG daripada perbandingan cross-target terlebih dahulu kerana
    // ia pembawa per-sasaran yang sah — kontrak universaliti berpindah
    // daripada "tiada suntikan pack" kepada "pack melalui ${fewShot}".
    const forbidden = /ini\/itu\/yang|saya\/awak|aku\/kau|okey\/helo|Malaysian|Indonesian-dub|when it is Malay/i;
    const systemByTarget = {};
    const { getLanguagePack } = require('./prompts/languagePacks');

    for (const targetLanguage of ['Malay', 'Japanese', 'Vietnamese', 'Spanish', 'Indonesian']) {
        const targetLabel = normalizeTargetLanguageForPrompt(targetLanguage);
        const prompt = engine.createXmlBatchPrompt(input, targetLanguage, null, 1, null, 0, 1);
        const structured = splitStructuredPrompt(prompt);
        assert.ok(structured, `${targetLanguage} prompt must stay structured`);
        assert.ok(
            structured.system.includes(`localizing subtitles from English into ${targetLabel}`),
            `${targetLanguage} prompt must name the actual target language`
        );
        // Templat statik mesti bebas daripada nama bahasa konkrit pada sumber.
        assert.doesNotMatch(
            TRANSLATION_SYSTEM_TEMPLATE,
            forbidden,
            'Templat tunggal mesti UNIVERSAL — tiada nama bahasa konkrit'
        );
        // Few-shot runtime: pack betul mengikut sasaran (BM untuk Malay,
        // placeholder neutral untuk yang lain) — bukti wiring pack berfungsi.
        const packFewShot = getLanguagePack(targetLanguage).fewShot;
        if (targetLanguage === 'Malay') {
            assert.ok(structured.system.includes('Biar betul.'), 'Malay pack few-shot hadir untuk sasaran Malay');
        } else {
            assert.ok(!structured.system.includes('Biar betul.'), `${targetLanguage}: TIADA contoh BM`);
        }
        const withoutPack = structured.system.replaceAll(packFewShot, '');
        const normalized = withoutPack.replaceAll(targetLabel, '<TARGET>');
        assert.doesNotMatch(normalized, forbidden, `${targetLanguage} prompt must not contain Malay-specific craft`);
        systemByTarget[targetLanguage] = normalized;
    }

    const distinct = new Set(Object.values(systemByTarget));
    assert.equal(
        distinct.size,
        1,
        `System prompt mesti IDENTIK untuk semua bahasa selepas label + pack dibuang; mendapat ${distinct.size} varian`
    );
});

test('[TRINITY-CORE-12] Subtitle handler does not construct Inspector in Basic mode', () => {
    const handlerSource = fs.readFileSync(path.join(__dirname, '..', 'handlers', 'subtitles.js'), 'utf8');
    const constructorGate = handlerSource.match(
        /const isProTrinityMode =[\s\S]*?if \(\s*isProTrinityMode &&\s*config\.agentInspector\?\.enabled === true/
    );
    assert.ok(constructorGate, 'AgentInspector construction must require Pro mode before configuration is consumed');
});
