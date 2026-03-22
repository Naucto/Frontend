====================
Rendering Functions
====================

These functions handle all visual output: clearing the screen, drawing sprites, tilemaps, and
geometric shapes.

``clear``
=========

.. function:: clear(colorIndex)

   Clear the entire screen with a palette color.

   :param number colorIndex: Palette index used as the background color.

   Call this once at the start of ``_draw()`` to reset the screen before drawing the new frame.

   Invalid palette indexes raise an error in the output panel.

   .. code-block:: lua

      clear(0)   -- black background
      clear(12)  -- light blue background

``sprite``
==========

.. function:: sprite(index, x, y, width, height)

   Draw one sprite or a rectangular block of sprites from the sprite sheet.

   :param number index: Sprite index in the sprite sheet (0--255).
   :param number x: Destination x position in pixels.
   :param number y: Destination y position in pixels.
   :param number width: Width in sprite units (1 unit = 8 pixels).
   :param number height: Height in sprite units (1 unit = 8 pixels).

   Use ``width = 1`` and ``height = 1`` for a single 8 x 8 sprite. Larger values draw a block of
   tiles from the sprite sheet. Positions are floored to whole pixels by the renderer.

   .. code-block:: lua

      sprite(0, 10, 20, 1, 1)   -- single sprite at (10, 20)
      sprite(32, 40, 50, 2, 1)  -- 2-sprite-wide strip starting at index 32
      sprite(0, x, y, 1, 2)     -- 1 wide, 2 tall (8x16 px character)

``map``
=======

.. function:: map(x, y)

   Draw the tilemap created in the map editor.

   :param number x: X position in pixels where the map starts.
   :param number y: Y position in pixels where the map starts.

   This draws the entire map at once. The map uses the same 8 x 8 tile size as the sprite sheet.

   .. note::

      The Lua API does **not** currently expose tile reading or collision queries from the map.
      Gameplay collision must be handled using your own Lua tables. See :doc:`/limitations` for
      details.

   .. code-block:: lua

      map(0, 0)  -- draw the map at the world origin

``camera``
==========

.. function:: camera(x, y)

   Set the camera offset. All subsequent drawing calls are shifted by this offset.

   :param number x: Horizontal camera offset in pixels.
   :param number y: Vertical camera offset in pixels.

   A common pattern is to center the camera on the player inside ``_draw()``.
   Call ``camera(0, 0)`` to reset the camera.

   .. code-block:: lua

      -- Center on the player (320x180 screen)
      camera(player.x - 160, player.y - 90)

``line``
========

.. function:: line(colorIndex, x0, y0, x1, y1)

   Draw a straight line between two points.

   :param number colorIndex: Palette color index.
   :param number x0: Start x position.
   :param number y0: Start y position.
   :param number x1: End x position.
   :param number y1: End y position.

   .. code-block:: lua

      line(8, 0, 0, 319, 179)  -- diagonal across the screen

``rect``
========

.. function:: rect(colorIndex, x, y, width, height)

   Draw an outlined (unfilled) rectangle.

   :param number colorIndex: Palette color index.
   :param number x: Top-left x position.
   :param number y: Top-left y position.
   :param number width: Width in pixels.
   :param number height: Height in pixels.

   .. code-block:: lua

      rect(7, 20, 20, 32, 16)  -- white outline rectangle

``fill_rect``
=============

.. function:: fill_rect(colorIndex, x, y, width, height)

   Draw a filled rectangle.

   :param number colorIndex: Palette color index.
   :param number x: Top-left x position.
   :param number y: Top-left y position.
   :param number width: Width in pixels.
   :param number height: Height in pixels.

   .. code-block:: lua

      fill_rect(11, 0, 160, 320, 20)  -- green ground strip
      fill_rect(8, 30, 40, 10, 10)    -- small red square
