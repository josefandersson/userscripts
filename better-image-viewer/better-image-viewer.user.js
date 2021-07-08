// ==UserScript==
// @name         Better Image Viewer
// @namespace    https://github.com/josefandersson/userscripts/tree/master/better-image-viewer
// @version      1.3
// @description  Make the raw image viewer great again!
//               Adds filters (contrast, brightness, saturation and invert)
//               Adds a decent zooming feature with ctrl+zoom
//               Adds keybindings for doing things easier with one hand ;)
// @author       Josef Andersson
// @include      *.jpg
// @include      *.jpg?*
// @include      *.jpeg
// @include      *.jpeg?*
// @include      *.png
// @include      *.png?*
// @include      *.gif
// @include      *.gif?*
// ==/UserScript==

// ONE CAN CHANGE KEYBINDINGS AT THE BOTTOM OF THE SCRIPT

const ENABLE_FILTERS = true;
const ENABLE_ZOOMING = true;
const ENABLE_KEYBINDS = true;

const STEP = 5;
const CLICK_DELAY = 200;
const CLICK_RATE = 100;

(function() {
    'use strict';

    // ================
    // HELPER FUNCTIONS
    // ================
    const cr = (tag, obj={}) => Object.assign(document.createElement(tag), obj);
    const st = (el, obj={}) => Object.assign(el.style, obj);
    const within = (x, y, minX, minY, maxX, maxY) => minX < x && x < maxX && minY < y && y < maxY;



    // ==========
    // LOAD IMAGE
    // ==========
    let oldImage = document.querySelector('img');
    const image = cr('img');
    st(image, { margin:'auto' });
    
    oldImage.parentElement.appendChild(image);

    image.onload = () => {
        oldImage.remove();
        oldImage = null;
    };
    image.src = oldImage.src;

    let rotation = 0;



    // =======
    // FILTERS
    // =======
    const Filters = {
        init: () => {
            // Effects as object { name:effect name, val:current value, def:default value, max:max value }
            Filters.effects = [
                ['brightness',100,1000], ['contrast',100,1000], ['saturate',100,1000],
                ['invert',0,100]
            ].map(e => { return { name:e[0], val:e[1], def:e[1], max:e[2] }; });

            Filters.createFilterPanel();            
            Filters.updateImageFilter();
        },
        clearDown: eff => {
            clearTimeout(eff.downTimeout);
            clearInterval(eff.downInterval);
            eff.down = null;
        },
        createFilterPanel: () => {
            // Containing div for effect buttons
            Filters.container = cr('div');
            st(Filters.container, { position:'fixed', top:'5px', left:'5px', display:'flex',
                backgroundColor:'rgba(0,0,0,0.5)', color:'#949494', userSelect:'none' });
            document.body.appendChild(Filters.container);

            // Buttons for each effect
            Filters.effects.forEach(eff => {
                const div = cr('div');
                const name = cr('span', { innerText:eff.name });
                const dec = cr('span', { innerText:'-',
                    onmousedown:ev=>Filters.onMouseDown(ev, eff, -1),
                    onmouseup:ev=>Filters.onMouseUp(ev, eff, -1),
                    onmouseleave:ev=>Filters.onMouseUp(ev, eff, -1),
                    onclick:ev=>Filters.onClick(eff, -1, ev), });
                const val = cr('span', { innerText:`${eff.val}%`, onclick:()=>Filters.reset(eff) });
                const inc = cr('span', { innerText:'+',
                    onmousedown:ev=>Filters.onMouseDown(ev, eff, 1),
                    onmouseup:ev=>Filters.onMouseUp(ev, eff, 1),
                    onmouseleave:ev=>Filters.onMouseUp(ev, eff, 1),
                    onclick:ev=>Filters.onClick(eff, 1, ev), });
        
                st(div, { padding:'3px 7px', textAlign:'center' });
                st(name, { display:'block', fontSize:'.8em', fontStyle:'italic' });
                st(dec, { cursor:'pointer', padding:'0 5px' });
                st(val, { cursor:'pointer', fontSize:'.8em' });
                st(inc, { cursor:'pointer', padding:'0 5px' });
        
                div.appendChild(name);
                div.appendChild(dec);
                div.appendChild(val)
                div.appendChild(inc);
        
                Filters.container.appendChild(div);
        
                eff.valEl = val;
            });
        },
        getFilterString: () => Filters.effects.map(eff => `${eff.name}(${eff.val}%)`).join(' '),
        onClick: (eff, mag, ev) => {
            if (ev) {
                if (ev.button !== 0) return;
                ev.preventDefault();
            }
            eff.val = Math.min(eff.max, Math.max(0, eff.val + STEP * mag));
            Filters.updateImageFilter();
            eff.valEl.innerText = `${eff.val}%`;
        },
        onMouseDown: (ev, eff, mag) => {
            if (ev.button !== 0) return;
            ev.preventDefault();
            if (eff.down) clearDown(eff);
            eff.downTimeout = setTimeout(() => {
                Filters.onClick(eff, mag);
                eff.downInterval = setInterval(() => {
                    Filters.onClick(eff, mag);
                }, CLICK_RATE);
            }, CLICK_DELAY);
        },
        onMouseUp: (ev, eff) => {
            if (ev.button !== 0) return;
            ev.preventDefault();
            Filters.clearDown(eff);
        },
        reset: eff => {
            eff.val = eff.def;
            Filters.updateImageFilter();
            eff.valEl.innerText = `${eff.val}%`;
        },
        updateImageFilter: () => image.style.filter = Filters.getFilterString(),
    };
    if (ENABLE_FILTERS) Filters.init();



    // =======
    // ZOOMING
    // =======
    const Zooming = {
        init: () => {
            Zooming.setFitImageState(true);

            addEventListener('resize', () => {
                if (Zooming.isFitImage)
                    Zooming.setZoomToCurrent();
                else
                    document.body.style.height = Math.max(innerHeight, image.scrollHeight);
            });

            addEventListener('wheel', ev => {
                if (ev.ctrlKey)
                    ev.preventDefault();
            }, { passive:false });

            image.addEventListener('click', ev => Zooming.onclick(ev));
            image.addEventListener('wheel', ev => Zooming.onwheel(ev));
        },
        onclick: ev => {
            if (ev.button === 0)
                Zooming.setFitImageState(!Zooming.isFitImage);
            scrollTo(ev.layerX, ev.layerY - innerHeight/2);
        },
        onwheel: ev => {
            if (ev.ctrlKey) {
                ev.preventDefault();
                Zooming.zoomImageTowards(1-ev.deltaY/500, ev.clientX, ev.clientY);
            }
        },
        setFitImageState: (newState, setZoom=true) => {
            if (newState === Zooming.isFitImage)
                return;
            Zooming.isFitImage = newState;
            if (Zooming.isFitImage) {
                image.style.height = '';
                image.style.maxWidth = '100%';
                image.style.maxHeight = '100%';
                if (setZoom) Zooming.setZoomToCurrent();
            } else {
                image.style.maxWidth = '';
                image.style.maxHeight = '';
                if (setZoom) Zooming.setZoom(1);
            }
            document.body.style.height = '';
        },
        setImageSizeToZoom: () => {
            const nh = image.naturalHeight * Zooming.zoom;
            st(image, { height:`${nh}px` });
            document.body.style.height = Math.max(innerHeight, nh);
        },
        setZoom: newZoom => {
            Zooming.zoom = newZoom;
        },
        setZoomToCurrent: () => {
            Zooming.setZoom(Math.min(innerHeight / image.naturalHeight, innerWidth / image.naturalWidth));
        },
        zoomImageTowards: (diff, x, y) => { // x,y are viewport coords, not image coords
            Zooming.setFitImageState(false, false);

            const rx = (x - image.offsetLeft) / (innerWidth - image.offsetLeft * 2);
            const ry = (y - image.offsetTop) / (innerHeight - image.offsetTop * 2);

            const oldDim = [image.width, image.height];
            Zooming.setZoom(Zooming.zoom * diff);
            Zooming.setImageSizeToZoom();
            const diffW = image.width - oldDim[0];
            const diffH = image.height - oldDim[1];
            console.log(diffW, diffH, rx, ry);

            let ox = 0, oy = 0;
            if (within(rx, ry, .1, .1, .9, .9)) {
                ox = rx;
                oy = ry;
            } else {
                if (rx < 1/3) ox = 0;
                else if (2/3 < rx) ox = 1;
                else ox = .5;
                if (ry < 1/3) oy = 0;
                else if (2/3 < ry) oy = 1;
                else oy = .5;
            }
            ox *= diffW;
            oy *= diffH;

            scrollBy(ox, oy);
        },
    };
    if (ENABLE_ZOOMING) Zooming.init();



    // ===========
    // KEYBINDINGS
    // ===========
    const Binds = {
        init: () => {
            document.addEventListener('keydown', ev => Binds.onKeyPress(ev));
        },
        onKeyPress: ev => {
            const bind = KEYBINDINGS.find(bind => ev.code === bind[0] && ev.ctrlKey == bind[1] && ev.shiftKey == bind[2]);
            if (bind) bind[3]();
        },
        doClose: () => {
            close();
        },
        doFullscreen: () => {
            if (document.fullscreen || document.webkitIsFullscreen)
                document.exitFullscreen();
            else
                document.body.requestFullscreen();
        },
        doRotateRight: (dir=1) => {
            image.style.transform = `rotate(${rotation += dir*90}deg)`;
        },
        doRotateLeft: () => {
            Binds.doRotateRight(-1);
        },
        doSave: () => {
            cr('a', { href:image.src, download:/.*\/(.*)$/.exec(location.pathname)[1] }).click();
        },
    };
    if (ENABLE_KEYBINDS) Binds.init();

    // code, ctrlMask, shiftMask, function
    const KEYBINDINGS = [
        ['KeyS',         0, 0, Binds.doSave],
        ['Numpad0',      0, 0, Binds.doSave],
        ['KeyQ',         0, 0, Binds.doClose],
        ['ControlRight', 1, 0, Binds.doClose],
        ['KeyF',         0, 0, Binds.doFullscreen],
        ['ShiftRight',   0, 1, Binds.doFullscreen],
        ['KeyR',         0, 1, Binds.doRotateLeft],
        ['Numpad1',      0, 0, Binds.doRotateLeft],
        ['KeyR',         0, 0, Binds.doRotateRight],
        ['Numpad2',      0, 0, Binds.doRotateRight],
    ];
})();