// Builds the injectable bundle:
//   dist/vinted-bundle-search.user.js  -> userscript for desktop browsers (Violentmonkey/Tampermonkey)
//   dist/vbs.js                         -> same code without header, injected by the Android WebView
// `--dev` rebuilds on change and serves dist/ on http://localhost:8642: dev page with a fake
// Vinted API (index.html), the userscript (Violentmonkey can track local changes), core probe.
import * as esbuild from 'esbuild';
import { copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const dev = process.argv.includes('--dev');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const repo = 'https://github.com/gmonet/vinted_bundle_search';

const header = `// ==UserScript==
// @name         Bundle Search for Vinted
// @namespace    ${repo}
// @version      ${pkg.version}
// @description  ${pkg.description}
// @author       gmonet
// @license      ${pkg.license}
// @match        https://www.vinted.fr/*
// @match        https://www.vinted.be/*
// @match        https://www.vinted.lu/*
// @match        https://www.vinted.es/*
// @match        https://www.vinted.it/*
// @match        https://www.vinted.de/*
// @match        https://www.vinted.nl/*
// @match        https://www.vinted.co.uk/*
// @grant        none
// @run-at       document-idle
// @homepageURL  ${repo}
// @downloadURL  ${repo}/releases/latest/download/vinted-bundle-search.user.js
// @updateURL    ${repo}/releases/latest/download/vinted-bundle-search.user.js
// ==/UserScript==
`;

mkdirSync('dist', { recursive: true });

/** @type {esbuild.BuildOptions} */
const options = {
  entryPoints: ['src/main.tsx'],
  // In-memory output (write: false); the plugin below writes the real files.
  outfile: 'dist/.esbuild.js',
  bundle: true,
  format: 'iife',
  target: ['es2020', 'chrome80'],
  jsx: 'automatic',
  jsxImportSource: 'preact',
  loader: { '.css': 'text' },
  define: { __VERSION__: JSON.stringify(pkg.version + (dev ? '-dev' : '')) },
  // Readable output: easier to audit (and F-Droid friendly); the bundle stays small anyway.
  minify: false,
  legalComments: 'none',
  write: false,
  logLevel: 'info',
  plugins: [
    {
      name: 'write-outputs',
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length || !result.outputFiles) return;
          const code = result.outputFiles[0].text;
          writeFileSync('dist/vbs.js', code);
          writeFileSync('dist/vinted-bundle-search.user.js', header + code);
          console.log(`[build] dist/ written (${(code.length / 1024).toFixed(0)} KiB)`);
        });
      },
    },
  ],
};

if (dev) {
  // Dev page with a fake Vinted API, plus the core-only probe used to test against real Vinted.
  copyFileSync('dev/index.html', 'dist/index.html');
  const devCtx = await esbuild.context({
    entryPoints: { 'dev-mock': 'dev/mock-api.ts', 'core-probe': 'dev/core-probe.ts' },
    outdir: 'dist',
    bundle: true,
    format: 'iife',
    target: ['es2020'],
    logLevel: 'warning',
  });
  await devCtx.watch();
  const ctx = await esbuild.context(options);
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: 'dist', port: 8642 });
  console.log(`[dev] http://localhost:${port}/vinted-bundle-search.user.js`);
} else {
  await esbuild.build(options);
}
