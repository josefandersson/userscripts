// ==UserScript==
// @name         HF Encrypted PMs
// @namespace    https://github.com/josefandersson/userscripts
// @version      1.0.5
// @description  Encrypt your PMs with PGP encryption.
// @author       DrDoof
// @icon         https://hackforums.net/favicon.ico
// @match        https://hackforums.net/private.php*
// @require      https://github.com/openpgpjs/openpgpjs/raw/master/dist/openpgp.min.js
// @resource     MainCSS https://github.com/josefandersson/userscripts/raw/master/HF-encrypted-PMs/style.css
// @grant        GM_getResourceText
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

const regexPublicKey = /-----BEGIN PGP PUBLIC KEY BLOCK-----(?:.|\s)*-----END PGP PUBLIC KEY BLOCK-----/m;
const regexMessage = /-----BEGIN PGP MESSAGE-----(?:.|\s)*-----END PGP MESSAGE-----/m;

const userscriptURL = 'https://github.com/josefandersson/userscripts/raw/master/HF-encrypted-PMs/hf-encrypted-pms.user.js';

const bits = 2048; // size of keys

class Page {
    constructor( url ) {
        this.url = url;

        if      (document.querySelector('input[name="subject"][type="text"]') !== null) this.isCompose = true;
        else if (document.querySelector('.post_date') !== null)                         this.isCompose = false;
        else                                                                            this.isBadPage = true;
    }

    getTextareaElement() {
        if (this.textareaElement == null) {
            this.textareaElement = document.querySelector('#content > div > form > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(6) > td:nth-child(2) > div > textarea'); 
        }
        return this.textareaElement;
    }

    canSendPM() {
        if (document.querySelectorAll('.select2-search-choice').length > 0) {
            if (document.querySelector('input[name="subject"]').value.length > 0) {
                return true;
            }
        }
        return false;
    }
    
