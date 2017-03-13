"use strict";

var geom = require('../../geom');
var debug = require('../../debug');
var GameObject = require('./GameObject.js');

// Use this trash vector to prevent creating new ones over and over
var tempVector = new geom.Vec2();

/**
 * A game object with basic 2D physics
 */
var PhysicsObject = function () {
  GameObject.call(this);
  
  this.transform.rotation = 0; // Updated per frame according to this.forward

  this.velocity        = new geom.Vec2();
  this.acceleration    = new geom.Vec2();
  this.maxSpeed        = PhysicsObject.DEFAULT_MAX_SPEED;
  this.maxAcceleration = PhysicsObject.DEFAULT_MAX_ACCELERATION;
  this.forward         = new geom.Vec2(1, 0);
  this.mass            = 1.0;
  this.solid           = true;
  this.fixed           = false;
  
  // If false, the collision vertices in this game object's frame objects
  // will not rotate with the forward
  this.allowVertexRotation = true;
  
  // Calculated axes for (narrow phase) collision's Separating Axis Test.
  // Set to null when:
  // - This object rotates
  // - This object's frame changes
  this._satAxes = null;
};

Object.defineProperties(PhysicsObject, {
  DEFAULT_MAX_ACCELERATION: {
    value: 0.025
  },
  DEFAULT_MAX_SPEED: {
    value: 0.4
  },

  // The amount of angles at which the physics object can be rendered
  TOTAL_DISPLAY_ANGLES: {
    value: 32
  },
  
  ROUNDING_ANGLE_INCREMENT: {
    // 32 is TOTAL_DISPLAY_ANGLES, but a literal is needed since
    // defineProperties hasn't finished yet
    value: 2 * Math.PI / 32 
  }
});

