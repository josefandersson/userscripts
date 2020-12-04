// ==UserScript==
// @name         YouTube Slightly Better
// @namespace    https://github.com/josefandersson/userscripts/tree/master/youtube-slightly-better
// @version      1.33
// @description  Adds some extra features to YouTube
// @author       DrDoof
// @match        https://www.youtube.com/*
// @icon         https://youtube.com/favicon.ico
// @require      https://raw.githubusercontent.com/josefandersson/userscripts/master/userscript-settings/userscript-settings.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

// FIXME: - Opening video in new tab will not autoplay the video, but it will
//          still add the video to history if tab is opened for more than 10 seconds
// TODO:  - Playlists: reverse, shuffle
//        - (opt-in to) Remember video titles and uploader so that we can fill the void when videos are removed
//        - Disable autoplaying 'channel trailer' video on channel page
//        - Minimize player when scrolling down
//        - Timestamp marker with notes, popup list to jump to timestamp on video

const ENABLED_MODULES = ['mProgress', 'mPlaybackRate', 'mOpenThumbnail', 'mScreenshot', 'mGoToTimestamp', 'mHistory', 'mTrim'];

const MIN_PLAYBACK_RATE = .1;
const MAX_PLAYBACK_RATE = 3;
const PLAYBACK_STEP = .05;
const MIN_TIME_WATCHED_BEFORE_SEEN = 7000; // n milliseconds or 80% of video length



// =============
// User settings
// =============
const currentValues = GM_getValue('settings', { keyPressRate:0, playbackRateStep:.05, mProgressEnabled:true, mPlaybackRate:true, mOpenThumbnail:true, mScreenshot:true, mGoToTimestamp:true, mHistory:true });
console.log(currentValues)
const settings = new UserscriptSettings({
    youtubeSlightlyBetter: {
        label: 'YouTube Slightly Better',
        settings: {
            keyPressRate: {
                label: 'Key press rate (0 for system default)',
                type: 'number',
                defaultValue: 0,
                currentValue: currentValues.keyPressRate
            },
            playbackRateStep: {
                label: 'Playback rate step',
                type: 'number',
                defaultValue: 0.05,
                currentValue: currentValues.playbackRateStep
            },
            modules: {
                label: 'Modules',
                settings: {
                    mProgress: {
                        label: 'Progress',
                        settings: {
                            enabled: {
                                label: 'Enabled',
                                type: 'checkbox',
                                defaultValue: true,
                                currentValue: currentValues.mProgressEnabled
                            }
                        }
                    },
                    mPlaybackRate: {
                        label: 'Playback Rate',
                        settings: {
                            enabled: {
                                label: 'Enabled',
                                type: 'checkbox',
                                defaultValue: true,
                                currentValue: currentValues.mPlaybackRate
                            }
                        }
                    },
                    mOpenThumbnail: {
                        label: 'Open Thumbnail',
                        settings: {
                            enabled: {
                                label: 'Enabled',
                                type: 'checkbox',
                                defaultValue: true,
                                currentValue: currentValues.mOpenThumbnail
                            }
                        }
                    },
                    mScreenshot: {
                        label: 'Screenshot',
                        settings: {
                            enabled: {
                                label: 'Enabled',
                                type: 'checkbox',
                                defaultValue: true,
                                currentValue: currentValues.mScreenshot
                            }
                        }
                    },
                    mGoToTimestamp: {
                        label: 'Go To Timestamp',
                        settings: {
                            enabled: {
                                label: 'Enabled',
                                type: 'checkbox',
                                defaultValue: true,
                                currentValue: currentValues.mGoToTimestamp
                            }
                        }
                    },
                    mHistory: {
                        label: 'History',
                        settings: {
                            enabled: {
                                label: 'Enabled',
                                type: 'checkbox',
                                defaultValue: true,
                                currentValue: currentValues.mHistory
                            }
                        }
                    }
                }
            }
        }
    }
});

settings.addOnSave(() => {
    const data = settings.getValues('youtubeSlightlyBetter');
    console.log('Saved:', data);
}, 'youtubeSlightlyBetter');



// ===============
// Event Listening
// ===============
let keyListeners = {};

