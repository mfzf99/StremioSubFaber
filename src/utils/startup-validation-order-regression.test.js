/**
 * Startup validation ordering regression (Mandat P1 F7, 2026-11-10)
 *
 * Defect F7 (audit A–Z): `app.listen(PORT)` is invoked at index.js ~9739
 * BEFORE `runStartupValidation()` completes at ~9822. The HTTP port starts
 * accepting external connections before the encryption key and storage path
 * are verified, and `process.exit(1)` can fire after requests were served.
 *
 * Acceptance: `await runStartupValidation()` (and its `process.exit(1)` on
 * critical failure) must execute BEFORE `app.listen(PORT)` in source order,
 * and the SessionManager readiness wait must not silently downgrade the same
 * fatal policy (no "Continuing startup anyway" on critical failure).
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'index.js'), 'utf8');

test('[F7-A] runStartupValidation executes BEFORE app.listen(PORT)', () => {
    const validationIdx = source.indexOf('await runStartupValidation()');
    const listenIdx = source.indexOf('app.listen(PORT');
    assert.ok(validationIdx !== -1, 'runStartupValidation call must exist');
    assert.ok(listenIdx !== -1, 'app.listen(PORT) call must exist');
    assert.ok(
        validationIdx < listenIdx,
        `validation must precede listen (validation@${validationIdx} should be < listen@${listenIdx})`
    );
});

test('[F7-B] Critical validation failure exits the process before the port opens', () => {
    const validationIdx = source.indexOf('await runStartupValidation()');
    const listenIdx = source.indexOf('app.listen(PORT');
    const exitIdx = source.indexOf('process.exit(1)', validationIdx);
    assert.ok(exitIdx !== -1, 'process.exit(1) on critical failure must exist');
    assert.ok(
        exitIdx < listenIdx,
        `process.exit(1) must be positioned before app.listen (exit@${exitIdx} should be < listen@${listenIdx})`
    );
});

test('[F7-C] SessionManager readiness failure does not silently downgrade the fatal startup policy', () => {
    // The old "Continuing startup anyway" downgrade for a critical subsystem
    // must not survive in the startup path.
    assert.ok(
        !source.includes('[Startup] Continuing startup anyway'),
        'no "Continuing startup anyway" downgrade is allowed in the startup path'
    );
});
