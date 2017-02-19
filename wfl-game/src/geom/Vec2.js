"use strict";

const PIXI = require('pixi.js');

// 2-D Vector
var Vec2 = function (x, y, cb = () => null, scope = null) {
    PIXI.ObservablePoint.call(this, cb, scope, x, y);
};
Object.defineProperties(Vec2, {
    add : {
        value : function (v1, v2) {
            return new Vec2(
                v1._x + v2._x,
                v1._y + v2._y
            );
        }
    },
    
    subtract : {
        value : function (v1, v2) {
            return new Vec2(
                v1._x - v2._x,
                v1._y - v2._y
            );
        }
    }, 
    
    multiply : {
        value : function (v, scalar) {
            return new Vec2(
                v._x * scalar,
                v._y * scalar
            );
        }
    },
    
    divide : {
        value : function (v, scalar) {
            return new Vec2(
                v._x / scalar,
                v._y / scalar
            );
        }
    },
    
    dot : {
        value : function (v1, v2) {
            return (v1._x * v2._x) + (v1._y * v2._y);
        }
    },
    
    cross : {
        value : function (v1, v2)  {
            return (v1._x * v2._y) - (v1._y * v2._x);
        } 
    },
    
    distanceSquared : {
        value : function (v1, v2) {
            var dx = v2._x - v1._x;
            var dy = v2._y - v1._y;
            return dx * dx + dy * dy;
        }
    },
    
    distance : {
        value : function (v1, v2) {
            return Math.sqrt(Vec2.distanceSquared(v1, v2));
        }
    },
    
    fromAngle : {
        value : function (theta) {
            return new Vec2(
                Math.cos(theta),
                Math.sin(theta)
            );
        }
    }
});
Vec2.prototype = Object.freeze(Object.create(PIXI.ObservablePoint.prototype, {
    getMagnitudeSquared : {
        value : function () {
            return this._x * this._x + this._y * this._y;
        }
    },

    getMagnitude : {
        value : function () {
            return Math.sqrt(this.getMagnitudeSquared());
        }
    },
    
    setMagnitude : {
        value : function (value) {
            var mag = this.getMagnitude();
            
            this._x /= mag;
            this._y /= mag;
            
            this._x *= value;
            this._y *= value;
            return this;
        }
    },
    
    getAngle : {
        value : function () {
            return Math.atan2(this._y, this._x);
        }
    },
    
    setAngle : {
        value : function (value) {
            var mag = this.getMagnitude();
            
            this._x = mag * Math.cos(value);
            this._y = mag * Math.sin(value);
            return this;
        }
    },
    
    rotate : {
        value : function (theta) {
            this.setAngle(this.getAngle() + theta);
            return this;
        }
    },
    
    getDirection : {
        value : function () {
            var mag = this.getMagnitude();
            var v = new Vec2(this._x / mag, this._y / mag);
            return v;
        }
    },
    
    add : {
        value : function (other) {
            this._x += other._x;
            this._y += other._y;
            return this;
        }
    },
    
    subtract : {
        value : function (other) {
            this._x -= other._x;
            this._y -= other._y;
            return this;
        }
    },
    
    multiply : {
        value : function (scalar) {
            this._x *= scalar;
            this._y *= scalar;
            return this;
        }
    },
    
    divide : {
        value : function (scalar) {
            this._x /= scalar;
            this._y /= scalar;
            return this;
        }
    },
    
    normalize : {
        value : function () {
            var mag = this.getMagnitude();
            
            this._x /= mag;
            this._y /= mag;
            return this;
        }
    },
    
    limit : {
        value : function (maxMagnitude) {
            var magSquared = this.getMagnitudeSquared();
            
            if (magSquared > maxMagnitude * maxMagnitude) {
                this.setMagnitude(maxMagnitude);
            }
        }
    },
    
    clone : {
        value : function () {
            return new Vec2(this._x, this._y);
        }
    },
    
    getOrthogonal : {
        value : function () {
            return new Vec2(this._y, -this._x);
        }
    }
}));
Object.freeze(Vec2);

module.exports = Vec2;