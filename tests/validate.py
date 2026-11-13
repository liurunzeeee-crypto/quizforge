from pathlib import Path
import re

from lxml import html as LH

base = Path(__file__).resolve().parent.parent
final = (base / 'dist' / '题目检测生成器.html').read_text(encoding='utf-8')
quiz_html = (base / 'src' / 'quiz.html').read_text(encoding='utf-8')
quiz_js = (base / 'src' / 'quiz.js').read_text(encoding='utf-8')

doc = LH.fromstring(final)
ids = doc.xpath('//*[@id]/@id')
dups = sorted({i for i in ids if ids.count(i) > 1})
print('builder ids:', len(ids), 'duplicates:', dups)

scripts = doc.xpath('//script')
texts = [s.text or '' for s in scripts]
print('scripts:', len(scripts))
template_idx = next((i for i, t in enumerate(texts) if 'var QUIZ_TEMPLATE = "' in t), -1)
app_idx = next((i for i, t in enumerate(texts) if '题目检测生成器 · V1.10 · core' in t), -1)
print('quiz template script:', template_idx)
print('app script:', app_idx)
print('pdf.js main present:', any('pdfjsLib' in t for t in texts))
print('pdf worker source present:', any('PDFJS_WORKER_SOURCE' in t for t in texts))
print('cmap data present:', any('PDF_CMAP_DATA' in t for t in texts))
assert template_idx >= 0 and app_idx >= 0

app = texts[app_idx]
refs = set(re.findall(r"\$\('#([A-Za-z0-9_-]+)'\)", app))
dynamic = {'m-img', 'm-issue', 'm-judge', 'm-multi', 'm-noans', 'm-ready', 'm-single', 'm-total', 'btnGoEditReport'}
missing = sorted(r for r in refs if r not in ids and r not in dynamic)
print('builder id refs:', len(refs), 'missing:', missing)

qdoc = LH.fromstring(quiz_html)
qids = set(qdoc.xpath('//*[@id]/@id'))
qrefs = set(re.findall(r"\$\('([A-Za-z0-9_-]+)'\)", quiz_js))
print('quiz id refs:', len(qrefs), 'missing:', sorted(qrefs - qids))

print('unreplaced markers:', re.findall(r'/\*__[A-Z_]+__\*/', final))
print('chars:', len(final), 'bytes:', len(final.encode('utf-8')))
print('doctype:', final[:15])
