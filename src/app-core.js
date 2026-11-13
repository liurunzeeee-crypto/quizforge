/* ==========================================================================
   题目检测生成器 · V1.10 · core
   工具函数 / 图片资源 / 解析器 / 题库状态 / 本地存储
   ========================================================================== */
(function(){
'use strict';

var LETTERS = ['A','B','C','D','E','F','G','H'];
var PAGE_SIZE = 20;
var LS_DRAFT = 'quiz-builder/draft/v2';
var LS_DRAFT_V1 = 'quiz-builder-draft-v1';
var LS_THEME = 'quiz-builder/theme';
var MAX_IMG_DIM = 1400;
var MAX_IMG_BYTES = 560 * 1024;
var DATA_FORMAT = 'quiz-builder/2';

var pendingImages = Object.create(null);
var imgTarget = null;
var quotaWarned = false;

/* ------------------------------------------------------------------ */
/* 基础工具                                                           */
/* ------------------------------------------------------------------ */
function $(sel, root){ return (root || document).querySelector(sel); }
function $$(sel, root){ return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

function esc(s){
  return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c];
  });
}

function uid(prefix){
  var rnd;
  try{
    var buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    rnd = buf[0].toString(36);
  }catch(e){
    rnd = Math.random().toString(36).slice(2, 8);
  }
  return (prefix || 'q') + '_' + Date.now().toString(36) + '_' + rnd;
}

function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function debounce(fn, ms){
  var timer = null;
  return function(){
    var args = arguments, ctx = this;
    if (timer) clearTimeout(timer);
    timer = setTimeout(function(){ timer = null; fn.apply(ctx, args); }, ms);
  };
}

function formatBytes(n){
  if (!n) return '0 B';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
  return (n / 1024 / 1024).toFixed(2) + ' MB';
}

function hashStr(s){
  var h = 2166136261, step = 1;
  var str = String(s || '');
  if (str.length > 4096) step = Math.max(1, Math.floor(str.length / 2048));
  for (var i = 0; i < str.length; i += step){
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= str.length;
  return (h >>> 0).toString(36);
}

var toastTimer = null;
function toast(msg, type){
  var box = $('#toast');
  if (!box) return;
  box.textContent = msg;
  box.className = type ? type : '';
  box.classList.add('on');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function(){ box.classList.remove('on'); }, type === 'err' ? 4200 : 2800);
}

function jsonForEmbed(obj){
  return JSON.stringify(obj).replace(/[<>&\u2028\u2029]/g, function(ch){
    return '\\u' + ('0000' + ch.charCodeAt(0).toString(16)).slice(-4);
  });
}

