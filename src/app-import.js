/* ==========================================================================
   V1.10.1 · 文件导入（DOCX / HTML）· 图片插入
   —— 离线 DOCX：ZIP 解压 + OOXML 文本/图片/表格提取
   ========================================================================== */

/* ------------------------------------------------------------------ */
/* raw inflate（DecompressionStream 不可用时的兜底）                   */
/* ------------------------------------------------------------------ */
var LEN_BASE  = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
var LEN_EXTRA = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
var DIST_BASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
var DIST_EXTRA= [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];

function inflateRaw(u8, expected){
  var pos = 0, bitbuf = 0, bitcnt = 0;
  var out = new Uint8Array(Math.max(1024, expected || Math.min(u8.length * 4, 8 * 1024 * 1024)));
  var op = 0;

  function ensure(n){
    if (op + n <= out.length) return;
    var next = new Uint8Array(Math.max(out.length * 2, op + n + 1024));
    next.set(out.subarray(0, op));
    out = next;
  }
  function bits(n){
    while (bitcnt < n){
      if (pos >= u8.length) throw new Error('压缩数据不完整');
      bitbuf |= u8[pos++] << bitcnt;
      bitcnt += 8;
    }
    var v = bitbuf & ((1 << n) - 1);
    bitbuf >>>= n;
    bitcnt -= n;
    return v;
  }
  function buildHuffman(lengths){
    var max = 0;
    for (var i = 0; i < lengths.length; i++) if (lengths[i] > max) max = lengths[i];
    if (!max) return { max: 0, table: Object.create(null) };
    var count = new Array(max + 1).fill(0);
    for (var j = 0; j < lengths.length; j++) if (lengths[j]) count[lengths[j]]++;
    var nextCode = new Array(max + 1).fill(0);
    var code = 0;
    for (var b = 1; b <= max; b++){
      code = (code + count[b - 1]) << 1;
      nextCode[b] = code;
    }
    var table = Object.create(null);
    for (var sym = 0; sym < lengths.length; sym++){
      var len = lengths[sym];
      if (!len) continue;
      table[(len << 16) | nextCode[len]] = sym;
      nextCode[len]++;
    }
    return { max: max, table: table };
  }
  function decode(h){
    var code = 0;
    for (var len = 1; len <= h.max; len++){
      code = (code << 1) | bits(1);
      var sym = h.table[(len << 16) | code];
      if (sym !== undefined) return sym;
    }
    throw new Error('压缩数据损坏（Huffman）');
  }

  var fixedLit = null, fixedDist = null;
  function getFixed(){
    if (fixedLit) return;
    var lit = new Array(288);
    for (var i = 0; i < 144; i++) lit[i] = 8;
    for (var j = 144; j < 256; j++) lit[j] = 9;
    for (var k = 256; k < 280; k++) lit[k] = 7;
    for (var m = 280; m < 288; m++) lit[m] = 8;
    var dist = new Array(32);
    for (var d = 0; d < 32; d++) dist[d] = 5;
    fixedLit = buildHuffman(lit);
    fixedDist = buildHuffman(dist);
  }

  var finalBlock = 0;
  do {
    finalBlock = bits(1);
    var type = bits(2);

    if (type === 0){
      bitbuf = 0; bitcnt = 0;
      if (pos + 4 > u8.length) throw new Error('压缩数据不完整（stored）');
      var len = u8[pos] | (u8[pos + 1] << 8);
      var nlen = u8[pos + 2] | (u8[pos + 3] << 8);
      pos += 4;
      if (((len ^ 0xffff) & 0xffff) !== nlen) throw new Error('压缩数据校验失败');
      if (pos + len > u8.length) throw new Error('压缩数据不完整（stored data）');
      ensure(len);
      out.set(u8.subarray(pos, pos + len), op);
      op += len;
      pos += len;
      continue;
    }

    var litH, distH;
    if (type === 1){
      getFixed();
      litH = fixedLit;
      distH = fixedDist;
    }else if (type === 2){
      var hlit = bits(5) + 257;
      var hdist = bits(5) + 1;
      var hclen = bits(4) + 4;
      var order = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];
      var clen = new Array(19).fill(0);
      for (var c = 0; c < hclen; c++) clen[order[c]] = bits(3);
      var codeH = buildHuffman(clen);
      var lengths = new Array(hlit + hdist).fill(0);
      var idx = 0;
      while (idx < lengths.length){
        var sym = decode(codeH);
        if (sym < 16){
          lengths[idx++] = sym;
        }else if (sym === 16){
          if (idx === 0) throw new Error('压缩数据损坏（repeat）');
          var prev = lengths[idx - 1];
          var rep = 3 + bits(2);
          while (rep-- > 0 && idx < lengths.length) lengths[idx++] = prev;
        }else if (sym === 17){
          var rep17 = 3 + bits(3);
          while (rep17-- > 0 && idx < lengths.length) lengths[idx++] = 0;
        }else if (sym === 18){
          var rep18 = 11 + bits(7);
          while (rep18-- > 0 && idx < lengths.length) lengths[idx++] = 0;
        }else{
          throw new Error('压缩数据损坏（code length）');
        }
      }
      litH = buildHuffman(lengths.slice(0, hlit));
      distH = buildHuffman(lengths.slice(hlit, hlit + hdist));
    }else{
      throw new Error('压缩数据损坏（block type）');
    }

    while (true){
      var lsym = decode(litH);
      if (lsym < 256){
        ensure(1);
        out[op++] = lsym;
      }else if (lsym === 256){
        break;
      }else{
        var li = lsym - 257;
        if (li < 0 || li >= LEN_BASE.length) throw new Error('压缩数据损坏（length）');
        var length = LEN_BASE[li] + (LEN_EXTRA[li] ? bits(LEN_EXTRA[li]) : 0);
        var dsym = decode(distH);
        if (dsym >= DIST_BASE.length) throw new Error('压缩数据损坏（distance）');
        var dist = DIST_BASE[dsym] + (DIST_EXTRA[dsym] ? bits(DIST_EXTRA[dsym]) : 0);
        if (dist > op) throw new Error('压缩数据损坏（distance overflow）');
        ensure(length);
        for (var copy = 0; copy < length; copy++){
          out[op] = out[op - dist];
          op++;
        }
      }
    }
  } while (!finalBlock);

  return out.subarray(0, op);
}

