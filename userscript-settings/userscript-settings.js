// TODO:  - Finish the import feature.
//        - Implement the 'requires' feature.
//        - Add types: date, range, textarea, radio.
//        - Add instructions for each function in README.


if (typeof UserscriptSettings === 'undefined') {
    const cr = (tagName, obj) => Object.assign(document.createElement(tagName), obj || {});

    const traverseObject = (obj, ...path) => {
        for (let key of path)
            if (obj[key]) obj = obj[key];
            else return null;
        return obj;
    };

    const forObject = (obj, cb, ...path) => {
        Object.entries(obj).forEach(([key, val]) => {
            cb([key, val], ...path, key);
            if (typeof val === 'object')
                forObject(val, cb, ...path, key);
        });
    };

    const setObjectValue = (obj, value, ...path) => {
        const final = path.pop();
        if (!final) return false;
        for (let key of path) {
            if (!obj[key]) obj[key] = {};
            obj = obj[key];
        }
        if (obj[final]) return false;
        obj[final] = value;
        return true;
    };

    UserscriptSettings = function UserscriptSettings(settings, options) {
        this.settings = settings;
        this.options = options;

        Object.assign(this.constructor.vars.settings, settings);

        this.show = () => this.constructor.show();
        this.getValues = (...path) => this.constructor.getValues(...path);
        this.addOnSave = (cb, ...path) => this.constructor.addOnSave(cb, ...path);
    };

    UserscriptSettings.vars = {
        element: null,
        injected: false,
        settings: {},
        saveCallbacks: {}
    };

    UserscriptSettings.getValues = function(...path) {
        let expandedPath = path.map(key => [key, 'settings']).flat();
        expandedPath.pop();
        let obj = traverseObject(this.vars.settings, ...expandedPath);
        let out = {};
        forObject(obj, ([key, val], ...path) => {
            if (val != null)
                setObjectValue(out, val.currentValue || val.defaultValue, ...path.filter(val => val !== 'settings'));
        });
        return out;
    };

    UserscriptSettings.export = function(...path) {
        const values = this.getValues(...path);
        let out;
        if (path.length) {
            out = {};
            setObjectValue(out, values, ...path);
        } else {
            out = values;
        }
        console.log(JSON.stringify(out));
    };

    UserscriptSettings.import = function(json) {
        console.log('Importing', json);
    };

    UserscriptSettings.importPrompt = function() {
        const jsonStr = prompt('JSON data to import:');
        try {
            const json = JSON.parse(jsonStr);
            this.import(json);
        } catch (e) {
            console.log('Invalid JSON');
            alert('Invalid JSON');
        }
    };

    UserscriptSettings.create = (settings, options) => new UserscriptSettings(settings, options);

    UserscriptSettings.addOnSave = function(cb, ...path) {
        const obj = traverseObject(this.vars.saveCallbacks, ...path);
        if (obj) {
            if (obj.listeners) obj.listeners.push(cb);
            else obj.listeners = [cb];
        } else setObjectValue(this.vars.saveCallbacks, { listeners:[cb] }, ...path);
    };

    UserscriptSettings.show = function() {
        if (this.vars.element) return;
        if (!this.vars.injected) this.injectStyle();

        const construct = (settings, parent='') => {
            const container = cr('div');
            const sorted = Object.entries(settings).sort(([aKey, aVal], [bKey, bVal]) => (aVal.label || aKey).toLowerCase() < (bVal.label || bKey).toLowerCase() ? -1 : 1);
            sorted.forEach(([key, val]) => {
                const pathStr = `${parent}${key}`;
                if (val.settings) {
                    const p = cr('p', { innerText:val.label || key });
                    const s = cr('span', { innerText:'Export section', style:{ fontSize:'11px' } });
                    s.addEventListener('click', () => this.export(...pathStr.split('-')));
                    p.appendChild(s);
                    container.appendChild(p);
                    container.appendChild(construct(val.settings, pathStr + '-'));
                } else {
                    const id = `setting-${pathStr}`;
                    container.appendChild(cr('label', { innerText:val.label || key, htmlFor:id }));
                    let input, currentValue = val.unsavedValue != null ? val.unsavedValue : val.currentValue != null ? val.currentValue : val.defaultValue;
                    const onChanged = (newValue) => {
                        val.unsavedValue = newValue;
                        if (val.currentValue === val.unsavedValue) {
                            delete val.unsavedValue;
                            input.style.boxShadow = 'none';
                        } else {
                            input.style.boxShadow = '0 0 8px yellow';
                        }
                    };
                    if (val.type === 'checkbox') {
                        input = cr('input', { id, type:'checkbox', checked:currentValue });
                        input.addEventListener('change', () => onChanged(input.checked));
                    } else if (val.type === 'text') {
                        input = cr('input', { id, type:'text', value:currentValue });
                        input.addEventListener('change', () => onChanged(input.value));
                    } else if (val.type === 'number') {
                        input = cr('input', { id, type:'number', value:currentValue, min:val.min, max:val.max });
                        input.addEventListener('change', () => onChanged(input.valueAsNumber));
                    } else if (val.type === 'select') {
                        input = cr('select', { id });
                        val.options.forEach(opt => {
                            input.appendChild(cr('option', { value:opt, innerText:opt, selected:currentValue === opt }));
                        });
                        input.addEventListener('change', () => onChanged(input.value));
                    }
                    container.appendChild(input);
                }
            });

            return container;
        };
        
        const container = construct(this.vars.settings);
        const btns = cr('div');
        [['Import', ()=>this.importPrompt()], ['Export', ()=>this.export()], ['Reset', ()=>this.reset()], ['Save', ()=>this.save()], ['Close', ()=>this.close()]].forEach(([text, cb]) => {
            const btn = cr('button', { innerText:text });
            btn.addEventListener('click', cb);
            btns.appendChild(btn);
        });
        container.appendChild(btns);
        const background = cr('div', { className:'userscriptSettings' });
        background.appendChild(container);
        background.addEventListener('click', ev => {
            if (ev.target === background) this.hide();
        });
        this.vars.element = background;
        document.body.appendChild(background);
    };

    UserscriptSettings.hide = function() {
        if (this.vars.element) {
            this.vars.element.remove();
            this.vars.element = null;
        }
    };

    UserscriptSettings.reset = function() {
        this.hide();
        forObject(this.vars.settings, ([key, val], ...path) => {
            val.unsavedValue = val.defaultValue;
            if (val.unsavedValue === val.currentValue)
                delete val.unsavedValue;
        });
        this.show();
    };

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
.userscriptSettings p>span{font-size:11px;cursor:pointer;color:#999;margin-left:5px;}` }));
    };

    UserscriptSettings.save = function() {
        let changedPaths = [];
        forObject(this.vars.settings, ([key, val], ...path) => {
            if (val != null && val.unsavedValue != null && val.unsavedValue != val.currentValue) {
                val.currentValue = val.unsavedValue;
                delete val.unsavedValue;
                changedPaths.push(path.filter(key => key !== 'settings'));
            }
        });

        if (changedPaths.length) {
            let callbacks = [];
            if (this.vars.saveCallbacks.listeners) callbacks.push(...this.vars.saveCallbacks.listeners);
            changedPaths.forEach(path => {
                let obj = this.vars.saveCallbacks;
                for (let key of path) {
                    if (obj[key]) obj = obj[key];
                    else return;
                    if (obj.listeners) callbacks.push(...obj.listeners);
                }
            });
    
            callbacks.forEach(cb => cb());
    
            this.hide();
            this.show();
        }
    };

    UserscriptSettings.forObject = forObject;
}