function sanitizeFileName(name){
  var s = String(name || '').trim().replace(/\.html?$/i, '');
  s = s.replace(/[\\\/:*?"<>|]/g, '-').replace(/\s+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
  if (s.length > 60) s = s.slice(0, 60);
  return s || '检测页面';
}

function downloadText(filename, text, mime){
  try{
    var blob = new Blob([text], { type: (mime || 'text/html') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){
      try{ document.body.removeChild(a); }catch(e){}
      URL.revokeObjectURL(url);
    }, 500);
    return true;
  }catch(e){
    return false;
  }
}

function copyText(text){
  if (navigator.clipboard && navigator.clipboard.writeText){
    return navigator.clipboard.writeText(text).then(function(){ return true; }, function(){ return legacyCopy(text); });
  }
  return Promise.resolve(legacyCopy(text));
}
function legacyCopy(text){
  try{
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    var ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }catch(e){
    return false;
  }
}

function readAsDataUrl(file){
  return new Promise(function(resolve, reject){
    var reader = new FileReader();
    reader.onload = function(){ resolve(String(reader.result || '')); };
    reader.onerror = function(){ reject(new Error('读取文件失败')); };
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src){
  return new Promise(function(resolve, reject){
    var img = new Image();
    img.onload = function(){ resolve(img); };
    img.onerror = function(){ reject(new Error('图片格式暂不支持')); };
    img.src = src;
  });
}

/* ------------------------------------------------------------------ */
/* 状态                                                               */
/* ------------------------------------------------------------------ */
var state = {
  questions: [],
  meta: { title: '', subtitle: '', footer: '' },
  metaTitleAuto: true,
  settings: {
    mode: 'both', theme: 'blue', passScore: 60,
    shuffleQ: false, shuffleO: false, showAnalysis: true,
    persist: true, showAnswerAfterWrong: true, allowRetry: true
  },
  assets: Object.create(null),
  filter: 'all',
  keyword: '',
  page: 0
};

/* ------------------------------------------------------------------ */
/* 图片资源                                                           */
/* ------------------------------------------------------------------ */
var Assets = (function(){
  var seq = 1;

  function srcKey(src){
    var s = String(src || '');
    return hashStr(s.slice(0, 3000) + '|' + s.length + '|' + s.slice(-3000));
  }

  function addRaw(src, name, meta){
    var key = srcKey(src);
    for (var id in state.assets){
      if (state.assets[id] && state.assets[id].key === key) return id;
    }
    var newId = 'a' + (seq++) + '_' + key;
    state.assets[newId] = {
      id: newId,
      key: key,
      src: src,
      name: String(name || ''),
      w: (meta && meta.w) || 0,
      h: (meta && meta.h) || 0,
      bytes: Math.round(src.length * 0.75)
    };
    return newId;
  }

  function shrink(img, src, ow, oh){
    var scale = Math.min(1, MAX_IMG_DIM / Math.max(ow, oh));
    var big = src.length > MAX_IMG_BYTES;
    if (!big && scale >= 1) return { src: src, w: ow, h: oh };

    var nw = Math.max(1, Math.round(ow * scale));
    var nh = Math.max(1, Math.round(oh * scale));
    var canvas = document.createElement('canvas');
    canvas.width = nw;
    canvas.height = nh;
    var ctx = canvas.getContext('2d');
    if (!ctx) return { src: src, w: ow, h: oh };
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, nw, nh);
    ctx.drawImage(img, 0, 0, nw, nh);

    var out = '';
    try{ out = canvas.toDataURL('image/webp', 0.9); }catch(e){}
    if (!out || out.indexOf('data:image/webp') !== 0){
      try{ out = canvas.toDataURL('image/jpeg', 0.92); }catch(e){}
    }
    if (!out) return { src: src, w: ow, h: oh };
    if (out.length >= src.length && scale >= 1) return { src: src, w: ow, h: oh };
    return { src: out, w: nw, h: nh };
  }

  function normalize(src, name){
    if (!src) return Promise.reject(new Error('图片为空'));
    if (/^data:image\/svg\+xml/i.test(src)){
      return Promise.resolve({ src: src, w: 0, h: 0 });
    }
    return loadImageElement(src).then(function(img){
      var ow = img.naturalWidth || img.width || 0;
      var oh = img.naturalHeight || img.height || 0;
      if (!ow || !oh) return { src: src, w: 0, h: 0 };
      return shrink(img, src, ow, oh);
    });
  }

  function addDataUrl(src, name){
    return normalize(src, name).then(function(out){
      return addRaw(out.src, name, out);
    });
  }

  function addFile(file){
    return readAsDataUrl(file).then(function(src){
      return addDataUrl(src, file.name || '');
    });
  }

  function get(id){ return state.assets[id] || null; }

  function remove(id){
    if (!id) return;
    delete state.assets[id];
  }

  return { addDataUrl: addDataUrl, addFile: addFile, get: get, remove: remove, addRaw: addRaw };
})();

function allQuestionText(q){
  return [q.stem, q.options.join('\n'), q.analysis].join('\n');
}

function tokenUsedInQuestion(q, token){
  return allQuestionText(q).indexOf(token) >= 0;
}

function syncQuestionImages(q){
  var text = allQuestionText(q);
  q.images = (q.images || []).filter(function(ref){
    return ref && ref.token && text.indexOf(ref.token) >= 0;
  });
}

function imageRefsForField(q, scope, oi){
  var text = scope === 'stem' ? q.stem :
             scope === 'analysis' ? q.analysis :
             (q.options[oi] || '');
  return (q.images || []).filter(function(ref){ return text.indexOf(ref.token) >= 0; });
}

function nextImageToken(q){
  var used = Object.create(null);
  (q.images || []).forEach(function(ref){ used[ref.token] = 1; });
  var all = allQuestionText(q);
  var n = 1;
  while (used['[图' + n + ']'] || all.indexOf('[图' + n + ']') >= 0) n++;
  return '[图' + n + ']';
}

function assetIdForToken(q, token){
  var list = q.images || [];
  for (var i = 0; i < list.length; i++){
    if (list[i].token === token) return list[i].asset;
  }
  return null;
}

function usedAssetIds(){
  var used = Object.create(null);
  state.questions.forEach(function(q){
    (q.images || []).forEach(function(ref){
      if (ref.asset) used[ref.asset] = 1;
    });
  });
  return used;
}

function gcAssets(){
  var used = usedAssetIds();
  Object.keys(state.assets).forEach(function(id){
    if (!used[id]) delete state.assets[id];
  });
}

/* ------------------------------------------------------------------ */
/* 题目模型                                                           */
/* ------------------------------------------------------------------ */
function makeQuestion(init){
  init = init || {};
  var type = (init.type === 'multi' || init.type === 'judge') ? init.type : 'single';
  var options = (init.options && init.options.length ? init.options : ['', '', '', ''])
    .slice(0, 8).map(function(o){ return String(o == null ? '' : o); });
  while (options.length < 2) options.push('');
  var answer = (init.answer || []).map(function(x){ return parseInt(x, 10); })
    .filter(function(x){ return !isNaN(x) && x >= 0 && x < 8; });
  answer = answer.filter(function(x, i, arr){ return arr.indexOf(x) === i; }).sort(function(a, b){ return a - b; });
  var images = (init.images || []).filter(function(ref){
    return ref && typeof ref.token === 'string' && typeof ref.asset === 'string';
  }).map(function(ref){ return { token: ref.token, asset: ref.asset }; });
  var q = {
    id: init.id || uid('q'),
    type: type,
    stem: String(init.stem == null ? '' : init.stem),
    options: options,
    answer: answer,
    analysis: String(init.analysis == null ? '' : init.analysis),
    images: images
  };
  if (init.srcNum != null) q.srcNum = parseInt(init.srcNum, 10);
  return q;
}

function qIssues(q){
  var list = [];
  var filled = (q.options || []).filter(function(o){ return String(o).trim() !== ''; });
  if (!String(q.stem || '').trim()) list.push('缺题干');
  if (filled.length < 2) list.push('选项不足');
  if (q.type === 'judge' && q.options.length !== 2) list.push('判断题需 2 个选项');
  if (!q.answer || !q.answer.length){
    list.push('缺答案');
  }else{
    if (q.type !== 'multi' && q.answer.length > 1) list.push('答案多于 1 个但题型是单选');
    var bad = q.answer.some(function(i){
      return i < 0 || i >= q.options.length || !String(q.options[i] || '').trim();
    });
    if (bad) list.push('答案指向空选项');
  }
  var text = allQuestionText(q);
  var tokens = text.match(/\[图\d+\]/g) || [];
  for (var i = 0; i < tokens.length; i++){
    if (!assetIdForToken(q, tokens[i])){
      list.push('图片标记无效');
      break;
    }
  }
  return list;
}
function qReady(q){ return qIssues(q).length === 0; }

/* ------------------------------------------------------------------ */
/* 文本解析                                                           */
/* ------------------------------------------------------------------ */
function normalizeText(raw){
  return String(raw == null ? '' : raw)
    .replace(/\r\n?/g, '\n')
    .replace(/\uFEFF/g, '')
    .replace(/[\u00a0\u2007\u202f\u3000]/g, ' ')
    .replace(/[\uFF21-\uFF3A]/g, function(c){ return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/[\uFF41-\uFF5A]/g, function(c){ return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/[\uFF10-\uFF19]/g, function(c){ return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); })
    .replace(/\uFF0E/g, '.')
    .replace(/\uFF0D/g, '-')
    .replace(/\t/g, '  ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[ \u00b7]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n');
}

var RE_QSTART = /^[ \t]*(?:第[ \t]*(\d{1,3})[ \t]*题[ \t]*[.、．:：]?|[（(][ \t]*(\d{1,3})[ \t]*[)）]|(\d{1,3})[ \t]*([.、．)）:：]))[ \t]*/;
var RE_SECTION = /^[ \t]*(?:第[ \t]*[一二三四五六七八九十百\d]{1,3}[ \t]*[章节部分][ \t]*[、.．:：]?[ \t]*|[（(]?[ \t]*[一二三四五六七八九十]{1,3}[ \t]*[)）]?[ \t]*[、.．:：][ \t]*)(.{0,48})$/;
var RE_ANS_HEAD = /^[ \t]*(?:【[ \t]*(?:答案|参考答案|正确答案)[ \t]*】|(?:答案|参考答案|正确答案|本题答案|Answer|ANSWER|Ans)[ \t]*(?:(?:是|为|选)[ \t]*)?(?:[:：][ \t]*|[ \t]+(?=[A-Ha-h0-9（(])|(?=[A-Ha-h0-9（(])|$))(.*)$/i;
var RE_ANALYSIS_HEAD = /^[ \t]*(?:【[ \t]*(?:解析|答案解析|试题解析|分析|讲解)[ \t]*】|(?:解析|答案解析|试题解析|分析|讲解)[ \t]*[:：][ \t]*)(.*)$/;
var RE_OPT_LINE_START = /^[ \t]*(?:[（(][ \t]*[A-Ha-h][ \t]*[)）]|[A-Ha-h][ \t]*[.、．)）:：])/;
var RE_LETTER_LIST = /^[ \t]*[A-Ha-h](?:[ \t,，、;；.．·\-/／]*[A-Ha-h]){1,}[ \t]*$/;
var RE_RANGE_ANS = /^[ \t]*\d{1,3}[ \t]*[-~—–至到][ \t]*\d{1,3}[ \t]*[:：]?[ \t]*(?:[A-Ha-h][ \t,，、;；/／]*)+[ \t]*$/;
var RE_NUM_ANS_LINE = /^[ \t]*(?:\d{1,3}[ \t]*[.、．)）:：][ \t]*[A-Ha-h]{1,8}[ \t]*[,，、;；]?[ \t]*){2,}$/;
var RE_ONE_NUM_ANS_LINE = /^[ \t]*[（(]?\d{1,3}[)）]?[ \t]*[.、．)）:：][ \t]*[A-Ha-h]{1,8}[ \t]*$/;

function isAnswerLine(text){
  var t = String(text || '').trim();
  if (!t) return false;
  return RE_RANGE_ANS.test(t) || RE_NUM_ANS_LINE.test(t) || RE_LETTER_LIST.test(t);
}
function isAnswerBlockLine(text){
  var t = String(text || '').trim();
  if (!t) return false;
  return isAnswerLine(t) || RE_ONE_NUM_ANS_LINE.test(t);
}
function isOptionStart(text){
  return RE_OPT_LINE_START.test(String(text || '').trim());
}

/* 扫描文本中的选项字母标记（行首、括号、或标点/空白之后） */
function scanOptionLabels(text){
  var out = [];
  var i = 0, n = text.length;
  while (i < n){
    var c = text.charAt(i);
    var prev = i > 0 ? text.charAt(i - 1) : '';
    var boundary = i === 0 || !/[A-Za-z0-9_]/.test(prev);
    if (boundary && (c === '(' || c === '（')){
      var m1 = /^[（(][ \t]*([A-Ha-h])[ \t]*[)）]/.exec(text.slice(i));
      if (m1){
        var letter1 = m1[1].toUpperCase();
        out.push({ letter: letter1, start: i, end: i + m1[0].length });
        i += m1[0].length;
        continue;
      }
    }
    if (boundary && /[A-Ha-h]/.test(c)){
      var m2 = /^([A-Ha-h])[ \t]*([.、．)）:：])/.exec(text.slice(i));
      if (m2){
        out.push({ letter: m2[1].toUpperCase(), start: i, end: i + m2[0].length });
        i += m2[0].length;
        continue;
      }
    }
    i++;
  }
  return out;
}

/* 从候选标记中选出连续的 A 开始的一组；两栏错序（A,C,B,D）也能归位 */
function pickOptionGroup(labels){
  var best = null;
  for (var i = 0; i < labels.length; i++){
    if (labels[i].letter !== 'A') continue;
    var byLetter = Object.create(null);
    var maxIdx = -1;
    for (var j = i; j < labels.length; j++){
      var lab = labels[j];
      if (j > i && lab.letter === 'A') break;
      if (byLetter[lab.letter]) break; /* 重复字母：后面的内容属于未归属片段 */
      byLetter[lab.letter] = lab;
      var idx = LETTERS.indexOf(lab.letter);
      if (idx > maxIdx) maxIdx = idx;
    }
    var list = [];
    for (var k = 0; k <= maxIdx && k < LETTERS.length; k++){
      var item = byLetter[LETTERS[k]];
      if (!item) break;
      list.push(item);
    }
    if (list.length >= 2 && (!best || list.length > best.length)) best = list;
  }
  return best;
}

function cleanOption(s){
  return String(s == null ? '' : s)
    .replace(/\r/g, '')
    .replace(/\n+/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/^[\s,，、;；.．:：)）]+/, '')
    .trim();
}
function cleanStem(s){
  return String(s == null ? '' : s)
    .replace(/\r/g, '')
    .replace(/\n+/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractOptions(text){
  var labels = scanOptionLabels(text);
  if (labels.length < 2) return null;
  var group = pickOptionGroup(labels);
  if (!group || group.length < 2) return null;

  var inGroup = Object.create(null);
  group.forEach(function(lab){ inGroup[lab.letter] = lab; });

  var sorted = labels.slice().sort(function(a, b){ return a.start - b.start; });
  for (var i = 0; i < sorted.length; i++){
    sorted[i]._end = (i + 1 < sorted.length) ? sorted[i + 1].start : text.length;
  }

  var byLetter = Object.create(null);
  group.forEach(function(lab){
    byLetter[lab.letter] = cleanOption(text.slice(lab.end, lab._end));
  });

  var orderedLetters = Object.keys(byLetter).sort(function(a, b){ return LETTERS.indexOf(a) - LETTERS.indexOf(b); });
  var options = orderedLetters.map(function(l){ return byLetter[l]; });

  var fragments = [];
  labels.forEach(function(lab){
    if (inGroup[lab.letter] === lab) return;
    var content = cleanOption(text.slice(lab.end, lab._end));
    if (!content) return;
    fragments.push({ letter: lab.letter, text: content });
  });

  var start = sorted[0].start;
  for (var g = 0; g < group.length; g++) if (group[g].start < start) start = group[g].start;
  var stem = cleanStem(text.slice(0, start));

  return {
    stem: stem,
    options: options,
    fragments: fragments,
    labels: group
  };
}

function pullInlineAnalysis(text){
  var re = /(?:^|[\n。；;])\s*(?:【\s*(?:解析|答案解析|试题解析|分析|讲解)\s*】|(?:解析|答案解析|试题解析|分析|讲解)\s*[:：])\s*/;
  var m = re.exec(text);
  if (!m) return { text: text, analysis: '' };
  var analysis = text.slice(m.index + m[0].length).replace(/\s*\n\s*/g, ' ').trim();
  var head = text.slice(0, m.index).replace(/[。；;]\s*$/, '');
  return { text: head, analysis: analysis };
}

function pullInlineAnswer(text){
  var re = /(?:【[ \t]*(?:答案|参考答案|正确答案)[ \t]*】|(?:答案|参考答案|正确答案)[ \t]*(?:是|为|选)?[ \t]*[:：]?[ \t]*)([A-Ha-h](?:[ \t,，、;；/／]*[A-Ha-h]){0,7})(?![A-Za-z0-9])/;
  var m = re.exec(text);
  if (!m) return { text: text, answer: '' };
  var answer = m[1].replace(/[^A-Ha-h]/g, '').toUpperCase();
  if (!answer) return { text: text, answer: '' };
  var head = text.slice(0, m.index);
  var tail = text.slice(m.index + m[0].length);
  return { text: (head + ' ' + tail).trim(), answer: answer };
}

function leadingAnswerLetters(text){
  var m = /^[ \t]*([A-Ha-h](?:[ \t,，、;；/／]*[A-Ha-h]){0,7})(?![A-Za-z0-9])/.exec(String(text || ''));
  if (!m) return '';
  return m[1].replace(/[^A-Ha-h]/g, '').toUpperCase();
}

function detectJudge(options){
  if (!options || options.length !== 2) return false;
  function norm(s){
    return String(s || '').replace(/[\s。．.、,，;；:：()（）]/g, '').toLowerCase();
  }
  var a = norm(options[0]), b = norm(options[1]);
  if (!a || !b) return false;
  var set = [a, b].sort().join('|');
  var known = ['对|错', '正确|错误', '√|×', '✓|✗', '是|否', 't|f', 'true|false',
    '正确|不正确', '对|不对', '是|不是', 'right|wrong'];
  return known.indexOf(set) >= 0;
}

function lettersToIndices(letters, optCount){
  var idx = [];
  var up = String(letters || '').toUpperCase();
  var limit = Math.max(2, Math.min(8, optCount || 0));
  for (var i = 0; i < up.length; i++){
    var c = up.charCodeAt(i) - 65;
    if (c >= 0 && c < limit && idx.indexOf(c) < 0) idx.push(c);
  }
  idx.sort(function(a, b){ return a - b; });
  return idx;
}

function sectionTypeOf(label){
  if (/多选|多项|不定项/.test(label)) return 'multi';
  if (/判断|正误/.test(label)) return 'judge';
  if (/单选|单项/.test(label)) return 'single';
  return null;
}

function parseQuestionText(raw, opts){
  opts = opts || {};
  var text = normalizeText(raw);
  var lines = text.split('\n');
  var blocks = [];
  var answerLines = [];
  var current = null;
  var sectionType = null;
  var inAnswer = false;
  var inAnalysis = false;
  var preamble = [];
  var problems = [];
  var warnings = [];
  var fragments = [];

  function pushAnswerLine(line){
    answerLines.push(line);
    inAnswer = true;
    inAnalysis = false;
  }

  for (var i = 0; i < lines.length; i++){
    var line = lines[i];
    var trimmed = line.trim();

    if (!trimmed){
      if (current){
        if (inAnalysis) current.analysis = (current.analysis || '') + ' ';
        else current.content += '\n';
      }
      continue;
    }

    /* 答案块里的内容优先按答案处理，避免 “1.B 2.D” 被当成新题号 */
    if (inAnswer && !isAnswerBlockLine(trimmed)){
      inAnswer = false;
    }
    if (inAnswer && isAnswerBlockLine(trimmed)){
      pushAnswerLine(trimmed);
      continue;
    }

    /* 章节标题 */
    var sm = RE_SECTION.exec(trimmed);
    if (sm && isSectionLine(trimmed, sm)){
      var label = sm[1] || '';
      var st = sectionTypeOf(label);
      if (st) sectionType = st;
      else if (/第[ \t]*[一二三四五六七八九十百\d]{1,3}[ \t]*[章节部分]/.test(trimmed)) sectionType = null;
      inAnswer = false;
      inAnalysis = false;
      current = null;
      continue;
    }

    /* 新题号 */
    var qm = RE_QSTART.exec(line);
    if (qm){
      var num = parseInt(qm[1] || qm[2] || qm[3], 10);
      var sep = qm[4] || '';
      var rest = line.slice(qm[0].length);
      if (!(sep === '.' && /^\d/.test(rest))){
        current = {
          num: num,
          content: rest,
          ownAnswer: '',
          analysis: '',
          sectionType: sectionType
        };
        blocks.push(current);
        inAnswer = false;
        inAnalysis = false;
        continue;
      }
    }

    /* 答案行 */
    var am = RE_ANS_HEAD.exec(trimmed);
    if (am){
      var ansRest = (am[1] || '').trim();
      if (!ansRest){
        inAnswer = true;
        inAnalysis = false;
        continue;
      }
      if (/^\s*\d/.test(ansRest) && isAnswerBlockLine(ansRest)){
        pushAnswerLine(ansRest);
        continue;
      }
      var letters = leadingAnswerLetters(ansRest);
      if (letters){
        if (current) current.ownAnswer = (current.ownAnswer || '') + letters;
        else answerLines.push(letters);
        if (current){
          var tail = ansRest.replace(/^[A-Ha-h][A-Ha-h \t,，、;；/／]*/, '');
          if (tail && /解析|分析|讲解/.test(tail)){
            tail = tail.replace(/^[\s。；;，,、:：]+/, '')
              .replace(/^【?\s*(?:解析|答案解析|试题解析|分析|讲解)\s*】?\s*[:：]?\s*/, '');
            if (tail) current.analysis = ((current.analysis || '') + ' ' + tail).trim();
          }
        }
        inAnswer = false;
        inAnalysis = false;
        continue;
      }
      inAnswer = false;
      continue;    }

    /* 解析行 */
    var nm = RE_ANALYSIS_HEAD.exec(trimmed);
    if (nm){
      if (current){
        current.analysis = (current.analysis || '') + ' ' + (nm[1] || '').trim();
      }
      inAnalysis = true;
      inAnswer = false;
      continue;
    }

    if (inAnswer){
      if (isAnswerBlockLine(trimmed)){
        pushAnswerLine(trimmed);
        continue;
      }
      inAnswer = false;
    }

    if (inAnalysis && current){
      current.analysis = ((current.analysis || '') + ' ' + trimmed).trim();
      continue;
    }

    /* 纯答案串 */
    if (!isOptionStart(trimmed) && isAnswerLine(trimmed)){
      pushAnswerLine(trimmed);
      continue;
    }

    /* 正文 */
    if (current){
      current.content += (current.content ? '\n' : '') + line;
    }else{
      preamble.push(trimmed);
    }
  }

  /* 组装题目 */
  var questions = [];
  for (var b = 0; b < blocks.length; b++){
    var blk = blocks[b];
    var content = blk.content;

    var anaRes = pullInlineAnalysis(content);
    content = anaRes.text;
    var ansRes = pullInlineAnswer(content);
    content = ansRes.text;

    var own = (blk.ownAnswer || '') + (ansRes.answer || '');
    own = own.split('').filter(function(ch, idx, arr){ return arr.indexOf(ch) === idx; }).join('');
    var analysis = [blk.analysis || '', anaRes.analysis || ''].join(' ').replace(/\s{2,}/g, ' ').trim();

    var ex = extractOptions(content);
    var q;
    if (ex){
      q = makeQuestion({ stem: ex.stem, options: ex.options, analysis: analysis });
      if (ex.fragments.length){
        fragments.push({ num: blk.num, items: ex.fragments });
      }
    }else{
      q = makeQuestion({ stem: cleanStem(content), options: ['', '', '', ''], analysis: analysis });
      if (cleanStem(content)) problems.push({ num: blk.num, msg: '未识别到选项，请手动补全' });
    }

    var t = blk.sectionType || opts.defaultType || 'single';
    var letters = own.split('');
    if (letters.length > 1) t = 'multi';
    if (detectJudge(q.options)) t = 'judge';

    if (t === 'judge'){
      var nonEmpty = q.options.filter(function(o){ return String(o).trim(); });
      if (q.options.length !== 2){
        if (nonEmpty.length === 0){
          q.options = ['正确', '错误'];
        }else{
          t = opts.defaultType === 'judge' ? 'judge' : (letters.length > 1 ? 'multi' : 'single');
        }
      }
    }
    q.type = t;
    q.srcNum = blk.num;

    if (letters.length){
      var idx = lettersToIndices(letters, q.options.length);
      if (!idx.length){
        problems.push({ num: blk.num, msg: '答案字母 ' + letters + ' 与选项数不匹配' });
      }else{
        q.answer = idx;
        if (idx.length > 1 && q.type === 'single') q.type = 'multi';
        if (q.type === 'judge' && idx.length > 1) q.answer = [idx[0]];
      }
    }

    questions.push(q);
  }

  if (!questions.length){
    warnings.push('没有识别到带题号的题目。请确认每道题以 1. / 1、 / (1) 等题号开头。');
  }
  if (inAnswer && answerLines.length === 0){
    warnings.push('检测到「答案」段落，但其中没有可用字母。');
  }

  return {
    questions: questions,
    answerText: answerLines.join('\n'),
    fragments: fragments,
    problems: problems,
    warnings: warnings,
    blockCount: blocks.length,
    titleHint: preamble.length ? preamble[0] : ''
  };
}

function isSectionLine(trimmed, match){
  var label = match[1] || '';
  if (/第[ \t]*[一二三四五六七八九十百\d]{1,3}[ \t]*[章节部分]/.test(trimmed)) return true;
  if (sectionTypeOf(label)) return true;
  return /选择|填空|简答|论述|计算|判断|正误/.test(label) && label.length <= 30;
}

/* ------------------------------------------------------------------ */
/* 答案解析                                                           */
/* ------------------------------------------------------------------ */
function parseAnswerText(text){
  var out = { explicit: Object.create(null), seq: [], mode: 'none' };
  var t = normalizeText(text);
  if (!t.trim()) return out;
  var m, found = false;

  var rangeRe = /(\d{1,3})[ \t]*[-~—–至到][ \t]*(\d{1,3})[ \t]*[:：]?[ \t]*((?:[A-Ha-h][ \t,，、;；/／]*)+)/g;
  while ((m = rangeRe.exec(t)) !== null){
    var a = parseInt(m[1], 10), b = parseInt(m[2], 10);
    var ls = m[3].toUpperCase().replace(/[^A-H]/g, '');
    if (b >= a && ls){
      for (var k = 0; a + k <= b && k < ls.length; k++){
        if (out.explicit[a + k] === undefined){
          out.explicit[a + k] = ls.charAt(k);
          found = true;
        }
      }
    }
  }

  var numRe = /(?:^|[\s,，;；、])[（(]?(\d{1,3})[)）]?[ \t]*[.、．)）:：][ \t]*([A-Ha-h]{1,8})(?![A-Za-z0-9])/g;
  while ((m = numRe.exec(t)) !== null){
    var n = parseInt(m[1], 10);
    if (n >= 1 && out.explicit[n] === undefined){
      out.explicit[n] = m[2].toUpperCase();
      found = true;
    }
  }

  var seqStr = t
    .replace(/参考答案|正确答案|本题答案|答案|题号|Answer|answer|ANSWER/g, ' ')
    .replace(/单项选择题|多项选择题|不定项选择题|单选题|多选题|判断题|选择题|填空题|简答题/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/[^A-Ha-h]+/g, '');
  out.seq = seqStr.toUpperCase().split('');

  if (found) out.mode = 'numbered';
  else if (out.seq.length) out.mode = 'sequential';
  return out;
}

function applyAnswersTo(questions, parsed, startIndex){
  startIndex = startIndex || 0;
  var applied = 0, promoted = 0, missed = [];
  for (var i = 0; i < questions.length; i++){
    var q = questions[i];
    var letters = '';
    if (parsed.mode === 'numbered'){
      var candidates = [];
      if (q.srcNum != null) candidates.push(q.srcNum);
      candidates.push(startIndex + i + 1);
      for (var c = 0; c < candidates.length; c++){
        if (parsed.explicit[candidates[c]]){
          letters = parsed.explicit[candidates[c]];
          break;
        }
      }
    }else if (parsed.mode === 'sequential'){
      if (parsed.seq[i] !== undefined) letters = parsed.seq[i];
    }
    if (!letters) continue;
    var idx = lettersToIndices(letters, q.options.length);
    if (!idx.length){
      missed.push({ num: q.srcNum || (startIndex + i + 1), letters: letters });
      continue;
    }
    q.answer = idx;
    if (idx.length > 1 && q.type !== 'multi' && q.type !== 'judge'){
      q.type = 'multi';
      promoted++;
    }
    if (q.type === 'judge' && idx.length > 1) q.answer = [idx[0]];
    applied++;
  }
  return { applied: applied, promoted: promoted, missed: missed };
}

/* ------------------------------------------------------------------ */
/* 题库序列化 / 草稿                                                  */
/* ------------------------------------------------------------------ */
function usedAssetMap(){
  var used = usedAssetIds();
  var out = Object.create(null);
  Object.keys(used).forEach(function(id){
    if (state.assets[id]) out[id] = state.assets[id];
  });
  return out;
}

function collectAll(){
  state.questions.forEach(syncQuestionImages);
  return {
    format: DATA_FORMAT,
    version: 2,
    savedAt: new Date().toISOString(),
    meta: {
      title: state.meta.title || '',
      subtitle: state.meta.subtitle || '',
      footer: state.meta.footer || ''
    },
    settings: JSON.parse(JSON.stringify(state.settings)),
    questions: state.questions.map(function(q){
      var out = {
        type: q.type,
        stem: q.stem,
        options: q.options.slice(),
        answer: q.answer.slice(),
        analysis: q.analysis || '',
        images: (q.images || []).map(function(ref){ return { token: ref.token, asset: ref.asset }; })
      };
      if (q.srcNum != null) out.srcNum = q.srcNum;
      return out;
    }),
    assets: usedAssetMap()
  };
}

function normalizeSettings(src){
  if (!src) return;
  var allowed = {
    mode: ['both', 'practice', 'exam'],
    theme: ['blue', 'green', 'violet', 'orange', 'dark']
  };
  ['mode', 'theme'].forEach(function(k){
    if (src[k] && allowed[k].indexOf(src[k]) >= 0) state.settings[k] = src[k];
  });
  ['shuffleQ', 'shuffleO', 'showAnalysis', 'persist', 'showAnswerAfterWrong', 'allowRetry'].forEach(function(k){
    if (src[k] !== undefined) state.settings[k] = !!src[k];
  });
  if (src.passScore !== undefined){
    var p = parseInt(src.passScore, 10);
    if (!isNaN(p)) state.settings.passScore = clamp(p, 0, 100);
  }
}

function loadAll(data, silent){
  if (!data || !Array.isArray(data.questions)) {
    if (!silent) toast('文件格式不正确：缺少 questions 数组', 'err');
    return false;
  }
  var assets = Object.create(null);
  if (data.assets && typeof data.assets === 'object'){
    Object.keys(data.assets).forEach(function(id){
      var a = data.assets[id];
      if (a && typeof a.src === 'string' && /^data:image\//.test(a.src)){
        assets[id] = {
          id: id,
          key: a.key || hashStr(a.src.slice(0, 2000) + a.src.length),
          src: a.src,
          name: a.name || '',
          w: a.w || 0,
          h: a.h || 0,
          bytes: a.bytes || Math.round(a.src.length * 0.75)
        };
      }
    });
  }
  state.assets = assets;

  state.questions = data.questions.map(function(q){
    return makeQuestion({
      type: q.type,
      stem: q.stem,
      options: q.options,
      answer: q.answer,
      analysis: q.analysis,
      images: q.images,
      srcNum: q.srcNum
    });
  });

  state.meta = { title: '', subtitle: '', footer: '' };
  if (data.meta){
    state.meta.title = String(data.meta.title || '');
    state.meta.subtitle = String(data.meta.subtitle || '');
    state.meta.footer = String(data.meta.footer || '');
  }
  state.metaTitleAuto = !state.meta.title;
  normalizeSettings(data.settings);

  state.filter = 'all';
  state.keyword = '';
  state.page = 0;

  syncSettingsInputs();
  syncMetaInputs();
  renderTabCount();
  renderList();
  renderGenSummary();
  renderBankInfo();
  return true;
}

var saveTimer = null;
function scheduleSave(){
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraftNow, 700);
}