function inflateRawAsync(data, expected){
  if (typeof DecompressionStream === 'function' && typeof Response === 'function'){
    try{
      var stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Response(stream).arrayBuffer().then(function(buf){
        return new Uint8Array(buf);
      }, function(){
        return inflateRaw(data, expected);
      });
    }catch(e){}
  }
  try{
    return Promise.resolve(inflateRaw(data, expected));
  }catch(err){
    return Promise.reject(err);
  }
}

/* ------------------------------------------------------------------ */
/* 最小 ZIP 读取                                                       */
/* ------------------------------------------------------------------ */
function unzip(buffer){
  var u8 = new Uint8Array(buffer);
  var dv = new DataView(buffer);
  var eocd = -1;
  var floor = Math.max(0, u8.length - 66000);
  for (var i = u8.length - 22; i >= floor; i--){
    if (dv.getUint32(i, true) === 0x06054b50){ eocd = i; break; }
  }
  if (eocd < 0) throw new Error('不是有效的 DOCX 文件（未找到 ZIP 目录）');

  var count = dv.getUint16(eocd + 10, true);
  var cdOffset = dv.getUint32(eocd + 16, true);
  if (cdOffset <= 0 || cdOffset >= u8.length) throw new Error('DOCX 目录损坏');
  var entries = Object.create(null);
  var p = cdOffset;

  for (var n = 0; n < count; n++){
    if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) break;
    var method = dv.getUint16(p + 10, true);
    var compSize = dv.getUint32(p + 20, true);
    var uncompSize = dv.getUint32(p + 24, true);
    var nameLen = dv.getUint16(p + 28, true);
    var extraLen = dv.getUint16(p + 30, true);
    var commentLen = dv.getUint16(p + 32, true);
    var localOff = dv.getUint32(p + 42, true);
    var name = new TextDecoder('utf-8').decode(u8.subarray(p + 46, p + 46 + nameLen));
    entries[name] = { method: method, compSize: compSize, uncompSize: uncompSize, localOff: localOff };
    p += 46 + nameLen + extraLen + commentLen;
  }

  function getBytes(name){
    var ent = entries[name];
    if (!ent) return null;
    var lp = ent.localOff;
    if (lp + 30 > u8.length || dv.getUint32(lp, true) !== 0x04034b50) return null;
    var nl = dv.getUint16(lp + 26, true);
    var el = dv.getUint16(lp + 28, true);
    var dataStart = lp + 30 + nl + el;
    var dataEnd = dataStart + ent.compSize;
    if (dataEnd > u8.length) throw new Error('DOCX 内容损坏：' + name);
    return u8.subarray(dataStart, dataEnd);
  }

  function getText(name){
    var bytes = getBytes(name);
    if (!bytes) return '';
    if (entries[name].method === 0) return new TextDecoder('utf-8').decode(bytes);
    return null; /* 异步解压由外部处理 */
  }

  return {
    names: Object.keys(entries),
    has: function(name){ return !!entries[name]; },
    getBytes: getBytes,
    getText: getText,
    method: function(name){ return entries[name] ? entries[name].method : -1; },
    uncompSize: function(name){ return entries[name] ? entries[name].uncompSize : 0; }
  };
}

