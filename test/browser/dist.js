// The build squeezes the GLSL of shader addons, which the node tests read
// only as text from src/, so Chrome draws each of their README examples
// from dist/ here; a shader that does not compile warns.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const SHADERS = ['gradient-2d', 'marble'];

const core = process.env.CSSD_SRC ? `file://${process.env.CSSD_SRC}/../` : new URL('../../../css-doodle/', import.meta.url).href;
const { launch, mount, settle, decode, painted } = await import(core + 'test/browser/chrome.js');

let chrome;
before(async () => chrome = await launch());
after(() => chrome?.close());

for (let name of SHADERS) {
    let readme = fs.readFileSync(new URL(`../../src/${name}/README.md`, import.meta.url), 'utf8');
    let examples = [...readme.matchAll(/^background: (@.+);$/gm)].map(m => m[1]);
    test(`dist/${name}.js draws its README examples in Chrome`, () => chrome.withPage(async page => {
        assert.ok(examples.length);
        await page.addScriptTag({ path: new URL(`../../dist/${name}.js`, import.meta.url).pathname });
        for (let example of examples) {
            let el = await mount(page, `@grid: 1 / 120px; background: ${example};`);
            let { png } = await settle(page, el);
            assert.deepEqual(await el.evaluate(el => el.warnings), [], example);
            assert.ok(painted(await decode(page, png)) > 1000, example);
            await el.evaluate(el => el.remove());
        }
    }));
}
