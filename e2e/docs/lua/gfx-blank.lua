-- A letterbox: black above line 20 and from line 160 down, the picture between them.
function _draw()
  gfx.clear(11)
  map.draw(0, 180 - map.height() * 8)
  gfx.draw_sprite(1, 100, 60, 1, 1, false, false, 4)
  gfx.print("gfx.blank() on lines 0 and 160, blank(false) on 20", 8, 28, 15)
end

function _scanline(y)
  if y == 0 then gfx.blank() end
  if y == 20 then gfx.blank(false) end
  if y == 160 then gfx.blank() end
end
