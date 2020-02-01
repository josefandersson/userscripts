// ==UserScript==
// @name         HF Safe For Work
// @namespace    https://github.com/josefandersson/userscripts
// @version      1.4
// @description  Options to filter elements on hackforums.net
// @author       DrDoof
// @icon         https://hackforums.net/favicon.ico
// @match        https://hackforums.net/*
// @grant        GM.setValue
// @grant        GM.getValue
// @run-at       document-start
// ==/UserScript==

GM.getValue('config').then(val => {
    const config = val || {}

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
            let input = document.createElement('input')
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

// let style
// async function createCSS() {
//     style = document.createElement('style')
//     let css = ''
    
//     config = await (GM.getValue('config')) || {}
    
//     if (config.hideLogo) {
//         css += '#logo > div > a { display:block; height:30px; } #logo > div > a > img { display:none !important; }'
//     }

//     if (config.hideProfilePics) {
//         css += '.author_avatar > a > img { display:none !important; }'
//     }

//     if (config.hideSigPics) {
//         css += '.signature img { filter:brightness(0); height:10px; width:10px; background-color:black; }'
//     }
    
//     if (config.hidePostPics) {
//         css += '.post_body img { filter:brightness(0); height:10px; width:10px; }'
//     }
    
//     style.innerText = css
//     let append = () => {
//         if (document.head) {
//             document.head.appendChild(style)
//             if (config.filterTitle) {
//                 document.title = document.title.replace('Hack Forums', '').replace(/^[ ]*-/g, '').trim()
//             }
//         }
//         else setTimeout(append, 1)
//     }
//     append()
// }
// createCSS()

// document.addEventListener('DOMContentLoaded', () => {
//     // if (config.filterTitle) {
//     //     document.title = document.title.replace('Hack Forums', '').replace(/^[ ]*-/g, '').trim()
//     // }

//     let parent = document.querySelector('#footer > .lower > .wrapper')
//     let container = document.createElement('div')
//     container.style.cssFloat = 'right'
//     container.style.display = 'flex'
//     container.style.lineHeight = '18px'
//     let createAppendOption = (id, txt, checked, cb) => {
//         let label = document.createElement('label')
//         label.htmlFor = id
//         label.innerText = txt
//         label.style.marginLeft = '5px'
//         label.style.cursor = 'pointer'
//         container.appendChild(label)
//         let input = document.createElement('input')
//         input.type = 'checkbox'
//         input.id = id
//         input.checked = checked
//         input.style.cursor = 'pointer'
//         input.addEventListener('change', cb)
//         container.appendChild(input)
//     }
//     createAppendOption('hf_sfw_logo', 'Hide Logo', config.hideLogo, ev => {
//         config.hideLogo = ev.target.checked
//         GM.setValue('config', config)
//         style.remove()
//         createCSS()
//     })
    
//     createAppendOption('hf_sfw_profile_pics', 'Hide Profile Pics', config.hideProfilePics, ev => {
//         config.hideProfilePics = ev.target.checked
//         GM.setValue('config', config)
//         style.remove()
//         createCSS()
//     })
    
//     createAppendOption('hf_sfw_sig_pics', 'Hide Sig Pics', config.hideSigPics, ev => {
//         config.hideSigPics = ev.target.checked
//         GM.setValue('config', config)
//         style.remove()
//         createCSS()
//     })
    
//     createAppendOption('hf_sfw_post_pics', 'Hide Post Pics', config.hidePostPics, ev => {
//         config.hidePostPics = ev.target.checked
//         GM.setValue('config', config)
//         style.remove()
//         createCSS()
//     })
    
//     createAppendOption('hf_sfw_filter_title', 'Filter Page Title', config.filterTitle, ev => {
//         config.filterTitle = ev.target.checked
//         GM.setValue('config', config)
//         style.remove()
//         createCSS()
//     })
//     parent.appendChild(container)
// })



// let config = {}

// let style = document.createElement('style')
// document.head.appendChild(style);
// style.innerHTML = 'img { display: none !important; }'

// let ob = new MutationObserver((m, o) => {
//     console.log(m)
// })
// ob.observe(document, { childList:true })

// ;(function() {
    // 'use strict';


    // function recurDestroyImgs(el) {
    //     if (el.querySelectorAll) {
    //         el.querySelectorAll('img').forEach(ell => ell.remove())
    //         if (el.childList)
    //             el.childList.forEach(ell => recurDestroyImgs(ell))
    //     }
    // }

    // const config = { childList:true, subtree:true, dataCharacter:true }
    // const callback = (mList, observer) => { //FIXME: THE FUCKING LOGO SOMETIMES FLASHES ?!?!?!?!?!
    //         mList.forEach(m => {
    //             m.addedNodes.forEach(el => {
    //                 if (el.tagName == 'IMG') {
    //                     el.remove()
    //                 } else {
    //                     recurDestroyImgs(el)
    //                 }
    //             })
    //             recurDestroyImgs(m.target)
    //         })
    // }

    // const observer = new MutationObserver(callback)
    
    // document.addEventListener('DOMContentLoaded', () => {
    //     observer.disconnect()
    // })

    // observer.observe(document, config)
// })();
