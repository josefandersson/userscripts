// ==UserScript==
// @name         YouTube Slightly Better
// @namespace    https://github.com/josefandersson/userscripts/tree/master/youtube-slightly-better
// @version      1.42
// @description  Adds some extra features to YouTube
// @author       Josef Andersson
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
//        - Smart speed module that analyzes the sound to vastly speed up the clip when no one is talking/no sound
//        - Disable autoplaying 'channel trailer' video on channel page
//        - Minimize player when scrolling down
//        - Timestamp marker with notes, popup list to jump to timestamp on video
//        - Paste feature to paste timestamp or link with timestamp, then jump to it instead of having to reload page
//        - Rewrite history module, if video is replayed without reloaded add extra plays to history, also save video title and uploader name,
//          use video progression every second to check playtime instead of real life time since the video can be speed up/down
//        - Add a video object that handles onChange instead of modules individually, along with other cross-module related functions and vars
//        - Let each module itself add nodes to settings before creating UserscriptSettings instance


// =============
// User settings
// =============
let settings;
const sObj = new UserscriptSettings({
    ytsb: ['YouTube Slightly Better', 'section', {
        keyPressRate: ['Key press rate (0 for system default)', 'number', 0],
        enabledModules: ['Enabled modules', 'multiple',
            ['Copy', 'Go To Timestamp', 'History', 'Media Session', 'Open Thumbnail', 'Playback Rate', 'Progress', 'Screenshot', 'Trim'],
            ['Copy', 'Go To Timestamp', 'History', 'Media Session', 'Open Thumbnail', 'Playback Rate', 'Progress', 'Screenshot', 'Trim']],
        modules: ['Module settings', 'section', {
            mPlaybackRate: ['Playback Rate', 'section', {
                playbackRateStep: ['Playback rate step', 'number', 0.05],
                minPlaybackRate: ['Minimum playback rate', 'number', 0.1],
                maxPlaybackRate: ['Maximum playback rate', 'number', 3],
            }, [{ path:['/', 'ytsb', 'enabledModules'], eval:v=>-1<v.indexOf('Playback Rate'), action:'hide' }]],
            mHistory: ['History', 'section', {
                minPercentageBeforeSeen: ['Minimum percentage before counted as seen', 'number', .8,, 0, 1, .05],
            }, [{ path:['/', 'ytsb', 'enabledModules'], eval:v=>-1<v.indexOf('Playback Rate'), action:'hide' }]]
        }],
        keybinds: ['Keybinds', 'section', {
            mCopy: ['Copy', 'text', 'v'],
            mGoToTimestamp: ['Go To Timestamp', 'text', 'v'],
            mHistory: ['History', 'text', 'v'],
            mOpenThumbnail: ['Open Thumbnail', 'text', 'v'],
            mPlaybackRate: ['Playback Rate', 'text', 'v'],
            mProgress: ['Progress', 'text', 'v'],
            mScreenshot: ['Screenshot', 'text', 'v'],
            mTrim: ['Trim', 'text', 'v']
        }]
    }]
}, { ytsb:GM_getValue('settings') });

sObj.addOnChange(vals => {
    GM_setValue('settings', settings = vals);
}, 'ytsb');

// Get current settings, including default values
settings = Object.assign({}, UserscriptSettings.getValues('ytsb'));


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

