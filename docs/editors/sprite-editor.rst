=============
Sprite Editor
=============

The Sprite Editor is where you create all the visual assets for your game: characters, objects,
tiles, UI elements, and anything else that appears on screen.

Sprite sheet basics
===================

Your project has a single **128 x 128 pixel** sprite sheet, divided into a grid of **8 x 8 pixel**
tiles. This gives you **256 sprite slots** (16 columns x 16 rows), indexed from ``0`` to ``255``.

::

   128 px wide
   +--+--+--+--+--+--+-- ... --+
   | 0| 1| 2| 3| 4| 5|        |15|  <- row 0
   +--+--+--+--+--+--+-- ... --+
   |16|17|18|19|20|21|        |31|  <- row 1
   +--+--+--+--+--+--+-- ... --+
   ...                          ...
   +--+--+--+--+--+--+-- ... --+
   |240|  |  |  |  |  |      |255|  <- row 15
   +--+--+--+--+--+--+-- ... --+

Drawing sprites
===============

1. **Select a sprite slot** by clicking on it in the sprite sheet grid
2. **Choose a color** from the palette
3. **Paint pixels** by clicking or dragging on the enlarged editing area
4. Use the **zoom controls** to get a closer view while drawing

The color palette
-----------------

The engine uses a fixed color palette. Each color has an index number that you can reference in
your Lua code with functions like :func:`clear`, :func:`line`, :func:`rect`, and :func:`fill_rect`.

Tips for organizing your sprites
================================

- **Group related sprites together** -- put all player frames in a row, all enemy frames in
  another row
- **Use consistent indexes** -- define sprite constants at the top of your Lua script:

  .. code-block:: lua

     SPRITE_PLAYER_IDLE = 0
     SPRITE_PLAYER_WALK1 = 1
     SPRITE_PLAYER_WALK2 = 2
     SPRITE_PLAYER_JUMP = 3

- **Plan for multi-tile sprites** -- a 16 x 16 character uses a 2 x 2 block of tiles.
  Place these in adjacent slots so the :func:`sprite` function can draw them as one unit.
- **Reserve rows for tilesets** -- dedicate one or two rows for map tiles (ground, walls,
  platforms) and other rows for characters and objects.

Using sprites in Lua
====================

Once you have drawn your sprites, reference them by index in your code:

.. code-block:: lua

   -- Single 8x8 sprite
   sprite(0, player.x, player.y, 1, 1)

   -- 8x16 character (1 tile wide, 2 tiles tall)
   sprite(0, player.x, player.y, 1, 2)

   -- 16x16 character (2 tiles wide, 2 tiles tall)
   sprite(0, player.x, player.y, 2, 2)

See :func:`sprite` in the API reference for full details.
