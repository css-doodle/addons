import test from 'node:test';
import assert from 'node:assert/strict';
import { load, parseCss, parseGrid, generateCss, golden } from './core.js';

await load('wfc');

// cells by "x,y", from rules grouped by selector lists
function draw(code, seed = 3) {
    let { styles, warnings } = generateCss(parseCss(code), parseGrid('1'), seed, 64);
    let cells = {};
    for (let [, selectors, body] of styles.cells.matchAll(/([^}{]+) \{([^}]*)\}/g)) {
        for (let [, x, y] of selectors.matchAll(/#c-(\d+)-(\d+)-1/g)) {
            let cell = cells[x + ',' + y] ??= {};
            for (let [, name, value] of body.matchAll(/(--\w+|rotate):([^;]*);/g)) cell[name] = value;
        }
    }
    return { cells, warnings: [...new Set(warnings.map(w => w.message))] };
}

const SAMPLE = `
    ........
    .####...
    .#..#...
    .####...
    ........
    ....###.
    ....#.#.
    ....###.
`;

function windows(rows, n, symmetry) {
    let SX = rows[0].length, SY = rows.length, set = new Set();
    let pattern = f => Array.from({ length: n * n }, (_, i) => f(i % n, Math.floor(i / n))).join('');
    for (let y = 0; y < SY; y++) {
        for (let x = 0; x < SX; x++) {
            let at = (dx, dy) => rows[(y + dy) % SY][(x + dx) % SX];
            let turns = [
                (dx, dy) => at(dx, dy), (dx, dy) => at(n - 1 - dx, dy),
                (dx, dy) => at(dy, n - 1 - dx), (dx, dy) => at(n - 1 - dy, n - 1 - dx),
                (dx, dy) => at(n - 1 - dx, n - 1 - dy), (dx, dy) => at(dx, n - 1 - dy),
                (dx, dy) => at(n - 1 - dy, dx), (dx, dy) => at(dy, dx),
            ];
            for (let f of turns.slice(0, symmetry)) set.add(pattern(f));
        }
    }
    return set;
}

function outputWindows(cells, X, Y, n) {
    let list = [];
    for (let y = 1; y <= Y; y++) {
        for (let x = 1; x <= X; x++) {
            let w = '';
            for (let dy = 0; dy < n; dy++) {
                for (let dx = 0; dx < n; dx++) w += cells[((x - 1 + dx) % X + 1) + ',' + ((y - 1 + dy) % Y + 1)]['--v'];
            }
            list.push(w);
        }
    }
    return list;
}

test('@wfc() overlapping model: every 3x3 window of the grid, wrapping, is one from the sample', () => {
    let { cells, warnings } = draw(`@grid: 14x10; --v: @wfc(${SAMPLE});`);
    assert.deepEqual(warnings, []);
    let allowed = windows(SAMPLE.trim().split(/\s+/), 3, 8);
    for (let w of outputWindows(cells, 14, 10, 3)) assert.ok(allowed.has(w), w);
    assert.deepEqual(new Set(Object.values(cells).map(c => c['--v'])), new Set(['.', '#']));
});

test('@wfc() takes n, symmetry and a legend', () => {
    let { cells } = draw(`@grid: 12; --v: @wfc(${SAMPLE}, n 2, symmetry 1);`);
    let allowed = windows(SAMPLE.trim().split(/\s+/), 2, 1);
    for (let w of outputWindows(cells, 12, 12, 2)) assert.ok(allowed.has(w), w);
    let mapped = draw(`@grid: 12; --v: @wfc(${SAMPLE}, n 2, symmetry 1, . #fff, # red);`).cells;
    assert.deepEqual(Object.values(mapped).map(c => c['--v']), Object.values(cells).map(c => ({ '.': '#fff', '#': 'red' })[c['--v']]));
});

test('@wfc() ground keeps the sample\'s bottom row along the bottom', () => {
    let sample = '..... ..... ..... ..o.. ..o.. .ooo. xxxxx';
    let { cells, warnings } = draw(`@grid: 10x8; --v: @wfc(${sample}, symmetry 2, ground);`);
    assert.deepEqual(warnings, []);
    for (let x = 1; x <= 10; x++) assert.equal(cells[x + ',8']['--v'], 'x');
    for (let y = 1; y < 8; y++) assert.notEqual(cells['1,' + y]['--v'], 'x');
});

test('@wfc() follows the seed and leaves @r values alone', () => {
    let code = `@grid: 10; --v: @wfc(${SAMPLE});`;
    assert.deepEqual(draw(code, 1), draw(code, 1));
    assert.notDeepEqual(draw(code, 1), draw(code, 2));
    let r = code => Object.fromEntries(Object.entries(draw(code).cells).map(([at, c]) => [at, c['--r']]));
    assert.deepEqual(r(`@grid: 10; --v: @wfc(${SAMPLE}); --r: @r(1);`), r('@grid: 10; --r: @r(1);'));
});

