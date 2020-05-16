// ==UserScript==
// @name         YouTube Slightly Better
// @namespace    https://github.com/josefandersson/userscripts/tree/master/youtube-slightly-better
// @version      1.0
// @description  Adds some useful controls to YouTube
// @author       DrDoof
// @match        https://www.youtube.com/*
// @icon         https://youtube.com/favicon.ico
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

// TODO: Playlists: reverse, shuffle
//       Disable autoplaying 'channel trailer' video on channel page
//       Minimize player when scrolling down

const ENABLED_MODULES = ['mModulePlaybackRate', 'mOpenThumbnail', 'mScreenShot', 'mGoToTimestamp', 'mModuleHistory'];

const MIN_PLAYBACK_RATE = .1;
const MAX_PLAYBACK_RATE = 3;
const PLAYBACK_STEP = .05;
const MIN_TIME_WATCHED_BEFORE_SEEN = 7000; // n milliseconds or 80% of video length

let keyListeners = {};

function keyEvent(ev, event) {
    if (keyListeners[ev.key] && keyListeners[ev.key][event])
        if (ev.key === 'Escape' || (ev.target.getAttribute('contenteditable') != 'true' && ['INPUT', 'SELECT', 'TEXTAREA'].indexOf(ev.target.tagName) === -1))
            keyListeners[ev.key][event].forEach(cb => cb(ev, event));
}

document.addEventListener('keypress', ev => keyEvent(ev, 'keypress'));
document.addEventListener('keyup', ev => keyEvent(ev, 'keyup'));
document.addEventListener('keydown', ev => keyEvent(ev, 'keydown'));

GM_registerMenuCommand('YT Better Controls settings', () => console.log('Settings command was issued!'), 'y');

const cr = (type, obj) => Object.assign(document.createElement(type), obj || {});

