import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9333;
const profile = path.join(os.tmpdir(), 'dsh-quiz-e2e-' + process.pid);
const shotDir = path.join(root, 'tests', '.tmp', 'shots');
fs.mkdirSync(shotDir, { recursive: true });
fs.mkdirSync(path.join(root, 'tests', '.tmp'), { recursive: true });
fs.rmSync(profile, { recursive: true, force: true });

const builderPath = path.join(root, 'dist', '题目检测生成器.html');
const builderUrl = pathToFileURL(builderPath).href;
const docxPath = path.join(root, 'tests', 'fixtures', '图片题测试.docx');
const quizOut = path.join(root, 'tests', '.tmp', 'generated-quiz.html');
const quizUrl = pathToFileURL(quizOut).href;

const args = [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--allow-file-access-from-files',
  '--user-data-dir=' + profile,
  '--remote-debugging-port=' + port,
  '--window-size=1440,1100',
  'about:blank'
];
const proc = spawn(chrome, args, { stdio: 'ignore' });

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function waitPort() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return;
    } catch (e) {}
    await sleep(100);
  }
  throw new Error('Chrome 调试端口未启动');
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    this.ready = new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
    this.ws.addEventListener('message', ev => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message + ' ' + JSON.stringify(msg.error.data || '')));
        else resolve(msg.result);
      } else if (msg.method) {
        const list = this.events.get(msg.method) || [];
        for (const fn of list) fn(msg.params);
        if (this.onEvent) this.onEvent(msg.method, msg.params);
      }
    });
  }
  async send(method, params = {}) {
    await this.ready;
    const id = this.nextId++;
    const p = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.ws.send(JSON.stringify({ id, method, params }));
    return p;
  }
  once(method) {
    return new Promise(resolve => {
      const list = this.events.get(method) || [];
      const fn = params => {
        this.events.set(method, (this.events.get(method) || []).filter(x => x !== fn));
        resolve(params);
      };
      list.push(fn);
      this.events.set(method, list);
    });
  }
  close() { try { this.ws.close(); } catch (e) {} }
}

const logs = [];
let cdp;

async function evaljs(expression, opts = {}) {
  const r = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
    ...opts
  });
  if (r.exceptionDetails) {
    throw new Error('Eval error: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  }
  return r.result.value;
}

async function screenshot(name) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const p = path.join(shotDir, name);
  fs.writeFileSync(p, Buffer.from(r.data, 'base64'));
  console.log('shot:', p);
}

async function waitFor(expr, timeout = 15000, label = expr) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      if (await evaljs(expr)) return true;
    } catch (e) {}
    await sleep(120);
  }
  throw new Error('等待超时: ' + label);
}

async function navigate(url) {
  const loaded = cdp.once('Page.loadEventFired');
  await cdp.send('Page.navigate', { url });
  await Promise.race([loaded, sleep(8000)]);
  await sleep(250);
}

let failed = 0;
function check(name, ok, extra = '') {
  if (ok) console.log('ok  -', name);
  else { console.error('FAIL-', name, extra); failed++; }
}

