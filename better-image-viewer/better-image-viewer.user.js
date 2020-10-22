// ==UserScript==
// @name         Better Image Viewer
// @namespace    -
// @version      1.0
// @description  Make the raw image viewer great again!
// @author       Josef Andersson
// @include      *.jpg
// @include      *.jpeg
// @include      *.png
// @include      *.gif
// ==/UserScript==

// TODO: Keybindings: s=save, q=close, f=fullscreen, r/R=rotate

const STEP = 5;
const CLICK_DELAY = 200;
const CLICK_RATE = 100;

(function() {
    'use strict';

    // =======
    // FILTERS
    // =======

    const cr = (tag, obj={}) => Object.assign(document.createElement(tag), obj);
    const st = (el, obj={}) => Object.assign(el.style, obj);

    const container = cr('div');
    st(container, { position:'fixed', top:'5px', left:'5px', display:'flex', backgroundColor:'rgba(0,0,0,0.5)', color:'#949494', userSelect:'none' });

    const effects = [['brightness',100,1000], ['contrast',100,1000], ['saturate',100,1000], ['invert',0,100]].map(e => {
        return { name:e[0], val:e[1], def:e[1], max:e[2] };
    });

    const getFilterStr = () => effects.map(eff => `${eff.name}(${eff.val}%)`).join(' ');
    const updateFilter = () => image.style.filter = getFilterStr();

    const onClick = (eff, mag, ev) => {
        if (ev) {
            if (ev.button !== 0) return;
            ev.preventDefault();
        }
        eff.val = Math.min(eff.max, Math.max(0, eff.val + STEP * mag));
        updateFilter();
        eff.valEl.innerText = `${eff.val}%`;
    };

    const reset = eff => {
        eff.val = eff.def;
        updateFilter();
        eff.valEl.innerText = `${eff.val}%`;
    };

    const clearDown = eff => {
        clearTimeout(eff.downTimeout);
        clearInterval(eff.downInterval);
        eff.down = null;
    };

    const onMouseDown = (ev, eff, mag) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        if (eff.down) clearDown(eff);
        eff.downTimeout = setTimeout(() => {
            onClick(eff, mag);
            eff.downInterval = setInterval(() => {
                onClick(eff, mag);
            }, CLICK_RATE);
        }, CLICK_DELAY);
    };

    const onMouseUp = (ev, eff) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        clearDown(eff);
    };

    effects.forEach(eff => {
        const div = cr('div');
        const name = cr('span', { innerText:eff.name });
        const dec = cr('span', { innerText:'-',
            onmousedown:ev=>onMouseDown(ev, eff, -1),
            onmouseup:ev=>onMouseUp(ev, eff, -1),
            onmouseleave:ev=>onMouseUp(ev, eff, -1),
            onclick:ev=>onClick(eff, -1, ev), });
        const val = cr('span', { innerText:`${eff.val}%`, onclick:()=>reset(eff) });
        const inc = cr('span', { innerText:'+',
            onmousedown:ev=>onMouseDown(ev, eff, 1),
            onmouseup:ev=>onMouseUp(ev, eff, 1),
            onmouseleave:ev=>onMouseUp(ev, eff, 1),
            onclick:ev=>onClick(eff, 1, ev), });

        st(div, { padding:'3px 7px', textAlign:'center' });
        st(name, { display:'block', fontSize:'.8em', fontStyle:'italic' });
        st(dec, { cursor:'pointer', padding:'0 5px' });
        st(val, { cursor:'pointer', fontSize:'.8em' });
        st(inc, { cursor:'pointer', padding:'0 5px' });

        div.appendChild(name);
        div.appendChild(dec);
        div.appendChild(val)
        div.appendChild(inc);

        container.appendChild(div);

        eff.valEl = val;
    });

    let oldImage = document.querySelector('img');
    const image = cr('img', { src:oldImage.src });
    st(image, { margin:'auto' });
    
    oldImage.parentElement.appendChild(image);
    document.body.appendChild(container);

    oldImage.remove();
    oldImage = null;
    
    updateFilter();



    // =======
    // ZOOMING
    // =======

    let isFit; // true means maxwidth, maxheight is 100%, else ''
    let zoom = 1;

    const updateImageSize = () => {
        // const nw = image.naturalWidth * zoom;
        const nh = image.naturalHeight * zoom;
        st(image, { height:`${nh}px` });
        document.body.style.height = Math.max(innerHeight, nh);
    };

    const zoomImage = (diff, x, y) => {
        // TODO: Zoom in or out towards mouse position
        setIsFit(false);
        scrollTo(x * diff, y * diff);
        zoom *= diff;
        updateImageSize();
    };

    // Set zoom as a function of screen height and width
    const calculateZoomFromViewport = () => {
        zoom = innerHeight / image.naturalHeight;
    };

    const setIsFit = (newFit) => {
        if (newFit === isFit) return;
        isFit = newFit;
        if (isFit) {
            image.style.height = '';
            image.style.maxWidth = '100%';
            image.style.maxHeight = '100%';
            calculateZoomFromViewport();
        } else {
            image.style.maxWidth = '';
            image.style.maxHeight = '';
            zoom = 1;
        }
        document.body.style.height = innerHeight;
    };
    setIsFit(true);

    addEventListener('resize', calculateZoomFromViewport);

    image.onclick = ev => {
        if (ev.button === 0)
            setIsFit(!isFit);
        // if (isFit) {
        //     // TODO: Zoom to image natural width and height, calculate zoom number
        // } else {
        //     // TODO: Unzoom to innerWidth and innerHeight, calculate zoom number
        // }
        // TODO: Move to mouse position
    };

    image.onmousewheel = ev => {
        if (ev.ctrlKey) {
            ev.preventDefault();
            zoomImage(1-ev.deltaY/500, ev.layerX, ev.layerY);
        }
    }

    addEventListener('wheel', ev => {
        if (ev.ctrlKey)
            ev.preventDefault();
    }, { passive:false });
})();