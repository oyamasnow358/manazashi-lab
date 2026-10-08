# つかいかた： まなざしラボ フォルダで  python _src/build.py
import io, hashlib
R = lambda p: io.open(p, encoding='utf-8').read()
s = R('_src/src.html')
s = s.replace('/*__ANALYSIS__*/', R('_src/analysis.js').rstrip() + '\n' + R('_src/jasay.js').rstrip() + '\n')
for key, f in [('APP', 'app.js'), ('TASKS', 'tasks.js'), ('REPORT', 'report.js'), ('BOOT', 'boot.js')]:
    s = s.replace('/*__%s__*/' % key, R('_src/' + f).rstrip() + '\n')
io.open('index.html', 'w', encoding='utf-8', newline='\n').write(s)
h = hashlib.sha1(s.encode('utf-8')); h.update(open('vendor/vision_bundle.js', 'rb').read())
io.open('sw.js', 'w', encoding='utf-8', newline='\n').write(R('_src/sw.js').replace('__VER__', h.hexdigest()[:10]))
print('built', len(s), 'sw', h.hexdigest()[:10])
