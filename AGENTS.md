- 思考过程使用中文
- 类型检查使用 pnpm lint:check（或 vp run lint:check）命令
- 需要用到搜索引擎，优先找tavily mcp工具来进行搜索（如果有的话）

# 项目通用规则

- 始终使用中文回复用户，但技术专有名词可保留英文（如 API、Python、DTO等）。
- 使用项目既有风格，不引入新风格，包括代码、文档或交互，默认延用项目中已有的格式、缩进、命名习惯。
- 尽可能少地输出内容，仅提供高信息密度回复，禁止无效寒暄、过度铺垫，只输出对当前任务有直接帮助的信息。
- 使用Get-Content命令时，请加上 -Encoding utf8 参数
- 正则表达式需要捕获组时，请使用命名捕获组
- 不需要复用的、当前只使用一次的代码，不要额外包装成函数
- 变量名使用英文，只有当变量名是八字词汇时，才使用中文

# 简单至上

用最少的代码解决问题。不要进行任何推测。
问问自己：“一位资深工程师会认为这过于复杂吗？” 如果答案是肯定的，那就简化它。

- 没有超出要求的功能。
- 不为一次性代码进行抽象。
- 没有提供任何未要求的“灵活性”或“可配置性”。
- 对于不可能出现的情况，不进行错误处理。
- 如果你写了 200 行，而 50 行就可以写完，那就重写。

# TS 规则

- 正则提到模块作用域
- fetch的超时写法使用signal: AbortSignal.timeout(timeout)
- 单个文件中的顶级函数定义优先使用function fn() {}

# Vue 规则

- 使用最现代化、最新、最简洁的写法

- 定义Props使用`withDefaults(defineProps<IProps>(), {})`或`defineProps<IProps>()`的形式

- <template> 和 <style> 中使用props对象可以直接写字段而不用在前面加props.

- 定义v-model时使用defineModel

- 定义元素ref时使用useTemplateRef

- vue <script> 代码顺序

    > **0. IProps和defineProps**
    > —— 这个应该放在最顶部
    >
    > **1. 静态常量 / 纯配置（与 Vue 无关）**
    > —— 如 `API_BASE`、`DEFAULT_SIZE`、`COLUMN_MAP` 等纯 JavaScript 常量，与响应式系统无关，应置于文件最顶部（编译器宏之前），便于阅读和抽离。
    >
    > **2. 编译器宏（必须置顶）**
    > —— `defineEmits`、`defineExpose`（如有），因编译时识别，需放在最外层且不能引用外部变量，必须置于所有逻辑之前。
    >
    > **3. 组合式函数（Composables）**
    > —— `useRouter`、`useStore`、自定义 hooks（如 `useFetch`），用于依赖注入或获取上下文，通常紧跟在宏之后。
    >
    > **4. 响应式状态（定义数据）**
    > —— `ref`、`reactive`、`shallowRef` 等，也包括模板引用（`const el = ref(null)`），它们共同构成组件的响应式数据源。
    >
    > **5. 计算属性（派生状态）**
    > —— `computed`，依赖响应式状态产生新值，应紧随状态定义，以便阅读者了解数据流转。
    >
    > **6. 普通函数（业务逻辑 / 事件处理 / 工具函数）**
    > —— 定义操作行为，放在计算属性之后、侦听器之前（因为侦听器会调用这些函数）。
    >
    > **7. 侦听器（副作用监听）**
    > —— `watch`、`watchEffect`，用于监听数据变化并执行副作用，通常放在函数定义之后，因为其回调常引用前面定义的方法。
    >
    > **8. 生命周期钩子（执行副作用）**
    > —— `onMounted`、`onUnmounted`、`onUpdated` 等，执行与组件生命周期相关的副作用（如请求数据、注册事件），一般放在最后，确保前面所有状态和方法都已就绪。
    >
    > **9. `defineExpose`（可选，若未置顶）**
    > —— 若未在编译器宏区域提前暴露，可放在文件末尾统一暴露组件内部方法或属性，便于父组件通过 ref 调用。

# 注释 规则

- 注释使用中文
- 注释尽可能简洁
- 函数方法也添加文档注释
- 写vue hook函数或者defineStore函数时，最后导出的return内部的每个字段加上文档注释

# GitHub Release 发布

## 前置检查

1. `git status` 必须干净且已推送到远端（release 的 tag 指向远端 commit，未推送的提交不会进包）
2. `pnpm lint:check` 通过
3. 取最后发布版本，`package.json` 的 version 必须严格大于它；否则询问用户要改成什么版本号：
   `gh api repos/yoyokity/JapaneseLearning-Capture/releases/latest --jq '.tag_name'`
4. 版本号使用 semver，不带 `v` 前缀（程序下载地址直接拼 tag）

## 发布说明

- 用 `git log <最后版本>..HEAD --no-merges` 获取改动
- 写入 `out/release-notes.md`，中文 markdown
- 只写用户可见的内容，按 `### ✨ 新功能` / `### 🔧 改进` / `### 🐛 修复` 分组，没有的组省略
- 不写构建、重构、依赖升级、开发工具相关
- 示例：

> ### ✨ 新功能
>
> - **应用内更新**：关于页支持检查、下载并安装新版本，重启后自动替换程序文件，用户数据目录保持不变。
>
> ### 🔧 改进
>
> - 主程序更新包不再包含工具包，日常更新下载量从 288MB 降到约 167MB。

## 执行

1. `pnpm package`（必须重新打包，脚本会校验产物是否早于构建结果）
2. `pnpm release`（创建 draft，自动写入并上传 `latest.json`）
3. `gh release view <version> --json assets` 确认 4 个资产齐全：
   `JapLC-x64.7z`、`JapLC-app-x64.7z`、`JapLC-tools-<hash>-x64.7z`、`latest.json`
4. `pnpm release --publish`（draft 完整时只转正式发布，不重新上传）
5. 验证：
    - `gh release view <version>` 显示 Latest
    - `curl -s https://github.com/yoyokity/JapaneseLearning-Capture/releases/latest/download/latest.json` 中的 version 与发布版本一致

## 环境

- gh 可能不在 Git Bash 的 PATH，在 cmd/PowerShell 中执行，或使用完整路径 `"C:\Program Files\GitHub CLI\gh.exe"`
- 需要代理时先设置 `HTTPS_PROXY`，gh 直连 github.com 会超时
