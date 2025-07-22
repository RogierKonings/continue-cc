const esbuild = require('esbuild');
const path = require('path');

const production = process.argv.includes('--prod');
const watch = process.argv.includes('--watch');

const extensionConfig = {
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: !production,
  minify: production,
  treeShaking: true,
  metafile: true,
  logLevel: 'info',
};

const webviewConfig = {
  entryPoints: ['./src/webview/index.ts'],
  bundle: true,
  outdir: 'out/webview',
  format: 'esm',
  platform: 'browser',
  target: ['es2022', 'chrome110', 'firefox110'],
  sourcemap: !production,
  minify: production,
  treeShaking: true,
  splitting: true,
  metafile: true,
  logLevel: 'info',
};

async function build() {
  const contexts = [];

  try {
    // Build extension
    if (watch) {
      const ctx = await esbuild.context(extensionConfig);
      await ctx.watch();
      contexts.push(ctx);
      console.log('[extension] watching...');
    } else {
      const result = await esbuild.build(extensionConfig);
      if (result.metafile) {
        const analysis = await esbuild.analyzeMetafile(result.metafile);
        console.log('[extension] build analysis:', analysis);
      }
    }

    // Build webview (if webview directory exists)
    const fs = require('fs');
    if (fs.existsSync('./src/webview')) {
      if (watch) {
        const ctx = await esbuild.context(webviewConfig);
        await ctx.watch();
        contexts.push(ctx);
        console.log('[webview] watching...');
      } else {
        const result = await esbuild.build(webviewConfig);
        if (result.metafile) {
          const analysis = await esbuild.analyzeMetafile(result.metafile);
          console.log('[webview] build analysis:', analysis);
        }
      }
    }

    if (watch) {
      process.on('SIGINT', () => {
        contexts.forEach(ctx => ctx.dispose());
        process.exit(0);
      });
    }
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

build();