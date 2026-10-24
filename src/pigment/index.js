/*! Mixing and tables from spectral.js, (c) 2025 Ronald van Wijnen, MIT, https://github.com/rvanwijnen/spectral.js */
customElements.whenDefined('css-doodle').then(() => {
    const CSSDoodle = customElements.get('css-doodle');

    // Kubelka-Munk on 38 bands, 380-750nm. R, G, B are spectral.js's base
    // spectra; white is 1, cyan 1 - R, magenta 1 - G, yellow 1 - B.
    // TO_RGB is its CIE table times the XYZ to linear sRGB matrix.
    const R = [
        .0316, .0316, .0315, .0313, .0307, .0286, .0246, .0193, .0142, .0103, .00762, .0059,
        .00482, .00423, .00406, .00435, .00534, .00769, .0136, .0317, .108, .464, .847, .943,
        .969, .978, .982, .984, .985, .985, .986, .986, .986, .986, .986, .986, .986, .986
    ];
    const G = [
        .00956, .00956, .00957, .00961, .00978, .0104, .012, .0161, .0267, .0596, .186, .571,
        .861, .946, .97, .978, .98, .976, .962, .923, .793, .459, .186, .0882, .0544, .0406,
        .0342, .0311, .0296, .0288, .0284, .0283, .0282, .0282, .0281, .0281, .0281, .0281
    ];
    const B = [
        .979, .979, .979, .979, .979, .978, .975, .967, .949, .901, .763, .466, .201, .0878,
        .0457, .0285, .0205, .0165, .0145, .0136, .0134, .0135, .014, .0144, .0149, .0152, .0155,
        .0156, .0157, .0157, .0157, .0158, .0158, .0158, .0158, .0158, .0158, .0158
    ];
    const TO_RGB = [
        [
            .0000547, .000185, .000935, .00309, .0095, .0173, .0221, .0163, .002, -.0162, -.0339,
            -.0461, -.0638, -.0839, -.0918, -.0825, -.0529, -.0127, .0374, .0916, .148, .181, .211,
            .21, .181, .132, .0937, .0571, .0334, .0182, .00929, .00402, .00207, .00109, .000454,
            .000256, .000132, .0000537
        ],
        [
            -.0000466, -.000158, -.000807, -.00271, -.00848, -.0161, -.022, -.02, -.0111, .00379,
            .0221, .039, .0634, .096, .126, .149, .149, .142, .122, .0955, .0674, .0357, .0131,
            -.00239, -.00941, -.00989, -.00838, -.00561, -.00345, -.00192, -.000996, -.000435,
            -.000225, -.000119, -.0000493, -.0000278, -.0000143, -.00000583
        ],
        [
            .000326, .00111, .00567, .0192, .0609, .121, .185, .209, .197, .147, .0917, .0464, .023,
            .00664, -.00581, -.0124, -.0155, -.0167, -.0157, -.0136, -.0113, -.00807, -.00586,
            -.00394, -.00249, -.00144, -.000852, -.000458, -.000248, -.00013, -.0000641, -.0000272,
            -.0000139, -.00000734, -.00000305, -.00000172, -8.84e-7, -3.61e-7
        ],
    ];

    const linear = v => v > .04045 ? ((v + .055) / 1.055) ** 2.4 : v / 12.92;
    const gamma = v => v > .0031308 ? 1.055 * v ** (1 / 2.4) - .055 : v * 12.92;
    const toRgb = s => TO_RGB.map(curve => curve.reduce((sum, v, i) => sum + v * s[i], 0));

    function reflectance([r, g, b]) {
        let w = Math.min(r, g, b);
        r -= w, g -= w, b -= w;
        let c = Math.min(g, b), m = Math.min(r, b), y = Math.min(r, g);
        let kr = Math.max(0, Math.min(r - b, r - g));
        let kg = Math.max(0, Math.min(g - b, g - r));
        let kb = Math.max(0, Math.min(b - g, b - r));
        return R.map((_, i) => Math.max(Number.EPSILON, w + c + m + y + (kr - c) * R[i] + (kg - m) * G[i] + (kb - y) * B[i]));
    }

    // paints: [[r, g, b, a], weight], weights add up to 1
    function mix(paints) {
        let ks = R.map(() => 0), total = 0, alpha = 0;
        for (let [[r, g, b, a], weight] of paints) {
            let s = reflectance([r, g, b].map(linear));
            let [lr, lg, lb] = toRgb(s);
            let k = weight * weight * a * Math.max(Number.EPSILON, .2126 * lr + .7152 * lg + .0722 * lb);
            s.forEach((v, i) => ks[i] += (1 - v) ** 2 / (2 * v) * k);
            total += k;
            alpha += weight * a;
        }
        if (!total) return 'transparent';
        let rgb = toRgb(ks.map(v => (v /= total, 1 + v - Math.sqrt(v * v + 2 * v))))
            .map(v => Math.round(Math.min(1, Math.max(0, gamma(v))) * 255));
        return `rgb(${rgb.join(' ')}${alpha < 1 ? ' / ' + +alpha.toFixed(3) : ''})`;
    }

    CSSDoodle.use('pigment', {
        value: (args, { color, words, warn, state }) => {
            let paints = [];
            for (let arg of args) {
                let parts = words(String(arg));
                let at = parts.findIndex(part => /^[\d.]+%$/.test(part));
                let name = parts.filter((_, i) => i != at).join(' ');
                let rgba = state[name] ??= color(name);
                if (!rgba) return warn(`invalid color ${name}`), '';
                paints.push([rgba, at < 0 ? null : parseFloat(parts[at]) / 100]);
            }
            let given = paints.reduce((sum, [, weight]) => sum + weight, 0);
            let left = Math.max(0, 1 - given) / paints.filter(([, weight]) => weight == null).length;
            for (let paint of paints) paint[1] ??= left;
            let total = paints.reduce((sum, [, weight]) => sum + weight, 0);
            return total ? mix(paints.map(([rgba, weight]) => [rgba, weight / total])) : '';
        },
    });
});