async function zipText(zip, name){
  var bytes = zip.getBytes(name);
  if (!bytes) return '';
  if (zip.method(name) === 0) return new TextDecoder('utf-8').decode(bytes);
  var out = await inflateRawAsync(bytes, zip.uncompSize(name));
  return new TextDecoder('utf-8').decode(out);
}

async function zipBytes(zip, name){
  var bytes = zip.getBytes(name);
  if (!bytes) return null;
  if (zip.method(name) === 0) return bytes.slice();
  return inflateRawAsync(bytes, zip.uncompSize(name));
}

/* ------------------------------------------------------------------ */
/* DOCX / OOXML                                                       */
/* ------------------------------------------------------------------ */
var NS_W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
var NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
var NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
var NS_V = 'urn:schemas-microsoft-com:vml';
var NS_M = 'http://schemas.openxmlformats.org/officeDocument/2006/math';

function normalizeZipTarget(target){
  var t = String(target || '').replace(/\\/g, '/');
  if (!t) return '';
  if (/^(https?:|file:|mailto:)/i.test(t)) return '';
  if (t.charAt(0) === '/') t = t.slice(1);
  else t = 'word/' + t;
  var parts = t.split('/');
  var out = [];
  for (var i = 0; i < parts.length; i++){
    var p = parts[i];
    if (!p || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return out.join('/');
}

function mimeForPath(path){
  var ext = String(path || '').split('.').pop().toLowerCase();
  return {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    bmp: 'image/bmp', webp: 'image/webp', svg: 'image/svg+xml',
    tif: 'image/tiff', tiff: 'image/tiff', emf: 'image/emf', wmf: 'image/wmf'
  }[ext] || 'application/octet-stream';
}

function parseRelationships(xml){
  var map = Object.create(null);
  if (!xml) return map;
  try{
    var doc = new DOMParser().parseFromString(xml, 'application/xml');
    var list = doc.getElementsByTagName('Relationship');
    for (var i = 0; i < list.length; i++){
      var id = list[i].getAttribute('Id');
      var target = list[i].getAttribute('Target');
      if (id) map[id] = target;
    }
  }catch(e){}
  return map;
}

function blobToDataUrl(blob){
  return readAsDataUrl(blob);
}

async function parseDocx(buffer, fileName){
  var zip = unzip(buffer);
  if (!zip.has('word/document.xml')) throw new Error('DOCX 中缺少 word/document.xml');
  var docXml = await zipText(zip, 'word/document.xml');
  var relXml = await zipText(zip, 'word/_rels/document.xml.rels');
  var relMap = parseRelationships(relXml);

  var xmlDoc;
  try{
    xmlDoc = new DOMParser().parseFromString(docXml, 'application/xml');
  }catch(e){
    throw new Error('DOCX 正文 XML 解析失败');
  }
  if (xmlDoc.getElementsByTagName('parsererror').length) throw new Error('DOCX 正文 XML 损坏');
  var body = xmlDoc.getElementsByTagNameNS(NS_W, 'body')[0];
  if (!body) throw new Error('DOCX 正文为空');

  var images = Object.create(null);
  var warnings = [];
  var tokenByRel = Object.create(null);
  var tokenSeq = 0;

  async function imageTokenForNode(node){
    var relId = '';
    var blips = node.getElementsByTagNameNS(NS_A, 'blip');
    if (blips.length){
      relId = blips[0].getAttributeNS(NS_R, 'embed') || blips[0].getAttributeNS(NS_R, 'link') || '';
      if (!relId){
        relId = blips[0].getAttribute('r:embed') || blips[0].getAttribute('r:link') || '';
      }
    }
    if (!relId){
      var imgs = node.getElementsByTagNameNS(NS_V, 'imagedata');
      if (imgs.length){
        relId = imgs[0].getAttributeNS(NS_R, 'id') || imgs[0].getAttribute('r:id') || '';
      }
    }
    if (!relId) return '';
    if (tokenByRel[relId]) return tokenByRel[relId];

    var target = relMap[relId];
    if (!target) return '';
    var path = normalizeZipTarget(target);
    if (!path) return '';
    if (/\.(emf|wmf|tif|tiff)$/i.test(path)){
      warnings.push('存在 Word 矢量图 / TIFF（' + path.split('/').pop() + '），浏览器无法直接显示，已跳过');
      return '';
    }
    if (!zip.has(path)) return '';
    var bytes = await zipBytes(zip, path);
    if (!bytes) return '';
    var mime = mimeForPath(path);
    var dataUrl;
    try{
      dataUrl = await blobToDataUrl(new Blob([bytes], { type: mime }));
      var assetId = await Assets.addDataUrl(dataUrl, path.split('/').pop());
      var token = '[图' + (++tokenSeq) + ']';
      images[token] = assetId;
      tokenByRel[relId] = token;
      return token;
    }catch(e){
      warnings.push('图片 ' + path.split('/').pop() + ' 读取失败：' + (e.message || '格式不支持'));
      return '';
    }
  }

  async function inlineText(node, parts){
    for (var child = node.firstChild; child; child = child.nextSibling){
      if (child.nodeType !== 1) continue;
      var ln = child.localName;
      if (ln === 'pPr' || ln === 'rPr' || ln === 'sectPr' || ln === 'tblPr' ||
          ln === 'trPr' || ln === 'tcPr' || ln === 'instrText' || ln === 'del' || ln === 'moveFrom'){
        continue;
      }
      if (ln === 't'){
        parts.push(child.textContent || '');
        continue;
      }
      if (ln === 'tab'){
        parts.push(' ');
        continue;
      }
      if (ln === 'br' || ln === 'cr'){
        parts.push('\n');
        continue;
      }
      if (ln === 'drawing' || ln === 'pict' || ln === 'object'){
        var tok = await imageTokenForNode(child);
        if (tok) parts.push(tok);
        continue;
      }
      if (ln === 'AlternateContent'){
        var choice = null;
        for (var cc = child.firstChild; cc; cc = cc.nextSibling){
          if (cc.nodeType === 1 && cc.localName === 'Choice'){ choice = cc; break; }
        }
        if (choice) await inlineText(choice, parts);
        continue;
      }
      if (ln === 'oMath' || ln === 'oMathPara' || ln === 'oMathParaPr'){
        var maths = child.getElementsByTagNameNS(NS_M, 't');
        var mathText = '';
        for (var mi = 0; mi < maths.length; mi++) mathText += maths[mi].textContent || '';
        if (mathText) parts.push(mathText);
        continue;
      }
      await inlineText(child, parts);
    }
  }

  async function paragraphText(p){
    var parts = [];
    await inlineText(p, parts);
    return parts.join('');
  }

  async function cellText(tc){
    var parts = [];
    for (var child = tc.firstChild; child; child = child.nextSibling){
      if (child.nodeType !== 1) continue;
      if (child.localName === 'p'){
        var t = await paragraphText(child);
        if (t) parts.push(t);
      }else if (child.localName === 'tbl'){
        /* 嵌套表格：递归展平 */
        var nested = await tableText(child);
        if (nested) parts.push(nested);
      }
    }
    return parts.join(' ');
  }

  async function tableText(tbl){
    var rows = tbl.getElementsByTagNameNS(NS_W, 'tr');
    var lines = [];
    for (var r = 0; r < rows.length; r++){
      var cells = rows[r].children || [];
      var vals = [];
      for (var c = 0; c < cells.length; c++){
        if (cells[c].localName !== 'tc') continue;
        vals.push(await cellText(cells[c]));
      }
      if (vals.join('').trim()) lines.push(vals.join('  '));
    }
    return lines.join('\n');
  }

  async function walkBlocks(node, lines){
    for (var child = node.firstChild; child; child = child.nextSibling){
      if (child.nodeType !== 1) continue;
      var ln = child.localName;
      if (ln === 'p'){
        var txt = await paragraphText(child);
        lines.push(txt);
      }else if (ln === 'tbl'){
        var tb = await tableText(child);
        if (tb) lines.push(tb);
      }else if (ln === 'sectPr' || ln === 'bookmarkStart' || ln === 'bookmarkEnd'){
        continue;
      }else{
        await walkBlocks(child, lines);
      }
    }
  }

  var lines = [];
  await walkBlocks(body, lines);

  if (xmlDoc.getElementsByTagNameNS(NS_W, 'numPr').length){
    warnings.push('检测到 Word 自动编号：若题号/选项字母是自动编号而不是手打的，导入后可能缺少字母，建议在 Word 里转换为纯文本后重试');
  }

  var text = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new Error('DOCX 中没有提取到可读文本');
  var blipCount = xmlDoc.getElementsByTagNameNS(NS_A, 'blip').length +
    xmlDoc.getElementsByTagNameNS(NS_V, 'imagedata').length;
  if (blipCount && Object.keys(images).length === 0){
    warnings.push('DOCX 中检测到图片，但浏览器无法读取（可能是 EMF / WMF 矢量图）');
  }

  return { text: text, images: images, warnings: warnings, fileName: fileName || '' };
}

/* ------------------------------------------------------------------ */
/* HTML 富文本提取                                                     */
/* ------------------------------------------------------------------ */
var HTML_BLOCK_TAGS = {
  P:1, DIV:1, LI:1, TR:1, H1:1, H2:1, H3:1, H4:1, H5:1, H6:1,
  BLOCKQUOTE:1, SECTION:1, ARTICLE:1, HEADER:1, FOOTER:1, UL:1, OL:1,
  TABLE:1, PRE:1, FIGURE:1, FIGCAPTION:1, DL:1, DT:1, DD:1
};

async function parseHtmlRichtext(html, label){
  var doc = new DOMParser().parseFromString(String(html || ''), 'text/html');
  $$('script,style,noscript,iframe,svg,canvas,template', doc).forEach(function(el){
    if (el.parentNode) el.parentNode.removeChild(el);
  });

  var images = Object.create(null);
  var warnings = [];
  var tokenSeq = 0;
  var srcToToken = Object.create(null);
  var parts = [];

  async function imageToken(img){
    var src = img.getAttribute('src') || '';
    if (!src) return '';
    if (/^data:image\//i.test(src)){
      if (srcToToken[src]) return srcToToken[src];
      try{
        var assetId = await Assets.addDataUrl(src, img.getAttribute('alt') || '');
        var token = '[图' + (++tokenSeq) + ']';
        images[token] = assetId;
        srcToToken[src] = token;
        return token;
      }catch(e){
        warnings.push('网页中的一张内嵌图片无法读取（' + (e.message || '格式不支持') + '）');
        return '';
      }
    }
    if (/^https?:/i.test(src)){
      warnings.push('网页图片是外链（http/https），离线环境无法读取：' + src.slice(0, 80));
    }else if (/^file:/i.test(src)){
      warnings.push('网页图片引用本地文件，浏览器无法读取该路径');
    }
    return '';
  }

  async function walk(node){
    for (var child = node.firstChild; child; child = child.nextSibling){
      if (child.nodeType === 3){
        parts.push(child.nodeValue || '');
        continue;
      }
      if (child.nodeType !== 1) continue;
      var tag = child.tagName;
      var ln = child.localName;
      if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'IFRAME' ||
          tag === 'SVG' || tag === 'CANVAS' || tag === 'TEMPLATE'){
        continue;
      }
      if (tag === 'BR'){
        parts.push('\n');
        continue;
      }
      if (tag === 'IMG'){
        var tok = await imageToken(child);
        if (tok) parts.push(tok);
        continue;
      }
      if (tag === 'TD' || tag === 'TH'){
        parts.push('  ');
        await walk(child);
        parts.push('  ');
        continue;
      }
      if (HTML_BLOCK_TAGS[tag]){
        parts.push('\n');
        await walk(child);
        parts.push('\n');
        continue;
      }
      await walk(child);
    }
  }

  await walk(doc.body);
  var text = parts.join('')
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text) throw new Error('HTML 中没有提取到可读文本');
  return { text: text, images: images, warnings: warnings, fileName: label || '' };
}

