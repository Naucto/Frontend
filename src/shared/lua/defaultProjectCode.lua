-- Naucto starter cart
-- Move the yellow moon with arrow keys or WASD.

local player = {
  x = 152,
  y = 82,
  sprites = {
    top_left = 1,
    top_right = 2,
    bottom_left = 17,
    bottom_right = 18
  },
  speed = 2
}

function _init()
  print("Welcome to Naucto!")
end

function _update()
  if key_pressed("ArrowLeft") or key_pressed("a") then
    player.x = player.x - player.speed
  end

  if key_pressed("ArrowRight") or key_pressed("d") then
    player.x = player.x + player.speed
  end

  if key_pressed("ArrowUp") or key_pressed("w") then
    player.y = player.y - player.speed
  end

  if key_pressed("ArrowDown") or key_pressed("s") then
    player.y = player.y + player.speed
  end
end

function _draw()
  clear(0)
  sprite(player.sprites.top_left, player.x, player.y, 1, 1)
  sprite(player.sprites.top_right, player.x + 8, player.y, 1, 1)
  sprite(player.sprites.bottom_left, player.x, player.y + 8, 1, 1)
  sprite(player.sprites.bottom_right, player.x + 8, player.y + 8, 1, 1)
end
