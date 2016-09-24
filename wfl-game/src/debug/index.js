"use strict";

var debugging = false;

module.exports = function (newValue) {
    // If a boolean is passed in, set debug mode to that
    if (typeof newValue === "boolean") {
        debugging = newValue;
    
    // Otherwise, return the current debug state
    } else {
        return debugging;
    }
};