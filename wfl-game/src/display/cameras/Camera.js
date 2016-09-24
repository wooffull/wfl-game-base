"use strict";

var geom = require('../../geom');

var Camera = function () {
    this.position = new geom.Vec2();
    this.followRate = Camera.DEFAULT_FOLLOW_RATE;
    this.followObj = undefined;
    this.zoom = 1;
};

Object.defineProperties(Camera, {
    DEFAULT_FOLLOW_RATE : {
        value : 0.5
    }
});

Camera.prototype = Object.freeze(Object.create(Camera.prototype, {
    /**
     * Sets the object for the camera to follow on update
     */
    follow : {
        value : function (obj) {
            this.followObj = obj;
        }
    },

    /**
     * Updates the camera by moving it closer to the point of focus
     */
    update : {
        value : function (dt) {
            if (this.followObj) {
                var cameraDisplacement = geom.Vec2.subtract(
                    this.position,
                    this.followObj.position
                );
                cameraDisplacement.multiply(this.followRate);

                this.position.subtract(cameraDisplacement);
            }
        }
    }
}));

Object.freeze(Camera);

module.exports = Camera;