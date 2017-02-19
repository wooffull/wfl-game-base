"use strict";

var geom = require('../../geom');
var GameObject = require('./GameObject.js');

// Use this trash vector to prevent creating new ones over and over
var tempVector = new geom.Vec2();

/**
 * A game object with basic 2D physics
 */
var PhysicsObject = function () {
    GameObject.call(this);

    this.velocity = new geom.Vec2();
    this.acceleration = new geom.Vec2();
    this.maxSpeed = PhysicsObject.DEFAULT_MAX_SPEED;
    this.maxAcceleration = PhysicsObject.DEFAULT_MAX_ACCELERATION;
    this.forward = new geom.Vec2(1, 0);
    this.transform.rotation = 0; // Updated per frame according to this.forward
    this.mass = 1000.0;
    this.solid = true;
    this.fixed = false;
    this.vertices = [];
};

Object.defineProperties(PhysicsObject, {
    DEFAULT_MAX_ACCELERATION : {
        value : 0.025
    },
    DEFAULT_MAX_SPEED : {
        value : 0.4
    },

    // The amount of angles at which the physics object can be rendered
    TOTAL_DISPLAY_ANGLES : {
        value : 32
    },
  
    ROUNDING_ANGLE_INCREMENT : {
        value : 2 * Math.PI / 32 // 32 is TOTAL_DISPLAY_ANGLES, but literal is needed since defineProperties hasn't finished yet
    }
});

