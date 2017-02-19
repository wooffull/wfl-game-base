"use strict";

var Assets = require('./Assets.js');

var Preloader = function (onComplete) {
    // Set up preloader
	this.queue = new createjs.LoadQueue(false);
	this.queue.installPlugin(createjs.Sound);

    // Replace definition of Asset getter to use the data from the queue
    Assets.get = this.queue.getResult.bind(this.queue);

    // Once everything has been preloaded, start the application
    if (onComplete) {
        this.queue.on("complete", onComplete);
    }

    var needToLoad = [];

    // Prepare to load assets
    for (var asset in Assets) {
        var assetObj = {
            id : asset,
            src : Assets[asset]
        }

        needToLoad.push(assetObj);
    }

	this.queue.loadManifest(needToLoad);
};

module.exports = Preloader;