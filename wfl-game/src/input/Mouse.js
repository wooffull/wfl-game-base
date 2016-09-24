"use strict";

var $ = require('jquery');
var geom = require('../geom');

var Mouse = function (canvas) {
    this._canvas = undefined;
    this._states = [];
    this._states[1] = this._createState(1); // Left
    this._states[2] = this._createState(2); // Middle
    this._states[3] = this._createState(3); // Right
    
    this._onMoveRef  = this._onMove.bind(this);
    this._onDownRef  = this._onDown.bind(this);
    this._onLeaveRef = this._onLeave.bind(this);
    this._onEnterRef = this._onEnter.bind(this);

    this.position = new geom.Vec2(-Infinity, -Infinity);
    this.touchingCanvas = false;

    // If a canvas is passed in, add listeners to it
    if (canvas) {
        this.setCanvas(canvas);
    }

    $(document).on("mouseup", this._onUp.bind(this));
};

Object.defineProperties(Mouse, {
    Event : {
        value : Object.freeze({
            MOVE      : "move",
            DOWN      : "down",
            BEFORE_UP : "before_up",
            UP        : "up",
            LEAVE     : "leave",
            ENTER     : "enter"
        })
    }
});

Mouse.prototype = Object.freeze(Object.create(Mouse.prototype, {
    /**
     * Sets the canvas for the mouse to reference
     */
    setCanvas : {
        value : function (canvas) {
            // Remove bindings from old canvas if it existed
            if (this._canvas) {
                $(this._canvas).off("mousemove",  this._onMoveRef);
                $(this._canvas).off("mousedown",  this._onDownRef);
                $(this._canvas).off("mouseleave", this._onLeaveRef);
                $(this._canvas).off("mouseenter", this._onEnterRef);
            }

            // Set canvas to the new one
            this._canvas = canvas;

            // Add bindings to new canvas if it exists
            if (this._canvas) {
                $(this._canvas).on("mousemove",  this._onMoveRef);
                $(this._canvas).on("mousedown",  this._onDownRef);
                $(this._canvas).on("mouseleave", this._onLeaveRef);
                $(this._canvas).on("mouseenter", this._onEnterRef);
            }
        }
    },

    /**
     * Gets the state for the given input button ID
     */
    getState : {
        value : function (which) {
            return this._states[which];
        }
    },
    
    /**
     * Creates a state for the canvas mouse, based on the given input button ID
     */
    _createState : {
        value : function (which) {
            return {
                which : which,
                isDown : false,
                dragging : false,
                prevPos : new geom.Vec2(-Infinity, -Infinity),
                dragStart : new geom.Vec2(-Infinity, -Infinity),
                dragEnd : new geom.Vec2(-Infinity, -Infinity)
            };
        }
    },

    /**
     * Limits the given position to the canvas's bounds
     */
    _limitPosition : {
        value : function (pos) {
            var rect = this._canvas.getBoundingClientRect();

            if (pos.x < 0) {
                pos.x = 0;
            } else if (pos.x > rect.right - rect.left) {
                pos.x = rect.right - rect.left;
            }

            if (pos.y < 0) {
                pos.y = 0;
            } else if (pos.y > rect.bottom - rect.top) {
                pos.y = rect.bottom - rect.top;
            }
        }
    },

    /**
     * Gets the position of the mouse based on the given mouse event
     */
    _getMousePositionFromEvent : {
        value : function (e) {
            var rect = this._canvas.getBoundingClientRect();
            var pos = new geom.Vec2();
            pos.x = e.clientX - rect.left;
            pos.y = e.clientY - rect.top;

            return pos;
        }
    },

    /**
     * Callback for when the mouse button is pressed down on the canvas
     */
    _onDown : {
        value : function (e) {
            var state = this.getState(e.which);

            if (state) {
                state.isDown = true;
                state.dragging = false;
                state.prevPos.x = this.position.x;
                state.prevPos.y = this.position.y;
                state.dragStart.x = this.position.x;
                state.dragStart.y = this.position.y;
                state.dragEnd.x = this.position.x;
                state.dragEnd.y = this.position.y;

                $(this).trigger(Mouse.Event.DOWN, e);
            }
        }
    },

    /**
     * Callback for then the mouse button is released
     */
    _onUp : {
        value : function (e) {
            var state = this.getState(e.which);

            if (state) {
                $(this).trigger(Mouse.Event.BEFORE_UP, e);

                state.isDown = false;
                state.dragging = false;
                state.prevPos.x = -Infinity;
                state.prevPos.y = -Infinity;
                state.dragStart.x = -Infinity;
                state.dragStart.y = -Infinity;
                state.dragEnd.x = -Infinity;
                state.dragEnd.y = -Infinity;

                $(this).trigger(Mouse.Event.UP, e);
            }
        }
    },

    /**
     * Callback for when the mouse moves on the canvas
     */
    _onMove : {
        value : function (e) {
            this.touchingCanvas = true;

            var newPos = this._getMousePositionFromEvent(e);
            this._limitPosition(newPos);

            for (var i = 1; i < 4; i++) {
                var state = this.getState(i);

                if (state.isDown) {
                    state.dragging = true;
                    state.dragEnd.x = newPos.x;
                    state.dragEnd.y = newPos.y;
                    state.prevPos.x = this.position.x;
                    state.prevPos.y = this.position.y;
                }
            }

            this.position.x = newPos.x;
            this.position.y = newPos.y;

            $(this).trigger(Mouse.Event.MOVE, e);
        }
    },

    /**
     * Callback for when the mouse leaves the canvas
     */
    _onLeave : {
        value : function (e) {
            this.touchingCanvas = false;

            var newPos = this._getMousePositionFromEvent(e);
            this.position.x = newPos.x;
            this.position.y = newPos.y;
            this._limitPosition(this.position);

            for (var i = 1; i < 4; i++) {
                var state = this.getState(i);

                if (state.dragging) {
                    state.dragEnd.x = this.position.x;
                    state.dragEnd.y = this.position.y;
                }
            }

            $(this).trigger(Mouse.Event.LEAVE, e);
        }
    },

    /**
     * Callback for when the mouse enters the canvas
     */
    _onEnter : {
        value : function (e) {
            this.touchingCanvas = true;

            var newPos = this._getMousePositionFromEvent(e);
            this.position.x = newPos.x;
            this.position.y = newPos.y;
            this._limitPosition(this.position);

            for (var i = 1; i < 4; i++) {
                var state = this.getState(i);

                if (state.dragging) {
                    state.dragEnd.x = this.position.x;
                    state.dragEnd.y = this.position.y;
                }
            }

            $(this).trigger(Mouse.Event.ENTER, e);
        }
    }
}));

Object.freeze(Mouse);

module.exports = Mouse