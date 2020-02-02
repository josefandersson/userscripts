// ==UserScript==
// @name         HF Safe For Work
// @namespace    https://github.com/josefandersson/userscripts/tree/master/HF-sfw
// @version      1.45
// @description  Options to filter elements on hackforums.net
// @author       DrDoof
// @icon         https://hackforums.net/favicon.ico
// @match        https://hackforums.net/*
// @grant        GM.setValue
// @grant        GM.getValue
// @run-at       document-start
// ==/UserScript==

GM.getValue('config').then(val => {
    const config = val || { filterTitle:true, hideLogo:true, hideProfilePics:false, hideSigPics:false, hidePostPics:false }

    const styleElement = document.createElement('style')
    function createCSS() {
        let css = '.hf-sfw { float:right; display:flex; line-height:18px; } .hf-sfw label { cursor:pointer; } .hf-sfw input { margin:3px 3px 3px 8px; cursor:pointer; }'
    
        with (config) {
            if (hideLogo) css += '#logo > div > a { display:block; height:30px; } #logo > div > a > img { display:none !important; }'
            if (hideProfilePics) css += '.author_avatar > a > img { display:none !important; }'
            if (hideSigPics) css += '.signature img { filter:brightness(0); height:10px; width:10px; background-color:black; }'
            if (hidePostPics) css += '.post_body img { filter:brightness(0); height:10px; width:10px; background-color:black; }'
        }
    
        styleElement.innerText = css
    
        const id = setInterval(() => {
            if (document.head) {
                clearInterval(id)
                document.head.appendChild(styleElement)
                if (config.filterTitle) {
                    document.title = document.title.replace('Hack Forums', '').replace(/^[ ]*-/g, '').trim()
                }
            }
        }, 5)
    }createCSS()

    document.addEventListener('DOMContentLoaded', () => {
        const parent = document.querySelector('#footer > .lower > .wrapper')
        const container = document.createElement('div')
        container.className = 'hf-sfw'

        const addOption = (id, txt, configKey) => {
            const input = document.createElement('input')
            input.type = 'checkbox'
            input.id = id
            input.checked = config[configKey]
            input.addEventListener('change', ev => {
                config[configKey] = ev.target.checked
                GM.setValue('config', config)
                createCSS()
            })

            const label = document.createElement('label')
            label.htmlFor = id
            label.innerText = txt

            container.appendChild(input)
            container.appendChild(label)
        }

        addOption('hf-sfw-logo', 'Hide Logo', 'hideLogo')
        addOption('hf_sfw_profile_pics', 'Hide Profile Pics', 'hideProfilePics')
        addOption('hf_sfw_sig_pics', 'Hide Sig Pics', 'hideSigPics')
        addOption('hf_sfw_post_pics', 'Hide Post Pics', 'hidePostPics')
        addOption('hf_sfw_filter_title', 'Filter Page Title', 'filterTitle')

        parent.appendChild(container)
    })
})