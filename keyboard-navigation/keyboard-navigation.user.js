// ==UserScript==
// @name         Keyboard Navigation
// @namespace    https://github.com/josefandersson/userscripts/tree/master/keyboard-navigation
// @version      1.0
// @description  Attempts to make the web more easy to navigate using the keyboard
// @author       Josef Andersson
// @include      *
// ==/UserScript==

/*

! Consider using WebAssembly for crunching position data...

Toggle navigation mode: ctrl + shift + z

Navigation mode
	- Border around page to indicate active
	- Figure out what links/buttons/inputs are on the page
	- Figure out which of them are important
	- Give the most important ones IDs (1,2,3..)
	- Typing id selects target
	- Escape exits


*/

const MIN_TIME_BETWEEN_UPDATES = 100;

/**
 * Create element and style it
 * @param {String} tag Element tag name
 * @param {Object} obj Object to assign to element
 * @param {Object} style Object to assign to element's style
 * @returns {HTMLElement} Created element
 */
 const crs = (tag, obj, style) => {
    const el = Object.assign(document.createElement(tag), obj || {});
    Object.assign(el.style, style || {});
    return el;
};
/**
 * Get rects for element and all its children
 * @param {HTMLElement} el Element
 * @returns {DOMRect[]} Rects
 */
 const getRects = el => {
	const rect = el.getBoundingClientRect();
	const childRects = [...el.children].flatMap(getRects);
	return [rect, ...childRects];
};

const createHint = (text, x, y) => {
	return document.body.appendChild(crs('div', { innerText:text }, {
		position:'absolute', left:`${scrollX + x}px`, top:`${scrollY + y}px`,
		color:'white', background:'black',
		padding:'10px', border:'2px solid white'
	}));
};

/**
 * Calculated a list of links in the viewport and their adjusted center positions
 * @returns {Object[]} Array of elements with positions
 */
const getInViewport = () => {
	const minY = scrollY;
	const minX = scrollX;
	const maxY = minY + innerHeight;
	const maxX = minX + innerWidth;
	return [...document.querySelectorAll('a, input, button, textarea, select')].map(el => {
		const rects = getRects(el);
		const rectsInView = [];
		for (let i = 0, rect = rects[i]; i < rects.length; i++, rect = rects[i])
			if (minY <= rect.y && rect.y + rect.height <= maxY && minX <= rect.x && rect.x <= maxX)
				rectsInView.push(rect);
		if (!rectsInView.length)
			return null;
		const nonZeroRects = rectsInView.filter(rect => rect.width * rect.height > 0);
		if (!nonZeroRects.length)
			return null
		const sortedRects = nonZeroRects.sort((a, b) => (a.width * a.height - b.width * b.height))
		const smallestRect = sortedRects.pop();
		let x = smallestRect.x + smallestRect.width * .5;
		let y = smallestRect.y + smallestRect.height * .5;
		sortedRects.forEach(rect => {
			const rx = rect.x + rect.width * .5;
			const ry = rect.y + rect.height * .5;
			x += (rx - x) * .5;
			y += (ry - y) * .5;
		});
		return { x, y, el };
	}).filter(x => x);
};

const updateHintsInViewport = () => {
	const inView = getInViewport();
	inView.forEach(({ x, y, el }) => {
		if (hints[el]) {
			Object.assign(hints[el].hint.style, { left:`${screenX + x}px`, top:`${screenY + y}px` });
		} else {
			const id = getNextFreeId();
			hints[el] = { id, hint:createHint(id, x, y) };
			usedIds.push(id);
		}
	});
};

const getNextFreeId = () => {
	// TODO: Generate IDs in a sequenze of most to least easy to press
	let i = 1;
	for (; usedIds.indexOf(i) > -1; i++);
	return i;
};

const hints = {};
const usedIds = [];

const inject = () => {
	let id = 1;
	const ids = {};
	getInViewport().forEach(({ x, y, el }) => {
		const hint = createHint(id, x, y);
		ids[el] = { id, hint };
		id++;
	});
};


// Handle scrolling
let lastScroll, nextScrollTid
addEventListener('wheel', () => {
	const now = Date.now();
	const delta = now - lastScroll;
	if (nextScrollTid)
		return;
	else if (delta < MIN_TIME_BETWEEN_UPDATES)
		nextScrollTid = setTimeout(() => {
			nextScrollTid = null;
			lastScroll = now;
			updateHintsInViewport();
		}, MIN_TIME_BETWEEN_UPDATES - delta);
	else {
		lastScroll = now;
		updateHintsInViewport();
	}
});

// TODO: Handle viewport change (ie links appearing/disappearing in the vp)