"use strict";

var Keyboard = require('./Keyboard.js');
var Mouse = require('./Mouse.js');

module.exports = {
    keys     : Keyboard.keys,
    Keyboard : Keyboard.Keyboard,
    Mouse    : Mouse
};