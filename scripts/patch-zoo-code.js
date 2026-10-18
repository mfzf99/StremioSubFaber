#!/usr/bin/env node
'use strict';

/**
 * scripts/patch-zoo-code.js
 * ------------------------------------------------------------------
 * SubFaber Official Maintenance Script — Zoo Code Two-Mode Lock Patch
 * ------------------------------------------------------------------
 * Purpose:
 *   The Zoo Code VS Code extension ships with 5 built-in modes
 *   (architect, code, ask, debug, orchestrator). This repository
 *   operates under a CLOSED TWO-MODE UNIVERSE: `backend` and
 *   `frontend` ONLY (see .roo/rules/00-subfaber-core-protocol.md).
 *
 *   This script surgically replaces the built-in mode array in BOTH:
 *     1. Node.js Extension Host bundle:  dist/extension.js
 *        (variable `xV=[{slug:"architect",...}]`, double-quoted)
 *     2. React Webview UI bundle:        webview-ui/build/assets/index.js
 *        (variable `oa=[{slug:`architect`,...}]`, backtick-quoted)
 *
 *   The Webview copy is the one feeding the UI mode dropdown — patching
 *   only the host bundle leaves the dropdown showing legacy modes
 *   labelled "DO NOT USE. DEPRECATED.".
 *
 * Usage:
 *   node scripts/patch-zoo-code.js          (patches highest installed version)
 *   node scripts/patch-zoo-code.js --check (verify only, no write)
 *
 * Requirements: Node.js >= 18 (uses fs.readdirSync with `withFileTypes`).
 * Run AFTER "Owner restarts VS Code" for changes to take effect.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const CHECK_ONLY = process.argv.includes('--check');

/* ------------------------------------------------------------------ */
/* Configuration: target mode definitions                              */
/* ------------------------------------------------------------------ */

const MODES_HOST = [
	{ slug: 'backend', name: 'Backend', roleDefinition: 'Backend', groups: ['read', 'edit', 'command', 'mcp'] },
	{ slug: 'frontend', name: 'Frontend', roleDefinition: 'Frontend', groups: ['read', 'edit', 'command', 'mcp'] },
];

/** Serialize a mode array using double-quoted strings (host bundle style). */
function serializeHost(modes) {
	const objs = modes
		.map((m) => {
			const groups = m.groups.map((g) => `"${g}"`).join(',');
			return `{slug:"${m.slug}",name:"${m.name}",roleDefinition:"${m.roleDefinition}",groups:[${groups}]}`;
		})
		.join(',');
	return `[${objs}]`;
}

/** Serialize a mode array using backtick strings (webview bundle style). */
function serializeWebview(modes) {
	const objs = modes
		.map((m) => {
			const groups = m.groups.map((g) => `\`${g}\``).join(',');
			return `{slug:\`${m.slug}\`,name:\`${m.name}\`,roleDefinition:\`${m.roleDefinition}\`,groups:[${groups}]}`;
		})
		.join(',');
	return `[${objs}]`;
}

/* ------------------------------------------------------------------ */
/* Discovery: locate the active Zoo Code extension directory            */
/* ------------------------------------------------------------------ */

const LEGACY_SLUGS = ['architect', 'code', 'ask', 'debug', 'orchestrator'];

function findZooCodeDirs() {
	const base = path.join(os.homedir(), '.vscode', 'extensions');
	if (!fs.existsSync(base)) {
		return [];
	}
	return fs
		.readdirSync(base, { withFileTypes: true })
		.filter((e) => e.isDirectory() && /^zoocodeorganization\.zoo-code-[\d.]+$/.test(e.name))
		.map((e) => path.join(base, e.name))
		.sort(versionDesc);
}

function versionDesc(a, b) {
	const va = a.match(/([\d.]+)$/);
	const vb = b.match(/([\d.]+)$/);
	if (!va || !vb) return a.localeCompare(b);
	const pa = va[1].split('.').map(Number);
	const pb = vb[1].split('.').map(Number);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pb[i] || 0) - (pa[i] || 0);
		if (d !== 0) return d;
	}
	return 0;
}

/* ------------------------------------------------------------------ */
/* Bracket matching: string/template-literal aware array-end finder    */
/* ------------------------------------------------------------------ */

/**
 * Find the index of the closing `]` for the array literal that begins
 * at `arrStart`. Understands "..", '..' and `..` strings including
 * backslash escapes, so commas/backticks inside roleDefinition
 * template literals cannot cause a false match.
 */
function findArrayEnd(src, arrStart) {
	let i = arrStart;
	let depth = 0;
	while (i < src.length) {
		const c = src[i];
		if (c === '"' || c === "'" || c === '`') {
			const q = c;
			i++;
			while (i < src.length) {
				if (src[i] === '\\') {
					i += 2;
					continue;
				}
				if (src[i] === q) break;
				i++;
			}
			i++;
			continue;
		}
		if (c === '[') depth++;
		else if (c === ']') {
			depth--;
			if (depth === 0) return i;
		}
		i++;
	}
	return -1;
}

/* ------------------------------------------------------------------ */
/* Patch engine                                                        */
/* ------------------------------------------------------------------ */

/**
 * Patch one bundle file.
 * @param {string} file        absolute path to the bundle
 * @param {string} varName     array variable name prefix (e.g. "xV" / "oa")
 * @param {string} quote       quote character used by the bundle ("\""` or "`")
 * @param {string} replacement serialized replacement (starts with "=" omitted; full assignment built here)
 * @returns {object} status report
 */