try {
  await waitPort();
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = list.find(t => t.type === 'page');
  cdp = new CDP(page.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false
  });
  cdp.onEvent = (method, params) => {
    if (method === 'Runtime.exceptionThrown') {
      logs.push('EXCEPTION ' + (params.exceptionDetails?.exception?.description || params.exceptionDetails?.text));
    } else if (method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(params.type)) {
      logs.push('CONSOLE ' + params.type + ' ' + params.args.map(a => a.value ?? a.description ?? '').join(' '));
    } else if (method === 'Log.entryAdded' && ['error', 'warning'].includes(params.entry.level)) {
      logs.push('LOG ' + params.entry.level + ' ' + params.entry.text);
    }
  };

  await navigate(builderUrl);
  check('builder 加载', await evaljs('!!window.__builder && document.querySelectorAll(".tab").length === 4'));
  check('无首屏异常', !logs.some(x => x.startsWith('EXCEPTION')), logs.join('\n'));

  await evaljs('document.querySelector("#btnDemo").click(); document.querySelector("#btnParse").click();');
  await sleep(500);
  const demo = await evaljs(`(() => { const q = __builder.state.questions; return {
    n: q.length,
    types: q.map(x=>x.type),
    q3: q[2] && q[2].options,
    q4: q[3] && q[3].options,
    answers: q.map(x=>x.answer)
  }; })()`);
  check('示例解析 6 题', demo.n === 6, JSON.stringify(demo));
  check('只有字母的选项被正确解析', JSON.stringify(demo.q4) === JSON.stringify(['C', 'B', 'S', 'N']), JSON.stringify(demo.q4));
  check('答案区间 1-4 / 5.ACD / 6.A 生效',
    demo.answers[0].join() === '1' && demo.answers[2].join() === '2' &&
    demo.answers[4].join() === '0,2,3' && demo.answers[5].join() === '0',
    JSON.stringify(demo.answers));

  await evaljs(`document.querySelector('#rawInput').value = ${JSON.stringify(`17. 在 Photoshop CC中,下列方法能删除路径的是 ( )
A. 将路径拖动到“路径”调板底部的“删除当前路径”按钮上
B. 选择要删除的路径，双击“删除当前路径”命令
C. 选择要删除的路径，在“路径”调板菜单中选择“删除路径”命令
D. 选择要删除的路径，单击“路径”调板底部的“删除当前路径”按钮
C.用前景色描边整条路径
D.转为封闭选区`)}; document.querySelector('#btnParse').click();`);
  await sleep(500);
  const png1 = await evaljs(`(() => { const q=__builder.state.questions[0]; return {n:__builder.state.questions.length, d:q.options[3], frags:document.querySelectorAll('#parseReport .frag').length}; })()`);
  check('png1 只解析 1 题', png1.n === 1);
  check('png1 D 选项不再被 C/D 污染', png1.d === '选择要删除的路径，单击“路径”调板底部的“删除当前路径”按钮', png1.d);
  check('png1 未归属片段有提示', png1.frags >= 1, String(png1.frags));

  // 单题「整理选项」按钮
  await evaljs(`(() => {
    __builder.state.questions.push(__builder.makeQuestion({stem:'整理测试 A. 甲 B. 乙 C. 丙 D. 丁', options:['','','','']}));
    __builder.renderList();
    window.confirm = () => true;
    const cards = document.querySelectorAll('.qedit');
    cards[cards.length-1].querySelector('[data-act=resplit]').click();
  })()`);
  await sleep(400);
  const resplit = await evaljs(`(() => {
    const q = __builder.state.questions[__builder.state.questions.length-1];
    return { stem:q.stem, opts:q.options, cards:document.querySelectorAll('.qedit').length };
  })()`);
  check('单题整理选项可用', JSON.stringify(resplit.opts) === JSON.stringify(['甲', '乙', '丙', '丁']) && resplit.stem === '整理测试', JSON.stringify(resplit));

  // DOCX 导入（含图片）
  await evaljs(`document.querySelector('#rawInput').value=''; document.querySelector('#answerInput').value='';`);
  const doc = await cdp.send('DOM.getDocument', { depth: -1 });
  const q = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: '#fileInput' });
  check('找到 DOCX 文件输入', !!q.nodeId, String(q.nodeId));
  await cdp.send('DOM.setFileInputFiles', { files: [docxPath], nodeId: q.nodeId });
  await waitFor(`(() => { const t=document.querySelector('#rawInput').value; return t.includes('[图1]') && t.includes('观察下面的图片'); })()`, 25000, 'DOCX 导入');
  const docxInfo = await evaljs(`(() => ({
    len: document.querySelector('#rawInput').value.length,
    imgs: Object.keys(__builder.state.assets).length,
    hint: document.querySelector('#fileHint').textContent,
    tokens: (document.querySelector('#rawInput').value.match(/\\[图\\d+\\]/g)||[]).length
  }))()`);
  check('DOCX 文本已提取', docxInfo.len > 100, JSON.stringify(docxInfo));
  check('DOCX 图片已提取', docxInfo.imgs >= 3, JSON.stringify(docxInfo));
  check('DOCX 图片标记已插入', docxInfo.tokens >= 3, JSON.stringify(docxInfo));

  await evaljs('document.querySelector("#btnParse").click();');
  await sleep(900);
  const docxQ = await evaljs(`(() => { const q=__builder.state.questions; return {
    n:q.length,
    imgs:q.map(x=>x.images.length),
    opt0:q[0] && q[0].options[0],
    opt1:q[0] && q[0].options[1],
    q2stem:q[1] && q[1].stem,
    q3opts:q[2] && q[2].options,
    types:q.map(x=>x.type)
  }; })()`);
  check('DOCX 解析出 3 题', docxQ.n === 3, JSON.stringify(docxQ));
  check('DOCX 选项图片已挂到题目', docxQ.imgs[0] >= 2, JSON.stringify(docxQ.imgs));
  check('DOCX 题干图片已挂到题目', docxQ.imgs[1] >= 1, JSON.stringify(docxQ.imgs));
  check('DOCX 表格选项已解析', JSON.stringify(docxQ.q3opts) === JSON.stringify(['甲', '乙', '丙', '丁']), JSON.stringify(docxQ.q3opts));

  // 重复点「解析题目」时，图片不应丢失
  await evaljs('document.querySelector("#btnParse").click();');
  await sleep(700);
  const reparsed = await evaljs(`(() => { const q=__builder.state.questions; return {
    n:q.length, imgs:q.map(x=>x.images.length), assets:Object.keys(__builder.state.assets).length
  }; })()`);
  check('重复解析仍保留图片', reparsed.n === 3 && reparsed.imgs[0] >= 2 && reparsed.imgs[1] >= 1, JSON.stringify(reparsed));

  // 文字版 PDF：自动提取文字 + 图片
  await evaljs(`document.querySelector('#rawInput').value=''; document.querySelector('#answerInput').value='';`);
  const pdfDoc = await cdp.send('DOM.getDocument', { depth: -1 });
  const pdfInput = await cdp.send('DOM.querySelector', { nodeId: pdfDoc.root.nodeId, selector: '#fileInput' });
  await cdp.send('DOM.setFileInputFiles', { files: [path.join(root, 'tests', 'fixtures', '图片题测试.pdf')], nodeId: pdfInput.nodeId });
  await waitFor(`(() => { const t=document.querySelector('#rawInput').value; return t.includes('[图1]') && t.includes('观察下面的图片'); })()`, 45000, 'PDF 导入');
  const pdfRaw = await evaljs(`(() => ({
    len: document.querySelector('#rawInput').value.length,
    imgs: Object.keys(__builder.state.assets).length,
    tokens: (document.querySelector('#rawInput').value.match(/\\[图\\d+\\]/g)||[]).length,
    hint: document.querySelector('#fileHint').textContent,
    text: document.querySelector('#rawInput').value.slice(0,400)
  }))()`);
  check('PDF 文本已提取', pdfRaw.len > 100, JSON.stringify(pdfRaw));
  check('PDF 图片标记已插入', pdfRaw.tokens >= 4, JSON.stringify(pdfRaw));
  await evaljs('document.querySelector("#btnParse").click();');
  await sleep(1200);
  const pdfQ = await evaljs(`(() => { const q=__builder.state.questions; return {
    n:q.length,
    imgs:q.map(x=>x.images.length),
    assets:Object.keys(__builder.state.assets).length,
    stem0:q[0] && q[0].stem,
    opt0:q[0] && q[0].options[0],
    opt1:q[0] && q[0].options[1],
    stem1:q[1] && q[1].stem,
    answers:q.map(x=>x.answer)
  }; })()`);
  check('PDF 解析出 3 题', pdfQ.n === 3, JSON.stringify(pdfQ));
  check('PDF 图片进入题干/选项', /\[图\d+\]/.test(pdfQ.stem0||'') && /\[图\d+\]/.test(pdfQ.opt0||'') && /\[图\d+\]/.test(pdfQ.opt1||'') && /\[图\d+\]/.test(pdfQ.stem1||''), JSON.stringify(pdfQ));
  check('PDF 图片资源去重后为 3 张', pdfQ.assets === 3, JSON.stringify(pdfQ));
  check('PDF 答案已识别', pdfQ.answers[0].join() === '0' && pdfQ.answers[1].join() === '0', JSON.stringify(pdfQ.answers));

  await evaljs('document.querySelector("[data-tab=edit]").click();');
  await sleep(700);
  await evaljs(`(() => { const c=document.querySelector('.qedit'); window.scrollTo(0, Math.max(0, c.getBoundingClientRect().top + window.scrollY - 140)); })()`);
  await sleep(500);
  const pdfThumbs = await evaljs(`(() => {
    const imgs = Array.from(document.querySelectorAll('.qedit .thumb img'));
    return {
      count: imgs.length,
      loaded: imgs.filter(i=>i.naturalWidth>0 && i.naturalHeight>0).length,
      cards: document.querySelectorAll('.qedit').length
    };
  })()`);
  check('PDF 图片在编辑器内可显示', pdfThumbs.count >= 4 && pdfThumbs.loaded === pdfThumbs.count, JSON.stringify(pdfThumbs));
  await screenshot('builder-pdf-edit.png');

  // 英文标准字体 PDF（验证不需要额外 standard_fonts 数据也能提取）
  await evaljs(`document.querySelector('#rawInput').value=''; document.querySelector('#answerInput').value='';`);
  const enDoc = await cdp.send('DOM.getDocument', { depth: -1 });
  const enInput = await cdp.send('DOM.querySelector', { nodeId: enDoc.root.nodeId, selector: '#fileInput' });
  await cdp.send('DOM.setFileInputFiles', { files: [path.join(root, 'tests', 'fixtures', 'english.pdf')], nodeId: enInput.nodeId });
  await waitFor(`document.querySelector('#rawInput').value.includes('Which topology')`, 30000, '英文 PDF 导入');
  await evaljs('document.querySelector("#btnParse").click();');
  await sleep(700);
  const enQ = await evaljs(`(() => { const q=__builder.state.questions; return {n:q.length, opts:q[0]&&q[0].options}; })()`);
  check('英文 PDF 文本可提取', enQ.n === 1 && JSON.stringify(enQ.opts) === JSON.stringify(['Bus', 'Star', 'Ring', 'Tree']), JSON.stringify(enQ));
  await screenshot('builder-pdf.png');

  // 回到 DOCX，继续测试手动插图/草稿/生成
  await evaljs(`document.querySelector('#rawInput').value=''; document.querySelector('#answerInput').value='';`);
  const docxDoc2 = await cdp.send('DOM.getDocument', { depth: -1 });
  const docxInput2 = await cdp.send('DOM.querySelector', { nodeId: docxDoc2.root.nodeId, selector: '#fileInput' });
  await cdp.send('DOM.setFileInputFiles', { files: [docxPath], nodeId: docxInput2.nodeId });
  await waitFor(`(() => document.querySelector('#rawInput').value.includes('观察下面的图片'))()`, 25000, '重新导入 DOCX');
  await evaljs('document.querySelector("#btnParse").click();');
  await sleep(900);

  await evaljs('document.querySelector("[data-tab=edit]").click(); window.scrollTo(0,0);');
  await sleep(500);
  await screenshot('builder-edit.png');
  await evaljs('document.querySelector(".qedit").scrollIntoView({block:"start"}); window.scrollBy(0,-130);');
  await sleep(400);
  await screenshot('builder-cards.png');

  // 手动插入图片（题干）
  const beforeImgs = await evaljs('__builder.state.questions[0].images.length');
  await evaljs('document.querySelector(".qedit [data-act=img-stem]").click()');
  await sleep(200);
  const imgDoc = await cdp.send('DOM.getDocument', { depth: -1 });
  const imgInput = await cdp.send('DOM.querySelector', { nodeId: imgDoc.root.nodeId, selector: '#imgFileInput' });
  await cdp.send('DOM.setFileInputFiles', { files: [path.join(root, 'tests', 'fixtures', 'red.png')], nodeId: imgInput.nodeId });
  await waitFor(`__builder.state.questions[0].images.length > ${beforeImgs}`, 15000, '手动插入图片');
  const manual = await evaljs(`(() => { const q=__builder.state.questions[0]; return {
    imgs:q.images.length,
    stem:q.stem,
    thumbs:document.querySelectorAll('.qedit .thumb').length,
    has:!!document.querySelector('.qedit .thumb img')
  }; })()`);
  check('手动插入题干图片', manual.imgs > beforeImgs && /\[图\d+\]/.test(manual.stem), JSON.stringify(manual));
  check('图片缩略图渲染', manual.thumbs >= 1 && manual.has, JSON.stringify(manual));
  await screenshot('builder-image-inserted.png');

  // 草稿保存 / 刷新恢复（含图片）
  await evaljs('__builder.saveDraft()');
  const beforeReload = await evaljs('({q:__builder.state.questions.length,a:Object.keys(__builder.state.assets).length})');
  await navigate(builderUrl);
  await sleep(600);
  const afterReload = await evaljs('({q:__builder.state.questions.length,a:Object.keys(__builder.state.assets).length,imgs:__builder.state.questions[0].images.length,title:__builder.state.meta.title})');
  check('刷新后草稿恢复题目', afterReload.q === beforeReload.q, JSON.stringify(afterReload));
  check('刷新后草稿恢复图片', afterReload.a === beforeReload.a && afterReload.imgs >= 2, JSON.stringify(afterReload));
  check('刷新后草稿恢复标题', afterReload.title.includes('图片题'), afterReload.title);

  const quizHtml = await evaljs('__builder.buildQuizHtml()');
  fs.writeFileSync(quizOut, quizHtml, 'utf8');
  check('生成 HTML 含内嵌图片', quizHtml.includes('data:image/'), quizHtml.length + ' bytes');
  check('生成 HTML 内嵌题目数据', quizHtml.includes('quiz-data'));

  await navigate(quizUrl);
  await sleep(500);
  const quizInfo = await evaljs(`(() => ({
    cards: document.querySelectorAll('.card').length,
    title: document.querySelector('#hTitle').textContent,
    qimgs: document.querySelectorAll('.qimg').length,
    opts: document.querySelectorAll('.opt').length,
    dark: document.documentElement.classList.contains('dark'),
    errors: 0
  }))()`);
  check('检测页题目数量（未答完的题会被跳过）', quizInfo.cards === 2, JSON.stringify(quizInfo));
  check('检测页图片渲染', quizInfo.qimgs >= 3, JSON.stringify(quizInfo));
  check('检测页标题', quizInfo.title.includes('图片题'), quizInfo.title);
  await screenshot('quiz-top.png');

  // 作答 + 判分
  await evaljs(`(() => { const c=document.querySelector('.card'); c.querySelector('.opt').click(); })()`);
  await sleep(300);
  const judged = await evaljs(`(() => { const c=document.querySelector('.card'); return {
    ok: c.classList.contains('ok'),
    fb: c.querySelector('.fb').classList.contains('on'),
    res: c.querySelector('.res').textContent,
    good: c.querySelectorAll('.opt.good').length
  }; })()`);
  check('点击选项即时判分', judged.fb && judged.ok, JSON.stringify(judged));
  check('答对后显示正确状态', judged.res.includes('回答正确'), judged.res);

  // 图片放大
  await evaljs(`document.querySelector('.qimg').click()`);
  await sleep(200);
  check('图片点击可放大', await evaljs(`document.querySelector('#imgMask').classList.contains('on')`));
  await evaljs(`document.querySelector('#btnCloseImg').click()`);

  // 重置
  await evaljs(`window.confirm = () => true; document.querySelector('#btnReset').click()`);
  await sleep(300);
  check('重置清空作答', await evaljs(`document.querySelector('.card .fb').classList.contains('on') === false`));

  await screenshot('quiz-after-reset.png');

  // 预览 iframe
  await navigate(builderUrl);
  await sleep(400);
  await evaljs('document.querySelector("[data-tab=gen]").click()');
  await sleep(300);
  await evaljs('document.querySelector("#btnPreview").click()');
  await sleep(900);
  check('预览弹窗打开', await evaljs('document.querySelector("#previewMask").classList.contains("on")'));
  check('预览 srcdoc 已写入', await evaljs('document.querySelector("#previewFrame").srcdoc.length > 1000'));
  await evaljs('document.querySelector("#btnClosePreview").click()');
  await sleep(200);

  // 考试模式
  await evaljs(`(() => { __builder.state.settings.mode='exam'; __builder.state.settings.persist=false; })()`);
  const examHtml = await evaljs('__builder.buildQuizHtml()');
  const examOut = path.join(root, 'tests', '.tmp', 'generated-quiz-exam.html');
  fs.writeFileSync(examOut, examHtml, 'utf8');
  await navigate(pathToFileURL(examOut).href);
  await sleep(400);
  check('考试模式显示交卷按钮', await evaljs(`(() => {
    const b=document.querySelector('#btnSubmit'); return b && b.style.display !== 'none';
  })()`));
  await evaljs(`(() => {
    window.confirm = () => true;
    document.querySelectorAll('.card').forEach(c => { const o=c.querySelector('.opt'); if(o) o.click(); });
    document.querySelector('#btnSubmit').click();
  })()`);
  await sleep(500);
  const exam = await evaljs(`(() => ({
    result: document.querySelector('#result').classList.contains('on'),
    score: document.querySelector('#result .score')?.textContent,
    verdict: document.querySelector('#result .verdict')?.textContent,
    disabled: Array.from(document.querySelectorAll('.card .opt')).every(b => b.disabled)
  }))()`);
  check('交卷后显示结果面板', exam.result, JSON.stringify(exam));
  check('考试评分正确', exam.score === '100' && /恭喜/.test(exam.verdict || ''), JSON.stringify(exam));
  check('交卷后选项锁定', exam.disabled, JSON.stringify(exam));
  await screenshot('quiz-exam-result.png');

  // 深色主题
  await navigate(builderUrl);
  await sleep(400);
  await evaljs(`(() => { __builder.state.settings.theme='dark'; __builder.state.settings.mode='both'; })()`);
  const darkHtml = await evaljs('__builder.buildQuizHtml()');
  const darkOut = path.join(root, 'tests', '.tmp', 'generated-quiz-dark.html');
  fs.writeFileSync(darkOut, darkHtml, 'utf8');
  await navigate(pathToFileURL(darkOut).href);
  await sleep(400);
  const darkInfo = await evaljs(`(() => {
    const cs=getComputedStyle(document.body);
    return { dark: document.documentElement.classList.contains('dark'), bg: cs.backgroundColor, colorScheme: getComputedStyle(document.documentElement).colorScheme };
  })()`);
  check('深色主题生效', darkInfo.dark && /rgb\(7, 11, 20\)/.test(darkInfo.bg), JSON.stringify(darkInfo));
  await screenshot('quiz-dark.png');

  // 移动端布局
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: false
  });
  await navigate(builderUrl);
  await sleep(500);
  const mobileBuilder = await evaljs(`({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    cards: document.querySelectorAll('.tab').length,
    title: document.querySelector('h1')?.textContent || ''
  })`);
  check('移动端 builder 无横向溢出', mobileBuilder.overflow <= 2, JSON.stringify(mobileBuilder));
  await screenshot('builder-mobile.png');

  await navigate(quizUrl);
  await sleep(400);
  const mobileQuiz = await evaljs(`({
    overflow: document.documentElement.scrollWidth - window.innerWidth,
    cards: document.querySelectorAll('.card').length
  })`);
  check('移动端检测页无横向溢出', mobileQuiz.overflow <= 2, JSON.stringify(mobileQuiz));
  await screenshot('quiz-mobile.png');

  const errors = logs.filter(x => x.startsWith('EXCEPTION') || x.startsWith('CONSOLE error') || x.startsWith('LOG error'));
  check('浏览器无运行时异常', errors.length === 0, errors.join('\n'));
  if (logs.length) console.log('\n--- browser logs ---\n' + logs.join('\n'));
} catch (e) {
  console.error('E2E 失败:', e && e.stack || e);
  failed++;
} finally {
  try { if (cdp) await cdp.send('Browser.close'); } catch (e) {}
  try { if (cdp) cdp.close(); } catch (e) {}
  try { proc.kill(); } catch (e) {}
}
console.log(failed === 0 ? '\nE2E passed' : `\nE2E failed: ${failed}`);
process.exit(failed === 0 ? 0 : 1);

