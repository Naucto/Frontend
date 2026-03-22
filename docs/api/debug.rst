=========
Debug
=========

``print``
=========

.. function:: print(...)

   Write text to the engine output panel.

   :param ...: One or more values to display. Values are converted to strings and joined with tabs.

   Each ``print()`` call adds a new line to the output panel. The panel keeps the most recent lines
   and trims older ones automatically.

   This is your primary debugging tool. Use it to inspect positions, state, health, score, or
   any other value while developing your game.

   .. code-block:: lua

      print("player", player.x, player.y)
      print("health:", player.hp, "score:", score)
      print("on_ground:", player.on_ground)

.. tip::

   Add ``print()`` calls liberally while building your game, then remove them when everything
   works as expected. They have no visual effect on the game canvas -- output only appears in
   the dedicated panel.
