-- The lower half in silhouette: from line 90 down, every colour but the background shows as colour 1.
function _draw()
  gfx.clear(0)
  map.draw(0, 180 - map.height() * 8)
  gfx.draw_sprite(1, 100, 60, 1, 1, false, false, 4)
  gfx.print("gfx.screen_col(i, 1) from line 90", 8, 8, 6)
end

function _scanline(y)
  if y == 90 then
    for i = 2, 15 do gfx.screen_col(i, 1) end
  end
end
