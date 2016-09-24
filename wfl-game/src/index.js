"use strict";

var core = require('./core');
var actions = require('./actions');
var display = require('./display');
var input = require('./input');
var geom = require('./geom');
var debug = require('./debug');
var datastructure = require('./datastructure');

var create = function (canvas) {
    return new core.Game(canvas);
};

module.exports = {
    core          : core,
    actions       : actions,
    display       : display,
    input         : input,
    geom          : geom,
    debug         : debug,
    datastructure : datastructure,
    
    // Consistent reference for jQuery
    jquery        : require('jquery'),

    create        : create
};