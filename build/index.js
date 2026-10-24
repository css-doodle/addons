import fs from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import * as esbuild from 'esbuild';
import swc from '@swc/core';
import packageInfo from '../package.json' with { type: 'json' };
import { TAG_RE, stripTaggedTemplates } from './tagged-template.js';

const collapseTaggedTemplates = {
    name: 'collapse-tagged-templates',
    setup(build) {
        build.onLoad({ filter: /\.js$/ }, async (args) => {
            const source = await fs.readFile(args.path, 'utf8');
            if (!TAG_RE.test(source)) return null;
            return { contents: stripTaggedTemplates(source), loader: 'js' };
        });
    },
};

const root = join(import.meta.dirname, '..');
const src = join(root, 'src');
const dist = join(root, 'dist');

async function minify(entry) {
    const { outputFiles } = await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        platform: 'browser',
        minify: true,
        plugins: [collapseTaggedTemplates],
    });

    const { code } = await swc.minify(outputFiles[0].text, {
        ecma: 2020,
        module: false,
        compress: {
            passes: 3,
            ecma: 2020,
            pure_getters: true,
            unsafe_proto: true,
            unsafe_arrows: true
        },
        mangle: true,
        format: {
            asciiOnly: true,
        },
    });

        return code.replace(/\n/g, '\\n');
}

// dist/ is what gets published, so dist/gradient-2d.js is served as addons@1/gradient-2d.js
await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist);

for (const dir of await fs.readdir(src, { withFileTypes: true })) {
    const file = join(src, dir.name, 'index.js');
    if (!dir.isDirectory() || !(await fs.stat(file).catch(() => null))) continue;
    const code = await minify(file);
    const notice = (await fs.readFile(file, 'utf8')).match(/^\/\*![^]*?\*\/\n/)?.[0] ?? '';
    const text = `/*! css-doodle addon ${dir.name} v${packageInfo.version} MIT licensed */\n${notice}${code}`;
    await fs.writeFile(join(dist, `${dir.name}.js`), text, 'utf8');
    console.log(`dist/${dir.name}.js - ${readableSize(text)}`);
}

const { private: _, scripts, devDependencies, ...published } = packageInfo;
published.exports = { './*': './*.js' };
await fs.writeFile(join(dist, 'package.json'), JSON.stringify(published, null, 2) + '\n', 'utf8');
for (const name of ['README.md', 'LICENSE']) {
    await fs.copyFile(join(root, name), join(dist, name));
}

function readableSize(text) {
    const kb = n => `${(n / 1024).toFixed(1)} KB`;
    return `${kb(Buffer.byteLength(text))} (${kb(gzipSync(text).length)} gzipped)`;
}
