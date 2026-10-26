# Theme palettes: light (L) and dark (D) for each theme. Keys match site.css tokens plus header tokens.
# bg surface ink muted line accent ai(accent-ink) bar hb(head bg) hi(head ink) hm(head muted) nl(nav line)
T = {}
def t(key, L, D): T[key] = (L, D)

t('classic',
  dict(bg='#f3f4f1', surface='#ffffff', ink='#1b1f24', muted='#5d6670', line='#d9ddd6', accent='#c9531c', ai='#ffffff', bar='#e7d3c6', hb='#ffffff', hi='#1b1f24', hm='#5d6670', nl='#1b1f24'),
  dict(bg='#14171b', surface='#1d2126', ink='#e9ebe6', muted='#9aa3ab', line='#30363d', accent='#ec7a43', ai='#1a0d06', bar='#4a3226', hb='#1d2126', hi='#e9ebe6', hm='#9aa3ab', nl='#e9ebe6'))
t('crt',
  dict(bg='#e9dcc4', surface='#fffaf0', ink='#2a1d12', muted='#6b5644', line='#d9c7a8', accent='#a5410e', ai='#ffffff', bar='#ecd2b8', hb='#3a2a1c', hi='#f6e7cf', hm='#cdb79a', nl='#ffb347'),
  dict(bg='#1c1510', surface='#121a17', ink='#d7f5e3', muted='#8fb3a1', line='#2b3a33', accent='#ffb000', ai='#1a1200', bar='#3a3016', hb='#120d09', hi='#f3e2c6', hm='#b39b7c', nl='#ffb000'))
t('commish',
  dict(bg='#dcbf94', surface='#fffdf6', ink='#2b1e12', muted='#4f3a26', line='#e3d6bf', accent='#9b1515', ai='#ffffff', bar='#f1d6c9', hb='#3b2a1a', hi='#fff3df', hm='#d6c1a2', nl='#ff6b5b'),
  dict(bg='#3a2a1b', surface='#2a241d', ink='#f2e8d8', muted='#c2b39c', line='#4a3e30', accent='#ff6b5b', ai='#2a0a06', bar='#5a2f28', hb='#1e150d', hi='#f6e7d2', hm='#bfa98a', nl='#ff6b5b'))
t('scoreboard',
  dict(bg='#efe6d6', surface='#ffffff', ink='#14171c', muted='#5b5f66', line='#ddd4c4', accent='#c8102e', ai='#ffffff', bar='#f2c9c9', hb='#0d1117', hi='#ffd23f', hm='#b9b39b', nl='#ffd23f'),
  dict(bg='#07090c', surface='#10151c', ink='#f4f1e8', muted='#a3a8b0', line='#252c36', accent='#ffb81c', ai='#1b1300', bar='#4a3a10', hb='#000000', hi='#ffd23f', hm='#a69f84', nl='#ff3b3b'))
t('cartoon',
  dict(bg='#fff7e0', surface='#ffffff', ink='#1a1033', muted='#5b4f73', line='#d9cfee', accent='#7b2ff7', ai='#ffffff', bar='#e3d4ff', hb='#00b3a7', hi='#1a1033', hm='#0a2e2a', nl='#1a1033'),
  dict(bg='#1b1036', surface='#251a47', ink='#f6f0ff', muted='#c0b2e6', line='#3d2f6b', accent='#ffe14d', ai='#1a1033', bar='#4a3a7a', hb='#0b6e66', hi='#ffffff', hm='#c6f2ec', nl='#ffe14d'))
t('miami',
  dict(bg='#fff1ea', surface='#ffffff', ink='#2a1238', muted='#6d4a73', line='#f2d3dc', accent='#d11a6e', ai='#ffffff', bar='#ffd0e4', hb='#ff7a8f', hi='#2a1238', hm='#4a1d3d', nl='#2a1238'),
  dict(bg='#1a0b2e', surface='#24123d', ink='#fff0fb', muted='#d3b7e0', line='#3d2463', accent='#ff4fa3', ai='#1a0b2e', bar='#5a2a6e', hb='#12062a', hi='#fff0fb', hm='#cfb3e8', nl='#00e5ff'))
t('xp',
  dict(bg='#dbeefe', surface='#fbfbf8', ink='#000000', muted='#3d4655', line='#cfcab4', accent='#0a58ca', ai='#ffffff', bar='#c9dbf8', hb='#245edb', hi='#ffffff', hm='#e3edff', nl='#ffb83b'),
  dict(bg='#0d1b2a', surface='#1e2533', ink='#eef3fb', muted='#a9b6c9', line='#34405a', accent='#6aa5ff', ai='#071530', bar='#29406b', hb='#10224d', hi='#ffffff', hm='#c5d4f0', nl='#4caf50'))