function keyEvent(ev, event) {
    if (keyListeners[ev.key] && keyListeners[ev.key][event])
        if (ev.key === 'Escape' || (ev.target.getAttribute('contenteditable') != 'true' && ['INPUT', 'SELECT', 'TEXTAREA'].indexOf(ev.target.tagName) === -1))
            keyListeners[ev.key][event].forEach(cb => cb(ev, event));
}

document.addEventListener('keypress', ev => keyEvent(ev, 'keypress'));
document.addEventListener('keyup', ev => keyEvent(ev, 'keyup'));
document.addEventListener('keydown', ev => keyEvent(ev, 'keydown'));

GM_registerMenuCommand('Settings', settings.show, 's');



// ================
// Helper Functions
// ================
const cr = (type, obj) => Object.assign(document.createElement(type), obj || {});



(() => {
    // =======
    // Modules
    // =======
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
    mModule.mPlaybackRate = class mPlaybackRate extends mModule {
        constructor() {
            super();
            this.slower = this.addItem(new mItemBtnHold(this, 'S', 'Derease playback rate\nKeybinding: a'));
            this.speed = this.addItem(new mItemBtn(this, this.getPlaybackRateStr(), 'Reset playback rate\nKeybinding: s'));
            this.faster = this.addItem(new mItemBtnHold(this, 'F', 'Increase playback rate\nKeybinding: d'));
            this.slower.addOnClick(() => this.changePlaybackRate(-currentValues.playbackRateStep));
            this.speed.addOnClick(() => {
                if (!this.setPlaybackRate(1))
                    this.clearDown();
            });
            this.faster.addOnClick(() => this.changePlaybackRate(currentValues.playbackRateStep));
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
            this.open = this.addItem(new mItemBtn(this, 'B', 'Open video thumbnail\nKeybinding: b'));
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
    mModule.mScreenshot = class mScreenshot extends mModule {
        constructor() {
            super();
            this.screenshot = this.addItem(new mItemBtn(this, 'H', 'Take screenshot (video resolution decides image dimensions)\nKeybinding: h'));
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
            this.goto = this.addItem(new mItemBtn(this, 'G', 'Open go-to-timestamp prompt\nKeybinding: g'));
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
            let [s, m, h] = str.split(':').reverse();
            s = +s.replace(/^0*/, '');
            if (m) s += (+m.replace(/^0*/, ''))*60;
            if (h) s += (+h.replace(/^0*/, ''))*3600;
            if (s < video.duration)
                video.currentTime = s;
        }
        openPrompt() {
            if (this.prompt) return this.closePrompt();
            this.prompt = cr('div', { className:'ytbc-p' });
            const input = cr('input', { type:'text', autofill:'off', size:1 });
            const allowedTimestamp = /^[0-5]{0,1}[0-9]{1}(:[0-5]{0,1}[0-9]{1}){0,2}$/;
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
            input.addEventListener('focusout', () => setTimeout(() => this.closePrompt(), 50));
            this.prompt.appendChild(input);
            document.body.appendChild(this.prompt);
            input.select();
        }
        closePrompt() {
            if (this.prompt) {
                this.prompt.remove();
                this.prompt = null;
            }
        }
    }

    
    // =====================
    // History Module
    // =====================
    //
    // - Remember all watched videos and print how many times current video has been watched.
    //
    mModule.mHistory = class mHistory extends mModule {
        constructor() {
            super();
            this.seen = this.addItem(new mItemBtn(this, '-', 'Prints number of times you have watched this video\nRed texts means current viewing is not yet counted\nGreen texts means number includes current viewing\nLeft-click: Add current viewing to count (make number green)'));
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


    // =====================
    // Progress Module
    // =====================
    //
    // - Print the video progress as percentage.
    //
    mModule.mProgress = class mProgress extends mModule {
        constructor() {
            super();
            this.progress = this.addItem(new mItemBtn(this, '0%', 'Video progression\nLeft-click: Cycle mode'));
            this.progress.addOnClick(() => this.handleOnClick());
            this.mode = 'percentage';
            this.registerKeys(['p']);
            video.addEventListener('loadeddata', () => this.onChange());
            video.addEventListener('timeupdate', () => this.updateProgression());
            this.onChange();
        }
        handleOnClick() {
            const modes = ['percentage', 'time', 'timeleft'];
            this.mode = modes[(modes.indexOf(this.mode) + 1) % modes.length];
            this.updateProgression();
        }
        onChange() {
            this.units = video.duration < 3600 ? [60,1] : [3600,60,1];
            this.updateProgression();
        }
        onKey(ev) {
            super.onKey(ev);
            this.handleOnClick();
        }
        updateProgression() {
            if (!video.duration)
                return;
            let newValue;
            switch (this.mode) {
                case 'percentage':
                    newValue = Math.round(video.currentTime / video.duration * 100);
                    if (newValue === this.oldValue)
                        return;
                    newValue = this.oldValue = `${newValue}%`;
                    break;
                case 'time':
                    newValue = Math.round(video.currentTime);
                    if (newValue === this.oldValue)
                        return;
                    newValue = this.oldValue = this.units.map(v => { const nv=Math.floor(newValue/v); newValue%=v; return nv < 10 ? `0${nv}` : nv; }).join(':');
                    break;
                case 'timeleft':
                    newValue = Math.round(video.duration - video.currentTime);
                    if (newValue === this.oldValue)
                        return;
                    newValue = this.oldValue = this.units.map(v => { const nv=Math.floor(newValue/v); newValue%=v; return nv < 10 ? `0${nv}` : nv; }).join(':');
                    break;
                default:
                    return;
            }
            this.progress.element.innerText = newValue;
        }
    }

    const TRIM_PROXIMITY = .99;

    // ===========
    // Trim Module
    // ===========
    //
    // - Autotrim videos for the next time you watch them. Useful for eg. music videos on music playlists.
    // - Set a trim start and stop with hotkey 'y', when video loads it will jump to first trim start
    // - With multiple trims, it will skip video between trims
    // - One trim fully within another trim will untrim (skip) that part of the parent trim
    // - When trims overlap but aren't fully within, the trims will add together
    //
    mModule.mTrim = class mTrim extends mModule {
        constructor() {
            super();
            this.trim = this.addItem(new mItemBtn(this, 'T', 'Trim'));
            this.trim.addOnClick(() => this.handleOnClick());
            this.registerKeys(['y']);
            video.addEventListener('loadeddata', ev => this.onChange(ev));
            video.addEventListener('timeupdate', ev => this.onTimeUpdate(ev));
            this.trims = []; // Contains arrays with [startTimestamp, endTimestamp] (seconds)
            this.current = null;
            this.onChange();
        }
        drawTrims() {
            if (!this.trims.length && !this.current) {
                this.trimBar.style.display = 'none';
            } else {
                this.trimBar.style.display = 'block';
                [...this.trimBar.children].forEach(c => c.remove());
                const drawTrim = (start, end, i) => {
                    const trim = document.createElement('div');
                    trim.style.height = '150%';
                    trim.style.position = 'absolute';
                    trim.style.left = start / video.duration * 100 + '%';
                    trim.style.width = (end - start) / video.duration * 100 + '%';
                    trim.style.backgroundColor = '#dd2fe0';
                    let prevClick = 0;
                    let id;
                    trim.onclick = () => {
                        clearTimeout(id);
                        if (Date.now() < prevClick + 200) {
                            this.trims.splice(i, 1);
                            this.drawTrims();
                            this.saveTrims();
                        } else {
                            prevClick = Date.now();
                            id = setTimeout(() => {
                                video.currentTime = start;
                            }, 200);
                        }
                    };
                    this.trimBar.appendChild(trim);
                };
                this.trims.forEach((pair, i) => drawTrim(...pair, i));
                if (this.current) {
                    const curr = document.createElement('div');
                    curr.style.height = '200%';
                    curr.style.position = 'absolute';
                    curr.style.left = this.current / video.duration * 100 + '%';
                    curr.style.width = '2px';
                    curr.style.backgroundColor = '#40fdd1';
                    this.trimBar.appendChild(curr);
                }
            }
            this.trim.element.innerText = `T${this.trims.length || ''}`;
        }
        handleOnClick() {
            const currentTime = video.currentTime;
            if (this.inProximity(currentTime, this.current, TRIM_PROXIMITY)) {
                this.current = null;
                this.trim.element.style.color = '';
            } else {
                const inProx = this.trims.find(trim => this.inProximity(currentTime, trim[0], TRIM_PROXIMITY) ||
                    this.inProximity(currentTime, trim[1], TRIM_PROXIMITY));
                if (inProx && !this.current) {
                    this.trims.splice(this.trims.indexOf(inProx), 1);
                } else {
                    if (this.current) {
                        if (this.current < currentTime)
                            this.trims.push([this.current, currentTime]);
                        else
                            this.trims.push([currentTime, this.current]);
                        this.current = null;
                        this.saveTrims();
                        this.trim.element.style.color = '';
                    } else {
                        this.current = currentTime;
                        this.trim.element.style.color = '#40fdd1';// '#fd62ea';
                    }
                }
            }
            this.drawTrims();
        }
        inProximity(val1, val2, prox) {
            return Math.abs(val1 - val2) < prox;
        }
        onChange() {
            const params = new URLSearchParams(location.search);
            this.videoId = params.get('v');
            if (this.videoId)
                this.trims = GM_getValue(`t-${this.videoId}`, []);
            else
                this.trims = [];
            if (!this.trimBar) {
                const buttons = document.querySelector('.ytp-chrome-controls');
                this.trimBar = document.createElement('div');
                this.trimBar.style.height = '2px';
                this.trimBar.style.transform = 'translateY(-38px)';
                this.trimBar.style.backgroundColor = '#bf79ff40';
                this.trimBar.style.display = 'none';
                buttons.parentElement.appendChild(this.trimBar);
            }
            this.current = null;
            this.trim.element.style.color = '';
            if (this.trims.length && !params.get('t')) {
                this.trims.sort((a, b) => a[0] - b[0]);
                video.currentTime = this.trims[0][0];
            }
            this.calculateNextSkip();
            this.drawTrims();
        }
        onKey(ev) {
            super.onKey(ev);
            this.handleOnClick();
        }
        onTimeUpdate() {
            if (this.nextSkip) {
                if (this.nextSkip <= video.currentTime) {
                    this.calculateNextSkip();
                    if (this.nextSkip) {
                        this.trims.sort((a, b) => a[0] - b[0]);
                        video.currentTime = this.trims.find(trim => video.currentTime < trim[0])[0];
                    } else {
                        video.currentTime = video.duration;
                    }
                }
            }
        }
        calculateNextSkip() {
            this.trims.sort((a, b) => a[1] - b[1]);
            const next = this.trims.find(trim => video.currentTime < trim[1]);
            this.nextSkip = next ? next[1] : null;
        }
        saveTrims() {
            this.calculateNextSkip();
            if (!this.videoId)
                this.videoId = new URLSearchParams(location.search).get('v');
            if (this.videoId)
                GM_setValue(`t-${this.videoId}`, this.trims);
        }
    }



    // ==========
    // Menu Items
    // ==========
    class mItem {
        constructor(module) {
            this.module = module;
            this.element = cr('span');
        }
    }
    class mItemTxt extends mItem { // displays text
        constructor(module, str, title=null) {
            super(module);
            this.element.innerText = str;
            if (title) this.element.title = title;
        }
    }
    class mItemBtn extends mItemTxt { // click handle
        constructor(module, str, title=null) {
            super(module, str, title);
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
        constructor(module, str, title=null, clickDelay=200, clickRate=100) {
            super(module, str, title);
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
        constructor(module, str, title=null, state=false) {
            super(module, str, title);
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



    // ==================
    // Inject CSS styling
    // ==================
    GM_addStyle(
`.ytbc{float:right;color:white;}
.ytbc>div{display:inline-block;margin:0 4px;}
.ytbc>div>span{margin:0 2px;}.ytbc .btn{cursor:pointer;}
.ytbc-p{z-index:1000;position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;backdrop-filter:blur(1.5px);}
.ytbc-p>input{
    pointer-events:auto;position:fixed;top:50vh;left:50vw;transform:translate(-50%,-50%);
    color:#350505;background-color:#d019108c;font-size:20px;padding:10px;border:none;text-align:center;}
.ytbc-p>input:focus{outline:none;}`);


    // ====
    // Init
    // ====
    let title, video, container;
    let modules = null;

    function init() {
        container = cr('div', { className:'ytbc' });

        modules = ENABLED_MODULES.map(name => new mModule[name]());

        title.parentElement.insertBefore(container, title);
    }

    // Wait for video to exist before initializing modules
    // TODO: If current page isn't a watch page maybe we should wait some other way?
    let id = setInterval(() => {
        if (!title) title = document.querySelector('#container>.title');
        if (!video) video = document.querySelector('video');
        if (title && video) {
            clearInterval(id);
            setTimeout(init, 20);
        }
    }, 50);
})();