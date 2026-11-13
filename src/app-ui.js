/* ==========================================================================
   V1.10 · 界面渲染 / 交互 / 生成 / 题库
   ========================================================================== */

/* ------------------------------------------------------------------ */
/* 主题                                                               */
/* ------------------------------------------------------------------ */
function applyTheme(dark){
  document.documentElement.classList.toggle('dark', !!dark);
  var sun = $('.ic-sun'), moon = $('.ic-moon');
  if (sun) sun.style.display = dark ? 'none' : '';
  if (moon) moon.style.display = dark ? '' : 'none';
}
function initTheme(){
  var saved = '';
  try{ saved = localStorage.getItem(LS_THEME) || ''; }catch(e){}
  applyTheme(saved === 'dark');
}
function toggleTheme(){
  var dark = !document.documentElement.classList.contains('dark');
  applyTheme(dark);
  try{ localStorage.setItem(LS_THEME, dark ? 'dark' : 'light'); }catch(e){}
}

/* ------------------------------------------------------------------ */
/* 标签页                                                             */
/* ------------------------------------------------------------------ */
function switchTab(name){
  $$('.tab').forEach(function(b){ b.classList.toggle('on', b.dataset.tab === name); });
  $$('.panel').forEach(function(p){ p.classList.toggle('on', p.id === 'panel-' + name); });
  if (name === 'edit'){ renderMetrics(); renderList(); }
  if (name === 'gen'){ renderGenSummary(); }
  if (name === 'bank'){ renderBankInfo(); }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------------------------------------------------ */
/* 示例                                                               */
/* ------------------------------------------------------------------ */
var DEMO = [
  '一、单项选择题',
  '1. 采用集中式控制策略，还具有中继交换和数据处理能力的网络拓扑结构是（ ）。',
  'A. 总线型',
  'B. 星状',
  'C. 环状',
  'D. 树状',
  '',
  '2、适用于分级管理和控制系统的网络拓扑结构是（ ）',
  'A、总线型  B、星状  C、环状  D、树状',
  '',
  '3. 网络的拓扑结构，实际上就是计算机网络中（ ）的拓扑结构。(A)用户资源子网 (B)通信子网 (C)应用层 (D)表示层',
  '',
  '4. 信道容量的计算公式为：C=Blog2(1+S/N)，其中表示信道带宽的是______。',
  'A.C',
  'B.B',
  'C.S',
  'D.N',
  '',
  '二、多项选择题',
  '5. 关于 OSI 分层的原则，下列说法正确的有（ ）。',
  'A. 每层功能的选择应有助于制定网络协议的国际化标准',
  'B. 层次应尽量多，以减轻汇集各层的处理开销',
  'C. 各层边界的选择应尽量减少跨过接口的通信量',
  'D. 层的划分应从逻辑上将功能分组',
  '答案：ACD',
  '解析：层次过多会增加处理开销，B 项错误。',
  '',
  '三、判断题',
  '6. 标准以太网采用的是总线型拓扑结构。（ ）',
  'A. 正确',
  'B. 错误',
  '',
  '答案：',
  '1-4 B B C C',
  '5.ACD',
  '6.A'
].join('\n');

/* ------------------------------------------------------------------ */
/* 工具                                                               */
/* ------------------------------------------------------------------ */
function indexOfId(id){
  for (var i = 0; i < state.questions.length; i++){
    if (state.questions[i].id === id) return i;
  }
  return -1;
}

function renderReport(html, cls){
  var box = $('#parseReport');
  if (!box) return;
  box.innerHTML = '';
  if (!html) return;
  var div = document.createElement('div');
  div.className = 'report ' + (cls || 'info');
  div.innerHTML = html;
  box.appendChild(div);
}

function autoGrow(el){
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.min(260, Math.max(48, el.scrollHeight)) + 'px';
}

/* ------------------------------------------------------------------ */
/* 指标 / 报告                                                        */
/* ------------------------------------------------------------------ */
function renderTabCount(){
  var el = $('#tabCnt');
  if (el) el.textContent = String(state.questions.length);
}

function countImagesUsed(qs){
  var n = 0;
  qs.forEach(function(q){
    (q.images || []).forEach(function(ref){
      if (tokenUsedInQuestion(q, ref.token) && state.assets[ref.asset]) n++;
    });
  });
  return n;
}

function renderMetrics(){
  var qs = state.questions;
  var total = qs.length;
  var noAns = qs.filter(function(q){ return !q.answer.length; }).length;
  var issue = qs.filter(function(q){ return !qReady(q); }).length;
  var c = { single: 0, multi: 0, judge: 0 };
  qs.forEach(function(q){ c[q.type] = (c[q.type] || 0) + 1; });
  var images = countImagesUsed(qs);

  var box = $('#metrics');
  if (!box) return;
  box.innerHTML =
    '<div class="metric accent"><div class="v" id="m-total"></div><div class="k">题目总数</div></div>' +
    '<div class="metric good"><div class="v" id="m-ready"></div><div class="k">可直接导出</div></div>' +
    '<div class="metric warn"><div class="v" id="m-noans"></div><div class="k">缺答案</div></div>' +
    '<div class="metric bad"><div class="v" id="m-issue"></div><div class="k">有问题</div></div>' +
    '<div class="metric"><div class="v" id="m-img"></div><div class="k">图片</div></div>' +
    '<div class="metric"><div class="v" id="m-single"></div><div class="k">单选</div></div>' +
    '<div class="metric"><div class="v" id="m-multi"></div><div class="k">多选</div></div>' +
    '<div class="metric"><div class="v" id="m-judge"></div><div class="k">判断</div></div>';
  $('#m-total').textContent = total;
  $('#m-ready').textContent = total - issue;
  $('#m-noans').textContent = noAns;
  $('#m-issue').textContent = issue;
  $('#m-img').textContent = images;
  $('#m-single').textContent = c.single;
  $('#m-multi').textContent = c.multi;
  $('#m-judge').textContent = c.judge;

  var rb = $('#editReport');
  if (!rb) return;
  rb.innerHTML = '';
  if (!total){
    rb.innerHTML = '<div class="report info">题库为空，请先在①导入题目，或点下方「＋ 手动添加题目」。</div>';
    return;
  }
  if (issue){
    var d = document.createElement('div');
    d.className = 'report warn';
    d.innerHTML = '<b>⚠️ 有 <span id="er-n"></span> 题需要处理</b><ul id="er-list"></ul>';
    rb.appendChild(d);
    $('#er-n', d).textContent = issue;
    var ul = $('#er-list', d);
    qs.forEach(function(q, i){
      var iss = qIssues(q);
      if (!iss.length || ul.children.length >= 12) return;
      var li = document.createElement('li');
      li.textContent = '第 ' + (i + 1) + ' 题：' + iss.join('、');
      ul.appendChild(li);
    });
    if (issue > 12){
      var more = document.createElement('li');
      more.textContent = '…… 其余 ' + (issue - 12) + ' 题请用上方「有问题」筛选查看';
      more.style.listStyle = 'none';
      ul.appendChild(more);
    }
  }else{
    rb.innerHTML = '<div class="report ok"><b>🎉 全部题目校验通过</b>，可以直接到③生成导出。</div>';
  }
}

/* ------------------------------------------------------------------ */
/* 列表与题目卡片                                                      */
/* ------------------------------------------------------------------ */
function matchFilter(q, i){
  if (state.filter === 'noanswer' && q.answer.length) return false;
  if (state.filter === 'issue' && qReady(q)) return false;
  if (state.filter === 'image'){
    var has = (q.images || []).some(function(ref){ return tokenUsedInQuestion(q, ref.token); });
    if (!has) return false;
  }
  if ((state.filter === 'single' || state.filter === 'multi' || state.filter === 'judge') && q.type !== state.filter) return false;
  if (state.keyword){
    var kw = state.keyword.toLowerCase();
    var hay = (q.stem + ' ' + q.options.join(' ') + ' ' + q.analysis).toLowerCase();
    if (hay.indexOf(kw) < 0) return false;
  }
  return true;
}
function visibleList(){
  var out = [];
  for (var i = 0; i < state.questions.length; i++){
    if (matchFilter(state.questions[i], i)) out.push(i);
  }
  return out;
}

var ICON_IMAGE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"></rect><circle cx="8.5" cy="9.5" r="1.5"></circle><path d="M21 16l-5-5-6 6-2-2-5 5"></path></svg>';

var CARD_HTML =
  '<div class="qe-head">' +
    '<span class="qe-idx"></span>' +
    '<select class="qe-type" data-field="type" aria-label="题型">' +
      '<option value="single">单选</option><option value="multi">多选</option><option value="judge">判断</option>' +
    '</select>' +
    '<span class="qe-flag"></span>' +
    '<span class="qe-spacer"></span>' +
    '<button type="button" class="iconbtn" data-act="up" title="上移" aria-label="上移">↑</button>' +
    '<button type="button" class="iconbtn" data-act="down" title="下移" aria-label="下移">↓</button>' +
    '<button type="button" class="iconbtn" data-act="dup" title="复制此题" aria-label="复制此题">⧉</button>' +
    '<button type="button" class="iconbtn dgr" data-act="del" title="删除此题" aria-label="删除此题">✕</button>' +
  '</div>' +
  '<textarea class="stem-in" data-field="stem" rows="2" placeholder="题干"></textarea>' +
  '<div class="field-tools">' +
    '<button type="button" class="iconbtn wide" data-act="img-stem">' + ICON_IMAGE + '题干图片</button>' +
    '<span class="hint">可粘贴 / 拖入截图</span>' +
  '</div>' +
  '<div class="thumbs" data-scope="stem"></div>' +
  '<div class="optlist"></div>' +
  '<div class="row tight" style="margin-top:11px">' +
    '<button type="button" class="btn sm" data-act="add-opt">＋ 选项</button>' +
    '<button type="button" class="btn sm" data-act="del-opt">－ 选项</button>' +
    '<button type="button" class="btn sm" data-act="resplit">整理选项</button>' +
    '<button type="button" class="btn sm" data-act="clear-ans">清答案</button>' +
  '</div>' +
  '<input type="text" data-field="analysis" placeholder="解析（可选，生成页面后可展示给学生）" style="margin-top:11px">' +
  '<div class="field-tools">' +
    '<button type="button" class="iconbtn wide" data-act="img-ana">' + ICON_IMAGE + '解析图片</button>' +
  '</div>' +
  '<div class="thumbs" data-scope="analysis"></div>';

var OPTROW_HTML =
  '<button type="button" class="ansbtn" data-act="answer"></button>' +
  '<div class="optmain">' +
    '<input type="text" class="optin" data-field="opt" placeholder="选项内容">' +
    '<div class="thumbs" data-scope="option"></div>' +
  '</div>' +
  '<button type="button" class="optimgbtn" data-act="img-opt" title="为这个选项插入图片" aria-label="为这个选项插入图片">' + ICON_IMAGE + '</button>';

function buildCard(q, index){
  var card = document.createElement('article');
  card.className = 'qedit';
  card.dataset.id = q.id;
  card.innerHTML = CARD_HTML;

  var idx = $('.qe-idx', card);
  idx.textContent = String(index + 1);

  var sel = $('[data-field=type]', card);
  sel.value = q.type;

  var ta = $('[data-field=stem]', card);
  ta.value = q.stem;
  ta.style.height = Math.min(260, Math.max(48, ta.scrollHeight || 48)) + 'px';

  $('[data-field=analysis]', card).value = q.analysis || '';

  var list = $('.optlist', card);
  q.options.forEach(function(text, oi){
    var row = document.createElement('div');
    row.className = 'optrow';
    row.dataset.oi = String(oi);
    row.innerHTML = OPTROW_HTML;
    var ab = $('[data-act=answer]', row);
    ab.dataset.oi = String(oi);
    ab.textContent = LETTERS[oi] || String(oi + 1);
    if (q.answer.indexOf(oi) >= 0) ab.classList.add('on');
    var inp = $('[data-field=opt]', row);
    inp.dataset.oi = String(oi);
    inp.value = text;
    var thumbs = $('.thumbs', row);
    thumbs.dataset.oi = String(oi);
    list.appendChild(row);
  });

  syncCardVisual(card, q, index);
  renderThumbs(card, q);
  return card;
}

function syncCardVisual(card, q, index){
  if (!card) return;
  var idx = $('.qe-idx', card);
  if (idx) idx.textContent = String(index + 1);
  var flag = $('.qe-flag', card);
  var iss = qIssues(q);
  card.classList.toggle('issue', !!iss.length);
  card.classList.toggle('done', !iss.length);
  if (flag){
    if (!iss.length){
      flag.className = 'qe-flag good';
      flag.textContent = '✓ 就绪';
    }else{
      flag.className = 'qe-flag ' + (iss.length === 1 && iss[0] === '缺答案' ? 'warn' : 'bad');
      flag.textContent = iss.join(' · ');
    }
  }
}

function renderThumbs(card, q){
  if (!card) return;
  $$('.thumbs', card).forEach(function(box){
    var scope = box.dataset.scope;
    var oi = box.dataset.oi !== undefined ? parseInt(box.dataset.oi, 10) : -1;
    var text = scope === 'stem' ? q.stem :
               scope === 'analysis' ? q.analysis :
               (q.options[oi] || '');
    box.innerHTML = '';
    var has = false;
    (q.images || []).forEach(function(ref){
      if (text.indexOf(ref.token) < 0) return;
      var asset = state.assets[ref.asset];
      if (!asset) return;
      has = true;
      var wrap = document.createElement('div');
      wrap.className = 'thumb';
      wrap.title = asset.name || ref.token;
      var img = document.createElement('img');
      img.src = asset.src;
      img.alt = asset.name || ref.token;
      img.loading = 'lazy';
      img.dataset.asset = ref.asset;
      img.dataset.act = 'zoom-img';
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'rm';
      rm.textContent = '✕';
      rm.title = '移除这张图片';
      rm.dataset.act = 'rm-img';
      rm.dataset.token = ref.token;
      rm.dataset.scope = scope;
      if (oi >= 0) rm.dataset.oi = String(oi);
      var nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = ref.token;
      wrap.appendChild(img);
      wrap.appendChild(rm);
      wrap.appendChild(nm);
      box.appendChild(wrap);
    });
    if (scope === 'option'){
      var row = box.closest('.optrow');
      if (row){
        var btn = $('[data-act=img-opt]', row);
        if (btn) btn.classList.toggle('has', has);
      }
    }
  });
}

function refreshCard(cardEl, index){
  if (!cardEl || index < 0) return null;
  var q = state.questions[index];
  var fresh = buildCard(q, index);
  cardEl.parentNode.replaceChild(fresh, cardEl);
  return fresh;
}

function renderList(){
  var box = $('#qlist');
  if (!box) return;
  box.innerHTML = '';
  var vis = visibleList();

  if (!state.questions.length){
    box.innerHTML = '<div class="empty"><div class="big">🗂</div><b>题库还是空的</b><br>去①导入题目，或点上方「＋ 手动添加题目」</div>';
    var pg0 = $('#pager');
    if (pg0) pg0.innerHTML = '';
    renderMetrics();
    return;
  }
  if (!vis.length){
    box.innerHTML = '<div class="empty"><div class="big">🔍</div><b>当前筛选条件下没有题目</b><br>换个筛选或清空搜索关键词试试</div>';
    var pg1 = $('#pager');
    if (pg1) pg1.innerHTML = '';
    renderMetrics();
    return;
  }

  var pages = Math.ceil(vis.length / PAGE_SIZE);
  if (state.page >= pages) state.page = pages - 1;
  if (state.page < 0) state.page = 0;
  var slice = vis.slice(state.page * PAGE_SIZE, (state.page + 1) * PAGE_SIZE);
  var frag = document.createDocumentFragment();
  slice.forEach(function(i){ frag.appendChild(buildCard(state.questions[i], i)); });
  box.appendChild(frag);
  $$('.stem-in', box).forEach(autoGrow);

  var pg = $('#pager');
  if (pg){
    pg.innerHTML = '<button type="button" class="btn sm" data-pg="prev">← 上一页</button>' +
      '<span class="pginfo"></span>' +
      '<button type="button" class="btn sm" data-pg="next">下一页 →</button>';
    $('.pginfo', pg).textContent = '第 ' + (state.page + 1) + ' / ' + pages + ' 页　·　筛选出 ' + vis.length + ' 题（共 ' + state.questions.length + ' 题）';
    $('[data-pg=prev]', pg).disabled = state.page === 0;
    $('[data-pg=next]', pg).disabled = state.page >= pages - 1;
  }
  renderMetrics();
}

/* ------------------------------------------------------------------ */
/* 变更后的统一收口                                                    */
/* ------------------------------------------------------------------ */
function afterChange(skipRender){
  state.questions.forEach(syncQuestionImages);
  gcAssets();
  renderTabCount();
  if (skipRender) renderMetrics();
  else renderList();
  renderGenSummary();
  scheduleSave();
}

/* ------------------------------------------------------------------ */
/* 导入面板交互                                                        */
/* ------------------------------------------------------------------ */
function firstMeaningfulLine(raw){
  var lines = normalizeText(raw).split('\n');
  for (var i = 0; i < lines.length; i++){
    var t = lines[i].trim();
    if (t.length > 3) return t;
  }
  return '';
}

function doParse(){
  var raw = $('#rawInput').value;
  if (!raw.trim()){
    toast('请先粘贴题目文本或选择文件', 'err');
    return;
  }
  var res = parseQuestionText(raw, { defaultType: $('#defaultType').value });
  if (!res.questions.length){
    renderReport('<b>❌ 没有解析到任何题目</b><ul><li>请确认每道题以题号开头，例如 <code>1.</code> 或 <code>1、</code>，并且题号在行首。</li><li>选项需要有 <code>A.</code> / <code>A、</code> / <code>(A)</code> 这类前缀。</li><li>带图片的题目建议直接导入 DOCX。</li></ul>', 'warn');
    toast('没有解析到题目', 'err');
    return;
  }

  var qs = res.questions;
  var auto = $('#autoAnswer').checked;
  var extra = $('#answerInput').value;
  var combined = auto ? (res.answerText + '\n' + extra) : extra;
  var parsed = parseAnswerText(combined);
  var ar = { applied: 0, promoted: 0, missed: [] };
  if (parsed.mode !== 'none') ar = applyAnswersTo(qs, parsed, 0);

  attachImagesToQuestions(qs);

  var append = $('#appendMode').checked && state.questions.length;
  if (append){
    state.questions = state.questions.concat(qs);
  }else{
    state.questions = qs;
  }
  gcAssets();

  if (!append && (!state.meta.title || state.metaTitleAuto)){
    var hint = res.titleHint || firstMeaningfulLine(raw);
    hint = hint.replace(/^[（(]?[一二三四五六七八九十]{1,3}[)）]?\s*[、.．:：]\s*/, '')
      .replace(/^第\s*[一二三四五六七八九十百\d]{1,3}\s*[章节部分]\s*[、.．:：]?\s*/, '');
    state.meta.title = hint.slice(0, 50) || state.meta.title || '在线检测';
    state.metaTitleAuto = true;
    syncMetaInputs();
  }

  state.filter = 'all';
  state.keyword = '';
  state.page = 0;
  var kw = $('#kwInput');
  if (kw) kw.value = '';
  $$('#filters .chip').forEach(function(x){ x.classList.toggle('on', x.dataset.f === 'all'); });

  var noAns = qs.filter(function(q){ return !q.answer.length; }).length;
  var noOpt = qs.filter(function(q){ return q.options.filter(function(o){ return String(o).trim(); }).length < 2; }).length;
  var typeCount = { single: 0, multi: 0, judge: 0 };
  qs.forEach(function(q){ typeCount[q.type] = (typeCount[q.type] || 0) + 1; });
  var imgCount = countImagesUsed(qs);

  var answerReport;
  if (parsed.mode === 'none') answerReport = '未在文本中识别到答案，请在②中手动录入。';
  else answerReport = '按' + (parsed.mode === 'numbered' ? '题号' : '顺序') + '匹配到 <b>' + ar.applied + '</b> 题答案' +
    (ar.promoted ? '，其中 ' + ar.promoted + ' 题因多答案自动设为多选' : '') +
    (ar.missed.length ? '，<b>' + ar.missed.length + '</b> 题答案字母与选项不匹配' : '') +
    '。<b>请务必在②中核对。</b>';

  var cls = (noOpt > 0) ? 'warn' : (noAns > 0 ? 'info' : 'ok');
  var html = '<b>✅ 解析完成：共 ' + qs.length + ' 题</b>' +
    '（单选 ' + typeCount.single + ' · 多选 ' + typeCount.multi + ' · 判断 ' + typeCount.judge +
    (imgCount ? ' · 图片 ' + imgCount + ' 张' : '') + '）' +
    '<ul>' +
      '<li>' + answerReport + '</li>' +
      '<li>缺答案：<b>' + noAns + '</b> 题　·　选项异常：<b>' + noOpt + '</b> 题</li>' +
      (res.problems.length ? '<li>解析异常 ' + res.problems.length + ' 处：' +
        res.problems.slice(0, 6).map(function(p){ return '第' + p.num + '题 ' + p.msg; }).join('；') +
        (res.problems.length > 6 ? ' 等' : '') + '</li>' : '') +
      (res.warnings.length ? '<li>' + res.warnings.map(esc).join('<br>') + '</li>' : '') +
    '</ul>';

  if (res.fragments.length){
    html += '<div style="margin-top:6px"><b>⚠️ 检测到未归属的选项片段</b>（不会塞进上一题选项，请检查原文）：</div>';
    res.fragments.slice(0, 6).forEach(function(f){
      var items = f.items.map(function(it){ return it.letter + '. ' + it.text; }).join('　/　');
      html += '<div class="frag">第 ' + f.num + ' 题后：' + esc(items) + '</div>';
    });
    if (res.fragments.length > 6) html += '<div class="frag">……其余 ' + (res.fragments.length - 6) + ' 处请在原文中检查</div>';
  }

  html += '<div style="margin-top:12px"><button type="button" class="btn sm pri" id="btnGoEditReport">前往②校对与答案 →</button></div>';
  renderReport(html, cls);
  var go = $('#btnGoEditReport');
  if (go) go.addEventListener('click', function(){ switchTab('edit'); });

  renderTabCount();
  renderList();
  renderGenSummary();
  saveDraftNow();
  toast('已解析 ' + qs.length + ' 题');
}

/* ------------------------------------------------------------------ */
/* 批量操作                                                            */
/* ------------------------------------------------------------------ */
function applyBatchAnswers(onlyVisible){
  var txt = $('#batchAnswer').value;
  if (!txt.trim()){ toast('请先粘贴答案串', 'err'); return; }
  var parsed = parseAnswerText(txt);
  if (parsed.mode === 'none'){ toast('没识别出答案，请检查格式', 'err'); return; }
  var targets = onlyVisible
    ? visibleList().map(function(i){ return state.questions[i]; })
    : state.questions;
  var r = applyAnswersTo(targets, parsed, 0);
  renderList();
  afterChange(true);
  toast('已应用 ' + r.applied + ' 题答案' +
    (r.promoted ? '，' + r.promoted + ' 题自动转为多选' : '') +
    (r.missed.length ? '，' + r.missed.length + ' 题字母与选项不匹配' : ''));
}

function applyBatchType(){
  var t = $('#batchType').value;
  if (!t){ toast('请先选择要设置的题型', 'err'); return; }
  var scope = $('#batchScope').value;
  var idxs = scope === 'vis' ? visibleList() : state.questions.map(function(_, i){ return i; });
  idxs.forEach(function(i){
    var q = state.questions[i];
    q.type = t;
    if (t === 'judge'){
      q.options = ['正确', '错误'];
      q.answer = q.answer.length ? [Math.min(q.answer[0], 1)] : [];
    }
    if (t !== 'multi' && q.answer.length > 1) q.answer = [q.answer[0]];
  });
  afterChange();
  toast('已将 ' + idxs.length + ' 题设为' + (t === 'single' ? '单选' : t === 'multi' ? '多选' : '判断'));
}

/* ------------------------------------------------------------------ */
/* 列表交互                                                            */
/* ------------------------------------------------------------------ */
function handleCardAction(e){
  var act = e.target.closest('[data-act]');
  if (!act) return;
  var card = e.target.closest('.qedit');
  if (!card) return;
  var i = indexOfId(card.dataset.id);
  if (i < 0) return;
  var q = state.questions[i];
  var action = act.dataset.act;

  if (action === 'zoom-img'){
    var asset = Assets.get(act.dataset.asset);
    if (asset) openImage(asset.src);
    return;
  }
  if (action === 'rm-img'){
    e.preventDefault();
    var scope = act.dataset.scope;
    var oi = act.dataset.oi !== undefined ? parseInt(act.dataset.oi, 10) : -1;
    removeImageToken(q, scope, oi, act.dataset.token);
    return;
  }
  if (action === 'img-stem'){ beginImagePick(q, 'stem', -1, card); return; }
  if (action === 'img-ana'){ beginImagePick(q, 'analysis', -1, card); return; }
  if (action === 'img-opt'){
    var oiBtn = act.dataset.oi !== undefined ? parseInt(act.dataset.oi, 10) : -1;
    if (oiBtn < 0){
      var row = act.closest('.optrow');
      oiBtn = row ? parseInt(row.dataset.oi, 10) : -1;
    }
    beginImagePick(q, 'option', oiBtn, card);
    return;
  }

  if (action === 'answer'){
    var ai = parseInt(act.dataset.oi, 10);
    if (q.type === 'multi'){
      var p = q.answer.indexOf(ai);
      if (p >= 0) q.answer.splice(p, 1); else q.answer.push(ai);
      q.answer.sort(function(a, b){ return a - b; });
    }else{
      q.answer = (q.answer.length === 1 && q.answer[0] === ai) ? [] : [ai];
    }
    refreshCard(card, i);
    afterChange(true);
    return;
  }
  if (action === 'del'){
    if (!confirm('确定删除第 ' + (i + 1) + ' 题？此操作不可撤销。')) return;
    state.questions.splice(i, 1);
    afterChange();
    toast('已删除第 ' + (i + 1) + ' 题');
    return;
  }
  if (action === 'dup'){
    var copy = makeQuestion({
      type: q.type, stem: q.stem, options: q.options.slice(), answer: q.answer.slice(),
      analysis: q.analysis, images: (q.images || []).map(function(r){ return { token: r.token, asset: r.asset }; }),
      srcNum: q.srcNum
    });
    state.questions.splice(i + 1, 0, copy);
    afterChange();
    toast('已复制为第 ' + (i + 2) + ' 题');
    return;
  }
  if (action === 'up'){
    if (i === 0) return;
    state.questions.splice(i - 1, 0, state.questions.splice(i, 1)[0]);
    afterChange();
    return;
  }
  if (action === 'down'){
    if (i === state.questions.length - 1) return;
    state.questions.splice(i + 1, 0, state.questions.splice(i, 1)[0]);
    afterChange();
    return;
  }
  if (action === 'add-opt'){
    if (q.options.length >= 8){ toast('最多 8 个选项', 'err'); return; }
    q.options.push('');
    if (q.type === 'judge') q.type = 'single';
    refreshCard(card, i);
    afterChange(true);
    return;
  }
  if (action === 'del-opt'){
    if (q.options.length <= 2){ toast('至少保留 2 个选项', 'err'); return; }
    q.options.pop();
    q.answer = q.answer.filter(function(x){ return x < q.options.length; });
    if (q.type === 'judge') q.type = 'single';
    syncQuestionImages(q);
    refreshCard(card, i);
    afterChange(true);
    return;
  }
  if (action === 'clear-ans'){
    q.answer = [];
    refreshCard(card, i);
    afterChange(true);
    return;
  }
  if (action === 'resplit'){
    if (!confirm('将根据题干/选项里的 A. B. C. 标记重新拆分选项，并清空本题答案。继续？')) return;
    var raw = [q.stem].concat(q.options).join('\n');
    var ex = extractOptions(raw);
    if (!ex || ex.options.length < 2){
      toast('没有找到可拆分的 A/B/C… 选项', 'err');
      return;
    }
    q.stem = ex.stem;
    q.options = ex.options;
    q.answer = [];
    syncQuestionImages(q);
    refreshCard(card, i);
    afterChange(true);
    toast('已整理为 ' + ex.options.length + ' 个选项，请重新选择答案');
    return;
  }
}

function handleTypeChange(e){
  var sel = e.target.closest('[data-field=type]');
  if (!sel) return;
  var card = e.target.closest('.qedit');
  if (!card) return;
  var i = indexOfId(card.dataset.id);
  if (i < 0) return;
  var q = state.questions[i];
  q.type = sel.value;
  if (q.type === 'judge'){
    var filled = q.options.filter(function(o){ return o.trim(); });
    if (q.options.length !== 2){
      q.options = ['正确', '错误'];
      q.answer = q.answer.length ? [Math.min(q.answer[0], 1)] : [];
    }else if (!filled.length){
      q.options = ['正确', '错误'];
    }
  }
  if (q.type !== 'multi' && q.answer.length > 1) q.answer = [q.answer[0]];
  syncQuestionImages(q);
  refreshCard(card, i);
  afterChange(true);
}

function handleFieldInput(e){
  var el = e.target;
  var f = el.dataset && el.dataset.field;
  if (!f || f === 'type') return;
  var card = el.closest('.qedit');
  if (!card) return;
  var i = indexOfId(card.dataset.id);
  if (i < 0) return;
  var q = state.questions[i];
  if (f === 'stem'){
    q.stem = el.value;
    autoGrow(el);
  }else if (f === 'opt'){
    q.options[parseInt(el.dataset.oi, 10)] = el.value;
  }else if (f === 'analysis'){
    q.analysis = el.value;
  }
  if ((q.images || []).length) renderThumbs(card, q);
  scheduleSave();
}

function handleFieldBlur(e){
  var el = e.target;
  if (!el.dataset || ['stem', 'opt', 'analysis'].indexOf(el.dataset.field) < 0) return;
  var card = el.closest('.qedit');
  if (!card) return;
  var i = indexOfId(card.dataset.id);
  if (i < 0) return;
  var q = state.questions[i];
  syncQuestionImages(q);
  gcAssets();
  renderThumbs(card, q);
  syncCardVisual(card, q, i);
  renderMetrics();
  scheduleSave();
}

/* ------------------------------------------------------------------ */
/* 生成                                                               */
/* ------------------------------------------------------------------ */
var THEMES = {
  blue:
    '--accent:#0a84ff;--accent-2:#5b5bf6;--accent-3:#12c2c7;--accent-soft:#e9f2ff;' +
    '--bg:#eef4fc;--bg-2:#f7f4ff;--card:rgba(255,255,255,.86);--soft:rgba(246,249,255,.9);' +
    '--ink:#0b1220;--ink2:#45536b;--ink3:#7b89a4;--line:rgba(15,23,42,.09);--head-bd:#0a84ff;',
  green:
    '--accent:#0f9d63;--accent-2:#0b7f50;--accent-3:#20c997;--accent-soft:#e7faf1;' +
    '--bg:#edf8f3;--bg-2:#f4fbf8;--card:rgba(255,255,255,.86);--soft:rgba(244,251,248,.9);' +
    '--ink:#0b1a14;--ink2:#3f5a4e;--ink3:#779286;--line:rgba(15,55,38,.1);--head-bd:#0f9d63;',
  violet:
    '--accent:#7258ff;--accent-2:#5b44e6;--accent-3:#c65cff;--accent-soft:#f2edff;' +
    '--bg:#f2f0ff;--bg-2:#f8f5ff;--card:rgba(255,255,255,.86);--soft:rgba(248,246,255,.9);' +
    '--ink:#140f2c;--ink2:#4c4568;--ink3:#8b83a6;--line:rgba(45,30,90,.1);--head-bd:#7258ff;',
  orange:
    '--accent:#f0761a;--accent-2:#d65f0a;--accent-3:#ffb020;--accent-soft:#fff2e5;' +
    '--bg:#fff5ec;--bg-2:#fff9f3;--card:rgba(255,255,255,.88);--soft:rgba(255,250,245,.92);' +
    '--ink:#241309;--ink2:#6b4a34;--ink3:#a08470;--line:rgba(90,50,20,.1);--head-bd:#f0761a;',
  dark:
    '--accent:#58a6ff;--accent-2:#8b7bff;--accent-3:#3ee0d2;--accent-soft:#12243d;' +
    '--bg:#070b14;--bg-2:#0c1220;--card:rgba(20,28,45,.88);--soft:rgba(255,255,255,.045);' +
    '--ink:#eaf1ff;--ink2:#b6c3dc;--ink3:#8492ad;--line:rgba(255,255,255,.09);--head-bd:#58a6ff;color-scheme:dark;'
};

function exportableQuestions(){
  return state.questions.filter(function(q){ return qReady(q); }).map(function(q){
    syncQuestionImages(q);
    return {
      type: q.type,
      stem: String(q.stem || '').trim(),
      options: q.options.map(function(o){ return String(o || '').trim(); }),
      answer: q.answer.slice().sort(function(a, b){ return a - b; }),
      analysis: String(q.analysis || '').trim(),
      images: (q.images || []).filter(function(ref){
        return state.assets[ref.asset] && tokenUsedInQuestion(q, ref.token);
      }).map(function(ref){ return { token: ref.token, asset: ref.asset }; })
    };
  });
}

function renderGenSummary(){
  var total = state.questions.length;
  var qs = exportableQuestions();
  var ok = qs.length;
  var c = { single: 0, multi: 0, judge: 0 };
  qs.forEach(function(q){ c[q.type] = (c[q.type] || 0) + 1; });
  var images = 0;
  qs.forEach(function(q){ images += (q.images || []).length; });
  var hasAna = qs.some(function(q){ return q.analysis; });

  var box = $('#genSummary');
  if (!box) return;
  box.className = 'report ' + (ok === 0 ? 'warn' : (ok < total ? 'info' : 'ok'));
  if (ok === 0){
    box.innerHTML = '<b>⚠️ 还没有可导出的题目</b><ul><li>每道题需要：题干 + 至少 2 个非空选项 + 正确答案。</li><li>请到②校对与答案中修复标红的题目。</li></ul>';
    return;
  }
  var html = '<b>可导出 ' + ok + ' / ' + total + ' 题</b>（单选 ' + c.single + ' · 多选 ' + c.multi + ' · 判断 ' + c.judge +
    (images ? ' · 图片 ' + images + ' 张' : '') + '）';
  if (ok < total){
    html += '<ul><li>另有 <b>' + (total - ok) + '</b> 题未通过校验，导出时会自动跳过。可在②中用「有问题」筛选查看。</li></ul>';
  }
  if (!hasAna){
    html += '<ul><li>尚未填写解析，生成页面将不显示解析区。</li></ul>';
  }
  box.innerHTML = html;
}

function syncMetaInputs(){
  $('#gTitle').value = state.meta.title || '';
  $('#gSub').value = state.meta.subtitle || '';
  $('#gFoot').value = state.meta.footer || '';
  var out = $('#outName');
  if (out && !out.dataset.touched){
    out.value = sanitizeFileName(state.meta.title || '检测页面');
  }
}

function syncSettingsInputs(){
  $('#gMode').value = state.settings.mode;
  $('#gTheme').value = state.settings.theme;
  $('#gPass').value = state.settings.passScore;
  $('#gShufQ').checked = !!state.settings.shuffleQ;
  $('#gShufO').checked = !!state.settings.shuffleO;
  $('#gAna').checked = !!state.settings.showAnalysis;
  $('#gPersist').checked = !!state.settings.persist;
  $('#gShowAns').checked = !!state.settings.showAnswerAfterWrong;
  $('#gRetry').checked = !!state.settings.allowRetry;
}

function buildPayload(){
  var qs = exportableQuestions();
  var title = (state.meta.title || '').trim() || '在线检测';
  var sub = (state.meta.subtitle || '').trim();
  if (!sub && qs.length){
    var c = { single: 0, multi: 0, judge: 0 };
    qs.forEach(function(q){ c[q.type]++; });
    var parts = [];
    if (c.single) parts.push('单选 ' + c.single);
    if (c.multi) parts.push('多选 ' + c.multi);
    if (c.judge) parts.push('判断 ' + c.judge);
    sub = '共 ' + qs.length + ' 题' + (parts.length ? '（' + parts.join(' · ') + '）' : '') + ' · 离线可用';
  }

  var used = Object.create(null);
  qs.forEach(function(q){
    (q.images || []).forEach(function(ref){ used[ref.asset] = 1; });
  });
  var assets = Object.create(null);
  Object.keys(used).forEach(function(id){
    if (state.assets[id]) assets[id] = state.assets[id];
  });

  return {
    format: DATA_FORMAT,
    title: title,
    subtitle: sub,
    footer: (state.meta.footer || '').trim(),
    theme: state.settings.theme,
    settings: {
      mode: state.settings.mode || 'both',
      shuffleQ: !!state.settings.shuffleQ,
      shuffleO: !!state.settings.shuffleO,
      showAnalysis: !!state.settings.showAnalysis,
      showAnswerAfterWrong: !!state.settings.showAnswerAfterWrong,
      allowRetry: !!state.settings.allowRetry,
      persist: !!state.settings.persist,
      passScore: state.settings.passScore || 60
    },
    questions: qs,
    assets: assets,
    generatedAt: new Date().toISOString().slice(0, 10)
  };
}

function buildQuizHtml(){
  if (typeof QUIZ_TEMPLATE !== 'string' || !QUIZ_TEMPLATE){
    throw new Error('生成模板未加载');
  }
  var payload = buildPayload();
  var theme = THEMES[state.settings.theme] || THEMES.blue;
  var title = payload.title;
  return QUIZ_TEMPLATE
    .replace('__QUIZ_TITLE__', function(){ return esc(title); })
    .replace('__QUIZ_THEME__', function(){ return theme; })
    .replace('__QUIZ_DATA_JSON__', function(){ return jsonForEmbed(payload); });
}

function doDownload(){
  var qs = exportableQuestions();
  if (!qs.length){ toast('还没有可导出的题目', 'err'); switchTab('edit'); return; }
  var html;
  try{ html = buildQuizHtml(); }
  catch(e){ toast(e.message || '生成失败', 'err'); return; }
  var name = sanitizeFileName($('#outName').value || state.meta.title || '检测页面') + '.html';
  if (downloadText(name, html)){
    toast('已生成 ' + name + '（' + qs.length + ' 题，' + formatBytes(html.length * 2) + '）', 'ok');
  }else{
    toast('下载被浏览器拦截，请改用「复制 HTML 源码」后手动保存为 .html', 'err');
  }
}

/* ------------------------------------------------------------------ */
/* 题库面板                                                            */
/* ------------------------------------------------------------------ */
function renderBankInfo(){
  var saved = null;
  try{ saved = JSON.parse(localStorage.getItem(LS_DRAFT) || localStorage.getItem(LS_DRAFT_V1) || 'null'); }catch(e){}
  var box = $('#bankInfo');
  if (!box) return;

  if (saved && saved.questions){
    var assets = saved.assets ? Object.keys(saved.assets) : [];
    var size = 0;
    try{ size = (localStorage.getItem(LS_DRAFT) || '').length * 2; }catch(e){}
    box.className = 'report ok';
    box.innerHTML = '<b>✓ 本地草稿已保存</b><ul id="bi-list"></ul>';
    var ul = $('#bi-list', box);
    function li(text){ var el = document.createElement('li'); el.textContent = text; ul.appendChild(el); }
    li('保存时间：' + new Date(saved.savedAt || Date.now()).toLocaleString('zh-CN'));
    li('题目数量：' + (saved.questions.length || 0) + ' 题');
    li('图片数量：' + assets.length + ' 张' + (size ? '　·　草稿约 ' + formatBytes(size) : ''));
    li('标题：' + ((saved.meta && saved.meta.title) || '（未设置）'));
  }else{
    box.className = 'report info';
    box.innerHTML = state.questions.length
      ? '本地尚未保存草稿。继续编辑或切换到其他标签页会自动保存。'
      : '本地暂无草稿。开始导入或编辑题目后会自动保存。';
  }
}

function exportJson(){
  if (!state.questions.length){ toast('题库为空，没什么可导出的', 'err'); return; }
  var data = collectAll();
  var pretty = JSON.stringify(data, null, 2);
  if (pretty.length > 1.8 * 1024 * 1024) pretty = JSON.stringify(data);
  var name = sanitizeFileName(state.meta.title || '题库') + '-题库.json';
  if (downloadText(name, pretty, 'application/json')){
    toast('题库已导出：' + name + '（' + formatBytes(pretty.length * 2) + '）', 'ok');
  }else{
    toast('导出失败，请检查浏览器下载权限', 'err');
  }
}

function importJsonFile(file){
  var reader = new FileReader();
  reader.onload = function(ev){
    try{
      var data = JSON.parse(String(ev.target.result || ''));
      if (!data || !Array.isArray(data.questions)) throw new Error('格式不正确');
      if (state.questions.length && !confirm('导入会替换当前 ' + state.questions.length + ' 题，继续？')) return;
      if (loadAll(data, false)){
        saveDraftNow();
        toast('题库已导入：' + data.questions.length + ' 题', 'ok');
      }
    }catch(err){
      toast('JSON 解析失败：文件可能已损坏或不是本工具导出的格式', 'err');
    }
  };
  reader.readAsText(file, 'UTF-8');
}

/* ------------------------------------------------------------------ */
/* 图片查看器                                                          */
/* ------------------------------------------------------------------ */
function openImage(src){
  if (!src) return;
  var mask = $('#imgMask');
  $('#imgView').src = src;
  mask.classList.add('on');
  document.body.style.overflow = 'hidden';
}
function closeImage(){
  var mask = $('#imgMask');
  mask.classList.remove('on');
  $('#imgView').src = '';
  document.body.style.overflow = '';
}

/* ------------------------------------------------------------------ */
/* 事件绑定                                                            */
/* ------------------------------------------------------------------ */
function bindEvents(){
  $('#tabs').addEventListener('click', function(e){
    var b = e.target.closest('.tab');
    if (b) switchTab(b.dataset.tab);
  });
  $('#btnGoEdit').addEventListener('click', function(){ switchTab('edit'); });
  $('#btnTheme').addEventListener('click', toggleTheme);

  /* 导入 */
  $('#btnPickFile').addEventListener('click', function(){ $('#fileInput').click(); });
  $('#fileInput').addEventListener('change', function(e){
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) handleImportFile(f);
  });
  $('#btnDemo').addEventListener('click', function(){
    $('#rawInput').value = DEMO;
    $('#answerInput').value = '';
    pendingImages = Object.create(null);
    $('#fileHint').textContent = '已填入示例文本（含“只有字母的选项”示例），可直接点「解析题目」试试。';
    toast('已填入示例');
  });
  $('#btnClearInput').addEventListener('click', function(){
    $('#rawInput').value = '';
    $('#answerInput').value = '';
    pendingImages = Object.create(null);
    $('#fileHint').textContent = '未选择文件。';
    renderReport('', 'info');
  });
  $('#btnParse').addEventListener('click', doParse);

  $('#rawInput').addEventListener('paste', function(e){
    var cd = e.clipboardData;
    if (!cd) return;
    var html = '';
    try{ html = cd.getData('text/html') || ''; }catch(err){}
    if (html && /data:image\//i.test(html)){
      e.preventDefault();
      var ta = e.target;
      var start = ta.selectionStart, end = ta.selectionEnd;
      parseHtmlRichtext(html).then(function(res){
        ta.value = ta.value.slice(0, start) + res.text + ta.value.slice(end);
        Object.keys(res.images).forEach(function(t){ pendingImages[t] = res.images[t]; });
        $('#fileHint').textContent = '已从剪贴板图片内容中提取文本' +
          (Object.keys(res.images).length ? '和 ' + Object.keys(res.images).length + ' 张图片' : '') + '。';
        toast('已粘贴富文本内容');
        if (res.warnings && res.warnings.length) console.warn('[粘贴提示]', res.warnings);
      }, function(err){
        toast(err.message || '粘贴内容解析失败', 'err');
      });
      return;
    }
    if (imageFilesFromClipboard(cd).length){
      e.preventDefault();
      toast('图片请到②校对页面，粘贴到题干或选项的输入框里', 'err');
    }
  });
  $('#rawInput').addEventListener('dragover', function(e){
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) e.preventDefault();
  });
  $('#rawInput').addEventListener('drop', function(e){
    var files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    e.preventDefault();
    if (/^image\//.test(files[0].type)){
      toast('图片请到②校对页面，拖到题干或选项输入框里', 'err');
      return;
    }
    handleImportFile(files[0]);
  });

  /* 编辑列表 */
  $('#filters').addEventListener('click', function(e){
    var c = e.target.closest('.chip');
    if (!c) return;
    $$('#filters .chip').forEach(function(x){ x.classList.remove('on'); });
    c.classList.add('on');
    state.filter = c.dataset.f;
    state.page = 0;
    renderList();
  });

  var kwTimer = null;
  $('#kwInput').addEventListener('input', function(e){
    var v = e.target.value;
    if (kwTimer) clearTimeout(kwTimer);
    kwTimer = setTimeout(function(){
      state.keyword = v.trim();
      state.page = 0;
      renderList();
    }, 220);
  });

  $('#pager').addEventListener('click', function(e){
    var b = e.target.closest('[data-pg]');
    if (!b || b.disabled) return;
    state.page += (b.dataset.pg === 'next' ? 1 : -1);
    renderList();
    window.scrollTo({ top: 180, behavior: 'smooth' });
  });

  $('#qlist').addEventListener('click', handleCardAction);
  $('#qlist').addEventListener('change', handleTypeChange);
  $('#qlist').addEventListener('input', handleFieldInput);
  $('#qlist').addEventListener('focusout', handleFieldBlur);

  $('#qlist').addEventListener('paste', function(e){
    var input = e.target.closest && e.target.closest('[data-field]');
    if (!input) return;
    var files = imageFilesFromClipboard(e.clipboardData);
    if (!files.length) return;
    e.preventDefault();
    var card = input.closest('.qedit');
    var q = state.questions[indexOfId(card.dataset.id)];
    if (!q) return;
    var scope = input.dataset.field === 'stem' ? 'stem' :
                input.dataset.field === 'analysis' ? 'analysis' : 'option';
    var oi = input.dataset.oi !== undefined ? parseInt(input.dataset.oi, 10) : -1;
    addImageFiles(files, {
      qid: q.id, scope: scope, oi: oi,
      pos: typeof input.selectionStart === 'number' ? input.selectionStart : null
    });
  });

  $('#qlist').addEventListener('dragover', function(e){
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length){
      var input = e.target.closest && e.target.closest('[data-field]');
      if (input) e.preventDefault();
    }
  });
  $('#qlist').addEventListener('drop', function(e){
    var files = e.dataTransfer && e.dataTransfer.files;
    if (!files || !files.length) return;
    var card = e.target.closest && e.target.closest('.qedit');
    if (!card) return;
    var input = e.target.closest && e.target.closest('[data-field]');
    if (!input) input = $('[data-field=stem]', card);
    if (!input) return;
    var imgs = [];
    for (var i = 0; i < files.length; i++) if (/^image\//.test(files[i].type)) imgs.push(files[i]);
    if (!imgs.length) return;
    e.preventDefault();
    var q = state.questions[indexOfId(card.dataset.id)];
    if (!q) return;
    var scope = input.dataset.field === 'stem' ? 'stem' :
                input.dataset.field === 'analysis' ? 'analysis' : 'option';
    var oi = input.dataset.oi !== undefined ? parseInt(input.dataset.oi, 10) : -1;
    addImageFiles(imgs, {
      qid: q.id, scope: scope, oi: oi,
      pos: typeof input.selectionStart === 'number' ? input.selectionStart : null
    });
  });

  $('#imgFileInput').addEventListener('change', function(e){
    var files = Array.prototype.slice.call(e.target.files || []);
    e.target.value = '';
    if (!files.length || !imgTarget) return;
    var target = imgTarget;
    imgTarget = null;
    addImageFiles(files, target);
  });

  /* 批量 */
  $('#btnApplyAnswers').addEventListener('click', function(){ applyBatchAnswers(false); });
  $('#btnApplyAnswersVis').addEventListener('click', function(){ applyBatchAnswers(true); });
  $('#btnBatchType').addEventListener('click', applyBatchType);
  $('#btnClearAnswers').addEventListener('click', function(){
    if (!confirm('确定清空全部题目的答案？')) return;
    state.questions.forEach(function(q){ q.answer = []; });
    afterChange();
    toast('已清空答案');
  });
  $('#btnAddQ').addEventListener('click', function(){
    state.questions.push(makeQuestion({ type: 'single', stem: '', options: ['', '', '', ''], answer: [] }));
    state.filter = 'all';
    state.keyword = '';
    $('#kwInput').value = '';
    $$('#filters .chip').forEach(function(x){ x.classList.toggle('on', x.dataset.f === 'all'); });
    var vis = visibleList();
    state.page = Math.max(0, Math.ceil(vis.length / PAGE_SIZE) - 1);
    renderList();
    afterChange();
    var cards = $$('#qlist .qedit');
    if (cards.length){
      var last = cards[cards.length - 1];
      last.scrollIntoView({ behavior: 'smooth', block: 'center' });
      var t = $('[data-field=stem]', last);
      if (t){ t.focus(); autoGrow(t); }
    }
  });
  $('#btnClearAll').addEventListener('click', function(){
    if (!state.questions.length){ toast('题库已经是空的'); return; }
    if (!confirm('确定清空全部 ' + state.questions.length + ' 题？此操作不可撤销。')) return;
    state.questions = [];
    state.assets = Object.create(null);
    pendingImages = Object.create(null);
    afterChange();
    toast('已清空题库');
  });

  /* 生成设置 */
  ['gTitle', 'gSub', 'gFoot'].forEach(function(id){
    $('#' + id).addEventListener('input', function(e){
      if (id === 'gTitle'){
        state.meta.title = e.target.value;
        state.metaTitleAuto = false;
      }
      if (id === 'gSub') state.meta.subtitle = e.target.value;
      if (id === 'gFoot') state.meta.footer = e.target.value;
      scheduleSave();
      renderGenSummary();
    });
  });
  $('#gTitle').addEventListener('change', function(e){
    if (!$('#outName').dataset.touched){
      $('#outName').value = sanitizeFileName(e.target.value || '检测页面');
    }
  });
  $('#outName').addEventListener('input', function(){ $('#outName').dataset.touched = '1'; });
  $('#gMode').addEventListener('change', function(e){ state.settings.mode = e.target.value; scheduleSave(); });
  $('#gTheme').addEventListener('change', function(e){ state.settings.theme = e.target.value; scheduleSave(); });
  $('#gPass').addEventListener('input', function(e){
    state.settings.passScore = clamp(parseInt(e.target.value, 10) || 0, 0, 100);
    scheduleSave();
  });
  [['gShufQ', 'shuffleQ'], ['gShufO', 'shuffleO'], ['gAna', 'showAnalysis'],
   ['gPersist', 'persist'], ['gShowAns', 'showAnswerAfterWrong'], ['gRetry', 'allowRetry']]
  .forEach(function(pair){
    $('#' + pair[0]).addEventListener('change', function(e){
      state.settings[pair[1]] = e.target.checked;
      scheduleSave();
    });
  });

  $('#btnDownload').addEventListener('click', doDownload);
  $('#btnPreview').addEventListener('click', function(){
    if (!exportableQuestions().length){ toast('还没有可导出的题目', 'err'); switchTab('edit'); return; }
    var html;
    try{ html = buildQuizHtml(); }
    catch(e){ toast(e.message || '生成失败', 'err'); return; }
    $('#previewFrame').srcdoc = html;
    $('#previewMask').classList.add('on');
    document.body.style.overflow = 'hidden';
  });
  $('#btnClosePreview').addEventListener('click', function(){
    $('#previewMask').classList.remove('on');
    $('#previewFrame').srcdoc = '';
    document.body.style.overflow = '';
  });
  $('#previewMask').addEventListener('click', function(e){
    if (e.target === this) $('#btnClosePreview').click();
  });
  $('#btnDlInPreview').addEventListener('click', doDownload);
  $('#btnCopy').addEventListener('click', function(){
    if (!exportableQuestions().length){ toast('还没有可导出的题目', 'err'); return; }
    var html;
    try{ html = buildQuizHtml(); }
    catch(e){ toast(e.message || '生成失败', 'err'); return; }
    copyText(html).then(function(ok){
      toast(ok ? 'HTML 源码已复制到剪贴板，粘贴到记事本另存为 .html 即可' : '复制失败，请改用下载', ok ? 'ok' : 'err');
    });
  });

  /* 题库 */
  $('#btnExportJson').addEventListener('click', exportJson);
  $('#btnImportJson').addEventListener('click', function(){ $('#jsonInput').click(); });
  $('#jsonInput').addEventListener('change', function(e){
    var f = e.target.files && e.target.files[0];
    e.target.value = '';
    if (f) importJsonFile(f);
  });
  $('#btnWipe').addEventListener('click', function(){
    if (!confirm('确定清除本地草稿？当前编辑内容也会被清空。')) return;
    try{ localStorage.removeItem(LS_DRAFT); localStorage.removeItem(LS_DRAFT_V1); }catch(e){}
    state.questions = [];
    state.assets = Object.create(null);
    state.meta = { title: '', subtitle: '', footer: '' };
    state.metaTitleAuto = true;
    pendingImages = Object.create(null);
    syncMetaInputs();
    syncSettingsInputs();
    afterChange();
    if (saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
    try{ localStorage.removeItem(LS_DRAFT); localStorage.removeItem(LS_DRAFT_V1); }catch(e){}
    renderBankInfo();
    toast('本地草稿已清除');
  });
  $('#btnGcImages').addEventListener('click', function(){
    var before = Object.keys(state.assets).length;
    state.questions.forEach(syncQuestionImages);
    gcAssets();
    var after = Object.keys(state.assets).length;
    renderList();
    renderGenSummary();
    saveDraftNow();
    renderBankInfo();
    toast('已清理 ' + Math.max(0, before - after) + ' 张未使用图片');
  });

  /* 图片查看器 / ESC */
  $('#btnCloseImg').addEventListener('click', closeImage);
  $('#imgMask').addEventListener('click', function(e){
    if (e.target === this) closeImage();
  });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape'){
      if ($('#imgMask').classList.contains('on')) closeImage();
      else if ($('#previewMask').classList.contains('on')) $('#btnClosePreview').click();
    }
  });

  window.addEventListener('beforeunload', function(){
    if (saveTimer){ clearTimeout(saveTimer); saveDraftNow(); }
  });
}

/* ------------------------------------------------------------------ */
/* 启动                                                               */
/* ------------------------------------------------------------------ */
function boot(){
  initTheme();
  syncSettingsInputs();
  syncMetaInputs();
  var restored = loadDraft();
  if (!restored){
    renderTabCount();
    renderList();
    renderGenSummary();
  }
  renderBankInfo();
  if (restored){
    toast('已恢复上次编辑的 ' + state.questions.length + ' 题');
  }
}

/* 调试入口补充 */
window.__builder.buildQuizHtml = buildQuizHtml;
window.__builder.buildPayload = buildPayload;
window.__builder.parseDocx = parseDocx;
window.__builder.parseHtmlRichtext = parseHtmlRichtext;
window.__builder.inflateRaw = inflateRaw;
window.__builder.renderList = renderList;
window.__builder.doParse = doParse;

bindEvents();
boot();

})();
