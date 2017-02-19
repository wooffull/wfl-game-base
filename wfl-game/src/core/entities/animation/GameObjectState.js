"use strict";

/**
 * Represents a state for a game object
 */
var GameObjectState = function (name = '') {
    this.frameObjects   = [];
    this.animationTimer = 0;
    this.frameId        = 0;
    this.name           = name;
  
    this.vertices       = [];
    this.sprite         = null;
};

GameObjectState.prototype = Object.freeze(Object.create(GameObjectState.prototype, {
    update : {
        value : function (dt) {
            this.animationTimer++;

            // If it's time to switch to the next frame in the animation, switch!
            if (this.animationTimer >= this.frameObjects[this.frameId].duration) {
                this.animationTimer = 0;
                this.frameId++;
                this.frameId %= this.frameObjects.length;
            }
                
            this.vertices = this.frameObjects[this.frameId].vertices;
            this.sprite   = this.frameObjects[this.frameId];
        }
    },

    addFrame : {
        value : function (frame) {
            this.frameObjects.push(frame);
        }
    },

    getCurrentFrame : {
        value : function () {
            var frameCounter = 0;

            // Add the durations for all previous frames
            for (var i = 0; i < this.frameId; i++) {
                var curFrame = this.frameObjects[i];
                frameCounter += curFrame.duration;
            }

            // Add the remaining duration for how far we are into the current frame
            frameCounter += this.animationTimer;
            return frameCounter;
        }
    },

    setCurrentFrame : {
        value : function (frame) {
            var frameCounter = 0;

            for (var i = 0; i < this.frameObjects.length; i++) {
                var curFrame = this.frameObjects[i];
                frameCounter += curFrame.duration;

                // If current frame object extends past the newly set frame, stop at this frame
                if (frameCounter >= frame) {
                    this.frameId = i;
                    this.animationTimer = curFrame.duration - (frameCounter - frame);
                    return;
                }
            }

            // If the desired frame is out of bounds, set the animation to the beginning
            this.frameId = 0;
            this.animationTimer = 0;
        }
    }
}));

Object.freeze(GameObjectState);

module.exports = GameObjectState;