function _draw()
  gfx.clear(0)
  local ty = map.height() - 10
  gfx.fill_rect(16, 40, 96, 80, 15)
  map.draw(16, 40, 4, ty, 12, 10)
  map.set(9, ty + 4, 0)
  gfx.fill_rect(208, 40, 96, 80, 15)
  map.draw(208, 40, 4, ty, 12, 10)
  -- The edit lasts the run, so the next frame's "before" would show the hole too.
  map.set(9, ty + 4, 1)
  gfx.rect(56, 72, 8, 8, 7)
  gfx.rect(248, 72, 8, 8, 7)
  gfx.print("before", 52, 128, 5)
  gfx.print("map.set(9, " .. (ty + 4) .. ", 0)", 220, 128, 5)
end
