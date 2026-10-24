import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// addon tests run against a css-doodle checkout; point CSSD_SRC at its src/
const src = new URL(process.env.CSSD_SRC ? `file://${process.env.CSSD_SRC}/` : '../../css-doodle/src/', import.meta.url).href;

globalThis.HTMLElement ??= class {};
export const { CSSDoodle } = await import(src + 'component/index.js');
export const { default: Func } = await import(src + 'core/function.js');
export const { default: parseCss } = await import(src + 'parser/parse-css.js');
export const { default: parseGrid } = await import(src + 'parser/parse-grid.js');
export const { default: generateCss } = await import(src + 'generator/css.js');
globalThis.customElements = { whenDefined: async () => {}, get: () => CSSDoodle };

const dist = process.env.ADDONS == 'dist';

// registers an addon from src/, or from the built dist/ with ADDONS=dist
export async function load(name) {
    await import(dist ? `../dist/${name}.js` : `../src/${name}/index.js`);
    await new Promise(resolve => setTimeout(resolve));
}

// a test that reads GLSL as text, which the build squeezes, so it runs
// on src/ only; test/browser/dist.js compiles the dist/ shaders instead
export const glslTest = (name, fn) => test(name, { skip: dist && 'GLSL text is read from src/' }, fn);

// what an addon gave for fixed input and seed, kept in test/golden/, so a
// change to what shared doodles draw is never silent; GOLDEN=update writes
// them anew, for a new addon or a new major version
export function golden(name, outputs) {
    let file = new URL(`golden/${name}.json`, import.meta.url);
    if (process.env.GOLDEN == 'update') {
        fs.mkdirSync(new URL('golden/', import.meta.url), { recursive: true });
        let lines = Object.entries(outputs).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`);
        fs.writeFileSync(file, `{\n${lines.join(',\n')}\n}\n`);
    }
    assert.deepEqual(outputs, JSON.parse(fs.readFileSync(file, 'utf8')));
}
