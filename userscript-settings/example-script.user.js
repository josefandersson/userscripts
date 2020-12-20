// ==UserScript==
// @name         Userscript Settings Example
// @namespace    https://github.com/josefandersson/userscripts/tree/master/userscript-settings
// @version      1.0
// @description  Example usage of the Userscript Settings library.
// @author       Josef Andersson
// @match        https://github.com/josefandersson/userscripts/tree/master/userscript-settings*
// @require      https://github.com/josefandersson/userscripts/raw/master/userscript-settings/userscript-settings.js
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

// Load previous settings.
const oldSettings = GM_getValue('settings');

// Create UserscriptSettings object on every page load. Pass settings descriptor and old settings.
const settings = new UserscriptSettings({
    "myUserscript": ["My Userscript", "section", {
        "refresh": ["Autorefresh", "checkbox", true],
        "mode": ["Mode", "select", ["Single", "Multiple", "Auto"]],
        "appearance": ["Appearance", "section", {
            "useTheme": ["Use theme", "checkbox", true],
            "theme": ["Theme", "select", ["Zebra", "Tomorrow", "Autumn"], 0, null, [{ "path":["useTheme"], "value":false, "action":"disable" }]]
        }]
    }]
}, { myUserscript:oldSettings }); // (it doesn't matter if oldSettings is null)

// Add a listener for setting changes on the 'myUserscript' path.
settings.addOnChange(val => {

    // 'val' will be an object tree of all children and grandchildren of the 'myUserscript' section, including unchanged values.
    console.log('Value changed:', val);

    // Save our settings section values to storage.
    GM_setValue('settings', val);

}, 'myUserscript'); // (without the path you would get values from all other userscripts loaded on this page as well)

// Open settings window 500ms after page load.
setTimeout(() => settings.show(), 500);