    initCompose() {
        let sibling = document.querySelector('#content > div > form > table > tbody > tr > td:nth-child(2) > table > tbody > tr:nth-child(4)');
        let row = sibling.cloneNode();
            row.innerHTML = '<td class="trow1"><strong>Encryption:</strong></td><td class="trow1"><button class="encryptMessageButton"></button><p id="encryptionInfo"></p></td>';
            sibling.insertAdjacentElement('afterend', row);
        this.buttonElement = document.querySelector('.encryptMessageButton');
        this.infoElement = document.querySelector('#encryptionInfo');
        this.buttonElement.addEventListener('click', ev => {
            ev.preventDefault();
            encryptButtonClicked();
        });

        var hasBeenChanged = false;
        var previousData;
        function revertTextarea() {
            hasBeenChanged = false;
            page.getTextareaElement().removeAttribute('disabled');
            page.getTextareaElement().value = previousData;
            updateStateOfButton();
        }

        function encryptButtonClicked() {
            if (hasBeenChanged)
                revertTextarea();
            else {
                if (page.recipientPublicKey) {
                    let user = page.getRecipientUser();
                    keychain.encrypt(page.getTextareaElement().value, user.publicKey).then(encryptedMessage => {
                        hasBeenChanged = true;
                        page.getTextareaElement().setAttribute('disabled', true);
                        previousData = page.getTextareaElement().value;
                        if (!user.sharedWith) {
                            keychain.getKeys().then(keys => {
                                user.sharedWith = true;
                                keychain.saveUser(user);
                                page.getTextareaElement().value = `Hello. I would like to have a private conversation with you!\n\nPlease install the HF Encrypted PMs userscript ${userscriptURL} and then reload this page.\n\n${keys.publicKey}\n\n${encryptedMessage}`;
                                page.buttonElement.setAttribute('mode', 'middle');
                            }).catch(err => console.log(err));
                        } else {
                            page.getTextareaElement().value = `This message was sent using the HF Encrypted PMs userscript ${userscriptURL} .\n\n${encryptedMessage}`;
                            page.buttonElement.setAttribute('mode', 'middle');
                        }
                    }).catch(err => {
                        display.alert('Encryption failed: ' + err);
                        console.log(err);
                    });
                } else {
                    keychain.getKeys().then(keys => {
                        hasBeenChanged = true;
                        page.getTextareaElement().setAttribute('disabled', true);
                        previousData = page.getTextareaElement().value;
                        page.getTextareaElement().value = `Hello. I would like to have a private conversation with you!\n\nPlease install the HF Encrypted PMs userscript ${userscriptURL} and then reload this page.\n\n${keys.publicKey}`;
                        page.buttonElement.setAttribute('mode', 'middle');
                    }).catch(err => console.log(err));
                }
            }
        }

        function updateStateOfButton() {
            page.recipientPublicKey = page.getRecipientPublicKey();

            if (!page.recipientPublicKey) {
                page.buttonElement.setAttribute('mode', 'bad');
                page.infoElement.innerText = 'This message CANNOT be encrypted because the recipient\'s public encryption key is unknown.\nGenerate a public encryption key request message from the recipient by clicking the button above.\nNOTE: This will overwrite your message with a pre-generated message.';
            } else {
                page.buttonElement.setAttribute('mode', 'good');
                page.infoElement.innerText = '';
            }
    
            if (page.getNumRecipients() === 1) {
                page.buttonElement.removeAttribute('disabled');
            } else {
                if (hasBeenChanged)
                    revertTextarea();
                page.buttonElement.setAttribute('disabled', true);
                page.infoElement.innerText = 'To send an encrypted message there has to be exactly ONE recipient!';
            }
        }

        new MutationObserver(() => {
            updateStateOfButton();
        }).observe(document.querySelector('.select2-choices'), { childList: true });

        if (regexPublicKey.test(this.getTextareaElement().value) || regexMessage.test(this.getTextareaElement().value))
            this.getTextareaElement().value = '';

        var verified = false;
        document.addEventListener('click', (ev) => {
            if (!verified && ev.target.className === 'button') {
                let target = ev.target;

                if (target.value === 'Send Message') {
                    if (!hasBeenChanged && page.getRecipientPublicKey() !== null) {
                        ev.preventDefault();
                        display.alert('WARNING: Are you sure you want to send this UNENCRYPTED private message?', btn => {
                            if (btn === 'ok')
                                if (page.canSendPM()) {
                                    verified = true;
                                    document.querySelector('input[value="Send Message"]').click();
                                } else
                                    display.alert('PM could not be sent; missing either recipient(s) or subject.');
                        }, true, true);
                    }
                }

                else if (target.value === 'Save as Draft') {
                    if (hasBeenChanged) {
                        ev.preventDefault();
                        display.alert('WARNING: You can not save an encrypted message as draft.');
                    } else {
                        if (page.getRecipientPublicKey() !== null) {
                            ev.preventDefault();
                            display.alert('WARNING: Are you sure you want to save this UNENCRYPTED private message as draft?', btn => {
                                if (btn === 'ok')
                                    if (page.canSendPM()) {
                                        verified = true;
                                        document.querySelector('input[value="Save as Draft"]').click();
                                    } else
                                        display.alert('PM could not be saved as draft; missing either recipient(s) or subject.');
                            }, true, true);
                        }
                    }
                }

                else if (target.value === 'Preview') {
                    if (hasBeenChanged) {
                        ev.preventDefault();
                        display.alert('WARNING: You can not preview an encrypted message. Revert to normal, then preview.');
                    }
                }
            }
        })

        updateStateOfButton();
    }

    initNotCompose() {
        this.message = document.querySelector('#pid_').innerText;
        this.sender  = document.querySelector('#post_ > div.post_author > div.author_information > strong').innerText;

        let regexResults = regexPublicKey.exec(this.message);
        if (regexResults) {
            keychain.saveUser({ sharedWith: false, publicKey: regexResults[0], username: this.sender, uid: /uid=([0-9]*)/.exec(document.querySelector('#post_ > div.post_author > div.author_information > strong > span > a').href)[1] });
            display.alert('This user sent you their public encryption key. You may now send encrypted PMs to them.');
        }

        regexResults = regexMessage.exec(this.message);
        if (regexResults) {
            let user = keychain.getUser(this.sender);
            keychain.decrypt(regexResults[0]).then(decryptedMessage => {
                document.querySelector('#pid_').innerText = decryptedMessage;
            }).catch(err => {
                if (err !== 'no passphrase')
                    display.alert('Failed to decrypt: ' + err);
            });
        }
    }

    getNumRecipients() {
        return document.querySelectorAll('.select2-search-choice').length;
    }

    getRecipientUser() {
        if (this.getNumRecipients() === 1) {
            let recipient = document.querySelector('.select2-search-choice > div').innerText;
            return keychain.getUser(recipient);
        }
        return null;
    }

    getRecipientPublicKey() {
        let user = this.getRecipientUser();
        if (user) return user.publicKey;
        else      return null;
    }
}

