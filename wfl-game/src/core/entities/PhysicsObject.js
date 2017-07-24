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

  this.velocity           = new geom.Vec2();
  this.acceleration       = new geom.Vec2();
  this.maxSpeed           = PhysicsObject.DEFAULT_MAX_SPEED;
  this.maxAcceleration    = PhysicsObject.DEFAULT_MAX_ACCELERATION;
  this.mass               = 1.0;
  this.friction           = 0.0; // This object's surface's friction
  this.restitution        = 0.0; // This object's surface's bounciness
  this.solid              = true;
  this.fixed              = false;
  this.allowOverlapEvents = false;
  
  // 2D vectors that describes how much this PhysicsObject has to move this
  // frame to resolve its collisions
  this.collisionDisplacementSum   = new geom.Vec2();
  this.collisionSurfaceImpulseSum = new geom.Vec2();
  this.collisionMomentumSum       = new geom.Vec2();
  
  this._previousPosition = new geom.Vec2();
  this._previousVelocity = new geom.Vec2();
  
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
    // 32 is TOTAL_DISPLAY_ANGLES, but the literal is needed since
    // defineProperties hasn't finished yet
    value: 2 * Math.PI / 32 
  },
  
  COSINE_ANGLE_CACHE: {
    value: []
  },
  
  SINE_ANGLE_CACHE: {
    value: []
  },
  
  // During narrow phase of collision detection, the object's position may need
  // to be multi-sampled along its velocity path to see if it collided with
  // another object some time between this frame and the previous. This is the
  // upper limit for the number of those samples.
  MAX_COLLISION_MULTI_SAMPLE_COUNT : {
    value: 6
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
    value: 0.0001
  },
  
  // The minimum velocity needed to move. If it's less than the slop, the
  // displacement is treated as 0
  COLLISION_VELOCITY_SLOP: {
    value: 0.00001
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
      if (this.allowVertexRotation) {
        // Reset SAT Axes
        this._satAxes = null;
      }

      return GameObject.prototype.rotate.call(this, theta);
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
      if (!this.fixed)  {
        // Apply an acceleration matching the displayed direction for the 
        // physics object
        var accelerationAngle =
            Math.atan2(this.acceleration._y, this.acceleration._x);
        var displayAccelerationAngle =
            this.getDisplayAngle(accelerationAngle);
        var accelerationMag = Math.sqrt(
          this.acceleration._x * this.acceleration._x +
          this.acceleration._y * this.acceleration._y
        );

        // Limit acceleration to max acceleration
        if (accelerationMag > this.maxAcceleration) {
          this.acceleration._x *= this.maxAcceleration / accelerationMag;
          this.acceleration._y *= this.maxAcceleration / accelerationMag;
          accelerationMag = this.maxAcceleration;
        }

        this.velocity._x +=
          PhysicsObject.COSINE_ANGLE_CACHE[displayAccelerationAngle] *
          accelerationMag * dt;
        this.velocity._y += 
          PhysicsObject.SINE_ANGLE_CACHE[displayAccelerationAngle] *
          accelerationMag * dt;

        var velocityMagRef =
            this.velocity._x * this.velocity._x +
            this.velocity._y * this.velocity._y;

        // Limit velocity to max speed
        if (velocityMagRef > this.maxSpeed * this.maxSpeed) {
          velocityMagRef = Math.sqrt(velocityMagRef); 
          this.velocity._x *= this.maxSpeed / velocityMagRef;
          this.velocity._y *= this.maxSpeed / velocityMagRef;
        }

        // Apply the current velocity
        this._previousPosition._x = this.transform.position._x;
        this._previousPosition._y = this.transform.position._y;
        this.transform.position._x += this.velocity._x * dt;
        this.transform.position._y += this.velocity._y * dt;
      }
      
      // Optimization: Includes GameObject's update() via copypaste to prevent
      // Function.prototype.call()
      if (this.currentState !== undefined) {
        this.currentState.update(dt);
        this._setSprite(this.currentState.sprite);
      }
      
      this.transform.rotation = Math.atan2(this.forward._y, this.forward._x);
    }
  },
  
  checkBroadPhaseCollision: {
    value: function (physObj) {
      var cache      = this.calculationCache;
      var otherCache = physObj.calculationCache;

      // Specifically, check if the two object's AABBs are overlapping
      var thisHalfW = cache.aabbHalfWidth;
      var thisHalfH = cache.aabbHalfHeight;
      var thisX     = cache.x;
      var thisY     = cache.y;
      var thatHalfW = otherCache.aabbHalfWidth;
      var thatHalfH = otherCache.aabbHalfHeight;
      var thatX     = otherCache.x;
      var thatY     = otherCache.y;
      
      return thisX - thisHalfW <= thatX + thatHalfW &&
             thisX + thisHalfW >= thatX - thatHalfW &&
             thisY - thisHalfH <= thatY + thatHalfH &&
             thisY + thisHalfH >= thatY - thatHalfH;
    }
  },
  
  checkNarrowPhaseCollision: {
    value: function (physObj, collisionData = {}) {
      var cache             = this.calculationCache;
      var otherCache        = physObj.calculationCache;
      var axes              = this._satGetAxes().concat(physObj._satGetAxes());
      var smallestOverlap   = Infinity;
      var smallestAxis      = null;
      
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
      
      // If the width and height are equal, the next calculations are
      // unnecessary
      if (cache.width === cache.height) {
        return true;
      }
      
      // Get alternate separating direction for thin objects
      var velocityMagnitudeSquared = this.velocity.getMagnitudeSquared();
      var prev                     = this._previousPosition;
      var cur                      = this.transform.position;
      var closestDistToPrev        = Infinity;
      var closestDistToCur         = Infinity;
      var closestToPrev            = null;
      var closestToCur             = null;
      
      // Find the 2 vertices on physObj that are closest to this object's
      // current and past position
      for (let v of physObj.vertices) {
        var vert = v.clone().add(physObj.position);
        vert.prev = v.prev;
        vert.next = v.next;
        var prevDist = geom.Vec2.subtract(vert, prev).getMagnitudeSquared();
        var curDist = geom.Vec2.subtract(vert, cur).getMagnitudeSquared();
        
        if (prevDist < closestDistToPrev) {
          closestDistToPrev = prevDist;
          closestToPrev = vert;
        }
        
        if (curDist < closestDistToCur) {
          closestDistToCur = curDist;
          closestToCur = vert;
        }
      }
      
      // If the closest point is farther away than the length of the velocity,
      // there's no way this object could have moved to that point since the
      // last update. So, the collision with that point is invalid.
      if (closestDistToCur > this.velocity.getMagnitudeSquared()) {
        closestDistToCur  = null;
        closestToPrev     = null;
        closestDistToPrev = Infinity;
        closestDistToCur  = Infinity;
      }
      
      // If the vertices are different, make an edge out of them and use that
      // edge's normal as the separating normal
      if (closestToPrev !== closestToCur) {
        var p0 = null;
        var p1 = null;
        
        if (closestToCur.prev === closestToPrev) {
          var v = geom.Vec2.subtract(closestToCur, closestToPrev)
            .normalize()
            .getOrthogonal();
          collisionData.direction = {
            x: -v._x,
            y: -v._y
          };
        } else if (closestToCur.next === closestToPrev) {
          var v = geom.Vec2.subtract(closestToPrev, closestToCur)
            .normalize()
            .getOrthogonal();
          collisionData.direction = {
            x: -v._x,
            y: -v._y
          };
        }
      
      // If they are the same point and this object contains that point, use
      // this velocity to find the separating normal
      } else if (closestToCur) {
        var displacementDirection =
            new geom.Vec2(displacement.x, displacement.y).normalize();
        /**
         * TODO: Clean this up
         * Determine which edge is most perpendicular to the separation normal,
         * left edge or right edge?
         */
        var prev = closestToCur.prev.clone().add(physObj.position);
        var next = closestToCur.next.clone().add(physObj.position);

        var leftNormal =
            geom.Vec2.subtract(closestToCur, prev).getOrthogonal().normalize();
        var rightNormal =
            geom.Vec2.subtract(next, closestToCur).getOrthogonal().normalize();
        var leftDot  = geom.Vec2.dot(leftNormal,  displacementDirection);
        var rightDot = geom.Vec2.dot(rightNormal, displacementDirection);

        var tooClose = Math.abs(leftDot - rightDot) < 0.0015;

        // If the left and right normals are roughly the same angle apart from
        // the displacement direction, assume a corner has been hit
        if (tooClose) {
          collisionData.forceUndo = true;

          var dotProductWithVelocityDirection =
              displacement.x * displacementDirection.x +
              displacement.y * displacementDirection.y;
          if (dotProductWithVelocityDirection > 0) {
            displacementDirection.x *= -1;
            displacementDirection.y *= -1;
          }
          collisionData.direction = displacementDirection;
        
        // Otherwise use the edge that is most in the direction opposite of
        // displacement
        } else {
          var leftIsMoreNegative = leftDot <= rightDot;
          var velocityDirection  = this.velocity.clone().normalize();

          // Use the edge that is most perpendicular to the separation normal,
          // keeping winding direction (clockwise) in mind
          if (leftDot < 0 && leftIsMoreNegative) {
            collisionData.direction = {
              x: -leftNormal.x,
              y: -leftNormal.y
            };
            collisionData.altDirection = {
              x: -velocityDirection.x,
              y: -velocityDirection.y,
            };
            collisionData.altBestEdge = {
              maxProjectionVertex: closestToCur,
              v0:                  prev,
              v1:                  closestToCur,
              success:             true
            };
          } else if (rightDot < 0) {
            collisionData.direction = {
              x: -rightNormal.x,
              y: -rightNormal.y
            };
            collisionData.altDirection = {
              x: -velocityDirection.x,
              y: -velocityDirection.y,
            };
            collisionData.altBestEdge = {
              maxProjectionVertex: closestToCur,
              v0:                  closestToCur,
              v1:                  next,
              success:             true
            };
          }
        }
      }
      
      return true;
    }
  },
  
  checkCollision: {
    value: function (physObj) {
      var collisionData = {
        colliding:     false,
        direction:     null,
        altDirection:  null,
        bestEdge:      null,
        altBestEdge:   null,
        forceUndo:     false,
        contactPoint:  null,
        edgeDirection: null
      };
      
      // If the objects are close enough and may collide,
      // we will do more intensive checking next
      if (this.checkBroadPhaseCollision(physObj)) {
        // Perform multi-sampling on the narrow phase to increment this object
        // to its future position and see if it collides along the way
        var cache                = this.calculationCache;
        var otherCache           = physObj.calculationCache;
        var sampleCount          = 1;
        var velocityIncrement    = {x: 0, y: 0};
        var velocityIncrementMag = 1;
        var velocityMag          = Math.sqrt(
          cache.vx * cache.vx + cache.vy * cache.vy
        );
        
        if (velocityMag !== 0) {
          var velocityDirection = {
            x: cache.vx / velocityMag,
            y: cache.vy / velocityMag
          };
          var smallestSide        = Math.min(cache.width * 0.5, cache.height * 0.5);
          var possibleSampleCount = 1 + Math.ceil(velocityMag / smallestSide);
          var sampleCount         = Math.min(
            possibleSampleCount,
            PhysicsObject.MAX_COLLISION_MULTI_SAMPLE_COUNT
          );
          velocityIncrementMag = velocityMag / sampleCount;
          velocityIncrement.x  = velocityDirection.x * velocityIncrementMag;
          velocityIncrement.y  = velocityDirection.y * velocityIncrementMag;
          
          // Move this object back to where it was last frame and slowly move
          // it to its current position until a collision is found (if any)
          this.transform.position._x -= cache.vx;
          this.transform.position._y -= cache.vy;
          cache.x = this.transform.position._x;
          cache.y = this.transform.position._y;
        }
        
        for (var i = 0; i < sampleCount; i++) {
          this.transform.position._x += velocityIncrement.x;
          this.transform.position._y += velocityIncrement.y;
          cache.x = this.transform.position._x;
          cache.y = this.transform.position._y;
          
          if (this.checkNarrowPhaseCollision(physObj, collisionData)) {
            if (collisionData.forceUndo) {
              this.transform.position._x -= velocityIncrement.x;
              this.transform.position._y -= velocityIncrement.y;
              cache.x = this.transform.position._x;
              cache.y = this.transform.position._y;
              collisionData.contactPoint = {
                x: 0,
                y: 0,
                depth: velocityIncrementMag
              };
              return collisionData;
            }
            
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
            
            // If no contact point was found, try to find one using the
            // alternate separation normal
            if (!bestContactPoint && collisionData.altDirection) {
              // Swap the direction and alt direction from the collision data
              // so findContactManifold() uses the new direction
              var collisionDataAlt = {
                colliding:     collisionData.colliding,
                direction:     collisionData.altDirection,
                altDirection:  collisionData.direction,
                bestEdge:      collisionData.altBestEdge,
                altBestEdge:   collisionData.bestEdge,
                forceUndo:     collisionData.forceUndo,
                contactPoint:  collisionData.contactPoint,
                edgeDirection: collisionData.edgeDirection
              };
              var contactManifoldAlt =
                  this.findContactManifold(physObj, collisionDataAlt);
              
              for (let point of contactManifoldAlt) {
                if (point.depth > maxDepth) {
                  maxDepth = point.depth;
                  bestContactPoint = point;
                }
              }
            }

            if (bestContactPoint) {
              collisionData.contactPoint = bestContactPoint;
              
              // Only determine an impulse with the physic object's surface if
              // there's a collision with an edge. If there's only a point (aka
              // no edge direction), then there's no edge to "slide" against.
              if (collisionData.edgeDirection) {
                var restitution       = this.restitution * physObj.restitution;
                var friction          = (this.friction + physObj.friction) * 0.5;
                var edge              = {
                  x: collisionData.edgeDirection.x,
                  y: collisionData.edgeDirection.y
                };
                var edgeDotVelocity   = edge.x * cache.vx + edge.y * cache.vy;
                var parallelComponent = edgeDotVelocity * (1 - friction);
                
                // Multiply edge by parallel component to calculate impulse
                edge.x *= parallelComponent;
                edge.y *= parallelComponent;

                if (physObj.fixed) {
                  this.collisionSurfaceImpulseSum._x += edge.x;
                  this.collisionSurfaceImpulseSum._y += edge.y;
                } else {
                  this.collisionSurfaceImpulseSum._x += edge.x / this.mass;
                  this.collisionSurfaceImpulseSum._y += edge.y / this.mass;
                  physObj.collisionSurfaceImpulseSum._x -= edge.x / physObj.mass;
                  physObj.collisionSurfaceImpulseSum._y -= edge.y / physObj.mass;
                }
              }
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
      
      var referenceEdge    = null;
      var incidentEdge     = null;
      var refEdgeDirection = null;
      var clippedPoints    = [];
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
      
      var otherBestEdge = collisionData.bestEdge ||
          physObj._findContactManifoldBestEdge(separationNormal);
      
      // Undo the flip from before
      separationNormal.multiply(-1);
      
      /**
       * If a best edge was not found, check if a corner was hit instead of an
       * edge
       */
      if (!bestEdge.success && otherBestEdge.success) {
        var t = otherBestEdge;
        otherBestEdge = bestEdge;
        bestEdge = t;
      }
      
      // No best edge or corner, so fail early
      if (!bestEdge.success && !otherBestEdge.success) {
        return [];
      }
      
      // A best corner was hit, so use that as the contact point
      if (!otherBestEdge.success) {
        referenceEdge = bestEdge;
        refEdgeDirection = geom.Vec2.subtract(
          referenceEdge.v1,
          referenceEdge.v0
        ).normalize();
        
        // Clip what's past the reference edge's normal
        var refEdgeNormal = refEdgeDirection.getOrthogonal();

        // Flip the normal to point from referenceEdge to incidentEdge
        refEdgeNormal.multiply(-1);

        var maxDepth = geom.Vec2.dot(
          refEdgeNormal,
          referenceEdge.maxProjectionVertex
        );

        var v = otherBestEdge.maxProjectionVertex;
        
        // Calculate depths for the clipped points
        v.depth = geom.Vec2.dot(refEdgeNormal, v) - maxDepth;
        
        // If one object found a best edge, use that edge's direction as the
        // edge direction for the collision
        if (bestEdge.success) {
          var velocityDirection = this.velocity.clone().normalize();

          collisionData.edgeDirection = geom.Vec2.subtract(
            bestEdge.v1,
            bestEdge.v0
          ).normalize();

          // Flip the edge direction if it's opposite from the velocity. This is to ensure winding order is correct
          if (geom.Vec2.dot(collisionData.edgeDirection, velocityDirection) < 0) {
            collisionData.edgeDirection.multiply(-1);
          
          // Otherwise flip it orthogonally (???)
          } else {
            var x = collisionData.edgeDirection._x;
            var y = collisionData.edgeDirection._y;
            collisionData.edgeDirection._x = -y;
            collisionData.edgeDirection._y = x;
          }
        }
        
        return [v];
      }
      
      /**
       * -- STEP 2 --
       * Determine which edge is the reference edge and which is the incident
       * edge.
       *
       * If this bestEdge is more perpendicular than physObj's, bestEdge
       * is the reference edge. Otherwise physObj's is.
       */
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
      refEdgeDirection = geom.Vec2.subtract(
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
        var bestEdgeDirection = geom.Vec2.subtract(
          bestEdge.v1,
          bestEdge.v0
        ).normalize();
        
        collisionData.edgeDirection = geom.Vec2.subtract(
          otherBestEdge.v1,
          otherBestEdge.v0
        ).normalize();
        
        // Flip the edge direction if it's opposite from the velocity.
        // This is to ensure the edge is always pointing in the direction the
        // object is going.
        if (geom.Vec2.dot(collisionData.edgeDirection, this.velocity) < 0) {
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
      
      var left     = geom.Vec2.subtract(farthestVertex, prev).normalize();
      var right    = geom.Vec2.subtract(farthestVertex, next).normalize();
      var leftDot  = geom.Vec2.dot(left,  separationNormal);
      var rightDot = geom.Vec2.dot(right, separationNormal);
      
      var tooClose = Math.abs(leftDot - rightDot) < 0.0015;
      
      // If the left and right are roughly the same angle apart from the
      // separation direction, assume a corner has been hit and mark success as
      // false since no best "edge" was found.
      if (tooClose) {
        return {
          maxProjectionVertex: farthestVertex.clone().add(this.position),
          success:             false
        };
      }
      
      var leftIsMorePerpendicular = leftDot <= rightDot;
      
      // Return the edge that is most perpendicular to the separation normal,
      // keeping winding direction (clockwise) in mind
      if (leftIsMorePerpendicular) {
        return {
          maxProjectionVertex: farthestVertex.clone().add(this.position),
          v0:                  prev.clone().add(this.position),
          v1:                  farthestVertex.clone().add(this.position),
          success:             true
        };
      } else {
        return {
          maxProjectionVertex: farthestVertex.clone().add(this.position),
          v0:                  farthestVertex.clone().add(this.position),
          v1:                  next.clone().add(this.position),
          success:             true
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
      var dx = this.collisionDisplacementSum._x;
      var dy = this.collisionDisplacementSum._y;
      var resolutionAllowed =
          Math.abs(dx) >= PhysicsObject.COLLISION_DISPLACEMENT_SLOP ||
          Math.abs(dy) >= PhysicsObject.COLLISION_DISPLACEMENT_SLOP;

      if (!this.fixed && resolutionAllowed) {
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
        var vx =
          this.collisionMomentumSum._x + this.collisionSurfaceImpulseSum._x;
        var vy = 
          this.collisionMomentumSum._y + this.collisionSurfaceImpulseSum._y;

        if (Math.abs(vx) < PhysicsObject.COLLISION_VELOCITY_SLOP) vx = 0;
        if (Math.abs(vy) < PhysicsObject.COLLISION_VELOCITY_SLOP) vy = 0;

        this.velocity._x = vx
        this.velocity._y = vy
        this.calculationCache.vx = vx
        this.calculationCache.vy = vy

        this.transform.position._x += dx;
        this.calculationCache.x += dx;

        this.transform.position._y += dy;
        this.calculationCache.y += dy;
      }
      
      this.collisionDisplacementSum.multiply(0);
      this.collisionSurfaceImpulseSum.multiply(0);
      this.collisionMomentumSum.multiply(0);
    }
  },
  
  onOverlap: {
    value: function (physObj) {}
  },
  
  onCollide: {
    value: function (physObj, collisionData) {}
  },
  
  canCollide: {
    value: function (physObj, collisionData) {
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
      var width        = this._cachedWidth;
      var height       = this._cachedHeight;
      var velocity     = this.velocity;
      var acceleration = this.acceleration;
      var rotation     = this.transform.rotation;
      
      // Optimization for calculating aabb width and height
      var absCosRotation = Math.abs(Math.cos(rotation));
      var absSinRotation = Math.abs(Math.sin(rotation));

      this.calculationCache.x          = position._x;
      this.calculationCache.y          = position._y;
      this.calculationCache.px         = this._previousPosition._x;
      this.calculationCache.py         = this._previousPosition._y;
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
      this.calculationCache.aabbHalfWidth =
        this.calculationCache.aabbWidth * 0.5;
      this.calculationCache.aabbHalfHeight =
        this.calculationCache.aabbHeight * 0.5;
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
        this._cachedWidth  = sprite.width;
        this._cachedHeight = sprite.height;
      } else {
        this.width  = 0;
        this.height = 0;
        this._cachedWidth  = 0;
        this._cachedHeight = 0;
      }
      
      // Reset SAT Axes
      this._satAxes = null;
    }
  }
}));

// Cache Math.cos and Math.sin for the possible display angles
for (var i = 0; i <= PhysicsObject.TOTAL_DISPLAY_ANGLES; i++) {
  var angle =
      Math.PI * 2 * (i / PhysicsObject.TOTAL_DISPLAY_ANGLES) - Math.PI;
  angle = PhysicsObject.prototype.getDisplayAngle.call(null, angle);
  
  PhysicsObject.COSINE_ANGLE_CACHE[angle] = Math.cos(angle);
  PhysicsObject.SINE_ANGLE_CACHE[angle]   = Math.sin(angle);
}

module.exports = PhysicsObject;