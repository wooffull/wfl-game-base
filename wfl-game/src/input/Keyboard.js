"use strict"

var $ = require('jquery');

var keys = Object.create({}, {
    /**
     *  Letters
     */
    A : { value : 65 },
    B : { value : 66 },
    C : { value : 67 },
    D : { value : 68 },
    E : { value : 69 },
    F : { value : 70 },
    G : { value : 71 },
    H : { value : 72 },
    I : { value : 73 },
    J : { value : 74 },
    K : { value : 75 },
    L : { value : 76 },
    M : { value : 77 },
    N : { value : 78 },
    O : { value : 79 },
    P : { value : 80 },
    Q : { value : 81 },
    R : { value : 82 },
    S : { value : 83 },
    T : { value : 84 },
    U : { value : 85 },
    V : { value : 86 },
    W : { value : 87 },
    X : { value : 88 },
    Y : { value : 89 },
    Z : { value : 90 },

    /**
     * Arrows
     */
    LEFT  : { value : 37 },
    UP    : { value : 38 },
    RIGHT : { value : 39 },
    DOWN  : { value : 40 },

    /**
     * Numbers
     */
    ZERO  : { value : 48 },
    ONE   : { value : 49 },
    TWO   : { value : 50 },
    THREE : { value : 51 },
    FOUR  : { value : 52 },
    FIVE  : { value : 53 },
    SIX   : { value : 54 },
    SEVEN : { value : 55 },
    EIGHT : { value : 56 },
    NINE  : { value : 57 },

    /**
     * Numpad and Related
     */
    ZERO_NUMPAD   : { value : 96  },
    ONE_NUMPAD    : { value : 97  },
    TWO_NUMPAD    : { value : 98  },
    THREE_NUMPAD  : { value : 99  },
    FOUR_NUMPAD   : { value : 100 },
    FIVE_NUMPAD   : { value : 101 },
    SIX_NUMPAD    : { value : 102 },
    SEVEN_NUMPAD  : { value : 103 },
    EIGHT_NUMPAD  : { value : 104 },
    NINE_NUMPAD   : { value : 105 },
    ASTERISK      : { value : 106 },
    PLUS_NUMPAD   : { value : 107 },
    MINUS_NUMPAD  : { value : 109 },
    PERIOD_NUMPAD : { value : 110 },
    SLASH_NUMPAD  : { value : 111 },
    NUM_LOCK      : { value : 144 },

    /**
     * Function Keys (F Keys)
     */
    F1  : { value : 112 },
    F2  : { value : 113 },
    F3  : { value : 114 },
    F4  : { value : 115 },
    F5  : { value : 116 },
    F6  : { value : 117 },
    F7  : { value : 118 },
    F8  : { value : 119 },
    F9  : { value : 120 },
    F10 : { value : 121 },
    F11 : { value : 122 },
    F12 : { value : 123 },

    /**
     * Miscellaneous
     */
    BACKSPACE            : { value : 8   },
    TAB                  : { value : 9   },
    ENTER                : { value : 13  },
    SHIFT                : { value : 16  },
    CONTROL              : { value : 17  },
    ALT                  : { value : 18  },
    PAUSE                : { value : 19  },
    CAPS_LOCK            : { value : 20  },
    ESCAPE               : { value : 27  },
    SPACEBAR             : { value : 32  },
    PAGE_UP              : { value : 33  },
    PAGE_DOWN            : { value : 34  },
    END                  : { value : 35  },
    HOME                 : { value : 36  },
    PRINT_SCREEN         : { value : 44  },
    INSERT               : { value : 45  },
    DELETE               : { value : 46  },
    WINDOWS              : { value : 91  },
    SCROLL_LOCK          : { value : 145 },
    SEMICOLON            : { value : 186 },
    EQUALS               : { value : 187 },
    COMMA                : { value : 188 },
    MINUS                : { value : 189 },
    PERIOD               : { value : 190 },
    SLASH                : { value : 191 },
    ACCENT               : { value : 192 },
    LEFT_SQUARE_BRACKET  : { value : 219 },
    BACKSLASH            : { value : 220 },
    RIGHT_SQUARE_BRACKET : { value : 221 },
    APOSTROPHE           : { value : 222 }
});

var Keyboard = function () {
    this.keyStates = (function () {
        var _keyStates = [];

        for (var i = 0; i < 256; i++) {
            _keyStates[i] = false;
        }

        return _keyStates;
    })();

    this.previousKeyStates = (function () {
        var _keyStates = [];

        for (var i = 0; i < 256; i++) {
            _keyStates[i] = false;
        }

        return _keyStates;
    })();

    // Determines if key events will be registered
    this.isOn = true;
    // Whether or not a change has been made that requires an update
    this.needsToBeUpdated = false;
    // Whether or not any key is currently pressed
    this.anyKeyPressed = false;
};

