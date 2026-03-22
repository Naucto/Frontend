==========
Map Editor
==========

The Map Editor lets you paint tile-based levels and backgrounds using the sprites you created in
the Sprite Editor.

How the map works
=================

The map is a grid where each cell holds a reference to a sprite index. When you call :func:`map`
in your Lua code, the engine draws every tile in the grid at its correct position.

- Each tile is **8 x 8 pixels** (same size as a sprite)
- The map uses the **same sprite sheet** as the Sprite Editor
- Painting a tile on the map means "draw this sprite at this grid position"

Painting tiles
==============

1. **Select a sprite** from the sprite sheet palette (shown alongside the map grid)
2. **Click or drag** on the map grid to place tiles
3. **Erase tiles** by selecting an empty sprite slot and painting over existing tiles

Drawing the map in Lua
======================

To render the map in your game, call :func:`map` inside ``_draw()``:

.. code-block:: lua

   function _draw()
     clear(12)
     map(0, 0)         -- draw the map at position (0, 0)
     draw_player()     -- draw the player on top
   end

The ``x`` and ``y`` parameters control where the top-left corner of the map is drawn. Combined
with :func:`camera`, you can scroll through large levels.

Map and collision
=================

.. important::

   The Lua API does **not** currently support reading individual tile values from the map or
   performing collision queries against it. This means you need to **mirror your collision
   layout in a Lua table**.

The recommended workflow:

1. **Paint your level visually** in the Map Editor -- platforms, walls, ground
2. **Create a matching Lua table** with the same positions and dimensions:

   .. code-block:: lua

      platforms = {
        { x = 0,   y = 168, w = 320, h = 8 },  -- ground
        { x = 72,  y = 136, w = 40,  h = 8 },  -- floating platform
        { x = 136, y = 120, w = 32,  h = 8 },  -- another platform
      }

3. **Use the Lua table for physics** and the ``map()`` call for visuals

Since tiles are 8 x 8 pixels, converting tile coordinates to pixel coordinates is straightforward:

.. code-block:: lua

   -- A platform at tile column 9, row 20, spanning 5 tiles wide
   { x = 9 * 8, y = 20 * 8, w = 5 * 8, h = 8 }
   -- Equivalent to:
   { x = 72, y = 160, w = 40, h = 8 }

When tile-based collision is added to the Lua API in the future, you will be able to remove the
Lua collision table and query the map directly.

See the :doc:`/tutorials/platformer` tutorial for a complete example of this workflow.
