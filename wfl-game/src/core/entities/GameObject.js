"use strict";

const PIXI            = require('pixi.js');
const geom            = require('../../geom');
const animation       = require('./animation');
const GameObjectState = animation.GameObjectState;
const FrameObject     = animation.FrameObject;

/**
 * Generic object for the game's canvas
 */
var GameObject = function () {
  PIXI.Container.call(this);
  
  // Optimization: Use transform.position to avoid the getter for position
  this.transform.position = new geom.Vec2(this.position.x, this.position.y, this.position.cb, this.position.scope);
  this.vertices           = undefined;
  this.states             = {};
  this.currentState       = undefined;
  this.layer              = undefined;
  this.customData         = {};
  this.calculationCache   = {};
};

Object.defineProperties(GameObject, {
  STATE: {
    value: {
      DEFAULT: "DEFAULT"
    }
  },
  
  createState: {
    value: function (name) {
      return new GameObjectState(name);
    }
  },
  
  createFrame: {
    value: function (texture, duration, vertices) {
      return new FrameObject(texture, duration, vertices);
    }
  }
});

GameObject.prototype = Object.freeze(Object.create(PIXI.Container.prototype, {
  update: {
    value: function (dt) {
      // The contents of this function should be copypasted into
      // PhysicsObject's cacheCalculations (for optimization)
      if (this.currentState !== undefined) {
        this.currentState.update(dt);
        this._setSprite(this.currentState.sprite);
      }
    }
  },

  drawDebug: {
    value: function (ctx) {
      if (this.vertices.length > 0) {
        ctx.strokeStyle = "white";
        ctx.beginPath();
        ctx.moveTo(this.vertices[0].x, this.vertices[0].y);
        for (var i = 1; i < this.vertices.length; i++) {
          ctx.lineTo(this.vertices[i].x, this.vertices[i].y);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
  },

  getState: {
    value: function (stateName) {
      return this.states[stateName];
    }
  },

  setState: {
    value: function (stateName) {
      var newState = this.states[stateName];

      if (this.currentState !== newState) {
        this.currentState = newState;
        this.currentState.setCurrentFrame(0);
        
        // Call GameObject's prototype to update and set the new sprite
        GameObject.prototype.update.call(this, 0);
      }
    }
  },

  addState: {
    value: function (stateName, state) {
      // If only the state was passed in as the 1st parameter,
      // then get the state name from that state
      if (typeof state === 'undefined' && stateName) {
        state     = stateName;
        stateName = state.name;
      }
      
      this.states[stateName] = state;
      state.name = stateName;

      // No current state yet, so initialize game object with newly
      // added state
      if (this.currentState === undefined) {
        this.setState(stateName);
      }
    }
  },
  
  cacheCalculations: {
    value: function () {
      // The contents of this function should be copypasted into
      // PhysicsObject's cacheCalculations (for optimization)
      var position = this.transform.position;
      var width    = this.width;
      var height   = this.height;
      
      this.calculationCache.x      = position._x;
      this.calculationCache.y      = position._y;
      this.calculationCache.width  = width;
      this.calculationCache.height = height;
    }
  },
  
  _setSprite: {
    value: function (sprite) {
      this.vertices = this.currentState.vertices;
      
      // Reset Container's children
      this.children.length = 0;

      if (sprite) {
        this.addChild(sprite);
      } else {
        this.width  = 0;
        this.height = 0;
      }
    }
  }
}));

Object.freeze(GameObject);

module.exports = GameObject;