/* ------------------------------------------------------------------ */
/* 文件读取 / 导入                                                    */
/* ------------------------------------------------------------------ */
function readTextFile(file, encoding){
  return new Promise(function(resolve, reject){
    var reader = new FileReader();
    reader.onload = function(){ resolve(String(reader.result || '')); };
    reader.onerror = function(){ reject(new Error('读取文件失败')); };
    reader.readAsText(file, encoding || 'UTF-8');
  });
}

function setImportBusy(on, msg){
  var status = $('#importStatus');
  if (status){
    status.classList.toggle('on', !!on);
    $('#importStatusText').textContent = msg || '';
  }
  $('#btnPickFile').disabled = !!on;
  $('#btnParse').disabled = !!on;
}

function applyImported(text, imageMap, label, warnings){
  $('#rawInput').value = text;
  pendingImages = imageMap || Object.create(null);
  var imgCount = Object.keys(pendingImages).length;
  var msg = '已从 ' + (label || '文件') + ' 提取文本' + (imgCount ? '和 ' + imgCount + ' 张图片' : '') + '。点「解析题目」继续。';
  if (warnings && warnings.length){
    msg += ' 提示：' + warnings.slice(0, 2).join('；');
  }
  $('#fileHint').textContent = msg;
  toast('已读取 ' + (label || '文件') + (imgCount ? '（含 ' + imgCount + ' 张图片）' : ''));
  if (warnings && warnings.length) console.warn('[导入提示]', warnings);
}

