let SessionLoad = 1
let s:so_save = &g:so | let s:siso_save = &g:siso | setg so=0 siso=0 | setl so=-1 siso=-1
let v:this_session=expand("<sfile>:p")
doautoall SessionLoadPre
silent only
silent tabonly
cd ~/Documents/Projets/Naucto/Frontend
if expand('%') == '' && !&modified && line('$') <= 1 && getline(1) == ''
  let s:wipebuf = bufnr('%')
endif
let s:shortmess_save = &shortmess
set shortmess+=aoO
badd +196 src/modules/editor/multiplayer/MultiplayerSettingsEditor.tsx
badd +86 src/providers/editors/MultiplayerSettingsProvider.ts
badd +1001 term://~/Documents/Projets/Naucto/Frontend//155401:/usr/bin/zsh
badd +96 term://~/Documents/Projets/Naucto/Frontend//849350:/usr/bin/zsh
badd +26 src/components/ui/StyledTable.tsx
badd +65 term://~/Documents/Projets/Naucto/Frontend//976959:/usr/bin/zsh
argglobal
%argdel
edit src/modules/editor/multiplayer/MultiplayerSettingsEditor.tsx
let s:save_splitbelow = &splitbelow
let s:save_splitright = &splitright
set splitbelow splitright
wincmd _ | wincmd |
vsplit
wincmd _ | wincmd |
vsplit
2wincmd h
wincmd w
wincmd w
let &splitbelow = s:save_splitbelow
let &splitright = s:save_splitright
wincmd t
let s:save_winminheight = &winminheight
let s:save_winminwidth = &winminwidth
set winminheight=0
set winheight=1
set winminwidth=0
set winwidth=1
exe 'vert 1resize ' . ((&columns * 106 + 159) / 318)
exe 'vert 2resize ' . ((&columns * 105 + 159) / 318)
exe 'vert 3resize ' . ((&columns * 105 + 159) / 318)
argglobal
if bufexists(fnamemodify("term://~/Documents/Projets/Naucto/Frontend//155401:/usr/bin/zsh", ":p")) | buffer term://~/Documents/Projets/Naucto/Frontend//155401:/usr/bin/zsh | else | edit term://~/Documents/Projets/Naucto/Frontend//155401:/usr/bin/zsh | endif
if &buftype ==# 'terminal'
  silent file term://~/Documents/Projets/Naucto/Frontend//155401:/usr/bin/zsh
endif
balt term://~/Documents/Projets/Naucto/Frontend//849350:/usr/bin/zsh
setlocal foldmethod=manual
setlocal foldexpr=0
setlocal foldmarker={{{,}}}
setlocal foldignore=#
setlocal foldlevel=0
setlocal foldminlines=1
setlocal foldnestmax=20
setlocal foldenable
let s:l = 1215 - ((94 * winheight(0) + 49) / 99)
if s:l < 1 | let s:l = 1 | endif
keepjumps exe s:l
normal! zt
keepjumps 1215
normal! 03|
lcd ~/Documents/Projets/Naucto/Frontend
wincmd w
argglobal
balt ~/Documents/Projets/Naucto/Frontend/src/providers/editors/MultiplayerSettingsProvider.ts
setlocal foldmethod=manual
setlocal foldexpr=0
setlocal foldmarker={{{,}}}
setlocal foldignore=#
setlocal foldlevel=0
setlocal foldminlines=1
setlocal foldnestmax=20
setlocal foldenable
silent! normal! zE
let &fdl = &fdl
let s:l = 196 - ((74 * winheight(0) + 49) / 99)
if s:l < 1 | let s:l = 1 | endif
keepjumps exe s:l
normal! zt
keepjumps 196
normal! 028|
lcd ~/Documents/Projets/Naucto/Frontend
wincmd w
argglobal
if bufexists(fnamemodify("term://~/Documents/Projets/Naucto/Frontend//849350:/usr/bin/zsh", ":p")) | buffer term://~/Documents/Projets/Naucto/Frontend//849350:/usr/bin/zsh | else | edit term://~/Documents/Projets/Naucto/Frontend//849350:/usr/bin/zsh | endif
if &buftype ==# 'terminal'
  silent file term://~/Documents/Projets/Naucto/Frontend//849350:/usr/bin/zsh
endif
balt ~/Documents/Projets/Naucto/Frontend/src/providers/editors/MultiplayerSettingsProvider.ts
setlocal foldmethod=manual
setlocal foldexpr=0
setlocal foldmarker={{{,}}}
setlocal foldignore=#
setlocal foldlevel=0
setlocal foldminlines=1
setlocal foldnestmax=20
setlocal foldenable
let s:l = 629 - ((98 * winheight(0) + 49) / 99)
if s:l < 1 | let s:l = 1 | endif
keepjumps exe s:l
normal! zt
keepjumps 629
normal! 07|
lcd ~/Documents/Projets/Naucto/Frontend
wincmd w
2wincmd w
exe 'vert 1resize ' . ((&columns * 106 + 159) / 318)
exe 'vert 2resize ' . ((&columns * 105 + 159) / 318)
exe 'vert 3resize ' . ((&columns * 105 + 159) / 318)
tabnext 1
if exists('s:wipebuf') && len(win_findbuf(s:wipebuf)) == 0 && getbufvar(s:wipebuf, '&buftype') isnot# 'terminal'
  silent exe 'bwipe ' . s:wipebuf
endif
unlet! s:wipebuf
set winheight=1 winwidth=20
let &shortmess = s:shortmess_save
let &winminheight = s:save_winminheight
let &winminwidth = s:save_winminwidth
let s:sx = expand("<sfile>:p:r")."x.vim"
if filereadable(s:sx)
  exe "source " . fnameescape(s:sx)
endif
let &g:so = s:so_save | let &g:siso = s:siso_save
set hlsearch
doautoall SessionLoadPost
unlet SessionLoad
" vim: set ft=vim :
