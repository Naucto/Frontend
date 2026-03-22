=================================
Coordinates and Rendering Model
=================================

Screen size
===========

The game canvas is **320 x 180 pixels**.

Coordinate system
=================

- ``(0, 0)`` is the **top-left** corner of the screen
- ``x`` increases to the **right**
- ``y`` increases **downward**
- All drawing functions use **pixel coordinates**

.. code-block:: text

   (0,0) ---------------------- (319,0)
     |                            |
     |                            |
     |         320 x 180          |
     |                            |
     |                            |
   (0,179) --------------------- (319,179)

Sprite sheet layout
===================

The engine uses a single sprite sheet made of **8 x 8 pixel** tiles.

+---------------------+-------------------+
| Property            | Value             |
+=====================+===================+
| Sprite size         | 8 x 8 pixels      |
+---------------------+-------------------+
| Sheet size          | 128 x 128 pixels  |
+---------------------+-------------------+
| Sprites per row     | 16                |
+---------------------+-------------------+
| Total sprite slots  | 256 (0 -- 255)    |
+---------------------+-------------------+

Sprite indexing
---------------

Sprites are numbered left-to-right, top-to-bottom:

::

   Row 0:   [ 0][ 1][ 2][ 3] ... [15]
   Row 1:   [16][17][18][19] ... [31]
   Row 2:   [32][33][34][35] ... [47]
   ...
   Row 15:  [240] ...           [255]

- Sprite ``0`` = top-left corner of the sheet
- Sprite ``1`` = next sprite on the same row
- Sprite ``16`` = first sprite on the second row

To find a sprite at column ``c`` and row ``r``:

.. code-block:: lua

   index = r * 16 + c

Multi-tile sprites
------------------

You can draw sprites that span multiple tiles using the ``width`` and ``height`` parameters of the
:func:`sprite` function. For example, a 16 x 16 pixel character uses ``width = 2, height = 2``.

.. code-block:: lua

   -- Draw a 2x2 tile sprite (16x16 pixels) starting at index 0
   sprite(0, x, y, 2, 2)

The engine draws a rectangular block of tiles from the sprite sheet starting at the given index.
