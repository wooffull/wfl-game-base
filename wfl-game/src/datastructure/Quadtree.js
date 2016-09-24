"use strict";

/**
 * Reference: http://gamedevelopment.tutsplus.com/tutorials/quick-tip-use-quadtrees-to-detect-likely-collisions-in-2d-space--gamedev-374
 */

var Quadtree = function (level, bounds) {
    this.level = level;
    this.objects = [];
    this.bounds = bounds;
    this.nodes = [undefined, undefined, undefined, undefined]
};
Object.defineProperties(Quadtree, {
    MAX_OBJECTS : {
        value : 10
    },

    MAX_LEVELS : {
        value : 5
    }
});
Quadtree.prototype = Object.freeze(Object.create(Quadtree.prototype, {
    /**
    * Clears the quadtree
    */
    clear : {
        value : function () {
            this.objects = [];

            for (var i = 0; i < this.nodes.length; i++) {
                if (this.nodes[i] !== undefined) {
                    this.nodes[i].clear();
                    this.nodes[i] = undefined;
                }
            }
        }
    },

    /**
     * Splits the node into 4 subnodes
     */
    split : {
        value : function () {
            var halfWidth = Math.floor(this.bounds.width * 0.5);
            var halfHeight = Math.floor(this.bounds.height * 0.5);
            var x = Math.floor(this.bounds.x);
            var y = Math.floor(this.bounds.y);

            this.nodes[0] = new Quadtree(this.level + 1, {
                x : x + halfWidth,
                y : y,
                width : halfWidth,
                height : halfHeight
            });

            this.nodes[1] = new Quadtree(this.level + 1, {
                x : x,
                y : y,
                width : halfWidth,
                height : halfHeight
            });

            this.nodes[2] = new Quadtree(this.level + 1, {
                x : x,
                y : y + halfHeight,
                width : halfWidth,
                height : halfHeight
            });

            this.nodes[3] = new Quadtree(this.level + 1, {
                x : x + halfWidth,
                y : y + halfHeight,
                width : halfWidth,
                height : halfHeight
            });
        }
    },

    /**
     * Determine which node the objects belongs to. -1 means
     * the object cannot fully fit in a child node, and is part
     * of the parent node
     */
    getIndex : {
        value : function (physObj) {
            var index = -1;
            var verticalMidpoint = this.bounds.x + this.bounds.width * 0.5;
            var horizontalMidpoint = this.bounds.y + this.bounds.height * 0.5;
            var w = physObj.getWidth();
            var h = physObj.getHeight();
            var x = physObj.position.x - 0.5 * w;
            var y = physObj.position.y - 0.5 * h;

            // Object completely fits within top quadrants
            var topQuadrant = (y < horizontalMidpoint && y + h < horizontalMidpoint);

            // Object completely fits within bottom quadrants
            var bottomQuadrant = (y > horizontalMidpoint);

            // Object completely fits within left quadrants
            if (x < verticalMidpoint && x + w < verticalMidpoint) {
                if (topQuadrant) {
                    index = 1;
                } else if (bottomQuadrant) {
                    index = 2;
                }

            // Object completely fits within right quadrants
            } else if (x > verticalMidpoint) {
                if (topQuadrant) {
                    index = 0;
                } else if (bottomQuadrant) {
                    index = 3;
                }
            }

            return index;
        }
    },

    /**
     * Insert the object into the quadtree. If the node
     * exceeds the capacity, it will split and add all objects
     * to their corresponding nodes
     */
    insert : {
        value : function (physObj) {
            if (this.nodes[0] !== undefined) {
                var index = this.getIndex(physObj);

                if (index !== -1) {
                    this.nodes[index].insert(physObj);
                    return;
                }
            }

            this.objects.push(physObj);

            if (this.objects.length > Quadtree.MAX_OBJECTS && this.level < Quadtree.MAX_LEVELS) {
                if (this.nodes[0] === undefined) {
                    this.split();
                }

                var i = 0;
                while (i < this.objects.length) {
                    var curObj = this.objects[i];

                    if (curObj === undefined) {
                        this.objects.splice(i, 1);
                        i++;
                    } else {
                        var index = this.getIndex(curObj);

                        if (index !== -1) {
                            this.nodes[index].insert(this.objects.splice(i, 1)[0]);
                        } else {
                            i++;
                        }
                    }
                }
            }
        }
    },

    /**
     * Return all objects that could possibly collide with the given object
     */
    retrieve : {
        value : function (objs, physObj) {
            var index = this.getIndex(physObj);
            if (index !== -1 && this.nodes[0] !== undefined) {
                this.nodes[index].retrieve(objs, physObj);
            }

            for (var i = 0; i < this.objects.length; i++) {
                objs.push(this.objects[i]);
            }

            return objs;
        }
    }
}));
Object.freeze(Quadtree);

module.exports = Quadtree;