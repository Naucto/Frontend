==============
Debugging Tips
==============

Common issues and how to fix them.

Nothing draws on screen
=======================

Check these first:

1. Did you define ``_draw()``?
2. Are you calling ``clear(...)`` at the start of ``_draw()``?
3. Are your coordinates within the visible screen area (0--319 for x, 0--179 for y)?
4. Are you using valid sprite indexes (0--255) and palette indexes?

Input does not work
===================

The :func:`key_pressed` function uses the browser's ``event.key`` values. The exact string is
case-sensitive:

- Arrow keys: ``"ArrowLeft"``, ``"ArrowRight"``, ``"ArrowUp"``, ``"ArrowDown"``
- Space bar: ``" "`` (a single space character)
- Letters: ``"a"``, ``"d"``, ``"w"``, ``"s"`` (lowercase)

Common mistakes:

- ``"arrowleft"`` -- wrong, must be ``"ArrowLeft"``
- ``"space"`` -- wrong, must be ``" "``
- ``"A"`` -- this only matches when Caps Lock is on; use ``"a"`` for normal key presses

Colors look wrong
=================

If you used :func:`set_col` to remap palette colors, make sure you call :func:`reset_col` when
the effect is done. Otherwise, the swapped colors persist into all subsequent drawing calls.

.. code-block:: lua

   -- Wrong: color swap leaks into other sprites
   set_col(8, 10)
   sprite(0, x, y, 1, 1)
   -- Everything after this also uses the swapped color!

   -- Correct: reset after the effect
   set_col(8, 10)
   sprite(0, x, y, 1, 1)
   reset_col()

Errors in the output panel
==========================

The engine prints Lua runtime errors to the output panel. Common causes:

- **Invalid palette index** in ``clear``, ``set_col``, or drawing functions
- **Typos in function names** -- Lua is case-sensitive (``Key_Pressed`` is not ``key_pressed``)
- **Lua syntax errors** -- missing ``end``, unmatched parentheses, etc.
- **Nil values** -- accessing a table field that does not exist

Using print for debugging
=========================

The :func:`print` function is your primary debugging tool. Use it to inspect values at runtime:

.. code-block:: lua

   function _update()
     handle_input()
     move_player()
     print("pos:", player.x, player.y)
     print("vel:", player.vx, player.vy)
     print("ground:", player.on_ground)
   end

The output panel shows the most recent lines and automatically trims older ones.
