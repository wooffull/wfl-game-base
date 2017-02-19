"use strict";

var geom          = wfl.geom;
var util          = require('../util');
var Assets        = util.Assets;
var GameObject    = wfl.core.entities.GameObject;
var PhysicsObject = wfl.core.entities.PhysicsObject;

var Player = function () {
    PhysicsObject.call(this);
    
    // Reference graphics
    /*
    this.myGraphic1 = Assets.get(Assets.MY_GRAPHIC).texture;
    this.myGraphic2 = Assets.get(Assets.MY_GRAPHIC).texture;
    */
    
    // Create state
    /*
    this.stateIdle = GameObject.createState();
    
    this.frameIdle1 = GameObject.createFrame(this.myGraphic1, 15);
    this.frameIdle2 = GameObject.createFrame(this.myGraphic2, 15);
    this.stateIdle.addFrame(this.frameIdle1);
    this.stateIdle.addFrame(this.frameIdle2);
    */
    
    // Add states
    /*
    this.addState(Player.STATE.IDLE, this.stateIdle);
    */
    
    // Set constants
    this.maxSpeed        = Player.MAX_SPEED;
    this.maxAcceleration = Player.MAX_ACCELERATION;
};

Object.defineProperties(Player, {
  MAX_SPEED : {
    value : 1
  },
  
  MAX_ACCELERATION : {
    value : 4
  },
  
  SPRINT_MAX_SPEED : {
    value : 2
  },
  
  SPRINT_BOOST_ACCELERATION : {
    value : 6
  },

  BOOST_ACCELERATION : {
    value : .5
  },
  STATE : {
    value : {
      IDLE : "IDLE",
    }
  }
});

Player.prototype = Object.freeze(Object.create(PhysicsObject.prototype, {
  update : {
    value : function (dt) {
      PhysicsObject.prototype.update.call(this, dt);
      
      // Handle state
      /*
      var stateName = this.currentState.name;

      switch (stateName) {
        case Player.STATE.UP_WALK:
          this.setState(Player.STATE.UP_IDLE);
        break;
        case Player.STATE.DOWN_WALK:
          this.setState(Player.STATE.DOWN_IDLE);
        break;
        case Player.STATE.LEFT_WALK:
          this.setState(Player.STATE.LEFT_IDLE);
        break;
        case Player.STATE.RIGHT_WALK:
          this.setState(Player.STATE.RIGHT_IDLE);
        break;
      }
      */
    }
  },
    
  // Extend player stuff here 
  resolveCollision : {
    value : function (physObj, collisionData) {
      // Use custom collision resolution
      if (physObj.solid) {
        this.acceleration.multiply(0);

        if (collisionData.direction) {
          this.velocity.x = collisionData.direction.x * 0.1;
          this.velocity.y = collisionData.direction.y * 0.1;
          this.position.add(collisionData.direction);
        }
      }
    }
  }
}));

Object.freeze(Player);

module.exports = Player;