// ==UserScript==
// @name         HF Keyboard Shortcuts
// @namespace    https://github.com/josefandersson/userscripts
// @version      1.0
// @description  Use your keyboard to quickly navigate hackforums using a ton of shortcuts.
// @author       DrDoof
// @icon         https://hackforums.net/favicon.ico
// @match        *://hackforums.net/*
// @require      https://craig.global.ssl.fastly.net/js/mousetrap/mousetrap.min.js
// @require      https://code.jquery.com/jquery-3.1.0.min.js
// @grant        GM_addStyle
// @grant        GM_getResourceText
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// ==/UserScript==

/*
    shortcut object:
    { bind:<key bind>, callback:<callback function, gets passed: UID> }

    All shortcuts:
    r - reload current page
    b - open buddy list     - MyBB.popupWindow('https://hackforums.net/misc.php?action=buddypopup', 'buddyList', 350, 350);
    v - open my reputations - https://hackforums.net/reputation.php?uid={UID}
    t - open my trust scan  - https://hackforums.net/trustscan.php?uid={UID}
    backspace - go to previous page in history

    1 - view new posts     https://hackforums.net/search.php?action=getnew
    2 - your threads       https://hackforums.net/search.php?action=finduserthreads&uid={UID}
    3 - your psots         https://hackforums.net/search.php?action=finduser&uid={UID}
    4 - private messages   https://hackforums.net/private.php
    5 - your profile       https://hackforums.net/member.php?action=profile
    6 - user control panel https://hackforums.net/usercp.php

    alt+1 - home page        https://hackforums.net/
    alt+2 - upgrades page    https://hackforums.net/upgrade.php
    alt+3 - search page      https://hackforums.net/search.php
    alt+4 - member list page https://hackforums.net/memberlist.php
    alt+5 - extras page      https://hackforums.net/extras.php
    alt+6 - wiki page        http://hackforumswiki.net/
    alt+7 - help page        https://hackforums.net/misc.php?action=help
    alt+8 - follow page      https://twitter.com/hackforumsnet
    alt+9 - contact page     https://hackforums.net/contact.php
    alt+0 - open dd database   https://hackforums.net/disputedb.php

    /showthread.php?tid=*
    e       - jump to first post in thread https://hackforums.net/showthread.php?tid={TID}#posts
    shift+e - jump to first post on page   https://hackforums.net/showthread.php?tid={TID}&page={PAGE}#posts
    w       - select previous post
    s       - select next post
    a       - go to previous page
    d       - go to next page
    q       - quote selected post
    space   - open/close spoilers in post // TODO
    shift+q - add selected post to quote queue
    shift+r - reply to thread (also loads quote queue)
    shift+f - open post author's profile
    shift+v - open post author's reputation
    shift+t - open post author's trust scan
    shift+g - send a pm to post author

    //TODO
    PREVENT {PAGE} FROM GOING OUTSIDE THE EXISTING PAGE INTERVALS
    VOTING
    RATE THREAD
    BROWSE SUBFORUMS
    BUDDY LIST POPUP SHOULD NOT HAVE ANY SHORTCUTS EXCEPT FOR ESC TO CLOSE THE WINDOW
    /search.php?action=results*
    w - move up a box
    s - move down a box
    a - move left a box
    d - move right a box
    space - open link in selected box
*/


var TID, UID, PAGE;
try { TID  = /tid=(\d+)/ .exec(window.location.href)[1];                              } catch(e) {}
try { UID  = /uid=(\d+)/ .exec(document.getElementById('panel').innerHTML)[1];        } catch(e) {}
try { PAGE = parseInt((/page=(\d+)/.exec(window.location.href) || [undefined,1])[1]); } catch(e) {}

// To prevent lag, we limit excessive work to once every 150ms. (Like finding the current post.)
// When this is true, a work has started within the last 150ms.
var busy = false;

// Creates a callback that returns a specified link with populated variables.
var makeSendLinkCallback = function(url) {
    return e=>{
        url = url.replace(/{TID}/g,  TID );
        url = url.replace(/{UID}/g,  UID );
        url = url.replace(/{PAGE}/g, PAGE);
        window.location.href = url;
    };
};


/* Check if work is currently already being done and if not, start doing work. */
function checkLimitWork() {
    if (busy) { return false; }
    else      {
        setTimeout(() => { busy = false; }, 175);
        return (busy = true);
    }
}




