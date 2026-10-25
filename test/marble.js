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
    let { fragment } = run('marble', 'colors: white, red; drops: 12; size: 6%; comb: 5% 90deg, 10% .25turn');
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
    let { fragment } = run('marble.ink', 'colors: white, red, blue; scale: 3; warp: 1');
    assert.match(fragment, /\* 3\.0;/);
    assert.match(fragment, /float w = 1\.0;/);
    assert.match(fragment, /const int M = 3;/);
});

test('the colors alone, a comb repeated and a declaration given twice', () => {
    let same = (name, a, b) => assert.equal(run(name, a).fragment, run(name, b).fragment);
    same('marble', 'white red blue', 'colors: white, red, blue');
    same('marble', 'colors: white red; comb: 5% 90deg; comb: 10% 0deg', 'colors: white, red; comb: 5% 90deg, 10% 0deg');
    same('marble', '\n  colors: white, red;\n  drops: 3;\n', 'colors: white, red; drops: 3');
    same('marble.ink', 'scale: 1; colors: white, rgb(0, 0, 255); scale: 3', 'colors: white rgb(0, 0, 255); scale: 3');
});

test('bad input warns and falls back', () => {
    assert.deepEqual(run('marble', 'colors: white; drops: 3').warnings, ['no colors']);
    assert.deepEqual(run('marble', 'white nope').warnings, ['unknown color nope']);
    assert.deepEqual(run('marble', 'colors: white, red; swirl: 3; ground').warnings, ['unknown option swirl', 'unknown option ground']);
    assert.deepEqual(run('marble.ink', 'colors: white, red; comb: 3').warnings, ['unknown option comb']);
    assert.deepEqual(run('marble', 'white red; drops: 3').warnings, ['unknown option white red', 'no colors']);
    assert.deepEqual(run('marble', 'white red, drops 3').warnings, ['unknown color drops', 'unknown color 3']);
    assert.match(run('marble', 'red').fragment, /FragColor = vec4\(0\)/);
    assert.match(run('marble', 'colors: white, red; size: big').fragment, /float r = 0\.09 \*/);
});

test('a number option takes math, with t the time in seconds', () => {
    let { fragment, warnings } = run('marble', 'colors: white, red; drops: min(t * 8, 40); size: 9% + 2% * sin(t); comb: 6% (90deg + .05turn * t), (8% - t) 0deg');
    assert.deepEqual(warnings, []);
    assert.match(fragment, /const int T = 2, M = 2;/);
    assert.match(fragment, /float D = clamp\(min\(\(u_time \* 8\.0\), 40\.0\), 0\.0, 400\.0\);\s+int N = int\(ceil\(D\)\);/);
    assert.match(fragment, /float r = \(9\.0 \+ \(2\.0 \* sin\(u_time\)\)\) \* 0\.01 \* \(\.5 \+ g_hash\(f \+ 2\.0\)\) \* min\(D - float\(k\), 1\.0\);/);
    assert.equal(line(fragment, 'vec4 TINE'), 'vec4 TINE[T] = vec4[](g_tine(0.06, radians((90.0 + (18.0 * u_time)))), g_tine(max((8.0 - u_time) * 0.01, 0.001), 0.0));');
    let ink = run('marble.ink', 'colors: white, red; scale: 2 + sin(t); warp: t % 3');
    assert.match(ink.fragment, /u_resolution\.y \* \(2\.0 \+ sin\(u_time\)\);\s+float w = mod\(u_time, 3\.0\);/);
    assert.deepEqual(ink.warnings, []);
});

test('flow slides the comb and drifts the ink, and none or 0 keeps them still', () => {
    assert.match(run('marble', 'colors: white, red; flow: 2').fragment, /float d = dot\(p, vec2\(-m\.y, m\.x\)\) \/ t\.x - u_time \* 0\.2,/);
    assert.match(run('marble.ink', 'colors: white, red; flow: 1').fragment, /vec2\(1\.7, 9\.2\) \+ u_time \* 0\.06\), g_fbm\(p \+ w \* q \+ vec2\(8\.3, 2\.8\) \+ u_time \* 0\.05\)/);
    for (let name of ['marble', 'marble.ink']) {
        assert.equal(run(name, 'colors: white, red; flow: 0').fragment, run(name, 'white red').fragment);
        assert.doesNotMatch(run(name, 'white red').fragment, /u_time/);
    }
});

test('math that does not read warns, and the option reads as a number', () => {
    let size = code => [line(run('marble', 'colors: white, red; size: ' + code).fragment, 'float r'), run('marble', 'colors: white, red; size: ' + code).warnings];
    assert.deepEqual(size('big'), ['float r = 0.09 * (.5 + g_hash(f + 2.0));', ['unknown name big']]);
    assert.deepEqual(size('6% +'), ['float r = 0.06 * (.5 + g_hash(f + 2.0));', ['nothing after +']]);
    assert.deepEqual(size('9% + var(--cssd-utime)'), ['float r = 0.09 * (.5 + g_hash(f + 2.0));', ['@t is CSS time, use t']]);
});

test('draws what it drew before', () => golden('marble', {
    marble: run('marble', 'colors: white, red, blue; drops: 12; size: 6%; comb: 5% 90deg, 10% 0deg').fragment,
    ink: run('marble.ink', 'colors: white, red, blue; scale: 3; warp: 1').fragment,
    'marble moving': run('marble', 'colors: white, red, blue; drops: min(t * 4, 12); size: 6% + 1% * sin(t); comb: 5% (90deg + 10deg * t), 10% 0deg; flow: 1').fragment,
    'ink moving': run('marble.ink', 'colors: white, red, blue; scale: 3; warp: 1 + sin(t); flow: 1').fragment,
}));
