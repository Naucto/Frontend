function _init()
  print("player", 12, 34)
  sys.warn("too many enemies: " .. 70)
  sys.error("level " .. 3 .. " is missing")
end

function _draw()
  gfx.clear(0)
  gfx.print("see the Console", 130, 87, 5)
end
