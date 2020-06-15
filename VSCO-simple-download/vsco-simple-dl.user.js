// ==UserScript==
// @name         VSCO Simple Download
// @namespace    https://github.com/josefandersson/userscripts/tree/master/VSCO-simple-download
// @version      1
// @description  Makes it easy to download images from VSCO
// @author       DrDoof
// @icon         https://vsco.co/favicon.ico
// @match        https://vsco.co/*
// ==/UserScript==

document.addEventListener('keypress', ev => {
    if (ev.key === 'f' && /^\/\S+\/media\/[0-9a-z]*$/.test(location.pathname)) {
        const imgs = document.querySelectorAll('img');
        location.href = imgs[imgs.length - 1].src;
    }
});