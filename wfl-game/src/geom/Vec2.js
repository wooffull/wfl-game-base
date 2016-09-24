"use strict";

// 2-D Vector
var Vec2 = function (x, y) {
    if (isNaN(x)) {
        x = 0;
    }
    
    if (isNaN(y)) {
        y = 0;
    }

    this.x = x;
    this.y = y;
};
Object.defineProperties(Vec2, {
    add : {
        value : function (v1, v2) {
            return new Vec2(
                v1.x + v2.x,
                v1.y + v2.y
            );
        }
    },
    
    subtract : {
        value : function (v1, v2) {
            return new Vec2(
                v1.x - v2.x,
                v1.y - v2.y
            );
        }
    }, 
    
    multiply : {
        value : function (v, scalar) {
            return new Vec2(
                v.x * scalar,
                v.y * scalar
            );
        }
    },
    
    divide : {
        value : function (v, scalar) {
            return new Vec2(
                v.x / scalar,
                v.y / scalar
            );
        }
    },
    
    dot : {
        value : function (v1, v2) {
            return (v1.x * v2.x) + (v1.y * v2.y);
        }
    },
    
    cross : {
        value : function (v1, v2)  {
            return (v1.x * v2.y) - (v1.y * v2.x);
        } 
    },
    
    distanceSquared : {
        value : function (v1, v2) {
            var dx = v2.x - v1.x;
            var dy = v2.y - v1.y;
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
Vec2.prototype = Object.freeze(Object.create(Vec2.prototype, {
    getMagnitudeSquared : {
        value : function () {
            return this.x * this.x + this.y * this.y;
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
            
            this.x /= mag;
            this.y /= mag;
            
            this.x *= value;
            this.y *= value;
            return this;
        }
    },
    
    getAngle : {
        value : function () {
            return Math.atan2(this.y, this.x);
        }
    },
    
    setAngle : {
        value : function (value) {
            var mag = this.getMagnitude();
            
            this.x = mag * Math.cos(value);
            this.y = mag * Math.sin(value);
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
            var v = new Vec2(this.x / mag, this.y / mag);
            return v;
        }
    },
    
    add : {
        value : function (other) {
            this.x += other.x;
            this.y += other.y;
            return this;
        }
    },
    
    subtract : {
        value : function (other) {
            this.x -= other.x;
            this.y -= other.y;
            return this;
        }
    },
    
    multiply : {
        value : function (scalar) {
            this.x *= scalar;
            this.y *= scalar;
            return this;
        }
    },
    
    divide : {
        value : function (scalar) {
            this.x /= scalar;
            this.y /= scalar;
            return this;
        }
    },
    
    normalize : {
        value : function () {
            var mag = this.getMagnitude();
            
            this.x /= mag;
            this.y /= mag;
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
            return new Vec2(this.x, this.y);
        }
    },
    
    getOrthogonal : {
        value : function () {
            return new Vec2(this.y, -this.x);
        }
    }
}));
Object.freeze(Vec2);

module.exports = Vec2;