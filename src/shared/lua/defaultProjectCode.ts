export const DEFAULT_LUA_PROJECT_CODE = `-- Naucto starter cart
-- Move sprite 1 with arrow keys or WASD.

local player = {
  x = 160,
  y = 90,
  sprite = 1,
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
  sprite(player.sprite, player.x, player.y, 1, 1)
end
`;
