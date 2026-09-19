function _draw()
  gfx.clear(1)
  local ty = map.height() - 12
  map.draw(40, 20, 4, ty, 12, 8)
  gfx.rect(40, 20, 96, 64, 6)
  gfx.print("map.draw(40, 20, 4, " .. ty .. ", 12, 8)", 8, 160, 6)
end
