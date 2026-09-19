-- A screenshake: the whole frame shifted by a random offset that fades over a second.
function _draw()
  gfx.clear(1)
  map.draw(0, 180 - map.height() * 8)
  gfx.draw_sprite(1, 100, 60, 1, 1, false, false, 4)
  local left = 60 - sys.frame() % 60
  local amount = 1 + left // 12
  gfx.shift(math.random(-amount, amount), math.random(-amount, amount))
  gfx.print("gfx.shift(dx, dy)", 8, 8, 6)
end
