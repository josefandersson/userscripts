// ==UserScript==
// @name         YouTube Slightly Better
// @namespace    https://github.com/josefandersson/userscripts/tree/master/youtube-slightly-better
// @version      1.47
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
//        - Smart speed module that analyzes the sound to vastly speed up the clip when no one is talking/no sound
//        - Disable autoplaying 'channel trailer' video on channel page
//        - Minimize player when scrolling down
//        - Rewrite history module, if video is replayed without reloaded add extra plays to history,
//          use video progression every second to check playtime instead of real life time since the video can be speed up/down
//        - Remake init and module system somewhat, so that it inits on any page, not just when video is detected, also add onEnable/onDisable for toggling modules
//        - Trim module resets the first time if "loop" is enabled, but the next time it doesn't stop at trim end
//        - Can't seem to start trim at start of video?
//        - Remake trim module, create a new bar collection below controls, but perhaps still on video, where all bars are collected


// =============
// User settings
// =============
let settings;
const settingsDescriptor = {
    ytsb: ['YouTube Slightly Better', 'section', {
        keyPressRate: ['Key press rate (0 for system default)', 'number', 0],
        enabledModules: ['Enabled modules', 'multiple', [], []],
        modules: ['Module settings', 'section', {}],
        keybinds: ['Keybinds', 'section', {}]
    }]
};



