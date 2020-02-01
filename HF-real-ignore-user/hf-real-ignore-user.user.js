// ==UserScript==
// @name         Real Ignore User
// @namespace    https://github.com/josefandersson/userscripts/tree/master/HF-real-ignore-user
// @version      1
// @description  Remove the posts of users you ignore completely and not just hide them.
// @author       DrDoof
// @icon         https://hackforums.net/favicon.ico
// @match        https://hackforums.net/showthread.php?*
// @grant        GM_addStyle
// ==/UserScript==

GM_addStyle('.ignored_post{display:none;}');