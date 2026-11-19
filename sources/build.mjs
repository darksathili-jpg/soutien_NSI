import {build} from 'esbuild';
import {mkdir, copyFile} from 'node:fs/promises';
import {join} from 'node:path';

const assets = join(process.argv[2] || 'dist', 'assets');
await mkdir(join(assets, 'python'), {recursive: true});
const runtime = ['pyodide.js', 'pyodide.asm.js', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
const fonts = [
  ['@fontsource-variable/inter/files/inter-latin-wght-normal.woff2', 'inter.woff2'],
  ['@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2', 'bricolage.woff2'],
  ['@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2', 'plex-mono.woff2'],
];
await Promise.all([
  ...runtime.map(file => copyFile(join('node_modules/pyodide', file), join(assets, 'python', file))),
  ...fonts.map(([file, name]) => copyFile(join('node_modules', file), join(assets, name))),
]);
await build({
  entryPoints: ['src/app.js'],
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2020',
  outfile: join(assets, 'app.js'),
  legalComments: 'external'
});
