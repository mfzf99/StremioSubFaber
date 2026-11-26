// Ujian regresi: insiden PROHIBITED_CONTENT MESTI sampai ke keadaan muktamad.
//
// [TERMINAL-STATE v3.43.0 — menutup gap SSOT §5.4]
// Insiden PROHIBITED_CONTENT dibuka dengan outcome:'in_progress' (translationEngine.js)
// tetapi TIDAK ADA satu pun laluan keluar yang memanggil _closeIncident untuknya:
//   - Stage 1/2 berjaya               -> insiden kekal in_progress
//   - fallback provider mengendalikan -> insiden kekal in_progress
//   - fallback gagal (throw)          -> insiden kekal in_progress
// Akibatnya resit Telegram memaparkan "⏳ still closing…" untuk insiden yang sudah
// selesai. Ini melanggar doktrin Terminal-state Closure (SSOT §1) dan gap §5.4.
//
// Setiap kes memandu enjin melalui pintu keluar yang sebenar dan menegaskan insiden
// tersebut mencapai keadaan muktamad dengan outcome yang jujur.
const { test } = require('node:test');
const assert = require('node:assert');
const TranslationEngine = require('./translationEngine');

function makeEngine(provider) {
    return new TranslationEngine(provider, 'gemini-2.5-flash', {}, { providerName: 'gemini' });
}

function entries(n) {
    return Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        timecode: `00:00:0${i + 1},000 --> 00:00:0${i + 2},000`,
        text: `Source line ${i + 1} with enough content.`
    }));
}

function answerXml(texts, startId = 1) {
    return `<answer>\n${texts.map((t, i) => `<s id="${startId + i}">${t}</s>`).join('\n')}\n</answer>`;
}

function prohibitedError() {
    const error = new Error('Response was blocked: PROHIBITED_CONTENT');
    return error;
}

function inspectorAlwaysValid() {
    return {
        circuitOpen: false,
        runSemanticInspection: async () => ({ valid: true })
    };
}

test('[TERMINAL-1] PROHIBITED_CONTENT Stage 1 berjaya — insiden muktamad sebagai recovered', async () => {
    let call = 0;
    const provider = {
        translateSubtitle: async () => {
            call++;
            if (call === 1) throw prohibitedError();
            return answerXml(['Baris satu', 'Baris dua']);
        },
        estimateTokenCount: () => 10
    };
    const engine = makeEngine(provider);
    engine.sourceLanguage = 'English';
    engine.agentInspector = inspectorAlwaysValid();

    await engine.translateBatch(entries(2), 'Malay', null, 0, 1, null, {});

    const incident = engine.translationStats.incidents.find((i) => i.type === 'PROHIBITED_CONTENT');
    assert.ok(incident, 'the PROHIBITED_CONTENT incident must be recorded');
    assert.notEqual(incident.outcome, 'in_progress', 'the incident must not stay in_progress after success');
    assert.equal(incident.outcome, 'recovered', 'a successful recovery stage must be recovered');
});

test('[TERMINAL-2] PROHIBITED_CONTENT kedua-dua stage gagal, fallback mengendalikan — insiden muktamad sebagai fallback', async () => {
    const provider = {
        translateSubtitle: async () => {
            throw prohibitedError();
        },
        estimateTokenCount: () => 10
    };
    const engine = makeEngine(provider);
    engine.sourceLanguage = 'English';
    engine.agentInspector = inspectorAlwaysValid();
    engine.fallbackProvider = { translateSubtitle: async () => answerXml(['Satu', 'Dua']) };

    const result = await engine.translateBatch(entries(2), 'Malay', null, 0, 1, null, {});

    assert.ok(result && result.length === 2, 'the batch is served by the fallback provider');
    const incident = engine.translationStats.incidents.find((i) => i.type === 'PROHIBITED_CONTENT');
    assert.ok(incident, 'the PROHIBITED_CONTENT incident must be recorded');
    assert.notEqual(incident.outcome, 'in_progress', 'the incident must not stay in_progress after fallback');
    assert.equal(incident.outcome, 'fallback', 'a fallback-served batch must say so');
});

test('[TERMINAL-3] PROHIBITED_CONTENT kedua-dua stage gagal, fallback gagal — insiden muktamad sebagai gagal dan ralat dilempar', async () => {
    const provider = {
        translateSubtitle: async () => {
            throw prohibitedError();
        },
        estimateTokenCount: () => 10
    };
    const engine = makeEngine(provider);
    engine.sourceLanguage = 'English';
    engine.agentInspector = inspectorAlwaysValid();
    engine.fallbackProvider = {
        translateSubtitle: async () => {
            throw new Error('fallback provider down');
        }
    };

    await assert.rejects(() => engine.translateBatch(entries(2), 'Malay', null, 0, 1, null, {}));

    const incident = engine.translationStats.incidents.find((i) => i.type === 'PROHIBITED_CONTENT');
    assert.ok(incident, 'the PROHIBITED_CONTENT incident must be recorded');
    assert.notEqual(incident.outcome, 'in_progress', 'the incident must not stay in_progress after a thrown error');
    assert.equal(incident.outcome, 'failed', 'an unrecovered batch must be recorded as failed');
});

test('[TERMINAL-4] tiada fallback disediakan, kedua-dua stage gagal — insiden tetap muktamad', async () => {
    const provider = {
        translateSubtitle: async () => {
            throw prohibitedError();
        },
        estimateTokenCount: () => 10
    };
    const engine = makeEngine(provider);
    engine.sourceLanguage = 'English';
    engine.agentInspector = inspectorAlwaysValid();

    await assert.rejects(() => engine.translateBatch(entries(2), 'Malay', null, 0, 1, null, {}));

    const open = engine.translationStats.incidents.filter((i) => i.outcome === 'in_progress');
    assert.deepEqual(open, [], 'no incident may remain in_progress once the batch is over');
});
