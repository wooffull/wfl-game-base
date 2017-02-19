"use strict";

const PIXI    = require('pixi.js');

const display = require('../display');
const input   = require('../input');

var Game = function (canvasDisplayObject) {
  this.canvas = new display.canvas.create(canvasDisplayObject);

  // If the creation of the canvas failed, stop the game from starting
  if (!this.canvas) {
    console.error("Canvas could not be created. WFL Game cannot be created.");
    return;
  }

  this.pixi               = PIXI;
  this.pixiApp            = new PIXI.Application(this.canvas.width, this.canvas.height, {view: this.canvas});
  this.stage              = this.pixiApp.stage;
  this.renderer           = this.pixiApp.renderer;
  this.ticker             = this.pixiApp.ticker;
  this.loader             = PIXI.loader;
  
  //this.ctx                = this.canvas.getContext('2d');
  this.keyboard           = new input.Keyboard();
  this.mouse              = new input.Mouse(this.canvas);
  this._scene             = undefined;

  this.keyboard.start();
  
  // Disable anti-aliasing
  /*this.ctx.mozImageSmoothingEnabled    = false;
  this.ctx.webkitImageSmoothingEnabled = false;
  this.ctx.msImageSmoothingEnabled     = false;
  this.ctx.imageSmoothingEnabled       = false;*/

  // Start the game's update loop
  this.ticker.add(this.update.bind(this));
  
  this.renderer.backgroundColor = 0x123456;
};

Game.prototype = Object.freeze(Object.create(Game.prototype, {
  /**
   * Updates the game
   */
  update : {
    value : function (dt) {
      if (this._scene) {
        this._scene.update(dt);
        this._scene._beforeDraw(this.renderer);
        this._scene.draw(this.renderer);
        this._scene._afterDraw(this.renderer);
      }

      this.keyboard.update();
    }
  },

  /**
   * Stops the game if it is started
   */
  stop : {
    value : function () {
      this.pixiApp.stop();
    }
  },

  /**
   * Starts the game if it is stopped
   */
  start : {
    value : function () {
      this.pixiApp.start();
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
        this.stage.removeChild(this._scene._stage);
        this._scene.keyboard = undefined;
        this._scene.destroy();
      }

      scene.keyboard = this.keyboard;
      scene.mouse    = this.mouse;
      scene.renderer = this.renderer;
      this._scene    = scene;
      this.stage.addChild(scene._stage);
    }
  }
}));

module.exports = Game;