==============
Input
==============

``key_pressed``
===============

.. function:: key_pressed(key)

   Check whether a keyboard key is currently being held down.

   :param string key: Key name from the browser keyboard event.
   :returns: ``true`` if the key is pressed, ``false`` otherwise.

   This function uses the browser's ``event.key`` values, so the exact string matters.

Common key values
-----------------

+-------------------+---------------------------+
| Key               | String                    |
+===================+===========================+
| Left arrow        | ``"ArrowLeft"``           |
+-------------------+---------------------------+
| Right arrow       | ``"ArrowRight"``          |
+-------------------+---------------------------+
| Up arrow          | ``"ArrowUp"``             |
+-------------------+---------------------------+
| Down arrow        | ``"ArrowDown"``           |
+-------------------+---------------------------+
| Space bar         | ``" "``                   |
+-------------------+---------------------------+
| A key             | ``"a"``                   |
+-------------------+---------------------------+
| D key             | ``"d"``                   |
+-------------------+---------------------------+
| W key             | ``"w"``                   |
+-------------------+---------------------------+
| S key             | ``"s"``                   |
+-------------------+---------------------------+

.. warning::

   Key names are **case-sensitive**. ``"ArrowLeft"`` works, but ``"arrowleft"`` does not.

Examples
--------

.. code-block:: lua

   -- Arrow key movement
   if key_pressed("ArrowLeft") then
     player.x = player.x - 2
   end

   -- WASD movement
   if key_pressed("a") then player.x = player.x - 2 end
   if key_pressed("d") then player.x = player.x + 2 end
   if key_pressed("w") then player.y = player.y - 2 end
   if key_pressed("s") then player.y = player.y + 2 end

   -- Space bar action
   if key_pressed(" ") then
     jump()
   end