test('@wfc.tiles() matches the sides tiles share, and @wfc.turn() turns each one', () => {
    let SIDES = { line: '1010', corner: '1100', cross: '1111', empty: '0000' };
    let { cells, warnings } = draw(`@grid: 12x9;
        --v: @wfc.tiles(line 1010, corner 1100, cross 1111, empty 0000 2);
        rotate: @wfc.turn();
    `);
    assert.deepEqual(warnings, []);
    let sides = (x, y) => {
        let { '--v': value, rotate = '0deg' } = cells[x + ',' + y];
        let s = SIDES[value];
        for (let i = 0; i < parseInt(rotate) / 90; i++) s = s.at(-1) + s.slice(0, 3);
        return s;
    };
    for (let y = 1; y <= 9; y++) {
        for (let x = 1; x <= 12; x++) {
            assert.equal(sides(x, y)[1], sides(x % 12 + 1, y)[3], `${x},${y} and right`);
            assert.equal(sides(x, y)[2], sides(x, y % 9 + 1)[0], `${x},${y} and below`);
        }
    }
    assert.ok(new Set(Object.values(cells).map(c => c['--v'])).size >= 3);
});

test('@wfc() takes a grid of values, rows split by /, and emoji as characters', () => {
    let grid = 'red red red red / red #222 #222 red / red #222 rgb(0 0 0 / .5) red / red red red red';
    let { cells, warnings } = draw(`@grid: 12; --v: @wfc(${grid}, #222 navy);`);
    assert.deepEqual(warnings, []);
    let values = new Set(Object.values(cells).map(c => c['--v']));
    assert.ok([...values].every(v => ['red', 'navy', 'rgb(0 0 0 / .5)'].includes(v)), [...values].join());
    assert.ok(values.has('navy'));
    let emoji = draw('@grid: 8; --v: @wfc(🌊🌊🏝️🌊 🌊🌊🌊🌊 🌊🐟🌊🌊 🌊🌊🌊🌊, n 2);');
    assert.deepEqual(emoji.warnings, []);
    assert.ok(Object.values(emoji.cells).every(c => ['🌊', '🏝️', '🐟'].includes(c['--v'])));
});

test('values that change from cell to cell keep the layout', () => {
    let plain = draw(`@grid: 12; --v: @wfc(${SAMPLE});`).cells;
    let random = draw(`@grid: 12; --v: @wfc(${SAMPLE}, # @r(1, 2));`).cells;
    for (let at in plain) {
        let v = random[at]['--v'];
        assert.ok(plain[at]['--v'] == '#' ? v >= 1 && v < 2 : v == '.', at);
    }
    let tiles = code => Object.fromEntries(Object.entries(draw(`@grid: 8; --v: @wfc.tiles(${code}, e 0000); rotate: @wfc.turn();`).cells)
        .map(([at, c]) => [at, [c['--v'] == 'e', c.rotate]]));
    assert.deepEqual(tiles('a 1010, b 1100'), tiles('@p(a1, a2) 1010, @p(b1, b2) 1100'));
});

test('@wfc.order() tells when each cell was decided, from 0 to 1', () => {
    for (let call of [`@wfc(${SAMPLE})`, '@wfc.tiles(a 1010, b 1100, e 0000)']) {
        let { cells } = draw(`@grid: 12; --v: ${call}; --o: @wfc.order();`);
        let order = Object.values(cells).map(c => +c['--o']);
        assert.equal(order.length, 144);
        assert.ok(order.every(o => o >= 0 && o <= 1), call);
        assert.equal(Math.max(...order), 1, call);
        assert.ok(new Set(order).size > 10, call);
    }
});

test('@wfc() warns about uneven rows, unknown options and tiles without four sides', () => {
    assert.deepEqual(draw('@grid: 4; --v: @wfc(... ..);').warnings, ['uneven sample rows']);
    assert.deepEqual(draw('@grid: 4; --v: @wfc(.. .#, size 2);').warnings, ['unknown option size 2']);
    assert.deepEqual(draw('@grid: 4; --v: @wfc.tiles(line 101);').warnings, ['invalid tile line 101']);
});

test('draws what it drew before', () => golden('wfc', {
    overlapping: draw(`@grid: 10x8; --v: @wfc(${SAMPLE});`, 'golden').cells,
    ground: draw('@grid: 8x6; --v: @wfc(..... ..o.. .ooo. xxxxx, n 2, symmetry 2, ground);', 'golden').cells,
    tiles: draw('@grid: 6x5; --v: @wfc.tiles(line 1010, corner 1100, cross 1111, empty 0000 2); rotate: @wfc.turn(); --o: @wfc.order();', 'golden').cells,
}));
