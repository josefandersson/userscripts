// ==UserLibrary==
// @name          Userscript Settings
// @namespace     https://github.com/josefandersson/userscripts/tree/master/userscript-settings
// @version       2.5a
// @description   Library for adding a settings popup to userscripts.
// @author        Josef Andersson
// ==/UserLibrary==

// TODO:  - Import and export feature (node.getValue and node.applyValues could be used).
//        - For conditions, add an 'eval' param where one can set a function to run the evaluation instead of just comparing the value.
//        - Warn when there are unsaves settings and user is trying to close the popup.
//        - Disable save button when there are no unsaved values.
//        - Complete the 'disable' input feature, propegate to children.
//        - Limits to numbers, dates, etc. and regex for text, enforce limits.
//        - Hover (exclaimation mark icon?) for a description of setting or section.
//        - UserscriptSettings.addOnChange() without path could use this.settings to add listeners to only sections added by this instance.
//        - Conditions are not properly updated when popup opens. (see colors and randomize colors in example)
//        - For 'multiple', a default or current value of string "all" selects all options.
//        - Wider popup, put labels left of input - right now it looks to spread out/chaotic.
//        - For add change callbacks, add options to only get the changed settings when this node is a section, ie only pop children with changed values.
//        - Option to add a descriptor/explaination for each option in multi/custom select
//        - Script info under title (description, version, author etc)
//        - Escape key equals clicking close button
//        - Scripts can add buttons that just call any function when clicked, not storing a value (eg. a script wanting to clear data, recalculate something, etc.)

