/* ==========================================================================
   V1.10.1 · 文字版 PDF 自动导入（内嵌 PDF.js）
   - 提取文字 + 页面内嵌图片，按页面位置生成 [图N] 标记
   - 不处理扫描版 / OCR；扫描页会给出提示
   ========================================================================== */

var pdfRuntime = { ready: false, fake: false, workerUrl: null };

function base64ToUint8(b64){
  var bin = atob(String(b64 || ''));
  var out = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function pdfErr(msg){
  var e = new Error(msg);
  e.__pdfFriendly = true;
  return e;
}

function withTimeout(promise, ms, label){
  return new Promise(function(resolve, reject){
    var done = false;
    var timer = setTimeout(function(){
      if (done) return;
      done = true;
      reject(new Error(label || '操作超时'));
    }, ms);
    promise.then(function(v){
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(v);
    }, function(e){
      if (done) return;
      done = true;
      clearTimeout(timer);
      reject(e);
    });
  });
}

function EmbeddedCMapReaderFactory(){
  /* PDF.js 会调用 fetch({name})；所有中文 GB 系 CMap 已内嵌 */
}
EmbeddedCMapReaderFactory.prototype.fetch = function(data){
  var name = data && data.name;
  var b64 = (typeof PDF_CMAP_DATA !== 'undefined' && PDF_CMAP_DATA) ? PDF_CMAP_DATA[name] : null;
  if (!b64){
    return Promise.reject(new Error('PDF 字体映射缺失：' + name));
  }
  return Promise.resolve({
    cMapData: base64ToUint8(b64),
    compressionType: 1 /* BINARY */
  });
};

function ensurePdfRuntime(){
  if (!window.pdfjsLib) return Promise.reject(pdfErr('PDF 解析模块未加载'));
  if (!pdfRuntime.ready){
    try{
      if (typeof PDFJS_WORKER_SOURCE !== 'string' || !PDFJS_WORKER_SOURCE){
        throw new Error('缺少 PDF worker');
      }
      pdfRuntime.workerUrl = URL.createObjectURL(new Blob([PDFJS_WORKER_SOURCE], { type: 'text/javascript' }));
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfRuntime.workerUrl;
      pdfRuntime.ready = true;
    }catch(e){
      return Promise.reject(pdfErr('PDF 解析模块初始化失败：' + (e.message || e)));
    }
  }
  return Promise.resolve(window.pdfjsLib);
}

/* 某些 file:// 环境不允许 blob worker；回退到主线程 fake worker */
function enableFakePdfWorker(){
  if (pdfRuntime.fake) return;
  if (typeof PDFJS_WORKER_SOURCE !== 'string' || !PDFJS_WORKER_SOURCE){
    throw new Error('缺少 PDF worker');
  }
  /* worker 的 UMD 包会设置 globalThis.pdfjsWorker，PDF.js 主线程可直接使用 */
  (0, eval)(PDFJS_WORKER_SOURCE);
  var dummy = URL.createObjectURL(new Blob(['throw new Error("pdfjs fake-worker fallback");'], { type: 'text/javascript' }));
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = dummy;
  pdfRuntime.fake = true;
}

async function openPdfDocument(data){
  var lib = await ensurePdfRuntime();
  var opts = {
    data: data,
    CMapReaderFactory: EmbeddedCMapReaderFactory,
    useSystemFonts: true,
    isEvalSupported: false,
    isOffscreenCanvasSupported: false,
    disableAutoFetch: true,
    disableStream: true
  };
  try{
    var task = lib.getDocument(opts);
    return await withTimeout(task.promise, 30000, 'PDF 解析超时');
  }catch(e){
    var msg = String((e && e.message) || e || '');
    if (!pdfRuntime.fake && /worker|fake|Setting up|importScripts|timed out|超时/i.test(msg)){
      try{ enableFakePdfWorker(); }catch(err){ throw pdfErr('PDF 解析模块初始化失败：' + (err.message || err)); }
      var task2 = lib.getDocument(opts);
      return await withTimeout(task2.promise, 45000, 'PDF 解析超时');
    }
    throw e;
  }
}

/* ------------------------------------------------------------------ */
/* PDF 文字行重建                                                      */
/* ------------------------------------------------------------------ */
function pdfBuildTextLines(items){
  var lines = [];
  for (var i = 0; i < items.length; i++){
    var it = items[i];
    var str = String(it.str == null ? '' : it.str).replace(/\u0000/g, '');
    if (!str.trim()) continue;
    var x = it.transform ? it.transform[4] : 0;
    var y = it.transform ? it.transform[5] : 0;
    var h = it.height || 12;
    var w = it.width || 0;
    var line = null;
    for (var k = 0; k < lines.length; k++){
      if (Math.abs(lines[k].y - y) <= 2.5){ line = lines[k]; break; }
    }
    if (!line){
      line = { y: y, top: y + h, left: x, right: x + w, h: h, parts: [] };
      lines.push(line);
    }
    line.parts.push({ x: x, w: w, str: str });
    line.left = Math.min(line.left, x);
    line.right = Math.max(line.right, x + w);
    line.top = Math.max(line.top, y + h);
    line.h = Math.max(line.h, h);
  }
  for (var n = 0; n < lines.length; n++){
    var l = lines[n];
    l.parts.sort(function(a, b){ return a.x - b.x; });
    var text = '', prevRight = null;
    for (var p = 0; p < l.parts.length; p++){
      var part = l.parts[p];
      if (prevRight !== null && part.x - prevRight > 2.5) text += ' ';
      text += part.str;
      prevRight = part.x + part.w;
    }
    l.text = text.replace(/\s{2,}/g, ' ').trim();
  }
  return lines.filter(function(l){ return l.text; });
}

/* ------------------------------------------------------------------ */
/* PDF 图片位置 / 提取                                                 */
/* ------------------------------------------------------------------ */
function pdfMulMatrix(m, n){
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5]
  ];
}

