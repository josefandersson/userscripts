// ==UserScript==
// @name         Not Yet Repped Upgraded Users
// @version      5
// @description  Fetch users you have not given rep.
// @author       DrDoof
// @icon         https://hackforums.net/favicon.ico
// @match        *://hackforums.net/*
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

// { interactedWith:[ { user:{ username, group, uid }, type:'given|received', positive:true|false, reputation } ] }

const INTERACTED_TIMEOUT = 3600000 * 12 // 12 hours
const ONLINE_TIMEOUT = 60000 * 15 // 15 minutes
const SHOW_GROUPS = ['group28', 'group66']
const REP_MESSAGE = 16
const DEFAULT_STORE = { users:{}, interactedCheck:0, onlineCheck:0 }


// users[uid] = { uid, username, group, reputation, hasInteractedWith(bool), interactions:{ given:{ positive(bool), reputation, message }, received }}
var store = GM_getValue('store') || DEFAULT_STORE

function saveStore() {
    GM_setValue('store', store)
}

function addUser(user, save=true) {
    console.log('Add user', user, save)
    if (!store.users[user.uid]) {
        store.users[user.uid] = { uid:user.uid, username:user.username, group:user.group, reputation:user.reputation, hasInteractedWith:user.hasInteractedWith || false, interactions:{} }
    } else {
        if (user.username)
            store.users[user.uid].username = user.username
        if (user.reputation)
            store.users[user.uid].reputation = user.reputation
        if (!store.users[user.uid].group)
            store.users[user.uid].group = user.group
    }
    if (save === true) {
        saveStore()
    }
}

// obj = { user:{ uid, username, group }, isGiven(bool), positive, reputation }
function addInteraction(obj, save=true) {
    let uid = obj.user.uid
    if (!hasInteractedWith(uid)) {
        if (!store.users[uid]) {
            addUser(obj.user, save)
        }
        store.users[uid].hasInteractedWith = true
        if (obj.isGiven) {
            store.users[uid].interactions.given = { positive:obj.positive, reputation:obj.reputation, message:obj.message }
        } else {
            store.users[uid].interactions.received = { positive:obj.positive, reputation:obj.reputation, message:obj.message }
        }
        if (save === true) {
            saveStore()
        }
    }
}

function hasInteractedWith(uid, isGiven=null) {
    let user = store.users[uid]
    if (user && user.hasInteractedWith === true) {
        if (isGiven != null) {
            if (isGiven) return user.interactions.given    != null
            else         return user.interactions.received != null
        } else {
            return true
        }
    } else {
        return false
    }
}

function countInteractions() {
    let count = 0
    for (let userId in store.users) {
        let user = store.users[userId]
        if (user.hasInteractedWith) {
            count++
        }
    }
    return count
}



function getLoggedInUid() {
    try       { return document.querySelector('.welcome > strong > a').href.match(/uid=([0-9]*)/)[1] }
    catch (e) { return null }
}

function getLoggedInUsername() {
    try       { return document.querySelector('.welcome > strong > a').innerText }
    catch (e) { return null }
}



function getOnlineUsers() {
    console.log('Get online users')
    return new Promise((resolve, reject) => {
        if (store.onlineCheck + ONLINE_TIMEOUT < Date.now()) {
            fetch(`${location.origin}/index.php`, { credentials:'include' }).then(r => r.text()).then(text => {
                if (text.indexOf('boardstats_e') > -1) {
                    let match, users = [], regex = /<a href=".*?uid=(.*?)"><span class="(.*?)">(.*?)<\/span><\/a>/g
                    while ((match = regex.exec(text)) !== null) {
                        if (match[1].indexOf('</span></a>, <a href=\"https://hackforums.net/member.php?action=profile') === -1) {
                            users.push({ uid:match[1], group:match[2], username:match[3] })
                        }
                    }
                    store.onlineUsers = users
                    store.onlineCheck = Date.now()
                    saveStore()
                    resolve(users)
                } else {
                    reject('bad page')
                }
            }).catch(reject)
        } else {
            resolve(store.onlineUsers)
        }
    })
}

