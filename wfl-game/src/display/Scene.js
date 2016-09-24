"use strict";

var debug = require('../debug');
var datastructure = require('../datastructure');
var geom = require('../geom');
var cameras = require('./cameras');
var backgrounds = require('./backgrounds');

var Scene = function (canvas) {
    this._gameObjectLayers = undefined;

    this._quadtree = new datastructure.Quadtree(0, {
        x      : 0,
        y      : 0,
        width  : canvas.width,
        height : canvas.height
    });

    this.camera = new cameras.Camera();
    this.bg = new backgrounds.StaticBackground();
    this.keyboard = undefined;

    this.player = undefined;

    this.reset();
};

Scene.prototype = Object.freeze(Object.create(Scene.prototype, {
    /**
     * Clears up references used in the scene
     */
    destroy : {
        value : function () { }
    },

    /**
     * Resets the scene
     */
    reset : {
        value : function () {
            this._gameObjectLayers = { 0 : [] };
        }
    },

    /**
     * Gets all game objects in the scene
     */
    getGameObjects : {
        value : function () {
            var gameObjects = [];
            var layers = Object.keys(this._gameObjectLayers);

            for (var i = 0; i < layers.length; i++) {
                gameObjects = gameObjects.concat(this._gameObjectLayers[layers[i]]);
            }

            return gameObjects;
        }
    },

    /**
     * Adds a game object to the scene
     */
    addGameObject : {
        value : function (obj, layerId) {
            // If no layerId, push to the top of the bottom layer
            if (typeof layerId === "undefined") {
                layerId = 0;
            }

            var layer = this._gameObjectLayers[layerId];

            if (!layer) {
                this._gameObjectLayers[layerId] = [];
                layer = this._gameObjectLayers[layerId];
            }

            layer.push(obj);
            obj.layer = layerId;
        }
    },

    /**
     * Removes a game object from the scene
     */
    removeGameObject : {
        value : function (obj, layerId) {
            // If no layerId provided, try to get the layer from the
            // gameObject itself
            if (typeof layerId === "undefined") {
                layerId = obj.layer;
            }

            // If still no layerId, check through all layers...
            if (typeof layerId === "undefined") {
                for (var i = 0; i < this._gameObjectLayers.length; i++) {
                    var layer = this._gameObjectLayers[i];

                    if (layer) {
                        var objIndex = layer.indexOf(obj);

                        if (objIndex >= 0 && objIndex < layer.length) {
                            layer.splice(objIndex, 1);
                            obj.layer = undefined;
                        }
                    }
                }
            } else {
                var layer = this._gameObjectLayers[layerId];

                if (layer) {
                    var objIndex = layer.indexOf(obj);

                    if (objIndex >= 0 && objIndex < layer.length) {
                        layer.splice(objIndex, 1);
                        obj.layer = undefined;
                    }
                }
            }
        }
    },

    /**
     * Updates the scene and all game objects in it
     */
    update : {
        value : function (dt) {
            var gameObjects = this.getGameObjects();

            // Set up quadtree every update (to handle moving objects and allow
            // for collision checking)
            this._quadtree.clear();
            for (var i = 0; i < gameObjects.length; i++) {
                this._quadtree.insert(gameObjects[i]);
            }

            for (var i = gameObjects.length - 1; i >= 0; i--) {
                var obj = gameObjects[i];
                obj.update(dt);
            }

            this.camera.update(dt);
            this._handleCollisions(gameObjects);
        }
    },

    /**
     * Draws the scene and all game objects in it
     */
    draw : {
        value : function (ctx) {
            var gameObjects = this.getGameObjects();

            ctx.save();

            var cameraPos    = this.camera.position;
            var screenWidth  = ctx.canvas.width;
            var screenHeight = ctx.canvas.height;
            var offset       = new geom.Vec2(
                screenWidth  * 0.5,
                screenHeight * 0.5
            );

            var screenDiagonalSquared =
                screenWidth  * screenWidth +
                screenHeight * screenHeight;

            this.bg.draw(ctx, this.camera);

            // Move the screen to the camera's position, then center that
            // position in the middle of the screen
            ctx.translate(offset.x, offset.y);
            ctx.scale(this.camera.zoom, this.camera.zoom);
            ctx.translate(-cameraPos.x, -cameraPos.y);

            for (var i = 0; i < gameObjects.length; i++) {
                var obj = gameObjects[i];
                var objOffset = new geom.Vec2(
                    obj.position.x - cameraPos.x,
                    obj.position.y - cameraPos.y
                );
                var width  = obj.getWidth();
                var height = obj.getHeight();
                
                // If the game object is too far away, don't draw it!
                if (objOffset.x + width  * 0.5 >= -offset.x / this.camera.zoom &&
                    objOffset.x - width  * 0.5 <= offset.x  / this.camera.zoom &&
                    objOffset.y + height * 0.5 >= -offset.y / this.camera.zoom &&
                    objOffset.y - height * 0.5 <= offset.y  / this.camera.zoom) {
                    
                    ctx.save();

                    ctx.translate(obj.position.x, obj.position.y);
                    obj.draw(ctx);

                    if (debug()) {
                        obj.drawDebug(ctx);
                    }

                    ctx.restore();
                }
            }

            ctx.restore();
        }
    },

    /**
     * Handles collisions between game objects
     */
    _handleCollisions : {
        value : function (gameObjects) {
            // Reset collision references
            for (var i = gameObjects.length - 1; i >= 0; i--) {
                var cur = gameObjects[i];
                cur.customData.collisionId = i;
                cur.customData.collisionList = [];
            }

            for (var i = gameObjects.length - 1; i >= 0; i--) {
                var cur = gameObjects[i];

                // Skip over certain objects for collision detection because
                // other objects will check against them later
                if (!cur) {
                    continue;
                }

                var possibleCollisions = [];
                this._quadtree.retrieve(possibleCollisions, cur);

                for (var j = 0; j < possibleCollisions.length; j++) {
                    var obj0 = gameObjects[i];
                    var obj1 = possibleCollisions[j];

                    if (obj0 && obj1 && obj0 !== obj1) {
                        if (obj0.customData.collisionList.indexOf(obj1.customData.collisionId) === -1) {
                            var collisionData = obj0.checkCollision(obj1);

                            if (collisionData.colliding) {
                                obj0.resolveCollision(obj1, collisionData);
                                obj0.customData.collisionList.push(obj1.customData.collisionId);

                                // Switch direction of collision for other object
                                collisionData.direction.multiply(-1);

                                obj1.resolveCollision(obj0, collisionData);
                                obj1.customData.collisionList.push(obj0.customData.collisionId);
                            }
                        }
                    }
                }
            }
        }
    }
}));

module.exports = Scene;