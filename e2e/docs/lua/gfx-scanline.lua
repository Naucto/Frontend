function _draw()
  gfx.clear(1)
  map.draw(0, 180 - map.height() * 8)
  gfx.draw_sprite(1, 100, 60, 1, 1, false, false, 4)
  for y = 0, 179 do
    gfx.scanline(y, { shift_x = math.floor(math.sin(y / 9) * 6) })
  end
  gfx.print("gfx.scanline(y, {shift_x=})", 8, 8, 6)
end
