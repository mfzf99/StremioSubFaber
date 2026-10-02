// Minimal ESLint v10 flat config — audit scope only:
//   1. Syntax errors (reported by the parser as fatal errors)
//   2. Unused variables (core rule, no plugins required)
// Scratch/temp artifacts are ignored so they don't drown out real findings.
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
            'SubMaker xSync/**',
            'nSync/**',
            'scripts/**'
        ]
    },
    {
        files: ['**/*.js', '**/*.cjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'commonjs'
        },
        rules: {
            'no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
            ]
        }
    },
    {
        files: ['**/*.mjs'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module'
        },
        rules: {
            'no-unused-vars': [
                'warn',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
            ]
        }
    }
];
