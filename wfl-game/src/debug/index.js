"use strict";

const PIXI = require('pixi.js');

const Flag = {
  AABB:     'aabb',
  QUADTREE: 'quadtree',
  VERTICES: 'vertices',
  VECTORS:  'vectors'
};

const DEFAULT_DEBUG_OPTIONS = {
  aabb:      false,
  quadtree:  false,
  vertices:  true,
  vectors:   true,
  
  lineSize:  1,
  lineColor: 0xFFFFFF,
  lineAlpha: 1,
  fillColor: 0xFFFFFF,
  fillAlpha: 1
};

var debugOptions    = {};
var debugContainers = {};
var currentId       = -1;

var start = function (id, options = {}) {
  if (!contains(id)) {
    options = Object.assign(
      {},
      DEFAULT_DEBUG_OPTIONS,
      options
    );
    
    debugOptions[id]    = options;
    debugContainers[id] = new PIXI.Graphics();
  }
};

var stop = function (id) {
  if (contains(id)) {
    delete debugOptions[id];
    delete debugContainers[id];
  }
  
  if (currentId === id) {
    currentId = -1;
  }
};

var contains = function (id) {
  return typeof debugOptions[id] !== 'undefined';
};

var setCurrentId = function (id) {
  currentId = id;
};

var clear = function (id = currentId) {
  if (contains(id)) {
    debugContainers[id].clear();
  }
};

var getContainer = function (id = currentId) {
  return debugContainers[id];
};

var getOptions = function (id = currentId) {
  if (contains(id)) {
    return debugOptions[id];
  }
  
  return null;
};

// If referenceGameObject is defined, its position is treated
// as the segment's origin. Otherwise, the segment's origin
// is (0, 0) in the world
var drawSegment = function (v1, v2, referenceGameObject) {
  var options = getOptions();
  
  if (options[Flag.VECTORS]) {
    var container = getContainer();
    var offset    = {x: 0, y: 0};

    if (referenceGameObject) {
      offset.x = referenceGameObject.x || 0;
      offset.y = referenceGameObject.y || 0;
    }

    if (container) {
      let {lineSize, lineColor, lineAlpha, fillColor, fillAlpha} = options;
      container.lineStyle(lineSize, lineColor, lineAlpha);
      container.moveTo(
        v1.x + offset.x,
        v1.y + offset.y
      );
      container.lineTo(
        v2.x + offset.x,
        v2.y + offset.y
      );
    }
  }
};

var drawPoint = function (point, radius = 3) {
  var options = getOptions();
  
  if (options[Flag.VECTORS]) {
    var container = getContainer();
    
    if (container) {
      let {lineSize, lineColor, lineAlpha, fillColor, fillAlpha} = options;
      container.lineStyle(lineSize, lineColor, lineAlpha);
      container.beginFill(fillColor, fillAlpha);
      container.drawCircle(
        point.x,
        point.y,
        radius
      );
      container.endFill();
    }
  }
};

module.exports = {
  Flag:         Flag,
  
  start:        start,
  stop:         stop,
  contains:     contains,
  setCurrentId: setCurrentId,
  clear:        clear,
  getContainer: getContainer,
  getOptions:   getOptions,
  
  get lineSize() {
    var options = getOptions();
    if (options) return options.lineSize;
    return undefined;
  },
  set lineSize(val) {
    var options = getOptions();
    if (options) options.lineSize = val;
  },
  
  get lineColor() {
    var options = getOptions();
    if (options) return options.lineColor;
    return undefined;
  },
  set lineColor(val) {
    var options = getOptions();
    if (options) options.lineColor = val;
  },
  
  get lineAlpha() {
    var options = getOptions();
    if (options) return options.lineAlpha;
    return undefined;
  },
  set lineAlpha(val) {
    var options = getOptions();
    if (options) options.lineAlpha = val;
  },
  
  get fillColor() {
    var options = getOptions();
    if (options) return options.fillColor;
    return undefined;
  },
  set fillColor(val) {
    var options = getOptions();
    if (options) options.fillColor = val;
  },
  
  get fillAlpha() {
    var options = getOptions();
    if (options) return options.fillAlpha;
    return undefined;
  },
  set fillAlpha(val) {
    var options = getOptions();
    if (options) options.fillAlpha = val;
  },
  
  drawSegment:  drawSegment,
  drawPoint:    drawPoint
};