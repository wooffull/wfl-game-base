"use strict";

var PhysicsObject = require('./PhysicsObject.js');

/**
 * A physics object that has health, and blinks upon getting hit (with "invincibility frames")
 */
var LivingObject = function () {
    PhysicsObject.call(this);

    this.invincibilityFrameCounter = 0;
    this.totalInvincibilityFrames = LivingObject.DEFAULT_TOTAL_INVINCIBILITY_FRAMES;
    this.health = LivingObject.DEFAULT_MAX_HEALTH;
    this.maxHealth = LivingObject.DEFAULT_MAX_HEALTH;
};

Object.defineProperties(LivingObject, {
    DEFAULT_MAX_HEALTH : {
        value : 1
    },

    // Amount of time after being hit until the living object's temporary invincibility runs out
    DEFAULT_TOTAL_INVINCIBILITY_FRAMES : {
        value : 100
    },

    INVINCIBILITY_BLINK_TIMER : {
        value : 6
    }
});

LivingObject.prototype = Object.freeze(Object.create(PhysicsObject.prototype, {
    update : {
        value : function (dt) {
            PhysicsObject.prototype.update.call(this, dt);

            // Update damage timer when just got hit
            if (this.justGotHit()) {
                this.invincibilityFrameCounter++;

                if (this.invincibilityFrameCounter >= this.totalInvincibilityFrames) {
                    this.invincibilityFrameCounter = 0;
                }
            }
        }
    },

    draw : {
        value : function (ctx) {
            ctx.save();

            // Make the living object blink when it has taken damage
            if ((this.invincibilityFrameCounter % (LivingObject.INVINCIBILITY_BLINK_TIMER * 2)) > LivingObject.INVINCIBILITY_BLINK_TIMER) {
                ctx.globalAlpha = 0.25;
            }

            // The rendered angle for the graphic
            var displayedAngle = this.getDisplayAngle(this.getRotation());

            ctx.rotate(displayedAngle);
            ctx.drawImage(this.graphic, -this.graphic.width * 0.5, -this.graphic.height * 0.5);

            ctx.restore();
        }
    },

    /**
     * Returns whether or not the living object has just gotten hit by something
     */
    justGotHit : {
        value : function () {
            return (this.invincibilityFrameCounter > 0);
        }
    },

    takeDamage : {
        value : function (damage) {
            if (!this.justGotHit()) {
                this.health -= damage;
                this.invincibilityFrameCounter = 1;

                // Prevent health from dropping below 0
                if (this.health < 0) {
                    this.health = 0;
                }
            }
        }
    },

    heal : {
        value : function (amount) {
            this.health += amount;

            if (this.health > this.maxHealth) {
                this.health = this.maxHealth;
            }
        }
    },
}));

Object.freeze(LivingObject);

module.exports = LivingObject;