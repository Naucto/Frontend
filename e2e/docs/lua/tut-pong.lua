-- The Pong tutorial's draw_game and draw_score on a rally in progress: the
-- paddles apart, the ball crossing the court, the left side ahead 2 to 1.
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
  pads    = { left = 44, right = 108 },
  score   = { left = 2, right = 1 },
  ball    = { x = 196, y = 70 },
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

function draw_score()
  local score = shared.score
  if not score then
    return
  end

  for i = 1, score.left do
    gfx.fill_rect(8 + (i - 1) * 6, 6, 4, 4, COL_LEFT)
  end
  for i = 1, score.right do
    gfx.fill_rect(W - 8 - (i - 1) * 6 - 4, 6, 4, 4, COL_RIGHT)
  end
end

function _draw()
  gfx.clear(COL_BG)
  draw_game()
  draw_score()
end
