## Why

当前项目的源码和构建链停留在旧版本，而 9.0.2 的实际活动版本只有编译后的 bundle 和 Webview 产物可用。编译产物可以运行，却无法作为可维护、可测试、可重复构建的源码交付；同时，直接解包 bundle 会丢失类型、模块边界和原始依赖关系。因此需要以 9.0.2 活动版本为行为基线，重新恢复一套现代化源码。

## What Changes

- 建立基于 Vite、Vue 3、TypeScript 6 和现代静态检查工具的可重复构建链，并保留向 TypeScript 7 迁移的边界。
- 按领域恢复扩展入口、公共基础设施、连接与方言、数据库树模型、命令/Provider 以及 Webview 源码。
- 保留 9.0.2 的命令、视图、配置、语言、编辑器入口、数据库能力和当前 Oracle 同义词修改。
- 用编译 bundle 作为行为证据和回归基线，不把压缩后的 `out` 文件伪装为最终源码。
- **BREAKING（开发流程）**：完成迁移后移除旧 Webpack/Vue 2 构建路径，统一使用现代源码构建和打包。
- 在每个领域切片完成后加入类型检查、静态检查、构建和针对性行为验证。

内部模块边界不需要逐字复制旧框架；如果新的接口、适配器或领域拆分更有利于完整恢复和测试，可以采用新的实现。页面视觉和交互不属于本次现代化目标，除非兼容目标本身要求保留它们。

## Capabilities

### New Capabilities

- `modern-extension-build`: 现代化的 TypeScript/Vue/Vite 扩展源码构建、类型检查和打包能力。
- `extension-runtime-parity`: 与 9.0.2 活动版本保持一致的扩展入口、命令、视图、配置和运行时资源契约。
- `database-client-core-source`: 可维护的连接管理、数据库方言、元数据、树模型、命令和 Provider 源码。
- `database-client-webview-source`: 可维护的 Vue Webview、查询结果、设计器、终端、编辑器和共享 UI 源码。
- `extension-source-validation`: 以 bundle 清单、静态检查、构建产物和垂直功能验证证明源码恢复没有漏项。

### Modified Capabilities

<!-- 当前 openspec/specs/ 没有既有能力规格，因此没有需要修改的既有 requirement。 -->

## Impact

- 影响 `package.json`、TypeScript 配置、Vite 配置、静态检查配置、源码目录、Webview 源码和打包忽略规则。
- 旧 `webpack.config.js`、Vue 2 loader 及其仅服务于旧构建链的依赖将在新源码验证通过后移除或隔离。
- 运行时命令 ID、视图 ID、配置键、语言/Grammar 标识和扩展入口必须保持兼容；不计划改变用户数据目录或数据库连接协议。
- 需要生成并提交可复现的依赖锁定文件，并在 Node 20 环境中验证开发、构建和打包流程。