t('pokedex',
  dict(bg='#f1f1f1', surface='#ffffff', ink='#1d1d1f', muted='#5c5f66', line='#dedede', accent='#cc0a2a', ai='#ffffff', bar='#f6c4cc', hb='#c8102e', hi='#ffffff', hm='#fff3f5', nl='#ffde00'),
  dict(bg='#121316', surface='#1f2126', ink='#f2f2f2', muted='#a9adb5', line='#33363d', accent='#ff4d6a', ai='#1a0005', bar='#5a1d27', hb='#8e0018', hi='#ffffff', hm='#ffd1d9', nl='#ffde00'))
t('blockbuster',
  dict(bg='#eef2ff', surface='#ffffff', ink='#0b1a3f', muted='#4a5578', line='#d4dbf2', accent='#0b2d8c', ai='#ffd200', bar='#c9d4fb', hb='#0b2d8c', hi='#ffffff', hm='#c9d4ff', nl='#ffd200'),
  dict(bg='#06123a', surface='#0d1f5c', ink='#f1f4ff', muted='#b3bde0', line='#213478', accent='#ffd200', ai='#0b1a3f', bar='#2a3c86', hb='#041038', hi='#ffffff', hm='#c0c9ec', nl='#ffd200'))
t('foodcourt',
  dict(bg='#f4f1ec', surface='#ffffff', ink='#1c1630', muted='#5d5670', line='#e5dfd5', accent='#c43d00', ai='#ffffff', bar='#ffd2b8', hb='#1f1147', hi='#ffffff', hm='#c7bbff', nl='#ff6a00'),
  dict(bg='#120a24', surface='#1d1338', ink='#fff4ea', muted='#bfb2d9', line='#352a59', accent='#ff7a1a', ai='#1a0b00', bar='#5a2c10', hb='#0b0618', hi='#ffffff', hm='#bdb0e8', nl='#ff7a1a'))
t('lisafrank',
  dict(bg='#fff0fb', surface='#ffffff', ink='#2a0040', muted='#5d2b73', line='#f2c6ec', accent='#c2007d', ai='#ffffff', bar='#ffc2ec', hb='#ff2fb3', hi='#2a0040', hm='#3a0050', nl='#2a0040'),
  dict(bg='#1a0630', surface='#2a0d47', ink='#fff0fd', muted='#e2b8f0', line='#4a1f6e', accent='#ff5fd2', ai='#2a0040', bar='#6a2a7a', hb='#2a0040', hi='#ffffff', hm='#f0c8ff', nl='#4fd2ff'))
t('aim',
  dict(bg='#e8edf7', surface='#ffffff', ink='#000000', muted='#4d5566', line='#c8cfdc', accent='#0a46c4', ai='#ffffff', bar='#ffe066', hb='#0a3d91', hi='#ffffff', hm='#ffd400', nl='#ffcc00'),
  dict(bg='#000c2e', surface='#0f1e4a', ink='#f1f5ff', muted='#aebbdc', line='#26386e', accent='#ffcc00', ai='#0a1b4a', bar='#3a4a86', hb='#061a52', hi='#ffffff', hm='#ffd400', nl='#ffcc00'))
t('bookfair',
  dict(bg='#fff6dd', surface='#ffffff', ink='#1b1b3a', muted='#4f4f6b', line='#ecdcae', accent='#d6001c', ai='#ffffff', bar='#ffd7a8', hb='#0057b8', hi='#ffffff', hm='#ffe27a', nl='#ffcd00'),
  dict(bg='#0c1a40', surface='#142a5e', ink='#fff8e6', muted='#c8cbe6', line='#22407a', accent='#ffcd00', ai='#1b1b3a', bar='#3a4a7a', hb='#08122e', hi='#ffffff', hm='#ffe27a', nl='#e4002b'))
t('skate',
  dict(bg='#ead6b8', surface='#fffdf8', ink='#141414', muted='#514639', line='#e2cdb0', accent='#0c6b29', ai='#ffffff', bar='#c7efcf', hb='#1b1b1b', hi='#f4f4f4', hm='#c9c9c9', nl='#39ff6a'),
  dict(bg='#161616', surface='#222222', ink='#f2f2f2', muted='#b0b0b0', line='#3a3a3a', accent='#39ff6a', ai='#0b1a0f', bar='#1f5a2e', hb='#0d0d0d', hi='#ffffff', hm='#bdbdbd', nl='#ff2e9a'))
t('jacket',
  dict(bg='#dfe3e8', surface='#fbfbfc', ink='#101828', muted='#4a5568', line='#cfd6df', accent='#1d428a', ai='#ffffff', bar='#c9d6ef', hb='#c8102e', hi='#ffffff', hm='#ffe6e9', nl='#ffffff'),
  dict(bg='#121821', surface='#1b2430', ink='#f2f5f9', muted='#a9b4c4', line='#2e3a4b', accent='#6f9cff', ai='#071330', bar='#2a3d66', hb='#7a0a1c', hi='#ffffff', hm='#ffd5dc', nl='#ffffff'))
