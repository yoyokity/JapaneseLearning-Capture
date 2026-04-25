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

- Node.js 20+
- pnpm 10+

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

### 发布构建

如果需要生成平台安装包，可使用 Electron Forge：

```bash
pnpm make
```

默认已配置的 maker：

- Windows：`@electron-forge/maker-squirrel`
- macOS：`@electron-forge/maker-zip`
- Linux：`@electron-forge/maker-deb`
- Linux：`@electron-forge/maker-rpm`

> 项目当前 `package.json` 中存在一个脚本名为 `make `（末尾带空格），直接使用不稳定，建议直接执行 `npx electron-forge make`

## 📢声明

- 本项目不提供任何视频下载，只管理本地资源
- 本项目和项目成果仅供技术，学术交流和electron性能测试使用
- 永久开源免费
