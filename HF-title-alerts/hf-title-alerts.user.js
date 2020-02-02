// ==UserScript==
// @name         HF Title Alerts
// @namespace    https://github.com/josefandersson/userscripts/tree/master/HF-title-alerts
// @version      1.1
// @description  Adds an alert indicator to the page title.
// @author       DrDoof
// @icon         https://hackforums.net/favicon.ico
// @match        https://hackforums.net/*
// @grant        GM.setValue
// @grant        GM.getValue
// @grant        GM_addValueChangeListener
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

let lastAlertUpdate = 0

function updateTitle() {
    let prefix = ''
    if (unsafeWindow.Notify.alerts > 0) {
        prefix = `(${unsafeWindow.Notify.alerts}) `
    } else {
        GM.setValue('clearalerts', Date.now())
    }
    document.title = document.title.replace(/^(\(\d+\) )?(.*)/, `${prefix} $2`)
    lastAlertUpdate = Date.now()
}updateTitle()

try {
    GM_addValueChangeListener('clearalerts', (key, oldVal, newVal, isRemote) => {
        if (isRemote) {
            if (lastAlertUpdate < newVal) {
                unsafeWindow.Notify.alerts = 0
                updateTitle()
            }
        }
    })
} catch(e) {}