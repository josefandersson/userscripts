const UserscriptSettings = {
    init: function(options) {
        this.options = options;

        if (!unsafeWindow.userscriptSettings)
            unsafeWindow.userscriptSettings = {
                element: null,
                injected: false,
                settings: {},
                onSave: [],
                show: function() {
                    if (this.element) return;
            
                    const cr = (tagName, obj) => Object.assign(document.createElement(tagName), obj || {});
            
                    if (!this.injected) {
                        this.injected = true;
                        document.head.appendChild(cr('style', { innerHTML:'' }));
                    }
            
                    const construct = (settings, depth=0) => {
                        const container = cr('div');

                        Object.entries(settings).forEach(([key, val]) => {
                            if (val.settings) {
                                container.appendChild(cr('h5', { innerText:val.label || key }));
                                container.appendChild(construct(val.settings), depth + 1);
                            } else {
                                const id = `setting-${key}`;
                                container.appendChild(cr('label', { innerText:val.label || key, forHtml:id }));
                                let input, currentValue = val.currentValue != null ? val.currentValue : val.defaultValue;
                                if (val.type === 'checkbox') {
                                    input = cr('input', { id, type:'checkbox', checked:currentValue });
                                } else if (val.type === 'text') {
                                    input = cr('input', { id, type:'text', value:currentValue });
                                } else if (val.type === 'number') {
                                    input = cr('input', { id, type:'number', value:currentValue, min:val.min, max:val.max });
                                } else if (val.type === 'select') {
                                    input = cr('select', { id });
                                    val.options.forEach(opt => {
                                        input.appendChild(cr('option', { value:opt, innerText:opt, selected:currentValue === opt }));
                                    });
                                }
                                container.appendChild(input);
                            }
                        });
            
                        return container;
                    };
            
                    const container = construct(this.settings);
                    container.className = 'userscriptSettings';
                    const btnSave = cr('button', { innerText:'Save' });
                    const btnClose = cr('button', { innerText:'Close' });
                    const btnReset = cr('button', { innerText:'Reset' });
                    btnSave.addEventListener('click', () => this.onSave.forEach(cb => cb()));
                    btnClose.addEventListener('click', () => {
                        this.element.remove();
                        this.element = null;
                    });
                    btnReset.addEventListener('click', () => {});
                    container.appendChild(btnSave);
                    container.appendChild(btnClose);
                    container.appendChild(btnReset);
                    this.element = container;
                    document.body.appendChild(container);
                },
                getValues: function() {

                },
                getValue: function() {

                    let args = [...arguments];
                }
            };

        unsafeWindow.userscriptSettings.settings[options.label] = {
            label: options.label,
            settings: Object.assign({}, options.settings) };
    },
    show: function() { unsafeWindow.userscriptSettings.show(); },
    getValuesFull: function() { return unsafeWindow.userscriptSettings.getValues(...arguments); },
    getValueFull: function() { return unsafeWindow.userscriptSettings.getValue(...arguments); },
    getValues: function() { return this.getValuesFull(this.options.label); },
    getValue: function() { return this.getValueFull(...this.options.label, ...arguments); }
};

/*
UserscriptSettings.init({
    label: 'My Userscript',
    settings: {
        refresh: {
            label: 'Autorefresh',
            type: 'checkbox',
            defaultValue: true,
            currentValue: false
        },
        mode: {
            label: 'Mode',
            type: 'select',
            options: ['Single', 'Multiple', 'Auto'],
            defaultValue: 'Auto',
            currentValue: 'Single'
        },
        appearance: {
            label: 'Appearance',
            settings: {
                useTheme: {
                    label: 'Use theme',
                    type: 'checkbox',
                    defaultValue: true,
                    currentValue: true
                },
                theme: {
                    label: 'Theme',
                    type: 'select',
                    options: ['Zebra', 'Tomorrow', 'Autumn'],
                    defaultValue: 'Zebra',
                    currentValue: 'Tomorrow',
                    requires: 'useTheme'
                }
            }
        }
    }
});

UserscriptSettings.getValuesFull('My Userscript'); => { refresh:false, mode:'Single', useTheme:true, theme:'Tomorrow' }
UserscriptSettings.getValueFull('My Userscript', 'mode') => 'Single'
UserscriptSettings.getValueFull('My Userscript', 'appearance') => { useTheme:true, theme:'Tomorrow' }
UserscriptSettings.getValueFull('My Userscript', 'appearance', 'theme') => 'Tomorrow'

UserscriptSettings.getValues(); => UserscriptSettings.getValuesFull('My Userscript');
UserscriptSettings.getValue('appearance', 'theme'); => UserscriptSettings.getValueFull('My Userscript', 'appearance', 'theme');

*/