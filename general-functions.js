// A collection of js functions (for myself) that I regularly use in different projects.

// ================
// DOM MANIPULATION
// ================
const cr = (tag, obj) => Object.assign(document.createElement(tag), obj || {});
const id = idd => document.getElementById(idd);
const q = sel => document.querySelector(sel);
const qa = sel => document.querySelectorAll(sel);



/**
 * Create element and create child elements
 * @param {String} tag Parent tag name
 * @param {Object} obj Object to assign to parent
 * @param {...Array} children Arrays of [type, obj, ...children] to create children with recursively
 * @returns Created parent element
 */
 const crc = (type, obj, ...children) => {
    const el = Object.assign(document.createElement(type), obj || {});
    children.forEach(ch => el.appendChild(crc(...ch)));
    return el;
};

// Example
document.body.appendChild(crc('div', 0,
    ['h1', { innerText:'People' }],
    ['table', 0,
        ['tr', 0, ['th', { innerText:'Name' }], ['th', { innerText:'Age' }]],
        ...([['Bob', 32], ['Bill', 29], ['Bro', 37]].map(([name, age]) =>
            ['tr', 0,
                ['td', { innerText:name }],
                ['td', { innerText:age }]]))]
));


/**
 * Create element and style it
 * @param {String} tag Element tag name
 * @param {Object} obj Object to assign to element
 * @param {Object} style Object to assign to element's style
 * @returns {HTMLElement} Created element
 */
const crs = (tag, obj, style) => {
    const el = cr(tag, obj);
    Object.assign(el.style, style || {});
    return el;
};

// ====================
// DATE/TIME CONVERSION
// ====================

/**
 * Convert time to and from HH:MM:SS.mss format
 * @param {Number} sec time in seconds
 * @param {Boolean} hours false to not use the leading HH:
 * @param {Boolean} millis false to not use the trailing .mss
 */
const timeToHHMMSSmss = (sec, hours=true, millis=true) => (hours ? [3600,60,1] : [60,1]).map(v => { const nv=Math.floor(sec/v); sec%=v; return nv < 10 ? `0${nv}` : nv; }).join(':') + (millis && 0 < sec ? `.${sec.toFixed(3).substring(2)}` : '');
const timeFromHHMMSSmss = str => {
    const t = str.split(/[: ]/).reverse().map(n => +n);
    return (t[0]||0) + (t[1]||0) * 60 + (t[2]||0) * 3600;
};



/**
 * Like Object.assign, but not just top level, instead looping through all nodes in the object tree
 * @param {Object} target Object to assign references to
 * @param {Object} source Object to take references from
 * @returns {Boolean} Whether the source was assigned to/on the target
 */
const deepAssign = (target, source) => {
    if (typeof target === 'object' && typeof source === 'object') {
        Object.entries(source).forEach(([key, val]) => deepAssign(target[key], val) || (target[key] = val));
        return true;
    }
    return false;
};



/**
 * Wait for querySelector to find element and return it.
 * @param {string} selector Selector for element
 * @param {number} timeout Max time (ms) to wait, at which point null is returned
 * @param {number} queryDelay Time (ms) between searches
 * @returns {Promise}
 */
 const waitForSelector = (selector, timeout=60000, queryDelay=100) => {
    return new Promise(resolve => {
        const start = Date.now();
        const iid = setInterval(() => {
            let el = document.querySelector(selector);
            if (el) {
                clearInterval(iid);
                resolve(el, Date.now() - start);
            } else if (Date.now() < start + timeout) {
                clearInterval(iid);
                resolve(null);
            }
        }, queryDelay);
    });
};