GM_registerMenuCommand('Settings', sObj.show, 's');



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
            this.slower.addOnClick(() => this.changePlaybackRate(-settings.modules.mPlaybackRate.playbackRateStep));
            this.speed.addOnClick(() => {
                if (!this.setPlaybackRate(1))
                    this.clearDown();
            });
            this.faster.addOnClick(() => this.changePlaybackRate(settings.modules.mPlaybackRate.playbackRateStep));
            this.registerKeys(['a', 's', 'd']);
        }
        getPlaybackRateStr() { return video.playbackRate.toFixed(2) + ''; }
        changePlaybackRate(diff) { return this.setPlaybackRate(video.playbackRate + diff); }
        setPlaybackRate(rate) {
            video.playbackRate = Math.max(settings.modules.mPlaybackRate.minPlaybackRate, Math.min(settings.modules.mPlaybackRate.maxPlaybackRate, rate));
            this.speed.element.innerText = this.getPlaybackRateStr();
            return video.playbackRate === rate;
        }
        onKey(ev) {
            super.onKey(ev);
            if (ev.key === 'a') this.changePlaybackRate(-settings.modules.mPlaybackRate.playbackRateStep);
            else if (ev.key === 's') this.setPlaybackRate(1);
            else if (ev.key === 'd') this.changePlaybackRate(settings.modules.mPlaybackRate.playbackRateStep);
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
    // - Prompt formatting examples:
    //   05:03 -> 5m3s
    //   7:9:23 -> 7h9m23s
    //   :24 -> 24s
    //   19 -> 19m
    //   1: -> 1h
    //   You may use a literal space (' ') instead of colon (':').
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
            if (ev.key === 'g')
                this.handleOnClick();
        }
        goToTimestamp(str) {
            let t = [];
            if (/^[0-5]?[0-9]$/.test(str)) { // 20,30,35 (implied minutes)
                t[1] = +str;
            } else if (/^([0-9]+[hms])+$/.test(str)) { // 19h,20m,21s,20m21s (specified unit or units)
                let regex = /([0-9]+)([hms])/g, res;
                while ((res = regex.exec(str)) != null)
                    t[['s','m','h'].indexOf(res[2])] = +res[1];
            } else if (/^[0-5]?[0-9][: ]$/.test(str)) { // 07:,1: (implied hours)
                t[2] = +str.substr(0, str.length-1);
            } else { // 01:02:03,02:03,03 (normal)
                t = str.split(/[: ]/).reverse().map(n => +n);
            }
            const s = (t[0]||0) + (t[1]||0) * 60 + (t[2]||0) * 3600;
            console.log(s);
            if (s < video.duration)
                video.currentTime = s;
        }
        openPrompt() {
            if (this.prompt) return this.closePrompt();
            this.prompt = cr('div', { className:'ytbc-p' });
            const input = cr('input', { type:'text', autofill:'off', size:1 });
            const allowedTimestamp = /^([0-5]?[0-9](([: ][0-5]?[0-9]){0,2}|[hms: ]))|([: ][0-5]?[0-9])$/;
            const badCharacters = /[^0-9: hms]/g;
            input.addEventListener('input', ev => {
                let r;
                if (ev.inputType === 'insertFromPaste' && (r = /^https:\/\/(?:youtu\.be\/|www\.youtube\.com\/watch\?v=)[a-zA-Z0-9]*[?&]t=([^&]*)/.exec(input.value))) {
                    input.value = r[1];
                } else if (ev.inputType === 'insertText' && badCharacters.test(input.value))
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
                } else if (ev.key === 'g')
                    this.closePrompt();
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
            this.isPlaying = false;
            video.addEventListener('loadeddata', ev => this.onChange(ev));
            video.addEventListener('play', ev => this.onPlay(ev));
            video.addEventListener('pause', ev => this.onPause(ev));
            this.onChange();
        }
        onChange() {
            const prevVideoId = this.videoId;
            this.videoId = new URLSearchParams(location.search).get('v');
            if (this.videoId && this.videoId !== prevVideoId) {
                this.isCounted = false; // TODO: remove
                this.replays = 1;
                this.startedWatchingAt = Date.now();
                this.historyData = GM_getValue(`h-${this.videoId}`, null);
                if (this.historyData) {
                    this.seen.element.innerText = this.historyData.n;
                    this.seen.element.style.color = '#ff4343';
                } else {
                    this.seen.element.innerText = '0';
                    this.seen.element.style.color = 'inherit';
                }
                this.minimumTime = settings.modules.mHistory.minPercentageBeforeSeen * video.duration * 1000;
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
                this.timeoutId = setTimeout(() => this.makeCounted(), Math.max(this.minimumTime * this.replays - this.currentPlaytime, 0));
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
            if (this.isCounted)
                this.makeUncounted();
            else
                this.makeCounted();
        }
        makeCounted() {
            if (this.isCounted)
                return;
            this.isCounted = true;
            this.replays ++;
            const startedWatchingAt = this.startedWatchingAt || Date.now();
            if (this.historyData) {
                this.previousL = this.historyData.l;
                this.historyData.l = startedWatchingAt;
                this.historyData.n ++;
            } else
                this.historyData = { f:startedWatchingAt, l:startedWatchingAt, n:1 };
            GM_setValue(`h-${this.videoId}`, this.historyData);
            this.seen.element.style.color = '#4af150';
            this.seen.element.innerText = this.historyData.n;
        }
        makeUncounted() {
            if (!this.isCounted)
                return;
            this.isCounted = false;
            this.replays --;
            this.historyData.l = this.previousL;
            this.historyData.n --;
            GM_setValue(`h-${this.videoId}`, this.historyData);
            this.seen.element.style.color = '#ff4343';
            this.seen.element.innerText = this.historyData.n;
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



    // ===========
    // Copy Module
    // ===========
    //
    // - Copy video with timestamp to clipboard
    //
    mModule.mCopy = class mCopy extends mModule {
        constructor() {
            super();
            this.registerKeys(['v']);
        }
        onKey(ev) {
            super.onKey(ev);
            if (!video.duration)
                return;
            const prms = new URLSearchParams(location.search);
            const vid = prms.get('v');
            if (!vid)
                return;
            const units = video.duration < 3600 ? [60,1] : [3600,60,1];
            const unitNms = ['s', 'm', 'h'];
            let cur = Math.round(video.currentTime);
            const time = units.map((v, i) => {
                const nv = Math.floor(cur/v);
                cur %= v;
                if (nv === 0)
                    return '';
                return (nv < 10 ? `0${nv}` : nv) + unitNms[units.length-1-i];
            }).join('');
            navigator.clipboard.writeText(`https://youtu.be/${vid}?t=${time}`);
        }
    }



    // ====================
    // Media Session Module
    // ====================
    //
    // - Make media keys (next, previous) work in browsers where they don't
    //
    mModule.mMediaSession = class mMediaSession extends mModule {
        constructor() {
            super();
            let data = '';
            setInterval(() => {
                // document.title = 'State: ' + navigator.mediaSession.playbackState + ' ' + data;
            }, 200);
            if (!video.paused) {
                video.pause();
                video.play();
            }
            video.addEventListener('play', () => data += 'PLAY'); // TODO: If window was just created then pause the video, then play video when window gains focus
            video.addEventListener('pause', () => data += 'PAUS');
            video.addEventListener('loadeddata', ev => setTimeout(() => {
                this.onChange(ev);
            }, 200)); // TODO: Should it be 200ms?
            video.addEventListener('ended', () => navigator.mediaSession.playbackState = 'paused');
            this.onChange();
        }
        onChange() {
            navigator.mediaSession.setActionHandler('play', ev => this.onMedia(ev));
            navigator.mediaSession.setActionHandler('pause', ev => this.onMedia(ev));
            navigator.mediaSession.setActionHandler('stop', ev => this.onMedia(ev));
            navigator.mediaSession.setActionHandler('previoustrack', ev => this.onMedia(ev));
            navigator.mediaSession.setActionHandler('nexttrack', ev => this.onMedia(ev));
            navigator.mediaSession.setActionHandler('seekbackward', ev => this.onMedia(ev));
            navigator.mediaSession.setActionHandler('seekforward', ev => this.onMedia(ev));
            navigator.mediaSession.setActionHandler('seekto', ev => this.onMedia(ev));
        }
        onMedia(ev) {
            console.log(ev);
            switch (ev.action) {
                case 'stop':
                case 'play': video.play(); break;
                case 'pause': video.pause(); break;
                case 'nexttrack': document.querySelector('.ytp-next-button').click(); break;
                case 'previoustrack': document.querySelector('.ytp-prev-button').click(); break;
            }
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
.ytbc-p{z-index:1000;position:fixed;top:0;left:0;right:0;bottom:0;pointer-events:none;background-color:#2237;}
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

        const REF = {
            'Progress': 'mProgress',
            'Playback Rate':'mPlaybackRate',
            'Open Thumbnail':'mOpenThumbnail',
            'Screenshot':'mScreenshot',
            'Go To Timestamp':'mGoToTimestamp',
            'History':'mHistory',
            'Trim':'mTrim',
            'Copy':'mCopy',
            'Media Session':'mMediaSession' };
        modules = settings.enabledModules.map(name => new mModule[REF[name]]());

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