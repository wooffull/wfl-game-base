"use strict";

const PIXI    = require('pixi.js');

const display = require('../display');
const input   = require('../input');
const debug   = require('../debug');

// Increments with every game created
var currentId = 0;

var Game = function (canvasDisplayObject) {
  this.canvas = new display.canvas.create(canvasDisplayObject);

  // If the creation of the canvas failed, stop the game from starting
  if (!this.canvas) {
    console.error("Canvas could not be created. WFL Game cannot be created.");
    return;
  }

  this.pixi     = PIXI;
  this.pixiApp  = new PIXI.Application(this.canvas.width, this.canvas.height, {view: this.canvas});
  this.stage    = this.pixiApp.stage;
  this.renderer = this.pixiApp.renderer;
  this.ticker   = this.pixiApp.ticker;
  this.loader   = PIXI.loader;
  
  this.keyboard = new input.Keyboard();
  this.mouse    = new input.Mouse(this.canvas);
  this._scene   = undefined;
  
  // Arbitrary game ID
  this._id      = currentId++;
  
  this._excessDt = 0;

  this.keyboard.start();

  // Start the game's update loop
  this.ticker.add(this.update.bind(this));
  
  this.renderer.backgroundColor = 0x123456;
  
  window.addEventListener('resize', this._onResize.bind(this));
};

Game.prototype = Object.freeze(Object.create(Game.prototype, {
  /**
   * Updates the game
   */
  update: {
    value: function (dt) {
      var debugOptions = debug.getOptions(this._id);
      
      if (debugOptions) {
        debug.setCurrentId(this._id);
        debug.clear(this._id);
      }

      if (this._scene) {
        // Increment the time step at a controlled rate if too much time has
        // passed between the previous frame and this frame
        if (dt > 1) {
          this._excessDt += dt - 1;
          dt = 1;
        } else if (this._excessDt > 0) {
          var newDt = Math.min(this._excessDt + dt, 1);
          this._excessDt -= newDt - dt;
          dt = newDt;
        }
        
        if (this._scene) {
          // Switch to the next scene if there's one to switch to
          if (this._scene.nextScene) {
            this.setScene(this._scene.nextScene);
          }
        }
        this._scene.update(dt);
        
        this._scene._beforeDraw(this.renderer);
        this._scene.draw(this.renderer);
        this._scene._afterDraw(this.renderer);
        
        if (debugOptions) {
          this._scene.drawDebug(this.renderer, debugOptions);
        }
      }

      this.keyboard.update();
    }
  },

  /**
   * Stops the game if it is started
   */
  stop: {
    value: function () {
      this.pixiApp.stop();
    }
  },

  /**
   * Starts the game if it is stopped
   */
  start: {
    value: function () {
      this.pixiApp.start();
    }
  },

  /**
   * Gets the scene to be rendered in the game
   */
  getScene: {
    value: function () {
      return this._scene;
    }
  },

  /**
   * Sets the scene to be rendered in the game
   */
  setScene: {
    value: function (scene) {
      if (this._scene) {
        this.stage.removeChild(this._scene._stage);
        this._scene.nextScene = undefined;
        this._scene.destroy();
      }

      scene.keyboard = this.keyboard;
      scene.mouse    = this.mouse;
      scene.renderer = this.renderer;
      this._scene    = scene;
      this.stage.addChild(scene._stage);
    }
  },
  
  debug: {
    get: function () { return debug.getOptions(this._id); },
    set: function (value) {
      if (value) {
        if (typeof value === 'object') {
          debug.start(this._id, value);
        } else {
          debug.start(this._id);
        }
      } else {
        debug.stop(this._id);
      }
    }
  },
  
  _onResize: {
    value: function (e) {
      if (this._scene) {
        this._scene._onResize(e);
      }
    }
  }
}));

module.exports = Game;