(() => {
    class mModule {
        constructor() {
            this.element = cr('div');
            container.appendChild(this.element);
            this.items = [];
        }
        addItem(item) {
            this.items.push(item);
            this.element.appendChild(item.element);
            return item;
        }
        registerKeys(keys, event='keypress') {
            keys.forEach(key => {
                if (!keyListeners[key]) keyListeners[key] = {};
                if (!keyListeners[key][event]) keyListeners[key][event] = [];
                keyListeners[key][event].push((ev, eventName) => this.onKey(ev, eventName));
            });
        }
        unregisterKeys(keys, event=null) {
            keys.forEach(key => {
                if (keyListeners[key]) {
                    if (event && keyListeners[key][event]) keyListeners[key][event].length = 0;
                    else if (!event) keyListeners[key] = {};
                }
            });
        }
        onKey(ev) { ev.preventDefault(); }
    }

    // ====================
    // Playback Rate Module
    // ====================
    // 
    // - Change video playback rate by clicking on S or F. (Hold and release to change rate faster)
    // - Current rate is shown between S and F. Click current rate to reset rate to 1.
    // - Use keybindings a, s, d for the three buttons respectively.
    //
    mModule.mModulePlaybackRate = class mModulePlaybackRate extends mModule {
        constructor() {
            super();
            this.slower = this.addItem(new mItemBtnHold(this, 'S'));
            this.speed = this.addItem(new mItemBtn(this, this.getPlaybackRateStr()));
            this.faster = this.addItem(new mItemBtnHold(this, 'F'));
            this.slower.addOnClick(() => this.changePlaybackRate(-PLAYBACK_STEP));
            this.speed.addOnClick(() => {
                if (!this.setPlaybackRate(1))
                    this.clearDown();
            });
            this.faster.addOnClick(() => this.changePlaybackRate(PLAYBACK_STEP));
            this.registerKeys(['a', 's', 'd']);
        }
        getPlaybackRateStr() { return video.playbackRate.toFixed(2) + ''; }
        changePlaybackRate(diff) { return this.setPlaybackRate(video.playbackRate + diff); }
        setPlaybackRate(rate) {
            video.playbackRate = Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, rate));
            this.speed.element.innerText = this.getPlaybackRateStr();
            return video.playbackRate === rate;
        }
        onKey(ev) {
            super.onKey(ev);
            if (ev.key === 'a') this.changePlaybackRate(-PLAYBACK_STEP);
            else if (ev.key === 's') this.setPlaybackRate(1);
            else if (ev.key === 'd') this.changePlaybackRate(PLAYBACK_STEP);
        }
    }


    // =====================
    // Open Thumbnail Module
    // =====================
    //
    // - Open video thumbnail by clicking on B.
    // - Use keybinding b to open thumbnail.
    //
    mModule.mOpenThumbnail = class mOpenThumbnail extends mModule {
        constructor() {
            super();
            this.open = this.addItem(new mItemBtn(this, 'B'));
            this.open.addOnClick(() => this.openThumbnail());
            this.registerKeys(['b']);
        }
        openThumbnail() {
            const url = this.getThumbnailUrl();
            if (url) {
                const link = cr('a', { target:'_blank', href:url });
                link.click();
            }
        }
        getThumbnailUrl() {
            const videoId = new URLSearchParams(location.search).get('v');
            if (videoId) return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
            else         return null;
        }
        onKey(ev) {
            super.onKey(ev);
            this.openThumbnail();
        }
    }

    
    // =====================
    // Screenshot Module
    // =====================
    //
    // - Take screenshot and download it by clicking on H.
    // - Use keybinding h to take screenshot.
    //
    mModule.mScreenShot = class mScreenShot extends mModule {
        constructor() {
            super();
            this.screenshot = this.addItem(new mItemBtn(this, 'H'));
            this.screenshot.addOnClick(() => this.takeScreenshot());
            this.registerKeys(['h']);
        }
        takeScreenshot() {
            const canvas = cr('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            const context = canvas.getContext('2d');
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/png').replace('image/png', 'image/octet-stream');
            const videoId = new URLSearchParams(location.search).get('v');
            const link = cr('a', { download:`screenshot-${videoId}.png`, href:dataUrl });
            link.click();
        }
        onKey(ev) {
            super.onKey(ev);
            this.takeScreenshot();
        }
    }

    
    // =====================
    // Go To Timestamp Module
    // =====================
    //
    // - Prompt for timestamp by clicking on G.
    // - Use keybinding g to open prompt.
    //
    mModule.mGoToTimestamp = class mGoToTimestamp extends mModule {
        constructor() {
            super();
            this.goto = this.addItem(new mItemBtn(this, 'G'));
            this.goto.addOnClick(() => this.handleOnClick());
            this.registerKeys(['g']);
            this.registerKeys(['Escape'], 'keyup');
        }
        handleOnClick() {
            this.openPrompt();
        }
        onKey(ev) {
            super.onKey(ev);
            if (ev.key === 'g') {
                this.handleOnClick();
            } else {
                console.log('onKeYYdfasfdDF:', ev.key);
            }
        }
        goToTimestamp(str) {
            console.log('Attempting to hop to', str);
        }
        openPrompt() {
            if (this.prompt) return this.closePrompt();
            this.prompt = cr('div', { className:'ytbc-p' });
            const input = cr('input', { type:'text', autofill:'off', size:1 });
            const allowedTimestamp = /^([0-5]{0,1}[0-9]{1}(:[0-5]{0,1}[0-9]{1}){0,2})$/;
            const badCharacters = /[^0-9:]/g;
            input.addEventListener('input', ev => {
                if (ev.data && badCharacters.test(ev.data))
                    input.value = input.value.replace(badCharacters, '');
                input.setAttribute('size', input.value.length || 1);
                if (allowedTimestamp.test(input.value)) {
                    input.style.backgroundColor = '#3cd23a8c';
                    input.style.color = '#0c3511';
                } else {
                    input.style.backgroundColor = '#d019108c';
                    input.style.color = '#350505';
                }
            });
            input.addEventListener('keypress', ev => {
                if (ev.key === 'Enter') {
                    if (allowedTimestamp.test(input.value))
                        this.goToTimestamp(input.value);
                    this.closePrompt();
                }
            });
            input.addEventListener('focusout', () => this.closePrompt());
            this.prompt.appendChild(input);
            document.body.appendChild(this.prompt);
            input.select();
        }
        closePrompt() {
            if (this.prompt) {
                this.prompt.remove();
                this.prompt = null;
                this.handleOnClick();
            }
        }
    }

    
    // =====================
    // History Module
    // =====================
    //
    // - Remember all watched videos and print how many times current video has been watched.
    //
    mModule.mModuleHistory = class mModuleHistory extends mModule {
        constructor() {
            super();
            this.seen = this.addItem(new mItemBtn(this, '-'));
            this.seen.addOnClick(() => this.onClick());
            this.currentPlaytime = 0;
            this.isPlaying = false;
            video.addEventListener('loadeddata', ev => this.onChange(ev));
            video.addEventListener('play', ev => this.onPlay(ev));
            video.addEventListener('pause', ev => this.onPause(ev));
            this.onChange();
        }
        onChange() {
            const prevVideoId = this.videoId;
            this.isCounted = false;
            this.videoId = new URLSearchParams(location.search).get('v');
            if (this.videoId && this.videoId !== prevVideoId) {
                this.historyData = GM_getValue(`h-${this.videoId}`, null);
                if (this.historyData) {
                    this.seen.element.innerText = this.historyData.n;
                    this.seen.element.style.color = '#ff4343';
                } else {
                    this.seen.element.innerText = '0';
                    this.seen.element.style.color = 'inherit';
                }
                this.minimumTime = Math.min(MIN_TIME_WATCHED_BEFORE_SEEN, video.duration * 800);
                this.onPause();
                this.currentPlaytime = 0;
                if (!video.paused)
                    this.onPlay();
            }
        }
        onPlay() {
            if (!this.isPlaying) {
                this.isPlaying = true;
                this.startedPlayingAt = Date.now();
                if (!this.isCounted)
                    this.timeoutId = setTimeout(() => this.makeCounted(), Math.max(this.minimumTime - this.currentPlaytime, 0));
            }
        }
        onPause() {
            clearTimeout(this.timeoutId);
            if (this.isPlaying) {
                this.isPlaying = false;
                if (this.startedPlayingAt) {
                    const diff = Date.now() - this.startedPlayingAt;
                    this.currentPlaytime += diff;
                }
            }
        }
        onClick() {
            this.makeCounted();
            // TODO: add a removeCounted method if user want to undo last record?
        }
        makeCounted() {
            if (!this.isCounted) {
                this.isCounted = true;
                const startedWatchingAt = this.startedWatchingAt || Date.now();
                if (this.historyData) {
                    this.historyData.l = startedWatchingAt;
                    this.historyData.n ++;
                } else
                    this.historyData = { f:startedWatchingAt, l:startedWatchingAt, n:1 };
                GM_setValue(`h-${this.videoId}`, this.historyData);
                this.seen.element.style.color = '#4af150';
                this.seen.element.innerText = this.historyData.n;
            }
        }
    }









    class mItem {
        constructor(module) {
            this.module = module;
            this.element = cr('span');
        }
    }
    class mItemTxt extends mItem { // displays text
        constructor(module, str) {
            super(module);
            this.element.innerText = str;
        }
    }
    class mItemBtn extends mItemTxt { // click handle
        constructor(module, str) {
            super(module, str);
            this.element.classList.add('btn');
            this.onClickCbs = [];
            this.element.onclick = ev => this.onClick(ev);
        }
        addOnClick(cb) { return this.onClickCbs.push(cb); }
        onClick(ev) {
            if (ev.button !== 0) return;
            ev.preventDefault();
            this.onClickCbs.forEach(cb => cb());
        }
    }
    class mItemBtnHold extends mItemBtn { // click handle and hold handle
        constructor(module, str, clickDelay=200, clickRate=100) {
            super(module, str);
            this.clickDelay = clickDelay;
            this.clickRate = clickRate;
            this.element.onmousedown = ev => this.onDown(ev);
            this.element.onmouseup = ev => this.onUp(ev);
            this.element.onmouseleave = ev => this.onUp(ev);
        }
        clearDown() {
            clearTimeout(this.down);
            clearInterval(this.down);
            this.down = null;
        }
        onDown(ev) {
            if (ev.button !== 0) return;
            ev.preventDefault();
            if (this.down) this.clearDown();
            this.down = setTimeout(() => {
                this.down = setInterval(() => {
                    this.onClick();
                }, this.clickRate);
            }, this.clickDelay);
        }
        onUp(ev) {
            if (ev.button !== 0) return;
            ev.preventDefault();
            this.clearDown();
        }
        onClick() { this.onClickCbs.forEach(cb => cb()); }
    }
    class mItemToggle extends mItemBtn { // togglable button
        constructor(module, str, state=false) {
            super(module, str);
            this.state = state;
            this.onChangeCbs = [];
        }
        addOnChange(cb) { return this.onChangeCbs.push(cb); }
        onClick(ev) {
            if (ev.button !== 0) return;
            super.onClick(ev);
            this.state = !this.state;
            this.onChangeCbs.forEach(cb => cb(ev, this.state));
        }
    }

    GM_addStyle(
`.ytbc{float:right;color:white;}
.ytbc>div{display:inline-block;margin:0 4px;}
.ytbc>div>span{margin:0 2px;}.ytbc .btn{cursor:pointer;}
.ytbc-p{z-index:1000;position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;backdrop-filter:blur(1.5px);}
.ytbc-p>input{
    pointer-events:auto;position:fixed;top:50vh;left:50vw;transform:translate(-50%,-50%);
    color:#350505;background-color:#d019108c;font-size:20px;padding:10px;border:none;text-align:center;}
.ytbc-p>input:focus{outline:none;}`);

    let title, video, container;
    let modules = null;

    function init() {
        container = cr('div', { className:'ytbc' });

        modules = ENABLED_MODULES.map(name => new mModule[name]());

        title.parentElement.insertBefore(container, title);
    }

    let id = setInterval(() => {
        if (!title) title = document.querySelector('#container>.title');
        if (!video) video = document.querySelector('video');
        if (title && video) {
            clearInterval(id);
            setTimeout(init, 20);
        }
    }, 50);
})();