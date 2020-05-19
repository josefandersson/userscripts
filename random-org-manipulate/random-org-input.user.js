// ==UserScript==
// @name         Random.org Input
// @namespace    random.org
// @version      1.0
// @description  Allows you to manipulate random.org with keyboard input
// @author       DrDoof
// @match        https://www.random.org/*
// @icon         https://www.random.org/favicon.ico
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-end
// ==/UserScript==

const MIN_TIME = 500;
const MAX_TIME = 2000;

let isIframe = window.location !== window.parent.location;

if (isIframe) {
    console.log('[Random.org Input] Loading in iframe');

    let state = 0;
    let characters;
    let timeoutId;
    let startTime;

    window.onmessage = ev => handleInput(ev.data);
    document.addEventListener('keypress', ev => {
        if (state !== 0) {
            ev.preventDefault();
            handleInput(ev.key);
        }
    });

    const result = document.querySelector('#true-random-integer-generator-result');
    const btn = document.querySelector('#true-random-integer-generator-button');
    btn.onclick = () => {
        if (state === 0) {
            state = 1;
            characters = '';
            startTime = Date.now();
            result.innerHTML = '<img src="/util/cp/images/ajax-loader.gif" alt="Loading..."/>';
            timeoutId = setTimeout(stopInput, MAX_TIME);
        }
    };
    btn.style.outlineColor = 'transparent';
    btn.style.useSelect = 'none';

    function handleInput(key) {
        if (state === 1) {
            if (key === 'Enter') stopInput();
            else if (/[0-9]/.test(key)) characters += key;
        }
    }

    function stopInput() {
        clearTimeout(timeoutId);
        state = 2;
        const diff = MIN_TIME - (Date.now() - startTime);
        if (diff > 0) setTimeout(finishInput, diff);
        else finishInput();
    }

    function finishInput() {
        result.innerHTML = characters.length ? characters : '0';
        state = 0;
    }
} else {
    console.log('[Random.org Input] Loading in root');

    const iframe = document.querySelector('iframe');
    document.addEventListener('keypress', ev => iframe.contentWindow.postMessage(ev.key));
}

