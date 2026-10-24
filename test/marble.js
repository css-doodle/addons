import assert from 'node:assert/strict';
import { load, Func, golden, glslTest as test } from './core.js';

await load('marble');

const COLORS = { white: [1, 1, 1, 1], red: [1, 0, 0, 1], blue: [0, 0, 1, 1] };
const extra = { getRgbaColor: value => COLORS[value] ?? null };

const run = (name, code) => {
    let warnings = [];
    let [base, kind] = name.split('.'), fn = kind ? Func[base][kind] : Func[base];
    let fragment = fn.shader(code, extra, message => warnings.push(message));
    return { fragment, warnings };
};
const line = (fragment, start) => fragment.split('\n').map(l => l.trim()).find(l => l.startsWith(start));

test('colors become K/S in linear light, the first is the paper', () => {
    let { fragment, warnings } = run('marble', 'white red blue');
    assert.match(line(fragment, 'const vec3 KS'), /^const vec3 KS\[M\] = vec3\[\]\(vec3\(0\.0, 0\.0, 0\.0\), vec3\(0\.0, 124\.002\d*, 124\.002\d*\), vec3\(124\.002\d*, 124\.002\d*, 0\.0\)\);$/);
    assert.match(fragment, /const int N = 30, T = 1, M = 3;/);
    assert.deepEqual(warnings, []);
});

test('drops and combs are read from the options', () => {
    let { fragment } = run('marble', 'white red, drops 12, size 6%, comb 5% 90deg, comb 10% .25turn');
    assert.match(fragment, /const int N = 12, T = 2, M = 2;/);
    let [a, b] = line(fragment, 'const vec4 TINE').match(/vec4\([^)]*\)/g);
    assert.equal(a, 'vec4(0.05, 0.0, 1.0, 0.125)');
    assert.match(b, /^vec4\(0\.1, 0(\.0)?, 1\.0, 0\.25\)$/);
    assert.match(fragment, /float r = 0\.06 \*/);
});

test('with no comb option one comb is pulled', () => {
    assert.match(run('marble', 'white red').fragment, /T = 1,/);
});

test('ink takes scale and warp', () => {
    let { fragment } = run('marble.ink', 'white red blue, scale 3, warp 1');
    assert.match(fragment, /\* 3\.0;/);
    assert.match(fragment, /float w = 1\.0;/);
    assert.match(fragment, /const int M = 3;/);
});

test('declarations draw what the older form draws', () => {
    let same = (name, declared, older) => assert.equal(run(name, declared).fragment, run(name, older).fragment);
    same('marble', 'colors: white, red, blue; drops: 12; size: 6%; comb: 5% 90deg, 10% 0deg;', 'white red blue, drops 12, size 6%, comb 5% 90deg, comb 10% 0deg');
    same('marble', 'colors: white red; comb: 5% 90deg; comb: 10% 0deg', 'white red, comb 5% 90deg, comb 10% 0deg');
    same('marble', '\n  colors: white, red;\n  drops: 3;\n', 'white red, drops 3');
    same('marble.ink', 'colors: white, red, blue; scale: 3; warp: 1;', 'white red blue, scale 3, warp 1');
    same('marble.ink', 'scale: 1; colors: white, rgb(0, 0, 255); scale: 3', 'white rgb(0, 0, 255), scale 3');
});

test('declarations warn like the older form', () => {
    assert.deepEqual(run('marble', 'colors: white; drops: 3').warnings, ['no colors']);
    assert.deepEqual(run('marble', 'colors: white, red; swirl: 3; ground').warnings, ['unknown option swirl', 'unknown option ground']);
    assert.deepEqual(run('marble.ink', 'colors: white, red; comb: 3').warnings, ['unknown option comb']);
    assert.deepEqual(run('marble', 'white red; drops: 3').warnings, ['unknown option white red', 'no colors']);
});

test('bad input warns and falls back', () => {
    assert.deepEqual(run('marble', 'white, drops 3').warnings, ['no colors']);
    assert.deepEqual(run('marble', 'white nope').warnings, ['unknown color nope']);
    assert.deepEqual(run('marble', 'white red, swirl 3').warnings, ['unknown option swirl']);
    assert.deepEqual(run('marble.ink', 'white red, comb 3').warnings, ['unknown option comb']);
    assert.match(run('marble', 'red').fragment, /FragColor = vec4\(0\)/);
    assert.match(run('marble', 'white red, size big').fragment, /float r = 0\.09 \*/);
});

test('draws what it drew before', () => golden('marble', {
    marble: run('marble', 'white red blue, drops 12, size 6%, comb 5% 90deg, comb 10% 0deg').fragment,
    ink: run('marble.ink', 'white red blue, scale 3, warp 1').fragment,
}));