/* Get the object reference to the post (in the current thread on the current page) nearest the top of the viewport. */
function getCurrentPost(return_null) {
    if (checkLimitWork() === false) return false;

    // TODO: Instead of constantly search through posts. Put a className on the previous current post and move to the next post from that. yeboi
    /* border-style: solid;
       border-width: 1px;
       border-color: yellow; */

    var winTop = $(this).scrollTop();
    var $posts = $('table.tborder');

    // Find the post nearest the top.
    var top = $.grep($posts, (item) => {
        return $(item).position().top <= winTop;
    }).pop();

    // Check if it's a valid post, else return the post at the top of the page.
    if (top && top.id.startsWith('post_')) {
        return top;
    } else {
        if (return_null) return null;
        else             return $('table.tborder')[1];
    }
}


/* Scroll the viewport to the next post. */
function scrollNextPost() {
    var next_post = $(getCurrentPost()).next().next();
    if (next_post.length) {
        $('html, body').animate({
            scrollTop: next_post.offset().top
        }, 150);
    }
}


/* Scroll the viewport to the previous post. */
function scrollPreviousPost() {
    var previous_post = $(getCurrentPost()).prev().prev();
    if (previous_post.length) {
        $('html, body').animate({
            scrollTop: previous_post.offset().top
        }, 150);
    }
}


/* Quote the post nearest the top of the viewport. */
function quoteCurrentPost() {
    var current_post = $(getCurrentPost(true));
    if (current_post.length) {
        current_post.find('.post_management_buttons > a')[0].click();
    }
}

/* Add or remove the post nearest the top of the viewport from the quote queue. */
function toggleQuoteQueueCurrentPost() {
    var current_post = $(getCurrentPost(true));
    if (current_post.length) {
        current_post.find('.post_management_buttons a')[1].click();
        Thread.multiQuote(parseInt(/\d*$/.exec(current_post.find('.post_management_buttons a')[1].id)));
    }
}

/* Open or close all spoilers in current post. */
function toggleSpoilersInPost() {
    var current_post = $(getCurrentPost(true));
    if (current_post.length) {
        if (current_post.hasClass('hfks_op')) {
            // close spoilers
            current_post.find('.spoiler_header > a').each((i,e) => {
                if (e.innerText === '(Click to Hide)') {
                    e.click();
                }
            });
        } else {
            // open spoilers
            current_post.find('.spoiler_header > a').each((i,e) => {
                if (e.innerText === '(Click to View)') {
                    e.click();
                }
            });
        }
        current_post.toggleClass('hfks_op');
    }
}


