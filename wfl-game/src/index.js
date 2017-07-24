"use strict";

// WFL Modules
const core          = require('./core');
const actions       = require('./actions');
const display       = require('./display');
const input         = require('./input');
const geom          = require('./geom');
const debug         = require('./debug');
const datastructure = require('./datastructure');

const create = function (canvas) {
  return new core.Game(canvas);
};

module.exports = {
  core:          core,
  actions:       actions,
  display:       display,
  input:         input,
  geom:          geom,
  debug:         debug,
  datastructure: datastructure,

  // Consistent reference for jQuery
  jquery:        require('jquery'),
  
  // Consistent reference for PIXI
  PIXI:          require('pixi.js'),

  create:        create
};