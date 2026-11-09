const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { executeParallelTranslation } = require('./parallelTranslation');
const { getDefaultConfig, normalizeConfig } = require('./config');

function makeEntries(count) {
    return Array.from({ length: count }, (_, index) => ({
        id: index + 1,
        timecode: '00:00:01,000 --> 00:00:02,000',
        text: `Source ${index + 1}`
    }));
}

function makeEngine(parallelBatchesCount, observe) {
    let inFlight = 0;
    let maxInFlight = 0;
    const calls = [];
    const engine = {
        batchSize: 200,
        enableStreaming: false,
        advancedSettings: { parallelBatchesCount },
        translationStats: {
            rateLimitErrors: 0,
            keyRotationRetries: 0,
            missingEntries: 0,
            recoveredEntries: 0,
            secondaryErrorTypes: [],
            errorTypes: []
        },
        cleanTranslatedText: (text) => text,
        maybeRotateKeyForBatch: async () => {},
        prepareContextForBatch: (batch, entries, translatedSoFar) => ({
            previousContent: [],
            subsequentContent: [],
            previousMemory: translatedSoFar.map((entry) => ({ id: entry.id, translation: entry.text })),
            preflight: null
        }),
        translateBatch: async (batch, targetLanguage, customPrompt, batchIndex, totalBatches, context, options) => {
            inFlight++;
            maxInFlight = Math.max(maxInFlight, inFlight);
            calls.push({ batchIndex, totalBatches, context, options });
            await new Promise((resolve) => setTimeout(resolve, 5));
            inFlight--;
            return batch.map((entry) => ({ ...entry, text: `Translated ${entry.id}` }));
        }
    };

    return {
        engine,
        calls,
        getMaxInFlight: () => maxInFlight,
        observe
    };
}

async function runConcurrencyProbe(entryCount, configuredCount) {
    const probe = makeEngine(configuredCount);
    const result = await executeParallelTranslation(probe.engine, makeEntries(entryCount), 'Malay', null, null);
    assert.equal(result.length, entryCount);
    assert.deepEqual(
        result.map((entry) => entry.id),
        makeEntries(entryCount).map((entry) => entry.id),
        'parallel output retains canonical entry order'
    );
    return probe;
}

test('Phase C: Auto uses min(totalBatches, 5) and never exceeds the batch count', async () => {
    const capped = await runConcurrencyProbe(2200, 0);
    assert.equal(capped.calls[0].totalBatches, 11);
    assert.equal(capped.getMaxInFlight(), 5);

    const small = await runConcurrencyProbe(600, 0);
    assert.equal(small.calls[0].totalBatches, 3);
    assert.equal(small.getMaxInFlight(), 3);
});

test('Phase C: manual concurrency supports eight workers without a key-count cap', async () => {
    const probe = await runConcurrencyProbe(1800, 8);
    assert.equal(probe.calls[0].totalBatches, 9);
    assert.equal(probe.getMaxInFlight(), 8);
});

test('Phase C: every worker uses streaming transport without competing partial previews', async () => {
    const probe = makeEngine(3);
    const result = await executeParallelTranslation(probe.engine, makeEntries(600), 'Malay', null, null);
    assert.equal(result.length, 600);
    assert.equal(probe.calls.length, 3);

    const first = probe.calls.find((call) => call.batchIndex === 0);
    const workers = probe.calls.filter((call) => call.batchIndex > 0);
    assert.equal(first.options.streaming, false, 'batch zero follows the engine preview capability');
    assert.equal(typeof first.options.onStreamProgress, 'function');
    assert.ok(workers.every((call) => call.options.streaming === true));
    assert.ok(workers.every((call) => call.options.onStreamProgress === undefined));
    assert.ok(
        probe.calls.every((call) => call.context.previousMemory.length === 0),
        'concurrently launched batches never consume a peer translation (previousMemory = 0)'
    );
});

test('Phase C: defaults select Sequential with Automatic concurrency', () => {
    const config = getDefaultConfig();
    assert.equal(config.parallelBatchesEnabled, false);
    assert.equal(config.parallelBatchesCount, 0);
});

test('Phase C: normalization preserves Auto, clamps manual input to 1..8, and retains manual three', () => {
    assert.equal(normalizeConfig({ parallelBatchesCount: 0 }).parallelBatchesCount, 0);
    assert.equal(normalizeConfig({ parallelBatchesCount: 3 }).parallelBatchesCount, 3);
    assert.equal(normalizeConfig({ parallelBatchesCount: 8 }).parallelBatchesCount, 8);
    assert.equal(normalizeConfig({ parallelBatchesCount: 99 }).parallelBatchesCount, 8);
    assert.equal(normalizeConfig({ parallelBatchesCount: -4 }).parallelBatchesCount, 0);
    assert.equal(normalizeConfig({ parallelBatchesCount: 'invalid' }).parallelBatchesCount, 0);
});

test('Phase C: request runtime is Basic-only while saved Pro configuration remains recoverable', () => {
    const source = fs.readFileSync(path.join(__dirname, '../handlers/subtitles.js'), 'utf8');
    assert.match(source, /const runtimeTrinityMode = 'basic';/);
    assert.match(source, /const isProTrinityMode = runtimeTrinityMode === 'pro';/);
    assert.match(source, /trinityMode: runtimeTrinityMode/);

    const saved = normalizeConfig({
        trinity: {
            mode: 'pro',
            preflight: { apiKey: 'saved-preflight', model: 'saved-preflight-model' },
            inspector: { apiKey: 'saved-inspector', model: 'saved-inspector-model' }
        }
    });
    assert.equal(saved.trinity.mode, 'pro');
    assert.equal(saved.trinity.preflight.apiKey, 'saved-preflight');
    assert.equal(saved.trinity.inspector.apiKey, 'saved-inspector');
});
