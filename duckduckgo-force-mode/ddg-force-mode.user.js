// ==UserScript==
// @name         DuckDuckGo Force Mode
// @namespace    https://github.com/josefandersson/userscripts/tree/master/duckduckgo-force-mode
// @version      1.0
// @description  Force any search mode on DuckDuckGo.
// @author       Josef Andersson
// @include      *://duckduckgo.com/?*
// @icon         https://duckduckgo.com/favicon.ico
// @grant        GM_addStyle
// ==/UserScript==

// SEARCH MODE BUTTON TEXT TO LOOK FOR:
// If you change duckduckgo language this will have to change.
// Changing this to any of 'Strict', 'Moderate' or 'Off' will force that mode. (Case-sensitive!!)
const SEARCH_MODE_TEXT = 'Strict';

GM_addStyle('.dropdown--safe-search { display:none !important; }');

const dropdown = document.querySelector('.dropdown--safe-search a');
if (dropdown && dropdown.innerText.indexOf(SEARCH_MODE_TEXT) < 0) {
    dropdown.click();
    const id = setInterval(() => {
        const res = document.querySelectorAll('.modal--dropdown--safe-search li a');
        if (res.length) {
            clearInterval(id);
            res.forEach(a => {
                if (-1 < a.innerText.indexOf(SEARCH_MODE_TEXT))
                    a.click();
            });
        }
    }, 30);
}