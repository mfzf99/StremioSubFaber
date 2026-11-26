// Minimal ESLint v10 flat config — audit scope only:
//   1. Syntax errors (reported by the parser as fatal errors)
//   2. Unused variables (core rule, no plugins required)
//   3. Undefined references (`no-undef`, locked to 'error' in v3.41.3)
// Scratch/temp artifacts are ignored so they don't drown out real findings.
//
// [v3.41.3 — KUNCI no-undef] Sebab `no-undef` dikunci:
//   Dua defek ReferenceError sebenar terlepas daripada gate statik dalam
//   kitaran v3.41.1 (`badge` dalam renderRegistryPage; `translationGen` lintas
//   fungsi) dan satu lagi ditemui oleh audit ini (`geminiAuthFailureCacheKey`
//   const-try→catch). Ketiga-tiganya tidak kelihatan pada `node --check`.
//   `no-unused-vars` sahaja tidak dapat mengesannya.
//
// Globals diisytiharkan secara EKSPLISIT daripada senarai simbol yang
// diperhatikan dalam audit (bukan andaian). `globals` npm TIDAK digunakan —
// tiada kebergantungan baharu (invarian SSOT).
//
// SKOP: kod aktif = index.js + src/** + public/** (sama seperti yang diuji
// `npm test`). Snapshot sandaran di bawah plans/ TIDAK dimuatkan oleh apa
// jua laluan aktif, jadi ia diabaikan secara eksplisit (lihat ignores).

// Satu global yang TIDAK diisytihar di sini ialah `test`/`describe`/`it`:
// fail ujian mengimportnya secara eksplisit daripada `node:test`, jadi
// mengisytiharnya sebagai global akan menyembunyikan import yang hilang.
const NODE_GLOBALS = {
    // Core
    process: 'readonly',
    Buffer: 'readonly',
    console: 'readonly',
    global: 'readonly',
    globalThis: 'readonly',
    // Timers
    setTimeout: 'readonly',
    clearTimeout: 'readonly',
    setInterval: 'readonly',
    clearInterval: 'readonly',
    setImmediate: 'readonly',
    clearImmediate: 'readonly',
    queueMicrotask: 'readonly',
    // Module (CommonJS)
    require: 'readonly',
    module: 'readonly',
    exports: 'readonly',
    __dirname: 'readonly',
    __filename: 'readonly',
    // Web platform APIs that exist in Node >= 18
    fetch: 'readonly',
    URL: 'readonly',
    URLSearchParams: 'readonly',
    AbortController: 'readonly',
    Blob: 'readonly',
    Response: 'readonly',
    Request: 'readonly',
    Headers: 'readonly',
    FormData: 'readonly',
    TextDecoder: 'readonly',
    TextEncoder: 'readonly',
    structuredClone: 'readonly',
    crypto: 'readonly',
    performance: 'readonly',
    atob: 'readonly',
    btoa: 'readonly',
    ReadableStream: 'readonly',
    WritableStream: 'readonly',
    TransformStream: 'readonly'
};

