"use strict";

const PIXI            = require('pixi.js');
const geom            = require('../../geom');
const animation       = require('./animation');
const GameObjectState = animation.GameObjectState;
const FrameObject     = animation.FrameObject;
const debug           = require('../../debug');

// An ID counter used for GameObject's unique IDs. Increments every time a
// GameObject is created
var idCounter = 0;

/**
 * Generic object for the game's canvas
 */
var GameObject = function () {
  PIXI.Container.call(this);
  
  // Optimization: Use transform.position to avoid the getter for position
  this.transform.position = new geom.Vec2(this.position.x, this.position.y);
  
  this.wflId              = idCounter++;
  this.vertices           = [];
  this.states             = {};
  this.currentState       = undefined;
  this.layer              = undefined;
  this.customData         = {};
  this.calculationCache   = {};
  
  // A reference to the previously added sprite so that it can be removed when
  // a new sprite is set with _setSprite()
  this._prevSprite        = undefined;
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
  
  drawDebugQuadtree: {
    value: function (container = debug.getContainer()) {}
  },
  
  drawDebugVertices: {
    value: function (container = debug.getContainer()) {
      if (this.vertices.length > 0) {
        container.lineStyle(2, 0xBBBBFF, 1);
        container.moveTo(
          this.vertices[0].x + this.calculationCache.x,
          this.vertices[0].y + this.calculationCache.y
        );
        
        for (var i = 1; i < this.vertices.length; i++) {
          container.lineTo(
            this.vertices[i].x + this.calculationCache.x,
            this.vertices[i].y + this.calculationCache.y
          );
        }
        
        if (this.vertices.length > 2) {
          container.lineTo(
            this.vertices[0].x + this.calculationCache.x,
            this.vertices[0].y + this.calculationCache.y
          );
        }
      }
    }
  },

  drawDebugAABB: {
    value: function (container = debug.getContainer()) {
      container.lineStyle(1, 0xFFBBBB, 1);
      container.drawRect(
        this.calculationCache.x - this.calculationCache.aabbWidth  * 0.5,
        this.calculationCache.y - this.calculationCache.aabbHeight * 0.5,
        this.calculationCache.aabbWidth,
        this.calculationCache.aabbHeight
      );
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
      var width    = this.scale.x * this.getLocalBounds().width;
      var height   = this.scale.y * this.getLocalBounds().height;
      var rotation = this.transform.rotation;

      // Optimization for calculating aabb width and height
      var absCosRotation = Math.abs(Math.cos(rotation));
      var absSinRotation = Math.abs(Math.sin(rotation));
      
      this.calculationCache.x          = position._x;
      this.calculationCache.y          = position._y;
      this.calculationCache.width      = width;
      this.calculationCache.height     = height;
      this.calculationCache.rotation   = rotation;
      this.calculationCache.aabbWidth  =
          absCosRotation * width +
          absSinRotation * height;
      this.calculationCache.aabbHeight =
          absCosRotation * height +
          absSinRotation * width;
    }
  },
  
  _setSprite: {
    value: function (sprite) {
      // Don't do anything if this sprite is already added
      if (this._prevSprite === sprite) {
        return;
      }
      
      // Remove the previous sprite if it exists
      if (this._prevSprite) {
        this.removeChild(this._prevSprite);
      }
      
      this.vertices = this.currentState.vertices;

      if (sprite) {
        this.addChild(sprite);
        this._prevSprite = sprite;
      } else {
        this.width  = 0;
        this.height = 0;
      }
    }
  }
}));

Object.freeze(GameObject);

module.exports = GameObject;