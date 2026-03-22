================
Palette Controls
================

The engine uses a color palette for all rendering. These functions let you temporarily remap
palette colors for visual effects.

``set_col``
===========

.. function:: set_col(index, replacementIndex)

   Temporarily remap one palette color to another.

   :param number index: Palette slot to replace.
   :param number replacementIndex: Palette slot to copy into it.

   This changes the active palette used by all subsequent rendering calls. Use it for:

   - **Damage flashes** -- swap sprite colors to white or red for a few frames
   - **Night mode** -- darken all colors
   - **Enemy recolors** -- create enemy variants by swapping specific colors
   - **Power-up effects** -- tint the player when powered up

   Invalid palette indexes print an error in the output panel.

   .. code-block:: lua

      -- Make color 8 render as color 10
      set_col(8, 10)

      -- Flash the player white on hit
      if player.hit_timer > 0 then
        set_col(8, 7)   -- swap main color to white
        set_col(9, 7)
      end

``reset_col``
=============

.. function:: reset_col()

   Restore the original palette, undoing all ``set_col`` changes.

   .. code-block:: lua

      reset_col()

   Always call ``reset_col()`` after temporary color swaps so that later drawing calls in the
   same frame use the correct colors.

Typical usage pattern
=====================

.. code-block:: lua

   function _draw()
     clear(0)

     -- Draw enemies with a red tint
     set_col(8, 4)
     for i = 1, #enemies do
       sprite(enemies[i].spr, enemies[i].x, enemies[i].y, 1, 1)
     end
     reset_col()

     -- Draw the player with normal colors
     sprite(player.spr, player.x, player.y, 1, 2)
   end
