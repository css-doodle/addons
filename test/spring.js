import test from 'node:test';
import assert from 'node:assert/strict';
import { load, parseCss, parseGrid, generateCss, golden } from './core.js';

await load('spring');

const easing = args => {
    let { styles } = generateCss(parseCss(`--v: @spring(${args});`), parseGrid('1'), 1, 64);
    let text = styles.cells.match(/--v:linear\(([^)]*)\);/)[1];
    return text.split(', ').map(Number);
};

test('@spring() is a linear() easing from 0 to 1', () => {
    for (let bounce of ['0', '.3', '.8', '']) {
        let stops = easing(bounce);
        assert.equal(stops[0], 0);
        assert.equal(stops.at(-1), 1);
    }
    assert.deepEqual(easing(''), easing('.3'));
});

test('@spring(0) never overshoots, a bouncy one does', () => {
    let calm = easing('0');
    assert.ok(calm.every((v, i) => v <= 1 && (i == 0 || v >= calm[i - 1])));
    assert.ok(Math.max(...easing('.6')) > 1.1);
});

test('a grid works the spring out once, not in every cell', () => {
    let exp = Math.exp, calls = 0;
    Math.exp = x => (calls++, exp(x));
    try {
        generateCss(parseCss('--v: @spring(.45);'), parseGrid('20'), 1, 64);
    } finally {
        Math.exp = exp;
    }
    // one solve samples the spring 10000 times
    assert.ok(calls < 20000, `${calls} calls`);
});

test('draws what it drew before', () => golden('spring', Object.fromEntries(
    ['', '0', '.3', '.8'].map(bounce => [bounce, easing(bounce).join(', ')]),
)));
