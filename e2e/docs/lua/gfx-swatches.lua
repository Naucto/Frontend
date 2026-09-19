function _draw()
  gfx.clear(0)
  gfx.print("Bubblegum 16", 8, 24, 5)
  for i = 0, 15 do
    local x = 8 + i * 19
    gfx.fill_rect(x, 48, 18, 72, i)
    -- Outlined so that 0 still reads as a band on the black clear.
    gfx.rect(x, 48, 18, 72, 5)
    gfx.print(tostring(i), x + (i < 10 and 7 or 5), 126, 5)
  end
end
