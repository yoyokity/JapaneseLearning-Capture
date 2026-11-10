# Japanese Learning Capture

一个基于 Electron 的日语学习资料刮削与管理工具。

## 📘用法

- 批量刮削视频资料信息
- 管理本地已刮削数据

## ⚠️注意事项

- 首次运行前请确认本地刮削目录配置正确
- 某些翻译能力依赖外部 API 或本地模型

## 🛠️构建步骤

### 运行环境

建议环境：

- Node.js 24+
- pnpm 11+

### 命令行入口

项目已引入 Vite+（`vp`）作为统一入口，以下命令与 pnpm 等价：

```bash
vp install      # pnpm install
vp run dev      # pnpm dev
vp run build    # pnpm build
vp run start    # pnpm start
vp run package  # pnpm package
```

构建由 electron-vite 完成，请勿使用 `vp dev` / `vp build` / `vp check`。

Git 提交前会通过 `vp staged` 自动执行 lint 修复与格式化，需要跳过时使用 `VP_GIT_HOOKS=0 git commit`。

### 安装依赖

```bash
pnpm install
```

### 开发启动

```bash
pnpm dev
```

### 构建打包

#### 1. 构建应用资源

```bash
pnpm build
```

#### 2. 本地预览构建结果

```bash
pnpm start
```

#### 3. 打包应用

```bash
pnpm package
```

打包完成后会生成 Electron Forge 对应产物。

## 📢声明

- 本项目不提供任何视频下载，只管理本地资源
- 本项目和项目成果仅供技术，学术交流和electron性能测试使用
- 永久开源免费