PhysicsObject.prototype = Object.freeze(Object.create(GameObject.prototype, {
    addForce : {
        value : function (force) {
            force.divide(this.mass);
            this.acceleration.add(force);
        }
    },

    addImpulse : {
        value : function (impulse) {
            impulse.divide(this.mass);
            this.velocity.add(impulse);
        }
    },

    rotate : {
        value : function (theta) {
            this.forward.rotate(theta);
            this.transform.rotation = this.forward.getAngle();

            for (var stateName in this.states) {
                var state = this.states[stateName];

                for (var i = 0; i < state.frameObjects.length; i++) {
                    var frameObject = state.frameObjects[i];

                    for (var j = 0; j < frameObject.vertices.length; j++) {
                        frameObject.vertices[j].rotate(theta);
                    }
                }
            }

            return this;
        }
    },

    getDisplayAngle : {
        value : function (angle) {
            return Math.round(angle / PhysicsObject.ROUNDING_ANGLE_INCREMENT) * PhysicsObject.ROUNDING_ANGLE_INCREMENT;
        }
    },

    update : {
        value : function (dt) {
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

    draw : {
        value : function (ctx) {
            ctx.save();

            ctx.rotate(this.transform.rotation);

            if (this.graphic === undefined) {
                ctx.beginPath();
                ctx.fillStyle = "rgb(256, 0, 0)";
                ctx.rect(0, 0, 25, 25);
                ctx.fill();
            } else {
                GameObject.prototype.draw.call(this, ctx);
            }

            ctx.restore();
        }
    },

    checkCollision : {
        value : function (physObj) {
            var collisionData = {
                colliding : false,
                direction : null
            };
          
            var cache      = this.calculationCache;
            var otherCache = physObj.calculationCache;

            // (Optimization) If the objects are close enough and may collide,
            // we will do more intensive checking next
            //
            // Specifically, check if the two object's "bounding circles"
            // collide using A^2 + B^2 = C^2
            var thisW = cache.width;
            var thisH = cache.height;
            var thisX = cache.x;
            var thisY = cache.y;
            var thatW = otherCache.width;
            var thatH = otherCache.height;
            var thatX = otherCache.x;
            var thatY = otherCache.y;
            var radiusSquared1 = (thisW * thisW + thisH * thisH) >> 2;
            var radiusSquared2 = (thatW * thatW + thatH * thatH) >> 2;
            var distanceSquared = (thisX - thatX) * (thisX - thatX) + (thisY - thatY) * (thisY - thatY);
            var mayCollide = (distanceSquared <= radiusSquared1 + radiusSquared2);

            if (!mayCollide) {
                return collisionData;
            }

            // The two vertices on this physics object that define a segment that
            // intersects with the given physics object
            var intersectionSegmentV1 = null;
            var intersectionSegmentV2 = null;
          
            // Optimization: Calculate these variables once instead of many times in the loops
            var vertices              = this.vertices;
            var verticesLength        = vertices.length;
            var otherVertices         = physObj.vertices;
            var otherVerticesLength   = otherVertices.length;
            
            // Optimization: Don't use Vec2 with all that overhead. Just simple objects with XY.
            // It adds some bloat, but it gets rid of a LOT of overhead.
            var q1 = {x: 0, y: 0};
            var q2 = {x: 0, y: 0};
            var p1 = {x: 0, y: 0};
            var p2 = {x: 0, y: 0};

            for (var i = 0; i < verticesLength; i++) {
                var vert1 = vertices[i];
                var vert2 = vertices[(i + 1) % verticesLength];
              
                q1.x = vert1.x + thisX;
                q1.y = vert1.y + thisY;
                q2.x = vert2.x + thisX;
                q2.y = vert2.y + thisY;

                // Equation for general form of a line Ax + By = C;
                var a1 = q2.y - q1.y;
                var b1 = q1.x - q2.x;
                var c1 = a1 * q1.x + b1 * q1.y;

                for (var j = 0; j < otherVerticesLength; j++) {
                    var otherVert1 = otherVertices[j];
                    var otherVert2 = otherVertices[(j + 1) % otherVerticesLength];

                    p1.x = otherVert1.x + thatX;
                    p1.y = otherVert1.y + thatY;
                    p2.x = otherVert2.x + thatX;
                    p2.y = otherVert2.y + thatY;

                    // Equation for general form of a line Ax + By = C;
                    var a2 = p2.y - p1.y;
                    var b2 = p1.x - p2.x;
                    var c2 = a2 * p1.x + b2 * p1.y;

                    var determinant = a1 * b2 - a2 * b1;

                    // If lines are not parallel
                    if (determinant !== 0) {
                        var intersectX = (b2 * c1 - b1 * c2) / determinant;
                        var intersectY = (a1 * c2 - a2 * c1) / determinant;

                        var intersecting = (
                            Math.min(p1.x, p2.x) <= intersectX && intersectX <= Math.max(p1.x, p2.x) &&
                            Math.min(p1.y, p2.y) <= intersectY && intersectY <= Math.max(p1.y, p2.y) &&
                            Math.min(q1.x, q2.x) <= intersectX && intersectX <= Math.max(q1.x, q2.x) &&
                            Math.min(q1.y, q2.y) <= intersectY && intersectY <= Math.max(q1.y, q2.y)
                        );

                        if (intersecting) {
                            intersectionSegmentV1 = p1;
                            intersectionSegmentV2 = p2;
                            collisionData.colliding = true;
                            break;
                        }
                    }
                }

                if (collisionData.colliding) {
                    break;
                }
            }

            // Determine collision direction
            if (collisionData.colliding) {
                // Use the cached trash vector
                var orthogonalVector = tempVector;
              
                // Take the difference between the intersection points, then
                // get the orthogonal (x, y) => (y, -x)
                orthogonalVector._x = intersectionSegmentV2.y - intersectionSegmentV1.y;
                orthogonalVector._y = intersectionSegmentV1.x - intersectionSegmentV2.x;
                orthogonalVector.normalize();

                collisionData.direction = orthogonalVector;
            }

            return collisionData;
        }
    },

    resolveCollision : {
        value : function (physObj, collisionData) {
            if (!this.fixed && this.solid && physObj.solid) {
                this.acceleration.multiply(0);

                if (collisionData.direction) {
                    this.velocity._x = collisionData.direction._x;
                    this.velocity._y = collisionData.direction._y;
                  
                    // TODO: Replace 2 with a constant for "bouncing" off of objects
                    this.transform.position._x += collisionData.direction._x * 2;
                    this.transform.position._y += collisionData.direction._y * 2;
                }
            }
        }
    },
  
    cacheCalculations: {
        value: function () {
            // Optimization: Includes GameObject's cacheCalculations() via copypaste to prevent call()
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
    }
}));

Object.freeze(PhysicsObject);

module.exports = PhysicsObject;