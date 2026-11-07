const test = require('node:test');
const assert = require('node:assert/strict');

const {
    generateSubToolboxPage,
    generateEmbeddedSubtitlePage,
    generateAutoSubtitlePage
} = require('./toolboxPageGenerator');
const { generateSubtitleSyncPage } = require('./syncPageGenerator');
const { generateFileTranslationPage } = require('./fileUploadPageGenerator');

const EXTENSION_MESSAGE_TYPES = [
    'PING',
    'PONG',
    'DEBUG_LOG',
    'EMBEDDED_RESET',
    'EXTRACT_REQUEST',
    'EXTRACT_PROGRESS',
    'EXTRACT_RESPONSE',
    'SYNC_REQUEST',
    'SYNC_PROGRESS',
    'SYNC_RESPONSE',
    'SYNC_TRACKS',
    'SYNC_SELECT_TRACK',
    'AUTOSUB_REQUEST',
    'AUTOSUB_PROGRESS',
    'AUTOSUB_RESPONSE',
    'AUTOSUB_TRACKS',
    'AUTOSUB_SELECT_TRACK'
];

function assertInstalledExtensionProtocol(html, pageName) {
    for (const suffix of EXTENSION_MESSAGE_TYPES) {
        assert.doesNotMatch(
            html,
            new RegExp(`['"]SUBFABER_${suffix}['"]`),
            `${pageName} must use the installed xSync extension's SUBMAKER_${suffix} protocol`
        );
    }
}

test('Sub Toolbox communicates with the installed extension using SUBMAKER_PING and SUBMAKER_PONG', () => {
    const html = generateSubToolboxPage('test-config', 'tt14819828:1:1', 'Business Proposal S01E01.mkv', {
        uiLanguage: 'en',
        sourceLanguages: ['eng'],
        targetLanguages: ['msa'],
        providers: {}
    });

    assertInstalledExtensionProtocol(html, 'Sub Toolbox');
    assert.match(html, /type: 'SUBMAKER_PING', source: 'webpage'/);
    assert.match(html, /msg\.type (?:===|!==) 'SUBMAKER_PONG'/);
});

test('Embedded extractor preserves the installed extension request, progress, response, and reset protocol', async () => {
    const html = await generateEmbeddedSubtitlePage('test-config', 'tt14819828:1:1', 'Business Proposal S01E01.mkv', {
        uiLanguage: 'en',
        sourceLanguages: ['eng'],
        targetLanguages: ['msa'],
        providers: {}
    });

    assertInstalledExtensionProtocol(html, 'Embedded extractor');
    for (const suffix of [
        'PING',
        'PONG',
        'DEBUG_LOG',
        'EMBEDDED_RESET',
        'EXTRACT_REQUEST',
        'EXTRACT_PROGRESS',
        'EXTRACT_RESPONSE'
    ]) {
        assert.match(html, new RegExp(`['"]SUBMAKER_${suffix}['"]`), `Missing SUBMAKER_${suffix}`);
    }
});

test('Sync Studio and automatic subtitles retain the installed extension protocol', async () => {
    const config = {
        uiLanguage: 'en',
        sourceLanguages: ['eng'],
        targetLanguages: ['msa'],
        providers: {}
    };
    const [syncHtml, autoHtml] = await Promise.all([
        generateSubtitleSyncPage([], 'tt14819828:1:1', 'Business Proposal S01E01.mkv', 'test-config', config),
        generateAutoSubtitlePage('test-config', 'tt14819828:1:1', 'Business Proposal S01E01.mkv', config)
    ]);

    assertInstalledExtensionProtocol(syncHtml, 'Sync Studio');
    assertInstalledExtensionProtocol(autoHtml, 'Automatic subtitles');
    for (const suffix of ['PING', 'PONG', 'SYNC_REQUEST', 'SYNC_PROGRESS', 'SYNC_RESPONSE', 'SYNC_TRACKS']) {
        assert.match(syncHtml, new RegExp(`['"]SUBMAKER_${suffix}['"]`), `Missing SUBMAKER_${suffix}`);
    }
    for (const suffix of [
        'PING',
        'PONG',
        'AUTOSUB_REQUEST',
        'AUTOSUB_PROGRESS',
        'AUTOSUB_RESPONSE',
        'AUTOSUB_TRACKS',
        'AUTOSUB_SELECT_TRACK'
    ]) {
        assert.match(autoHtml, new RegExp(`['"]SUBMAKER_${suffix}['"]`), `Missing SUBMAKER_${suffix}`);
    }
});

test('File translation page does not emit an extension ping that the installed extension ignores', () => {
    const html = generateFileTranslationPage(
        'tt14819828:1:1',
        'test-config',
        {
            uiLanguage: 'en',
            sourceLanguages: ['eng'],
            targetLanguages: ['msa'],
            providers: {}
        },
        'Business Proposal S01E01.mkv'
    );

    assertInstalledExtensionProtocol(html, 'File translation');
    assert.match(html, /type: 'SUBMAKER_PING', source: 'webpage'/);
    assert.match(html, /msg\.type (?:===|!==) 'SUBMAKER_PONG'/);
});
