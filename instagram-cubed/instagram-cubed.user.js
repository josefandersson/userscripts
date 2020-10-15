// ==UserScript==
// @name         Instagram²
// @namespace    https://github.com/josefandersson/userscripts/tree/master/instagram-cubed
// @version      1.2
// @description  Adds some QoL features to Instagram.
//               - Deobfuscates videos and images making them easier to save.
//               - Maximizes image quality.
//               - Makes the site navigateable with the keyboard.
// @author       Josef Andersson
// @match        https://www.instagram.com/*
// @match        https://instagram.com/*
// @icon         https://instagram.com/favicon.ico
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

/*
Keybindings:
    Feed page: /
        Up, down - Navigate to previous or next post.
        Left, right - Go to previous or next image/video in current post
        S or numpad0 - Save current post
        L or numpad1 - Like current post
        F or numpad2 - Make current image full size (and use maximum available resolution)
        Space or right ctrl - Pause/play current video
        Ctrl + left, right - Skip 1 second backwards or forwards in current video
        Comma, period - Skip 1 frame backwards or forwards in current video
        G or right shift - Go to current post's uploader's profile
    Explore page and profile page: /explore/, /<username>/
        Up, down, left, right - Navigate to post in direction
        Right ctrl - Open currently marked post
    Post page (or opened popup on explore and profile page): /p/<post-id>/
        >Same as on Feed page.
    General:
        Ctrl-left-click - open image/video in maximum quality in new tab
        Shift-left-click - save image/video in maximum quality
*/

const MUTE_VOLUME_TRESHOLD = .005; // Minimum scrolled volume change before muting video
const UPDATE_INTERVAL_MS = 100; // Time (in ms) between looking for page updates

