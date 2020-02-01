// ==UserScript==
// @name         Ifrågasätt Gets Rekt
// @namespace    https://github.com/josefandersson/userscripts
// @version      1.0
// @description  Manipulate ratings on others' comments
// @author       DrDoof
// @match        https://comment.ifragasatt.se/comment?*
// @grant        none
// ==/UserScript==

const REACT = {
    like: "Gilla",
    love: "Älska",
    haha: "HaHa",
    wow: "Wow",
    sad: "Ledsen",
    angry: "Arg",
}


function vote(commentId, reactions) {
    return new Promise((resolve, reject) => {
        fetch('https://service.ifragasatt.se/comment/vote', {
            // credentials: 'include',
            method: 'POST',
            headers: {
                'Content-Type':'application/json'
            },
            body: `{"commentId":${commentId},"emoji":"like","reactions":[{"type":"like","text":"Gilla","count":${reactions.like}},{"type":"love","text":"Älska","count":${reactions.love}},{"type":"haha","text":"HaHa","count":${reactions.haha}},{"type":"wow","text":"Wow","count":${reactions.wow}},{"type":"sad","text":"Ledsen","count":${reactions.sad}},{"type":"angry","text":"Arg","count":${reactions.angry}}]}`
        }).then(r => r.json()).then(json => {
            console.log('Vote response:', json)
            if (json.success) resolve()
            else              reject()
        })
    })
}

function populateComments() {
    [...document.getElementsByClassName('comment')].forEach(comment => {
        if (!comment.hasAttribute('H4CK3D')) {
            let commentId = comment.id.split('-')[1]
            let button = document.createElement('button')
            button.innerText = 'H4CK'
            button.style.marginRight = '5px'
            button.style.fontSize = '9px'
            button.onclick = () => {
                let reactions = {};
                [...document.querySelectorAll(`#${comment.id} > div.media > div.media-content > footer > div.flex--start.flex > div > div > div > span.reaction-icons > span`)].forEach(reaction => {
                    let type = reaction.getAttribute('data-reaction')
                    let count = reaction.getAttribute('data-count')
                    console.log('Reactions element:', reaction, type, count)
                    reactions[type] = count
                })
                let reactionsToArray = []
                for (let type of ['like', 'love', 'haha', 'wow', 'sad', 'angry']) {
                    if (reactions[type]) reactionsToArray.push(reactions[type])
                    else                 reactionsToArray.push('0')
                }
                console.log(reactions, reactionsToArray)
                let val = prompt('Enter reactions spaced with ",". Eg. 0,0,0,3,5,2.', reactionsToArray.join(','))
                if (val) {
                    let split = val.split(',')
                    if (split.length === 6) {
                        button.setAttribute('disabled', true)
                        let votes = {
                            like:parseInt(split[0]),
                            love:parseInt(split[1]),
                            haha:parseInt(split[2]),
                            wow:parseInt(split[3]),
                            sad:parseInt(split[4]),
                            angry:parseInt(split[5]),
                        }
                        vote(commentId, votes).then(() => {
                            document.querySelector(`#${comment.id} > div.media > div.media-content > footer > div.flex--start.flex > div > div > div > span.reactions-details`).innerText = 
                                votes.like + votes.love + votes.haha + votes.wow + votes.sad + votes.angry
                            let html = ''
                            for (let t in votes) {
                                if (votes[t] !== 0)
                                    html += `<span data-reaction="${t}" data-reaction-name="${REACT[t]}" data-count="${votes[t]}" class="reaction reaction-small"></span>`
                                else
                                    html += '<!---->'
                            }
                            document.querySelector(`#${comment.id} > div.media > div.media-content > footer > div.flex--start.flex > div > div > div > span.reaction-icons`).innerHTML = html
                        }).catch(() => {})

                        
                    }
                }
            }
            comment.querySelector('.comment-author').appendChild(button)
            comment.setAttribute('H4CK3D', true)
        }
    })
}


(function() {
    'use strict';

    var vid = setInterval(() => {
        if (document.getElementsByClassName('comment').length > 0) {
            // clearInterval(vid)
            populateComments()
        }
    }, 1000)
})();