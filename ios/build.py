# Копия сборника для iPhone-приложения: public/ → ios/Games/site/ (запуск: python3 ios/build.py, release.sh делает это сам).
# Берём всё, что нужно страницам; служебное для сайта (sw.js, _headers, og.jpg) не берём: в приложении офлайн и так.
# Единственная правка — ссылка-приглашение в сетевую комнату: в приложении адрес страницы свой (dvoeplay-app://),
# а друг откроет ссылку в браузере, поэтому она ведёт на сайт сборника.
import pathlib, shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'public'
OUT = ROOT / 'ios' / 'Games' / 'site'
SITE = 'https://dvoeplay.netlify.app/'
SKIP = {'sw.js', '_headers', 'og.jpg'}

if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir(parents=True)
for f in sorted(SRC.iterdir()):
    if f.is_file() and f.name not in SKIP and not f.name.startswith('.'):
        shutil.copyfile(f, OUT / f.name)

net = OUT / 'net.js'
s = net.read_text(encoding='utf-8')
a = "var url = location.origin + location.pathname + '?room=' + api_.code;"
assert s.count(a) == 1, 'net.js: не найдена строка ссылки-приглашения'
s = s.replace(a, "var url = '" + SITE + "' + location.pathname.split('/').pop() + '?room=' + api_.code;   /* iPhone-приложение: ссылка ведёт на сайт */")
net.write_text(s, encoding='utf-8')

print('готово:', OUT, '—', len(list(OUT.iterdir())), 'файлов')