async function handleImportFile(file){
  if (!file) return;
  var name = file.name || '';
  var ext = (name.split('.').pop() || '').toLowerCase();
  setImportBusy(true, '正在读取 ' + name + '…');
  try{
    if (ext === 'docx'){
      setImportBusy(true, '正在解压 DOCX 并提取图片…');
      var res = await parseDocx(await file.arrayBuffer(), name);
      applyImported(res.text, res.images, name, res.warnings);
    }else if (ext === 'pdf'){
      setImportBusy(true, '正在解析 PDF 的文字和图片…');
      var resPdf = await parsePdf(await file.arrayBuffer(), name, function(pageNo, total){
        setImportBusy(true, '正在解析 PDF 第 ' + pageNo + ' / ' + total + ' 页…');
      });
      applyImported(resPdf.text, resPdf.images, name, resPdf.warnings);
    }else if (ext === 'html' || ext === 'htm'){
      setImportBusy(true, '正在解析 HTML…');
      var res2 = await parseHtmlRichtext(await readTextFile(file, 'UTF-8'), name);
      applyImported(res2.text, res2.images, name, res2.warnings);
    }else{
      var txt = await readTextFile(file, $('#encSel').value);
      $('#rawInput').value = txt;
      pendingImages = Object.create(null);
      $('#fileHint').textContent = '已读取：' + name + '（' + $('#encSel').value + '，' + formatBytes(file.size) + '）。若显示乱码，请把编码切到 GBK 后重新选择文件。';
      toast('文件已读取：' + name);
    }
  }catch(err){
    toast(err && err.message ? err.message : '导入失败，请换一个文件', 'err');
    console.error(err);
  }finally{
    setImportBusy(false);
  }
}

