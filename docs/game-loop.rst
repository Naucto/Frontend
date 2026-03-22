=========
Game Loop
=========

Your Lua script is loaded once, then the engine calls three special global functions every frame.
If any of them is missing, the engine simply skips it.

Lifecycle overview
==================

::

   Script loaded
        |
        v
    _init()          <-- runs once
        |
        v
   +----------+
   | _update() | <-- runs every frame (game logic)
   |           |
   | _draw()   | <-- runs every frame (rendering)
   +----------+
        |
        v
      (loop)

``_init()``
===========

.. code-block:: lua

   function _init()
     -- create variables, player state, enemy tables, level data...
   end

Use ``_init()`` to set up your initial game state:

- Initialize player position and stats
- Build tables for enemies, platforms, bullets, pickups
- Set camera state
- Prepare anything that should exist before the first frame

``_update()``
=============

.. code-block:: lua

   function _update()
     -- handle input, physics, collisions, timers...
   end

Use ``_update()`` for all game logic:

- Reading keyboard input
- Moving characters
- Applying gravity
- Updating animation timers
- Checking collisions
- Changing score, health, or game states

``_draw()``
===========

.. code-block:: lua

   function _draw()
     clear(0)
     -- draw map, sprites, shapes, UI...
   end

Use ``_draw()`` only for rendering:

- Clear the screen
- Move the camera if needed
- Draw the tilemap
- Draw sprites and shapes
- Print debug values to the output panel

The golden rule
===============

.. important::

   **Update in** ``_update()`` **, draw in** ``_draw()`` **.**

Keeping game logic and rendering separate makes your code easier to understand, debug, and extend.
Never modify game state inside ``_draw()``, and avoid drawing inside ``_update()``.
