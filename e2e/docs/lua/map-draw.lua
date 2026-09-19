function _draw()
  gfx.clear(1)
  -- The seeded map is tall; its floor is the last row, so the bottom of it is what is shown.
  map.draw(0, 180 - map.height() * 8)
  gfx.print("map.draw(0, y)", 8, 8, 6)
end
