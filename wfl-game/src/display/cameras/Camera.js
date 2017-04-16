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
                var dx = this.followRate * (this.position._x - this.followObj.position._x);
                var dy = this.followRate * (this.position._y - this.followObj.position._y);
              
                // Prevent very small movements from shaking the camera
                if (Math.abs(dx) < 0.5) dx = 0;
                if (Math.abs(dy) < 0.5) dy = 0;
              
                this.position._x -= dx;
                this.position._y -= dy;
            }
        }
    }
}));

Object.freeze(Camera);

module.exports = Camera;