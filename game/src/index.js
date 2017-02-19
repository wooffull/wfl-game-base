"use strict";

var util   = require('./util');
var scenes = require('./scenes');
var Assets = require('./util/Assets.js');

//wfl.debug(true);

// Create game
var canvas = document.querySelector("#game-canvas");
var game   = wfl.create(canvas);

var onLoadWindow = function () {
  var l = game.loader;

  // Prepare to load assets
  for (var asset in Assets) {
    try {
      l = l.add(Assets[asset]);
    } catch (e) {
    }
  }

  l.load(onLoadAssets);
  resize();
};

var onLoadAssets = function () {
  Assets.get = function (path) { return PIXI.loader.resources[path]; };
  
  // Load scene here
  var gameScene = new scenes.GameScene(canvas);
  game.setScene(gameScene);
};

var onResize = function (e) {
  resize();
};

var resize = function () {
  // Use the commented code if you want to limit the canvas size
  // var MAX_WIDTH  = 1366;
  // var MAX_HEIGHT = 768;
  var w = window.innerWidth;  // Math.min(window.innerWidth,  MAX_WIDTH);
  var h = window.innerHeight; // Math.min(window.innerHeight, MAX_HEIGHT);
  
  canvas.width  = w;
  canvas.height = h;
  game.renderer.view.style.width  = w + 'px';
  game.renderer.view.style.height = h + 'px';
  game.renderer.resize(w, h);
}

window.onload = onLoadWindow;
window.onresize = onResize;