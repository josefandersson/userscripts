// ==UserScript==
// @name         Travian Enhanced
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Enhance your Travian experience
// @author       DrDoof
// @match        https://*.travian.com/*
// @require      https://craig.global.ssl.fastly.net/js/mousetrap/mousetrap.min.js
// @grant        GM.getValue
// @grant        GM.setValue
// ==/UserScript==

(function() {
    'use strict';

    let data

    (async () => {
        data = await (GM.getValue('data')) || {}

        if (!data.player)
            data.player = {}
        if (!data.player.villages)
            data.player.villages = []
        if (!data.alliance)
            data.alliance = {}
        if (!data.alliance.players)
            data.alliance.players = {}

        readPageInfo()

        console.log(data)
    })()

    if (/\/allianz.php/.test(window.location.href)) {
        let container = document.querySelector('.contentContainer')
        let div = document.createElement('div')
        div.style.margin = '5px 20px'
        div.innerHTML = `<p>Travian Enhanced</p>
            <form action='#' id='searchNearbyForm'>
                <label for='tileX'>x</label><input id='tileX' type='number' value='0' style='width:55px'>
                <label for='tileY'>y</label><input id='tileY' type='number' value='0' style='width:55px'>
                <label for='flags'>flags</label><select multiple id='flags' style='height:120px'>
                    <option selected>online</option>
                    <option selected>24hrs</option>
                    <option selected>3days</option>
                    <option selected>7days</option>
                    <option selected>roman</option>
                    <option selected>gaul</option>
                    <option selected>teuton</option>
                    <option>oasis</option>
                </select>
                <input type='submit' value='Search'>
            </form>`
        container.appendChild(div)

        document.querySelector('#searchNearbyForm').addEventListener('submit', ev => {
            ev.preventDefault()
            let x = document.getElementById('tileX').value
            let y = document.getElementById('tileY').value
            let flags = {}
            ;[...document.getElementById('flags').options].forEach(i => flags[i.value] = i.selected)

            if (flags.length < 1) return

            getMapTiles(x, y, 2).then(json => {
                // console.log(json.tiles.map(t => Math.sqrt(Math.pow(t.position.x - x, 2) + Math.pow(t.position.y - y, 2))))
                let tiles = json.tiles
                    .filter(tile => tile.aid === data.alliance.id) // same alliance
                    .filter(tile => { // status and tribe flags
                        let player = data.alliance.players[tile.uid]
                        return flags[player.status] && flags[player.tribe]
                    })
                    .filter(tile => tile > 0 || flags.oasis) // oasis flag
                    .filter(tile => )
                console.log(tiles)
            }).catch(console.error)
        })
    }

    // if (/\/karte.php/.test(window.location.href)) {
    //     let menu = document.querySelector('#contextmenu div.background-content')
    //     menu.appendChild(menu.children[1].cloneNode(true))
    //     let contents = menu.appendChild(menu.children[2].cloneNode(true))
    //     contents = contents.children[1].children[0].children[0]
    //     contents.innerHTML = `<div class='title'>TravianE</div>
    //         <div class='entry'>
    //         <a href='#'>Search neighbors</a>
    //         </div>`
    // }

    let keyBinds = {
        '1': 'MENU_DORF1',
        '2': 'MENU_DORF2',
        '3': 'MENU_MAP',
        '4': 'MENU_STATS',
        '5': 'MENU_REPORTS',
        '6': 'MENU_MESSAGES',
        'r': 'PAGE_RELOAD',
    }

    for (let key in keyBinds) {
        Mousetrap.bind(key, () => executeKeyBind(keyBinds[key]))
    }

    function executeKeyBind(id) {
        if (!id)
            return
        else if (id === 'MENU_DORF1')
            location.href = '/dorf1.php'
        else if (id === 'MENU_DORF2')
            location.href = '/dorf2.php'
        else if (id === 'MENU_MAP')
            location.href = '/karte.php'
        else if (id === 'MENU_STATS')
            location.href = '/statistiken.php'
        else if (id === 'MENU_REPORTS')
            location.href = '/berichte.php'
        else if (id === 'MENU_MESSAGES')
            location.href = '/messages.php'
        else if (id === 'PAGE_RELOAD')
            location.reload()
    }

    function addResourcesTool() {

    }

    function readPageInfo() {
        let playerName = document.querySelector('.playerName > a:nth-child(2)')
        if (playerName) data.player.name = playerName.innerText

        if (/\/allianz.php/.test(window.location.href)) {
            let tabs = document.querySelectorAll('.tabItem')
            if (tabs.length > 3
                    && tabs[1].parentElement.classList.contains('favorActive') // profile
                    && tabs[7].parentElement.classList.contains('favorActive')) { // members
                data.alliance.id = /aid=([0-9]*)/.exec(document.querySelectorAll('.tabItem')[4].href)[1]
                data.alliance.players = {}
                ;[...document.querySelectorAll('.allianceMembers tr')].slice(1, -1).map(tr => {
                    let tribe = [,'roman','teuton','gaul'][parseInt(tr.children[1].children[0].className.charAt(5))]
                    let status = [,'online','24hrs','7days','inactive'][parseInt(tr.children[2].children[0].className.charAt(6))]
                    let username = tr.children[2].children[1].innerText
                    let uid = parseInt(/uid=([0-9]*)/.exec(tr.children[2].children[1].href)[1])

                    data.alliance.players[uid] = {}
                    data.alliance.players[uid].username = username
                    data.alliance.players[uid].status = status
                    data.alliance.players[uid].tribe = tribe
                })
            }
        }

        if (/\/spieler.php?/.test(window.location.href)) {
            let uid = /uid=([0-9]*)/.exec(window.location.href)[1]
        }

        GM.setValue('data', data)
    }

    function getMapTiles(x, y, zoom) {
        return new Promise((resolve, reject) => {
            Travian.ajax({
                url: 'ajax.php?cmd=mapPositionData',
                data: {
                    cmd: 'mapPositionData',
                    ajaxToken: Travian.tacklingParenthesizingJaxartes(),
                    data: {
                        x, y,
                        zoomLevel: zoom // 1=11x9, 2=21x17, 3=???=961
                    }
                },
                onError: reject,
                onSuccess: resolve
              })
        })
    }
})();