function pdfCollectImageOps(ops){
  var OPS = window.pdfjsLib.OPS;
  var ctm = [1, 0, 0, 1, 0, 0];
  var stack = [];
  var out = [];
  for (var i = 0; i < ops.fnArray.length; i++){
    var fn = ops.fnArray[i];
    var args = ops.argsArray[i];
    if (fn === OPS.save){ stack.push(ctm.slice()); continue; }
    if (fn === OPS.restore){ ctm = stack.pop() || ctm; continue; }
    if (fn === OPS.transform){ ctm = pdfMulMatrix(ctm, args); continue; }
    if (fn === OPS.paintFormXObjectBegin){
      stack.push(ctm.slice());
      if (args && args[0]) ctm = pdfMulMatrix(ctm, args[0]);
      continue;
    }
    if (fn === OPS.paintFormXObjectEnd){ ctm = stack.pop() || ctm; continue; }
    if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject){
      var corners = [[0,0], [1,0], [0,1], [1,1]].map(function(c){
        return [
          ctm[0] * c[0] + ctm[2] * c[1] + ctm[4],
          ctm[1] * c[0] + ctm[3] * c[1] + ctm[5]
        ];
      });
      var xs = corners.map(function(c){ return c[0]; });
      var ys = corners.map(function(c){ return c[1]; });
      var left = Math.min.apply(null, xs), right = Math.max.apply(null, xs);
      var top = Math.max.apply(null, ys), bottom = Math.min.apply(null, ys);
      if (right - left < 2 || top - bottom < 2) continue;
      out.push({
        kind: fn === OPS.paintImageXObject ? 'xobj' : 'inline',
        name: fn === OPS.paintImageXObject ? args[0] : '',
        data: fn === OPS.paintInlineImageXObject ? args[0] : null,
        box: { left: left, right: right, top: top, bottom: bottom, w: right - left, h: top - bottom }
      });
    }
  }
  return out;
}

function pdfGetImageObject(page, name){
  return new Promise(function(resolve){
    var done = false;
    function finish(obj){ if (done) return; done = true; resolve(obj || null); }
    var timer = setTimeout(function(){ finish(null); }, 8000);
    try{
      page.objs.get(name, function(obj){
        clearTimeout(timer);
        finish(obj);
      });
    }catch(e){
      clearTimeout(timer);
      finish(null);
    }
  });
}