/* 把导入时产生的 [图N] 标记挂到题目上 */
function attachImagesToQuestions(qs){
  qs.forEach(function(q){
    var text = allQuestionText(q);
    var tokens = text.match(/\[图\d+\]/g) || [];
    var seen = Object.create(null);
    q.images = q.images || [];
    tokens.forEach(function(token){
      if (seen[token]) return;
      seen[token] = 1;
      if (assetIdForToken(q, token)) return;
      var assetId = pendingImages[token];
      if (assetId && state.assets[assetId]) q.images.push({ token: token, asset: assetId });
    });
    q.images = q.images.filter(function(ref){ return text.indexOf(ref.token) >= 0; });
  });
}

/* ------------------------------------------------------------------ */
/* 图片插入到题干 / 选项                                              */
/* ------------------------------------------------------------------ */
function fieldGet(q, scope, oi){
  if (scope === 'stem') return q.stem;
  if (scope === 'analysis') return q.analysis;
  return q.options[oi] || '';
}
function fieldSet(q, scope, oi, val){
  if (scope === 'stem') q.stem = val;
  else if (scope === 'analysis') q.analysis = val;
  else q.options[oi] = val;
}
function fieldInputInCard(card, scope, oi){
  if (!card) return null;
  if (scope === 'stem') return $('[data-field=stem]', card);
  if (scope === 'analysis') return $('[data-field=analysis]', card);
  var rows = $$('.optrow', card);
  var row = rows[oi];
  return row ? $('[data-field=opt]', row) : null;
}

