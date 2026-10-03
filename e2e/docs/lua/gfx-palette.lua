function _draw()
  gfx.clear(0)
  for i = 0, 15 do gfx.fill_rect(8 + i * 19, 8, 18, 24, i) end
  gfx.set_color(4, "#00ffcc")
  gfx.fill_rect(8, 48, 96, 24, 4)
  gfx.print("set_color(4, '#00ffcc')", 112, 56, 5)
  gfx.set_col(9, 2)
  gfx.fill_rect(8, 88, 96, 24, 9)
  gfx.print("set_col(9, 2)", 112, 96, 5)
  gfx.reset_col()
end
