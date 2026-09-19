-- Fifteen bands of twelve lines, each given its own sixteen colours by the beam: the picture is
-- drawn once with sixteen indices, and shows 240 colours. A band has one hue, and its sixteen
-- indices go from dark to light in it, so the sixteen-index pattern stays visible in every band.
local BAND = 12
local BANDS = 180 // BAND

local function hue(h)
  local x = 1 - math.abs((h / 60) % 2 - 1)
  if h < 60 then return 1, x, 0
  elseif h < 120 then return x, 1, 0
  elseif h < 180 then return 0, 1, x
  elseif h < 240 then return 0, x, 1
  elseif h < 300 then return x, 0, 1
  else return 1, 0, x end
end

local function shade(h, l)
  local r, g, b = hue(h)
  if l < 0.5 then
    r, g, b = r * 2 * l, g * 2 * l, b * 2 * l
  else
    local w = 2 * l - 1
    r, g, b = r + (1 - r) * w, g + (1 - g) * w, b + (1 - b) * w
  end
  return { r * 255, g * 255, b * 255 }
end

-- bands[b][i]: the colour band b (from 1) shows for index i (from 0), 240 in all
local bands = {}

function _init()
  for b = 1, BANDS do
    bands[b] = {}
    for i = 0, 15 do
      bands[b][i] = shade((b - 1) * 360 / BANDS, 0.08 + 0.84 * i / 15)
    end
  end
end

local drawn = false

function _draw()
  if drawn then return end
  for y = 0, 179, 4 do
    for x = 0, 319, 4 do
      local v = math.sin(x / 23) + math.sin(y / 17) + math.sin((x + y) / 31)
      gfx.fill_rect(x, y, 4, 4, math.floor((v + 3) / 6 * 16) % 16)
    end
  end
  drawn = true
end

function _scanline(y)
  if y % BAND == 0 then
    local band = bands[y // BAND + 1]
    for i = 0, 15 do
      local c = band[i]
      gfx.set_color(i, c[1], c[2], c[3])
    end
  end
end
