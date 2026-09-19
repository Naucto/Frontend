function _draw()
  gfx.clear(0)
  -- The seeded map is tall; its floor is the last row, so the bottom of it is what is shown.
  local base = 180 - map.height() * 8
  gfx.camera(-40, -20)
  map.draw(0, base)
  gfx.draw_sprite(1, 16, 100)
  gfx.camera()
  -- Where the sprite lands without the camera, so the shift can be read off the picture.
  gfx.rect(16, 100, 8, 8, 6)
  gfx.print("gfx.camera(-40, -20)", 8, 8, 6)
end
