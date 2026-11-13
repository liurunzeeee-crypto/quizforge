name: bug report
description: 报告解析、导入或生成问题
title: "[Bug] "
labels: ["bug"]
body:
  - type: markdown
    attributes:
      value: |
        感谢反馈！请先确认使用的是最新 Release / `dist/题目检测生成器.html`。
        请勿上传教材、真题、培训机构题库或含个人信息的文件。
  - type: input
    id: version
    attributes:
      label: 版本 / 文件
      description: 例如 v1.10.0，或截图里的版本号
    validations:
      required: true
  - type: input
    id: env
    attributes:
      label: 系统与浏览器
      description: 例如 Windows 10 22H2 + Chrome 131
    validations:
      required: true
  - type: dropdown
    id: source
    attributes:
      label: 输入来源
      options:
        - DOCX
        - 文字版 PDF
        - HTML
        - TXT / 粘贴文本
        - 其它
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: 复现步骤
      description: 尽量写成 1 / 2 / 3 的步骤
      placeholder: |
        1. 打开页面
        2. 导入某文件
        3. 点击解析
        4. 看到...
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: 期望结果
    validations:
      required: true
  - type: textarea
    id: actual
    attributes:
      label: 实际结果
      description: 有截图更好；请先删掉敏感信息
    validations:
      required: true
  - type: textarea
    id: sample
    attributes:
      label: 最小复现文本（可选）
      description: 请使用自己改写的题目，不要上传版权题库
      render: text
  - type: checkboxes
    id: confirm
    attributes:
      label: 确认
      options:
        - label: 我已删除题目中的个人信息 / 版权内容
          required: true
