-- The Pong tutorial's draw_game, as Step 4 leaves it: both paddles where the
-- host put them and the ball waiting in the centre, before anything moves it.
-- The shared table stands in for net.state, so the scene needs no session.

W, H      = 320, 180
PAD_W     = 4
PAD_H     = 28
BALL_SIZE = 4

COL_BG    = 0    -- black
COL_LEFT  = 11   -- light blue
COL_RIGHT = 2    -- red
COL_BALL  = 5    -- white

shared = {
  pads    = { left = (H - PAD_H) / 2, right = (H - PAD_H) / 2 },
  ball    = { x = (W - BALL_SIZE) / 2, y = (H - BALL_SIZE) / 2 },
  playing = true,
}

function draw_game()
  local pads = shared.pads
  local ball = shared.ball

  if pads then
    gfx.fill_rect(8, pads.left, PAD_W, PAD_H, COL_LEFT)
    gfx.fill_rect(W - 8 - PAD_W, pads.right, PAD_W, PAD_H, COL_RIGHT)
  end

  if ball and shared.playing and not shared.winner then
    gfx.fill_rect(ball.x, ball.y, BALL_SIZE, BALL_SIZE, COL_BALL)
  end
end

function _draw()
  gfx.clear(COL_BG)
  draw_game()
end
