"use strict";

/**
 * Check for canvas support
 */
var canvasSupported = (function () {
    var elem = document.createElement('canvas');
    return !!(elem.getContext && elem.getContext('2d'));
})();
if (!canvasSupported) {
    console.log("Canvas is not supported");
}

/**
 * Stores constants in Canvas object
 */
var Canvas = Object.create({}, {
    DEFAULT_WIDTH : {
        value : 640
    },

    DEFAULT_HEIGHT : {
        value : 480
    }
});

/**
 * Creates a canvas to be used in a WFL game
 */
var create = function (canvasDomObject) {
    this.domObject = undefined;

    if (canvasSupported) {
        // If the passed in argument is a Canvas, use it
        if (canvasDomObject instanceof HTMLCanvasElement) {
            this.domObject = canvasDomObject;

        // Otherwise, try to create one
        } else {
            var canvas = document.createElement('canvas');
            canvas.width = Canvas.DEFAULT_WIDTH;
            canvas.height = Canvas.DEFAULT_HEIGHT;

            this.domObject = canvas;
        }
    }

    return this.domObject;
};

module.exports = {
    create : create
};