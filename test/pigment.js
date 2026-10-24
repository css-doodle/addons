import test from 'node:test';
import assert from 'node:assert/strict';
import { load, parseCss, parseGrid, generateCss, golden } from './core.js';

await load('pigment');

const host = {
    getRgbaColor: value => value == 'transparent' ? [0, 0, 0, 0]
        : /^#[\da-f]{6}$/.test(value) ? [1, 3, 5].map(i => parseInt(value.slice(i, i + 2), 16) / 255).concat(1) : null,
};
const pigment = args => {
    let { styles, warnings } = generateCss(parseCss(`--c: @pigment(${args});`), parseGrid('1'), 1, 64, null, [], '', host);
    return { value: styles.cells.match(/--c:([^;]*);/)?.[1] ?? '', warnings: warnings.map(w => w.message) };
};

test('blue and yellow paint make green, the same as spectral.js', () => {
    assert.deepEqual(pigment('#002185, #fcd200'), { value: 'rgb(61 147 62)', warnings: [] });
});

test('percentages work like color-mix(): either side of the color, the rest shared, scaled to 100%', () => {
    let { value } = pigment('#ff0000 30%, #0000ff');
    assert.match(value, /^rgb\(\d+ \d+ \d+\)$/);
    for (let args of ['#0000ff 70%, #ff0000', '30% #ff0000, #0000ff 70%', '#ff0000 60%, #0000ff 140%']) {
        assert.equal(pigment(args).value, value, args);
    }
    assert.notEqual(pigment('#ff0000, #0000ff').value, value);
});

test('transparent paint thins the color instead of darkening it', () => {
    let red = pigment('#ff0000').value;
    assert.equal(pigment('#ff0000, transparent').value, red.replace(')', ' / 0.5)'));
});

test('a color that does not parse warns and gives nothing', () => {
    assert.deepEqual(pigment('nope, #ffffff'), { value: '', warnings: ['invalid color nope'] });
});

test('draws what it drew before', () => golden('pigment', Object.fromEntries(
    ['#002185, #fcd200', '#ff0000 30%, #ffffff', '#002185, #fcd200 20%, #e63946', '#1d3557 60%, transparent']
        .map(args => [args, pigment(args).value]),
)));