const BROWSER_GLOBALS = {
    // Window / DOM
    window: 'readonly',
    document: 'readonly',
    navigator: 'readonly',
    location: 'readonly',
    history: 'readonly',
    self: 'readonly',
    localStorage: 'readonly',
    sessionStorage: 'readonly',
    caches: 'readonly',
    requestAnimationFrame: 'readonly',
    cancelAnimationFrame: 'readonly',
    // DOM constructors / events
    Event: 'readonly',
    CustomEvent: 'readonly',
    EventSource: 'readonly',
    MutationObserver: 'readonly',
    HTMLSelectElement: 'readonly',
    HTMLElement: 'readonly',
    Node: 'readonly',
    // App-level globals defined by the page bootstrap (public/js/*.js).
    // Setiap satu diisytihar sebagai global tersirat pada runtime:
    PAGE: 'readonly',
    BOOTSTRAP: 'readonly',
    tt: 'readonly',
    // `window.closeInstructionsModal = function` (public/config.js) pada
    // peringkat atas skrip klasik — tugasan sifat pada objek global.
    closeInstructionsModal: 'readonly',
    // `window.closeSubToolboxModal = function` (public/config.js), sama.
    closeSubToolboxModal: 'readonly',
    // Tiga global halaman untuk tontonan tukar episod (auto-subs page).
    // autoSubsRuntime() dibenamkan sebagai teks dalam skrip halaman yang sama
    // dan dijalankan di dalamnya, jadi ketiga-tiga nama ini wujud pada masa
    // panggilan (8974-8988):
    //  - initStreamWatcher: `window.initStreamWatcher = ...` (src/utils/quickNav.js),
    //    dibenamkan oleh quickNavScript() lebih awal dalam skrip yang sama.
    //  - handleStreamUpdate / forwardMenuNotification: pengisytiharan fungsi
    //    di peringkat atas skrip; diangkat (hoisted), jadi sudah wujud walaupun
    //    teksnya muncul selepas panggilan autoSubsRuntime().
    initStreamWatcher: 'readonly',
    handleStreamUpdate: 'readonly',
    forwardMenuNotification: 'readonly',
    // [v3.41.3 — D1] Peleraian redirect untuk halaman auto-subs. Dibekalkan
    // oleh streamUrlRedirectResolverClientScript() (src/utils/streamUrlIdentity.js)
    // dan dibenamkan dalam skrip halaman SEBELUM autoSubsRuntime() dijalankan
    // (toolboxPageGenerator.js, `${streamUrlRedirectResolverClientScript()}`),
    // jadi nama ini wujud pada masa panggilan di 6981.
    resolveStreamUrlRedirect: 'readonly'
};

export default [
    {
        ignores: [
            'node_modules/**',
            '.git/**',
            '.tmp-*.js',
            '.playwright-mcp/**',
            'dist/**',
            'build/**',
            'keys/**',
            'data/**',
            'tmp/**',
            '.tmp/**',
            'temp/**',
            '.cache/**',
            'native/**',
            'SubFaber xSync/**',
            'nSync/**',
            'scripts/**',
            // [v3.41.2] Snapshot sandaran — bukan kod aktif (tidak dimuatkan
            // oleh index.js atau apa jua require()). Diabaikan supaya gate
            // mengukur kod yang BENAR-BENAR berjalan.
            'plans/redesign-backup/**',
            'plans/prompt-refactor-backup/**'
        ]
    },
    {
        files: ['**/*.js', '**/*.cjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: NODE_GLOBALS
        },
        rules: {
            'no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
            ],
            'no-undef': 'error'
        }
    },
    {
        // Kod sisi-pelayar: TAMBAH globals pelayar di atas globals Node.
        // Tiga lokasi sahaja, ketiganya dijalankan dalam pelayar:
        //   1. public/** — aset statik pelayar.
        //   2. src/utils/*PageGenerator.js — fungsi yang DIBENAMKAN sebagai
        //      teks ke dalam HTML melalui `.toString()` (cth. autoSubsRuntime),
        //      jadi rujukan DOM di dalamnya ialah globals pelayar yang sah.
        //   3. src/utils/streamUrlIdentity.js — dua fungsi kod pelayar kendiri
        //      (selectStreamFilename, resolveStreamUrlRedirect) yang punca
        //      kodnya DIBENAMKAN ke dalam skrip halaman dengan `.toString()`,
        //      jadi rujukan `window` di dalamnya hanya berjalan dalam pelayar.
        // Amaran: ini juga terpakai pada kod Node biasa dalam fail yang sama;
        // mana-mana global pelayar di sini mesti BENAR-BENAR wujud dalam skrip
        // yang dibenamkan — jangan tambah nama untuk membungkam ralat.
        files: ['public/**/*.js', 'src/utils/*PageGenerator.js', 'src/utils/streamUrlIdentity.js'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs',
            globals: { ...NODE_GLOBALS, ...BROWSER_GLOBALS }
        },
        rules: {
            'no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
            ],
            'no-undef': 'error'
        }
    },
    {
        files: ['**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: NODE_GLOBALS
        },
        rules: {
            'no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
            ],
            'no-undef': 'error'
        }
    }
];
