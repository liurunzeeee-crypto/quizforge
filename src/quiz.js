/* ==========================================================================
   V1.10 · 生成的检测页面运行时
   （纯原生 JS，无外部依赖；图片从内嵌 data URL 读取）
   ========================================================================== */
(function(){
'use strict';

var DATA;
try{
  DATA = JSON.parse(document.getElementById('quiz-data').textContent);
}catch(e){
  document.getElementById('list').innerHTML = '<div class="card">题目数据解析失败，请重新生成页面。</div>';
  return;
}

var QS = DATA.questions || [];
var ASSETS = DATA.assets || {};
var S = DATA.settings || {};
var N = QS.length;
var LETTERS = ['A','B','C','D','E','F','G','H'];

if (DATA.theme === 'dark') document.documentElement.classList.add('dark');

function $(id){ return document.getElementById(id); }
function el(tag, cls, txt){
  var n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt !== undefined && txt !== null) n.textContent = txt;
  return n;
}
function clear(node){ while (node.firstChild) node.removeChild(node.firstChild); }
function shuffleArr(a){
  for (var i = a.length - 1; i > 0; i--){
    var j = Math.floor(Math.random() * (i + 1));
    var t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}
function hash(str){
  var h = 2166136261;
  str = String(str || '');
  for (var i = 0; i < str.length; i += 3){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/* ------------------------------------------------------------------ */
/* 图片 / 富文本                                                       */
/* ------------------------------------------------------------------ */
function assetFor(q, token){
  var list = q.images || [];
  for (var i = 0; i < list.length; i++){
    if (list[i].token === token) return ASSETS[list[i].asset] || null;
  }
  return null;
}
function richInto(node, text, q){
  var s = String(text == null ? '' : text);
  var re = /\[图\d+\]/g;
  var last = 0, m;
  while ((m = re.exec(s)) !== null){
    if (m.index > last) node.appendChild(document.createTextNode(s.slice(last, m.index)));
    var asset = assetFor(q, m[0]);
    if (asset){
      var img = document.createElement('img');
      img.className = 'qimg';
      img.src = asset.src;
      img.alt = asset.name || m[0];
      img.loading = 'eager';
      img.addEventListener('click', function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        openImage(this.src);
      });
      node.appendChild(img);
    }else{
      node.appendChild(document.createTextNode(m[0]));
    }
    last = re.lastIndex;
  }
  if (last < s.length) node.appendChild(document.createTextNode(s.slice(last)));
}

function openImage(src){
  if (!src) return;
  $('imgView').src = src;
  $('imgMask').classList.add('on');
  document.body.style.overflow = 'hidden';
}
function closeImage(){
  $('imgMask').classList.remove('on');
  $('imgView').src = '';
  document.body.style.overflow = '';
}

/* ------------------------------------------------------------------ */
/* 顺序 / 状态                                                        */
/* ------------------------------------------------------------------ */
var order = [], perm = [];
for (var i = 0; i < N; i++){
  order.push(i);
  var p = [];
  for (var j = 0; j < (QS[i].options || []).length; j++) p.push(j);
  perm.push(p);
}

var answers = [], confirmed = [];
for (var k = 0; k < N; k++){ answers.push(null); confirmed.push(false); }

var mode = (S.mode === 'exam') ? 'exam' : 'practice';
var canSwitch = (S.mode === 'both');
var submitted = false;
var filter = 'all';
var current = 0;

var STORE_KEY = 'quiz-progress:' + hash((DATA.title || '') + '|' + N + '|' +
  QS.map(function(q){ return String(q.stem || '').slice(0, 30) + q.answer.join(''); }).join('~'));

function saveProgress(){
  if (!S.persist) return;
  try{
    localStorage.setItem(STORE_KEY, JSON.stringify({
      v: 1,
      answers: answers,
      confirmed: confirmed,
      order: order,
      perm: perm,
      mode: mode,
      submitted: submitted,
      ts: Date.now()
    }));
  }catch(e){}
}

function validPerm(p, len){
  if (!Array.isArray(p) || p.length !== len) return false;
  var seen = {};
  for (var i = 0; i < p.length; i++){
    var v = p[i];
    if (typeof v !== 'number' || v < 0 || v >= len || seen[v]) return false;
    seen[v] = 1;
  }
  return true;
}

function loadProgress(){
  if (!S.persist) return false;
  try{
    var raw = localStorage.getItem(STORE_KEY);
    if (!raw) return false;
    var d = JSON.parse(raw);
    if (!d || !Array.isArray(d.answers) || d.answers.length !== N) return false;

    answers = d.answers.map(function(a, qi){
      if (!Array.isArray(a)) return null;
      var len = QS[qi].options.length;
      var out = a.filter(function(x){ return typeof x === 'number' && x >= 0 && x < len; });
      return out.length ? out : null;
    });
    confirmed = Array.isArray(d.confirmed) ? d.confirmed.slice(0, N).map(Boolean) : [];
    while (confirmed.length < N) confirmed.push(false);

    if (Array.isArray(d.order) && d.order.length === N){
      var seen = {};
      var ok = true;
      for (var i = 0; i < d.order.length; i++){
        var v = d.order[i];
        if (typeof v !== 'number' || v < 0 || v >= N || seen[v]){ ok = false; break; }
        seen[v] = 1;
      }
      if (ok) order = d.order.slice();
    }
    if (Array.isArray(d.perm) && d.perm.length === N){
      for (var k = 0; k < N; k++){
        if (validPerm(d.perm[k], QS[k].options.length)) perm[k] = d.perm[k].slice();
      }
    }
    if (d.mode && (d.mode === mode || canSwitch)) mode = d.mode;
    submitted = !!d.submitted && mode === 'exam';
    return true;
  }catch(e){
    return false;
  }
}

function applyShuffle(){
  if (S.shuffleQ) shuffleArr(order);
  if (S.shuffleO){
    for (var k = 0; k < N; k++){
      if (QS[k].type === 'judge') continue;
      shuffleArr(perm[k]);
    }
  }
}

/* ------------------------------------------------------------------ */
/* 判分                                                               */
/* ------------------------------------------------------------------ */
function isCorrect(qi){
  var a = answers[qi];
  if (!a) return false;
  var t = QS[qi].answer.slice().sort(function(x, y){ return x - y; });
  var u = a.slice().sort(function(x, y){ return x - y; });
  if (t.length !== u.length) return false;
  for (var i = 0; i < t.length; i++) if (t[i] !== u[i]) return false;
  return true;
}
function answeredCount(){
  var n = 0;
  for (var i = 0; i < N; i++){
    if (mode === 'exam' ? !!answers[i] : confirmed[i]) n++;
  }
  return n;
}
function judgedStats(){
  var ok = 0, bad = 0;
  for (var i = 0; i < N; i++){
    var judged = (mode === 'exam') ? (submitted && !!answers[i]) : confirmed[i];
    if (!judged) continue;
    if (isCorrect(i)) ok++; else bad++;
  }
  return { ok: ok, bad: bad };
}
function ansLetters(qi, arr){
  var p = perm[qi], out = [];
  for (var i = 0; i < arr.length; i++){
    var disp = p.indexOf(arr[i]);
    out.push(LETTERS[disp >= 0 ? disp : arr[i]] || '?');
  }
  return out.sort().join('');
}
function typeLabel(t){
  return t === 'multi' ? '多选' : (t === 'judge' ? '判断' : '单选');
}

/* ------------------------------------------------------------------ */
/* 渲染                                                               */
/* ------------------------------------------------------------------ */
var cardEls = [];
function renderAll(){
  var list = $('list');
  clear(list);
  cardEls = [];
  var frag = document.createDocumentFragment();

  for (var pos = 0; pos < N; pos++){
    var qi = order[pos];
    var q = QS[qi];
    var card = el('article', 'card');
    card.id = 'card-' + qi;
    card.dataset.qi = String(qi);

    var ct = el('div', 'ct');
    var num = el('span', 'num');
    var tag = el('span', 'tag ' + q.type, typeLabel(q.type));
    var stem = el('span', 'stem');
    richInto(stem, q.stem, q);
    ct.appendChild(num);
    ct.appendChild(tag);
    ct.appendChild(stem);
    card.appendChild(ct);

    var opts = el('div', 'opts');
    var btns = [];
    var len = (q.options || []).length;
    for (var d = 0; d < len; d++){
      var real = perm[qi][d];
      var b = el('button', 'opt');
      b.type = 'button';
      b.dataset.qi = String(qi);
      b.dataset.oi = String(real);
      var lt = el('span', 'lt', LETTERS[d] || String(d + 1));
      var tx = el('span', 'tx');
      richInto(tx, q.options[real], q);
      b.appendChild(lt);
      b.appendChild(tx);
      opts.appendChild(b);
      btns.push(b);
    }
    card.appendChild(opts);

    var act = el('div', 'cact');
    var btnOk = el('button', 'bbtn pri', '确认作答');
    btnOk.type = 'button';
    btnOk.dataset.act = 'confirm';
    btnOk.dataset.qi = String(qi);
    btnOk.style.display = 'none';
    var btnRe = el('button', 'bbtn', '重做本题');
    btnRe.type = 'button';
    btnRe.dataset.act = 'retry';
    btnRe.dataset.qi = String(qi);
    btnRe.style.display = 'none';
    act.appendChild(btnOk);
    act.appendChild(btnRe);
    card.appendChild(act);

    var fb = el('div', 'fb');
    var res = el('span', 'res');
    var ca = el('span', 'ca');
    fb.appendChild(res);
    fb.appendChild(ca);
    card.appendChild(fb);

    var ana = el('div', 'ana');
    var anaB = el('b', null, '解析：');
    var anaT = el('span');
    richInto(anaT, q.analysis || '', q);
    ana.appendChild(anaB);
    ana.appendChild(anaT);
    card.appendChild(ana);

    frag.appendChild(card);
    cardEls[qi] = { card: card, num: num, btns: btns, btnOk: btnOk, btnRe: btnRe, fb: fb, res: res, ca: ca, ana: ana };
  }
  list.appendChild(frag);
}

function revealAnswer(){
  return mode === 'exam' || S.showAnswerAfterWrong !== false;
}

function paint(qi){
  var e = cardEls[qi];
  if (!e) return;
  var q = QS[qi];
  var pos = order.indexOf(qi);
  e.num.textContent = String(pos + 1);

  var sel = answers[qi] || [];
  var judged = (mode === 'exam') ? submitted : confirmed[qi];
  var right = judged && isCorrect(qi);

  e.card.classList.toggle('ok', !!right);
  e.card.classList.toggle('bad', judged && !right);
  e.card.classList.toggle('cur', qi === current);

  for (var d = 0; d < e.btns.length; d++){
    var b = e.btns[d];
    var real = parseInt(b.dataset.oi, 10);
    var isSel = sel.indexOf(real) >= 0;
    var isAns = q.answer.indexOf(real) >= 0;
    b.classList.remove('sel', 'good', 'ouch');
    b.disabled = false;
    b.setAttribute('aria-pressed', isSel ? 'true' : 'false');
    if (!judged){
      if (isSel) b.classList.add('sel');
    }else{
      b.disabled = true;
      if (isSel && isAns) b.classList.add('good');
      else if (isSel && !isAns) b.classList.add('ouch');
      else if (isAns && revealAnswer()) b.classList.add('good');
    }
  }

  var showOk = (mode === 'practice' && q.type === 'multi' && !confirmed[qi]);
  e.btnOk.style.display = showOk ? '' : 'none';
  e.btnOk.disabled = !(answers[qi] && answers[qi].length);
  var showRe = (mode === 'practice' && S.allowRetry !== false && confirmed[qi]);
  e.btnRe.style.display = showRe ? '' : 'none';

  if (judged){
    e.fb.classList.add('on');
    e.res.className = 'res ' + (right ? 'ok' : 'bad');
    e.res.textContent = right ? '✅ 回答正确' : (q.type === 'multi' ? '❌ 回答错误（多选需完全正确）' : '❌ 回答错误');
    var showKey = !right && (mode === 'exam' || revealAnswer());
    if (showKey){
      e.ca.textContent = '正确答案：' + ansLetters(qi, q.answer);
      e.ca.style.display = '';
    }else{
      e.ca.style.display = 'none';
    }
    if (!right && mode === 'practice' && S.showAnswerAfterWrong === false){
      e.res.textContent += '（正确答案已隐藏）';
    }
  }else{
    e.fb.classList.remove('on');
  }

  var showAna = judged && S.showAnalysis !== false && !!(q.analysis && String(q.analysis).trim());
  e.ana.classList.toggle('on', !!showAna);
}

function paintAll(){ for (var i = 0; i < N; i++) paint(i); }

function renderStats(){
  var st = judgedStats();
  var done = answeredCount();
  var box = $('stats');
  clear(box);
  var items = [];
  if (mode === 'practice' || submitted){
    items.push({ cls: 's-ok', k: '正确', v: st.ok });
    items.push({ cls: 's-bad', k: '错误', v: st.bad });
  }
  items.push({ cls: '', k: '已答', v: done + ' / ' + N });
  if (!submitted && mode === 'practice') items.push({ cls: 's-left', k: '剩余', v: Math.max(0, N - done) });
  if (mode === 'practice' || submitted){
    items.push({ cls: '', k: '正确率', v: (done ? Math.round(st.ok / done * 100) : 0) + '%' });
  }
  items.forEach(function(it){
    var s = el('span', 's ' + it.cls);
    s.appendChild(el('span', null, it.k + '：'));
    s.appendChild(el('b', null, String(it.v)));
    box.appendChild(s);
  });

  $('pbar').style.width = (N ? Math.round(done / N * 100) : 0) + '%';
  $('fabN').textContent = done + '/' + N;

  var bm = $('btnMode');
  if (canSwitch){
    bm.style.display = '';
    bm.textContent = (mode === 'practice') ? '切到考试模式' : '切到练习模式';
    bm.classList.toggle('on', mode === 'exam');
  }else{
    bm.style.display = 'none';
  }
  $('btnSubmit').style.display = (mode === 'exam' && !submitted) ? '' : 'none';

  renderGrid();
}

function renderGrid(){
  var g = $('grid');
  clear(g);
  var frag = document.createDocumentFragment();
  for (var pos = 0; pos < N; pos++){
    var qi = order[pos];
    var b = el('button', 'gc', String(pos + 1));
    b.type = 'button';
    b.dataset.qi = String(qi);
    var judged = (mode === 'exam') ? (submitted && !!answers[qi]) : confirmed[qi];
    if (judged) b.classList.add(isCorrect(qi) ? 'right' : 'wrong');
    else if (answers[qi]) b.classList.add('done');
    if (qi === current) b.classList.add('cur');
    frag.appendChild(b);
  }
  g.appendChild(frag);
}

function renderResult(){
  var box = $('result');
  clear(box);
  if (mode !== 'exam' || !submitted){
    box.classList.remove('on');
    return;
  }
  var st = judgedStats();
  var score = N ? Math.round(st.ok / N * 100) : 0;
  var passScore = S.passScore || 60;
  var pass = score >= passScore;
  box.classList.add('on');

  box.appendChild(el('div', 'score ' + (pass ? 'pass' : 'fail'), String(score)));
  var vd = el('div', 'verdict', pass ? '🎉 恭喜通过' : '再接再厉');
  vd.appendChild(el('small', null, '及格线 ' + passScore + ' 分'));
  box.appendChild(vd);

  var grid = el('div', 'rgrid');
  var items = [
    { k: '总题数', v: N, c: '' },
    { k: '答对', v: st.ok, c: 'var(--ok)' },
    { k: '答错', v: st.bad, c: 'var(--bad)' },
    { k: '未答', v: Math.max(0, N - st.ok - st.bad), c: 'var(--ink3)' }
  ];
  items.forEach(function(it){
    var d = el('div', 'ritem');
    var v = el('div', 'v', String(it.v));
    if (it.c) v.style.color = it.c;
    d.appendChild(v);
    d.appendChild(el('div', 'k', it.k));
    grid.appendChild(d);
  });
  box.appendChild(grid);
}

/* ------------------------------------------------------------------ */
/* 作答                                                               */
/* ------------------------------------------------------------------ */
function selectOption(qi, oi){
  var q = QS[qi];
  if (mode === 'exam'){
    if (submitted) return;
    var cur = answers[qi] || [];
    if (q.type === 'multi'){
      var p = cur.indexOf(oi);
      if (p >= 0) cur.splice(p, 1); else cur.push(oi);
      answers[qi] = cur.length ? cur : null;
    }else{
      answers[qi] = (cur.length === 1 && cur[0] === oi) ? null : [oi];
    }
    paint(qi); renderStats(); saveProgress();
    return;
  }

  if (confirmed[qi]) return;
  var cur2 = answers[qi] || [];
  if (q.type === 'multi'){
    var p2 = cur2.indexOf(oi);
    if (p2 >= 0) cur2.splice(p2, 1); else cur2.push(oi);
    answers[qi] = cur2.length ? cur2 : null;
    paint(qi); renderStats(); saveProgress();
  }else{
    answers[qi] = [oi];
    confirmed[qi] = true;
    paint(qi); renderStats(); saveProgress();
    var card = cardEls[qi] && cardEls[qi].card;
    if (card && !isCorrect(qi)){
      card.classList.remove('shake');
      void card.offsetWidth;
      card.classList.add('shake');
    }
  }
}

function confirmQuestion(qi){
  if (!answers[qi] || !answers[qi].length) return;
  confirmed[qi] = true;
  paint(qi); renderStats(); saveProgress();
}
function retryQuestion(qi){
  answers[qi] = null;
  confirmed[qi] = false;
  paint(qi); renderStats(); saveProgress();
}

/* ------------------------------------------------------------------ */
/* 导航 / 筛选                                                        */
/* ------------------------------------------------------------------ */
function goTo(qi){
  current = qi;
  var c = $('card-' + qi);
  if (c) c.scrollIntoView({ behavior: 'smooth', block: 'center' });
  renderGrid();
  paintAll();
}

function setFilter(f){
  filter = f;
  var chips = document.querySelectorAll('#chips .chip');
  for (var i = 0; i < chips.length; i++) chips[i].classList.toggle('on', chips[i].dataset.f === f);
  applyFilter();
}
function applyFilter(){
  var showWrongBtn = false;
  for (var pos = 0; pos < N; pos++){
    var qi = order[pos];
    var e = cardEls[qi];
    if (!e) continue;
    var judged = (mode === 'exam') ? (submitted && !!answers[qi]) : confirmed[qi];
    var answered = (mode === 'exam') ? !!answers[qi] : confirmed[qi];
    var hide = false;
    if (filter === 'todo') hide = answered;
    else if (filter === 'done') hide = !answered;
    else if (filter === 'wrong') hide = !(judged && !isCorrect(qi));
    e.card.classList.toggle('hide', hide);
    if (judged && !isCorrect(qi)) showWrongBtn = true;
  }
  $('btnSheetWrong').style.display = showWrongBtn ? '' : 'none';
}

function detectCurrent(){
  var best = null, bestTop = -1e9;
  for (var pos = 0; pos < N; pos++){
    var qi = order[pos];
    var e = cardEls[qi];
    if (!e || e.card.classList.contains('hide')) continue;
    var r = e.card.getBoundingClientRect();
    if (r.bottom > 100 && r.top < (window.innerHeight || 600)){
      if (-r.top > bestTop){ bestTop = -r.top; best = qi; }
    }
  }
  if (best !== null) current = best;
  return current;
}

/* ------------------------------------------------------------------ */
/* 事件                                                               */
/* ------------------------------------------------------------------ */
$('list').addEventListener('click', function(ev){
  var t = ev.target;
  var opt = t.closest ? t.closest('.opt') : null;
  if (opt && !opt.disabled){
    selectOption(parseInt(opt.dataset.qi, 10), parseInt(opt.dataset.oi, 10));
    return;
  }
  var act = t.closest ? t.closest('[data-act]') : null;
  if (act){
    var qi = parseInt(act.dataset.qi, 10);
    if (act.dataset.act === 'confirm') confirmQuestion(qi);
    if (act.dataset.act === 'retry') retryQuestion(qi);
  }
});

$('grid').addEventListener('click', function(ev){
  var b = ev.target.closest('.gc');
  if (!b) return;
  $('sheetMask').classList.remove('on');
  goTo(parseInt(b.dataset.qi, 10));
});
$('fab').addEventListener('click', function(){
  renderGrid();
  $('sheetMask').classList.add('on');
});
$('btnSheetClose').addEventListener('click', function(){ $('sheetMask').classList.remove('on'); });
$('sheetMask').addEventListener('click', function(ev){
  if (ev.target === this) this.classList.remove('on');
});
$('btnSheetWrong').addEventListener('click', function(){
  $('sheetMask').classList.remove('on');
  setFilter('wrong');
});

$('chips').addEventListener('click', function(ev){
  var c = ev.target.closest('.chip');
  if (c) setFilter(c.dataset.f);
});

$('btnMode').addEventListener('click', function(){
  var next = (mode === 'practice') ? 'exam' : 'practice';
  if (answeredCount() > 0 && !confirm('切换模式会清空当前作答记录，确定继续？')) return;
  mode = next;
  submitted = false;
  for (var i = 0; i < N; i++){ answers[i] = null; confirmed[i] = false; }
  current = 0;
  renderResult(); paintAll(); renderStats(); applyFilter(); saveProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('btnSubmit').addEventListener('click', function(){
  var un = N - answeredCount();
  if (un > 0 && !confirm('还有 ' + un + ' 题未作答，确定现在交卷？')) return;
  submitted = true;
  renderResult(); paintAll(); renderStats(); applyFilter(); saveProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

$('btnReset').addEventListener('click', function(){
  if (!confirm('确定重置全部作答记录？')) return;
  submitted = false;
  for (var i = 0; i < N; i++){ answers[i] = null; confirmed[i] = false; }
  renderResult(); paintAll(); renderStats(); applyFilter(); saveProgress();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
$('btnTop').addEventListener('click', function(){ window.scrollTo({ top: 0, behavior: 'smooth' }); });
$('btnPrint').addEventListener('click', function(){ window.print(); });
$('btnCloseImg').addEventListener('click', closeImage);
$('imgMask').addEventListener('click', function(ev){
  if (ev.target === this) closeImage();
});

/* 键盘 */
document.addEventListener('keydown', function(ev){
  if (ev.key === 'Escape'){
    if ($('imgMask').classList.contains('on')) closeImage();
    else if ($('sheetMask').classList.contains('on')) $('sheetMask').classList.remove('on');
    return;
  }
  var tag = (ev.target && ev.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || (ev.target && ev.target.isContentEditable)) return;
  if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
  var k = ev.key;
  if (!k) return;

  if (k === 'ArrowRight' || k === 'n' || k === 'N'){
    var pos = order.indexOf(detectCurrent());
    if (pos >= 0 && pos < N - 1){ goTo(order[pos + 1]); ev.preventDefault(); }
    return;
  }
  if (k === 'ArrowLeft' || k === 'p' || k === 'P'){
    var pos2 = order.indexOf(detectCurrent());
    if (pos2 > 0){ goTo(order[pos2 - 1]); ev.preventDefault(); }
    return;
  }
  if (k === 'Enter'){
    var qi = detectCurrent();
    if (mode === 'practice' && QS[qi].type === 'multi' && !confirmed[qi] && answers[qi] && answers[qi].length){
      confirmQuestion(qi);
      ev.preventDefault();
    }
    return;
  }
  var up = k.toUpperCase();
  if (/^[A-H]$/.test(up)){
    var qi2 = detectCurrent();
    var q = QS[qi2];
    var d = LETTERS.indexOf(up);
    if (d < 0 || d >= q.options.length) return;
    selectOption(qi2, perm[qi2][d]);
    ev.preventDefault();
  }
});

var scrollTimer = null;
window.addEventListener('scroll', function(){
  if (scrollTimer) return;
  scrollTimer = setTimeout(function(){
    scrollTimer = null;
    var before = current;
    detectCurrent();
    if (before !== current) renderGrid();
  }, 180);
}, { passive: true });

window.addEventListener('beforeprint', function(){
  for (var i = 0; i < N; i++) if (cardEls[i]) cardEls[i].card.classList.remove('hide');
});
window.addEventListener('afterprint', function(){ applyFilter(); });

/* ------------------------------------------------------------------ */
/* 启动                                                               */
/* ------------------------------------------------------------------ */
function metaChip(text, cls){
  var c = el('span', 'chip-static ' + (cls || ''));
  c.appendChild(el('i'));
  c.appendChild(document.createTextNode(text));
  return c;
}

function boot(){
  if (!N){
    $('list').innerHTML = '<div class="card"><div class="ct"><span class="stem">这份检测页面里还没有题目。</span></div></div>';
    $('bar').style.display = 'none';
    return;
  }
  $('hTitle').textContent = DATA.title || '在线检测';
  $('hSub').textContent = DATA.subtitle || '';
  document.title = DATA.title || '在线检测';

  var chips = $('metaChips');
  chips.appendChild(metaChip('共 ' + N + ' 题'));
  var c = { single: 0, multi: 0, judge: 0 };
  QS.forEach(function(q){ c[q.type] = (c[q.type] || 0) + 1; });
  var parts = [];
  if (c.single) parts.push('单选 ' + c.single);
  if (c.multi) parts.push('多选 ' + c.multi);
  if (c.judge) parts.push('判断 ' + c.judge);
  if (parts.length) chips.appendChild(metaChip(parts.join(' · ')));
  if (DATA.generatedAt) chips.appendChild(metaChip('生成于 ' + DATA.generatedAt));

  var footTxt = DATA.footer || '';
  $('foot').textContent = (footTxt ? footTxt + ' · ' : '') + '共 ' + N + ' 题 · 本页面离线可用 · 生成日期 ' + (DATA.generatedAt || '');

  var restored = loadProgress();
  if (!restored) applyShuffle();

  renderAll();
  if (submitted) renderResult();
  paintAll();
  renderStats();
  applyFilter();

  if (restored && answeredCount() > 0){
    var tip = el('div', 'card');
    tip.style.borderLeftColor = 'var(--accent)';
    var tct = el('div', 'ct');
    tct.appendChild(el('span', 'stem', '已恢复上次的作答进度。点顶部「重置」可以重新开始。'));
    tip.appendChild(tct);
    $('list').insertBefore(tip, $('list').firstChild);
  }
}

boot();

})();