// All the keybindings.
var _BINDS = {
    '.*': {
        'backspace': { desc:'Go back a page',      cb: e=>history.back()                                                                               },
        'r':         { desc:'Reload current page', cb: e=>window.location.reload()                                                                     },
        'b':         { desc:'Open buddy list',     cb: e=>MyBB.popupWindow('https://hackforums.net/misc.php?action=buddypopup', 'buddyList', 350, 350) },
        'v':         { desc:'Open my reputations', cb: makeSendLinkCallback('https://hackforums.net/reputation.php?uid={UID}')                         },
        't':         { desc:'Open my trust scan',  cb: makeSendLinkCallback('https://hackforums.net/trustscan.php?uid={UID}')                          },

        '1':         { desc:'View new posts',    cb: makeSendLinkCallback('https://hackforums.net/search.php?action=getnew')                           },
        '2':         { desc:'View your threads', cb: makeSendLinkCallback('https://hackforums.net/search.php?action=finduserthreads&uid={UID}')        },
        '3':         { desc:'View your posts',   cb: makeSendLinkCallback('https://hackforums.net/search.php?action=finduser&uid={UID}')               },
        '4':         { desc:'View your PMs',     cb: makeSendLinkCallback('https://hackforums.net/private.php')                                        },
        '5':         { desc:'View your profile', cb: makeSendLinkCallback('https://hackforums.net/member.php?action=profile')                          },
        '6':         { desc:'Go to UserCP',      cb: makeSendLinkCallback('https://hackforums.net/usercp.php')                                         },

        'alt+1':     { desc:'Go to home page',     cb: makeSendLinkCallback('https://hackforums.net/')                                                 },
        'alt+2':     { desc:'Go to upgrades page', cb: makeSendLinkCallback('https://hackforums.net/upgrade.php')                                      },
        'alt+3':     { desc:'Go to search page',   cb: makeSendLinkCallback('https://hackforums.net/search.php')                                       },
        'alt+4':     { desc:'Go to members page',  cb: makeSendLinkCallback('https://hackforums.net/memberlist.php')                                   },
        'alt+5':     { desc:'Go to extras page',   cb: makeSendLinkCallback('https://hackforums.net/extras.php')                                       },
        'alt+6':     { desc:'Go to wiki page',     cb: makeSendLinkCallback('http://hackforumswiki.net/')                                              },
        'alt+7':     { desc:'Go to help page',     cb: makeSendLinkCallback('https://hackforums.net/misc.php?action=help')                             },
        'alt+8':     { desc:'Go to follow page',   cb: makeSendLinkCallback('https://twitter.com/hackforumsnet')                                       },
        'alt+9':     { desc:'Go to contact page',  cb: makeSendLinkCallback('https://hackforums.net/contact.php')                                      },
        'alt+0':     { desc:'Go to DD database',   cb: makeSendLinkCallback('https://hackforums.net/disputedb.php')                                    },
    },
    '/showthread\\.php\\?tid=.*': {
        'shift+e': { desc:'Jump to first post on page',   cb: makeSendLinkCallback('#content')                                                         },
        'e':       { desc:'Jump to first post in thread', cb: makeSendLinkCallback('https://hackforums.net/showthread.php?tid={TID}#content')          },
        'shift+r': { desc:'Reply to thread.',             cb: makeSendLinkCallback('https://hackforums.net/newreply.php?tid={TID}&load_all_quotes=1')  },
        'w':       { desc:'Jump to previous post',        cb: e=>{ scrollPreviousPost(); } },
        's':       { desc:'Jump to next post',            cb: e=>{ scrollNextPost();     } },
        'a':       { desc:'Jump to previous page',        cb: e=>{ makeSendLinkCallback(`https://hackforums.net/showthread.php?tid={TID}&page=${ PAGE-1 }#content`)(); } },
        'd':       { desc:'Jump to next page',            cb: e=>{ makeSendLinkCallback(`https://hackforums.net/showthread.php?tid={TID}&page=${ PAGE+1 }#content`)(); } },
        'q':       { desc:'Quote selected post',          cb: e=>{ quoteCurrentPost(); } },
        'shift+q': { desc:'Quote queue selected post',    cb: e=>{ toggleQuoteQueueCurrentPost(); } },
        'x':       { desc:'Open/close spoilers',          cb: e=>{ toggleSpoilersInPost(); } },
    },
    /*'(/search\\.php\\?action=results.*)|(/forumdisplay\\.php\\?fid=.*)': {
        'w': { desc:'Navigate up.',    cb: e=>table.selectAdjacentToSelected(0) },
        'd': { desc:'Navigate right.', cb: e=>table.selectAdjacentToSelected(1) },
        's': { desc:'Navigate down.',  cb: e=>table.selectAdjacentToSelected(2) },
        'a': { desc:'Navigate left.',  cb: e=>table.selectAdjacentToSelected(3) },
    }
    TABLE SOLUTION DOESN'T EXIST IN THIS VERSION
    */
};


// Initiate. Run on page load.
(function() {
    // Add custom CSS.
    GM_addStyle('.selected { border: 2px solid yellow !important; }');

    // Special cases for some pages.
    if (/http[s]?:\/\/hackforums\.net\/misc\.php\?action=buddypopup/.test(window.location.href)) { Mousetrap.bind('esc', window.close); return; } // TODO: make a better solution for binding shortcuts to special cases.
    // if (/http[s]?:\/\/hackforums\.net\/search\.php\?action=results.*/.test(window.location.href)) { console.log('hello world'); table = new Table(); console.log(table); }
    // TABLE SOLUTION DOESN'T EXIST IN THIS VERSION
    
    // Bind keyboard shortcuts.
    var page, shortcut;
    for (var page_match in _BINDS) {
        if (new window.RegExp(page_match).test(window.location.href)) {
            page = _BINDS[page_match];
            for (var bind in _BINDS[page_match]) {
                shortcut = page[bind];
                Mousetrap.bind(bind, shortcut.cb);
            }
        }
    }
})();




/*
let s = document.createElement('script');
s.src = 'https://code.jquery.com/jquery-3.1.0.min.js';
document.head.appendChild(s);*/
