# 버전 올리기: python tools/bump-version.py 2026.11.28a
# config.js 의 GAME_VERSION 과 index.html 의 ?v= (캐시 꼬임 방지) 를 같이 바꿈
import re, sys, pathlib
V = sys.argv[1]
root = pathlib.Path(__file__).resolve().parent.parent
idx = root / 'index.html'
s = idx.read_text(encoding='utf-8')
s = re.sub(r'\?v=[0-9A-Za-z.\-]+"', f'?v={V}"', s)
idx.write_text(s, encoding='utf-8')
cfg = root / 'js' / 'config.js'
c = cfg.read_text(encoding='utf-8')
c = re.sub(r"GAME_VERSION: '[^']*'", f"GAME_VERSION: '{V}'", c, count=1)
cfg.write_text(c, encoding='utf-8')
print('version ->', V)