function insertTokenAt(text, token, pos){
  var val = String(text || '');
  if (pos == null || pos < 0 || pos > val.length) pos = val.length;
  var before = val.slice(0, pos);
  var after = val.slice(pos);
  var prefix = before && !/\s$/.test(before) ? ' ' : '';
  var suffix = after && !/^\s/.test(after) ? ' ' : '';
  var next = before + prefix + token + suffix + after;
  return { value: next, caret: before.length + prefix.length + token.length + suffix.length };
}

function removeImageToken(q, scope, oi, token){
  var val = fieldGet(q, scope, oi);
  var next = String(val || '').split(token).join('').replace(/[ \t]{2,}/g, ' ').trim();
  fieldSet(q, scope, oi, next);
  if (!tokenUsedInQuestion(q, token)){
    q.images = (q.images || []).filter(function(ref){ return ref.token !== token; });
  }
  var card = $('.qedit[data-id="' + q.id + '"]');
  if (card){
    var input = fieldInputInCard(card, scope, oi);
    if (input) input.value = next;
    renderThumbs(card, q);
    syncCardVisual(card, q, indexOfId(q.id));
  }
  afterChange(true);
  toast('已移除图片');
}

function imageFilesFromClipboard(cd){
  var files = [];
  if (!cd) return files;
  if (cd.items){
    for (var i = 0; i < cd.items.length; i++){
      var it = cd.items[i];
      if (it.kind === 'file' && /^image\//.test(it.type)){
        var f = it.getAsFile();
        if (f) files.push(f);
      }
    }
  }
  if (!files.length && cd.files){
    for (var j = 0; j < cd.files.length; j++){
      if (/^image\//.test(cd.files[j].type)) files.push(cd.files[j]);
    }
  }
  return files;
}

async function addImageFiles(files, target){
  if (!target) return;
  var q = state.questions[indexOfId(target.qid)];
  if (!q) return;
  if (!files || !files.length) return;
  toast('正在处理 ' + files.length + ' 张图片…');
  var added = 0;
  var pos = target.pos;
  var lastScope = target.scope, lastOi = target.oi;
  for (var i = 0; i < files.length; i++){
    try{
      var assetId = await Assets.addFile(files[i]);
      if (!assetId) continue;
      var token = nextImageToken(q);
      q.images = q.images || [];
      q.images.push({ token: token, asset: assetId });
      var ins = insertTokenAt(fieldGet(q, target.scope, target.oi), token, pos);
      fieldSet(q, target.scope, target.oi, ins.value);
      pos = ins.caret;
      added++;
    }catch(e){
      toast('图片处理失败：' + (e.message || '格式不支持'), 'err');
    }
  }
  if (!added) return;

  var card = $('.qedit[data-id="' + q.id + '"]');
  if (card){
    var fresh = refreshCard(card, indexOfId(q.id));
    var input = fieldInputInCard(fresh, lastScope, lastOi);
    if (input){
      input.focus();
      try{ input.setSelectionRange(pos, pos); }catch(e){}
    }
  }
  afterChange(true);
  toast('已插入 ' + added + ' 张图片');
}

function beginImagePick(q, scope, oi, card){
  var input = fieldInputInCard(card, scope, oi);
  var pos = input && typeof input.selectionStart === 'number' ? input.selectionStart : null;
  imgTarget = { qid: q.id, scope: scope, oi: oi, pos: pos };
  $('#imgFileInput').value = '';
  $('#imgFileInput').click();
}
