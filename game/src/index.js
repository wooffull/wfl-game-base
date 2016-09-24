"use strict";

var scenes = require('./scenes');

//wfl.debug(true);

// Create game
var canvas = document.querySelector("#game-canvas");
var game   = wfl.create(canvas);

var onLoad = function () {
    // Load scene here
    var gameScene = new scenes.GameScene(canvas);
    game.setScene(gameScene);
};

window.onload = onLoad;