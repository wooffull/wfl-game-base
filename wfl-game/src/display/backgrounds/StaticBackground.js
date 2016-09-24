"use strict";

var IBackground = require('./IBackground.js');

var StaticBackground = function () {
    this.color = StaticBackground.DEFAULT_COLOR;
};

Object.defineProperties(StaticBackground, {
    DEFAULT_COLOR : {
        value : 'rgb(0, 0, 0)'
    }
});

StaticBackground.prototype = Object.freeze(Object.create(IBackground, {
    draw : {
        value : function (ctx, camera) {
            ctx.save();

            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.rect(0, 0, ctx.canvas.width, ctx.canvas.height);
            ctx.fill();
            ctx.closePath();

            ctx.restore();
        }
    }
}));

Object.freeze(StaticBackground);

module.exports = StaticBackground;