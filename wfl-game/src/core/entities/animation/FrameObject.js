"use strict";

var geom = require('../../../geom');

/**
 * Represents a key frame in an animation, with a duration
 */
var FrameObject = function (graphic, duration, createBoundingBox) {
    if (isNaN(duration) || duration < 1) {
        duration = 1;
    }

    if (typeof createBoundingBox !== "boolean") {
        createBoundingBox = true;
    }

    this.graphic = graphic;
    this.duration = duration;
    this.vertices = [];

    if (createBoundingBox) {
        var w = this.graphic.width;
        var h = this.graphic.height;

        this.vertices.push(
            new geom.Vec2(-w * 0.5, -h * 0.5),
            new geom.Vec2(w * 0.5, -h * 0.5),
            new geom.Vec2(w * 0.5, h * 0.5),
            new geom.Vec2(-w * 0.5, h * 0.5)
        );
    }
};

Object.freeze(FrameObject);

module.exports = FrameObject;