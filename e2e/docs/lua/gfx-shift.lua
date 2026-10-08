-- The whole frame shifted by a fixed offset: the band it uncovers shows colour 0.
function _draw()
  gfx.clear(1)
  map.draw(0, 180 - map.height() * 8)
  gfx.draw_sprite(1, 100, 60, 1, 1, false, false, 4)
  gfx.print("gfx.shift(12, 6)", 8, 8, 6)
  gfx.shift(12, 6)
end