(function() {
    'use strict';

    class Page {
        /**
         * Downloads video from video element or image from img element.
         * @param {Element} element element
         */
        download(element) {
            let href = this.getVideoSrc(element);
            if (href == null)
                href = this.getImageSrc(element);
            if (href == null)
                return;
            const a = document.createElement('a');
            a.href = href;
            a.download = true;
            a.click();
        }

        /**
         * Download current post's video or image.
         */
        downloadCurrent() { throw new Error('not implemented'); }

        /**
         * Make sure that there is a currentPost. If not already set, it finds the first.
         * @returns {boolean} Whether it found a new or kept the old. new=true, old=false.
         */
        ensureCurrent() {
            if (!this.currentPost || !this.isElementWithinView(this.currentPost)) {
                this.setCurrentAndScroll(this.findFirstVisiblePost());
                return true;
            }
            return false;
        }
        
        /**
         * Get first visible post on page.
         * @returns {Element} First posts element
         */
        findFirstVisiblePost() { throw new Error('not implemented'); }

        /**
         * Attempt to skip one frame in direction in current video.
         * @param {Number} frames frames to jump, if: negative=backwards, positive=forwards
         */
        frameVideo(dir) {
            this.ensureCurrent();
            const video = this.getVideo(this.currentPost);
            if (!video)
                return;
            video.currentTime += dir * (1/30);
        }

        /**
         * Get absolute pixel distance between element and top of page. ie. y-pos of element.
         * @param {Element} element Element
         */
        getElementOffset(element) {
            return pageYOffset + element.getBoundingClientRect().top;
        }

        /**
         * Get image src from element, either max quality image from img, or poster of video.
         * @param {Element} element element
         * @returns {String} Image src
         */
        getImageSrc(element) {
            if (element.tagName === 'IMG') {
                this.makeMaxQuality(element);
                return element.src;
            } else if (element.tagName === 'VIDEO') {
                return element.poster;
            }
            return null;
        }

        /**
         * Get video element from element children.
         * @param {Element} element Parent element
         * @returns {Element} Video element
         */
        getVideoElement(element) { throw new Error('not implemented'); }

        /**
         * Get video src from video element.
         * @param {Element} element element
         * @returns {String} Video src
         */
        getVideoSrc(element) {
            if (element.tagName === 'VIDEO')
                return element.src;
            return null;
        }

        /**
         * Go to the current post's uploader's profile.
         */
        goToCurrentUploadersProfile() {
            const href = this.getCurrentUploadersProfileURL();
            if (href)
                location.href = href;
        }

        /**
         * Get the url to the current post's uploader's profile.
         * @returns {String} profile url
         */
        getCurrentUploadersProfileURL() { throw new Error('not implemented'); }

        /**
         * Check if element is within viewport.
         * @param {Element} element element
         * @returns {Boolean} whether in view
         */
        isElementWithinView(element) { throw new Error('not implemented'); }

        /**
         * Initialize variables for page, only called once.
         */
        init() {
            console.log('Initializing page:', this.constructor);

            this.currentPost = null;
            this.currentFullPost = null; // Current post in full size mode
            
            this.pageURL = location.href;
            let intervalId = setInterval(() => {
                if (location.href !== this.pageURL) {
                    this.pageURL = location.href;
                    if (!this.constructor.isStillCurrentPage()) {
                        clearTimeout(intervalId);
                        newPage = Page.getPage();
                        console.log('New page:', newPage);
                        page = new newPage();
                        page.init();

                    }
                }
            }, UPDATE_INTERVAL_MS);
        }

        /**
         * Make image element max quality, used before openeing in new tab or downloading.
         * @param {Element} element 
         */
        makeMaxQuality(element) {
            if (element.tagName !== 'IMG')
                return;
            element.sizes = '';
        }

        /**
         * Navigate to the left.
         * Called from key event handler.
         */
        navLeft() { throw new Error('not implemented'); }
        /**
         * Navigate to the right.
         * Called from key event handler.
         */
        navRight() { throw new Error('not implemented'); }
        /**
         * Navigate upwards.
         * Called from key event handler.
         */
        navUp() { throw new Error('not implemented'); }
        /**
         * Navigate to the downwards.
         * Called from key event handler.
         */
        navDown() { throw new Error('not implemented'); }
        
        /**
         * Attempt to like the current post.
         */
        likePost() { throw new Error('not implemented'); }
        
        /**
         * Key down event listener.
         * Called only from event handler.
         */
        onKeyDown(ev) {
            if (ev.target.tagName !== 'INPUT') {
                let toRun;
                switch (ev.code) {
                    case 'ArrowUp': toRun = () => this.navUp(); break;
                    case 'ArrowDown': toRun = () => this.navDown(); break;
                    case 'ArrowLeft':
                        if (ev.ctrlKey) toRun = () => this.frameVideo(-30);
                        else            toRun = () => this.navLeft(); break;
                    case 'ArrowRight':
                        if (ev.ctrlKey) toRun = () => this.frameVideo(30);
                        else            toRun = () => this.navRight(); break;
                    case 'KeyS':
                    case 'Numpad0': toRun = () => this.savePost(); break;
                    case 'KeyL':
                    case 'Numpad1': toRun = () => this.likePost(); break;
                    case 'Space':
                    case 'ControlRight': toRun = () => this.playVideo(); break;
                    case 'KeyG':
                    case 'ShiftRight': toRun = () => this.goToCurrentUploadersProfile(); break;
                    case 'KeyD':
                    case 'Numpad3': toRun = () => this.download(); break;
                    case 'Comma': toRun = () => this.frameVideo(-1); break;
                    case 'Period': toRun = () => this.frameVideo(1); break;
                    case 'KeyF':
                    case 'Numpad2': toRun = () => this.toggleFullImage(); break;
                    default:
                        return;
                }
                ev.preventDefault();
                toRun();
            }
        }
        
        /**
         * Attempt to play current post if it's a video.
         */
        playVideo() {
            this.ensureCurrent();
            const video = this.getVideo(this.currentPost);
            if (!video)
                return;
            if (video.paused)
                video.play();
            else
                video.pause();
        }

        /**
         * Attempt to save the current post.
         */
        savePost() { throw new Error('not implemented'); }

        /**
         * Set the currentPost element and scroll it into view.
         * @param {Element} element New current element
         */
        setCurrentAndScroll(element) {
            this.currentPost = element;
            console.log(this.currentPost);
            if (element)
                scrollTo(0, this.getElementOffset(this.currentPost) - 60);
        }

        /**
         * Toggle current post's image full (native) size.
         */
        toggleFullImage() { throw new Error('not implemented'); }

        /**
         * Get the Page object that match the current page.
         * @returns {Page} Page
         */
        static getPage() {
            return [FeedPage, ExplorePage, StoriesPage, DMPage, ProfilePage].find(page => page.isCurrentPage());
        }

        /**
         * Check if current page is this Page.
         * @returns {boolean} Whether matches
         */
        static isCurrentPage() { throw new Error('not implemented'); }

        /**
         * Check if current page is still current page after url change.
         * @returns {boolean} Whether matches
         */
        static isStillCurrentPage() {
            return this.isCurrentPage();
        }
    }

    class FeedPage extends Page {
        // OVERRIDE
        downloadCurrent() {

        }

        // OVERRIDE
        findFirstVisiblePost() {
            const posts = document.querySelectorAll('article');
            for (let post of posts) {
                if (scrollY < this.getElementOffset(post) + post.offsetHeight * .84)
                    return post;
            }
        }

        // OVERRIDE
        getCurrentUploadersProfileURL() {
            this.ensureCurrent();
            return this.currentPost.querySelector('a').href;
        }

        // OVERRIDE
        getVideo(element) {
            if (!element)
                return null;
            const video = element.querySelector('video');
            if (!video)
                return null;
            const eleX = element.getBoundingClientRect().x;
            const vidX = video.getBoundingClientRect().x;
            if (eleX < vidX && vidX < eleX + 5)
                return video;
            return null;
        }

        // OVERRIDE
        isElementWithinView(element) {
            const elOffset = this.getElementOffset(element)
            return elOffset - innerHeight * .8 < scrollY
                && scrollY < elOffset + element.offsetHeight + innerHeight * .4;
        }

        // OVERRIDE
        navUp() {
            if (this.ensureCurrent())
                return;
            let prev = this.currentPost.previousElementSibling;
            while (prev != null && prev.tagName !== 'ARTICLE')
                prev = prev.previousElementSibling;
            this.setCurrentAndScroll(prev);
        }
    
        // OVERRIDE
        navDown() {
            if (this.ensureCurrent())
                return;
            let next = this.currentPost.nextElementSibling;
            while (next != null && next.tagName !== 'ARTICLE')
                next = next.nextElementSibling;
            this.setCurrentAndScroll(next);
        }
    
        // OVERRIDE
        navLeft() {
            if (this.ensureCurrent())
                return;
            this.currentPost.querySelector('.coreSpriteLeftChevron')?.click();
        }
    
        // OVERRIDE
        navRight() {
            if (this.ensureCurrent())
                return;
            this.currentPost.querySelector('.coreSpriteRightChevron')?.click();
        }

        // OVERRIDE
        likePost() {
            this.ensureCurrent();
            this.currentPost.querySelector('div:last-child > section > span > button')?.click()
        }

        // OVERRIDE
        savePost() {
            this.ensureCurrent();
            this.currentPost.querySelector('div > section > span:last-child button')?.click();
        }

        // OVERRIDE
        toggleFullImage() {
            this.ensureCurrent();
            if (this.currentFullPost) {
                Object.assign(this.currentFullPost.style, { position:'', zIndex:'', width:'', height:'' });
                this.currentFullPost.parentElement.style.overflow = 'hidden';
                this.currentFullPost = null;
            } else {
                const img = this.currentPost.querySelector('div:nth-child(3) img');
                this.makeMaxQuality(img);
                Object.assign(img.style, { position:'absolute', zIndex:'10', width:'1080px', height:'auto' });
                img.parentElement.style.overflow = 'unset';
                this.currentFullPost = img;
            }
        }

        // OVERRIDE
        static isCurrentPage() {
            return location.pathname === '/';
        }
    }

    /**
     * A page where posts can popup: explore and profile page.
     */
    class PopupPage extends Page {
        // OVERRIDE
        findFirstVisiblePost() {
            if (this.getPopupPost() != null)
                return null;
            const rows = document.querySelectorAll('article > div > div > div');
            for (let row of rows) {
                if (scrollY < this.getElementOffset(row) + row.offsetHeight * .84)
                    return row.children[0];
            }
        }

        /**
         * Get the current popup if any.
         * @returns {Element} popup post or null
         */
        getPopupPost() {
            return document.querySelector('article[role=presentation]');
        }

        // OVERRIDE
        isElementWithinView(element) {
            const elOffset = this.getElementOffset(element);
            return elOffset > scrollY + 50 && elOffset + element.offsetHeight < scrollY + innerHeight;
        }

        // OVERRIDE
        navUp() {
            if (this.ensureCurrent())
                return;
            let i = [...this.currentPost.parentElement.children].indexOf(this.currentPost);
            let prev = this.currentPost.parentElement.previousElementSibling;
            if (prev == null)
                return;
            prev = prev.children[Math.min(i, prev.childElementCount - 1)];
            this.setCurrentAndScroll(prev);
        }
    
        // OVERRIDE
        navDown() {
            if (this.ensureCurrent())
                return;
            let i = [...this.currentPost.parentElement.children].indexOf(this.currentPost);
            let next = this.currentPost.parentElement.nextElementSibling;
            if (next == null)
                return;
            next = next.children[Math.min(i, next.childElementCount - 1)];
            this.setCurrentAndScroll(next);
        }
    
        // OVERRIDE
        navLeft() {
            if (this.ensureCurrent())
                return;
            let prev = this.currentPost.previousElementSibling;
            if (prev)
                this.setCurrentAndScroll(prev);
        }
    
        // OVERRIDE
        navRight() {
            if (this.ensureCurrent())
                return;
            let next = this.currentPost.nextElementSibling;
            if (next)
                this.setCurrentAndScroll(next);
        }

        /**
         * Updates the marking around the current post.
         */
        updateCurrentPostMarking() {
            let old = document.querySelector('.current-post');
            if (old) {
                old.classList.remove('current-post');
                old.style.border = '';
            }
            if (this.currentPost) {
                let next = this.currentPost.querySelector('div');
                next.classList.add('current-post');
                next.style.border = '2px solid red';
            }
        }

        // OVERRIDE
        setCurrentAndScroll(element) {
            this.currentPost = element;
            console.log(this.currentPost);
            if (element && !this.isElementWithinView(this.currentPost))
                scrollTo(0, this.getElementOffset(this.currentPost) - 60);
            this.updateCurrentPostMarking();
        }

        // OVERRIDE
        static isStillCurrentPage() {
            return super.isStillCurrentPage() || /\/p\/.+\//.test(location.pathname);
        }
    }

    /**
     * Explore page: /explore/.
     */
    class ExplorePage extends PopupPage {
        // OVERRIDE
        static isCurrentPage() {
            return location.pathname === '/explore/';
        }
    }

    /**
     * A profile page: /<username>/.
     */
    class ProfilePage extends PopupPage {

        // OVERRIDE
        static isCurrentPage() {
            return location.pathname !== '/explore/' && /^\/[^\/]+\/$/.test(location.pathname);
        }
    }

    /**
     * DM/inbox page: /direct/inbox/.
     */
    class DMPage extends Page {
        
        static isCurrentPage() {
            return location.pathname === '/direct/inbox/';
        }
    }

    /**
     * Stories page: /stories/<username>/<story_id>/.
     */
    class StoriesPage extends Page {
        static isCurrentPage() {
            return location.pathname.startsWith('/stories/');
        }
    }

    let newPage = Page.getPage();
    console.log('New page:', newPage);
    let page = new newPage();
    page.init();

    document.addEventListener('keydown', ev => page.onKeyDown(ev));

    let volume = GM_getValue('volume');
    let volumeChangeId;

    function changeVolume(targetVolume) {
        volume = targetVolume;
        clearTimeout(volumeChangeId);
        volumeChangeId = setTimeout(() => {
            GM_setValue('volume', volume);
        }, 100);
    }

    function onVolumeChange(ev) {
        changeVolume(ev.target.volume);
    }
    
    function onPlaying(ev) {
        ev.target.volume = volume;
        ev.target.controls = true;
        ev.target.style.zIndex = 3;
    }

    function onEmptied(ev) {
        ev.target.style.zIndex = 'inherit';
    }

    function onMouseWheel(ev) {
        if (ev.target.paused) return;
        ev.preventDefault();
        let multiplier;
        if (ev.deltaY < 0) multiplier = 1.25;
        else if (ev.deltaY > 0) multiplier = .75;
        let targetVolume = Math.max(0, Math.min(1, volume * multiplier));
        if (targetVolume < MUTE_VOLUME_TRESHOLD) {
            ev.target.muted = true;
            targetVolume = MUTE_VOLUME_TRESHOLD;
        } else if (ev.target.muted) {
            ev.target.muted = false;
            targetVolume = MUTE_VOLUME_TRESHOLD;
        }
        ev.target.volume = targetVolume;
        changeVolume(targetVolume);
    }

    function removeOverlay(article) {
        const videoElement = article.querySelector('video');

        if (!videoElement) return;
        if (videoElement.classList.contains('fixed')) return;

        videoElement.classList.add('fixed');

        if (document.querySelectorAll('video').length === 1) videoElement.preload = true;

        videoElement.volume = volume;
        videoElement.onvolumechange = onVolumeChange;
        videoElement.onplaying = onPlaying;
        videoElement.onemptied = onEmptied;
        videoElement.onmousewheel = onMouseWheel;
    }

    setInterval(() => {
        const els = document.querySelectorAll('video:not(.fixed)');
        if (els.length) [...els].forEach(el => removeOverlay(el.parentElement));
    }, UPDATE_INTERVAL_MS);
})();