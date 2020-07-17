# Userscript Settings

Combine settings for different userscripts on one shared settings panel.

## For Users

A userscript's settings will only be shown on the settings panel if the userscript supports this library and if the userscript is active on the current page.

## For Developers

To start using the libarary:

1. Make sure this library is required by your userscript.
2. Create a settings object by calling `new UserscriptSettings(<Data object>)`.
3. Implement a method for the user to open the settings panel. (It's recommended to use the `GM_registerMenuCommand` function along with the `/* your-settings-object */.show()` function.)
4. Catch settings changes with the `/* your-settings-object */.addOnSave(callback, path...)` function.
5. Store your userscript's settings however you want. (It's recommended to use the `GM_setValue` and `GM_getValue` functions.)

### Data object

When initializing the settings object you need to give it a data object. This object contains _all_ the settings you want to be available to the user and the current value of each setting.

Example data object:

```json
{
    my_userscript: {
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
                        requires: 'my_userscript.appearance.useTheme'
                    }
                }
            }
        }
    }
}
```

| Key            | Purpose | Type |
| :--            | :-- | :--: |
| _label_        | The label for this setting. (Shown to the user.) | string |
| _settings_     | Another data object with the child settings of this parent. Nodes with this variable will be seen as headers or sub headers. | object |
| _type_         | This setting's type. Available: checkbox, text, number, select. These work as expected. | string |
| _defaultValue_ | This setting's default value. When settings are reset or no value is known, this will be the value of this setting. | string\|number\|boolean |
| _currentValue_ | This setting's current value. Usually you will load this with `GM_getValue` when your userscript is loaded. If not present, defaultValue will be used. | string\|number\|boolean |
| _requires_     | If provided, this setting will only be shown if the value of the setting with the provided path is `true` or has a length greater than 0. | string |
| _options_      | (For 'select' settings.) A list of the available values for this select. `defaultValue` and `currentValue` have to be in this list. | array\<string\> |

### IMPORTANT

Don't use this library to set sensitive settings! Passwords, keys or other important/private data should be handled by your own script. All settings set with this library can be accessed by other loaded userscripts, other browser extensions and the website it's used on!
