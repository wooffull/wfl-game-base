"use strict";

const PIXI = require('pixi.js');
const geom = require('../../../geom');

/**
 * Represents a key frame in an animation, with a duration
 */
//var FrameObject = function (texture, duration, createBoundingBox) {
class FrameObject extends PIXI.Sprite {
  constructor(texture, duration, vertices) {
    super(texture);
    
    if (isNaN(duration) || duration < 1) {
      duration = 1;
    }

    this.duration = duration;

    if (typeof vertices === 'undefined') {
      var w = this.width;
      var h = this.height;

      this.vertices = [];
      this.vertices.push(
        new geom.Vec2(-w * 0.5, -h * 0.5),
        new geom.Vec2(w * 0.5, -h * 0.5),
        new geom.Vec2(w * 0.5, h * 0.5),
        new geom.Vec2(-w * 0.5, h * 0.5)
      );
    } else {
      this.vertices = vertices;
    }
  
    // Center the sprite
    this.anchor.set(0.5);
  }
};

module.exports = FrameObject;