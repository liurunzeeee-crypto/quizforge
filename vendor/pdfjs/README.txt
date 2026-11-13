PDF.js 3.11.174
================

来源：npm 包 pdfjs-dist@3.11.174（legacy build）
许可：Apache-2.0（见同目录 LICENSE）

本目录只保留构建所需文件：

- pdf.min.js            PDF.js 主库（UMD，供 `window.pdfjsLib`）
- pdf.worker.min.js     PDF Worker（构建时转成字符串，按需创建 Blob Worker）
- cmaps/*.bcmap         中文 GB 系 CMap（Adobe-GB1 / GB / GBK / GBT / UniGB）
- LICENSE               PDF.js 许可证

为什么只内置 GB 系 CMap：
本项目主要面向中文题目。遇到日文 / 韩文等特殊 CMap 时，导入会提示改用 Word 转 DOCX。

扫描版 PDF 需要 OCR，本工具不做 OCR。
