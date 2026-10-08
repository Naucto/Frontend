function _draw()
  gfx.clear(0)
  gfx.clip(40, 30, 120, 80)
  gfx.fill_rect(0, 0, 320, 180, 4)
  for i = 0, 20 do gfx.fill_circle(i * 24, 60 + (i % 3) * 20, 10, 9) end
  gfx.clip()
  gfx.rect(40, 30, 120, 80, 6)
  gfx.print("gfx.clip(40, 30, 120, 80)", 8, 160, 6)
end
