# 第一次上传到 GitHub

这份文档写给第一次使用 GitHub 的人。按顺序做即可，不需要先学 Git 的全部知识。

---

## 上传前检查

在项目根目录（能看到 `README.md`、`src/`、`dist/` 的这一层）确认：

- [ ] `npm run build` 成功，`dist/题目检测生成器.html` 是最新版本
- [ ] `npm test` 通过
- [ ] `.gitignore` 存在
- [ ] `private/`、`dev/`、`tests/.tmp/` 不会被上传
- [ ] `private/` 里如果有个人设备信息、旧版本、原始需求截图，确认不要上传
- [ ] 仓库里没有教材、真题、培训机构题库等版权内容

`private/` 目录已经写进 `.gitignore`，`git add .` 时会自动跳过。  
`dev/` 是本地测试残留目录，也会被跳过。

> **不要用 GitHub 网页的「Upload files」直接拖整个文件夹**：网页上传不读取 `.gitignore`，`private/`、`dev/`、`tests/.tmp/` 可能被一起传上去。请用 GitHub Desktop 或命令行。

---

## 方案 A：GitHub Desktop（推荐第一次使用）

1. 注册 GitHub 账号：<https://github.com/>
2. 下载 GitHub Desktop：<https://desktop.github.com/>
3. 登录 GitHub Desktop。
4. 菜单 `File` → `Add local repository…`
5. 选择本项目文件夹。如果提示“不是 Git 仓库”，选择 **create a repository**。
6. 仓库名建议：`quizforge`
7. 本地路径保持当前文件夹。
8. 如果界面询问是否初始化 README，**不要勾选**（本地已经有 README）。
9. 在左侧会看到所有变更，确认 `private/`、`dev/` 不在列表中。
10. 左下角填写 commit message，例如：
    `Initial commit: QuizForge v1.10.0`
11. 点 **Commit to main**。
12. 点右上角 **Publish repository**。
13. 取消勾选 **Keep this code private**，选择 Public。
14. 点 **Publish repository**。

完成后，仓库地址形如：

`https://github.com/你的用户名/quizforge`

### 发第一个 Release（给普通用户下载）

1. 打开仓库网页。
2. 右侧 **Releases** → **Draft a new release**。
3. Tag version 填 `v1.10.0`。
4. Release title 填 `v1.10.0 - 首次开源版本`。
5. 说明里写主要功能（可以参考 `CHANGELOG.md`）。
6. 附件上传 `dist/题目检测生成器.html`。
7. 点 **Publish release**。

这样别人不需要装 Node，也能直接下载单文件使用。

---

## 方案 B：命令行上传

### 1. 安装 Git

Windows 下载：<https://git-scm.com/download/win>  
安装后打开 PowerShell，执行：

```powershell
git --version
```

### 2. 配置用户名和邮箱

```powershell
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

邮箱最好和 GitHub 账号一致。

### 3. 在 GitHub 创建空仓库

1. 右上角 `+` → **New repository**
2. Repository name：`quizforge`
3. 选择 **Public**
4. **不要**勾选 `Add a README file`
5. 点 **Create repository**

### 4. 在本地初始化并上传

在项目根目录打开 PowerShell：

```powershell
git init
git add .
git status
```

**先看 `git status` 的输出**，确认没有 `private/`、`dev/`、`tests/.tmp/`、`node_modules/`。

确认无误后：

```powershell
git commit -m "Initial commit: QuizForge v1.10.0"
git branch -M main
git remote add origin https://github.com/你的用户名/quizforge.git
git push -u origin main
```

第一次 `push` 会弹出浏览器登录 GitHub，按提示授权即可。

---

## 方案 C：只能用网页上传（不推荐）

如果这台电脑不能安装 Git / GitHub Desktop，可以用网页上传，但**必须手动挑选文件**：

1. 在 GitHub 新建空仓库；
2. 点 **Add file** → **Upload files**；
3. 只拖入这些内容：
   - 根目录文件：`README.md`、`LICENSE`、`NOTICE`、`.gitignore`、`.gitattributes`、`package.json`、`CHANGELOG.md`、`CONTRIBUTING.md`
   - 目录：`src/`、`scripts/`、`tests/`（不要 `tests/.tmp/`）、`vendor/`、`dist/`、`docs/`、`examples/`、`.github/`
4. **不要拖整个项目文件夹**，否则 `private/`、`dev/` 会一起上传；
5. 填写 commit message，提交。

网页上传不会读取 `.gitignore`，所以一定要手动确认 `private/` 和 `dev/` 不在上传列表里。

---

## 打标签 / 发 Release（命令行方式）

```powershell
git tag v1.10.0
git push origin v1.10.0
```

然后到 GitHub 仓库的 **Releases** 页面，基于 `v1.10.0` 创建 Release，上传：

`dist/题目检测生成器.html`

---

## 可选：开启 GitHub Pages 在线 Demo

仓库里已经带了 `.github/workflows/pages.yml`，但它是**手动触发**的，避免第一次上传时因为没开 Pages 出现红叉。

1. 打开仓库 **Settings** → **Pages**
2. 在 **Build and deployment** 里把 Source 选为 **GitHub Actions**
3. 打开仓库 **Actions** → **deploy pages** → **Run workflow** → 选择 `main` → 运行
4. 完成后地址形如：`https://你的用户名.github.io/quizforge/`

Pages 上运行的是 Builder 本身；题目数据仍然只保存在访问者浏览器里，不会上传。

---

## 常见问题

### `remote origin already exists`

说明之前配置过远端，执行：

```powershell
git remote set-url origin https://github.com/你的用户名/quizforge.git
```

### `src refspec main does not match any`

说明还没有 commit。先执行：

```powershell
git add .
git commit -m "Initial commit"
```

再 push。

### 提示 Authentication failed

GitHub 不支持直接用账号密码 push。推荐：

- 使用 GitHub Desktop 登录；或
- 使用 Git Credential Manager；或
- 创建 Personal Access Token（GitHub → Settings → Developer settings → Personal access tokens）。

### 上传后发现 `private/` 或 `dev/` 也在仓库里

说明 `.gitignore` 没生效，或者这些文件之前已经被 `git add`。执行：

```powershell
git rm -r --cached private dev
git commit -m "Remove private files from repository"
git push
```

注意：`git rm --cached` 只是从 Git 索引中移除，本地文件还在。

### 文件太大

本项目单文件约 2.1MB，远低于 GitHub 单文件 100MB 限制。  
以后如果加入 OCR 模型，建议不要直接放进 Git，改用 Release 附件或独立下载。

### 中文文件名会出问题吗

GitHub 支持中文文件名。浏览器下载链接会自动编码，不影响使用。

---

## 上传后的建议

- 在仓库右侧 About 里填写 Description：
  `把 Word / 文字版 PDF 题库变成离线单文件自测网页`
- 添加 Topics：`quiz`、`offline`、`education`、`docx`、`pdf`、`single-file`、`chinese`
- 发 Release，附上 `dist/题目检测生成器.html`
- 在 README 顶部放一张截图
- 先收集真实用户反馈，再决定要不要做 OCR / 云同步
