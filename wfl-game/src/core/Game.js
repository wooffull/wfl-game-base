"use strict";

var display = require('../display');
var input = require('../input');

var Game = function (canvasDisplayObject) {
    this.canvas = new display.canvas.create(canvasDisplayObject);

    // If the creation of the canvas failed, stop the game from starting
    if (!this.canvas) {
        console.error("Canvas could not be created. WFL Game cannot be created.");
        return;
    }

    this.ctx                = this.canvas.getContext('2d');
    this.keyboard           = new input.Keyboard();
    this.mouse              = new input.Mouse(this.canvas);
    this.previousUpdateTime = -1;
    this._scene             = undefined;

    this.keyboard.start();
    
    // Disable anti-aliasing
    this.ctx.mozImageSmoothingEnabled    = false;
    this.ctx.webkitImageSmoothingEnabled = false;
    this.ctx.msImageSmoothingEnabled     = false;
    this.ctx.imageSmoothingEnabled       = false;

    // Start the game's update loop
    this.animationId = requestAnimationFrame(this.update.bind(this));
};

Game.prototype = Object.freeze(Object.create(Game.prototype, {
    /**
     * Updates the game
     */
    update : {
        value : function (time) {
            this.animationId = requestAnimationFrame(this.update.bind(this));

            // Initialize the delta time if the previous update time is "negative"
            if (this.previousUpdateTime === -1) {
                this.previousUpdateTime = time;
            }

            var dt = Math.max(time - this.previousUpdateTime, 0);

            if (this._scene) {
                this._scene.update(dt);
                this._scene.draw(this.ctx);
            }

            this.previousUpdateTime = time;

            this.keyboard.update();
        }
    },

    /**
     * Stops the game if it is started
     */
    stop : {
        value : function () {
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
                this.animationId = undefined;
            }
        }
    },

    /**
     * Starts the game if it is stopped
     */
    start : {
        value : function () {
            if (!this.animationId) {
                this.animationId = requestAnimationFrame(this.update.bind(this));
            }
        }
    },

    /**
     * Gets the scene to be rendered in the game
     */
    getScene : {
        value : function () {
            return this._scene;
        }
    },

    /**
     * Sets the scene to be rendered in the game
     */
    setScene : {
        value : function (scene) {
            if (this._scene) {
                this._scene.keyboard = undefined;
                this._scene.destroy();
            }

            scene.keyboard = this.keyboard;
            this._scene = scene;
        }
    }
}));

module.exports = Game;