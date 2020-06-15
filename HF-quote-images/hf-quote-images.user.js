// ==UserScript==
// @name         HF Quote Images
// @namespace    https://github.com/josefandersson/userscripts/tree/master/HF-quote-images
// @version      1.1
// @description  Automatically put quoted images into spoiler tags.
// @author       DrDoof
// @icon         https://hackforums.net/favicon.ico
// @match        https://hackforums.net/*
// @require      https://raw.githubusercontent.com/josefandersson/userscripts/master/userscript-settings/userscript-settings.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// ==/UserScript==

const settings = new UserscriptSettings({ qouteImages:{
    label:'Qoute Images', settings:{
        replaceWith:{ label:'Replace img tags with', type:'text', defaultValue:'[sp]$&[/sp]',
            currentValue:GM_getValue('replaceWith') } } } });

if (location.pathname === '/newreply.php') {
    const params = new URLSearchParams(location.search);
    if (params.get('tid') != null && params.get('replyto') != null) {
        const id = setInterval(() => {
            let element;
            if ((element = document.querySelector('#content > div > form > table > tbody > tr:nth-child(3) > td:nth-child(2) > div > textarea')) != null) {
                clearInterval(id);
                element.value = element.value.replace(/\[img\].*?\[\/img\]/g, settings.getValues('qouteImages').replaceWith);
            }
        }, 10);
    }
}

GM_registerMenuCommand('Userscript Settings', settings.show, '');

settings.addOnSave(() => {
    GM_setValue('replaceWith', settings.getValues('quoteImages').replaceWith);
}, 'qouteImages');