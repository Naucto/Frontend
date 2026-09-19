-- scene of: tag/steps/2.lua
-- A plain table stands in for net.state and a stub for net.id(), so the scene needs no session.

W, H        = 320, 180
PLAYER_SIZE = 8

COL_BG = 0   -- black
COL_IT = 2   -- red

net.id = function() return 1 end
net.state = {
  it = 1,
  players = {
    ["1"] = { x = 72,  y = 56,  col = 11 },
    ["2"] = { x = 204, y = 104, col = 13 },
    ["3"] = { x = 148, y = 136, col = 4 },
  },
}

function draw_players()
  for id, p in pairs(net.state.players or {}) do
    gfx.fill_rect(p.x, p.y, PLAYER_SIZE, PLAYER_SIZE, p.col)

    if tonumber(id) == net.state.it then
      gfx.rect(p.x - 2, p.y - 2, PLAYER_SIZE + 4, PLAYER_SIZE + 4, COL_IT)
    end
  end
end

function _draw()
  gfx.clear(COL_BG)
  draw_players()

  -- Red arena border when you are the one chasing
  if net.state.it == net.id() then
    gfx.rect(0, 0, W, H, COL_IT)
  end
end
