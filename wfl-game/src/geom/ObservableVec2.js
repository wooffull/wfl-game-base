"use strict";

const PIXI = require('pixi.js');
var Vec2 = require('./Vec2');

// 2-D Vector
var ObservableVec2 = function (x, y, cb = () => null, scope = null) {
  PIXI.ObservablePoint.call(this, cb, scope, x, y);
  Vec2.call(this, x, y);
};

ObservableVec2.prototype = Object.create(PIXI.ObservablePoint.prototype, {});

var keys = Object.keys(Vec2.prototype);
for (let k of keys) {
  ObservableVec2.prototype[k] = Vec2.prototype[k];
}

module.exports = ObservableVec2;