(() => {
    // ================
    // Helper Functions
    // ================
    const cr = (type, obj) => Object.assign(document.createElement(type), obj || {});
    const q = sel => document.querySelector(sel);
    const qa = sel => document.querySelectorAll(sel);
    const secondsToHms = (sec, dyn=true, units=null) => {
        if (!units) units = dyn && Video.v.duration < 3600 ? [60,1] : [3600,60,1];
        return units.map(v => { const nv=Math.floor(sec/v); sec%=v; return nv < 10 ? `0${nv}` : nv; }).join(':');
    };


    // ======================
    // Handle key events/cmds
    // ======================
    let keyListeners = {};

    function keyEvent(ev, event) {
        if (keyListeners[ev.key] && keyListeners[ev.key][event])
            if (ev.key === 'Escape' || (ev.target.getAttribute('contenteditable') != 'true' && ['INPUT', 'SELECT', 'TEXTAREA'].indexOf(ev.target.tagName) === -1))
                keyListeners[ev.key][event].forEach(cb => cb(ev, event));
    }

    document.addEventListener('keypress', ev => keyEvent(ev, 'keypress'));
    document.addEventListener('keyup', ev => keyEvent(ev, 'keyup'));
    document.addEventListener('keydown', ev => keyEvent(ev, 'keydown'));



    // =============
    // Video handler
    // =============
    // - Add a video object that handles onChange instead of modules individually, along with other cross-module related functions and vars
    // TODO: When changing to some pages without a video player (settings? user profile?) we need to re-detect it when we are back to a video page
    const Video = {
        v: null,      // Video DOM element
        id: null,     // Video id (v=xxxxxxxx in URL)
        prevId: null, // Previous video id

        onChangeCallbacks: [],
        addOnChange: function(cb) {
            let i = 0;
            while (this.onChangeCallbacks[i] != null) i++;
            this.onChangeCallbacks[i] = cb;
            return i;
        },
        onChange: function() {
            this.prevId = this.id;
            this.id = new URLSearchParams(location.search).get('v');
            this.onChangeCallbacks.forEach(cb => {
                if (cb) cb();
            });
        },
        removeOnChange: function(i) {
            this.onChangeCallbacks[i] = null;
        },

        setVideo: function(video) {
            this.v = video;
            this.v.addEventListener('loadeddata', () => this.onChange());
            this.onChange();
        },
    };



    // ============
    // Page handler
    // ============
    const Page = {
        prevUrl: null,
        loop: function() {
            if (location.href !== this.prevUrl) {
                this.onChange();
                this.prevUrl = location.href;
            }
            if (this.onChangeCallbacks.length) {
                this.id = setTimeout(() => this.loop, 500);
            } else {
                this.id = null;
            }
        },
        start: function() {
            if (!this.id && this.onChangeCallbacks.length) {
                this.prevUrl = location.href;
                this.id = setTimeout(() => this.loop, 500);
            }
        },

        onChangeCallbacks: [],
        addOnChange: function(cb) {
            let i = 0;
            while (this.onChangeCallbacks[i] != null) i++;
            this.onChangeCallbacks[i] = cb;
            this.start();
            return i;
        },
        onChange: function() {
            this.onChangeCallbacks.forEach(cb => {
                if (cb) cb();
            });
        },
        removeOnChange: function(i) {
            this.onChangeCallbacks[i] = null;
        },
    };


    // =======
    // Modules
    // =======
    class mModule {
        constructor() {
            this.element = cr('div');
            container.appendChild(this.element);
            this.items = [];
            this.constructor.i = this;
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
        static registerSettings(defaultEnabled=false, moduleKeys=null, moduleSettings=null) {
            settingsDescriptor.ytsb[2].enabledModules[2].push(this.rName);
            if (defaultEnabled)
                settingsDescriptor.ytsb[2].enabledModules[3].push(this.rName);
            if (moduleKeys)
                Object.assign(settingsDescriptor.ytsb[2].keybinds[2], moduleKeys);
            if (moduleSettings)
                settingsDescriptor.ytsb[2].modules[2][this.name] = moduleSettings;
        }
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
            this.registerKeys([settings.keybinds.decreasePlaybackRate, settings.keybinds.resetPlaybackRate, settings.keybinds.increasePlaybackRate]);
        }
        getPlaybackRateStr() { return Video.v.playbackRate.toFixed(2) + ''; }
        changePlaybackRate(diff) { return this.setPlaybackRate(Video.v.playbackRate + diff); }
        setPlaybackRate(rate) {
            Video.v.playbackRate = Math.max(settings.modules.mPlaybackRate.minPlaybackRate, Math.min(settings.modules.mPlaybackRate.maxPlaybackRate, rate));
            this.speed.element.innerText = this.getPlaybackRateStr();
            return Video.v.playbackRate === rate;
        }
        onKey(ev) {
            super.onKey(ev);
                 if (ev.key === settings.keybinds.decreasePlaybackRate) this.changePlaybackRate(-settings.modules.mPlaybackRate.playbackRateStep);
            else if (ev.key === settings.keybinds.resetPlaybackRate)    this.setPlaybackRate(1);
            else if (ev.key === settings.keybinds.increasePlaybackRate) this.changePlaybackRate(settings.modules.mPlaybackRate.playbackRateStep);
        }
        static registerSettings() {
            super.registerSettings(true, {
                decreasePlaybackRate: ['Decrease playback rate', 'text', 'a'],
                resetPlaybackRate: ['Reset playback rate', 'text', 's'],
                increasePlaybackRate: ['Increase playback rate', 'text', 'd']
            }, ['Playback Rate', 'section', {
                playbackRateStep: ['Playback rate step', 'number', 0.05],
                minPlaybackRate: ['Minimum playback rate', 'number', 0.1],
                maxPlaybackRate: ['Maximum playback rate', 'number', 3],
            }, [{ path:['/', 'ytsb', 'enabledModules'], eval:v=>-1<v.indexOf('Playback Rate'), action:'hide' }]]);
        }
    };
    mModule.mPlaybackRate.rName = 'Playback Rate';
    mModule.mPlaybackRate.rDesc = 'Superior method of changing video playback rate, and with better precision.';



    // =====================
    // Open Thumbnail Module
    // =====================
    //
    // - Open video thumbnail by clicking on B.
    // - Use keybinding b to open thumbnail.
    // TODO: This method of getting thumbnail doesn't work on all videos
    //
    mModule.mOpenThumbnail = class mOpenThumbnail extends mModule {
        constructor() {
            super();
            this.open = this.addItem(new mItemBtn(this, 'B', 'Open video thumbnail\nKeybinding: b'));
            this.open.addOnClick(() => this.openThumbnail());
            this.registerKeys([settings.keybinds.openThumbnail]);
        }
        openThumbnail() {
            const url = this.getThumbnailUrl();
            if (url) {
                const link = cr('a', { target:'_blank', href:url });
                link.click();
            }
        }
        getThumbnailUrl() {
            if (Video.id) return `https://img.youtube.com/vi/${Video.id}/maxresdefault.jpg`;
            else         return null;
        }
        onKey(ev) {
            super.onKey(ev);
            this.openThumbnail();
        }
        static registerSettings() {
            super.registerSettings(true, {
                openThumbnail: ['Open thumbnail', 'text', 'b']
            });
        }
    };
    mModule.mOpenThumbnail.rName = 'Open Thumbnail';
    mModule.mOpenThumbnail.rDesc = 'Open video thumbnail in new tab.';


    
    // =====================
    // Screenshot Module
    // =====================
    //
    // - Take screenshot and download it.
    //
    mModule.mScreenshot = class mScreenshot extends mModule {
        constructor() {
            super();
            this.screenshot = this.addItem(new mItemBtn(this, 'H', 'Take screenshot (video resolution decides image dimensions)\nKeybinding: h'));
            this.screenshot.addOnClick(() => this.takeScreenshot());
            this.registerKeys([settings.keybinds.screenshot]);
        }
        takeScreenshot() {
            const canvas = cr('canvas', { width:Video.v.videoWidth, height:Video.v.videoHeight });
            const context = canvas.getContext('2d');
            context.drawImage(Video.v, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/png').replace('image/png', 'image/octet-stream');
            const link = cr('a', { download:`screenshot-${Video.id}.png`, href:dataUrl });
            link.click();
        }
        onKey(ev) {
            super.onKey(ev);
            this.takeScreenshot();
        }
        static registerSettings() {
            super.registerSettings(true, {
                screenshot: ['Take screenshot', 'text', 'h']
            });
        }
    };
    mModule.mScreenshot.rName = 'Screenshot';
    mModule.mScreenshot.rDesc = 'Take screenshot and download it.';



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
    //   t2 -> second trim (if mTrim is enabled)
    //   n  -> first note (if mNotes is enabled)
    //   n5 -> fifth note (if mNotes is enabled)
    //   You may use a literal space (' ') instead of colon (':').
    //
    mModule.mGoToTimestamp = class mGoToTimestamp extends mModule {
        constructor() {
            super();
            this.goto = this.addItem(new mItemBtn(this, 'G', 'Open go-to-timestamp prompt\nKeybinding: g'));
            this.goto.addOnClick(() => this.handleOnClick());
            this.registerKeys([settings.keybinds.goToTimestamp]);
            this.registerKeys(['Escape'], 'keyup');
        }
        handleOnClick() {
            this.openPrompt();
        }
        onKey(ev) {
            super.onKey(ev);
            if (ev.key === settings.keybinds.goToTimestamp)
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
            } else if (/^[nt][0-9]*$/.test(str)) { // notes and trims
                let [,target,index] = /^([nt])([1-9]?[0-9]*)$/.exec(str);
                if (!index) index = 1;
                if (target === 'n') {
                    if (mModule.mNotes.i)
                        mModule.mNotes.i.goToNote(index-1);
                } else {
                    if (mModule.mTrim.i)
                        mModule.mTrim.i.goToTrim(index-1);
                }
                return;
            } else { // 01:02:03,02:03,03 (normal)
                t = str.split(/[: ]/).reverse().map(n => +n);
            }
            const s = (t[0]||0) + (t[1]||0) * 60 + (t[2]||0) * 3600;
            if (s < Video.v.duration)
                Video.v.currentTime = s;
        }
        openPrompt() {
            if (this.prompt) return this.closePrompt();
            this.prompt = cr('div', { className:'ytbc-p' });
            const input = cr('input', { type:'text', autofill:'off', size:1 });
            const allowedTimestamp = /^([0-5]?[0-9](([: ][0-5]?[0-9]){0,2}|[hms: ]))|([: ][0-5]?[0-9])|[nt]|([nt][1-9][0-9]*)$/;
            const badCharacters = /[^0-9: hmsnt]/g;
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
        static registerSettings() {
            super.registerSettings(true, {
                goToTimestamp: ['Go to timestamp', 'text', 'g']
            });
        }
    };
    mModule.mGoToTimestamp.rName = 'Go To Timestamp';
    mModule.mGoToTimestamp.rDesc = 'Prompts the user for a timestamp to jump to.';



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
            Video.addOnChange(() => this.onChange());
            Video.v.addEventListener('play', ev => this.onPlay(ev)); // TODO: Add videoChange event (or similar) to Video object to re-add these listeners when video element changes
            Video.v.addEventListener('pause', ev => this.onPause(ev));
            this.onChange();
        }
        onChange() {
            if (Video.id && Video.id != Video.prevId) {
                this.isCounted = false; // TODO: remove
                this.replays = 1;
                this.startedWatchingAt = Date.now();
                this.historyData = GM_getValue(`h-${Video.id}`, null);
                if (this.historyData) {
                    this.seen.element.innerText = this.historyData.n;
                    this.seen.element.style.color = '#ff4343';
                } else {
                    this.seen.element.innerText = '0';
                    this.seen.element.style.color = 'inherit';
                }
                this.minimumTime = settings.modules.mHistory.minPercentageBeforeSeen * Video.v.duration * 1000;
                this.onPause();
                this.currentPlaytime = 0;
                if (!Video.v.paused)
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
            GM_setValue(`h-${Video.id}`, this.historyData);
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
            GM_setValue(`h-${Video.id}`, this.historyData);
            this.seen.element.style.color = '#ff4343';
            this.seen.element.innerText = this.historyData.n;
        }
        static registerSettings() {
            super.registerSettings(false, null, ['History', 'section', {
                minPercentageBeforeSeen: ['Minimum percentage before counted as seen', 'number', .8,, 0, 1, .05],
            }, [{ path:['/', 'ytsb', 'enabledModules'], eval:v=>-1<v.indexOf('Playback Rate'), action:'hide' }]]);
        }
    };
    mModule.mHistory.rName = 'History';
    mModule.mHistory.rDesc = 'Remember all watched videos and print how many times current video has been watched.';



    // ===============
    // Progress Module
    // ===============
    //
    // - Print the video progress as percentage.
    // TODO: Add 'minimum' format that shows the biggest unit (eg. 2h, 5m or 10s)
    //
    mModule.mProgress = class mProgress extends mModule {
        constructor() {
            super();
            this.progress = this.addItem(new mItemBtn(this, '0%', 'Video progression\nLeft-click: Cycle mode'));
            this.progress.addOnClick(() => this.handleOnClick());
            this.mode = 'percentage';
            this.registerKeys([settings.keybinds.progressFormat]);
            this.onChangeId = Video.addOnChange(() => this.onChange());
            Video.v.addEventListener('timeupdate', () => this.updateProgression()); // TODO: Add newVideo event to Video object
            this.onChange();
        }
        handleOnClick() {
            const modes = ['percentage', 'time', 'timeleft'];
            this.mode = modes[(modes.indexOf(this.mode) + 1) % modes.length];
            this.updateProgression();
        }
        onChange() {
            this.units = Video.v.duration < 3600 ? [60,1] : [3600,60,1];
            this.updateProgression();
        }
        onKey(ev) {
            super.onKey(ev);
            this.handleOnClick();
        }
        updateProgression() {
            if (!Video.v.duration)
                return;
            let newValue;
            switch (this.mode) {
                case 'percentage':
                    newValue = Math.round(Video.v.currentTime / Video.v.duration * 100);
                    if (newValue === this.oldValue)
                        return;
                    newValue = this.oldValue = `${newValue}%`;
                    break;
                case 'time':
                    newValue = Math.round(Video.v.currentTime);
                    if (newValue === this.oldValue)
                        return;
                    newValue = this.oldValue = secondsToHms(newValue, true, this.units);
                    break;
                case 'timeleft':
                    newValue = Math.round(Video.v.duration - Video.v.currentTime);
                    if (newValue === this.oldValue)
                        return;
                    newValue = this.oldValue = secondsToHms(newValue, true, this.units);
                    break;
                default:
                    return;
            }
            this.progress.element.innerText = newValue;
        }
        static registerSettings() {
            super.registerSettings(true, {
                progressFormat: ['Change progress format', 'text', 'p']
            });
        }
    };
    mModule.mProgress.rName = 'Progress';
    mModule.mProgress.rDesc = 'Show video progression below the video.';



    const TRIM_PROXIMITY = .99; // TODO: Add to settings

    // ===========
    // Trim Module
    // ===========
    //
    // - Autotrim videos for the next time you watch them. Useful for eg. music videos on music playlists.
    // - Set a trim start and stop with hotkey 'y', when video loads it will jump to first trim start
    // - With multiple trims, it will skip video between trims
    // - One trim fully within another trim will untrim (skip) that part of the parent trim
    // - When trims overlap but aren't fully within, the trims will add together
    // - TODO: Use video speed in calculating next trim, also recalc when video speed changes
    //
    mModule.mTrim = class mTrim extends mModule {
        constructor() {
            super();
            this.trim = this.addItem(new mItemBtn(this, 'T', 'Trim'));
            this.trim.addOnClick(() => this.handleOnClick());
            this.registerKeys([settings.keybinds.trim]);
            this.onChangeId = Video.addOnChange(() => this.onChange());
            Video.v.addEventListener('timeupdate', ev => this.onTimeUpdate(ev)); // TODO: Add newVideo event to Video obj
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
                    trim.style.left = start / Video.v.duration * 100 + '%';
                    trim.style.width = (end - start) / Video.v.duration * 100 + '%';
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
                                Video.v.currentTime = start;
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
                    curr.style.left = this.current / Video.v.duration * 100 + '%';
                    curr.style.width = '2px';
                    curr.style.backgroundColor = '#40fdd1';
                    this.trimBar.appendChild(curr);
                }
            }
            this.trim.element.innerText = `T${this.trims.length || ''}`;
        }
        goToTrim(index) {
            if (this.trims[index])
                Video.v.currentTime = this.trims[index][0];
        }
        handleOnClick() {
            const currentTime = Video.v.currentTime;
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
            if (Video.id) this.trims = GM_getValue(`t-${Video.id}`, []);
            else          this.trims = [];
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
            const params = new URLSearchParams(location.search); // TODO: Add t param to Video obj
            if (this.trims.length && !params.get('t')) {
                this.trims.sort((a, b) => a[0] - b[0]);
                Video.v.currentTime = this.trims[0][0];
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
                if (this.nextSkip <= Video.v.currentTime) {
                    this.calculateNextSkip();
                    if (this.nextSkip) {
                        this.trims.sort((a, b) => a[0] - b[0]);
                        Video.v.currentTime = this.trims.find(trim => Video.v.currentTime < trim[0])[0];
                    } else {
                        Video.v.currentTime = Video.v.duration;
                    }
                }
            }
        }
        calculateNextSkip() {
            this.trims.sort((a, b) => a[1] - b[1]);
            const next = this.trims.find(trim => Video.v.currentTime < trim[1]);
            this.nextSkip = next ? next[1] : null;
        }
        saveTrims() {
            this.calculateNextSkip();
            if (Video.id)
                GM_setValue(`t-${Video.id}`, this.trims);
        }
        static registerSettings() {
            super.registerSettings(true, {
                trim: ['Trim', 'text', 't']
            });
        }
    };
    mModule.mTrim.rName = 'Trim';
    mModule.mTrim.rDesc = 'Set trims for skipping parts of videos not within trims.';



    // ===========
    // Copy Module
    // ===========
    //
    // - Copy video with timestamp to clipboard
    //
    mModule.mCopy = class mCopy extends mModule {
        constructor() {
            super();
            this.registerKeys([settings.keybinds.copy]);
        }
        onKey(ev) {
            super.onKey(ev);
            if (!Video.v.duration || !Video.id) return;
            const units = Video.v.duration < 3600 ? [60,1] : [3600,60,1];
            const unitNms = ['s', 'm', 'h']; // TODO: Move this function to convert s to hh:mm:ss to helper functions, to be used in other modules
            let cur = Math.round(Video.v.currentTime);
            const time = units.map((v, i) => {
                const nv = Math.floor(cur/v);
                cur %= v;
                if (nv === 0)
                    return '';
                return (nv < 10 ? `0${nv}` : nv) + unitNms[units.length-1-i];
            }).join('');
            navigator.clipboard.writeText(`https://youtu.be/${Video.id}?t=${time}`);
        }
        static registerSettings() {
            super.registerSettings(true, {
                copy: ['Copy url with timestamp', 'text', 'v']
            });
        }
    };
    mModule.mCopy.rName = 'Copy';
    mModule.mCopy.rDesc = 'Copy video url with current timestamp.';



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
            if (!Video.v.paused) {
                Video.v.pause();
                Video.v.play();
            }
            // TODO: Add newVideo event to Video obj to update these event listeners
            Video.v.addEventListener('play', () => data += 'PLAY'); // TODO: If window was just created then pause the video, then play video when window gains focus
            Video.v.addEventListener('pause', () => data += 'PAUS');
            Video.v.addEventListener('ended', () => navigator.mediaSession.playbackState = 'paused');
            Video.addOnChange(() => setTimeout(() => this.onChange(), 200)); // TODO: Should it be 200ms?
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
            switch (ev.action) {
                case 'stop':
                case 'play': Video.v.play(); break;
                case 'pause': Video.v.pause(); break;
                case 'nexttrack': document.querySelector('.ytp-next-button').click(); break;
                case 'previoustrack':
                    let prev = document.querySelector('.ytp-prev-button');
                    if (prev) prev.click();
                    else      Video.v.currentTime = 0;
            }
        }
        static registerSettings() {
            super.registerSettings();
        }
    };
    mModule.mMediaSession.rName = 'Media Session';
    mModule.mMediaSession.rDesc = 'Fix media keys integration.';



    // =====
    // Notes
    // =====
    //
    // - Add note(s) to be associated with timestamps
    // - Popup list to jump to note's timestamp
    // TODO: Make time text in popup editable (input) so that one can move the note to another timestamp
    // TODO: Put popup inside of the notesBar so that it keeps the vertical position when video is resized (ie not static pixel y pos)
    // TODO: Make compatible with normal viewing mode (not thetre), specifically don't use #player-theater-container as parent
    // TODO: Make note text show somewhere when within x seconds of timestamp
    // TODO: Make a custom popup window for displaying the text instead of builtin titles
    // TODO: Add better styling on note marker (on hover: color, resize, pointer)
    // TODO: Add popup to list all notes on current video
    //
    mModule.mNotes = class mNotes extends mModule {
        constructor() {
            super();
            this.note = this.addItem(new mItemBtn(this, 'N', 'Note'));
            this.note.addOnClick(() => this.handleOnClick());
            this.registerKeys([settings.keybinds.note]);
            Video.addOnChange(() => this.onChange());
            Video.v.addEventListener('timeupdate', ev => this.onTimeUpdate(ev));
            this.notes = []; // Contains arrays with [timestamp (seconds), text]
            this.onChange();
        }
        drawNotes() {
            if (!this.notes.length) {
                if (this.notesBar)
                    this.notesBar.style.display = 'none';
            } else {
                if (!this.notesBar) {
                    this.notesBar = cr('div', { className:'ytsb-notes' });
                    q('#player-theater-container').appendChild(this.notesBar);
                }
                this.notesBar.style.display = 'block';
                [...this.notesBar.children].forEach(c => c.remove());
                const drawNote = (note) => {
                    const el = document.createElement('div');
                    el.style.height = '100%';
                    el.style.position = 'absolute';
                    el.style.left = note[0] / Video.v.duration * 100 + '%';
                    el.style.width = '6px';
                    el.style.backgroundColor = '#547';
                    el.title = note[1];
                    let prevClick = 0, tid;
                    el.onclick = () => {
                        clearTimeout(tid);
                        if (Date.now() < prevClick + 200) {
                            this.editNote(note);
                        } else {
                            prevClick = Date.now();
                            tid = setTimeout(() => Video.v.currentTime = note[0], 200);
                        }
                    };
                    this.notesBar.appendChild(el);
                };
                this.notes.forEach(note => drawNote(note));
            }
            this.note.element.innerText = `N${this.notes.length || ''}`;
        }
        editNote(note) {
            const close = () => { this.popup.remove(); this.popup = null; }
            if (this.popup) close();
            this.popup = cr('div', { className:'ytsb-popup', innerText:note[0] }); // TODO: Format HH:MM:SS from note[0] timestamp
            const inp = cr('textarea', { innerText:note[1], onkeydown:ev=>{
                if      (ev.key === 'Escape')              { close(); }
                else if (ev.key === 'Enter' && ev.ctrlKey) { this.saveNote(note, inp.value); close(); }
            }});
            const cancel = cr('button', { innerText:'Cancel', onclick:()=>{ close(); } });
            const save = cr('button', { innerText:'Save', onclick:()=>{ this.saveNote(note, inp.value); close(); } });
            this.popup.appendChild(inp);
            this.popup.appendChild(save);
            if (note[1].length)
                this.popup.appendChild(cr('button', { innerText:'Remove', onclick:()=>{ this.saveNote(note, ''); close(); } }));
            this.popup.appendChild(cancel);
            this.popup.style.top = scrollY + title.getBoundingClientRect().top + 'px';
            this.popup.style.left = (note[0] / Video.v.duration * 88 + 6) + '%';
            document.body.appendChild(this.popup);
            inp.focus();
        }
        goToNote(index) {
            if (this.notes[index])
                Video.v.currentTime = this.notes[index][0];
        }
        handleOnClick() {
            // TODO: Check if there already is a note at current time before creating a new one
            this.editNote([Video.v.currentTime, '']);
            this.drawNotes();
        }
        onChange() {
            if (Video.id) this.notes = GM_getValue(`n-${Video.id}`, []);
            else          this.notes = [];
            this.drawNotes();
        }
        onKey(ev) {
            super.onKey(ev);
            this.handleOnClick();
        }
        onTimeUpdate() {
            // TODO: Check notes as video progress and display those which are in proximity
        }
        calculateNextSkip() {
            this.notes.sort((a, b) => a[1] - b[1]);
            const next = this.notes.find(trim => Video.v.currentTime < trim[1]);
            this.nextSkip = next ? next[1] : null;
        }
        saveNote(note, newText) { // empty newText removes note
            if (this.notes.indexOf(note) !== -1) {
                if (newText.length) {
                    note[1] = newText;
                } else {
                    this.notes.splice(this.notes.indexOf(note), 1);
                }
            } else if (newText.length) {
                note[1] = newText;
                this.notes.push(note);
            } else {
                return;
            }
            this.saveNotes();
            this.drawNotes();
        }
        saveNotes() {
            if (Video.id)
                GM_setValue(`n-${Video.id}`, this.notes);
        }
        static registerSettings() {
            super.registerSettings(true, {
                note: ['Add note', 'text', 'n']
            });
        }
    };
    mModule.mNotes.rName = 'Notes';
    mModule.mNotes.rDesc = 'Add notes at timestamps in videos.';



    // ===============
    // Metadata Module
    // ===============
    //
    // - Save video metadata: title, uploader, upload date, view count, likes, dislikes
    // - If history module is enabled, last watch date will most likely be last time metadata was updated
    // TODO: Make module fill in info for deleted videos in lists
    // TODO: Option to add metadata from videos in list when viewing list page
    //
    mModule.mMetadata = class mMetadata extends mModule {
        constructor() {
            super();
            this.onVideoChangeId = Video.addOnChange(() => this.onVideoChange());
            this.onPageChangeId = Page.addOnChange(() => this.onPageChange());
            this.onVideoChange();
        }
        onVideoChange() {
            if (Video.id && Video.id != Video.prevId)
                setTimeout(() => this.saveMetadata(), 500); // FIXME: Gives time for elements to update in DOM, should rather check with a loop than doing it like this
        }
        onPageChange() {
            console.log('Page change')
            if (settings.modules.mMetadata.playlists && location.pathname === '/playlist') {
                console.log('doing in 500ms')
                setTimeout(() => {
                    qa('#meta.ytd-playlist-video-renderer').forEach(el => {
                        const id = /v=([a-zA-Z0-9]*)/.exec(el.parentElement.href)[1];
                        const prev = GM_getValue(`m-${id}`);
                        if (!prev) {
                            // TODO: Check if video is privated
                            GM_setValue(`m-${id}`, {
                                title: el.querySelector('#video-title').innerText,
                                uploaderName: el.querySelector('#metadata').innerText
                            });
                        }
                    });
                }, 500); // TODO: Verify that the playlist is still loaded, and use an interval instead to find metadata, including when scrolling down
            }
        }
        saveMetadata() {
            GM_setValue(`m-${Video.id}`, {
                title: title.innerText,
                uploaded: new Date(q('#date>yt-formatted-string').innerText).getTime(),
                uploaderName: q('.ytd-channel-name').innerText,
                uploaderId: /.*\/(.*)$/.exec(q('.ytd-channel-name a').href)[1], // youtube.com/channel/<uploaderId>
                views: +q('.view-count').innerText.replace(/[^0-9]/g,''),
                likes: +q('#top-level-buttons>:first-child').innerText.replace(/[^0-9]/g,''),
                dislikes: +q('#top-level-buttons>:nth-child(2)').innerText.replace(/[^0-9]/g,''),
            });
        }
        removeMetadata() {
            GM_setValue(`m-${Video.id}`, null);
        }
        static registerSettings() {
            super.registerSettings(false, null, ['Metadata', 'section', {
                playlists: ['Process playlists', 'checkbox', true]
            }]); //[{ path:['/', 'ytsb', 'enabledModules'], eval:v=>-1<v.indexOf('Metadata'), action:'hide' }]
        }
    };
    mModule.mMetadata.rName = 'Metadata';
    mModule.mMetadata.rDesc = 'Save video metadata: title, uploader, upload date, view count, likes and dislikes.';



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
.ytbc-p>input:focus{outline:none;}
.ytsb-popup{position:absolute;background-color:#333;width:250px;display:grid;font-size:16px;
    padding:5px;text-align:center;color:white;z-index:1000;}
