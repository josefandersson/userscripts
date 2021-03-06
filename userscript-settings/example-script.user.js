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
    myUserscript: ["My Userscript", "section", {
        refresh: ["Autorefresh", "checkbox", true],
        mode: ["Mode", "select", ["Single", "Multiple", "Auto"]],
        appearance: ["Appearance", "section", {
            useTheme: ["Use theme", "checkbox", true],
            colors: ["Colors", "list", ["Black", "Brown", "Green", "Orange", "Purple"], ["Brown", "Orange"], ["Purple"], { orderable:true }, [{ path:["useTheme"], value:false, action:"disable" }]], // Disable input if Use theme is true
            randomColors: ["Randomize colors", "checkbox", false,, [{ path:["colors"], eval:v=>!!v.length }]] // Hide option if Colors list is not empty
        }],
        other: ["Other", "section", {
            hideDate: ["Hide before date", "date", "2020-05-23"],
            highTime: ["Highlight after time", "time", "18:00", "20:30"],
            invertDate: ["Invert date strings", "checkbox", false],
            replaceInfo: ["Info replacement message", "textarea",, "Lorem ipsum...", 5]
        }, [{ path:["/", "myUserscript", "mode"], value:"Auto", action:"disable" }]] // Disable section if Mode is Auto
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