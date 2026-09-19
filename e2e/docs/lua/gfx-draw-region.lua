function _draw()
  gfx.clear(0)
  -- The moon of a new game, sprites 1, 2, 17 and 18, as one 16 x 16 rectangle of the sheet.
  gfx.draw_region(8, 0, 16, 16, 48, 66)
  -- The same rectangle stretched to 32 x 32: dw and dh scale it.
  gfx.draw_region(8, 0, 16, 16, 160, 58, 32, 32)
  gfx.print("16 x 16", 32, 90, 6)
  gfx.print("dw 32, dh 32", 148, 98, 6)
end
