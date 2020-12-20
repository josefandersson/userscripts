# Userscript Settings

Combine settings for different userscripts on one shared settings panel.

## For Users

A userscript's settings will only be shown on the settings panel if the userscript supports this library and if the userscript is active on the current page.

## For Developers

To start using the libarary:

1. Add library to your userscript (`// @require      https://raw.githubusercontent.com/josefandersson/userscripts/master/userscript-settings/userscript-settings.js`).
2. Create a settings object by calling `new UserscriptSettings(descriptor*, savedValues)`.
3. Implement a method for the user to open the settings panel. (Eg. using the `GM_registerMenuCommand` function along with the `/* your-settings-object */.show()` function.)
4. Add callbacks for when the user changes settings with the `/* your-settings-object */.addOnChange(callback*, path...)` function.
5. Store your userscript's settings however you want. (Eg. using the `GM_setValue` and `GM_getValue` functions.)

_Hard to understand? [Check out the example](https://github.com/josefandersson/userscripts/blob/master/userscript-settings/example-script.user.js)._

### new UserscriptSettings

To add a section of settings you create a new `UserscriptSettings` object. It takes two arguments:

- `descriptor` - See how the descriptor should be formatted in the next section.
- `savedValues` - (Optional) Used to load saved settings from a previous session. The format is the same as what you get from `UserscriptSettings.getValues()`.

### Setting descriptor object

The setting descriptor object, is a object where each key creates one node in the settings tree and where the value represents the title, type, value, etc. of the node. Nodes of type 'section' also contain a descriptor object in the value, thus creating child nodes (see 'appearance' in example).
Example:

```json
{
    "myUserscript": ["My Userscript", "section", {
        "refresh": ["Autorefresh", "checkbox", true],
        "mode": ["Mode", "select", ["Single", "Multiple", "Auto"], "Auto"],
        "appearance": ["Appearance", "section", {
            "useTheme": ["Use theme", "checkbox", true, false],
            "theme": ["Theme", "select", ["Zebra", "Tomorrow", "Autumn"], 0, null, [["useTheme", true]]]
        }]
    }]
}
```

Each value has to be an array were the two first values are setting title and setting type, in that order. The 3rd and following values are dependant on what the setting type is. These are all available types and available parameters:

#### section

Parameters: `[title*, type*, descriptor*, conditions]` (_\* is required_)
Example: `["Theme settings", "section", {...}]`

#### checkbox, text

Parameters: `[title*, type*, default value, current value, conditions]` (_\* is required_)
Example: `["Enable theme", "checkbox", true]`
Example: `["Title", "text", "This is a title"]`

#### number

Parameters: `[title*, type*, default value, current value, min, max, step, conditions]` (_\* is required_)
Example: `["Amount of eggs", "number", 12,, 1, 22]`

#### select

Parameters: `[title*, type*, options*, default value, current value, conditions]` (_\* is required_)
Example: `["Change theme", "select", ["Zebra", "Tomorrow", "Autumn"], "Tomorrow", "Autumn"]`

- `options` parameter is an array of strings.
- `default value` and `current value` has to exists in `options`, be `null` or `undefined` or be a number `n` where `0 <= n < array_length` in which case the option at index `n` will be used as value (works for both default and current values).
Example: `["Change theme", "select", ["Zebra", "Tomorrow", "Autumn"], 1, 2]`

#### The conditions parameter

The conditions parameter (available for all types) is used to enable/disable or show/hide setting node and it's children depending on specified conditions. For example one could want a select `Change theme` only to be changeable when a checkbox `Enable theme` is checked.

It should be an array of condition objects with the following available keys:

- _path_ - Path to the depending node. See more info about paths below.
- _value_ - When the value of node at `path` changes to equal this value then this condition will trigger.
- _action_ - What will happen when condition is triggerd. One of the following strings:
  - `"disable"`
  - `"hide"`
- _invert_ - Invert condition to trigger when value of node at `path` changes to _not_ equal `value`.

### Paths

Paths are useful when adding a onChange callback since you can specify a path to the node of which you want to add a listener to.

All settings (nodes) are placed in a node tree. Paths are used to navigate the tree.

A path is one or multiple strings where each string is one node down the tree.

If we use the following node tree as an example:

```json
{
    "group1": {
        "Adolf": true,
        "Edmund": 2,
    },
    "group2": {
        "Joseph": {
            "Helga": 3
        }
    }
}
```

...then these paths will yield these values:

- `"group1", "Adolf"` -> `true`
- `"group1", "Edmund"` -> `2`
- `"group2", "Joseph"` -> `{Helga:3}`
- `"group2", "Joseph", "Helga"` -> `3`

When setting up conditions paths will be relative to the parent of the current setting by default. If setting up a condition on `Edmund` in the example above and requiring `Adolf` to be equal to `true` you need to specifiy `["Adolf"]` as the path, and not `["group1", "Adolf"]`.

Like when navigating file system trees, you can also use `".."` to elevate to the parent.

Putting `"/"` as the first item in the path will elevate to the root node. In that case you _would_ have to use `["group1", "Adolf"]` above.

### IMPORTANT

Don't use this library to set sensitive settings! Passwords, keys or other important/private data should be handled by your own script. All settings set with this library can be accessed by other loaded userscripts, other browser extensions and the website it's used on!
