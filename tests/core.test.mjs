import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const core = fs.readFileSync(path.join(root, 'src', 'app-core.js'), 'utf8');

const sandbox = { console, Date, Math, JSON, String, Number, Object, Array, RegExp, crypto: globalThis.crypto };
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(core + '\n})();', sandbox, { filename: 'app-core.js' });
const B = sandbox.window.__builder;
function deepEqual(actual, expected, msg){ assert.equal(JSON.stringify(actual), JSON.stringify(expected), msg); }

function parse(text, opts) {
  return B.parseQuestionText(text, opts || { defaultType: 'single' });
}

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('ok  -', name);
  } catch (e) {
    console.error('FAIL-', name);
    console.error(e && e.stack || e);
    process.exitCode = 1;
  }
}

// 1. png1: 重复的 C/D 不再塞进 D 选项
test('重复选项字母不会污染上一项（png1）', () => {
  const r = parse(`17. 在 Photoshop CC中,下列方法能删除路径的是 ( )
A. 将路径拖动到“路径”调板底部的“删除当前路径”按钮上
B. 选择要删除的路径，双击“删除当前路径”命令
C. 选择要删除的路径，在“路径”调板菜单中选择“删除路径”命令
D. 选择要删除的路径，单击“路径”调板底部的“删除当前路径”按钮
C.用前景色描边整条路径
D.转为封闭选区`);
  assert.equal(r.questions.length, 1);
  const q = r.questions[0];
  assert.equal(q.options.length, 4);
  assert.equal(q.options[3], '选择要删除的路径，单击“路径”调板底部的“删除当前路径”按钮');
  assert.ok(r.fragments.length >= 1);
  assert.match(JSON.stringify(r.fragments), /前景色/);
});

// 2. png2 多种排版：只有字母的选项
const png2Cases = {
  '每行一个': `14.信道容量的计算公式为：C=B1og2 （1+S/N），其中表示信道带宽的是______。
A.C
B.B
C.S
D.N`,
  '全部一行': '14.信道容量的计算公式为：C=B1og2 （1+S/N），其中表示信道带宽的是______。A.C B.B C.S D.N',
  '一行两栏': '14.信道容量的计算公式为：C=B1og2 （1+S/N），其中表示信道带宽的是______。A.C  B.B\nC.S  D.N',
  '全角标点': '14．信道容量的计算公式为：C=B1og2 （1+S/N），其中表示信道带宽的是______。\nＡ．Ｃ\nＢ．Ｂ\nＣ．Ｓ\nＤ．Ｎ',
  '括号选项': '14.信道容量的计算公式为：C=B1og2 （1+S/N），其中表示信道带宽的是______。\n(A)C\n(B)B\n(C)S\n(D)N',
};
for (const [name, text] of Object.entries(png2Cases)) {
  test('只有字母的选项 / ' + name, () => {
    const r = parse(text);
    assert.equal(r.questions.length, 1, JSON.stringify(r));
    const q = r.questions[0];
    deepEqual(q.options, ['C', 'B', 'S', 'N']);
    assert.equal(q.stem.includes('A.C'), false);
    assert.equal(q.stem.includes('A.'), false);
  });
}

// 3. 题号 / 章节 / 题型
test('章节标题与题型', () => {
  const r = parse(`一、单项选择题
1. 下列正确的是（ ）
A. 甲
B. 乙
C. 丙
D. 丁
二、多项选择题
2. 下列说法正确的有（ ）
A. 甲
B. 乙
C. 丙
D. 丁
三、判断题
3. 总线型拓扑最常用。（ ）
A. 正确
B. 错误`);
  assert.equal(r.questions.length, 3);
  assert.equal(r.questions[0].type, 'single');
  assert.equal(r.questions[1].type, 'multi');
  assert.equal(r.questions[2].type, 'judge');
});

test('题号写法 第1题 / (1) / 1）', () => {
  const r = parse(`第1题 题干一
A. 甲
B. 乙
(2) 题干二
A. 甲
B. 乙
3）题干三
A. 甲
B. 乙`);
  assert.equal(r.questions.length, 3);
  deepEqual(r.questions.map(q => q.srcNum), [1, 2, 3]);
});

test('小数不会被误判为新题号', () => {
  const r = parse(`1. 计算 1.5 与 2.5 的差
A. 1
B. -1`);
  assert.equal(r.questions.length, 1);
  assert.equal(r.questions[0].srcNum, 1);
});

// 4. 行内选项 / 两栏
test('题干同一行的 A-D 选项', () => {
  const r = parse('3. 网络的拓扑结构，实际上就是计算机网络中（ ）的拓扑结构。(A)用户资源子网 (B)通信子网 (C)应用层 (D)表示层');
  assert.equal(r.questions.length, 1);
  deepEqual(r.questions[0].options, ['用户资源子网', '通信子网', '应用层', '表示层']);
});

test('两栏错序 A,C,B,D 也能归位', () => {
  const r = parse(`1. 题干
A. 甲        C. 丙
B. 乙        D. 丁`);
  deepEqual(r.questions[0].options, ['甲', '乙', '丙', '丁']);
});

test('选项内容以字母开头（A.C）不会被当成答案', () => {
  const r = parse(`1. 题干
A.C
B.B
C.S
D.N`);
  deepEqual(r.questions[0].options, ['C', 'B', 'S', 'N']);
  assert.equal(r.answerText.trim(), '');
});

