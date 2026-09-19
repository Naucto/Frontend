-- The scene draws its sky as colour 0; the beam repaints colour 0 on every line, so the sky
-- is a gradient the scene never drew. The lower third is shifted by a sine of its line.
function _draw()
  gfx.clear(0)
  map.draw(0, 180 - map.height() * 8)
  gfx.draw_sprite(1, 100, 60, 1, 1, false, false, 4)
  gfx.print("_scanline: set_color + shift", 8, 8, 6)
end

function _scanline(y)
  local t = y / 179
  gfx.set_color(0, 24 + 40 * t, 32 + 120 * t, 96 + 140 * t)
  if y >= 120 then
    gfx.shift(math.sin((y + sys.frame()) / 9) * 6, 0, true)
  end
end
