// ==UserScript==
// @name         HF Quote Images
// @namespace    https://github.com/josefandersson/userscripts/tree/master/HF-quote-images
// @version      1.0
// @description  Automatically put quoted images into spoiler tags.
// @author       DrDoof
// @icon         https://hackforums.net/favicon.ico
// @match        https://hackforums.net/*
// ==/UserScript==

if (location.pathname === '/newreply.php') {
    const params = new URLSearchParams(location.search)
    if (params.get('tid') != null && params.get('replyto') != null) {
        const id = setInterval(() => {
            let element
            if ((element = document.querySelector('#content > div > form > table > tbody > tr:nth-child(3) > td:nth-child(2) > div > textarea')) != null) {
                clearInterval(id)
                element.value = element.value.replace(/\[img\].*?\[\/img\]/g, '[sp]$&[/sp]')
            }
        }, 10)
    }
}