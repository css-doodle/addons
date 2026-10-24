import test from 'node:test';
import assert from 'node:assert/strict';
import { load, parseCss, parseGrid, generateCss, golden } from './core.js';

await load('maze');

const draw = (seed, X = 7, Y = 5) =>
    generateCss(parseCss(`@grid: ${X}x${Y}; background: @maze(2px, #000), #fff;`), parseGrid('1'), seed, 64).styles.cells;

function walls(cells) {
    let found = {};
    for (let [, selectors, value] of cells.matchAll(/([^}{]+) \{background:([^;]*);/g)) {
        let sides = new Set([...value.matchAll(/\) ([a-z ]+?) \//g)].map(m => m[1]));
        for (let [, x, y] of selectors.matchAll(/#c-(\d+)-(\d+)-1/g)) found[x + ',' + y] = sides;
    }
    return found;
}

test('@maze() draws a perfect maze: every cell reached, by one path only', () => {
    let X = 7, Y = 5, w = walls(draw(1, X, Y));
    let has = (x, y, side) => w[x + ',' + y].has(side);
    let ways = (x, y) => [
        x < X && !has(x + 1, y, 'left') && [x + 1, y],
        x > 1 && !has(x, y, 'left') && [x - 1, y],
        y < Y && !has(x, y + 1, 'top') && [x, y + 1],
        y > 1 && !has(x, y, 'top') && [x, y - 1],
    ].filter(Boolean);
    let seen = new Set(['1,1']), queue = [[1, 1]], passages = 0;
    while (queue.length) {
        let [x, y] = queue.shift();
        for (let [nx, ny] of ways(x, y)) {
            passages++;
            if (!seen.has(nx + ',' + ny)) seen.add(nx + ',' + ny), queue.push([nx, ny]);
        }
    }
    assert.equal(seen.size, X * Y);
    assert.equal(passages / 2, X * Y - 1);
    assert.ok(!has(1, 1, 'top') && !has(X, Y, 'bottom'), 'no way in or out');
    for (let y = 1; y <= Y; y++) assert.ok(has(1, y, 'left') && has(X, y, 'right'));
    for (let x = 2; x <= X; x++) assert.ok(has(x, 1, 'top'));
    for (let x = 1; x < X; x++) assert.ok(has(x, Y, 'bottom'));
    assert.equal(Object.keys(w).length, X * Y);
    assert.ok(Object.values(w).every(sides => sides.has('left top')), 'a cell without its corner post');
});

test('@maze() follows the seed', () => {
    assert.equal(draw(1), draw(1));
    assert.notEqual(draw(1), draw(2));
});

test('draws what it drew before', () => golden('maze', { 'seed golden, 5x4': draw('golden', 5, 4) }));
