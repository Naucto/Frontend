=======================
Code Structure Guide
=======================

As your game grows, keeping your Lua code organized becomes important. This page shows
recommended patterns for structuring larger projects.

Basic structure
===============

For small games, the three lifecycle functions are enough:

.. code-block:: lua

   function _init()
     -- set up everything
   end

   function _update()
     -- all game logic
   end

   function _draw()
     clear(0)
     -- all rendering
   end

Organized structure
===================

As your game grows, break each lifecycle function into smaller, focused functions:

.. code-block:: lua

   function _init()
     init_player()
     init_level()
     init_enemies()
   end

   function _update()
     update_player()
     update_enemies()
     update_camera()
   end

   function _draw()
     clear(0)
     draw_level()
     draw_enemies()
     draw_player()
     draw_ui()
   end

This pattern scales well because:

- Each function has a single responsibility
- You can easily find and modify specific behavior
- Adding new systems (pickups, particles, menus) means adding new functions without touching
  existing ones

Naming conventions
==================

Use consistent naming to keep your code readable:

.. code-block:: lua

   -- Constants in UPPER_CASE
   SPRITE_PLAYER = 0
   PLAYER_SPEED = 2
   GRAVITY = 0.3

   -- Game objects as tables
   player = {}
   enemies = {}
   bullets = {}

   -- Functions named by what they do
   function init_player() ... end
   function update_player() ... end
   function draw_player() ... end

Game state management
=====================

For games with multiple screens (menu, gameplay, game over), use a state variable:

.. code-block:: lua

   state = "menu"

   function _update()
     if state == "menu" then
       update_menu()
     elseif state == "play" then
       update_game()
     elseif state == "gameover" then
       update_gameover()
     end
   end

   function _draw()
     clear(0)
     if state == "menu" then
       draw_menu()
     elseif state == "play" then
       draw_game()
     elseif state == "gameover" then
       draw_gameover()
     end
   end
