/**
 * subfaber-fasah-regression.test.js — [FASA H: SYSTEM-USER SPLIT 2026-10-07]
 *
 * Regresi kontrak varian G1 Fasa G (integrasi produksi): prompt Pre-Flight
 * kini bersempadan SUBFABER_PROMPT_BOUNDARY — arahan STATIK dihantar sebagai
 * saluran system, input DINAMIK (<text> SRT) sebagai saluran user.
 *
 * Ground truth empirikal (9 panggilan kimi-k3, SRT sebenar, Fasa G):
 *   - terms Jaccard 0.47 → 0.72
 *   - null-rate spread 20pt → 7pt (sasaran ≤10pt DICAPAI)
 *   - pollution 0 / type 100% / chars J 0.90 kekal
 *
 * Kontrak yang dikunci ujian ini:
 *   1. buildPreflightPrompt membawa sempadan; split menghasilkan system
 *      bersih (tanpa dialog) + user bersih (tanpa arahan statik).
 *   2. AgentBInspector.buildUserPrompt melakukan split untuk prompt
 *      bersempadan (Pre-Flight) dan memelihara laluan lama (inspection).
 *   3. buildChatRequest (universalPayload) membina messages [system, user]
 *      bila meta.systemPrompt tidak kosong — dan [user] tunggal tanpanya.
 */

const test = require('node:test');
const assert = require('node:assert');

const { buildPreflightPrompt, buildPreflightRawText, sampleEntriesForPreflight } = require('./subfaberPreflight');
const { AgentBInspector } = require('./agentBInspector');
const OpenAICompatibleProvider = require('./providers/openaiCompatible');
const { SUBFABER_PROMPT_BOUNDARY, splitStructuredPrompt } = require('./utils/structuredPrompt');

// ── 1. buildPreflightPrompt: sempadan + split bersih ──
test('FASA H: buildPreflightPrompt carries SUBFABER_PROMPT_BOUNDARY (system/user split)', () => {
    const prompt = buildPreflightPrompt('Dialogue line alpha.\nDialogue line beta.', 'Malay', 'English');
    assert.ok(prompt.includes(SUBFABER_PROMPT_BOUNDARY), 'boundary sentinel must be present');

    const parts = splitStructuredPrompt(prompt);
    assert.ok(parts, 'prompt must split into { system, user }');

    // System: arahan statik penuh — Role → Task → INPUT FORMAT → schema → FINAL CHECK.
    assert.ok(parts.system.includes('## Role'), 'system carries Role');
    assert.ok(parts.system.includes('DECISION DISCIPLINE'), 'system carries DECISION DISCIPLINE');
    assert.ok(parts.system.includes('FACT VS INFERENCE DISCIPLINE'), 'system carries FACT VS INFERENCE');
    assert.ok(parts.system.includes('## Task'), 'system carries Task');
    assert.ok(
        parts.system.includes('## INPUT FORMAT'),
        'system carries INPUT FORMAT (dialogue arrives in next message)'
    );
    assert.ok(parts.system.includes('## Output in only JSON format'), 'system carries output schema');
    assert.ok(parts.system.includes('## FINAL CHECK'), 'system carries FINAL CHECK');
    // Nota INPUT FORMAT memang menyebut "<text></text>" sebagai penerangan inline —
    // yang dilarang ialah BLOK dialog sebenar (pembuka + kandungan), bukan sebutan tag.
    assert.ok(!parts.system.includes('<text>\n'), 'system must NOT carry the dialogue <text> block');
    assert.ok(!parts.system.includes('Dialogue line alpha'), 'system must NOT carry dialogue content');
    assert.ok(!parts.system.includes(SUBFABER_PROMPT_BOUNDARY), 'sentinel must not survive in system');

    // User: input dinamik sahaja + arahan guna tugas.
    assert.ok(parts.user.startsWith('<text>'), 'user starts with <text> wrapper');
    assert.ok(parts.user.includes('Dialogue line alpha'), 'user carries the dialogue');
    assert.ok(parts.user.includes('</text>'), 'user closes the <text> wrapper');
    assert.ok(
        parts.user.includes('Apply the tasks above to this subtitle dialogue'),
        'user carries the apply-tasks instruction'
    );
    assert.ok(!parts.user.includes('## Role'), 'user must NOT carry static Role');
    assert.ok(!parts.user.includes('DECISION DISCIPLINE'), 'user must NOT carry static discipline');
    assert.ok(!parts.user.includes(SUBFABER_PROMPT_BOUNDARY), 'sentinel must not survive in user');
});

test('FASA H: prompt lama tanpa sempadan tidak dipecah (backward-compat)', () => {
    const parts = splitStructuredPrompt('Just a legacy custom prompt.');
    assert.equal(parts, null, 'unstructured prompt returns null (legacy path intact)');
});

// ── 2. AgentBInspector.buildUserPrompt: split untuk preflight, legacy untuk inspection ──
function makeInspector() {
    return new AgentBInspector({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'deepseek-v4-pro'
    });
}

