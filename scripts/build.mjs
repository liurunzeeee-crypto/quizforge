/* 构建：把拆分的源码装回一个完全自包含的 HTML 文件 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = (p) => fs.readFileSync(path.join(root, 'src', p), 'utf8');
const OUT = path.join(root, 'dist', '题目检测生成器.html');

const builderCss = src('builder.css');
const appJs = [src('app-core.js'), src('app-import.js'), src('app-pdf.js'), src('app-ui.js')].join('\n\n');
const quizCss = src('quiz.css');
const quizJs = src('quiz.js');

/* PDF.js（Apache-2.0）：主文件直接内联，worker 作为字符串按需求值，CMap 只内置中文 GB 系 */
const pdfjsDir = path.join(root, 'vendor', 'pdfjs');
const pdfjsMain = fs.readFileSync(path.join(pdfjsDir, 'pdf.min.js'), 'utf8');
const pdfjsWorker = fs.readFileSync(path.join(pdfjsDir, 'pdf.worker.min.js'), 'utf8');
if (/<\/script/i.test(pdfjsMain)) throw new Error('pdf.min.js 含有 </script，不能直接内联');
const cmapDir = path.join(pdfjsDir, 'cmaps');
const cmapData = {};
for (const name of fs.readdirSync(cmapDir)) {
  if (!name.endsWith('.bcmap')) continue;
  cmapData[name.slice(0, -'.bcmap'.length)] = fs.readFileSync(path.join(cmapDir, name)).toString('base64');
}
const pdfjsDataJs = 'var PDFJS_WORKER_SOURCE = ' + jsStringLiteral(pdfjsWorker) + ';\n' +
  'var PDF_CMAP_DATA = ' + JSON.stringify(cmapData) + ';';

let quizHtml = src('quiz.html');
if (!quizHtml.includes('/*__QUIZ_CSS__*/')) throw new Error('quiz.html 缺少 CSS 占位');
if (!quizHtml.includes('/*__QUIZ_JS__*/')) throw new Error('quiz.html 缺少 JS 占位');
quizHtml = quizHtml
  .replace('/*__QUIZ_CSS__*/', () => quizCss)
  .replace('/*__QUIZ_JS__*/', () => quizJs);

function jsStringLiteral(text) {
  return JSON.stringify(text)
    .replace(/<\//g, '<\\/')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const templateJs = 'var QUIZ_TEMPLATE = ' + jsStringLiteral(quizHtml) + ';';

let html = src('index.html');
if (!html.includes('/*__BUILDER_CSS__*/')) throw new Error('index.html 缺少 CSS 占位');
if (!html.includes('/*__QUIZ_TEMPLATE__*/')) throw new Error('index.html 缺少模板占位');
if (!html.includes('/*__PDFJS_MAIN__*/')) throw new Error('index.html 缺少 PDF.js 主文件占位');
if (!html.includes('/*__PDFJS_DATA__*/')) throw new Error('index.html 缺少 PDF.js 数据占位');
if (!html.includes('/*__APP_JS__*/')) throw new Error('index.html 缺少 JS 占位');

html = html
  .replace('/*__BUILDER_CSS__*/', () => builderCss)
  .replace('/*__PDFJS_MAIN__*/', () => pdfjsMain)
  .replace('/*__PDFJS_DATA__*/', () => pdfjsDataJs)
  .replace('/*__QUIZ_TEMPLATE__*/', () => templateJs)
  .replace('/*__APP_JS__*/', () => appJs);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, html, 'utf8');

const size = Buffer.byteLength(html, 'utf8');
console.log('built:', OUT);
console.log('bytes:', size, '(' + (size / 1024).toFixed(1) + ' KB)');
