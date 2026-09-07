/** Bubblegum 16 by PineTreePizza (via lospec) — default palette of a new game. */
export const BUBBLEGUM_16 = [
  '#16171a',
  '#7f0622',
  '#d62411',
  '#ff8426',
  '#ffd100',
  '#fafdff',
  '#ff80a4',
  '#ff2674',
  '#94216a',
  '#430067',
  '#234975',
  '#68aed4',
  '#bfff3c',
  '#10d275',
  '#007899',
  '#002859',
] as const;

/** PICO-8 palette — what v0 games were drawn with; kept on migration so old art is unchanged. */
export const PICO8_PALETTE = [
  '#000000',
  '#1d2b53',
  '#7e2553',
  '#008751',
  '#ab5236',
  '#5f574f',
  '#c2c3c7',
  '#fff1e8',
  '#ff004d',
  '#ffa300',
  '#ffec27',
  '#00e436',
  '#29adff',
  '#83769c',
  '#ff77a8',
  '#ffccaa',
] as const;

export const DEFAULT_GAME_CODE = `-- Naucto starter game
-- Move the moon with the arrow keys, WASD or a gamepad.

local player = {
  x = 152,
  y = 82,
  sprites = { tl = 1, tr = 2, bl = 17, br = 18 },
  speed = 2,
}

function _init()
  print("Welcome to Naucto!")
end

function _update()
  if input.btn("left") then player.x = player.x - player.speed end
  if input.btn("right") then player.x = player.x + player.speed end
  if input.btn("up") then player.y = player.y - player.speed end
  if input.btn("down") then player.y = player.y + player.speed end
end

function _draw()
  gfx.clear(0)
  gfx.draw_sprite(player.sprites.tl, player.x, player.y)
  gfx.draw_sprite(player.sprites.tr, player.x + 8, player.y)
  gfx.draw_sprite(player.sprites.bl, player.x, player.y + 8)
  gfx.draw_sprite(player.sprites.br, player.x + 8, player.y + 8)
end
`;

/** 16×16 moon drawn into sprites 1, 2, 17, 18 ('a' = gold, '.' = transparent). */
export const DEFAULT_PLAYER_SPRITE = [
  '.....aaaaaa.....',
  '....aaaaaaaaa...',
  '...aa.aaaaaaa...',
  '..aa...aaa......',
  '..a.....a.......',
  '.aaa...a........',
  '.aaaa.aa........',
  '.aaaaaa.........',
  '.aaaaaa........a',
  '.aaaaaaa......aa',
  '..aaaaaa.....aaa',
  '..aaaaaaa...aaaa',
  '...aaaaaaaaaaaa.',
  '....aaaaaaaaaa..',
  '.....aaaaaaaa...',
  '................',
] as const;

export const DEFAULT_PLAYER_SPRITE_INDICES = [1, 2, 17, 18] as const;
/** Palette slot used for the default sprite (gold in Bubblegum, yellow in PICO-8). */
export const DEFAULT_SPRITE_COLOUR = 4;
export const DEFAULT_SPRITE_COLOUR_V0 = 10;