class Keychain {
    constructor() {
    }

    encrypt(message, recipientPublicKey) {
        return new Promise((resolve, reject) => {
            keychain.unlockPrivateKey().then(privateKeyObject => {
                openpgp.encrypt({
                    data: message,
                    publicKeys: openpgp.key.readArmored(recipientPublicKey).keys,
                    privateKeys: privateKeyObject
                }).then(ciph => resolve(ciph.data)).catch(err => reject(err));
            }).catch(err => reject(err));
        });
    }

    decrypt(encryptedMessage) {
        return new Promise((resolve, reject) => {
            keychain.unlockPrivateKey().then(privateKeyObject => {
                openpgp.decrypt({
                    message: openpgp.message.readArmored(encryptedMessage),
                    privateKeys: privateKeyObject
                }).then(msg => resolve(msg.data)).catch(err => reject(err));
            }).catch(err => reject(err));
        });
    }

    unlockPrivateKey() {
        return new Promise((resolve, reject) => {
            if (keychain.privateKeyObject)
                resolve(keychain.privateKeyObject);
            else
                keychain.getKeys().then(keys => {
                    let pko = openpgp.key.readArmored(keys.privateKey).keys[0];
                    keychain.getPassphrase().then(passphrase => {
                        pko.decrypt(passphrase).then(() => {
                            keychain.privateKeyObject = pko;
                            resolve(keychain.privateKeyObject);
                        }).catch(err => reject(err));
                    }).catch(() => reject('no passphrase'));
                }).catch(err => reject('no keys'));
        });
    }

    generateKeys() {
        return new Promise((resolve, reject) => {
            display.alert('No previous encryption keys found, press "ok" to generate a new pair.', btn => {
                if (btn !== 'ok') {
                    console.log('CANCELLED');
                    reject('cancel');
                    return;
                }

                display.prompt('Enter a secure passphrase of at least 8 characters for encrypting your messages. DO NOT use the same password as for your hackforums account, or any other account. Use numbers, letters and special characters to make it more secure. You will be prompted for this passphrase everytime you send an encrypted message.', 'password', (btn, val) => {
                    if (btn !== 'ok') {
                        reject('cancel');
                        return;
                    }

                    display.wait('Generating new encryption key pair... This should only take a few seconds.');
                    let myUsername = document.querySelector('#panel > div.upper > div > span.welcome > strong > a').innerText;
                    openpgp.generateKey({
                        userIds: [{ name:myUsername, email:`${myUsername}@example.com` }],
                        numBits: bits,
                        passphrase: val
                    }).then(key => {
                        keychain.setKeys(key.privateKeyArmored, key.publicKeyArmored);
                        display.alert('A new encryption key pair has been generated successfully.', () => {
                            window.location.reload();
                        });
                    }).catch(err => {
                        display.alert('Something went wrong! ' + err);
                        reject(err);
                    });
                }, true, true, passphraseCondition);
            }, true, true);
        });
    }
    
    getKeys() {
        return new Promise((resolve, reject) => {
            let keys = GM_getValue('keys');
            if (!keys) {
                keychain.generateKeys().then().catch(err => reject(err));
            } else {
                resolve(keys);
            }
        });
    }

    setKeys(privateKeyArmored, publicKeyArmored) {
        GM_setValue('keys', {
            privateKey: privateKeyArmored.trim(),
            publicKey:  publicKeyArmored.trim()
        });
    }

    hasKeys() {
        return (GM_getValue('keys') != null);
    }

    hasSharedWithUser(username) {
        let user = getUser(username);
        return (user && user.sharedWith);
    }

    saveUser(userdata) {
        GM_setValue(`dataFor${userdata.username}`, userdata);
        let savedUsers = this.getSavedUsers();
        savedUsers.push(userdata.username);
        GM_setValue('savedUsers', savedUsers);
    }
    
    getUser(username) {
        return GM_getValue(`dataFor${username}`);
    }

    getSavedUsers() {
        return GM_getValue('savedUsers') || [];
    }
    
    getPassphrase() {
        return new Promise((resolve, reject) => {
            display.prompt('Enter passphrase:', 'password', (btn, val) => {
                if (btn === 'ok')
                    resolve(val);
                else
                    reject('cancel');
            }, true, true, passphraseCondition);
        });
    }
}