function getProfile(uid) {
    console.log('Get profile', uid)
    return new Promise((resolve, reject) => {
        fetch(`/member.php?action=profile&uid=${uid}`, { credentials:'include' }).then(r => r.text()).then(text => {
            try {
                let reputation = parseInt(/reputation_(?:positive|negative|neutral)\">([\-0-9,.]*?)</.exec(text)[1])
                addUser({ uid, reputation })
                resolve({ reputation })
            } catch (err) {
                console.log('Could not parse profile from', text)
                reject(null)
            }
        }).catch(reject)
    })
}

function giveReputation(uid) {
    console.log('Give reputation', uid)
    return new Promise(async (resolve, reject) => {
        try {
            if (!store.repDetail) {
                store.repDetail = await fetch(`/reputation.php?action=add&uid=${uid}`, { credentials:'include' }).then(r => r.text()).then(text => {
                    return {
                        myPostKey: /my_post_key" value="(.*)"/.exec(text)[1],
                        maxRep: /option value="([0-9]*)"/.exec(text)[1]
                    }
                })
                saveStore()
            }
            fetch(`/reputation.php?modal=1`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 
            Referer: 'https://hackforums.net/member.php?action=profile&uid=' + uid },
                credentials: 'include',
                body: `my_post_key=${store.repDetail.myPostKey}&action=do_add&uid=${uid}&pid=0&rid=&nomodal=1&reputation=${store.repDetail.maxRep}&repmessage=${REP_MESSAGE}`,
                // body: `action=do_add&my_post_key=${store.repDetail.myPostKey}&nomodal=1&uid=${uid}&pid=0&reputation=${store.repDetail.maxRep}&repmessage=${REP_MESSAGE}`
            }).then(r => r.text()).then(text => {
                console.log('Got response:', text)

                if (text.indexOf('Rating Added') > -1) {
                    addInteraction({ user:{ uid }, isGiven:true, positive:true, reputation:store.repDetail.maxRep }, true)
                    resolve(true)
                } else if (text.indexOf('Rating Updated') > -1) {
                    addInteraction({ user:{ uid }, isGiven:true, positive:true, reputation:store.repDetail.maxRep }, true)
                    resolve('error 4')
                } else if (text.indexOf('You have already given as many reputation ratings as you are allowed to for today.')) {
                    resolve(false)
                } else {
                    console.log('Bad text:', text)
                    reject('error 3')
                }
            }).catch(reject)
        } catch (err) {
            reject(err)
        }
    })
}

function fetchRepPage(uid, number) {

}

function fetchRep(uid) {
    return new Promise(async (resolve, reject) => {

    })
}