function saveDraftNow(){
  saveTimer = null;
  try{
    var data = collectAll();
    var str = JSON.stringify(data);
    if (str.length > 4.4 * 1024 * 1024 && !quotaWarned){
      quotaWarned = true;
      toast('题库体积较大（约 ' + formatBytes(str.length * 2) + '），建议尽快导出 JSON 备份', 'err');
    }
    localStorage.setItem(LS_DRAFT, str);
  }catch(e){
    if (!quotaWarned){
      quotaWarned = true;
      toast('本地草稿保存失败：存储空间可能已满，请导出 JSON 备份', 'err');
    }
  }
}

function loadDraft(){
  try{
    var raw = localStorage.getItem(LS_DRAFT);
    if (!raw) raw = localStorage.getItem(LS_DRAFT_V1);
    if (!raw) return false;
    var data = JSON.parse(raw);
    if (!data || !Array.isArray(data.questions) || !data.questions.length) return false;
    return loadAll(data, true);
  }catch(e){
    return false;
  }
}

/* 调试 / 测试入口 */
window.__builder = {
  state: state,
  parseQuestionText: parseQuestionText,
  parseAnswerText: parseAnswerText,
  applyAnswersTo: applyAnswersTo,
  extractOptions: extractOptions,
  lettersToIndices: lettersToIndices,
  makeQuestion: makeQuestion,
  qIssues: qIssues,
  collectAll: collectAll,
  loadAll: loadAll,
  saveDraft: saveDraftNow,
  Assets: Assets
};
