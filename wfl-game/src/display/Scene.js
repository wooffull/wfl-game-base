"use strict";

const PIXI          = require('pixi.js');

const debug         = require('../debug');
const datastructure = require('../datastructure');
const geom          = require('../geom');
const cameras       = require('./cameras');
const backgrounds   = require('./backgrounds');
const PhysicsObject = require('../core/entities');

var Scene = function (canvas) {
  this._stage = new PIXI.Container();
  
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
      var canvas = this.canvas;
      
      this._stage.removeChildren();
      this._gameObjectLayers = { 0 : [] };
      
      this._screenOffset     = new geom.Vec2(canvas.width * 0.5, canvas.height * 0.5);
      this._quadtree         = new datastructure.Quadtree(0, {
        x:      0,
        y:      0,
        width:  canvas.width,
        height: canvas.height
      });

      // Updated every frame regardless of camera position
      this._persistingGameObjects     = [];

      this._lastDrawnGameObjects      = [];
      this._nonPartitionedGameObjects = []; // Cleared every frame
      this._nearbyGameObjects         = [];
      this._gameObjectsToUpdate       = [];
      this._buckets                   = [[]];
      this._bucketConfig              = {
        size:      Math.max(canvas.width, canvas.height) * 0.5,
        minX:      Infinity,
        minY:      Infinity,
        maxX:     -Infinity,
        maxY:     -Infinity,
        forceCalc: false
      };

      // List of objects that have been in a collision and need to resolve
      this._collisionObjects = [];

      // Holds object IDs if they've been in a collision and need to resolve
      this._collisionObjectCache = {};

      // Cache of distances from obj0 to obj0, where the key is
      // obj0.wflId + "_" + obj01.wflId
      this._distancePairCache  = {};
      this._quadtreeCache      = {};
      this._collisionPairCache = {};
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
    value : function (obj, layerId, persists = false) {
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
      
      // If this game object needs to be updated every frame, we'll add it
      // to another array for quick reference
      if (persists) {
        this._persistingGameObjects.push(obj);
      }
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
      
      // Remove the game object from persisting game objects
      var indexInPersisting = this._persistingGameObjects.indexOf(obj);
      if (indexInPersisting >= 0) {
        this._persistingGameObjects.splice(indexInPersisting, 1);
      }
      
      // Remove the game object from nearby game objects
      var indexInNearby = this._nearbyGameObjects.indexOf(obj);
      if (indexInNearby >= 0) {
        this._nearbyGameObjects.splice(indexInNearby, 1);
      }
      
      // Remove the game object from updating game objects
      var indexInUpdating = this._gameObjectsToUpdate.indexOf(obj);
      if (indexInUpdating >= 0) {
        this._gameObjectsToUpdate.splice(indexInUpdating, 1);
      }
    }
  },
  
  canSee : {
    value : function (obj) {
      var {aabbHalfWidth, aabbHalfHeight, x, y} = obj.calculationCache;
      var objOffsetX                            = x - this.camera.position.x;
      var objOffsetY                            = y - this.camera.position.y;
      
      // If the game object is too far away, it currently cannot be seen
      return (objOffsetX + aabbHalfWidth  >= -this._screenOffset._x / this.camera.zoom &&
              objOffsetX - aabbHalfWidth  <=  this._screenOffset._x / this.camera.zoom &&
              objOffsetY + aabbHalfHeight >= -this._screenOffset._y / this.camera.zoom &&
              objOffsetY - aabbHalfHeight <=  this._screenOffset._y / this.camera.zoom);
    }
  },

  /**
   * Updates the scene and all game objects in it
   */
  update : {
    value : function (dt) {
      this._updateBuckets();
      this.camera.update(dt);
      
      this._nearbyGameObjects   = this._findSurroundingGameObjects(this.camera);
      this._gameObjectsToUpdate = this.getGameObjectsToUpdate();
      
      for (let obj of this._gameObjectsToUpdate) {
        if (obj.solid) this._quadtree.insert(obj);
      }

      for (let obj of this._gameObjectsToUpdate) {
        obj.update(dt);
      }
      
      // Seems to be faster to have this loop in addition to the update loop above
      for (let obj of this._gameObjectsToUpdate) {
        obj.cacheCalculations();
      }
      
      this._handleCollisions(this._gameObjectsToUpdate);
      this._handleOverlaps(this._gameObjectsToUpdate);
    }
  },
  
  getGameObjectsToUpdate : {
    value : function () {
      let neighborBucketIndices = 
        this._findSurroundingBucketIndices(this.camera);
      
      // Add all persisting game objects that aren't in nearby buckets
      return this._nearbyGameObjects.concat(
        this._persistingGameObjects.filter((obj) => {
          // Do not keep the game object if its containing bucket is nearby
          for (let bucket of neighborBucketIndices) {
            if (obj._bucketPosition.x === bucket.x &&
                obj._bucketPosition.y === bucket.y) {
              return false;
            }
          }
          
          // Otherwise, keep it
          return true;
        })
      );
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
          // Optimization for addChild
          obj.parent = this._stage;
          obj.transform._parentId = -1;
          this._stage._boundsID++;
          this._stage.children.push(obj);
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
      var {minX, maxX, minY, maxY}              = this._bucketConfig;
      var {aabbHalfWidth, aabbHalfHeight, x, y} =
          gameObject.calculationCache;
      
      return (x - aabbHalfWidth  <= minX ||
              x + aabbHalfWidth  >= maxX ||
              y - aabbHalfHeight <= minY ||
              y + aabbHalfHeight >= maxY);
    }
  },
  
  _updateBuckets: {
    value: function () {
      var forceCalc = this._bucketConfig.forceCalc;

      // Check if any nearby game objects are out of any bucket's range
      if (!forceCalc) {
        for (const obj of this._gameObjectsToUpdate) {
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

        this._partitionGameObjectsIntoBuckets(this._gameObjectsToUpdate.concat(this._nonPartitionedGameObjects));
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
      
      var minX =  Infinity;
      var minY =  Infinity;
      var maxY = -Infinity;
      var maxX = -Infinity;

      // Find min and max positions
      for (let obj of gameObjects) {
        var cache = obj.calculationCache;

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
      
      for (let obj of gameObjects) {
        var cache   = obj.calculationCache;
        
        // Optimization: Math.floor(x) => x | 0
        var bucketX = (bucketRatioX * (cache.x - minX) | 0) || 0;
        var bucketY = (bucketRatioY * (cache.y - minY) | 0) || 0;
        
        // Update the bucket data for the game object
        obj._bucketPosition.x = bucketX;
        obj._bucketPosition.y = bucketY;

        this._buckets[bucketX][bucketY].push(obj);
      }
    }
  },
  
  _findSurroundingBucketIndices : {
    value : function (gameObject, bucketRadius = 1) {
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
      var nearBucketIndices = this._findSurroundingBucketIndices(gameObject, bucketRadius);
      var nearBuckets       = [];

      for (let {x, y} of nearBucketIndices) {
        nearBuckets.push(this._buckets[x][y]);
      }

      return nearBuckets;
    }
  },
  
  _findSurroundingGameObjects : {
    value : function (gameObject, bucketRadius) {
      var nearBuckets = this._findSurroundingBuckets(gameObject, bucketRadius);
      var gameObjects = [];

      //for (var i = 0; i < nearBucketLength; i++) {
      for (let bucket of nearBuckets) {  
        gameObjects = gameObjects.concat(bucket);
      }

      return gameObjects;
    }
  },
  
  /**
   * Resets collision data to default values before any collisions are checked
   */
  _resetCollisionData: {
    value: function (gameObjects) {
      for (let obj of gameObjects) {
        obj._previousVelocity._x          = obj.velocity._x;
        obj._previousVelocity._y          = obj.velocity._y;
        obj.collisionDisplacementSum._x   = 0;
        obj.collisionDisplacementSum._y   = 0;
        obj.collisionSurfaceImpulseSum._x = 0;
        obj.collisionSurfaceImpulseSum._y = 0;
        obj.collisionMomentumSum._x       = 0;
        obj.collisionMomentumSum._y       = 0;
      }
      
      this._collisionObjects     = [];
      this._collisionObjectCache = {};
      this._collisionPairCache   = {};
      this._distancePairCache    = {};
      this._quadtreeCache        = {};
    }
  },
  
  /**
   * Adjusts acceleration, velocity, and position to move out of collisions
   */
  _resolveCollisions: {
    value: function () {
      for (let obj of this._collisionObjects) {
        obj.resolveCollisions();
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
      var totalDepth    = collisionData.contactPoint.depth + 0.001;
      var direction     = collisionData.direction;
      var m0            = obj0.mass;
      var m1            = obj1.mass;
      var depth0        = 0;
      var depth1        = 0;
      var displacement0 = {x: 0, y: 0};
      var displacement1 = {x: 0, y: 0};
      var restitution   = obj0.restitution * obj1.restitution;
      var v0            = {
        x: obj0._previousVelocity._x,
        y: obj0._previousVelocity._y
      };
      var v1            = {
        x: obj1._previousVelocity._x,
        y: obj1._previousVelocity._y
      };

      // Fixed objects are treated as having an infinite mass
      if (obj0.fixed) m0 = Infinity;
      if (obj1.fixed) m1 = Infinity;

      // Non-fixed objects can be pushed out to resolve
      // collisions; fixed objects cannot
      if (!obj0.fixed && !obj1.fixed) {
        depth0 = depth1 = totalDepth * 0.5;
      } else if (!obj0.fixed) {
        depth0 = totalDepth;
      } else {
        depth1 = totalDepth;
      }

      // Move the object out by its portion of penetration depth
      if (depth0 !== 0) {
        // Move in the direction as much as possible
        obj0.collisionDisplacementSum.x -= direction.x * depth0;
        obj0.collisionDisplacementSum.y -= direction.y * depth0;

        if (!this._collisionObjectCache[obj0.wflId]) {
          this._collisionObjectCache[obj0.wflId] = true;
          
          if (!obj0.fixed) {
            this._collisionObjects.push(obj0);
          }
        }
        
        // Conservation of momentum
        // Distribute velocities between the two bodies
        var momentum0 = {x: 0, y: 0};
        if (m1 === Infinity) {
          momentum0.x = 2 * v1.x - v0.x;
          momentum0.y = 2 * v1.y - v0.y;
        } else {
          momentum0.x =
            v0.x * (m0 - m1) / (m0 + m1) +
            v1.x * 2 * m1 / (m0 + m1);
          momentum0.y =
            v0.y * (m0 - m1) / (m0 + m1) +
            v1.y * 2 * m1 / (m0 + m1);
        }
        obj0.collisionMomentumSum._x += momentum0.x * restitution;
        obj0.collisionMomentumSum._y += momentum0.y * restitution;
      }

      // Flip direction before limiting obj1's depth movement too
      direction.x *= -1;
      direction.y *= -1;

      // Move the object out by its portion of penetration depth
      if (depth1 !== 0) {
        // Move in the direction as much as possible
        obj1.collisionDisplacementSum.x -= direction.x * depth1;
        obj1.collisionDisplacementSum.y -= direction.y * depth1;
        
        if (!this._collisionObjectCache[obj1.wflId]) {
          this._collisionObjectCache[obj1.wflId] = true;
          
          if (!obj1.fixed) {
            this._collisionObjects.push(obj1);
          }
        }
        
        // Conservation of momentum
        // Distribute velocities between the two bodies
        var momentum1 = {x: 0, y: 0};
        if (m0 === Infinity) {
          momentum1.x = 2 * v0.x - v1.x;
          momentum1.y = 2 * v0.y - v1.y;
        } else {
          momentum1.x =
            v1.x * (m1 - m0) / (m1 + m0) +
            v0.x * 2 * m0 / (m1 + m0);
          momentum1.y =
            v1.y * (m1 - m0) / (m1 + m0) +
            v0.y * 2 * m0 / (m1 + m0);
        }
        obj1.collisionMomentumSum._x += momentum1.x * restitution;
        obj1.collisionMomentumSum._y += momentum1.y * restitution;
      }

      // Flip direction before limiting obj1's depth movement too
      direction.x *= -1;
      direction.y *= -1;
      obj0.onCollide(obj1, collisionData);
      // Flip direction before limiting obj1's depth movement too
      direction.x *= -1;
      direction.y *= -1;
      obj1.onCollide(obj0, collisionData);
      
      // Now resolve collisions
      obj0.resolveCollisions();
      obj1.resolveCollisions();
    }
  },
  
  _findAllCollisions: {
    value: function (gameObjects) {
      var distancePairCache  = this._distancePairCache;
      var collisionPairCache = this._collisionPairCache;
      var quadtreeCache      = this._quadtreeCache;
      
      for (let obj0 of gameObjects) {
        var wflId0             = obj0.wflId;
        var possibleCollisions = quadtreeCache[wflId0];

        // Sort the objects so that the nearest ones are handled first
        possibleCollisions.sort((a, b) => {
          return distancePairCache[wflId0 + "_" + a.wflId] -
                 distancePairCache[wflId0 + "_" + b.wflId];
        });
        
        for (let obj1 of possibleCollisions) {
          var wflId1       = obj1.wflId;
          var pairHashKeyA = wflId0 + "_" + wflId1;

          if (!this._collisionPairCache[pairHashKeyA]) {
            var pairHashKeyB = wflId1 + "_" + wflId0;
            collisionPairCache[pairHashKeyA] = true;
            collisionPairCache[pairHashKeyB] = true;

            var collisionData = obj0.checkCollision(obj1);
            if (collisionData.colliding) {
              // TODO: Handle not having a contact point (like when one
              // object is inside another)
              if (collisionData.contactPoint) {
                this._finalizeCollision(obj0, obj1, collisionData);
              }
            }
          }
        }
      }
    }
  },
  
  /**
   * Cache quadtree and distance data for objects that need to be checked for
   * collisions
   */
  _cacheData : {
    value : function (gameObjects) {
      var needNarrowPhase    = [];
      var distancePairCache  = {};
      var collisionPairCache = {};
      var quadtreeCache      = {};
      var quadtree           = this._quadtree;
      var wflId0             = -1;
      var wflId1             = -1;
      
      for (let obj0 of gameObjects) {
        var cache              = obj0.calculationCache;
        var px0                = cache.px;
        var py0                = cache.py;
        var possibleCollisions = [];
        var probableCollisions = [];

        wflId0 = obj0.wflId;
        quadtree.retrieve(possibleCollisions, obj0);

        for (let obj1 of possibleCollisions) {
          // If the object passes the broad phase check, it will be
          // considered for further collision analysis later on
          if (obj0.checkBroadPhaseCollision(obj1) &&
              obj0.canCollide(obj1) &&
              obj1.canCollide(obj0) &&
              wflId0 !== (wflId1 = obj1.wflId)) {

            var pairHashKeyA = wflId0 + "_" + wflId1;
            if (distancePairCache[pairHashKeyA] === undefined) {
              var {px, py}     = obj1.calculationCache;
              var pairHashKeyB = wflId1 + "_" + wflId0;
              var distSquared  =
                  (px0 - px) * (px0 - px) + 
                  (py0 - py) * (py0 - py);

              distancePairCache[pairHashKeyA]  = distSquared;
              distancePairCache[pairHashKeyB]  = distSquared;
              collisionPairCache[pairHashKeyA] = false;
              collisionPairCache[pairHashKeyB] = false;
              probableCollisions.push(obj1);
            }
          }
        }
        
        // Keep a reference to the probable collisions with this object
        if (probableCollisions.length > 0) {
          // Keep a reference to the probable collisions with this object
          quadtreeCache[wflId0] = probableCollisions;
          needNarrowPhase.push(obj0);
        }
      }
      
      this._distancePairCache  = distancePairCache;
      this._collisionPairCache = collisionPairCache;
      this._quadtreeCache      = quadtreeCache;
      
      return needNarrowPhase;
    }
  },

  /**
   * Handles collisions between game objects
   */
  _handleCollisions : {
    value : function (gameObjects) {
      // Only directly check collisions for objects that aren't fixed
      var needBroadPhase  = gameObjects.filter(
        (obj) => !obj.fixed && obj.solid
      );
      var needNarrowPhase = [];

      for (var k = 0; k < this.collisionIterations; k++) {
        this._resetCollisionData(needBroadPhase);
        
        needNarrowPhase = this._cacheData(needBroadPhase);
        this._findAllCollisions(needNarrowPhase);

        // Only do more collision iterations if something has collided this
        // frame
        if (this._collisionObjects.length === 0) {
          break;
        }
        
        // Only continue to resolve collisions for objects that have just
        // collided. If it wasn't just in a collision, it won't need to resolve
        // a collision now.
        needBroadPhase = this._collisionObjects;
      }
    }
  },
  
  _handleOverlaps: {
    value: function (gameObjects) {
      var quadtreeCache = this._quadtreeCache;
      var quadtree      = this._quadtree;
      
      // Only directly check overlaps for objects that allow overlap events
      var availableObjects = gameObjects.filter(
        (obj) => obj.allowOverlapEvents
      );
      
      for (let obj0 of availableObjects) {
        var cache              = obj0.calculationCache;
        var possibleCollisions = [];
        var wflId0             = obj0.wflId;
        
        if (quadtreeCache[wflId0]) {
          possibleCollisions = quadtreeCache[wflId0];
        } else {
          quadtree.retrieve(possibleCollisions, obj0);
        }
        
        for (let obj1 of possibleCollisions) {
          if (obj0.checkBroadPhaseCollision(obj1)) {
            obj0.onOverlap(obj1);
            
            if (obj1.allowOverlapEvents) {
              obj1.onOverlap(obj0);
            }
          }
        }
      }
    }
  },
  
  _onResize: {
    value: function (e) {
      this._bucketConfig.forceCalc = true;
      this._bucketConfig.size      = Math.ceil(
        Math.max(window.innerWidth, window.innerHeight) * 0.5 /
        this.camera.zoom
      );
    }
  }
}));

module.exports = Scene;