if (typeof window.UserscriptSettings === 'undefined') {
    const cr = (tagName, obj) => Object.assign(document.createElement(tagName), obj || {});

    /**
     * Global settings class. Create one instance per userscript. Used to
     * create popup and handle showing and closing settings window, and to
     * get/set values.
     */
    window.UserscriptSettings = function UserscriptSettings(settings, savedValues=null) {
        this.settings = settings;

        this.constructor.vars.node.applySettings(settings);
        this.constructor.vars.node.applyValues(savedValues);
        this.constructor.vars.node.setupConditions();

        this.hide = () => this.constructor.hide();
        this.show = () => this.constructor.show();
        this.getValues = (...path) => this.constructor.getValues(...path);
        this.addOnChange = (cb, ...path) => this.constructor.addOnChange(cb, ...path);
    };

    /**
     * One node instance represents one setting. Each node can have multiple children
     * (if node type is 'section').
     * @param {String} key Used when getting/setting this nodes value.
     * @param {Object} descriptor Setting descriptor object. See example in readme.md.
     */
    UserscriptSettings.Node = function Node(key=null, descriptor=null) {
        this.children = {};
        this.currentValue
        this.descriptor = descriptor;
        this.index = 0;
        this.key = key;
        this.onChange = [];
        this.onUnsavedChange = [];
        this.parent = null;
        this.type = 'section';

        /**
         * Add child node to this node.
         * @param {Node} node Child node
         */
        this.addChild = node => {
            if (!node.key) node.key = this.index++;
            this.children[node.key] = node;
            node.parent = this;
        };

        /**
         * Add an onChange callback
         * @param {Function} cb Callback
         */
        this.addOnChange = cb => this.onChange.push(cb);

        /**
         * Add an onUnsavedChange callback
         * @param {Function} cb Callback
         */
        this.addOnUnsavedChange = cb => this.onUnsavedChange.push(cb);

        /**
         * Create children and grandchildren from settings descriptor.
         * @param {Object} descriptor Settings descriptor
         */
        this.applySettings = descriptor => {
            Object.entries(descriptor).forEach(([key, val]) => {
                this.addChild(new UserscriptSettings.Node(key, val));
            });
        };

        /**
         * Applies values from an object to children, or if not an object sets this node's value.
         * @param {*} values 
         */
        this.applyValues = values => {
            if (values == null) {
                return;
            } else if (typeof values === 'object' && !(values instanceof Array)) {
                Object.entries(values).forEach(([key, val]) => {
                    if (this.children[key]) {
                        this.children[key].applyValues(val);
                    } else {
                        console.warn('Node "%s" doesnt have child node "%s" to give value "%s".', this.getPath().join('.'), key, val);
                    }
                });
            } else if (typeof values === typeof this.currentValue) {
                this.currentValue = values;
            } else {
                console.warn('Value "%s" is the wrong type for node "%s".', values, this.getPath().join('.'));
            }
        };

        /**
         * Get path to this node.
         * @returns {...String} Path
         */
        this.getPath = () => this.parent == null ? [this.key] : [...this.parent.getPath(), this.key];

        /**
         * Setup conditions. Should be called ONCE after all nodes have been created.
         */
        this.setupConditions = () => {
            if (this.type === 'section') {
                this.forEachChild(c => c.setupConditions());
            } else if (this.conditions) {
                this.conditions.forEach(con => {
                    const ref = this.parent.find(...con.path);
                    ref.addOnUnsavedChange(newVal => {
                        let triggered = false;
                        if (con.eval) {
                            triggered = con.eval(newVal);
                        } else {
                            triggered = newVal === con.value;
                        }
                        if (triggered !== !!con.invert) {
                            if (con.action === 'disable') {
                                this.element.disabled = true;
                                this.element.classList.add('disabledAction');
                            } else {
                                this.element.classList.add('hiddenAction');
                            }
                        } else {
                            if (con.action === 'disable') {
                                this.element.disabled = false;
                                this.element.classList.remove('disabledAction');
                            } else {
                                this.element.classList.remove('hiddenAction');
                            }
                        }
                    });
                });
            }
        };

        /**
         * Create element for this node and return it. If this is a section then
         * also create element for child nodes and add to this node's element.
         */
        this.createElement = (depth=1, parentPath='settings') => {
            let element = cr('div');
            const thisPath = `${parentPath}${this.key||''}`;
            if (this.type === 'section') {
                element.classList.add('usstngs-sec');
                const title = 1 < depth ? this.title : 'Userscript Settings';
                element.appendChild(cr(`h${depth}`, { innerText:title }));
                Object.values(this.children).forEach(c => element.appendChild(c.createElement(depth+1, `${thisPath}-`)));
            } else {
                element.appendChild(cr('label', { innerText:this.title, htmlFor:thisPath }));
                let input, key;
                if (this.type === 'multiple') {
                    input = cr('select', { id:thisPath, multiple:true });
                    const opts = this.options.map(value => 
                        input.appendChild(cr('option', { value, innerText:value, selected:-1<this.currentValue.indexOf(value) })));
                    input.addEventListener('change', () =>
                        input.classList[this.setUnsavedValue(opts.filter(o =>
                            o.selected).map(o => o.value)) ? 'add' : 'remove']('hasUnsaved'));
                } else if (this.type === 'list') {
                    const select = new SettingList(Object.assign({ options:this.options, value:this.currentValue, defaultValue:this.defaultValue }, this.settings || {}));
                    select.onchange = value =>
                        input.classList[this.setUnsavedValue(value) ? 'add' : 'remove']('hasUnsaved');
                    input = select.createElement();
                } else {
                    switch (this.type) {
                        case "checkbox":
                            input = cr('input', { id:thisPath, type:'checkbox', checked:this.currentValue });
                            key = 'checked'; break;
                        case "text":
                        case "time":
                        case "date":
                            input = cr('input', { id:thisPath, type:this.type, value:this.currentValue });
                            key = 'value'; break;
                        case "textarea":
                            input = cr('textarea', { id:thisPath, value:this.currentValue, rows:this.numRows, cols:this.numCols });
                            key = 'value'; break;
                        case "number":
                            input = cr('input', { id:thisPath, type:'number', value:this.currentValue, min:this.min, max:this.max, step:this.step });
                            key = 'valueAsNumber'; break;
                        case "select":
                            input = cr('select', { id:thisPath });
                            this.options.forEach(value => 
                                input.appendChild(cr('option', { value, innerText:value, selected:this.currentValue === value })));
                            key = 'value'; break;
                    }
                    input.addEventListener('change', () => input.classList[this.setUnsavedValue(input[key]) ? 'add' : 'remove']('hasUnsaved'));
                }
                element.appendChild(input);
            }
            this.element = element; // TODO: Delete this.element when popup closes
            return element;
        };

        /**
         * Get child node on path relative to this node.
         * @param   {...String} path Relative path to (grand)child
         * @returns {Node|null} Child node
         */
        this.find = (...path) => {
            if (path.length) {
                const p = path.shift();
                let node;
                switch (p) {
                    case '..': node = this.parent; break;
                    case '/': node = UserscriptSettings.vars.node; break;
                    default: node = this.children[p];
                }
                return node?.find(...path);
            }
            return this;
        };

        /**
         * Loops children and passes child to function. If this node is not
         * a section then it passes itself to the function instead.
         * @param {Function} cb Function
         * @returns {Boolean} Whether any calls returned true
         */
        this.forEachChild = (cb, loopChildren=true) => {
            if (this.type === 'section')
                return !!Object.values(this.children).reduce((t, child) => (loopChildren ? child.forEachChild(cb) : cb(child)) || t, false);
            else
                return !!cb(this);
        };

        /**
         * Get value from node. If node is a section, then a object is returned with
         * keys and values of all children and grandchidlren.
         */
        this.getValue = () => {
            if (this.currentValue != null) {
                return this.currentValue;
            } else {
                let out = {};
                Object.values(this.children).forEach(c => out[c.key] = c.getValue());
                return out;
            }
        };

        /**
         * Check if node or child node has an unsaved value.
         * @returns {Boolean} Has unsaved value
         */
        this.hasUnsavedValue = () => this.type === 'section' ? this.forEachChild(c => c.hasUnsavedValue()) : this.unsavedValue != null;

        /**
         * Reset node to default value.
         * @returns {Boolean} Whether node (or child node) value changed.
         */
        this.reset = () => {
            if (this.type === 'section') {
                return this.forEachChild(c => c.reset());
            } else {
                this.setUnsavedValue(this.defaultValue);
                return this.save();
            }
        };

        /**
         * Set currentValue to unsavedValue and call onChange callbacks if value changed.
         * @returns {Boolean} Whether node (or child node) value changed.
         */
        this.save = () => {
            let changed = false;
            if (this.type === 'section') {
                changed = this.forEachChild(c => c.save(), false);
            } else {
                if (this.unsavedValue != null) {
                    this.currentValue = this.unsavedValue;
                    delete this.unsavedValue;
                    changed = true;
                }
            }
            if (changed)
                this.onChange.forEach(cb => cb(this.getValue()));
            return changed;
        };

        /**
         * Set the unsaved value of this node. Unsaved will not trigger onChange event,
         * and currentValue not be changed.
         * @param {any} newVal New unsaved value
         * @returns {Boolean} Whether node has an unsaved value
         */
        this.setUnsavedValue = newVal => {
            this.onUnsavedChange.forEach(cb => cb(newVal));
            this.unsavedValue = newVal;
            if (this.unsavedValue === this.currentValue) {
                delete this.unsavedValue;
                return false;
            }
            return true;
        }

        // Untangle the settings descriptor object
        if (descriptor) {
            this.title = descriptor[0];
            this.type = descriptor[1];

            let coni = -1;
            switch (descriptor[1]) {
                case 'section':
                    this.applySettings(descriptor[2]);
                    coni = 3; break;
                case 'checkbox':
                    this.defaultValue = descriptor[2] != null ? descriptor[2] : true;
                    this.currentValue = descriptor[3] != null ? descriptor[3] : this.defaultValue;
                    coni = 4; break;
                case 'text':
                case 'time':
                case 'date':
                    this.defaultValue = descriptor[2] || '';
                    this.currentValue = descriptor[3] || this.defaultValue;
                    coni = 4; break;
                case 'textarea':
                    this.defaultValue = descriptor[2] || '';
                    this.currentValue = descriptor[3] || this.defaultValue;
                    this.numRows = descriptor[4];
                    this.numCols = descriptor[5];
                    coni = 6; break;
                case 'number':
                    this.defaultValue = descriptor[2] != null ? descriptor[2] : 0;
                    this.currentValue = descriptor[3] != null ? descriptor[3] : this.defaultValue;
                    this.min = descriptor[4];
                    this.max = descriptor[5];
                    this.step = descriptor[6];
                    coni = 7; break;
                case 'select':
                    this.options = descriptor[2];
                    this.defaultValue = descriptor[3] || this.options[0];
                    this.currentValue = descriptor[4] || this.defaultValue;
                    coni = 5; break;
                case 'multiple':
                    this.options = descriptor[2];
                    this.defaultValue = descriptor[3] || [this.options[0]];
                    this.currentValue = descriptor[4] || this.defaultValue;
                    coni = 5; break;
                case 'list':
                    this.options = descriptor[2];
                    this.defaultValue = descriptor[3] || null;
                    this.currentValue = descriptor[4] || this.defaultValue;
                    this.settings = descriptor[5];
                    coni = 6; break;
                default: throw new Error('Unknown setting type ' + descriptor[1]);
            }

            if (descriptor[coni])
                this.conditions = descriptor[coni];
        }
    };

    /**
     * Global variables, shared between all userscripts and the loaded webpage.
     */
    UserscriptSettings.vars = {
        element: null,
        injected: false,
        node: new UserscriptSettings.Node(),
    };

    /**
     * Get value or values from node at path.
     * @param  {...String} path Node path
     */
    UserscriptSettings.getValues = function(...path) {
        return this.vars.node.find(...path)?.getValue();
    };

    UserscriptSettings.export = function(...path) {
        // TODO: Implement
    };

    UserscriptSettings.import = function(json) {
        // TODO: Implement
    };

    UserscriptSettings.importPrompt = function() {
        // TODO: Implement
        const jsonStr = prompt('JSON data to import:');
        try {
            const json = JSON.parse(jsonStr);
            this.import(json);
        } catch (e) {
            console.warn('Invalid JSON');
            alert('Invalid JSON');
        }
    };

    /**
     * Add an onChange callback for node at path.
     * @param {Function} cb
     * @param {...String} path
     */
    UserscriptSettings.addOnChange = function(cb, ...path) {
        this.vars.node.find(...path)?.addOnChange(cb);
    };

    /**
     * Show the settings popup.
     */
    UserscriptSettings.show = function() {
        if (this.vars.element) return;
        if (!this.vars.injected) this.injectStyle();

        // Create settings elements
        const container = this.vars.node.createElement();

        // Check all connditions
        // this.vars.node.forEachChild(c => {
        //     if (c.type === 'section') {
        //     }
        //     console.log('Looping', c.key);
        //     c.onUnsavedChange.forEach(cb => cb(c.currentValue))
        // });

        // Create button elements
        const btns = cr('nav');
        [['Import', ()=>this.importPrompt()], ['Export', ()=>this.export()], ['Reset', ()=>this.reset()], ['Save', ()=>this.save()], ['Close', ()=>this.hide()]].forEach(([text, cb]) => {
            const btn = cr('button', { innerText:text });
            btn.addEventListener('click', cb);
            btns.appendChild(btn);
        });
        container.appendChild(btns);

        // Create tinted background
        const background = cr('div', { className:'usstngs' });
        background.appendChild(container);
        background.addEventListener('click', ev => {
            if (ev.target === background)
                this.hide();
        });
        this.vars.element = background;

        // Add elements to DOM
        document.body.appendChild(background);
    };

    /**
     * Hide the settings popup.
     * @param {Boolean} force Skip warning for unsaved values
     */
    UserscriptSettings.hide = function(force=false) {
        if (this.vars.element) {
            // TODO: Warn if there are unsaved values, force
            this.vars.element.remove();
            this.vars.element = null;
        }
    };

    /**
     * Reset settings to default.
     */
    UserscriptSettings.reset = function() {
        if (this.vars.element) {
            // TODO: Warn the user before resetting
            this.hide(true);
            this.vars.node.reset();
            this.show();
        }
    };

    /**
     * Inject CSS.
     */
    UserscriptSettings.injectStyle = function() {
        this.vars.injected = true;
        document.head.appendChild(cr('style', { innerHTML:
`.usstngs { position:fixed;top:0;left:0;bottom:0;right:0;background-color:#4446;z-index:1000000;color:#d0d0d0 !important;font-size:1rem;}
.usstngs>div {background-color:#1f1f1f;width:fit-content;padding:2px 10px 10px 10px;position:absolute;top:50vh;left:50vw;transform:translate(-50%, -50%);
    overflow:scroll;max-height:calc(100vh - 50px);}
.usstngs h1,.usstngs h2,.usstngs h3,.usstngs h4,.usstngs h5,.usstngs h6{letter-spacing:unset;text-transform:unset;margin:0 0;padding:5px 0;}
.usstngs h1{font-size:1.5em;text-align:center;color:#516a98;border-bottom:1px solid #516a98;}
.usstngs h2{font-size:1.8em;color:brown;}
.usstngs h3{font-size:1.3em;}
.usstngs h4{font-size:1.2em;}
.usstngs h5{font-size:1.1em;}
.usstngs h6{font-size:1em;}
.usstngs>div div.usstngs-sec{margin:10px 0 10px 4px;padding-left:4px;border-left:2px solid brown;}
.usstngs nav{border-top:1px solid #516a98;padding-top:5px;}
.usstngs nav button{background-color:#516a98;border:1px solid #2f3848;color:#d0d0d0;font-weight:bold;}
.usstngs nav button:hover{background-color:#2f3848;}
.usstngs>div>p{font-size:20px;}
.usstngs label{font-size:11px;display:block;cursor:pointer;}
.usstngs input,.usstngs select,.usstngs button{cursor:pointer;}
.usstngs>div>div:last-child{margin:8px 0 0 0;}
.usstngs p>span{font-size:11px;cursor:pointer;color:#999;margin-left:5px;}
.usstngs .hasUnsaved {box-shadow:0 0 8px yellow;}
.usstngs .hiddenAction {display:none;}
.usstngs .disabledAction {color:red;}
table.usstngs-list-setting { counter-reset:row; color:#d0d0d0 !important }
table.usstngs-list-setting tr:not(.unchecked) { counter-increment:row; }
table.usstngs-list-setting tr:not(.unchecked) td.usstngs-index::before { content:counter(row); font-size:12px; text-align:center; display:block; font-family:monospace; color:#888; }
table.usstngs-list-setting td.usstngs-move { display:inline-block; height:1em; }
table.usstngs-list-setting td.usstngs-move span { color:#888; cursor:pointer; font-size:.7em; height:50%; display:block; overflow:hidden; padding:0 5px; margin:0 -5px; }
table.usstngs-list-setting td.usstngs-move span:hover { color:#ccc;border-color:brown; }
table.usstngs-list-setting td.usstngs-move span:first-child::after { content:'▵'; position:relative; bottom:.4em; pointer-events:none; }
table.usstngs-list-setting td.usstngs-move span:last-child::after { content:'▿'; position:relative; bottom:.4em; }
table.usstngs-list-setting button.usstngs-add-row { width:100%; }` }));
    };

    /**
     * Save unsaved values and call onChange callbacks.
     */
    UserscriptSettings.save = function() {
        if (this.vars.node.save()) {
            this.hide(true);
            this.show();
        } else {
            console.log('Nothing to save!')
        }
    };


    /**
     * Custom select/multiple settings object, more feature rich than normal selects
     * See the 'list' settings type in readme.
     * @param {Object} Options
     */
    const SettingList = function SettingList({ options=[], value=null, defaultValue=[], index=true, indexOnlyChecked=true, checkable=true, orderable=false, custom=false }={}) {
        this.options = options;
        this.value = value;
        this.defaultValue = defaultValue;

        this.index = index; // Whether items should display their index number
        this.indexOnlyChecked = indexOnlyChecked; // Whether only checked items should display index number (requires index and checkable)
        this.orderable = orderable; // Whether items can be moved up and down
        this.checkable = checkable; // Whether items can be checked or unchecked
        this.custom = custom; // Whether custom strings can be added and removed TODO: Not implemented properly yet?

        if (custom) {
            this.checkable = false; // Can't have both custom and checkable
            this.options = []; // Can't have both custom and options
        }

        this.onchange = null;
        this.items = [];
    };

    /**
     * Set the value for this setting.
     * @param {Array} value New value
     */
    SettingList.prototype.setValue = function(value) {
        // TODO: Ability to set this setting's value from the outside
    };

    /**
     * For private use
     * Prepare to reorder the list by mouse movement.
     * @param {Element} tr Option table row
     * @param {Event} ev Mouse move event
     */
    SettingList.prototype.beginMoving = function(tr, ev) {
        ev.preventDefault();
        const btn = ev.target;
        let rect = tr.getBoundingClientRect();

        const end = () => {
            clearTimeout(tid);
            this.element.onmousemove = null;
            this.element.onmouseleave = null;
            this.element.onmouseup = null;
            this.element.style.cursor = '';
            btn.onmouseleave = null;
            tr.style.backgroundColor = '';
        };

        const beginMoving = () => {
            clearTimeout(tid);
            btn.onmouseleave = null;
            this.element.style.cursor = 'move !important';
            tr.style.backgroundColor = 'brown';
        };
        let tid = setTimeout(() => beginMoving(), 300);

        this.element.onmousemove = ev => {
            const y = ev.clientY;
            if (y < rect.top - 2) {
                if (tr.previousElementSibling) {
                    tr.parentElement.insertBefore(tr, tr.previousElementSibling);
                    rect = tr.getBoundingClientRect();
                }
            } else if (rect.top + rect.height + 2 < y) {
                if (tr.nextElementSibling) {
                    tr.parentElement.insertBefore(tr.nextElementSibling, tr);
                    rect = tr.getBoundingClientRect();
                }
            }
        };
        btn.onmouseleave = () => { console.log(1);beginMoving()};
        btn.onmouseup = () => end();
        this.element.onmouseleave = () => end();
        this.element.onmouseup = () => {
            this.adoptValueFromElements();
            end();
        };
    };

    /**
     * Update the setting value from all options (if applicable: checked or unchecked and/or order).
     * Also tells userscript settings instance about the change.
     */
    SettingList.prototype.adoptValueFromElements = function() {
        if (this.checkable) {
            let checked = [];
            this.element.querySelectorAll('input[type=checkbox]').forEach(cb => {
                if (cb.checked)
                    checked.push(cb.parentElement.parentElement.option);
            });
            this.value = checked;
        } else if (this.orderable || this.custom) {
            let newValue = [];
            this.element.querySelectorAll('tr').forEach(tr => newValue.push(tr.option));
            this.value = newValue;
        }
        if (this.onchange)
            this.onchange(this.value);
    };

    /**
     * Create the list setting element (table)
     */
    SettingList.prototype.createElement = function() {
        this.element = cr('table', { className:'usstngs-list-setting' });
        let toMake, toCheck;
        const values = this.value ? this.value : this.defaultValue;
        toMake = this.custom ? [...values] : [...this.options];
        if (this.checkable)
            toCheck = new Set(values);
        if (this.index)
            toMake = [...values, ...toMake];
        toMake = new Set(toMake);
        toMake.forEach(opt => {
            const el = cr('tr', { option:opt });
            if (this.index) {
                el.appendChild(cr('td', { className:'usstngs-index' }));
            }
            if (this.orderable) {
                const up = cr('span', { className:'usstngs-move' });
                const down = cr('span', { className:'usstngs-move' });
                up.onclick = () => {
                    if (el.previousElementSibling) {
                        el.parentElement.insertBefore(el, el.previousElementSibling);
                        this.adoptValueFromElements();
                    }
                };
                down.onclick = () => {
                    if (el.nextElementSibling) {
                        el.parentElement.insertBefore(el.nextElementSibling, el);
                        this.adoptValueFromElements();
                    }
                };
                let td = cr('td', { className:'usstngs-move' });
                td.appendChild(up); td.appendChild(down); el.appendChild(td);
                up.addEventListener('mousedown', ev => this.beginMoving(el, ev));
                down.addEventListener('mousedown', ev => this.beginMoving(el, ev));
            }
            let ch;
            if (this.checkable) {
                const checked = toCheck.has(opt);
                if (this.indexOnlyChecked)
                    el.classList[checked ? 'remove' : 'add']('unchecked');
                ch = cr('input', { type:'checkbox', checked, onchange: () => {
                    if (this.indexOnlyChecked)
                        el.classList[ch.checked ? 'remove' : 'add']('unchecked');
                    this.adoptValueFromElements();
                } });
                const td = cr('td');
                td.appendChild(ch);
                el.appendChild(td);
            }
            if (this.custom) {
                const inp = cr('input', { value:opt });
                inp.onblur = () => console.log('Blur!');
                const td = cr('td');
                td.appendChild(inp);
                el.appendChild(td);
            } else {
                el.appendChild(cr('td', { innerText:opt, value:opt, onclick:()=>ch?.click() }));
            }
            this.element.appendChild(el);
        });
        if (this.custom) {
            const tr = cr('tr');
            if (this.index) tr.appendChild(cr('td'));
            if (this.checkable) tr.appendChild(cr('td'));
            const add = cr('button', { className:'usstngs-add-row', innerText:'Add row' });
            add.onclick = () => console.log('Add options');
            const td = cr('td', { colSpan:3 });
            td.appendChild(add);
            tr.appendChild(td);
            this.element.appendChild(tr);
        }
        return this.element;
    };
}
