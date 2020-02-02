// ==UserScript==
// @name         HF Title Alerts
// @namespace    https://github.com/josefandersson/userscripts/tree/master/HF-title-alerts
// @version      1.0
// @description  Adds an alert indicator to the page title.
// @author       DrDoof
// @icon         https://hackforums.net/favicon.ico
// @match        https://hackforums.net/*
// @run-at       document-end
// ==/UserScript==

unsafeWindow.Notify.socket.on('notify_notice', data => {
    if(unsafeWindow.Notify.notify_settings.includes(
        unsafeWindow.Notify.forceInt(data.type))) {
            return
    }

    setTimeout(updateTitle, 10)
})

document.querySelector('.notifycp').addEventListener('click', updateTitle)

function updateTitle() {
    let prefix = ''
    if (unsafeWindow.Notify.alerts > 0) {
        prefix = `(${unsafeWindow.Notify.alerts}) `
    }
    document.title = document.title.replace(/^(\(\d+\) )?(.*)/, `${prefix} $2`)
}updateTitle()