test('FASA H: AgentBInspector.buildUserPrompt splits structured preflight prompt', () => {
    const inspector = makeInspector();
    const preflightPrompt = `STATIC INSTRUCTIONS BLOCK\n${SUBFABER_PROMPT_BOUNDARY}\n<text>\nDialogue.\n</text>\nApply the tasks above.`;
    const data = inspector.buildUserPrompt('unused', 'Malay', preflightPrompt);

    assert.equal(data.systemPrompt, 'STATIC INSTRUCTIONS BLOCK', 'systemPrompt carries the static half');
    assert.equal(
        data.userPrompt,
        '<text>\nDialogue.\n</text>\nApply the tasks above.',
        'userPrompt carries the dynamic half'
    );
    assert.equal(data.isSelfContained, true, 'self-contained contract preserved');
});

test('FASA H: AgentBInspector.buildUserPrompt keeps legacy single-message path for inspection prompts', () => {
    const inspector = makeInspector();
    const inspectionPayload = 'INSPECTOR_INSTRUCTION verbatim — no boundary here';
    const data = inspector.buildUserPrompt('unused', 'Malay', inspectionPayload);

    assert.equal(data.systemPrompt, '', 'inspection path: no system channel');
    assert.equal(data.userPrompt, inspectionPayload, 'inspection path: single user message verbatim');
});

// ── 3. buildChatRequest: messages [system, user] bila meta.systemPrompt wujud ──
function makeUniversalProvider() {
    return new OpenAICompatibleProvider({
        apiKey: 'k',
        baseUrl: 'https://x.example/v1',
        model: 'kimi-k3',
        providerName: 'custom',
        universalPayload: true
    });
}

test('FASA H: universal buildChatRequest builds [system, user] when meta.systemPrompt present', () => {
    const provider = makeUniversalProvider();
    const { body } = provider.buildChatRequest('dynamic user content', true, {
        systemPrompt: 'STATIC SYSTEM CHANNEL'
    });

    assert.ok(Array.isArray(body.messages), 'messages array');
    assert.equal(body.messages.length, 2, 'system + user');
    assert.equal(body.messages[0].role, 'system', 'first message is system');
    assert.equal(body.messages[0].content, 'STATIC SYSTEM CHANNEL', 'system content verbatim');
    assert.equal(body.messages[1].role, 'user', 'second message is user');
    assert.equal(body.messages[1].content, 'dynamic user content', 'user content verbatim');

    // Muatan 4-kunci god-tier kekal suci — tiada kunci lain ditambah.
    assert.equal(body.stream, true, 'stream:true preserved (Caddy 300s)');
    assert.equal(body.temperature, 0.0, 'temperature 0.0 preserved (deterministik)');
    assert.equal('max_tokens' in body, false, 'no max_tokens (god-tier)');
    assert.equal('reasoning_effort' in body, false, 'no reasoning_effort (overthinking trigger)');
});

test('FASA H: universal buildChatRequest keeps single user message without meta.systemPrompt', () => {
    const provider = makeUniversalProvider();
    const { body } = provider.buildChatRequest('plain prompt', true, {});

    assert.equal(body.messages.length, 1, 'single message');
    assert.equal(body.messages[0].role, 'user', 'user role');
    assert.equal(body.messages[0].content, 'plain prompt', 'content verbatim');
});

test('FASA H: end-to-end preflight payload — split → buildChatRequest messages', () => {
    // Simulasi penuh laluan runtime Fasa 0: prompt produksi → Agent B
    // buildUserPrompt → buildChatRequest(universalPayload).
    const entries = Array.from({ length: 12 }, (_, i) => ({
        id: i + 1,
        timecode: '00:00:01,000 --> 00:00:02,000',
        text: `Dialogue sample number ${i + 1} for the pre-flight pass.`
    }));
    const rawText = buildPreflightRawText(sampleEntriesForPreflight(entries));
    const prompt = buildPreflightPrompt(rawText, 'Malay', 'detected');

    const inspector = makeInspector();
    const promptData = inspector.buildUserPrompt(rawText, 'Malay', prompt);
    const provider = makeUniversalProvider();
    const { body } = provider.buildChatRequest(promptData.userPrompt, true, {
        systemPrompt: promptData.systemPrompt
    });

    assert.equal(body.messages.length, 2, 'system + user channels');
    assert.equal(body.messages[0].role, 'system', 'system channel first');
    assert.ok(body.messages[0].content.includes('## Role'), 'system carries the static instructions');
    assert.ok(!body.messages[0].content.includes('Dialogue sample number'), 'system carries no dialogue');
    assert.equal(body.messages[1].role, 'user', 'user channel second');
    assert.ok(body.messages[1].content.includes('<text>'), 'user wraps dialogue in <text>');
    assert.ok(body.messages[1].content.includes('Dialogue sample number 12'), 'user carries dialogue');
    assert.ok(!body.messages[1].content.includes('DECISION DISCIPLINE'), 'user carries no static instructions');
});