function pdfImageToDataUrl(img){
  if (!img) return '';
  var w = img.width || img.naturalWidth || 0;
  var h = img.height || img.naturalHeight || 0;
  if (!w || !h) return '';
  var canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  var ctx = canvas.getContext('2d');
  if (!ctx) return '';
  try{
    var drawable = (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) ||
      (typeof HTMLCanvasElement !== 'undefined' && img instanceof HTMLCanvasElement) ||
      (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement);
    if (drawable || typeof img.getContext === 'function'){
      ctx.drawImage(img, 0, 0, w, h);
    }else if (typeof ImageData !== 'undefined' && img instanceof ImageData){
      ctx.putImageData(img, 0, 0);
    }else if (img.data && img.data.length){
      var dest = ctx.createImageData(w, h);
      var src = img.data;
      var kind = img.kind;
      if (kind === 2 && src.length >= w * h * 3){
        for (var i = 0, j = 0; i < w * h; i++, j += 3){
          dest.data[i * 4] = src[j];
          dest.data[i * 4 + 1] = src[j + 1];
          dest.data[i * 4 + 2] = src[j + 2];
          dest.data[i * 4 + 3] = 255;
        }
      }else if (kind === 3 && src.length >= w * h * 4){
        dest.data.set(src.subarray(0, w * h * 4));
      }else if (kind === 1){
        var rowBytes = (w + 7) >> 3;
        for (var yy = 0; yy < h; yy++){
          for (var xx = 0; xx < w; xx++){
            var bit = (src[yy * rowBytes + (xx >> 3)] >> (7 - (xx & 7))) & 1;
            var v = bit ? 255 : 0;
            var di = (yy * w + xx) * 4;
            dest.data[di] = v;
            dest.data[di + 1] = v;
            dest.data[di + 2] = v;
            dest.data[di + 3] = 255;
          }
        }
      }else if (src.length === w * h * 4){
        dest.data.set(src);
      }else{
        return '';
      }
      ctx.putImageData(dest, 0, 0);
    }else{
      return '';
    }
    return canvas.toDataURL('image/png');
  }catch(e){
    return '';
  }
}

async function pdfImageToken(page, pageNo, op, ctx, index){
  var cacheKey = op.kind === 'xobj' ? ('x:' + pageNo + ':' + op.name) : ('i:' + pageNo + ':' + index);
  var assetId = ctx.assetCache[cacheKey];
  if (!assetId){
    var img = op.kind === 'xobj' ? await pdfGetImageObject(page, op.name) : op.data;
    if (!img){
      ctx.warnings.push('第 ' + pageNo + ' 页有一张图片未能读取');
      return null;
    }
    var dataUrl = pdfImageToDataUrl(img);
    if (!dataUrl){
      ctx.warnings.push('第 ' + pageNo + ' 页有一张图片格式无法读取');
      return null;
    }
    assetId = await Assets.addDataUrl(dataUrl, 'PDF p' + pageNo + ' image');
    ctx.assetCache[cacheKey] = assetId;
  }
  var token = '[图' + (++ctx.seq) + ']';
  ctx.images[token] = assetId;
  return token;
}

function pdfFriendlyError(e){
  var msg = String((e && e.message) || e || '未知错误');
  if (/password|encrypted/i.test(msg) || (e && e.name === 'PasswordException')){
    return pdfErr('这个 PDF 已加密，请先解除密码后再导入');
  }
  if (/CMap|font mapping|字体映射/i.test(msg)){
    return pdfErr('PDF 使用了未内置的字体映射，文字无法提取。请用 Word 打开 PDF，另存为 DOCX 后再导入。');
  }
  if (/InvalidPDF|Invalid PDF|Missing PDF/i.test(msg)){
    return pdfErr('PDF 文件损坏或格式不受支持');
  }
  return pdfErr('PDF 解析失败：' + msg);
}