.ytsb-notes{position:absolute;bottom:-11px;left:11px;right:11px;height:11px;}`);


    // ====
    // Init
    // ====
    let title, container;

    Page.start();

    function init() {
        container = cr('div', { className:'ytbc' });

        // Initialize modules
        const REF = {}; Object.keys(mModule).forEach(k => REF[mModule[k].rName] = k);
        settings.enabledModules.map(name => new mModule[REF[name]]());

        title.parentElement.insertBefore(container, title);
    }

    // Wait for video to exist before initializing modules
    // TODO: If current page isn't a watch page maybe we should wait some other way?
    let id = setInterval(() => {
        if (!title) title = document.querySelector('#container>.title');
        if (!Video.v) Video.v = document.querySelector('video');
        if (title && Video.v) {
            Video.setVideo(Video.v);
            clearInterval(id);
            setTimeout(init, 20);
        }
    }, 50);

    // Register settings all modules' settings
    Object.keys(mModule).forEach(k => mModule[k].registerSettings());

    // Create settings instance
    const sObj = new UserscriptSettings(settingsDescriptor, { ytsb:GM_getValue('settings') });
    sObj.addOnChange(vals => GM_setValue('settings', settings = vals), 'ytsb');

    // Get current settings, including default values
    settings = Object.assign({}, UserscriptSettings.getValues('ytsb'));

    // Register menu entry to open settings
    GM_registerMenuCommand('Settings', sObj.show, 's');
})();