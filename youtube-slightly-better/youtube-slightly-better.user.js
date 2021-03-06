// ==UserScript==
// @name         YouTube Slightly Better
// @namespace    https://github.com/josefandersson/userscripts/tree/master/youtube-slightly-better
// @version      1.65
// @description  Adds some extra features to YouTube
// @author       Josef Andersson
// @match        https://www.youtube.com/*
// @icon         https://youtube.com/favicon.ico
// @require      https://raw.githubusercontent.com/josefandersson/userscripts/master/userscript-settings/userscript-settings.js#2.7b
// @resource     style.css https://raw.githubusercontent.com/josefandersson/userscripts/master/youtube-slightly-better/style.css
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @grant        GM_getResourceText
// @run-at       document-start
// ==/UserScript==

// TODO:  - Playlists: reverse, shuffle
//        - Smart speed module that analyzes the sound to vastly speed up the clip when no one is talking/no sound
//        - Disable autoplaying 'channel trailer' video on channel page
//        - Minimize player when scrolling down
//        - Rewrite history module, if video is replayed without reloaded add extra plays to history,
//          use video progression every second to check playtime instead of real life time since the video can be speed up/down
//        - Remake init and module system somewhat, so that it inits on any page, not just when video is detected, also add onEnable/onDisable for toggling modules
//        - Add modules: quick-replay (mark a start and stop to replay, one more click clears)