function patchBundle(file, varName, quote, replacementBody) {
	const src = fs.readFileSync(file, 'utf8');
	const marker = `${varName}=[{slug:${quote}architect${quote}`;
	const start = src.indexOf(marker);

	// Already-patched fast path: detect our two-mode definition.
	const patchedMarker = `${varName}=[{slug:${quote}backend${quote}`;
	if (start < 0) {
		if (src.indexOf(patchedMarker) >= 0) {
			return { status: 'already-patched' };
		}
		return { status: 'marker-not-found' };
	}

	const arrStart = src.indexOf('[', start);
	if (arrStart !== start + varName.length + 1) {
		return { status: 'unexpected-layout', arrStart };
	}
	const end = findArrayEnd(src, arrStart);
	if (end < 0) {
		return { status: 'no-array-end' };
	}
	const segLen = end - arrStart + 1;
	const out = src.slice(0, arrStart) + replacementBody + src.slice(end + 1);

	if (!CHECK_ONLY) {
		const bak = `${file}.bak`;
		if (!fs.existsSync(bak)) {
			fs.copyFileSync(file, bak);
		}
		fs.writeFileSync(file, out, 'utf8');
	}
	return { status: 'patched', segLen, oldLen: src.length, newLen: out.length, after: out.slice(end + 1, end + 61) };
}

/** Run `node --check` on a file; returns true when syntax is valid. */
function syntaxOk(file) {
	try {
		execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
		return true;
	} catch (err) {
		return false;
	}
}

/** Scan a patched bundle for any residual legacy slug. */
function residualLegacySlugs(file) {
	const t = fs.readFileSync(file, 'utf8');
	const hits = [];
	for (const slug of LEGACY_SLUGS) {
		if (t.includes(`slug:"${slug}"`) || t.includes(`slug:\`${slug}\``)) {
			hits.push(slug);
		}
	}
	return hits;
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

function main() {
	const dirs = findZooCodeDirs();
	if (dirs.length === 0) {
		console.error('[patch-zoo-code] ERROR: No zoocodeorganization.zoo-code-* directory found under ~/.vscode/extensions.');
		process.exit(1);
	}
	const extDir = dirs[0];
	console.log(`[patch-zoo-code] Target extension dir: ${extDir}`);
	if (dirs.length > 1) {
		console.log(`[patch-zoo-code] NOTE: ${dirs.length} versions detected; patching the highest (${path.basename(extDir)}).`);
	}

	const targets = [
		{
			label: 'Extension Host (Node.js)',
			file: path.join(extDir, 'dist', 'extension.js'),
			varName: 'xV',
			quote: '"',
			body: `xV=${serializeHost(MODES_HOST)}`,
		},
		{
			label: 'Webview UI (React dropdown)',
			file: path.join(extDir, 'webview-ui', 'build', 'assets', 'index.js'),
			varName: 'oa',
			quote: '`',
			body: `oa=${serializeWebview(MODES_HOST)}`,
		},
	];

	let failures = 0;
	for (const t of targets) {
		console.log(`\n=== ${t.label}: ${t.file} ===`);
		if (!fs.existsSync(t.file)) {
			console.error('  ERROR: file not found.');
			failures++;
			continue;
		}
		const result = patchBundle(t.file, t.varName, t.quote, t.body);
		switch (result.status) {
			case 'already-patched':
				console.log('  Already patched (two-mode definition present). Skipping.');
				break;
			case 'marker-not-found':
				console.error('  ERROR: built-in mode array marker not found. Bundle layout may have changed in a new version — manual audit required.');
				failures++;
				break;
			case 'unexpected-layout':
				console.error(`  ERROR: unexpected layout at arrStart=${result.arrStart}. Manual audit required.`);
				failures++;
				break;
			case 'no-array-end':
				console.error('  ERROR: could not find array end via bracket matching. Manual audit required.');
				failures++;
				break;
			case 'patched':
				console.log(`  ${CHECK_ONLY ? '[DRY-RUN] Would patch' : 'Patched'}: segment ${result.segLen} chars, file ${result.oldLen} -> ${result.newLen} bytes.`);
				console.log(`  Post-seam snippet: ${JSON.stringify(result.after)}`);
				break;
			default:
				console.error('  ERROR: unknown status.');
				failures++;
		}
	}

	// Integrity verification (runs on live files; in --check mode it verifies current state).
	console.log('\n=== Integrity verification ===');
	for (const t of targets) {
		if (!fs.existsSync(t.file)) {
			failures++;
			continue;
		}
		const ok = syntaxOk(t.file);
		const residual = residualLegacySlugs(t.file);
		console.log(
			`  ${t.label}: node --check = ${ok ? 'PASS' : 'FAIL'}; residual legacy slugs = ${residual.length === 0 ? 'NONE' : residual.join(', ')}`
		);
		if (!ok || residual.length > 0) failures++;
	}

	console.log(`\n[patch-zoo-code] ${CHECK_ONLY ? 'Check' : 'Patch'} ${failures === 0 ? 'COMPLETE — all green.' : `FINISHED WITH ${failures} FAILURE(S).`}`);
	console.log('[patch-zoo-code] Reminder: fully restart VS Code (not just reload window) for both bundles to reload.');
	process.exit(failures === 0 ? 0 : 1);
}

main();