// 5. 答案
test('题内答案 答案：ACD 自动多选', () => {
  const r = parse(`1. 多选题干
A. 甲
B. 乙
C. 丙
D. 丁
答案：ACD
解析：因为甲乙丙`);
  const q = r.questions[0];
  assert.equal(q.type, 'multi');
  deepEqual(q.answer, [0, 2, 3]);
  assert.match(q.analysis, /甲乙丙/);
});

test('答案：C。解析：...', () => {
  const r = parse(`1. 题干
A. 甲
B. 乙
C. 丙
答案：C。解析：丙正确`);
  deepEqual(r.questions[0].answer, [2]);
  assert.equal(r.questions[0].analysis, '丙正确');
});

test('答案 ACD（无冒号）/ 答案为B', () => {
  const r = parse(`1. 题干一
A. 甲
B. 乙
C. 丙
D. 丁
答案 ACD
2. 题干二
A. 甲
B. 乙
答案为B`);
  assert.equal(r.questions[0].type, 'multi');
  deepEqual(r.questions[0].answer, [0, 2, 3]);
  deepEqual(r.questions[1].answer, [1]);
});

test('题干里的“答案只有一个”“分析与讨论”不被误判为答案/解析', () => {
  const r = parse(`1. 题干第一行
答案只有一个，请选择
A. 甲
B. 乙
C. 丙
D. 丁
2. 题干第二行
分析与讨论这一行属于题干
A. 甲
B. 乙`);
  assert.equal(r.questions.length, 2);
  assert.match(r.questions[0].stem, /答案只有一个/);
  assert.match(r.questions[1].stem, /分析与讨论/);
  deepEqual(r.questions[0].options, ['甲', '乙', '丙', '丁']);
});

test('答案单独块 1.B 2.D', () => {
  const r = parse(`1. 题干一
A. 甲
B. 乙
2. 题干二
A. 甲
B. 乙
答案：
1.B 2.A`);
  assert.equal(r.answerText.trim(), '1.B 2.A');
  const p = B.parseAnswerText(r.answerText);
  const res = B.applyAnswersTo(r.questions, p, 0);
  assert.equal(res.applied, 2);
  deepEqual(r.questions[0].answer, [1]);
  deepEqual(r.questions[1].answer, [0]);
});

test('答案块里单独成行的 5.ACD / 6.A', () => {
  const r = parse(`1. 一
A. 甲
B. 乙
2. 二
A. 甲
B. 乙
3. 三
A. 甲
B. 乙
4. 四
A. 甲
B. 乙
5. 五
A. 甲
B. 乙
C. 丙
D. 丁
6. 六
A. 甲
B. 乙
答案：
1-4 B B A A
5.ACD
6.B`);
  assert.equal(r.questions.length, 6);
  const p = B.parseAnswerText(r.answerText);
  const res = B.applyAnswersTo(r.questions, p, 0);
  assert.equal(res.applied, 6);
  deepEqual(r.questions[4].answer, [0, 2, 3]);
  deepEqual(r.questions[5].answer, [1]);
});

test('答案区间 1-5 BDDAC', () => {
  const p = B.parseAnswerText('1-5 BDDAC');
  assert.equal(p.mode, 'numbered');
  assert.equal(p.explicit[1], 'B');
  assert.equal(p.explicit[5], 'C');
});

test('纯字母串按顺序匹配', () => {
  const r = parse(`1. 一
A. 甲
B. 乙
2. 二
A. 甲
B. 乙
3. 三
A. 甲
B. 乙`);
  const p = B.parseAnswerText('B A B', true);
  assert.equal(p.mode, 'sequential');
  const res = B.applyAnswersTo(r.questions, p, 0);
  assert.equal(res.applied, 3);
  deepEqual(r.questions.map(q => q.answer[0]), [1, 0, 1]);
});

test('答案字母超出选项数会被记录', () => {
  const r = parse(`1. 一
A. 甲
B. 乙`);
  const p = B.parseAnswerText('1.D');
  const res = B.applyAnswersTo(r.questions, p, 0);
  assert.equal(res.applied, 0);
  assert.equal(res.missed.length, 1);
});

// 6. 判断题
test('正确/错误 自动识别为判断', () => {
  const r = parse(`1. 判断题干
A. 正确
B. 错误
答案：A`);
  assert.equal(r.questions[0].type, 'judge');
  deepEqual(r.questions[0].answer, [0]);
});

test('判断题按章节即使选项不是对错也保持判断', () => {
  const r = parse(`一、判断题
1. 题干
A. 甲
B. 乙`);
  assert.equal(r.questions[0].type, 'judge');
});

// 7. 图片 token
test('图片 token 保留在题干 / 选项', () => {
  const r = parse(`1. 看图回答[图1]
A. 图A[图2]
B. 图B
C. 图C
D. 图D`);
  assert.match(r.questions[0].stem, /\[图1\]/);
  assert.match(r.questions[0].options[0], /\[图2\]/);
});

// 8. 其他
test('判断题缺选项时用 正确/错误 补齐', () => {
  const r = parse(`三、判断题
1. 判断题干（ ）`);
  deepEqual(r.questions[0].options, ['正确', '错误']);
  assert.equal(r.questions[0].type, 'judge');
});

test('解析结束后没有题号时给出提示', () => {
  const r = parse('这是一段没有题号的文字。');
  assert.equal(r.questions.length, 0);
  assert.ok(r.warnings.length > 0);
});

test('qIssues 能检测空选项答案', () => {
  const q = B.makeQuestion({ stem: 'x', options: ['', '', '', ''], answer: [0] });
  assert.ok(B.qIssues(q).includes('答案指向空选项'));
});

console.log(`\n${passed} tests passed`);

