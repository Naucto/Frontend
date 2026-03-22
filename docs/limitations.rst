=======================
Current Limitations
=======================

The Naucto Lua API is focused and growing. Here are the current limitations to be aware of when
designing your games, along with recommended workarounds.

No tile lookup from the map
===========================

The Lua API cannot read individual tile values from the map editor. You cannot query "what tile
is at position (x, y)?" from your Lua code.

**Workaround:** Maintain a Lua table that mirrors your map layout for collision and gameplay
queries. See the :doc:`tutorials/platformer` tutorial for a complete example.

.. code-block:: lua

   -- Mirror your map tiles as collision rectangles
   platforms = {
     { x = 0, y = 168, w = 320, h = 8 },
     { x = 72, y = 136, w = 40, h = 8 },
   }

No collision queries
====================

There are no built-in collision detection functions. You must implement overlap checks yourself.

**Workaround:** Use a simple AABB (axis-aligned bounding box) overlap function:

.. code-block:: lua

   function overlaps(ax, ay, aw, ah, bx, by, bw, bh)
     return ax < bx + bw
        and ax + aw > bx
        and ay < by + bh
        and ay + ah > by
   end

No sound playback from Lua
===========================

The Sound Editor exists in the interface, but there are no Lua functions to trigger sound effects
or music playback during gameplay.

**Status:** Sound playback functions are planned for a future update.

No delta time
=============

The engine does not expose a delta time value. The game loop runs at a fixed frame rate, so
movement values are per-frame rather than per-second.

**Workaround:** Tune your movement speeds, gravity, and jump forces as per-frame values. The
platformer tutorial demonstrates this approach with values like ``speed = 1.8`` and
``gravity = 0.30``.

What works well today
=====================

Despite these limitations, the current API supports a wide range of games:

- Sprite-based characters with animation
- Arcade-style movement
- Basic platformers
- Top-down adventure games
- Puzzle games
- Simple action games
- HUDs and debug overlays with rectangles and lines
- Palette swap effects for visual variety