t('cereal',
  dict(bg='#fff3b0', surface='#ffffff', ink='#1a1a1a', muted='#5a4a1e', line='#f0d98a', accent='#d22727', ai='#ffffff', bar='#ffd0c2', hb='#c41f1f', hi='#ffffff', hm='#fff0c2', nl='#ffd60a'),
  dict(bg='#2a1a00', surface='#3a2600', ink='#fff6e0', muted='#e0c68f', line='#5a4310', accent='#ffb703', ai='#2a1a00', bar='#6a4a10', hb='#8a1010', hi='#ffffff', hm='#ffe0a0', nl='#ffd60a'))
t('doubledare',
  dict(bg='#fff4e8', surface='#ffffff', ink='#1f1a14', muted='#5c4b3a', line='#f2dcc4', accent='#bd4a00', ai='#ffffff', bar='#d8f0c4', hb='#ff6a13', hi='#1f1a14', hm='#3d2410', nl='#1f4a0a'),
  dict(bg='#0f1f0a', surface='#1a2e12', ink='#f3ffe9', muted='#b5d6a0', line='#2f4a22', accent='#8be04e', ai='#0f1f0a', bar='#3a5a20', hb='#9a3d00', hi='#ffffff', hm='#ffe0cc', nl='#8be04e'))
t('tamagotchi',
  dict(bg='#c5d19a', surface='#e3ebc8', ink='#0f380f', muted='#2b552b', line='#a9b97a', accent='#2e5f2e', ai='#e3ebc8', bar='#b6c98a', hb='#f6c1d0', hi='#3a1030', hm='#6a2a55', nl='#306230', ok='#1d4f12', warn='#6e4200', bad='#8f1b1b'),
  dict(bg='#0f1a0f', surface='#1a2b1a', ink='#c9f2a6', muted='#8fbf73', line='#2c442c', accent='#9bbc0f', ai='#0f380f', bar='#2f4f1f', hb='#2b1f3a', hi='#ffd6e6', hm='#e0a8c4', nl='#9bbc0f'))
t('yearbook',
  dict(bg='#f7f3ff', surface='#fffefa', ink='#1e1838', muted='#4f4870', line='#e4dcf5', accent='#7b2cbf', ai='#ffffff', bar='#e2cdf5', hb='#11b5b0', hi='#1e1838', hm='#10363a', nl='#1e1838'),
  dict(bg='#12101f', surface='#1d1a33', ink='#f4f0ff', muted='#b9b0dc', line='#332d55', accent='#c08cff', ai='#1e1838', bar='#4a3a7a', hb='#0b5e5b', hi='#ffffff', hm='#bff3ef', nl='#ff9ccf'))
t('coffee',
  dict(bg='#e9dcc4', surface='#fbf6ec', ink='#2b1d14', muted='#5e4a3a', line='#e2d2b6', accent='#2f5d3a', ai='#ffffff', bar='#d7e6cf', hb='#3b2416', hi='#f6e9d8', hm='#d1b89c', nl='#c8873f'),
  dict(bg='#17110c', surface='#241a13', ink='#f3e7d7', muted='#c4ae94', line='#3b2c20', accent='#d99a55', ai='#1b120b', bar='#4a3420', hb='#0f0a07', hi='#f3e7d7', hm='#bfa58a', nl='#6fa36f'))
t('nbc',
  dict(bg='#f2f2f2', surface='#ffffff', ink='#111111', muted='#555555', line='#dddddd', accent='#0051a5', ai='#ffffff', bar='#c7daf2', hb='#111111', hi='#ffffff', hm='#ffcc00', nl='#ffcc00'),
  dict(bg='#050505', surface='#141414', ink='#f5f5f5', muted='#b0b0b0', line='#2a2a2a', accent='#ffcc00', ai='#111111', bar='#3a3214', hb='#000000', hi='#ffffff', hm='#ffcc00', nl='#ffcc00'))
t('trash',
  dict(bg='#ead8cf', surface='#fffaf7', ink='#1e1414', muted='#5a4440', line='#ecd0c6', accent='#c1121f', ai='#ffffff', bar='#f8c9cd', hb='#1e1414', hi='#ffffff', hm='#ffb3ba', nl='#ff3b4e'),
  dict(bg='#1f1412', surface='#1a1716', ink='#f7eeec', muted='#c4aaa4', line='#3a2c29', accent='#ff4d5e', ai='#1e1414', bar='#5a1f26', hb='#0d0908', hi='#ffffff', hm='#ff9aa4', nl='#ff4d5e'))

OKWB = {'L': dict(ok='#18693b', warn='#87500b', bad='#a6221b'), 'D': dict(ok='#6fd39a', warn='#f2b766', bad='#ff8b80')}
MIX = 0.12
# classic = the live site, explicit chip backgrounds
CLASSIC_BG = {'L': dict(ok='#dcf1e3', warn='#fbecd6', bad='#fbe1de'), 'D': dict(ok='#173523', warn='#3a2a12', bad='#401b18')}
CLASSIC_OK = {'L': dict(ok='#1f7a46', warn='#9a5b0f', bad='#b3261e'), 'D': dict(ok='#6fd39a', warn='#f2b766', bad='#ff8b80')}