// =============
// User settings
// =============
let settings;
const settingsDescriptor = {
    ytsb: ['YouTube Slightly Better', 'section', {
        keyPressRate: ['Key press rate (0 for system default)', 'number', 0],
        enabledModules: ['Enabled modules', 'list', [], [], null, { orderable:true }],
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
    const prox = (val1, val2, lim) => Math.abs(val1 - val2) < lim;
    const timeToHHMMSSmss = (sec, dyn=true, units=null, millis=true) => {
        if (!units) units = dyn && Page.v.duration < 3600 ? [60,1] : [3600,60,1];
        return units.map(v => { const nv=Math.floor(sec/v); sec%=v; return nv < 10 ? `0${nv}` : nv; }).join(':') + (millis && 0 < sec ? `.${sec.toFixed(3).substring(2)}` : '');
    };
    const timeFromHHMMSSmss = str => {
        const t = str.split(/[: ]/).reverse().map(n => +n);
        return (t[0]||0) + (t[1]||0) * 60 + (t[2]||0) * 3600;
    };



    // ======================
    // Handle key events/cmds
    // ======================
    const keyListeners = {};
    const keyEvent = (ev, event) => {
        if (keyListeners[ev.key] && keyListeners[ev.key][event])
            if (ev.key === 'Escape' || (ev.target.getAttribute('contenteditable') != 'true' && ['INPUT', 'SELECT', 'TEXTAREA'].indexOf(ev.target.tagName) === -1))
                keyListeners[ev.key][event].forEach(cb => cb(ev, event));
    }

    document.addEventListener('keypress', ev => keyEvent(ev, 'keypress'));
    document.addEventListener('keyup', ev => keyEvent(ev, 'keyup'));
    document.addEventListener('keydown', ev => keyEvent(ev, 'keydown'));



    // =============
    // Page observer
    // =============
    // TODO: When changing to some pages without a video player (settings? user profile?) we need to re-detect it when we are back to a video page
    const Page = {
        v: null,             // Video DOM element
        vid: null,           // Video id (v=xxxxxxxx in URL)
        prevVid: null,       // Previous video id
        prevUrl: null,       // Previous url
        isTheater: false,    // Player is in theater mode
        isLivestream: false, // Video is live (Inaccurate duration/currentTime)
        time: null,

        callbacks: {
            theater: [],
            url: [],
            video: []
        },

        loopUrl: function() {
            if (location.href !== this.prevUrl) {
                this.call('url');
                this.prevUrl = location.href;
            }
            this.tidUrl = this.callbacks.url.length ? setTimeout(() => this.loopUrl, 500) : null;
        },

        addCallback: function(ev, cb) {
            const cbs = this.callbacks[ev];
            if (!cbs) throw new Error('unknown event: ' + ev);
            let i = 0;
            while (cbs[i] != null) i++;
            cbs[i] = cb;

            switch (ev) {
                case 'theater':
                    if (!this.mutObsTheater) {
                        const theater = document.getElementById('player-theater-container');
                        this.isTheater = 0 < theater.children.length;
                        this.mutObsTheater = new MutationObserver(() => {
                            if ((0 < theater.children.length) !== this.isTheater) {
                                this.isTheater = !this.isTheater;
                                this.call('theater');
                            }
                        });
                        this.mutObsTheater.observe(theater, { childList:true });
                    }
                    break;
                case 'url':
                    if (!this.tidUrl && this.callbacks.url.length) {
                        this.prevUrl = location.href;
                        this.tidUrl = setTimeout(() => this.loopUrl, 500);
                    }
                    break;
            }
            
            return i;
        },
        call: function(ev) {
            const cbs = this.callbacks[ev];
            if (!cbs) throw new Error('unknown event: ' + ev);
            cbs.filter(cb => cb != null).forEach(cb => cb());
        },
        removeCallback: function(ev, i) {
            const cbs = this.callbacks[ev];
            if (!cbs) throw new Error('unknown event: ' + ev);
            cbs[i] = null;
        },

        setVideo: function(video) {
            this.v = video;
            const cb = () => {
                this.prevVid = this.vid;
                const param = new URLSearchParams(location.search);
                this.vid = param.get('v');
                this.time = param.get('t');
                this.isLivestream = !!document.querySelector('.ytp-live');
                this.call('video');
            }
            this.v.addEventListener('loadeddata', cb);
            cb();
        },
    };



    // ======================
    // Custom bar below video
    // ======================
    // TODO: Make items moveable by dragging them, add a onMoved to barItems (that has to later update the new position), and a canMove or something
    //
    const FALLBACK_WIDTH = 4, GROUP_HEIGHT = 2, DOUBLE_CLICK_MS = 250;
    const Bar = {
        el: null,
        items: [], // [BarItem,...]
        lowestGroup: 0,
        addItem: function(item) {
            this.items.push(item);
            item.isInBar = true;
            this.calculateDimensions();
            this.el.appendChild(item.el);
        },
        calculateDimensions: function() {
            if (this.items.length) {
                this.lowestGroup = this.items[0].group;
                let heights = [];
                this.items.forEach(item => {
                    if (item.group < this.lowestGroup) this.lowestGroup = item.group;
                    if (!heights[item.group] || heights[item.group] < item.height) heights[item.group] = item.height;
                });
                this.height = heights.filter(v => v != null).reduce((p, c) => p + c, 0);
            } else {
                this.lowestGroup = 0;
                this.height = 0;
            }
            this.ensureElement();
            // TODO: Move items vertically if they collide
            Object.assign(this.el.style, { height:`${this.height}px` });
        },
        clear: function() {
            this.items.length = 0;
            this.el?.children.forEach(c => c.remove()); // TODO: This isn't working "forEach not a function"
        },
        createElement: function() {
            this.elParent = cr('div', { className:'ytsb-bar' });
            this.elParent.appendChild(this.el = cr('div'));
            Page.addCallback('theater', () => this.reorderElement());
            this.reorderElement();
        },
        ensureElement: function() {
            if (!this.el)
                this.createElement();
        },
        removeItem: function(item) {
            item.el.remove();
            item.isInBar = false;
            this.items.splice(this.items.indexOf(item), 1);
            this.calculateDimensions();
        },
        reorderElement: function() {
            const prevSibling = Page.isTheater ? q('#columns') : q('#info');
            prevSibling.parentElement.insertBefore(this.elParent, prevSibling);
        }
    };

    class BarItem {
        constructor({ above=false, color='red', doubleClicks=false, group=0, height=9, onClick=null, start, stop=null, text=null }={}) {
            this.above = above;
            this.doubleClicks = doubleClicks;
            this.group = group;
            this.onClick = onClick;
            this.text = text;
            this.isInBar = false;

            this.createElement();
            this.setColor(color);
            this.setHeight(height);
            this.setStartStop(start, stop);
        }
        add() {
            Bar.addItem(this);
            return this;
        }
        createElement() {
            this.el = cr('div');
            let tid, prevClick;
            const handler = ev => {
                ev.preventDefault();
                if (this.onClick) {
                    if (this.doubleClicks) {
                        clearTimeout(tid);
                        const now = Date.now();
                        if (now < prevClick + 200) {
                            this.onClick(ev.button, true);
                        } else {
                            prevClick = now;
                            tid = setTimeout(() => this.onclick(ev.button), DOUBLE_CLICK_MS);
                        }
                    } else {
                        this.onClick(ev.button);
                    }
                }
            };
            this.el.oncontextmenu = handler;
            this.el.onclick = handler;
            this.el.onmouseenter = () => {
                if (this.text)
                    Popup.create({ target:this.el, text:this.text });
            }
            this.el.style.zIndex = (this.above ? 100 : 1000) + this.group;
        }
        remove() {
            Bar.removeItem(this);
            return this;
        }
        setColor(color) {
            this.el.style.backgroundColor = this.color = color;
        }
        setHeight(height) {
            this.el.style.height = `${this.height = height}px`;
            if (!this.above)
                Bar.calculateDimensions();
        }
        // start and stop in 0.0-1.0
        setStartStop(start, stop=null) {
            this.start = start;
            this.stop = stop;
            if (stop == null) {
                this.offset = -FALLBACK_WIDTH / 2;
                this.width = 0;
            } else {
                this.offset = 0;
                this.width = (stop - start);
            }
            Object.assign(this.el.style, { left:`calc(${start*100}% + ${this.offset}px)`, width:`${this.width*100}%` });
            if (!this.above)
                Bar.calculateDimensions();
        }
        setRawStart(start) {
            this.start = start;
            this.el.style.left = `calc(${start*100}% + ${this.offset}px)`;
        }
    }



    // =====================
    // Popup hovering window
    // =====================
    // TODO: Make popup changeable while window is displaying, eg when changing progress mode by clicking to display current mode
    const OFFSET_Y = 10; // TODO: Make window offset a setting?
    const Popup = {
        positionPopup: function(popup, left, top, centerX=false, centerY=false, popRect=null) {
            if (!popRect) {
                popup.style.display = 'block';
                popRect = popup.getBoundingClientRect();
            }
            if (centerX) left = `calc(${left} - ${popRect.width/2}px)`;
            if (centerY) top = `calc(${top} - ${popRect.height/2}px)`;
            // TODO: Use popRect to make sure popup does not end up outside of the doc
            Object.assign(popup.style, { left, top });
        },
        positionPopupTo: function(popup, target, centerX=false, centerY=false) {
            popup.style.display = 'block';
            const tarRect = target.getBoundingClientRect();
            const popRect = popup.getBoundingClientRect();
            const left = (tarRect.left + tarRect.width / 2 - popRect.width / 2) + 'px';
            const top = (tarRect.top + tarRect.height + scrollY + OFFSET_Y) + 'px';
            this.positionPopup(popup, left, top, centerX, centerY, popRect);
        },

        /** Create a popup window with text or a child element.
         *  If sticky=false then window will be removed when mouse leaves target
         *  Returns popup element
         */
        create: function({ centerX=false, centerY=false, childElement=null, inBar=false, left=null, sticky=false, target=null, text=null, top=null }={}) {
            const popup = cr('div', { className:'ytsb-popup' });
            if (inBar) {
                Bar.ensureElement();
                Bar.el.appendChild(popup);
            } else document.body.appendChild(popup);
            if (childElement != null) popup.appendChild(childElement);
            else                      popup.innerText = text;
            if (target != null) {
                this.positionPopupTo(popup, target, centerX, centerY);
                if (!sticky) target.onmouseleave = () => popup.remove();
            } else if (left != null && top != null) {
                this.positionPopup(popup, left, top, centerX, centerY);
            } else {
                popup.remove();
                return null;
            }
            return popup;
        },
    };



    // =======
    // Modules
    // =======
    class mModule {
        constructor() {
            this.element = cr('div');
            btnsContainer.appendChild(this.element);
            this.element.style.display = 'none';
            this.items = [];
            this.constructor.i = this;
        }
        addItem(item) {
            this.items.push(item);
            this.element.appendChild(item.element);
            this.element.style.display = '';
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
        // If moduleSettings is true then add condition to only show section when module is enabled
        static registerSettings(defaultEnabled=false, moduleKeys=null, moduleSettings=null) {
            settingsDescriptor.ytsb[2].enabledModules[2].push(this.rName);
            if (defaultEnabled)
                settingsDescriptor.ytsb[2].enabledModules[3].push(this.rName);
            if (moduleKeys)
                Object.assign(settingsDescriptor.ytsb[2].keybinds[2], moduleKeys);
            if (moduleSettings) {
                if (moduleSettings[3] === true)
                    moduleSettings[3] = [{ path:['/', 'ytsb', 'enabledModules'], eval:v=>v.indexOf(this.rName)===-1, action:'disable' }]
                settingsDescriptor.ytsb[2].modules[2][this.name] = moduleSettings;
            }
        }
    }



    // ====================
    // Playback Rate Module
    // ====================
    // 
    // - Change video playback rate. (Hold btns or keys to change rate faster)
    // - Current rate is shown between S and F. Click current rate to reset rate to 1.
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
        getPlaybackRateStr() { return Page.v.playbackRate.toFixed(2) + ''; }
        changePlaybackRate(diff) { return this.setPlaybackRate(Page.v.playbackRate + diff); }
        setPlaybackRate(rate) {
            Page.v.playbackRate = Math.max(settings.modules.mPlaybackRate.minPlaybackRate, Math.min(settings.modules.mPlaybackRate.maxPlaybackRate, rate));
            this.speed.element.innerText = this.getPlaybackRateStr();
            return Page.v.playbackRate === rate;
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
            }, true]);
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
            return Page.vid ? `https://img.youtube.com/vi/${Page.vid}/maxresdefault.jpg` : null;
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
            const canvas = cr('canvas', { width:Page.v.videoWidth, height:Page.v.videoHeight });
            const context = canvas.getContext('2d');
            context.drawImage(Page.v, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/png').replace('image/png', 'image/octet-stream');
            const link = cr('a', { download:`screenshot-${Page.vid}.png`, href:dataUrl });
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
    //     05:03 -> 5m3s    7:9:23 -> 7h9m23s    :24 -> 24s    19 -> 19m    1: -> 1h
    //     t2 -> second trim (if mTrim is enabled)
    //     n  -> first note    n5 -> fifth note (if mNotes is enabled)
    //     You may use a literal space (' ') instead of colon (':').
    //     Adding + or - before time will seek relative to current time.
    // TODO: Rename to mSeek
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
            let t = [], rel = 0;
            if (/^[-+]/.test(str)) {
                rel = str[0] === '-' ? -1 : 1;
                str = str.substring(1);
            }
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
                        mModule.mNotes.i.seekNote(index-1);
                } else {
                    if (mModule.mTrim.i)
                        mModule.mTrim.i.seekTrim(index-1);
                }
                return;
            } else { // 01:02:03,02:03,03 (normal)
                t = str.split(/[: ]/).reverse().map(n => +n);
            }
            let secs = (t[0]||0) + (t[1]||0) * 60 + (t[2]||0) * 3600;
            if (rel !== 0)
                secs = Math.max(Page.v.currentTime + secs * rel, 0);
            if (secs < Page.v.duration) {
                Page.v.currentTime = secs;
                if (settings.modules.mGoToTimestamp.playAfterSeek)
                    Page.v.play();
            }
        }
        openPrompt() {
            if (this.prompt) return this.closePrompt();
            this.prompt = cr('div', { className:'ytbc-p' });
            const input = cr('input', { type:'text', autofill:'off', size:1 });
            const allowedTimestamp = /^([+-]?[0-5]?[0-9](([: ][0-5]?[0-9]){0,2}|[hms: ]))|([+-]?[: ][0-5]?[0-9])|[nt]|([nt][1-9][0-9]*)$/;
            const badCharacters = /[^0-9: hmsnt+-]/g;
            input.addEventListener('input', ev => {
                let r;
                if (ev.inputType === 'insertFromPaste' && (r = /^https:\/\/(?:youtu\.be\/|www\.youtube\.com\/watch\?v=)[a-zA-Z0-9]*[?&]t=([^&]*)/.exec(input.value))) {
                    input.value = r[1];
                } else if (ev.inputType === 'insertText' && badCharacters.test(input.value))
                    input.value = input.value.replace(badCharacters, '');
                input.setAttribute('size', input.value.length || 1);
                if (allowedTimestamp.test(input.value)) {
                    Object.assign(input.style, { backgroundColor:'#3cd23a8c', color:'#0c3511' });
                } else {
                    Object.assign(input.style, { backgroundColor:'#d019108c', color:'#350505' });
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
            },['Go To Timestamp', 'section', {
                playAfterSeek: ['Play video after seek', 'checkbox', false]
            }, true]);
        }
    };
    mModule.mGoToTimestamp.rName = 'Go To Timestamp';
    mModule.mGoToTimestamp.rDesc = 'Prompts the user for a timestamp to jump to.';



    // =====================
    // History Module
    // =====================
    //
    // - Remember all watched videos and print how many times current video has been watched.
    // TODO: Right click to edit number of watches?
    mModule.mHistory = class mHistory extends mModule {
        constructor() {
            super();
            this.seen = this.addItem(new mItemBtn(this, '-', 'Prints number of times you have watched this video\nRed texts means current viewing is not yet counted\nGreen texts means number includes current viewing\nLeft-click: Add current viewing to count (make number green)'));
            this.seen.addOnClick(() => this.onClick());
            this.isPlaying = false;
            Page.addCallback('video', () => this.onChange());
            Page.v.addEventListener('play', ev => this.onPlay(ev)); // TODO: Add videoChange event (or similar) to Video object to re-add these listeners when video element changes
            Page.v.addEventListener('pause', ev => this.onPause(ev));
            this.onChange();
        }
        onChange() {
            if (Page.vid && Page.vid != Page.prevVid) {
                this.isCounted = false; // TODO: remove
                this.replays = 1;
                this.startedWatchingAt = Date.now();
                this.historyData = GM_getValue(`h-${Page.vid}`, null);
                if (this.historyData) {
                    this.seen.element.innerText = this.historyData.n;
                    this.seen.element.style.color = '#ff4343';
                } else {
                    this.seen.element.innerText = '0';
                    this.seen.element.style.color = 'inherit';
                }
                this.minimumTime = settings.modules.mHistory.minPercentageBeforeSeen * Page.v.duration * 1000;
                this.onPause();
                this.currentPlaytime = 0;
                if (!Page.v.paused)
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
            GM_setValue(`h-${Page.vid}`, this.historyData);
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
            GM_setValue(`h-${Page.vid}`, this.historyData);
            this.seen.element.style.color = '#ff4343';
            this.seen.element.innerText = this.historyData.n;
        }
        static registerSettings() {
            super.registerSettings(false, null, ['History', 'section', {
                minPercentageBeforeSeen: ['Minimum percentage before counted as seen', 'number', .8,, 0, 1, .05],
            }, true]);
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
            this.progress = this.addItem(new mItemBtn(this, '0%', `Video progression\nLeft-click: Cycle mode\nKeybinding: ${settings.keybinds.progressFormat}`));
            this.progress.addOnClick(() => this.handleOnClick());
            this.mode = 'percentage';
            this.registerKeys([settings.keybinds.progressFormat]);
            this.onChangeId = Page.addCallback('video', () => this.onChange());
            Page.v.addEventListener('timeupdate', () => this.updateProgression()); // TODO: Add newPlayer event to Page object
            this.onChange();
        }
        handleOnClick() {
            const modes = ['percentage', 'time', 'timeleft', 'minimum', 'minimumleft'];
            this.mode = modes[(modes.indexOf(this.mode) + 1) % modes.length];
            GM_setValue('p_mode', this.mode);
            this.progress.text = `Video progression\nCurrent mode: ${this.mode}\nLeft-click: Cycle mode`;
            this.updateProgression();
        }
        onChange() {
            this.mode = GM_getValue('p_mode', 'percentage');
            this.progress.text = `Video progression\nCurrent mode:${this.mode}\nLeft-click: Cycle mode`;
            this.updateProgression();
        }
        onKey(ev) {
            super.onKey(ev);
            this.handleOnClick();
        }
        updateProgression() {
            if (!Page.v.duration)
                return;
            let newValue;
            switch (this.mode) {
                case 'percentage':
                    newValue = `${Math.round(Page.v.currentTime / Page.v.duration * 100)}%`;
                    break;
                case 'time':
                    newValue = timeToHHMMSSmss(Math.round(settings.modules.mProgress.respectSpeed ? Page.v.currentTime / Page.v.playbackRate : Page.v.currentTime), true);
                    break;
                case 'timeleft':
                    newValue = timeToHHMMSSmss(Math.round(settings.modules.mProgress.respectSpeed ? (Page.v.duration - Page.v.currentTime) / Page.v.playbackRate : Page.v.duration - Page.v.currentTime), true);
                    break;
                case 'minimum':
                case 'minimumleft':
                    let t = this.mode === 'minimum' ? Page.v.currentTime : Page.v.duration - Page.v.currentTime;
                    if (settings.modules.mProgress.respectSpeed) t /= Page.v.playbackRate;
                    newValue = t < 60 ? `${Math.round(t)}s` : t < 3600 ? `${Math.round(t / 60)}m` : `${Math.round(t / 3600)}h`;
                    break;
                default:
                    return;
            }
            if (newValue === this.oldValue)
                return;
            this.progress.element.innerText = this.oldValue = newValue;
        }
        static registerSettings() {
            super.registerSettings(true, {
                progressFormat: ['Change progress format', 'text', 'p']
            }, ['Progress', 'section', {
                respectSpeed: ['Respect video speed', 'checkbox', true]
            }, true]);
        }
    };
    mModule.mProgress.rName = 'Progress';
    mModule.mProgress.rDesc = 'Show video progression below the video.';



    const TRIM_PROXIMITY = .5; // TODO: Add to settings

    // ===========
    // Trim Module
    // ===========
    //
    // - Autotrim videos for the next time you watch them. Useful for eg. music videos on music playlists.
    // - Set a trim start and stop with hotkey 'y', when video loads it will jump to first trim start
    // - With multiple trims, it will skip video between trims
    // - One trim fully within another trim will untrim (skip) that part of the parent trim
    // - When trims overlap but aren't fully within, the trims will add together
    // - FIXME: When removing trims, the wrong barItem is removed, yet the correct trim is removed from storage (ie looks like another trim was removed when in reality the still wanted trim is not gone)
    // - TODO: Use video speed in calculating next trim, also recalc when video speed changes
    //   TODO: Before skipping to end of video/next vid after trim, check if video is on repeat, if so, seek to first trim again
    //   TODO: Can't seem to start trim at start of video?
    //   TODO: Redo whole module with use Bar
    //   TODO: If Page.time, disable trims until one is clicked?
    //   TODO: If video is seeked manually (mouse or keys)
    //
    mModule.mTrim = class mTrim extends mModule {
        constructor() {
            super();
            this.trim = this.addItem(new mItemBtn(this, 'T', `Trim\nKeybinding: ${settings.keybinds.trim}`));
            this.trim.addOnClick(() => this.handleOnClick());
            this.registerKeys([settings.keybinds.trim]);
            this.onChangeId = Page.addCallback('video', () => this.onChange());
            Page.v.addEventListener('timeupdate', ev => this.onTimeUpdate(ev)); // TODO: Add newVideo event to Video obj
            Page.v.addEventListener('seeking', ev => this.onSeeking());
            this.active = true;
            this.activeOverride = 0;
            this.trims = []; // Contains arrays with [startTimestamp, endTimestamp] (seconds)
            this.barItems = [];
            this.current = []; // [timestamp, barItem]
            this.onChange();
        }
        onSeeking() {
            if (!this.trims.find(trim => trim[0] <= Page.v.currentTime && Page.v.currentTime <= trim[1]))
                this.setActive(false);
        }
        seekTrim(index) {
            if (this.trims[index]) {
                Page.v.currentTime = this.trims[index][0];
                this.activeOverride++;
                this.setActive(true);
            }
        }
        calculateAction() {
            let currentTime = Page.v.currentTime;
            let startInProx = false;
            const inProx = this.trims.find(trim => (startInProx = prox(currentTime, trim[0], TRIM_PROXIMITY)) || prox(currentTime, trim[1], TRIM_PROXIMITY));
            if (this.current.length) {
                if (inProx) {
                    // Extend inProx trim to current
                    const i = this.trims.indexOf(inProx);
                    inProx[startInProx ? 0 : 1] = this.current[0];
                    // TODO: Make sure the order in inProx is correct
                    this.barItems[i].setStartStop(inProx[0], inProx[1]);
                } else {
                    // TODO:
                    // If within another trim
                        // Split other trim into two (mask)
                    // Else if crossing another trim
                        // Merge trims or cut?
                    // Else
                        const trim = this.current[0] < currentTime ? [this.current[0], currentTime] : [currentTime, this.current[0]];
                        this.trims.push(trim);
                        const item = new BarItem({ color:'#aa3', height:4, onClick:btn => {
                            switch (btn) {
                                case 0: Page.v.currentTime = trim[0]; this.activeOverride++; this.setActive(true); break;
                                case 2: this.editTrim(trim);
                            }
                        }, start:trim[0]/Page.v.duration, stop:trim[1]/Page.v.duration });
                        this.barItems.push(item);
                        Bar.addItem(item);
                    // If any trims are fully inside
                        // Make inside trims split created trim
                }
                this.removeCurrent();
                this.saveTrims();
            } else {
                if (inProx) {
                    currentTime = inProx[startInProx ? 1 : 0];
                    const i = this.trims.indexOf(inProx);
                    this.barItems[i].remove();
                    this.trims.splice(i, 1);
                    this.barItems.splice(i, 1);
                    this.saveTrims();
                }
                // Create current
                this.current[0] = currentTime;
                const item = new BarItem({ color:'#a30', onClick:btn => {
                    switch (btn) {
                        case 0: Page.v.currentTime = currentTime; break;
                        case 2: this.removeCurrent();
                    }
                }, start:currentTime/Page.v.duration });
                Bar.addItem(this.current[1] = item);
                this.trim.element.style.color = 'red'; // TODO: Set color
            }
            this.updateText();
        }
        editTrim(trim) {
            const close = () => { this.popup.remove(); this.popup = null; }
            if (this.popup) close();
            const ce = cr('div', { innerHTML:
                `<input type='text' value='${timeToHHMMSSmss(trim[0])}'> - <input type='text' value='${timeToHHMMSSmss(trim[1])}'>` +
                '<button>Save</button><button>Cancel</button><button>Remove</button>' });
            ce.children[2].onclick = () => { this.saveTrim(trim, ce.children[0].value, ce.children[1].value); close(); };
            ce.children[3].onclick = () => { close(); };
            ce.children[4].onclick = () => { this.saveTrim(trim); close(); };
            ce.style.display = 'grid';
            this.popup = Popup.create({ inBar:true, childElement:ce, centerX:true,
                left: ((trim[0] + trim[1]) / 2 / Page.v.duration * 100) + '%', top: 'calc(100% + 5px)' }); // TODO: Maybe just attachTo barItem? (create a temp one if doesn't exist) (would need some fix for percentage then tho)
        }
        saveTrim(trim, start=null, stop=null) {
            if (start == null && stop == null) {
                const i = this.trims.indexOf(trim);
                this.barItems[i].remove();
                this.trims.splice(i, 1);
                this.updateText();
            } else {
                if (start != null) {
                    // TODO: Change start for trim and barItem
                }
                if (stop != null) {
                    // TODO: Change stop for trim and barItem
                }
            }
            this.saveTrims();
        }
        removeCurrent() {
            this.current[1]?.remove();
            this.current.length = 0;
            this.trim.element.style.color = '';
        }
        updateText() {
            this.trim.element.innerText = `T${this.trims.length || ''}`;
        }
        setActive(active) {
            if (this.active != active) {
                if (!active && 0 < this.activeOverride)
                    return this.activeOverride--;
                this.active = active;
                const color = active ? '#b97621' : '#463014';
                this.barItems.forEach(i => i.setColor(color));
                if (active)
                    this.calculateNextSkip();
            }
        }
        onKey(ev) {
            super.onKey(ev);
            this.calculateAction();
        }
        saveTrims() {
            this.calculateNextSkip();
            if (Page.vid)
                GM_setValue(`t-${Page.vid}`, this.trims);
        }
        onChange() {
            if (Page.vid) this.trims = GM_getValue(`t-${Page.vid}`, []);
            else          this.trims = [];
            this.barItems.forEach(i => i.remove());
            this.barItems.length = 0;
            this.removeCurrent();
            if (this.trims.length && !Page.time) { // TODO: Move to calculateNextSkip() ?
                this.trims.sort((a, b) => a[0] - b[0]);
                Page.v.currentTime = this.trims[0][0];
            }
            if (Page.time)
                this.setActive(false);
            this.calculateNextSkip();
            const createBarItem = (trim, i) => {
                const item = new BarItem({ color:'#aa3', height:4, onClick:btn => {
                    switch (btn) {
                        case 0: Page.v.currentTime = trim[0]; this.activeOverride++; this.setActive(true); break;
                        case 2: this.editTrim(trim);
                    }
                }, start:trim[0]/Page.v.duration, stop:trim[1]/Page.v.duration });
                Bar.addItem(item);
                this.barItems[i] = item;
            };
            this.trims.forEach(createBarItem);
            this.updateText();
        }
        
        
        handleOnClick() {
            this.calculateAction();
        }
        onTimeUpdate() {
            if (!this.active) return;
            if (Page.v.seeking) this.setActive(false);
            if (this.nextSkip && this.nextSkip <= Page.v.currentTime) {
                this.calculateNextSkip();
                if (this.nextSkip) {
                    this.trims.sort((a, b) => a[0] - b[0]); // TODO: Sort only has to be done whenever trim list updates or any trim start/stop updates
                    Page.v.currentTime = this.trims.find(trim => Page.v.currentTime < trim[0])[0];
                } else if (Page.v.loop) {
                    Page.v.currentTime = this.trims[0][0];
                    this.calculateNextSkip();
                } else {
                    Page.v.currentTime = Page.v.duration;
                }
            }
        }
        calculateNextSkip() {
            this.trims.sort((a, b) => a[1] - b[1]); // TODO: Sort only has to be done whenever trim list updates or any trim start/stop updates
            const next = this.trims.find(trim => Page.v.currentTime <= trim[1]);
            this.nextSkip = next ? next[1] : null;
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
            if (!Page.v.duration || !Page.vid) return;
            const time = timeToHHMMSSmss(Page.v.currentTime, true, null, false).split(':').reverse().map((v, i) => v + ['s','m','h'][i]).reverse().join('');
            navigator.clipboard.writeText(`https://youtu.be/${Page.vid}?t=${time}`);
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
    // TODO: Make mediaSession status work
    // TODO: Add option make next and previous hop to notes before of next/prev video
    //
    mModule.mMediaSession = class mMediaSession extends mModule {
        constructor() {
            super();
            let data = '';
            setInterval(() => {
                // document.title = 'State: ' + navigator.mediaSession.playbackState + ' ' + data;
            }, 200);
            if (!Page.v.paused) {
                Page.v.pause();
                Page.v.play();
            }
            // TODO: Add player event to Page obj to update these event listeners
            Page.v.addEventListener('play', () => data += 'PLAY'); // TODO: If window was just created then pause the video, then play video when window gains focus
            Page.v.addEventListener('pause', () => data += 'PAUS');
            Page.v.addEventListener('ended', () => navigator.mediaSession.playbackState = 'paused');
            Page.addCallback('video', () => setTimeout(() => this.onChange(), 200)); // TODO: Should it be 200ms?
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
                case 'play': Page.v.play(); break;
                case 'pause': Page.v.pause(); break;
                case 'nexttrack': document.querySelector('.ytp-next-button').click(); break;
                case 'previoustrack':
                    let prev = document.querySelector('.ytp-prev-button');
                    if (prev) prev.click();
                    else      Page.v.currentTime = 0;
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
    // TODO: Make the timestamp easy to copy with url
    //
    mModule.mNotes = class mNotes extends mModule {
        constructor() {
            super();
            this.note = this.addItem(new mItemBtn(this, 'N', `Note\nKeybinding: ${settings.keybinds.note}`));
            this.note.addOnClick(() => this.handleOnClick());
            this.registerKeys([settings.keybinds.note]);
            Page.addCallback('video', () => this.onChange());
            Page.v.addEventListener('timeupdate', ev => this.onTimeUpdate(ev));
            this.notes = []; // Contains arrays with [timestamp (seconds), text]
            this.barItems = [];
            this.onChange();
        }
        createBarItems() {
            if (this.notes.length) {
                const createItem = (note, i) => {
                    const start = note[0] / Page.v.duration;
                    if (this.barItems[i] == null) {
                        this.barItems[i] = new BarItem({ color:'#546', group:1, height:11, onClick:(btn) => {
                            switch (btn) {
                                case 0: Page.v.currentTime = note[0]; break;
                                case 2: this.editNote(note);           break;
                            }
                        }, start, text:note[1] });
                        Bar.addItem(this.barItems[i]);
                    } else {
                        this.barItems[i].setStartStop(start);
                    }
                };
                this.notes.forEach(createItem);
            }
            this.note.element.innerText = `N${this.notes.length || ''}`;
        }
        editNote(note) {
            const close = () => { this.popup.remove(); this.popup = null; }
            if (this.popup) close();
            const ce = cr('div', { innerHTML:
                `<input type='text' value='${timeToHHMMSSmss(note[0])}'><textarea>${note[1] || ''}</textarea>` +
                '<button>Save</button><button>Cancel</button>' });
            ce.children[1].onkeydown = ev => {
                if      (ev.key === 'Escape')              { close(); } // TODO: Don't close window if there are changes
                else if (ev.key === 'Enter' && ev.ctrlKey) { this.saveNote(note, ce.children[0].value, ce.children[1].value); close(); }
            };
            ce.children[2].onclick = () => { this.saveNote(note, ce.children[0].value, ce.children[1].value); close(); };
            ce.children[3].onclick = () => { close(); };
            ce.style.display = 'grid';
            if (note[1] != null)
                ce.appendChild(cr('button', { innerText:'Remove', onclick:()=>{ this.saveNote(note); close(); } }));
            this.popup = Popup.create({ inBar:true, childElement:ce, centerX:true,
                left: (note[0] / Page.v.duration * 100) + '%', top: 'calc(100% + 5px)' }); // TODO: Maybe just attachTo barItem? (create a temp one if doesn't exist) (would need some fix for percentage then tho)
            ce.children[1].focus();
        }
        seekNote(index) {
            if (index < this.notes.length) {
                this.notes.sort((a, b) => a[0] - b[0]);
                Page.v.currentTime = this.notes[index][0];
            }
        }
        handleOnClick() {
            // TODO: Check if there already is a note at current time before creating a new one
            this.editNote([Page.v.currentTime, null]);
            this.createBarItems();
        }
        onChange() {
            if (Page.vid) this.notes = GM_getValue(`n-${Page.vid}`, []);
            else          this.notes = [];
            this.barItems.forEach(b => b.remove());
            this.barItems.length = 0;
            this.createBarItems();
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
            const next = this.notes.find(trim => Page.v.currentTime < trim[1]);
            this.nextSkip = next ? next[1] : null;
        }
        saveNote(note, newTime=null, newText=null) { // TODO: call note[2].setStartStop() with new timestamp
            let i = this.notes.indexOf(note);
            if (newTime == null && newText == null) {
                if (i === -1)
                    return;
                this.barItems[i].remove();
                this.barItems.splice(i, 1);
                this.notes.splice(i, 1);
            } else {
                if (newTime != null) {
                    const s = timeFromHHMMSSmss(newTime);
                    if (isFinite(s))
                        note[0] = s;
                    else
                        console.warn('New time is not finite:', newTime, s);
                }
                if (newText != null) {
                    note[1] = newText;
                }
                if (i === -1) {
                    this.notes.push(note);
                    // TODO: Create bar item here instead of running createBarItems later, and remove that function?
                } else {
                    this.barItems[i].setStartStop(note[0]);
                    this.barItems[i].text = note[1];
                }
            }
            this.saveNotes();
            this.createBarItems();
        }
        saveNotes() {
            if (Page.vid)
                GM_setValue(`n-${Page.vid}`, this.notes);
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
    // TODO: Metadata is completely off: uploaderName SOMETIMES gets the description instead (due to bar div?), uploaderId is SOMETIMES the previous vids (correct) uploaderName
    //
    mModule.mMetadata = class mMetadata extends mModule {
        constructor() {
            super();
            this.onVideoChangeId = Page.addCallback('video', () => this.onVideoChange());
            this.onPageChangeId = Page.addCallback('url', () => this.onPageChange());
            this.onVideoChange();
        }
        onVideoChange() {
            if (Page.vid && Page.vid != Page.prevVid)
                setTimeout(() => this.saveMetadata(), 500); // FIXME: Gives time for elements to update in DOM, should rather check with a loop than doing it like this
        }
        onPageChange() {
            if (settings.modules.mMetadata.playlists && location.pathname === '/playlist') {
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
            GM_setValue(`m-${Page.vid}`, {
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
            GM_setValue(`m-${Page.vid}`, null);
        }
        static registerSettings() {
            super.registerSettings(false, null, ['Metadata', 'section', {
                playlists: ['Process playlists', 'checkbox', true]
            }, true]);
        }
    };
    mModule.mMetadata.rName = 'Metadata';
    mModule.mMetadata.rDesc = 'Save video metadata: title, uploader, upload date, view count, likes and dislikes.';



    // ==================
    // Time Marker Module
    // ==================
    //
    // - Add a moving current time marker to the bar
    //
    mModule.mTimeMarker = class mTimeMarker extends mModule {
        constructor() {
            super();
            this.barItem = new BarItem({ color:settings.modules.mTimeMarker.color, group:5, height:settings.modules.mTimeMarker.height, start:0 });
            Page.addCallback('video', () => this.onChange());
            this.onChange();
        }
        onChange() {
            if (Page.isLivestream) {
                if (this.barItem.isInBar)
                    this.barItem.remove();
            } else if (!this.barItem.isInBar) {
                this.barItem.add();
                this.barItem.setStartStop(Page.v.currentTime / Page.v.duration);
                this.updateLoop();
            }
        }
        updateLoop() {
            if (Page.isLivestream) return;
            this.barItem.setRawStart(Page.v.currentTime / Page.v.duration);
            requestAnimationFrame(() => this.updateLoop());
        }
        static registerSettings() {
            super.registerSettings(true, null, ['Time marker', 'section', {
                height: ['Height (px)', 'number', 5, null, 1],
                color: ['Color', 'text', '#986712']
            }, true]);
        }
    };
    mModule.mTimeMarker.rName = 'Time Marker';
    mModule.mTimeMarker.rDesc = 'Add a moving current time marker to the bar.';



    // ==================
    // Stopwatch Module
    // ==================
    //
    // - Measure time between two points in a video
    //
    mModule.mStopwatch = class mStopwatch extends mModule {
        constructor() {
            super();
            this.stopwatch = this.addItem(new mItemBtn(this, 'W', `Stopwatch\nKeybinding: ${settings.keybinds.stopwatch}`));
            this.stopwatch.addOnClick(() => this.onKey());
            this.onChangeId = Page.addCallback('video', () => this.reset());
            this.registerKeys([settings.keybinds.stopwatch]);
            this.start = null;
            this.stop = null;
        }
        reset() {
            if (this.start)
                this.barItem.remove();
            this.start = null;
            this.stop = null;
            this.stopwatch.element.innerText = 'W';
            this.stopwatch.element.style.color = '';
            clearInterval(this.iid);
        }
        onKey() {
            if (this.start == null) {
                this.start = Page.v.currentTime;
                if (!this.barItem)
                    this.barItem = new BarItem({ above:true, group:3, height:4, start:this.start/Page.v.duration });
                Bar.addItem(this.barItem);
                this.barItem.setColor(settings.modules.mStopwatch.colorBarStarted);
                this.stopwatch.element.style.color = settings.modules.mStopwatch.colorText;
                this.iid = setInterval(() => this.update(), 200);
            } else if (this.stop == null) {
                this.stop = Page.v.currentTime;
                clearInterval(this.iid);
                this.barItem.setColor(settings.modules.mStopwatch.colorBarStopped);
            } else {
                this.reset();
            }
            this.update();
        }
        update() {
            if (this.start == null) return;
            let start, stop = this.stop || Page.v.currentTime;
            if (this.start < stop)
                start = this.start;
            else {
                start = stop;
                stop = this.start;
            }
            let time = stop - start;
            this.barItem.text = this.stopwatch.element.innerText = timeToHHMMSSmss(time);
            this.barItem.setStartStop(start/Page.v.duration, stop/Page.v.duration);
        }
        static registerSettings() {
            super.registerSettings(true, {
                stopwatch: ['Stopwatch start/stop', 'text', 'w']
            }, ['Stopwatch', 'section', {
                colorText: ['Text color', 'text', '#2e569c'],
                colorBarStarted: ['Bar color (started)', 'text', '#2e569c'],
                colorBarStopped: ['Bar color (stopped)', 'text', '#0e2246'],
            }, true]);
        }
    };
    mModule.mStopwatch.rName = 'Stopwatch';
    mModule.mStopwatch.rDesc = 'Measure time between two points in a video.';



    // =================
    // Mini Player Module
    // =================
    //
    // - Move video into a small floating window when scrolling down
    // TODO: Show/create progress bar, the default one is hidden right now because it's too big
    //
    mModule.mMiniPlayer = class mMiniPlayer extends mModule {
        constructor() {
            super();
            window.addEventListener('scroll', () => this.onScroll());
            this.isMini = false;
            this.onPageId = Page.addCallback('url', () => this.onScroll(false));
            this.onChangeId = Page.addCallback('video', () => this.onScroll());
        }
        onScroll(forceState=null) {
            const shouldMini = forceState ?? innerHeight * settings.modules.mMiniPlayer.scrollTrigger < scrollY;
            if (shouldMini !== this.isMini) {
                if (shouldMini && Page.v.paused) return;
                const player = document.querySelector('.html5-video-player');
                if (player) {
                    player.classList[shouldMini ? 'add' : 'remove']('ytsb-miniplayer');
                    Object.assign(player.style, shouldMini
                        ? {
                            width: settings.modules.mMiniPlayer.width + 'px',
                            height: settings.modules.mMiniPlayer.height + 'px'}
                        : { width:'', height:'' });
                    this.isMini = shouldMini;
                } else this.isMini = false;
            }
        }
        static registerSettings() {
            super.registerSettings(true, null, ['Mini player', 'section', {
                scrollTrigger: ['Scroll distance trigger (decimal)', 'number', 0.7, null, 0, null, 0.05],
                width: ['Player width (px)', 'number', 400, null, 10],
                height: ['Player height (px)', 'number', 225, null, 10],
            }, true]);
        }
    };
    mModule.mMiniPlayer.rName = 'Mini Player';
    mModule.mMiniPlayer.rDesc = 'Move video into a small floating window when scrolling down.';



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
        constructor(module, str, text=null) {
            super(module);
            this.text = text;
            this.element.innerText = str;
            if (text) this.element.onmouseenter = () => Popup.create({ target:this.element, text:this.text });
        }
    }
    class mItemBtn extends mItemTxt { // click handle
        constructor(module, str, text=null) {
            super(module, str, text);
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
        constructor(module, str, text=null, clickDelay=200, clickRate=100) {
            super(module, str, text);
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
        constructor(module, str, text=null, state=false) {
            super(module, str, text);
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
    // ==================width:300px !important; height:200px !important;
    GM_addStyle(GM_getResourceText('style.css'));


    // ====
    // Init
    // ====
    let title, btnsContainer;

    function init() {
        btnsContainer = cr('div', { className:'ytbc' });

        // Initialize modules
        const REF = {}; Object.keys(mModule).forEach(k => REF[mModule[k].rName] = k);
        settings?.enabledModules.map(name => new mModule[REF[name]]());

        title.parentElement.insertBefore(btnsContainer, title);
    }

    // Wait for video to exist before initializing modules
    // TODO: If current page isn't a watch page maybe we should wait some other way?
    let id = setInterval(() => {
        if (!title) title = document.querySelector('#container>.title');
        if (!Page.v) Page.v = document.querySelector('video');
        if (title && Page.v && isFinite(Page.v.duration)) {
            Page.setVideo(Page.v);
            clearInterval(id);
            setTimeout(init, 20);
        }
    }, 50);

    // Register settings all modules' settings
    Object.keys(mModule).forEach(k => mModule[k].registerSettings());

    // Create settings instance
    const sObj = new UserscriptSettings(settingsDescriptor, { ytsb:GM_getValue('settings') });
    sObj.addOnChange(vals => GM_setValue('settings', settings = vals), 'ytsb');
    sObj.setFontSizeScale(1.4);

    // Get current settings, including default values
    settings = Object.assign({}, UserscriptSettings.getValues('ytsb'));

    // Register menu entry to open settings
    GM_registerMenuCommand('Settings', sObj.show, 's');
})();