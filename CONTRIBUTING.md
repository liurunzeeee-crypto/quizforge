# 贡献指南

感谢你愿意改进这个项目。

## 开发环境

- Node.js 20+
- 现代浏览器（Chrome / Edge 优先）
- 不需要 `npm install`：项目没有 npm 依赖，PDF.js 在 `vendor/pdfjs/`

## 本地构建与测试

```bash
npm run build
npm test
```

可选：

```bash
npm run test:e2e   # 需要本机 Chrome；Windows 路径写死在 tests/e2e.mjs
npm run validate   # 需要 Python + lxml
```

## 提交 Issue

请尽量提供：

- 操作系统和浏览器版本；
- 导入的文件类型（DOCX / PDF / HTML / TXT）；
- 期望结果和实际结果；
- **删改后的最小复现文本**或截图。

请不要上传：

- 教材、真题、培训机构题库等版权内容；
- 身份证号、设备 ID、学校内部资料等个人信息；
- 完整的学生名单或成绩。

## 提交 PR

- 先开 Issue 描述要解决的问题，避免大改动方向不一致；
- 保持单文件构建可用：`npm run build` 必须成功；
- 不要引入需要联网的 CDN、字体或脚本；
- 新增解析规则时，请补 `tests/core.test.mjs` 用例；
- 图片/PDF 相关改动请说明测试用的 PDF 来源，仓库只接受自编或可公开的样例；
- 提交信息建议使用：

```text
feat: 支持 xxx 格式
fix: 修复 xxx 选项解析
docs: 更新 README
```

## 发布流程（维护者）

1. 更新 `package.json` 版本和 `CHANGELOG.md`
2. `npm run build`
3. `npm test`
4. 提交并打 tag：`git tag v1.x.x`
5. GitHub Release 上传 `dist/题目检测生成器.html`
