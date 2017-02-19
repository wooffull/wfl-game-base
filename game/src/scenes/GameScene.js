"use strict";

var Scene = wfl.display.Scene;

var GameScene = function (canvas) {
  Scene.call(this, canvas);
};

Object.defineProperties(GameScene, {
  /*
  MY_CONST: {
    value: {
      foo: 0,
      bar: 1
    }
  }
  */
});

GameScene.prototype = Object.freeze(Object.create(Scene.prototype, {
  update : {
    value : function (dt) {
      Scene.prototype.update.call(this, dt);
      
      this._handleInput();
    }
  },
  
  _handleInput : {
    value : function () {
      var key         = this.keyboard;
      var justPressed = key.getKeyJustPressed();
    }
  }
}));

module.exports = GameScene;