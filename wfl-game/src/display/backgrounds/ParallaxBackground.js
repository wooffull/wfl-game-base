"use strict";

var IBackground = require('./IBackground.js');

var ParallaxBackground = function (backgroundImg) {
    this.img     = backgroundImg;
    this.panRate = ParallaxBackground.DEFAULT_PAN_RATE;
};

Object.defineProperties(ParallaxBackground, {
    DEFAULT_PAN_RATE : {
        value : 0.125
    }
});

ParallaxBackground.prototype = Object.freeze(Object.create(IBackground, {
    draw : {
        value : function (ctx, camera) {
            if (this.img) {
                ctx.save();

                var tileWidth       = this.img.width;
                var tileHeight      = this.img.height;

                var cameraPos       = camera.position;
                var parallaxX       = cameraPos.x * this.panRate;
                var parallaxY       = cameraPos.y * this.panRate;

                // Add 2 to both to cover edges of screen when the parallax BG
                // is moving
                var totalHorizontal = ctx.canvas.width / tileWidth + 2;
                var totalVertical   = ctx.canvas.height / tileHeight + 2;

                for (var i = -1; i < totalHorizontal - 1; i++) {
                    for (var j = -1; j < totalVertical - 1; j++) {
                        var x = i * tileWidth - parallaxX % tileWidth;
                        var y = j * tileHeight - parallaxY % tileHeight;

                        ctx.drawImage(this.img, Math.round(x), Math.round(y));
                    }
                }

                ctx.restore();
            }
        }
    }
}));

Object.freeze(ParallaxBackground);

module.exports = ParallaxBackground;