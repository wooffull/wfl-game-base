"use strict";

const PIXI          = require('pixi.js');

const debug         = require('../debug');
const datastructure = require('../datastructure');
const geom          = require('../geom');
const cameras       = require('./cameras');
const backgrounds   = require('./backgrounds');

var Scene = function (canvas) {
  this._stage = new PIXI.Container();
  
  this._gameObjectLayers = undefined;
  this._screenOffset     = new geom.Vec2(canvas.width * 0.5, canvas.height * 0.5);
  this._quadtree         = new datastructure.Quadtree(0, {
    x:      0,
    y:      0,
    width:  canvas.width,
    height: canvas.height
  });
  
  this._lastDrawnGameObjects      = [];
  this._nonPartitionedGameObjects = []; // Cleared every frame
  this._nearbyGameObjects         = [];
  this._buckets                   = [];
  this._bucketConfig              = {
    size:      Math.max(canvas.width, canvas.height) * 0.5,
    minX:      Infinity,
    minY:      Infinity,
    maxX:     -Infinity,
    maxY:     -Infinity,
    forceCalc: false
  };
  
  // Holds object IDs if they've been in a collision and need to resolve
  this._collisionObjectCache = [];

  // List of objects that have been in a collision and need to resolve
  this._collisionObjects = [];

  this.canvas              = canvas;
  this.camera              = new cameras.Camera();
  this.bg                  = new backgrounds.StaticBackground();
  this.keyboard            = undefined;
  this.player              = undefined;
  this.nextScene           = undefined;
  this.collisionIterations = Scene.DEFAULT_MAX_COLLISION_ITERATIONS;

  this.reset();
};