function checkRepPage(url) {
    console.log('Check rep page', url)
    return new Promise((resolve, reject) => {
        fetch(url, { credentials:'include' }).then(r => r.text()).then(text => {
            let match, rep = [], totalRep, pages,
                isLastPage = !/class=\"pagination_next\"/.test(text),
                regex = /<a href=".*?uid=([0-9]*)"><span class="(.*?)">(.*?)<\/span><\/a>(?:.|\n|\r)*?<strong class="reputation_(.*?)">.*?\([-+]([0-9]*)\):</g
            if ((pages = /pagination_last">([0-9]*?)</g.exec(text)) == null) {
                let m, r = /pagination_page">([0-9]*?)</g
                while ((m = r.exec(text)) != null)
                    pages = m
            }
            pages = pages[1]
            try {
                let repFromMembers = parseInt(/from Members: ([0-9,.]*?)</.exec(text)[1])
                let repFromPosts = parseInt(/from Posts: ([0-9,.]*?)</.exec(text)[1])
                totalRep = repFromMembers + repFromPosts
            } catch (e) {}
            try {
                let repGiven = parseInt(/Given Reputations: ([0-9,.]*?)</.exec(text)[1])
                totalRep = repGiven
            } catch (e) {}
            while ((match = regex.exec(text)) != null) {
                let positive = match[4]===('positive')
                rep.push({ user:{ uid:match[1], group:match[2], username:match[3] }, positive, reputation:match[4] * positive?1:-1 })
            }
            resolve({ reputations:rep, latestReputation:rep[0], url, pages, totalRep, isLastPage })
        }).catch(reject)
    })
}

function checkRep(url) {
    console.log('Check rep', url)
    return new Promise((resolve, reject) => {
        checkRepPage(url).then(obj => {
            if (obj.latestReputation) {
                obj.reputations.forEach(rep => {
                    let isGiven = (url.indexOf('repsgiven.php') >- 1) ? true : false
                    addInteraction({ user:rep.user, positive:rep.positive, reputation:rep.reputation, isGiven }, false)
                })
                saveStore()
                if ((hasInteractedWith(obj.latestReputation.user.uid) && countInteractions() >= obj.totalRep) || obj.isLastPage) {
                    resolve(true)
                } else {
                    let done = 0
                    for (let i = 2; i <= obj.pages; i++) {
                        setTimeout(() => {
                            checkRepPage(`${url}&page=${i}`).then(obj1 => {
                                obj1.reputations.forEach(rep => {
                                    let isGiven = (url.indexOf('repsgiven.php') >- 1) ? true : false
                                    addInteraction({ user:rep.user, positive:rep.positive, reputation:rep.reputation, isGiven }, false)
                                })
                                saveStore()
                                if (done+++2 >= obj.pages) {
                                    resolve(true)
                                }
                            })
                        }, 1000*(i-2))
                    }
                }
            } else {
                resolve(null)
            }
        }).catch(reject)
    })
}

function fetchInteractedWith() {
    return new Promise((resolve, reject) => {
        if (store.interactedCheck + INTERACTED_TIMEOUT < Date.now()) {
            let uid = getLoggedInUid()
            checkRep(`${location.origin}/repsgiven.php?uid=${uid}`).then(() => {
                checkRep(`${location.origin}/reputation.php?uid=${uid}`).then(() => {
                    store.interactedCheck = Date.now()
                    saveStore()
                    resolve(true)
                }).catch(reject)
            }).catch(reject)
        } else {
            resolve(true)
        }
    })
}



function makePopup(users) {
    let buttons = '<button action="reload">Reload online</button><button action="reset">Reset storage</button><button action="close">Close</button>'
    let html = `<div id="durPopUpWin" style="background:rgba(0,0,0,0.4);position:fixed;left:0;top:0;width:100vw;height:100vh;"><div style="background:#333;text-align: center;width:600px;height:90vh;position:fixed;left:50%;top:50%;transform:translate(-50%, -50%);overflow-y:scroll;">${buttons}<table>`
    users.forEach(user => {
        let getRep = '<a href="javascript:void(0)" action="getRep">Get rep</a>'
        if (store.users[user.uid]) {
            addUser(user)
            user = store.users[user.uid]
            if (user.reputation != null) {
                if (user.reputation > 0) {
                    getRep = `<a href="javascript:void(0)" style="color:#00b500;" action="getRep">${user.reputation} rep</a>`
                } else if (user.reputation < 0) {
                    getRep = `<a href="javascript:void(0)" style="color:#ff2121;" action="getRep">${user.reputation} rep</a>`
                } else {
                    getRep = `<a href="javascript:void(0)" style="color:#c3c3c3;" action="getRep">${user.reputation} rep</a>`
                }
            }
        }
        html +=
            `<tr uid="${user.uid}">
                <td>
                    <a href="/member.php?action=profile&uid=${user.uid}"><span class="${user.group}">${user.username}</span></a>
                </td>
                <td>
                    <button action="giveRep">Give rep</button>
                </td>
                <td>
                    ${getRep}
                </td>
                <td id="repFor${user.uid}">
                </td>
            </tr>`
    })
    html += `</table>${buttons}</div></div>`
    let div = document.createElement('div')
    div.style.position = 'relative'
    div.style.zIndex = 1000
    div.innerHTML = html
    div.addEventListener('click', ev => {
       let action = ev.target.getAttribute('action')
       let uid = ev.target.parentNode.parentNode.getAttribute('uid')
        if (ev.target.tagName === 'BUTTON') {
            if (action === 'close') {
                div.remove()
            } else if (action === 'reload') {
                store.onlineCheck = 0
                div.remove()
                buttonClick()
            } else if (action === 'reset') {
                if (confirm('Are you sure you want to reset the storage?')) {
                    store = DEFAULT_STORE
                    saveStore()
                    div.remove()
                }
            } else if (action === 'giveRep') {
                let output = document.getElementById(`repFor${uid}`)
                ev.target.setAttribute('disabled', true)
                output.innerText = '...waiting.'
                giveReputation(uid).then(dailyLimitNotReached => {
                    if (dailyLimitNotReached) {
                        output.innerText = 'Done!'
                    } else {
                        output.innerText = 'Daily limit reached!'
                    }
                }).catch(err => {
                    ev.target.removeAttribute('disabled')
                    if (err === 'error 3') {
                        output.innerText = "Don't spam..."
                    } if (err === 'error 4') {
                        output.innerText = 'Double rep...??'
                    } else {
                        output.innerText = 'Error...'
                        console.log(err)
                    }
                })
            }
        } else if (ev.target.tagName === 'A') {
            if (action === 'getRep') {
                if (!ev.target.hasAttribute('busy')) {
                    ev.target.setAttribute('busy', true)
                    getProfile(uid).then(profile => {
                        ev.target.innerText = `${profile.reputation} rep`
                        if (profile.reputation > 0) {
                            ev.target.style.color = '#00b500'
                        } else if (profile.reputation < 0) {
                            ev.target.style.color = '#ff2121'
                        } else {
                            ev.target.style.color = '#c3c3c3'
                        }
                        ev.target.removeAttribute('busy')
                    }).catch(console.log)
                }
            }
        }
    })
    document.body.appendChild(div)
}

function buttonClick() {
    getOnlineUsers().then(onlineUsers => {
        fetchInteractedWith().then(() => {
            let myUsername = getLoggedInUsername()
            let noInteract = onlineUsers.filter(onlineUser => {
                if (onlineUser.username !== myUsername) {
                    if (!hasInteractedWith(onlineUser.uid)) {
                        if (SHOW_GROUPS.includes(onlineUser.group)) {
                            return true
                        }
                    }
                }
                return false
            })
            makePopup(noInteract)
            console.log('Has not interacted with the following users(' + noInteract.length + '):', noInteract.map(e => e.username).join(', '))
        }).catch(console.log)
    }).catch(console.log)
}

function addButton() {
    let li = document.createElement('li')
    let a  = document.createElement('a')
    a.href = 'javascript:void(0)'
    a.innerText = 'R3P H4CK'
    a.addEventListener('click', buttonClick)
    li.appendChild(a)
    document.querySelector('.panel_links').appendChild(li)
}
addButton()

console.log(GM_getValue('store'))