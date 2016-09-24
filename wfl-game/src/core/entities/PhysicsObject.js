"use strict";

var geom = require('../../geom');
var GameObject = require('./GameObject.js');

/**
 * A game object with basic 2D physics
 */
var PhysicsObject = function () {
    GameObject.call(this);

    this.position = new geom.Vec2();
    this.velocity = new geom.Vec2();
    this.acceleration = new geom.Vec2();
    this.maxSpeed = PhysicsObject.DEFAULT_MAX_SPEED;
    this.maxAcceleration = PhysicsObject.DEFAULT_MAX_ACCELERATION;
    this.forward = new geom.Vec2(1, 0);
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

    getRotation : {
        value : function () {
            return this.forward.getAngle();
        }
    },

    setRotation : {
        value : function (angle) {
            this.rotate(angle - this.getRotation());
        }
    },

    getDisplayAngle : {
        value : function (angle) {
            // The angle increment for rounding the rotation
            var roundingAngle = 2 * Math.PI / PhysicsObject.TOTAL_DISPLAY_ANGLES;

            var displayedAngle = Math.round(angle / roundingAngle) * roundingAngle;
            return displayedAngle;
        }
    },

    update : {
        value : function (dt) {
            GameObject.prototype.update.call(this, dt);

            // Limit acceleration to max acceleration
            this.acceleration.limit(this.maxAcceleration);

            // Apply an acceleration matching the displayed direction for the physics object
            var displayAcceleration = this.acceleration.clone().setAngle(this.getDisplayAngle(this.acceleration.getAngle()));
            this.velocity.add(displayAcceleration.multiply(dt));

            // Limit velocity to max speed
            this.velocity.limit(this.maxSpeed);

            // Apply the current velocity
            this.position.add(this.velocity.clone().multiply(dt));
        }
    },

    draw : {
        value : function (ctx) {
            ctx.save();

            ctx.rotate(this.getRotation());

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

    drawDebug : {
        value : function (ctx) {
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

    checkCollision : {
        value : function (physObj) {
            var collisionData = {
                colliding : false,
                direction : null
            };

            // (Optimization) Determine if a collision check is necessary.
            // - If both objects aren't solid, they cannot collide.
            // - If both objects are fixed, they can never collide.
            if (!this.solid && !physObj.solid ||
                this.fixed && physObj.fixed) {

                return collisionData;
            }

            // (Optimization) If the objects are close enough and may collide,
            // we will do more intensive checking next
            //
            // In other words, check if the two object's "bounding circles"
            // collide using A^2 + B^2 = C^2
            var thisW = this.getWidth();
            var thisH = this.getHeight();
            var thatW = physObj.getWidth();
            var thatH = physObj.getHeight();
            var radiusSquared1 = (thisW * thisW + thisH * thisH) * 0.25;
            var radiusSquared2 = (thatW * thatW + thatH * thatH) * 0.25;
            var distanceSquared = new geom.Vec2.subtract(this.position, physObj.position).getMagnitudeSquared();
            var mayCollide = (distanceSquared <= radiusSquared1 + radiusSquared2);

            if (!mayCollide) {
                return collisionData;
            }

            // The two vertices on this physics object that define a segment that
            // intersects with the given physics object
            var intersectionSegmentV1 = null;
            var intersectionSegmentV2 = null;

            for (var i = 0; i < this.vertices.length; i++) {
                var q1 = geom.Vec2.add(this.vertices[i], this.position);
                var q2 = geom.Vec2.add(this.vertices[(i + 1) % this.vertices.length], this.position);

                // Equation for general form of a line Ax + By = C;
                var a1 = q2.y - q1.y;
                var b1 = q1.x - q2.x;
                var c1 = a1 * q1.x + b1 * q1.y;

                for (var j = 0; j < physObj.vertices.length; j++) {
                    var p1 = geom.Vec2.add(physObj.vertices[j], physObj.position);
                    var p2 = geom.Vec2.add(physObj.vertices[(j + 1) % physObj.vertices.length], physObj.position);

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
                var orthogonalVector = geom.Vec2.subtract(intersectionSegmentV2, intersectionSegmentV1).getOrthogonal();
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
                    this.velocity.x = collisionData.direction.x;
                    this.velocity.y = collisionData.direction.y;
                    this.position.add(collisionData.direction.multiply(2));
                }
            }
        }
    }
}));

Object.freeze(PhysicsObject);

module.exports = PhysicsObject;