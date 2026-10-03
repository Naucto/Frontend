-- scene of: click-race/steps/3.lua
-- A plain table stands in for net.state and a stub for net.id(), so the scene needs no session.

W, H        = 320, 180
PLAYER_SIZE = 8
COIN_SIZE   = 4
COIN_COUNT  = 5

COL_BG   = 0   -- black
COL_COIN = 4   -- yellow
COL_RING = 5   -- white

net.id = function() return 1 end
net.state = {
  players = {
    ["1"] = { x = 64,  y = 96,  col = 2,  score = 0 },
    ["2"] = { x = 212, y = 60,  col = 11, score = 0 },
  },
  coins = {
    { x = 40,  y = 40,  taken = false },
    { x = 150, y = 120, taken = false },
    { x = 240, y = 140, taken = false },
    { x = 110, y = 24,  taken = false },
    { x = 280, y = 84,  taken = false },
  },
}

function draw_players()
  local row = 0
  for id, p in pairs(net.state.players or {}) do
    gfx.fill_rect(p.x, p.y, PLAYER_SIZE, PLAYER_SIZE, p.col)

    if tonumber(id) == net.id() then
      gfx.rect(p.x - 2, p.y - 2, PLAYER_SIZE + 4, PLAYER_SIZE + 4, COL_RING)   -- highlight yourself
    end

    for i = 1, p.score do
      gfx.fill_rect(4 + (i - 1) * 6, 4 + row * 8, 4, 4, p.col)
    end
    row = row + 1
  end
end

function draw_coins()
  local coins = net.state.coins
  if not coins then
    return
  end

  for i = 1, COIN_COUNT do
    local coin = coins[i]
    if coin and not coin.taken then
      gfx.fill_rect(coin.x, coin.y, COIN_SIZE, COIN_SIZE, COL_COIN)
    end
  end
end

function _draw()
  gfx.clear(COL_BG)
  draw_coins()
  draw_players()
end
