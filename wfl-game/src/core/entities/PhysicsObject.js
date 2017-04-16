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
  this.friction        = 0.0; // This object's surface's friction
  this.restitution     = 0.0; // This object's surface's bounciness
  this.solid           = true;
  this.fixed           = false;
  
  // If false, the collision vertices in this game object's frame objects
  // will not rotate with the forward
  this.allowVertexRotation = true;
  
  // 2D vectors that describes how much this PhysicsObject has to move this
  // frame to resolve its collisions
  this.collisionDisplacementSum   = new geom.Vec2();
  this.collisionSurfaceImpulseSum = new geom.Vec2();
  this.collisionMomentumSum       = new geom.Vec2();
  
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
  },
  
  // During narrow phase of collision detection, the object's position may need
  // to be multi-sampled along its velocity path to see if it collided with
  // another object some time between this frame and the previous. This is the
  // upper limit for the number of those samples.
  MAX_COLLISION_MULTI_SAMPLE_COUNT : {
    value: 5
  },
  
  // PhysicsObjects can only adjust their position's x or y if they have moved
  // more than this amount in that direction over the past 2 frames
  MIN_DISPLACEMENT_TO_MOVE: {
    value: 1
  },
  
  // Eases position correction from collisions to reduce jitters
  COLLISION_DISPLACEMENT_PERCENTAGE_CORRECTION: {
    value: 0.5
  },
  
  // The minimum displacement needed to move. If it's less than the slop, the
  // displacement is treated as 0
  COLLISION_DISPLACEMENT_SLOP: {
    value: 0.1
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
      
      // Optimization: Includes GameObject's update() via copypaste to prevent
      // Function.prototype.call()
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

      // Specifically, check if the two object's AABBs are overlapping
      var thisHalfW = cache.aabbWidth  * 0.5;
      var thisHalfH = cache.aabbHeight * 0.5;
      var thisX     = cache.x;
      var thisY     = cache.y;
      var thatHalfW = otherCache.aabbWidth  * 0.5;
      var thatHalfH = otherCache.aabbHeight * 0.5;
      var thatX     = otherCache.x;
      var thatY     = otherCache.y;
      
      return thisX - thisHalfW <= thatX + thatHalfW &&
             thisX + thisHalfW >= thatX - thatHalfW &&
             thisY - thisHalfH <= thatY + thatHalfH &&
             thisY + thisHalfH >= thatY - thatHalfH;
    }
  },
  
  checkNarrowPhaseCollision: {
    value: function (physObj, collisionData) {
      var cache             = this.calculationCache;
      var otherCache        = physObj.calculationCache;
      var axes              = this._satGetAxes().concat(physObj._satGetAxes());
      var smallestOverlap   = Infinity;
      var smallestAxis      = null;
      var velocityDirection = this.velocity.clone().normalize();
      
      // Only axes that are opposite direction of the velocity should be
      // considered
      /*axes = axes.filter((axis) =>
        velocityDirection._x * axis.x + velocityDirection._y * axis.y <= 0
      );*/
      
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
          // TODO: Handle containment
          
          var biggestMin         = Math.max(projection1.min, projection2.min);
          var smallestMax        = Math.min(projection1.max, projection2.max);
          var displacementLength = Math.abs(projection2.max - projection1.min);
          
          if (displacementLength < smallestOverlap) {
            smallestOverlap = displacementLength;
            smallestAxis    = {x: axis.x, y: axis.y};
          }
        }
      }
      
      if (!smallestAxis) {
        return false;
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
        smallestAxis.x *= -1;
        smallestAxis.y *= -1;
      }
      
      collisionData.colliding = true;
      collisionData.direction = smallestAxis;
      return true;
    }
  },
  
  checkCollision: {
    value: function (physObj) {
      var collisionData = {
        colliding:     false,
        direction:     null,
        contactPoint:  null,
        edgeDirection: null
      };
      
      // If the objects are close enough and may collide,
      // we will do more intensive checking next
      if (this.checkBroadPhaseCollision(physObj)) {
        // Perform multi-sampling on the narrow phase to increment this object
        // to its future position and see if it collides along the way
        var cache             = this.calculationCache;
        var otherCache        = physObj.calculationCache;
        var curVelocity       = 
            this.velocity.clone().add(this.collisionSurfaceImpulseSum);
        var velocityMag       = curVelocity.getMagnitude();
        var sampleCount       = 1;
        var velocityIncrement = new geom.Vec2();
        
        if (velocityMag !== 0) {
          var velocityDirection   = curVelocity.clone().normalize();
          var smallestSide        = Math.min(cache.width * 0.5, cache.height * 0.5);
          var possibleSampleCount = Math.ceil(velocityMag / smallestSide);
          var sampleCount         = 1 + Math.min(
            possibleSampleCount,
            PhysicsObject.MAX_COLLISION_MULTI_SAMPLE_COUNT
          );
          var velocityIncrement   = velocityDirection.multiply(
            velocityMag / sampleCount
          );
          
          // Move this object back to where it was last frame and slowly move
          // it to its current position until a collision is found (if any)
          this.transform.position._x -= curVelocity._x;
          this.transform.position._y -= curVelocity._y;
          cache.x = this.transform.position._x;
          cache.y = this.transform.position._y;
        }
        
        for (var i = 0; i < sampleCount; i++) {
          this.transform.position._x += velocityIncrement._x;
          this.transform.position._y += velocityIncrement._y;
          cache.x = this.transform.position._x;
          cache.y = this.transform.position._y;
          
          if (this.checkNarrowPhaseCollision(physObj, collisionData)) {
            var maxDepth         = -Infinity;
            var bestContactPoint = null;
            var contactManifold  =
                this.findContactManifold(physObj, collisionData);

            for (let point of contactManifold) {
              if (point.depth > maxDepth) {
                maxDepth = point.depth;
                bestContactPoint = point;
              }
            }

            if (bestContactPoint) {
              var restitution       = this.restitution * physObj.restitution;
              var friction          = (this.friction + physObj.friction) * 0.5;
              var edge              = collisionData.edgeDirection.clone();
              var parallelComponent =
                  geom.Vec2.dot(edge, this.acceleration) * (1 - friction);
              var impulse           = edge.multiply(parallelComponent);
              
              if (physObj.fixed) {
                this.collisionSurfaceImpulseSum._x += impulse._x;
                this.collisionSurfaceImpulseSum._y += impulse._y;
              } else {
                this.collisionSurfaceImpulseSum._x += impulse._x / this.mass;
                this.collisionSurfaceImpulseSum._y += impulse._y / this.mass;
                physObj.collisionSurfaceImpulseSum._x -=
                  impulse._x / physObj.mass;
                physObj.collisionSurfaceImpulseSum._y -=
                  impulse._y / physObj.mass;
              }
              
              collisionData.contactPoint = bestContactPoint;
              break;
            }
          }
        }
      }
      
      return collisionData;
    }
  },
  
  /**
   * Reference: http://www.dyn4j.org/2011/11/contact-points-using-clipping/
   *
   * Returns an array of {x, y} pairs that define the contact
   * manifold between this object and another
   */
  findContactManifold: {
    value: function (physObj, collisionData) {
      // If this or the other physics object hasn't had its vertices set up
      // from a FrameObject, it will lack prev and next attributes and cannot
      // have a collision manifold calculated for it, so fail
      if (!this.vertices[0].prev || !physObj.vertices[0].prev) {
        return [];
      }
      
      var clippedPoints = [];
      var separationNormal = new geom.Vec2(
        collisionData.direction.x,
        collisionData.direction.y
      );
      
      /**
       * -- STEP 1 --
       * Calculate "best" edges for this and physObj
       */
      var bestEdge =
          this._findContactManifoldBestEdge(separationNormal);
      
      // Flip direction for separation normal to be accurate for
      // calculating the best edge in physObj
      separationNormal.multiply(-1);
      
      var otherBestEdge =
          physObj._findContactManifoldBestEdge(separationNormal);
      
      // Undo the flip from before
      separationNormal.multiply(-1);
      
      /**
       * -- STEP 2 --
       * Determine which edge is the reference edge and which is the incident
       * edge.
       *
       * If this bestEdge is more perpendicular than physObj's, bestEdge
       * is the reference edge. Otherwise physObj's is, and we should mark the
       * "flip" flag as true.
       */
      var referenceEdge = null;
      var incidentEdge  = null;
      var e1DotN        = geom.Vec2.dot(
        geom.Vec2.subtract(bestEdge.v1, bestEdge.v0),
        separationNormal
      );
      var e2DotN        = geom.Vec2.dot(
        geom.Vec2.subtract(otherBestEdge.v1, otherBestEdge.v0),
        separationNormal
      );
      
      if (Math.abs(e1DotN) <= Math.abs(e2DotN)) {
        referenceEdge = bestEdge;
        incidentEdge  = otherBestEdge;
      } else {
        referenceEdge = otherBestEdge;
        incidentEdge  = bestEdge;
      }
      
      /**
       * -- STEP 3 --
       * Clip points to find contact manifold
       */
      var refEdgeDirection = geom.Vec2.subtract(
        referenceEdge.v1,
        referenceEdge.v0
      ).normalize();
      
      // Clip incident edge by first vertex of reference edge
      var offset1 = geom.Vec2.dot(refEdgeDirection, referenceEdge.v0);
      clippedPoints = this._clipPoints(
        incidentEdge.v0,
        incidentEdge.v1,
        refEdgeDirection,
        offset1
      );
      
      // If fewer than 2 points, fail
      if (clippedPoints.length < 2) {
        return [];
      }
      
      // Clip what's left of incident edge by the second vertex of the
      // reference edge, but clip in the opposite direction (flip the direction
      // and offset)
      var offset2 = geom.Vec2.dot(refEdgeDirection, referenceEdge.v1);
      clippedPoints = this._clipPoints(
        clippedPoints[0],
        clippedPoints[1],
        refEdgeDirection.multiply(-1),
        -offset2
      );
      
      // Again, if fewer than 2 points, fail
      if (clippedPoints.length < 2) {
        return [];
      }
      
      // Undo flip from previous clip operation
      refEdgeDirection.multiply(-1);
      
      // Clip what's past the reference edge's normal
      // If we had to flip the incident and reference edges before, then we
      // need to flip the reference edge normal to clip properly
      var refEdgeNormal = refEdgeDirection.getOrthogonal();

      // Flip the normal to point from referenceEdge to incidentEdge
      refEdgeNormal.multiply(-1);
      
      var maxDepth = geom.Vec2.dot(
        refEdgeNormal,
        referenceEdge.maxProjectionVertex
      );
      
      var contactManifold = clippedPoints.concat();
      
      // Calculate depths for the clipped points
      clippedPoints[0].depth =
        geom.Vec2.dot(refEdgeNormal, clippedPoints[0]) - maxDepth;
      clippedPoints[1].depth =
        geom.Vec2.dot(refEdgeNormal, clippedPoints[1]) - maxDepth;
      
      // Clip to make sure the final points are not past maxDepth
      if (clippedPoints[0].depth < 0) {
        contactManifold.splice(
          contactManifold.indexOf(clippedPoints[0]),
          1
        );
      }
      if (clippedPoints[1].depth < 0) {
        contactManifold.splice(
          contactManifold.indexOf(clippedPoints[1]),
          1
        );
      }
      
      // If there are any contact points, store the edge's direction
      if (contactManifold.length > 0) {
        collisionData.edgeDirection = geom.Vec2.subtract(
          clippedPoints[1],
          clippedPoints[0]
        ).normalize();
        
        var incEdgeDirection = geom.Vec2.subtract(
          incidentEdge.v1,
          incidentEdge.v0
        ).normalize();
        
        // Flip the edge direction if it's opposite from the incident edge's
        // direction. This is to ensure winding order is correct
        if (geom.Vec2.dot(collisionData.edgeDirection, incEdgeDirection) < 0) {
          collisionData.edgeDirection.multiply(-1);
        }
      }
      
      return contactManifold;
    }
  },
  
  /**
   * Reference: http://www.dyn4j.org/2011/11/contact-points-using-clipping/
   */
  _findContactManifoldBestEdge: {
    value: function (separationNormal) {
      var vertices                 = this.vertices;
      var totalVertices            = vertices.length;
      var farthestVertexProjection = 0;
      var farthestVertex           = null;
      
      /**
       * -- STEP 1 --
       * Find vertex that's furthest inside physObj along separation
       * normal
       */
      for (var i = 0; i < totalVertices; i++) {
        var projection = geom.Vec2.dot(
          vertices[i],
          separationNormal
        );
        
        if (projection > farthestVertexProjection) {
          farthestVertexProjection = projection;
          farthestVertex = vertices[i];
        }
      }
      
      /**
       * -- STEP 2 --
       * Determine which edge is most perpendicular to the separation normal,
       * left edge or right edge?
       */
      var prev = farthestVertex.prev;
      var next = farthestVertex.next;
      
      var left  = geom.Vec2.subtract(farthestVertex, prev).normalize();
      var right = geom.Vec2.subtract(farthestVertex, next).normalize();
      
      var leftIsMorePerpendicular =
        geom.Vec2.dot(left,  separationNormal) <=
        geom.Vec2.dot(right, separationNormal);
      
      // Return the edge that is most perpendicular to the separation normal,
      // keeping winding direction (clockwise) in mind
      if (leftIsMorePerpendicular) {
        return {
          maxProjectionVertex: farthestVertex.clone().add(this.position),
          v0:                  prev.clone().add(this.position),
          v1:                  farthestVertex.clone().add(this.position)
        };
      } else {
        return {
          maxProjectionVertex: farthestVertex.clone().add(this.position),
          v0:                  farthestVertex.clone().add(this.position),
          v1:                  next.clone().add(this.position)
        };
      }
    }
  },
  
  /**
   * Reference: http://www.dyn4j.org/2011/11/contact-points-using-clipping/
   *
   * Clips the line segments of v0, v1 if they are past "offset" along "normal"
   */
  _clipPoints: {
    value: function (v0, v1, normal, offset) {
      var clippedPoints = [];
      var dist0 = geom.Vec2.dot(normal, v0) - offset;
      var dist1 = geom.Vec2.dot(normal, v1) - offset;
      
      // If either point is past "offset" along "normal" then we can keep that
      // point
      if (dist0 >= 0) {
        clippedPoints.push(v0);
      }
      if (dist1 >= 0) {
        clippedPoints.push(v1);
      }
      
      // If the points are on opposite sides, we need to compute the correct
      // point. Being on different sides mean dist0 * dist1 will be a (+) * (-)
      // meaning a negative number
      if (dist0 * dist1 < 0) {
        var displacement          = geom.Vec2.subtract(v1, v0);
        var percentageAlongNormal = dist0 / (dist0 - dist1);
        displacement.multiply(percentageAlongNormal);
        displacement.add(v0);
        clippedPoints.push(displacement);
      }
      
      return clippedPoints;
    }
  },
  
  /**
   * Moves the PhysicsObject to a location that resolves collisions
   */
  resolveCollisions: {
    value: function () {
      // Project the acceleration on the direction of the collision impulse
      // Experimental functionality: Is this needed?
      var impulseSumDirection  = 
        this.collisionSurfaceImpulseSum.clone().normalize();
      var accelerationDotDirection = geom.Vec2.dot(
        this.acceleration, impulseSumDirection
      );
      var ax = impulseSumDirection._x * accelerationDotDirection;
      var ay = impulseSumDirection._y * accelerationDotDirection;
      this.acceleration._x = ax;
      this.acceleration._y = ay;
      this.calculationCache.ax = ax;
      this.calculationCache.ay = ay;
      
      // Calculate new velocity based on momentum calculations and surface
      // physics (friction & restitution)
      // Note: Adjusted acceleration (above) is added for fun(???)
      var newVelocityDotDirection = geom.Vec2.dot(
        this.collisionMomentumSum, impulseSumDirection
      );
      var vx = impulseSumDirection._x * newVelocityDotDirection;
      var vy = impulseSumDirection._y * newVelocityDotDirection;
      this.velocity._x =
        this.collisionMomentumSum._x + this.collisionSurfaceImpulseSum._x + ax;
      this.velocity._y = 
        this.collisionMomentumSum._y + this.collisionSurfaceImpulseSum._y + ay;
      this.calculationCache.vx = 
        this.collisionMomentumSum._x + this.collisionSurfaceImpulseSum._x + ax;
      this.calculationCache.vy = 
        this.collisionMomentumSum._y + this.collisionSurfaceImpulseSum._y + ay;
      
      // Snap to the next integer so that objects can move smoothly after
      // colliding
      var dx = this.collisionDisplacementSum._x;
      var dy = this.collisionDisplacementSum._y;
      
      if (dx < 0) dx = Math.floor(dx);
      else        dx = Math.ceil(dx);
      if (dy < 0) dy = Math.floor(dy);
      else        dy = Math.ceil(dy);
      
      dx *= PhysicsObject.COLLISION_DISPLACEMENT_PERCENTAGE_CORRECTION;
      dy *= PhysicsObject.COLLISION_DISPLACEMENT_PERCENTAGE_CORRECTION;
      
      if (Math.abs(dx) < PhysicsObject.COLLISION_DISPLACEMENT_SLOP) dx = 0;
      if (Math.abs(dy) < PhysicsObject.COLLISION_DISPLACEMENT_SLOP) dy = 0;

      this.transform.position._x += dx;
      this.calculationCache.x += dx;

      this.transform.position._y += dy;
      this.calculationCache.y += dy;
      
      if (this.velocity.getMagnitude() < 0.001) this.velocity.multiply(0);
    }
  },
  
  onCollide: {
    value: function (physObj) {}
  },
  
  canCollide: {
    value: function (physObj) {
      return true;
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