Object.defineProperties(Keyboard, {
    /**
     * Array that contains the name for each known key code
     */
    keyNames : {
         value : (function () {
            var keys = [];
            var letters = [
                'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j',
                'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't',
                'u', 'v', 'w', 'x', 'y', 'z'
            ];

            keys[8] = "backspace";
            keys[9] = "tab";
            keys[13] = "enter";
            keys[16] = "shift";
            keys[17] = "ctrl";
            keys[18] = "alt";
            keys[20] = "capslock";
            keys[27] = "esc";
            keys[32] = "spacebar";
            keys[33] = "pgup";
            keys[34] = "pgdn";
            keys[35] = "end";
            keys[36] = "home";
            keys[37] = "left";
            keys[38] = "up";
            keys[39] = "right";
            keys[40] = "down";
            keys[45] = "insert";
            keys[46] = "delete";
            keys[91] = "windows";
            keys[106] = "*";
            keys[107] = "+";
            keys[109] = "-";
            keys[110] = "[numpad] .";
            keys[111] = "/";
            keys[144] = "numlock";
            keys[186] = ";";
            keys[187] = "=";
            keys[188] = ",";
            keys[189] = "-";
            keys[190] = ".";
            keys[191] = "/";
            keys[192] = "`";
            keys[219] = "[";
            keys[220] = "\\";
            keys[221] = "]";
            keys[222] = "'";

            for (var i = 48; i < 58; i++) {
                keys[i] = (i - 48).toString();
            }

            for (i = 65; i < 91; i++) {
                keys[i] = letters[i - 65];
            }

            for (i = 96; i < 106; i++) {
                keys[i] = "[numpad] " + (i - 96).toString();
            }

            for (i = 112; i < 124; i++) {
                keys[i] = "f" + (i - 111).toString();
            }

            for (i = 0; i < keys.length; i++) {
                if (!keys[i]) {
                    keys[i] = "[keyCode = " + i + "]";
                }
            }

            return keys;
        })()
    }
});

Keyboard.prototype = Object.freeze(Object.create(keys, {
    /**
     * Returns the key that was just pressed
     */
    getKeyJustPressed : {
        value : function () {
            for (var i = 0; i < this.keyStates.length; i++) {
                if (this.justPressed(i)) {
                    return i;
                }
            }

            return -1;
        }
    },

    /**
     * Returns the key that was just released
     */
    getKeyJustReleased : {
        value : function () {
            for (var i = 0; i < this.keyStates.length; i++) {
                if (this.justReleased(i)) {
                    return i;
                }
            }

            return -1;
        }
    },

    /**
     * Clears all key states
     */
    clear : {
        value : function () {
            for (var i = 0; i < this.keyStates.length; i++) {
                this.keyStates[i] = false;
                this.previousKeyStates[i] = false;
            }

            this.needsToBeUpdated = false;
            this.anyKeyPressed = false;
        }
    },

    /**
     * Returns whether or not the given key is currently pressed
     */
    isPressed : {
        value : function (keyCode) {
            return this.keyStates[keyCode];
        }
    },

    /**
     * Returns whether or not the given key has just been pressed
     */
    justPressed : {
        value : function (keyCode) {
            return this.keyStates[keyCode] &&
                   this.previousKeyStates[keyCode] !=
                   this.keyStates[keyCode];
        }
    },

    /**
     * Returns whether or not the given key has just been released
     */
    justReleased : {
        value : function (keyCode) {
            return !this.keyStates[keyCode] &&
                   this.previousKeyStates[keyCode] !=
                   this.keyStates[keyCode];
        }
    },

    /**
     * To be called at the end of every frame
     */
    update : {
        value : function () {
            if (this.needsToBeUpdated) {
                var anyKeyPressed = false;

                for (var i = 0; i < this.keyStates.length; i++) {
                    this.previousKeyStates[i] = this.keyStates[i];

                    if (this.keyStates[i]) {
                        anyKeyPressed = true;
                    }
                }

                this.needsToBeUpdated = false;
                this.anyKeyPressed = anyKeyPressed;
            }
        }
    },

    /**
     * Stops registering key events
     */
    stop : {
        value : function () {
            this.isOn = false;
            this.clear();

            if (window) {
                $(window).off("keydown");
                $(window).off("keyup");
            }
        }
    },

    /**
     * Starts registering key events
     */
    start: {
        value : function () {
            this.isOn = true;

            if (window) {
                // Clear listeners first, just so we never have multiple
                $(window).off("keydown");
                $(window).off("keyup");

                $(window).on("keydown", this._onKeyDown.bind(this));
                $(window).on("keyup", this._onKeyUp.bind(this));
            }
        }
    },

    /**
     * Called when a key has been pressed
     */
    _onKeyDown : {
        value : function (e) {
            if (this.isOn && e.keyCode < this.keyStates.length &&
                !this.keyStates[e.keyCode]) {

                this.keyStates[e.keyCode] = true;
                this.needsToBeUpdated = true;
                this.anyKeyPressed = true;
            }
            if (e.keyCode >= this.keyStates.length) {
                console.log("EXTRA KEYCODE: " + e.keyCode);
            }

            if (e.ctrlKey) {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }
    },

    /**
     * Called when a key has been lifted
     */
    _onKeyUp : {
        value : function (e) {
            if (this.isOn && e.keyCode < this.keyStates.length &&
                this.keyStates[e.keyCode]) {

                this.keyStates[e.keyCode] = false;
                this.needsToBeUpdated = true;
            }
        }
    }
}));
Object.freeze(Keyboard);

module.exports = {
    keys     : keys,
    Keyboard : Keyboard
};