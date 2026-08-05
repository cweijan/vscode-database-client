## Current execution checkpoints

- `fd3df67`：已完成扩展入口、公共核心、SQL 树、Oracle 同义词、目标专属数据库文件/Parquet/远程文件/SSH 状态与终端页面，以及命令和 Provider 的第一轮源码恢复；现代构建与激活 smoke 已通过。
- 当前仍未把大领域任务提前标记完成：命令审计仍有 33 个需要继续确认的能力，结构差异、端口转发、SSH 监控和若干目标专属页面仍需独立闭环验证。
- 本检查点已完成：`ForwardView.vue` 已替代 `forward` 路由的通用工作台，接通服务器选择、转发配置增改删、启动/停止、状态展示、导入/导出和目标消息协议；Local 转发可用，Remote/Dynamic 已保留为显式待补适配器。
- 下一切片：恢复 `structDiff` 专属 Vue 页面，先闭合连接/数据库/Schema 选择、比较结果树、SQL 预览、打开查询和同步协议。
- 每个切片完成后必须更新源码 ledger、补充协议测试并运行现代类型检查、lint、测试、构建、激活 smoke、源码契约和打包验证。

## 1. Baseline and recovery ledger

- [x] 1.1 Generate a checked-in inventory of the 9.0.2 manifest surface, active resources, Webview assets, runtime dependencies, and product-code source markers.
- [x] 1.2 Convert the manifest and bundle inventory into testable contract fixtures for commands, views, settings, languages, custom editors, MCP tools, and message entry points.
- [x] 1.3 Classify every target product module as reusable legacy source, new source to recover, intentional replacement, or deferred item with an owner and validation plan.

## 2. Modern build foundation

- [x] 2.1 Add the modern TypeScript configuration, source aliases, Vue 3 compiler settings, and Node 20-supported lint/type-check configuration without deleting the legacy build yet.
- [x] 2.2 Add a Vite configuration for the extension backend and a separate Vite configuration or entry arrangement for the Vue Webview, including production asset paths and development mode behavior.
- [x] 2.3 Normalize package scripts and generate a dependency lockfile so clean installation, type checking, linting, production build, and packaging are reproducible.
- [x] 2.4 Implement the smallest modern extension entry and Webview shell that can build, load in an isolated VS Code profile, and prove the new toolchain works before domain migration.

## 3. Core extension source recovery

- [x] 3.1 Recover typed common infrastructure for configuration, persisted state, resource paths, events, errors, logging, and VS Code host adapters.
- [x] 3.2 Recover connection lifecycle, cancellation, result conversion, service registration, and dialect selection behind explicit TypeScript interfaces.
- [x] 3.3 Recover database metadata, tree nodes, groups, filtering, pagination, and context values for the core SQL database flows.
- [ ] 3.4 Recover command registration, command handlers, code completion, symbols, formatting, hover, history, and other Providers from the target contract.
- [x] 3.5 Implement and test Oracle synonym discovery, resolution, tree presentation, filtering, pagination, and DDL behavior as a complete vertical slice.
- [ ] 3.6 Recover the target NoSQL, remote-file, SSH, Docker, message-queue, and other adapter domains, keeping each domain behind a typed boundary.
- [x] 3.7 Update the source mapping ledger and targeted tests after each core domain so no target product module remains silently unclassified.

## 4. Webview source recovery

- [x] 4.1 Implement the Vue Webview shell, extension message bridge, initialization handshake, persisted state exchange, error handling, and lifecycle disposal.
- [x] 4.2 Recover shared Webview state, UI primitives, styles, localization, and asset loading without depending on generated chunk names.
- [ ] 4.3 Recover connection, SQL/query, result display/edit/export, and shared data-viewer flows.
- [ ] 4.4 Recover design, structure-diff, terminal, SSH, remote-file, database-file, and Parquet editor flows.
- [ ] 4.5 Recover database-specific Webview pages for Redis, Elasticsearch, MongoDB, MQ, RabbitMQ, and other target-contributed views.
- [ ] 4.6 Verify every migrated Webview entry against the target HTML/asset graph and focused message-protocol scenarios.

## 5. Parity validation and cleanup

- [ ] 5.1 Add focused unit/fixture tests for manifest contracts, dialect SQL, Oracle synonyms, message protocols, state compatibility, and resource resolution.
- [ ] 5.2 Run type checking, linting, production build, static reference validation, and target-versus-generated capability comparison for every completed slice.
- [ ] 5.3 Package the source-built extension and test activation and representative flows in an isolated VS Code profile, recording environment and results.
- [ ] 5.4 Remove or isolate the old Webpack/Vue 2 configuration and unused dependencies only after the modern source build owns all required capabilities.
- [ ] 5.5 Re-run the full inventory and archive the completed OpenSpec change with the final source/build evidence and known limitations.
