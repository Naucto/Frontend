==========================
Build a Platformer Game
==========================

This tutorial walks you through building a complete platformer with animated sprites, gravity,
jumping, platform collision, and camera scrolling.

What you will build
===================

A side-scrolling platformer where the player can:

- Move left and right
- Jump between platforms
- Fall with gravity
- Respawn when falling off the screen

The camera follows the player horizontally.

Step 1: Prepare your sprites
=============================

Open the **Sprite Editor** and draw these sprites:

+---------------+-----------------------------------------+
| Sprite index  | Content                                 |
+===============+=========================================+
| ``0``         | Player standing (idle)                  |
+---------------+-----------------------------------------+
| ``1``         | Player walking frame 1                  |
+---------------+-----------------------------------------+
| ``2``         | Player walking frame 2                  |
+---------------+-----------------------------------------+
| ``3``         | Player jumping                          |
+---------------+-----------------------------------------+

The player character is **8 pixels wide and 16 pixels tall** (1 tile wide, 2 tiles tall).
Draw the top half of the character in the sprite slot and the bottom half in the slot directly
below it. The engine handles multi-tile drawing with ``sprite(index, x, y, 1, 2)``.

.. tip::

   You can use any sprite indexes you want. Just update the constants at the top of the script
   to match.

Step 2: Paint your level
========================

Open the **Map Editor** and paint your level:

- **Ground row** -- a full row of solid tiles across the bottom
- **Floating platforms** -- smaller groups of tiles at different heights

Example layout (each cell = 8 pixels):

::

   Row 17 (y=136): platform at columns 9-13
   Row 15 (y=120): platform at columns 17-20
   Row 13 (y=104): platform at columns 25-31
   Row 17 (y=136): platform at columns 34-37
   Row 21 (y=168): ground spanning columns 0-52

The map is purely visual. Collision data lives in a Lua table that mirrors these positions
(see Step 3).

Step 3: Write the code
=======================

Switch to the **Code Editor** and enter the full script below.

Sprite constants
----------------

.. code-block:: lua

   -- Change these to match your sprite sheet
   SPRITE_IDLE   = 0
   SPRITE_WALK_1 = 1
   SPRITE_WALK_2 = 2
   SPRITE_JUMP   = 3

   -- Player dimensions: 1 tile wide, 2 tiles tall (8x16 px)
   PLAYER_W = 8
   PLAYER_H = 16

Platform table
--------------

This table mirrors the solid tiles you painted in the Map Editor. Each entry is a rectangle in
pixel coordinates.

.. code-block:: lua

   platforms = {
     { x = -8,  y = 168, w = 424, h = 8 },  -- ground
     { x = 72,  y = 136, w = 40,  h = 8 },  -- platform 1
     { x = 136, y = 120, w = 32,  h = 8 },  -- platform 2
     { x = 200, y = 104, w = 56,  h = 8 },  -- platform 3
     { x = 272, y = 136, w = 32,  h = 8 },  -- platform 4
   }

.. note::

   Since tiles are 8 x 8 pixels, a platform at tile column 9, row 17, spanning 5 tiles is:
   ``{ x = 9*8, y = 17*8, w = 5*8, h = 8 }`` which equals ``{ x = 72, y = 136, w = 40, h = 8 }``.

Helper functions
----------------

.. code-block:: lua

   function clamp(v, lo, hi)
     if v < lo then return lo end
     if v > hi then return hi end
     return v
   end

   function overlaps(ax, ay, aw, ah, bx, by, bw, bh)
     return ax < bx + bw
        and ax + aw > bx
        and ay < by + bh
        and ay + ah > by
   end

Initialization
--------------

.. code-block:: lua

   player = {}
   anim_timer = 0

   function _init()
     player = {
       x          = 24,
       y          = 40,
       vx         = 0,
       vy         = 0,
       speed      = 1.8,
       gravity    = 0.30,
       jump_force = -5.0,
       max_fall   = 5.5,
       on_ground  = false,
       facing     = 1,
       anim_frame = SPRITE_IDLE,
     }
     anim_timer = 0
   end

