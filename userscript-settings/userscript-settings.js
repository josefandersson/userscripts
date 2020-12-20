// ==UserLibrary==
// @name          Userscript Settings
// @namespace     https://github.com/josefandersson/userscripts/tree/master/userscript-settings
// @version       2.0
// @description   Library for adding a settings popup to userscripts.
// @author        Josef Andersson
// ==/UserLibrary==

// TODO:  - Finish the import feature.
//        - Implement the 'requires' feature.
//        - Add types: date, range, textarea, radio.

if (typeof UserscriptSettings === 'undefined') {
    const cr = (tagName, obj) => Object.assign(document.createElement(tagName), obj || {});

    /**
     * Global settings class. Used to make instances for each application. Used to
     * create popup and handle showing and closing settings window. Used to get set
     * values.
     */
    UserscriptSettings = function UserscriptSettings(settings, options) {
        this.settings = settings;
        this.options = options;

        Object.assign(this.constructor.vars.settings, settings);
        this.constructor.vars.node.applySettings(settings);

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
         * Add a callback
         * @param {Function} cb 
         */
        this.addOnChange = cb => this.onChange.push(cb);

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
         * Create element for this node and return it. If this is a section then
         * also create element for child nodes and add to this node's element.
         */
        this.createElement = (depth=1, parentPath='settings') => {
            let element = cr('div');
            const thisPath = `${parentPath}${this.key||''}`;
            if (this.type === 'section') {
                const title = 1 < depth ? this.title : 'Userscript Settings';
                element.appendChild(cr(`h${depth}`, { innerText:title }));
                Object.values(this.children).forEach(c => element.appendChild(c.createElement(depth+1, `${thisPath}-`)));
            } else {
                element.appendChild(cr('label', { innerText:this.title, htmlFor:thisPath }));
                let input, key;
                switch (this.type) {
                    case "checkbox":
                        input = cr('input', { id:thisPath, type:'checkbox', checked:this.currentValue });
                        key = 'checked'; break;
                    case "text":
                        input = cr('input', { id:thisPath, type:'text', value:this.currentValue });
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
                element.appendChild(input);
            }
            return element;
        };

        /**
         * Get child node on path relative to this node.
         * @param   {...String} path Relative path to (grand)child
         * @returns {Node|null} Child node
         */
        this.find = (...path) => path.length ? this.children[path.shift()]?.find(...path) : this;

        /**
         * Loops children and passes child to function.
         * @param {Function} cb Function
         * @returns {Boolean} Whether any calls returned true
         */
        this.forEachChild = (cb) => !!Object.values(this.children).reduce((t, v) => cb(v) || t, false);

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
                // let changed = false;
                // Object.values(this.children).forEach(c => {
                //     if (c.reset())
                //         changed = true;
                // });
                // return changed;
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
                changed = this.forEachChild(c => c.save());
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

            let reqi = -1;
            switch (descriptor[1]) {
                case 'section':
                    this.applySettings(descriptor[2]);
                    reqi = 3; break;
                case 'checkbox':
                    this.defaultValue = descriptor[2] != null ? descriptor[2] : true;
                    this.currentValue = descriptor[3] != null ? descriptor[3] : this.defaultValue;
                    reqi = 4; break;
                case 'text':
                    this.defaultValue = descriptor[2] || '';
                    this.currentValue = descriptor[3] || this.defaultValue;
                    reqi = 4; break;
                case 'number':
                    this.defaultValue = descriptor[2] != null ? descriptor[2] : 0;
                    this.currentValue = descriptor[3] != null ? descriptor[3] : this.defaultValue;
                    this.min = descriptor[4];
                    this.max = descriptor[5];
                    this.step = descriptor[6];
                    reqi = 7; break;
                case 'select':
                    this.options = descriptor[2];
                    this.defaultValue = descriptor[3] || this.options[0];
                    this.currentValue = descriptor[4] || this.defaultValue;
                    reqi = 5; break;
                default: throw new Error("Unknown setting type");
            }

            if (descriptor[reqi]) {
                // TODO: Find required node, reference it, and add listener to see it change value
            };
        }
    };

    /**
     * Global variables, shared between all userscripts and the loaded webpage.
     */
    UserscriptSettings.vars = {
        element: null,
        injected: false,
        node: new UserscriptSettings.Node(),
        saveCallbacks: {},
        settings: {}, // raw, not used
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

        // Create button elements
        const btns = cr('div');
        [['Import', ()=>this.importPrompt()], ['Export', ()=>this.export()], ['Reset', ()=>this.reset()], ['Save', ()=>this.save()], ['Close', ()=>this.hide()]].forEach(([text, cb]) => {
            const btn = cr('button', { innerText:text });
            btn.addEventListener('click', cb);
            btns.appendChild(btn);
        });
        container.appendChild(btns);

        // Create tinted background
        const background = cr('div', { className:'userscriptSettings' });
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
`.userscriptSettings{position:fixed;top:0;left:0;bottom:0;right:0;background-color:#3333;z-index:1000000}
.userscriptSettings>div{background-color:#333;color:#ddd;width:fit-content;padding:2px 10px 10px 10px;position:absolute;top:50vh;left:50vw;transform:translate(-50%, -50%);}
.userscriptSettings p{margin:8px 0 4px 0;}
.userscriptSettings>div>p{font-size:20px;}
.userscriptSettings>div div{margin-left:15px;}
.userscriptSettings label{font-size:11px;display:block;cursor:pointer;}
.userscriptSettings input,.userscriptSettings select,.userscriptSettings button{cursor:pointer;}
.userscriptSettings>div>div:last-child{margin:8px 0 0 0;}
.userscriptSettings p>span{font-size:11px;cursor:pointer;color:#999;margin-left:5px;}
.userscriptSettings .hasUnsaved {box-shadow:0 0 8px yellow;}` }));
    };

    /**
     * Save unsaved values and call onChange callbacks.
     */
    UserscriptSettings.save = function() {
        if (this.vars.node.save()) {
            this.hide(true);
            this.show();
        }
    };
}