Object.defineProperties(Scene, {
  BUCKET_PADDING_RATIO : {
    value : 0.5
  },
  
  DEFAULT_MAX_COLLISION_ITERATIONS : {
    value : 8
  }
}),

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
   * Prepares the game's scene to change to another scene next frame
   */
  change : {
    value : function (nextScene) {
      this.nextScene = nextScene;
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
      
      // Cache game object's calculations before update is called.
      // The cache calculations are needed in the quad tree (which is
      // updated in update())
      obj.cacheCalculations();
      
      // If the new object won't fit in any bucket, then all buckets
      // will have to be re-partitioned
      if (!this._bucketConfig.forceCalc) {
        if (this._outOfBucketsRange(obj)) {
          this._bucketConfig.forceCalc = true;
        }
      }
      
      this._nonPartitionedGameObjects.push(obj);
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
      
      // Remove the game object from its bucket
      var bucketIndices = this._findSurroundingBucketIndices(obj, 0)[0];
      var bucket        = this._buckets[bucketIndices.x][bucketIndices.y];
      var indexInBucket = bucket.indexOf(obj);
      if (indexInBucket >= 0) {
        bucket.splice(indexInBucket, 1);
      }
      
      // Remove the game object from nearby game objects
      var indexInNearby = this._nearbyGameObjects.indexOf(obj);
      if (indexInNearby >= 0) {
        this._nearbyGameObjects.splice(indexInNearby, 1);
      }
    }
  },
  
  canSee : {
    value : function (obj) {
      var cache      = obj.calculationCache;
      var halfWidth  = cache.aabbWidth  >> 1;
      var halfHeight = cache.aabbHeight >> 1;
      var objOffsetX = cache.x - this.camera.position.x;
      var objOffsetY = cache.y - this.camera.position.y;
      
      // If the game object is too far away, it currently cannot be seen
      return (objOffsetX + halfWidth  >= -this._screenOffset._x / this.camera.zoom &&
              objOffsetX - halfWidth  <=  this._screenOffset._x / this.camera.zoom &&
              objOffsetY + halfHeight >= -this._screenOffset._y / this.camera.zoom &&
              objOffsetY - halfHeight <=  this._screenOffset._y / this.camera.zoom);
    }
  },

  /**
   * Updates the scene and all game objects in it
   */
  update : {
    value : function (dt) {
      this._updateBuckets();
      this.camera.update(dt);
      
      this._nearbyGameObjects = this._findSurroundingGameObjects(this.camera);
      var nearbyObjectLength  = this._nearbyGameObjects.length;
      
      for (var i = 0; i < nearbyObjectLength; i++) {
        if (this._nearbyGameObjects[i].solid) {
          this._quadtree.insert(this._nearbyGameObjects[i]);
        }
      }

      for (var i = 0; i < nearbyObjectLength; i++) {
        this._nearbyGameObjects[i].update(dt);
      }
      
      // Seems to be faster to have this loop in addition to the update loop above
      for (var i = 0; i < nearbyObjectLength; i++) {
        this._nearbyGameObjects[i].cacheCalculations();
      }
      
      this._handleCollisions(this._nearbyGameObjects);
    }
  },

  /**
   * Draws the scene and all game objects in it
   */
  draw : {
    value : function (renderer) {
      // Clear all children then add only the ones that can be seen
      this._stage.children.length = 0;
      this._lastDrawnGameObjects  = this._findSurroundingGameObjects(this.camera, 2).sort(
        (a, b) => a.layer - b.layer
      );
      
      // This seems to perform faster than using filter()
      for (let obj of this._lastDrawnGameObjects) {
        if (this.canSee(obj)) {
          this._stage.addChild(obj);
        }
      }
    }
  },
  
  drawDebug : {
    value: function (renderer, options) {
      var debugContainer = debug.getContainer();
      
      // This seems to perform faster than using filter()
      for (let obj of this._lastDrawnGameObjects) {
        if (options[debug.Flag.AABB]) {
          obj.drawDebugAABB(debugContainer);
        }
        if (options[debug.Flag.VERTICES]) {
          obj.drawDebugVertices(debugContainer);
        }
      }
      
      if (options[debug.Flag.QUADTREE]) {
        this._quadtree.drawDebugQuadtree(debugContainer);
      }
      
      this._stage.addChild(debugContainer);
    }
  },
  
  _beforeDraw : {
    value : function (renderer) {
      this._stage.x = renderer.width  * 0.5 - this.camera.position.x * this.camera.zoom;
      this._stage.y = renderer.height * 0.5 - this.camera.position.y * this.camera.zoom;
      this._stage.scale.set(this.camera.zoom);
      
      // Update the screen offset
      this._screenOffset._x = this.canvas.width  * 0.5;
      this._screenOffset._y = this.canvas.height * 0.5;
    }
  },
  
  _afterDraw : {
    value : function (renderer) {
    }
  },
  
  _outOfBucketsRange: {
    value: function (gameObject) {
      var cache      = gameObject.calculationCache;
      var halfWidth  = cache.aabbWidth  >> 1;
      var halfHeight = cache.aabbHeight >> 1;
      var x          = cache.x;
      var y          = cache.y;
      var bucketMinX = this._bucketConfig.minX;
      var bucketMaxX = this._bucketConfig.maxX;
      var bucketMinY = this._bucketConfig.minY;
      var bucketMaxY = this._bucketConfig.maxY;
      
      return (x - halfWidth  <= bucketMinX ||
              x + halfWidth  >= bucketMaxX ||
              y - halfHeight <= bucketMinY ||
              y + halfHeight >= bucketMaxY);
    }
  },
  
  _updateBuckets: {
    value: function () {
      var forceCalc = this._bucketConfig.forceCalc;

      // Check if any nearby game objects are out of any bucket's range
      if (!forceCalc) {
        for (const obj of this._nearbyGameObjects) {
          if (this._outOfBucketsRange(obj)) {
            forceCalc = true;
            break;
          }
        }
      }

      // If all buckets need to be calculated, do so
      if (forceCalc) {
        var all = this.getGameObjects();
        this._createBuckets(all);
        this._partitionGameObjectsIntoBuckets(all);
        
      // Otherwise, only update the buckets near the camera
      } else {
        var neighborBucketIndices = this._findSurroundingBucketIndices(this.camera);

        for (var i = 0; i < neighborBucketIndices.length; i++) {
          var bucketX = neighborBucketIndices[i].x;
          var bucketY = neighborBucketIndices[i].y;
          this._buckets[bucketX][bucketY] = [];
        }

        this._partitionGameObjectsIntoBuckets(this._nearbyGameObjects.concat(this._nonPartitionedGameObjects));
      }
      
      this._nonPartitionedGameObjects = [];
      this._bucketConfig.forceCalc = false;
      
      // Reset the quad tree (instead of creating a new one every frame)
      this._quadtree.clear();
      this._quadtree.bounds.x      = this._bucketConfig.minX;
      this._quadtree.bounds.y      = this._bucketConfig.minY;
      this._quadtree.bounds.width  = this._bucketConfig.maxX - this._bucketConfig.minX;
      this._quadtree.bounds.height = this._bucketConfig.maxY - this._bucketConfig.minY;
    }
  },
  
  _createBuckets: {
    value: function (gameObjects) {
      this._buckets = [];
      
      var minX             =  Infinity;
      var minY             =  Infinity;
      var maxY             = -Infinity;
      var maxX             = -Infinity;
      var gameObjectLength = gameObjects.length;

      // Find min and max positions
      for (var i = 0; i < gameObjectLength; i++) {
        var cache = gameObjects[i].calculationCache;

        minX = Math.min(cache.x, minX);
        minY = Math.min(cache.y, minY);
        maxX = Math.max(cache.x, maxX);
        maxY = Math.max(cache.y, maxY);
      }

      var dx = maxX - minX;
      var dy = maxY - minY;
      
      // Scale up the dx and dy to allow "padding" for the buckets.
      // This will ideally reduce the amount of updates needed for buckets.
      minX -= dx * Scene.BUCKET_PADDING_RATIO;
      maxX += dx * Scene.BUCKET_PADDING_RATIO;
      minY -= dy * Scene.BUCKET_PADDING_RATIO;
      maxY += dy * Scene.BUCKET_PADDING_RATIO;
      dx *= 1 + 2 * Scene.BUCKET_PADDING_RATIO;
      dy *= 1 + 2 * Scene.BUCKET_PADDING_RATIO;
      
      var totalBucketsHorizontal = Math.max(Math.ceil(dx / this._bucketConfig.size), 1);
      var totalBucketsVertical   = Math.max(Math.ceil(dy / this._bucketConfig.size), 1);

      for (var i = 0; i < totalBucketsHorizontal; i++) {
        this._buckets[i] = [];

        for (var j = 0; j < totalBucketsVertical; j++) {
          this._buckets[i][j] = [];
        }
      }

      // Finally set values for bucket size
      this._bucketConfig.minX = minX;
      this._bucketConfig.minY = minY;
      this._bucketConfig.maxX = maxX;
      this._bucketConfig.maxY = maxY;
    }
  },
  
  _partitionGameObjectsIntoBuckets: {
    value: function (gameObjects) {
      var gameObjectLength       = gameObjects.length;
      var minX                   = this._bucketConfig.minX;
      var minY                   = this._bucketConfig.minY;
      var maxY                   = this._bucketConfig.maxY;
      var maxX                   = this._bucketConfig.maxX;
      var dx                     = maxX - minX;
      var dy                     = maxY - minY;
      var totalBucketsHorizontal = Math.max(Math.ceil(dx / this._bucketConfig.size), 1);
      var totalBucketsVertical   = Math.max(Math.ceil(dy / this._bucketConfig.size), 1);

      // Add game objects to the bucket they're located in
      var bucketRatioX = (totalBucketsHorizontal - 1) / dx;
      var bucketRatioY = (totalBucketsVertical   - 1) / dy;
      for (var i = 0; i < gameObjectLength; i++) {
        var cache   = gameObjects[i].calculationCache;
        var bucketX = bucketRatioX * (cache.x - minX) || 0;
        var bucketY = bucketRatioY * (cache.y - minY) || 0;

        // Optimization: Math.floor(x) => x | 0
        this._buckets[bucketX | 0][bucketY | 0].push(gameObjects[i]);
      }
    }
  },
  
  _findSurroundingBucketIndices : {
    value : function (gameObject, bucketRadius) {
      if (typeof bucketRadius === "undefined") bucketRadius = 1;

      var totalBucketsHorizontal = this._buckets.length;
      var totalBucketsVertical   = this._buckets[0].length;
      
      // The "||" is needed for the camera, which is not actually a GameObject.
      // TODO: Make camera a GameObject?
      var cache   = gameObject.calculationCache || gameObject.position;
      var bucketX = Math.floor((totalBucketsHorizontal - 1) * (cache.x - this._bucketConfig.minX) / (this._bucketConfig.maxX - this._bucketConfig.minX));
      var bucketY = Math.floor((totalBucketsVertical   - 1) * (cache.y - this._bucketConfig.minY) / (this._bucketConfig.maxY - this._bucketConfig.minY));

      if (isNaN(bucketX)) bucketX = 0;
      if (isNaN(bucketY)) bucketY = 0;

      var nearBucketsIndices = [];

      for (var i = -bucketRadius; i <= bucketRadius; i++) {
        var refBucketX = bucketX + i;

        for (var j = -bucketRadius; j <= bucketRadius; j++) {
          var refBucketY = bucketY + j;

          if (refBucketX >= 0 && refBucketY >= 0 && refBucketX < totalBucketsHorizontal && refBucketY < totalBucketsVertical) {
            nearBucketsIndices.push({x: refBucketX, y: refBucketY});
          }
        }
      }

      return nearBucketsIndices;
    }
  },
  
  _findSurroundingBuckets : {
    value : function (gameObject, bucketRadius) {
      var nearBucketIndices     = this._findSurroundingBucketIndices(gameObject, bucketRadius);
      var nearBucketIndexLength = nearBucketIndices.length;
      var nearBuckets           = [];

      for (var i = 0; i < nearBucketIndexLength; i++) {
        var x = nearBucketIndices[i].x;
        var y = nearBucketIndices[i].y;
        nearBuckets.push(this._buckets[x][y]);
      }

      return nearBuckets;
    }
  },
  
  _findSurroundingGameObjects : {
    value : function (gameObject, bucketRadius) {
      var nearBuckets      = this._findSurroundingBuckets(gameObject, bucketRadius);
      var nearBucketLength = nearBuckets.length;
      var gameObjects      = [];

      for (var i = 0; i < nearBucketLength; i++) {
        gameObjects = gameObjects.concat(nearBuckets[i]);
      }

      return gameObjects;
    }
  },
  
  /**
   * Resets collision data to default values before any collisions are checked
   */
  _resetCollisionData: {
    value: function (gameObjects) {
      var gameObjectLength = gameObjects.length;
      
      for (var i = 0; i < gameObjectLength; i++) {
        var cur = gameObjects[i];
        cur.customData.collisionList      = [];
        cur.collisionDisplacementSum._x   = 0;
        cur.collisionDisplacementSum._y   = 0;
        cur.collisionSurfaceImpulseSum._x = 0;
        cur.collisionSurfaceImpulseSum._y = 0;
        cur.collisionMomentumSum._x       = 0;
        cur.collisionMomentumSum._y       = 0;
      }
      
      this._collisionObjectCache = [];
      this._collisionObjects     = [];
    }
  },
  
  /**
   * Adjusts acceleration, velocity, and position to move out of collisions
   */
  _resolveCollisions: {
    value: function () {
      // Move the objects to resolve collisions
      var collisionObjectLength = this._collisionObjects.length;
      for (var i = 0; i < collisionObjectLength; i++) {
        this._collisionObjects[i].resolveCollisions();
      }
    }
  },
  
  /**
   *
   * Source for conservation of momentum:
   * http://www.real-world-physics-problems.com/elastic-collision.html
   */
  _finalizeCollision: {
    value: function (obj0, obj1, collisionData) {
      // If objects are colliding, determine how much each should
      // move (based on mass: the heavier object will move less)
      var totalDepth    = collisionData.contactPoint.depth;
      var direction     = collisionData.direction;
      var m0            = obj0.mass;
      var m1            = obj1.mass;
      var depth0        = 0;
      var depth1        = 0;
      var displacement0 = {x: 0, y: 0};
      var displacement1 = {x: 0, y: 0};
      var v0            = obj0.velocity.clone();
      var v1            = obj1.velocity.clone();
      var restitution   = obj0.restitution * obj1.restitution;

      // Fixed objects are treated as having an infinite mass
      if (obj0.fixed) m0 = Infinity;
      if (obj1.fixed) m1 = Infinity;

      // Non-fixed objects can be pushed out to resolve
      // collisions; fixed objects cannot
      if (!obj0.fixed) {
        depth0 = totalDepth * (1 - m0 / (m0 + m1));
      }
      if (!obj1.fixed) {
        depth1 = totalDepth * (1 - m1 / (m0 + m1));
      }

      // Limit each object's movement up to its depth's value.
      // This will prevent upcoming collision resolutions that
      // produce similar values from doubling up on depth values
      if (depth0 !== 0) {
        var curSum          = obj0.collisionDisplacementSum;
        var sumDotDirection = curSum.x * direction.x + curSum.y * direction.y;
        sumDotDirection *= -1;

        if (sumDotDirection < depth0) {
          var depthLimitRatio = 1 - sumDotDirection / depth0;
          displacement0.x = direction.x * -depth0;
          displacement0.y = direction.y * -depth0;

          // Move in the direction as much as possible
          obj0.collisionDisplacementSum.x += displacement0.x * depthLimitRatio;
          obj0.collisionDisplacementSum.y += displacement0.y * depthLimitRatio;
          
          // Conservation of momentum
          // Distribute velocities between the two bodies
          if (m1 === Infinity) {
            var v = geom.Vec2.add(
              v0.clone().multiply(-1),
              v1.clone().multiply(2)
            );
          } else {
            var v = geom.Vec2.add(
              v0.clone().multiply((m0 - m1) / (m0 + m1)),
              v1.clone().multiply(2 * m1 / (m0 + m1))
            );
          }
          obj0.collisionMomentumSum._x += v._x * restitution;
          obj0.collisionMomentumSum._y += v._y * restitution;

          if (!this._collisionObjectCache[obj0.wflId]) {
            this._collisionObjectCache.push(obj0.wflId);
            this._collisionObjects.push(obj0);
          }
        }
      }

      // Flip direction before limiting obj1's depth movement too
      direction.x *= -1;
      direction.y *= -1;

      if (depth1 !== 0) {
        var curSum          = obj1.collisionDisplacementSum;
        var sumDotDirection = curSum.x * direction.x + curSum.y * direction.y;
        sumDotDirection *= -1;

        if (sumDotDirection < depth1) {
          var depthLimitRatio = 1 - sumDotDirection / depth1;
          displacement1.x = direction.x * -depth1;
          displacement1.y = direction.y * -depth1;

          // Move in the direction as much as possible
          obj1.collisionDisplacementSum.x += displacement1.x * depthLimitRatio;
          obj1.collisionDisplacementSum.y += displacement1.y * depthLimitRatio;
          
          // Conservation of momentum
          // Distribute velocities between the two bodies
          if (m0 === Infinity) {
            var v = geom.Vec2.add(
              v1.clone().multiply(-1),
              v0.clone().multiply(2)
            );
          } else {
            var v = geom.Vec2.add(
              v1.clone().multiply((m1 - m0) / (m1 + m0)),
              v0.clone().multiply(2 * m0 / (m1 + m0))
            );
          }
          obj1.collisionMomentumSum._x += v._x * restitution;
          obj1.collisionMomentumSum._y += v._y * restitution;

          if (!this._collisionObjectCache[obj1.wflId]) {
            this._collisionObjectCache.push(obj1.wflId);
            this._collisionObjects.push(obj1);
          }
        }
      }

      obj0.onCollide(obj1);
      obj1.onCollide(obj0);
    }
  },
  
  _findAllCollisions: {
    value: function (gameObjects) {
      var gameObjectLength = gameObjects.length;
      
      // Check collisions
      for (var i = 0; i < gameObjectLength; i++) {
        var obj0 = gameObjects[i];

        var possibleCollisions = [];
        this._quadtree.retrieve(possibleCollisions, obj0);
        var possibleCollisionLength = possibleCollisions.length;

        // Sort the objects so that the nearest ones are handled first
        possibleCollisions.sort((a, b) => {
          var aDistSquared = geom.Vec2.subtract(obj0.position, a.position)
                            .getMagnitudeSquared();
          var bDistSquared = geom.Vec2.subtract(obj0.position, b.position)
                            .getMagnitudeSquared();

          return aDistSquared - bDistSquared;
        });

        for (var j = 0; j < possibleCollisionLength; j++) {
          var obj1 = possibleCollisions[j];

          if (obj1 && obj0 !== obj1) {
            // (Optimization) Determine if a collision check is necessary.
            // - If both objects aren't solid, they cannot collide.
            // - If both objects are fixed, they can never collide.
            if ((obj0.solid || obj1.solid) && (!obj0.fixed || !obj1.fixed)) {
              if (obj0.customData.collisionList.indexOf(obj1.wflId) === -1) {
                // Add each object to each other's list so this check doesn't
                // happen again
                obj0.customData.collisionList.push(obj1.wflId);
                obj1.customData.collisionList.push(obj0.wflId);

                // Check for custom collision filters before proceeding
                if (!obj0.canCollide(obj1) || !obj1.canCollide(obj0)) {
                  continue;
                }

                var collisionData = obj0.checkCollision(obj1);

                if (collisionData.colliding) {
                  // TODO: Handle not having a contact point (like when one
                  // object is inside another)
                  if (!collisionData.contactPoint) {
                    continue;
                  }
                  
                  this._finalizeCollision(obj0, obj1, collisionData);
                }
              }
            }
          }
        }
      }
    }
  },

  /**
   * Handles collisions between game objects
   */
  _handleCollisions : {
    value : function (gameObjects) {
      // Only directly check collisions for objects that aren't fixed
      var nonFixedObjects = gameObjects.filter((obj) => !obj.fixed);

      for (var k = 0; k < this.collisionIterations; k++) {
        this._resetCollisionData(gameObjects);
        this._findAllCollisions(nonFixedObjects);
        this._resolveCollisions();

        // Only do more collision iterations if something has collided this
        // frame
        if (this._collisionObjects.length === 0) {
          break;
        }
      }
    }
  },
  
  _onResize: {
    value: function (e) {
      this._bucketConfig.forceCalc = true;
      this._bucketConfig.size      = Math.max(window.innerWidth, window.innerHeight) * 0.5;
    }
  }
}));

module.exports = Scene;