PhysicsObject.prototype = Object.freeze(Object.create(GameObject.prototype, {
  addForce: {
    value: function (force) {
      force.divide(this.mass);
      this.acceleration.add(force);
    }
  },

  addImpulse: {
    value: function (impulse) {
      impulse.divide(this.mass);
      this.velocity.add(impulse);
    }
  },

  rotate: {
    value: function (theta) {
      this.forward.rotate(theta);
      this.transform.rotation = this.forward.getAngle();

      if (this.allowVertexRotation) {
        for (var stateName in this.states) {
          var state = this.states[stateName];

          for (var i = 0; i < state.frameObjects.length; i++) {
            var frameObject = state.frameObjects[i];

            for (var j = 0; j < frameObject.vertices.length; j++) {
              frameObject.vertices[j].rotate(theta);
            }
          }
        }
        
        // Reset SAT Axes
        this._satAxes = null;
      }

      return this;
    }
  },

  getDisplayAngle: {
    value: function (angle) {
      return Math.round(angle / PhysicsObject.ROUNDING_ANGLE_INCREMENT) *
             PhysicsObject.ROUNDING_ANGLE_INCREMENT;
    }
  },

  update: {
    value: function (dt) {
      // Limit acceleration to max acceleration
      this.acceleration.limit(this.maxAcceleration);
      
      // Apply an acceleration matching the displayed direction for the physics object
      var displayAccelerationAngle = this.getDisplayAngle(this.acceleration.getAngle());
      var accelerationMag          = this.acceleration.getMagnitude();

      this.velocity._x += Math.cos(displayAccelerationAngle) * accelerationMag * dt;
      this.velocity._y += Math.sin(displayAccelerationAngle) * accelerationMag * dt;

      // Limit velocity to max speed
      this.velocity.limit(this.maxSpeed);

      // Apply the current velocity
      this.transform.position._x += this.velocity._x * dt;
      this.transform.position._y += this.velocity._y * dt;

      this.transform.rotation = this.forward.getAngle();
      
      // Optimization: Includes GameObject's update() via copypaste to prevent call()
      if (this.currentState !== undefined) {
        this.currentState.update(dt);
        this._setSprite(this.currentState.sprite);
      }
    }
  },
  
  checkBroadPhaseCollision: {
    value: function (physObj) {
      var cache      = this.calculationCache;
      var otherCache = physObj.calculationCache;

      // Specifically, check if the two object's "bounding circles"
      // collide using A^2 + B^2 = C^2
      var thisW           = cache.width;
      var thisH           = cache.height;
      var thisX           = cache.x;
      var thisY           = cache.y;
      var thatW           = otherCache.width;
      var thatH           = otherCache.height;
      var thatX           = otherCache.x;
      var thatY           = otherCache.y;
      var radiusSquared1  = (thisW * thisW + thisH * thisH) >> 2;
      var radiusSquared2  = (thatW * thatW + thatH * thatH) >> 2;
      var distanceSquared =
          (thisX - thatX) * (thisX - thatX) +
          (thisY - thatY) * (thisY - thatY);
      
      return (distanceSquared <= radiusSquared1 + radiusSquared2);
    }
  },
  
  checkNarrowPhaseCollision: {
    value: function (physObj, collisionData) {
      var cache           = this.calculationCache;
      var otherCache      = physObj.calculationCache;
      var axes            = this._satGetAxes().concat(physObj._satGetAxes());
      var smallestOverlap = Infinity;
      var smallestAxis    = null;
      
      for (var i = 0; i < axes.length; i++) {
        var axis        = axes[i];
        var projection1 = this._satGetProjectionOntoAxis(axis);
        var projection2 = physObj._satGetProjectionOntoAxis(axis);
        var overlapping = 
          projection1.min <= projection2.max &&
          projection1.max >= projection2.min;
        
        // If the projections don't overlap, there is a separating axis,
        // therefore, the objects are not intersecting
        if (!overlapping) {
          return false;
        } else {
          // TODO: Handle containement
          
          var biggestMin     = Math.max(projection1.min, projection2.min);
          var smallestMax    = Math.min(projection1.max, projection2.max);
          var currentOverlap = smallestMax - biggestMin;
          
          if (currentOverlap < smallestOverlap) {
            smallestOverlap = currentOverlap;
            smallestAxis    = axis;
          }
        }
      }
      
      // Determine which direction the physics object should be pushed out
      // based on what side it's on of the other object
      var displacement = {
        x: otherCache.x - cache.x,
        y: otherCache.y - cache.y
      };
      var dotProductWithSmallestAxis =
          displacement.x * smallestAxis.x +
          displacement.y * smallestAxis.y;
      
      if (dotProductWithSmallestAxis < 0) {
        smallestOverlap *= -1;
      }
      
      collisionData.colliding = true;
      collisionData.direction = smallestAxis;
      collisionData.overlap   = smallestOverlap;
      return true;
    }
  },
  
  checkCollision: {
    value: function (physObj) {
      var collisionData = {
        colliding: false,
        direction: null,
        overlap:   0
      };
      
      // (Optimization) If the objects are close enough and may collide,
      // we will do more intensive checking next
      if (this.checkBroadPhaseCollision(physObj)) {
        this.checkNarrowPhaseCollision(physObj, collisionData);
      }
        
      return collisionData;
    }
  },
  
  resolveCollision: {
    value: function (physObj, collisionData) {
      this.transform.position._x += collisionData.direction.x * -collisionData.overlap;
      this.transform.position._y += collisionData.direction.y * -collisionData.overlap;
    }
  },
  
  /**
   * Casts a ray to the left and right of the point to see if the polygon
   * defined by this object's vertices contains the point.
   * If the ray to the left and right both collide with exactly 1 edge,
   * then this polygon contains the point
   */
  containsPoint: {
    value: function (point, refObj = null) {
      var cache             = this.calculationCache;
      var thisX             = cache.x;
      var thisY             = cache.y;
      var startX            = point._x - cache.aabbWidth;
      var stopX             = point._x + cache.aabbWidth;
      var vertices          = this.vertices;
      var verticesLength    = vertices.length;
      var intersectionLeft  = 0;
      var intersectionRight = 0;
      var refPoint          = {
        x: point._x,
        y: point._y
      };
      
      if (refObj) {
        var refCache = refObj.calculationCache;
        refPoint.x += refCache.x;
        refPoint.y += refCache.y;
      }
      
      // Optimization: Don't use Vec2 with all that overhead. Just simple objects with XY.
      // It adds some bloat, but it gets rid of a LOT of overhead.
      var q1 = {x: startX, y: refPoint.y};
      var q2 = {x: stopX,  y: refPoint.y};
      var p1 = {x: 0,      y: 0};
      var p2 = {x: 0,      y: 0};

      // Equation for general form of a line Ax + By = C;
      var a1_q1 = q1.x - refPoint.x;
      var b1_q1 = refPoint.y - q1.y;
      var c1_q1 = b1_q1 * q1.x + a1_q1 * q1.y;
      var a1_q2 = q2.x - refPoint.x;
      var b1_q2 = refPoint.y - q2.y;
      var c1_q2 = b1_q2 * q2.x + a1_q2 * q2.y;
      
      for (var i = 0; i < verticesLength; i++) {
        var vert1 = vertices[i];
        var vert2 = vertices[(i + 1) % verticesLength];

        p1.x = vert1.x + thisX;
        p1.y = vert1.y + thisY;
        p2.x = vert2.x + thisX;
        p2.y = vert2.y + thisY;

        // Equation for general form of a line Ax + By = C;
        var a2 = p1.x - p2.x;
        var b2 = p2.y - p1.y;
        var c2 = b2 * p1.x + a2 * p1.y;

        var determinant_q1 = a2 * b1_q1 - a1_q1 * b2;
        var determinant_q2 = a2 * b1_q2 - a1_q2 * b2;

        // If lines are not parallel
        if (determinant_q1 !== 0) {
          var intersectX = (a2 * c1_q1 - a1_q1 * c2) / determinant_q1;
          var intersectY = (b1_q1 * c2 - b2 * c1_q1) / determinant_q1;

          var intersecting = (
            Math.min(p1.x, p2.x) <= intersectX && intersectX <= Math.max(p1.x, p2.x) &&
            Math.min(p1.y, p2.y) <= intersectY && intersectY <= Math.max(p1.y, p2.y) &&
            Math.min(q1.x, refPoint.x) <= intersectX && intersectX <= Math.max(q1.x, refPoint.x) &&
            Math.min(q1.y, refPoint.y) <= intersectY && intersectY <= Math.max(q1.y, refPoint.y)
          );

          if (intersecting) {
            intersectionLeft++;
          }
        }
        
        // If lines are not parallel
        if (determinant_q2 !== 0) {
          var intersectX = (a2 * c1_q2 - a1_q2 * c2) / determinant_q2;
          var intersectY = (b1_q2 * c2 - b2 * c1_q2) / determinant_q2;

          var intersecting = (
            Math.min(p1.x, p2.x) <= intersectX && intersectX <= Math.max(p1.x, p2.x) &&
            Math.min(p1.y, p2.y) <= intersectY && intersectY <= Math.max(p1.y, p2.y) &&
            Math.min(refPoint.x, q2.x) <= intersectX && intersectX <= Math.max(refPoint.x, q2.x) &&
            Math.min(refPoint.y, q2.y) <= intersectY && intersectY <= Math.max(refPoint.y, q2.y)
          );

          if (intersecting) {
            intersectionRight++;
          }
        }
      }
      
      // TODO: Handle concave polygons
      return intersectionRight === 1 && intersectionLeft === 1;
    }
  },
  
  cacheCalculations: {
    value: function () {
      // Optimization: Includes GameObject's cacheCalculations() via copypaste
      // to prevent call()
      var position     = this.transform.position;
      var width        = this.scale.x * this.getLocalBounds().width;
      var height       = this.scale.y * this.getLocalBounds().height;
      var velocity     = this.velocity;
      var acceleration = this.acceleration;
      var rotation     = this.transform.rotation;
      
      // Optimization for calculating aabb width and height
      var absCosRotation = Math.abs(Math.cos(rotation));
      var absSinRotation = Math.abs(Math.sin(rotation));

      this.calculationCache.x          = position._x;
      this.calculationCache.y          = position._y;
      this.calculationCache.width      = width;
      this.calculationCache.height     = height;
      this.calculationCache.vx         = velocity._x;
      this.calculationCache.vy         = velocity._y;
      this.calculationCache.ax         = acceleration._x;
      this.calculationCache.ay         = acceleration._y;
      this.calculationCache.rotation   = rotation;
      this.calculationCache.aabbWidth  =
        absCosRotation * width +
        absSinRotation * height;
      this.calculationCache.aabbHeight =
        absCosRotation * height +
        absSinRotation * width;
    }
  },
  
  _satGetAxes: {
    value: function () {
      if (this._satAxes) {
        return this._satAxes;
      }
      
      var axes     = [];
      var vertices = this.vertices;
      
      for (var i = 0; i < vertices.length; i++) {
        var v1        = vertices[i];
        var v2        = vertices[(i + 1) % vertices.length];
        var normal    = {
          x: v2._y - v1._y,
          y: v1._x - v2._x
        };
        var magnitude = Math.sqrt(normal.x * normal.x + normal.y * normal.y);
        normal.x /= magnitude;
        normal.y /= magnitude;
        
        axes.push(normal);
      }
      
      this._satAxes = axes;
      return axes;
    }
  },
  
  _satGetProjectionOntoAxis: {
    value: function (axis) {
      var cache    =  this.calculationCache;
      var vertices =  this.vertices;
      var min      =  Infinity;
      var max      = -Infinity;
      
      for (var i = 0; i < vertices.length; i++) {
        var v = {
          x: vertices[i]._x + cache.x,
          y: vertices[i]._y + cache.y
        };
        var dot = v.x * axis.x + v.y * axis.y;
        
        if (dot < min) {
          min = dot;
        }
        if (dot > max) {
          max = dot;
        }
      }
        
      return {
        min: min,
        max: max
      };
    }
  },
  
  /**
   * (Optimization) Copied from GameObject to prevent a .call()
   */
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
      
      // Reset SAT Axes
      this._satAxes = null;
    }
  }
}));

Object.freeze(PhysicsObject);

module.exports = PhysicsObject;