async function parsePdf(buffer, fileName, onProgress){
  var pdf = null;
  try{
    pdf = await openPdfDocument(new Uint8Array(buffer));
    var ctx = { seq: 0, images: Object.create(null), assetCache: Object.create(null), warnings: [] };
    var pages = [];
    var scannedPages = [];
    var numPages = pdf.numPages;

    for (var p = 1; p <= numPages; p++){
      var page = await pdf.getPage(p);
      var view = page.view || [0, 0, 612, 792];
      var pageW = Math.abs(view[2] - view[0]);
      var pageH = Math.abs(view[3] - view[1]);
      var tc = await page.getTextContent({ normalizeWhitespace: true });
      var lines = pdfBuildTextLines(tc.items);
      var pageTextLen = lines.map(function(l){ return l.text; }).join('').replace(/\s/g, '').length;
      var ops = await page.getOperatorList();
      var boxes = pdfCollectImageOps(ops);
      var events = lines.map(function(l){
        return { type: 'text', top: l.top, left: l.left, text: l.text };
      });

      for (var b = 0; b < boxes.length; b++){
        var box = boxes[b];
        var fullPage = box.box.w > pageW * 0.72 && box.box.h > pageH * 0.72;
        if (fullPage && pageTextLen < 12){
          scannedPages.push(p);
          continue;
        }
        /* 页眉 / 页脚的小 logo 不当作题目图片 */
        if ((box.box.top > pageH - 36 || box.box.bottom < 36) && box.box.w < 140 && box.box.h < 100) continue;
        var token = await pdfImageToken(page, p, box, ctx, b);
        if (token){
          events.push({ type: 'image', top: box.box.top, left: box.box.left, token: token });
        }
      }

      events.sort(function(a, b){
        return (b.top - a.top) || (a.left - b.left);
      });
      pages.push({ num: p, pageH: pageH, events: events });
      if (typeof onProgress === 'function') onProgress(p, numPages);
      if (page.cleanup) page.cleanup();
    }

    /* 页眉 / 页脚 / 页码过滤 */
    var topCount = Object.create(null);
    var bottomCount = Object.create(null);
    pages.forEach(function(pg){
      var texts = pg.events.filter(function(e){ return e.type === 'text'; });
      if (!texts.length) return;
      var first = texts[0], last = texts[texts.length - 1];
      if (first.top > pg.pageH - 62) topCount[first.text] = (topCount[first.text] || 0) + 1;
      if (last.top < 72) bottomCount[last.text] = (bottomCount[last.text] || 0) + 1;
    });
    var pageNoRe = /^(?:第?\s*\d{1,4}\s*页(?:\s*共\s*\d{1,4}\s*页)?|[-—–\s]*\d{1,4}[-—–\s]*)$/;
    pages.forEach(function(pg){
      pg.events = pg.events.filter(function(e){
        if (e.type !== 'text') return true;
        var t = e.text.trim();
        if (!t) return false;
        if (pageNoRe.test(t)) return false;
        if (e.top > pg.pageH - 62 && topCount[t] >= 2) return false;
        if (e.top < 72 && bottomCount[t] >= 2) return false;
        return true;
      });
    });

    var out = [];
    pages.forEach(function(pg, idx){
      pg.events.forEach(function(e){
        out.push(e.type === 'text' ? e.text : e.token);
      });
      if (idx < pages.length - 1) out.push('');
    });

    var text = out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    var plain = text.replace(/\[图\d+\]/g, '').replace(/\s/g, '');
    if (!plain){
      if (scannedPages.length){
        throw pdfErr('这个 PDF 没有可提取的文字层，可能是扫描版。扫描版需要先做 OCR（可用 WPS / Adobe / 白描等工具），或把题目截图逐题贴进选项；Word 直接打开扫描版通常只能得到图片，不能代替 OCR。');
      }
      throw pdfErr('PDF 中没有提取到文字。如果是扫描版 / 纯图片 PDF，请先用 OCR 工具识别文字，或把截图逐题贴进选项。');
    }
    if (scannedPages.length && plain.length < 30){
      throw pdfErr('这个 PDF 大部分是扫描页，没有足够文字可生成题目。请先用 OCR 工具识别文字，或把题目截图逐题贴进选项。');
    }
    if (scannedPages.length){
      ctx.warnings.push('第 ' + scannedPages.join('、') + ' 页看起来是扫描页，已跳过');
    }
    if (ctx.warnings.length > 8) ctx.warnings = ctx.warnings.slice(0, 8);

    return {
      text: text,
      images: ctx.images,
      warnings: ctx.warnings,
      fileName: fileName || ''
    };
  }catch(e){
    if (e && e.__pdfFriendly) throw e;
    throw pdfFriendlyError(e);
  }finally{
    if (pdf){
      try{ await pdf.destroy(); }catch(e){}
    }
  }
}
