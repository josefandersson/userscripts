// ==UserScript==
// @name         Instagram Better Player
// @namespace    home
// @version      1.0
// @description  Exposes the default video player on Instagram.
// @author       DrDoof
// @match        https://www.instagram.com/*
// @match        https://instagram.com/*
// @icon         https://instagram.com/favicon.ico
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

const MUTE_VOLUME_TRESHOLD = .005; // Minimum scrolled volume change before muting video
const UPDATE_INTERVAL_MS = 100; // Time (in ms) between looking for page updates

(function() {
    'use strict';

    let volume = GM_getValue('volume', 1);
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