name: feature request
description: 提出新功能或改进建议
title: "[Feature] "
labels: ["enhancement"]
body:
  - type: markdown
    attributes:
      value: |
        请先搜索已有 Issue，避免重复。
        注意：本项目的核心定位是**离线、单文件、浏览器本地处理**；云同步 / 账号体系 / OCR 模型需要单独评估。
  - type: textarea
    id: problem
    attributes:
      label: 你想解决什么问题
      description: 描述使用场景，而不是直接说“加一个按钮”
    validations:
      required: true
  - type: textarea
    id: solution
    attributes:
      label: 你希望的解决方式
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: 你试过的替代方案
  - type: dropdown
    id: scope
    attributes:
      label: 影响范围
      options:
        - 导入 / 解析
        - 编辑器 / 答案校对
        - 生成页面
        - 界面 / 移动端
        - 构建 / 工程
        - 文档
    validations:
      required: true
  - type: checkboxes
    id: confirm
    attributes:
      label: 确认
      options:
        - label: 这个需求不需要默认联网或上传题目
          required: true