class Display {
    constructor() {
        this.popupElement = document.createElement('div');
        this.popupElement.className = 'hfEncPM';
        this.popupElement.innerHTML = `<div><h2>HF Encrypted PMs</h2><p></p><p><input type="text" autofocus autocomplete="off"></p><button>Ok</button><button>Cancel</button></div>`;
        document.getElementById('container').appendChild(this.popupElement);
        this.textElement   = document.querySelector('.hfEncPM p');
        this.inputElement  = document.querySelector('.hfEncPM input');
        this.cancelElement = document.querySelector('.hfEncPM button:last-of-type');
        this.okElement     = document.querySelector('.hfEncPM button:first-of-type');
        
        this.isHidden = false;

        function isConditionApproved() {
            let res = true;
            if (display.condition !== null)
                res = display.condition(display.getInputValue());
            return res;
        }
        
        this.inputElement.addEventListener('keypress', ev => {
            if (ev.keyCode === 13) {
                if (isConditionApproved()) {
                    if (display.cb) {
                        let val = display.getInputValue();
                        display.hide();
                        display.cb('ok', val);
                    } else
                        display.hide();
                } else {
                    display.failedCondition();
                }
            }
        });

        this.okElement.addEventListener('click', ev => {
            ev.preventDefault();
            if (isConditionApproved()) {
                if (display.cb) {
                    let val = display.getInputValue();
                    display.hide();
                    if (val === null) display.cb('ok');
                    else              display.cb('ok', val);
                } else
                    display.hide();
            } else {
                display.failedCondition();
            }
        });

        this.cancelElement.addEventListener('click', ev => {
            ev.preventDefault();
            display.hide();
            if (display.cb)
                display.cb('cancel');
        });
    }

    show() {
        if (this.isHidden) {
            this.isHidden = false;
            this.popupElement.removeAttribute('hidden');
        }
    }

    hide() {
        if (!this.isHidden) {
            this.isHidden = true;
            this.popupElement.setAttribute('hidden', true);
            this.condition = null;
            this.setText('');
            this.setInput();
            this.setButtons();
        }
    }

    setText(text) {
        this.textElement.innerText = text;
    }

    setInput(type = null) {
        this.inputElement.value = '';
        if (type === null) this.inputElement.setAttribute('hidden', true);
        else {
            this.inputElement.removeAttribute('hidden');
            this.inputElement.setAttribute('type', type);
        }
    }

    setButtons(okBtn = false, cnlBtn = false) {
        if (okBtn)  this.okElement.removeAttribute('hidden');
        else        this.okElement.setAttribute('hidden', true);
        if (cnlBtn) this.cancelElement.removeAttribute('hidden');
        else        this.cancelElement.setAttribute('hidden', true);
    }

    failedCondition() {
        this.inputElement.value = '';
        this.inputElement.style.setProperty('background-color', '#ce6f6f');
        if (this.tid !== null) {
            clearTimeout(this.tid);
            this.tid = null;
        }
        this.tid = setTimeout(() => {
            display.inputElement.style.removeProperty('background-color');
        }, 1500);
    }

    getInputValue() {
        if (this.inputElement.value === '') return null;
        else                                return this.inputElement.value;
    }

    // cb passed button pressed ('ok' or 'cancel')
    alert(text, cb, okBtn = true, cnlBtn = false) {
        console.log('Displaying alert');
        this.cb = cb;
        this.setText(text);
        this.setButtons(okBtn, cnlBtn);
        this.show();
    }

    // cb passed button pressed ('ok' or 'cancel') and input value if 'ok'
    prompt(text, inputType, cb, okBtn = true, cnlBtn = true, condition = null) {
        console.log('Displaying prompt');
        this.cb = cb;
        this.condition = condition;
        this.setText(text);
        this.setInput(inputType);
        this.setButtons(okBtn, cnlBtn);
        this.show();
    }

    wait(text, okBtn = false, cnlBtn = false) {
        console.log('Displaying wait');
        this.setText(text);
        this.setButtons(okBtn, cnlBtn);
        this.show();
        return function() {
            display.hide();
        };
    }
}

var page;
var display;
var keychain;

(function() {
    'use strict';

    GM_addStyle(GM_getResourceText('MainCSS'));

    page = new Page(window.location.href);

    if (!page.isBadPage) {
        keychain = new Keychain();

        display = new Display();
        display.hide();

        if (page.isCompose) page.initCompose();
        else                page.initNotCompose();
        
        if (!keychain.hasKeys()) {
            keychain.generateKeys();
        }
    }
})();


function passphraseCondition(val) {
    if (val === null) return false;
    if (val.length <= 8) return false;
    return true;
}