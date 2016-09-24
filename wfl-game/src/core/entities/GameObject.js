"use strict";

var animation = require('./animation');
var GameObjectState = animation.GameObjectState;
var FrameObject = animation.FrameObject;

/**
 * Generic object for the game's canvas
 */
var GameObject = function () {
    this.graphic = undefined;
    this.vertices = undefined;
    this.states = {};
    this.currentState = undefined;
    this.layer = undefined;
    this.customData = {};
};

Object.defineProperties(GameObject, {
    STATE : {
        value : {
            DEFAULT : "DEFAULT"
        }
    }
});

GameObject.prototype = Object.freeze(Object.create(GameObject.prototype, {
    update : {
        value : function (dt) {
            if (this.currentState !== undefined) {
                this.currentState.update(dt);
                this.graphic = this.currentState.getGraphic();
                this.vertices = this.currentState.getVertices();
            }
        }
    },

    draw : {
        value : function (ctx) {
            if (this.graphic !== undefined) {
                ctx.drawImage(this.graphic, -this.graphic.width * 0.5, -this.graphic.height * 0.5);
            }
        }
    },

    getWidth : {
        value : function () {
            if (this.graphic === undefined) {
                return 0;
            }
            return this.graphic.width;
        }
    },

    getHeight : {
        value : function () {
            if (this.graphic === undefined) {
                return 0;
            }
            return this.graphic.height;
        }
    },

    getState : {
        value : function (stateName) {
            return this.states[stateName];
        }
    },

    setState : {
        value : function (stateName) {
            var newState = this.states[stateName];

            if (this.currentState !== newState) {
                this.currentState = newState;
                this.currentState.setFrame(0);
            }
        }
    },

    addState : {
        value : function (stateName, state) {
            this.states[stateName] = state;
            state.setName(stateName);

            // No current state yet, so initialize game object with newly
            // added state
            if (this.currentState === undefined) {
                this.setState(stateName);

                this.vertices = this.currentState.getVertices();
                this.graphic = this.currentState.getGraphic();
            }
        }
    },
    
    createState : {
        value : function () {
            return new GameObjectState();
        }
    },
    
    createFrame : {
        value : function (graphic, duration, createBoundingBox) {
            return new FrameObject(graphic, duration, createBoundingBox);
        }
    }
}));

Object.freeze(GameObject);

module.exports = GameObject;