import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  outfile: 'main.js',
  platform: 'node',
  format: 'cjs',
  target: 'es2021',
  external: ['obsidian', '@codemirror/view', 'electron'],
  logLevel: 'info',
});
