function _draw()
  gfx.clear(0)
  gfx.print("Hello, Naucto!", 8, 8)
  gfx.print("colour 4", 8, 24, 4)
  gfx.print("colour 9", 8, 40, 9)
  gfx.print("Score: " .. 1280, 8, 64, 6)
end