Input handling
--------------

.. code-block:: lua

   function handle_input()
     player.vx = 0

     if key_pressed("ArrowLeft") or key_pressed("a") then
       player.vx    = -player.speed
       player.facing = -1
     end

     if key_pressed("ArrowRight") or key_pressed("d") then
       player.vx    = player.speed
       player.facing = 1
     end

     local wants_jump = key_pressed("ArrowUp")
                     or key_pressed("w")
                     or key_pressed(" ")
     if wants_jump and player.on_ground then
       player.vy        = player.jump_force
       player.on_ground = false
     end
   end

Animation
---------

.. code-block:: lua

   function update_animation()
     if not player.on_ground then
       player.anim_frame = SPRITE_JUMP
       return
     end

     if player.vx ~= 0 then
       anim_timer = anim_timer + 1
       if anim_timer >= 8 then
         anim_timer = 0
         if player.anim_frame == SPRITE_WALK_1 then
           player.anim_frame = SPRITE_WALK_2
         else
           player.anim_frame = SPRITE_WALK_1
         end
       end
     else
       player.anim_frame = SPRITE_IDLE
       anim_timer = 0
     end
   end

Movement and collision
----------------------

.. code-block:: lua

   function move_x()
     player.x = player.x + player.vx

     for i = 1, #platforms do
       local p = platforms[i]
       if overlaps(player.x, player.y, PLAYER_W, PLAYER_H,
                   p.x, p.y, p.w, p.h) then
         if player.vx > 0 then
           player.x = p.x - PLAYER_W
         elseif player.vx < 0 then
           player.x = p.x + p.w
         end
         player.vx = 0
       end
     end
   end

   function move_y()
     player.vy = player.vy + player.gravity
     if player.vy > player.max_fall then
       player.vy = player.max_fall
     end

     local prev_y     = player.y
     player.y         = player.y + player.vy
     player.on_ground = false

     for i = 1, #platforms do
       local p = platforms[i]
       if overlaps(player.x, player.y, PLAYER_W, PLAYER_H,
                   p.x, p.y, p.w, p.h) then
         local was_above = prev_y + PLAYER_H <= p.y
         if was_above and player.vy >= 0 then
           player.y         = p.y - PLAYER_H
           player.vy        = 0
           player.on_ground = true
         elseif prev_y >= p.y + p.h then
           player.y  = p.y + p.h
           player.vy = 0
         end
       end
     end

     -- Fell off the bottom: respawn
     if player.y > 260 then
       player.x  = 24
       player.y  = 40
       player.vx = 0
       player.vy = 0
     end
   end

Game loop
---------

.. code-block:: lua

   function _update()
     handle_input()
     move_x()
     move_y()
     update_animation()
   end

   function draw_player()
     sprite(player.anim_frame, player.x, player.y, 1, 2)
   end

   function _draw()
     camera(clamp(player.x - 160, 0, 9999), 0)
     clear(12)
     map(0, 0)
     draw_player()
   end

How it all fits together
========================

::

   Sprite Editor          Map Editor              Lua Script
   ----------------       ----------------        --------------------------
   Draw tile art at       Paint solid tiles       platforms table mirrors
   index 0 = idle         at matching             tiles as pixel rectangles
   index 1 = walk 1       positions               for physics. map(0,0)
   index 2 = walk 2                               renders the tile art.
   index 3 = jump                                 sprite() draws the
                                                  animated character.

Extending the example
=====================

- **Add coins** -- Paint coin tiles on the map; add a ``coins`` table in Lua; check overlap
  each frame and remove collected entries.
- **Add enemies** -- Add an ``enemies`` table; update positions each frame; use ``sprite()``
  to draw them.
- **Bigger player** -- Draw a 2x2 sprite and call ``sprite(index, x, y, 2, 2)``.
- **Animate tiles** -- Use ``set_col`` to tint selected colors each frame.
- **Level restart** -- Track a ``lives`` variable; reset player on death.
