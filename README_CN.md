# Database Client

该项目是一个用于 Visual Studio Code 的数据库客户端扩展，支持 **MySQL/MariaDB、PostgreSQL、SQLite、Redis、ClickHouse、达梦** 和 **ElasticSearch** 等数据库的管理，并可用作 SSH 客户端，极大地提升您的生产力！

> 相关链接：[最新文档](https://doc.database-client.com/#/zh/)，[Database Client电报群](https://t.me/dbclient)

[![Logo](./public/logo_dark.png)](https://database-client.com)

## 安装

从 [Visual Studio Code 扩展商店](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client2) 或 [Open VSX](https://open-vsx.org/extension/cweijan/vscode-mysql-client2) 安装

## 遥测报告

Database Client扩展会收集匿名使用数据并将其发送到Database Client服务器以帮助改进我们的产品和服务。阅读我们的[隐私声明](https://database-client.com/#/privacyPolicy)以了解更多信息。

遥测报告遵循 VS Code 的遥测设置。此外，您可以通过设置 `"database-client.telemetry.usesOnlineServices": false` 单独禁用它。

## 连接

1. 打开左侧数据库面板, 点击添加按钮
2. 在连接页面配置相应的数据库信息

![connection](https://doc.database-client.com/images/connection.jpg)

## 数据表

1. 点击数据库表打开数据页, 点击表旁边的按钮则是打开新的数据页.
2. 之后就可在页面进行CRUD、数据导出(**Excel、JSON**)等操作.

![query](https://doc.database-client.com/images/view.png)

## 执行SQL

点击数据库节点的 `Open Query` 按钮.
![newquery](https://doc.database-client.com/images/newquery.jpg)

将会打开新的SQL编辑器, 可编辑和执行SQL, 提供了以下功能

1. SQL自动补全.
2. snippets:`sel、del、ins、upd、joi.`
3. 执行已选择或当前光标SQL (快捷键: Ctrl+Enter).
4. 执行全部SQL (快捷键: Ctrl+Shift+Enter, 命令ID: `mysql.runSQL`).

![run](https://doc.database-client.com/images/run.jpg)

可通过点击"Tables"右侧的搜索按钮对数据库进行全文搜索.

![1708594027208](image/README/1708594027208.png)

## 缓存

为了提高性能，缓存了数据库信息，如果你的数据库结构在外部发生了变更，需要点击以下按钮刷新缓存。

![](https://doc.database-client.com/image/connection/1638342622208.png)

## 备份/导入

在表或者数据库节点右击, 之后便可以进行数据的导入导出; 扩展实现了备份功能, 但不够稳定, 可将mysql_dump或pg_dump加到环境变量, 扩展就会使用这些工具进行备份.

![bakcup](https://doc.database-client.com/images/Backup.jpg)

## 设置

扩展提供了一些设置, 你可以参考以下操作前往控制台设置.

![1708593458624](image/README_CN/1708593458624.png)

## 表过滤

用于快速筛选表, 如果有输入框可简化搜索操作, 但不幸的是VSCode并不支持该功能.

## 生成测试数据

- 该扩展提供一键生成虚拟数据的功能, 再也不用为没有测试数据而烦恼.![mockData](https://doc.database-client.com/image/minor/mockData.jpg)

## 历史记录

- 点击历史记录按钮后可查看以往执行的Sql记录.![history](images/history.jpg)

## 致谢

- [sql-formatter](https://github.com/zeroturnaround/sql-formatter) Sql格式化库.
- [umy-ui](https://github.com/u-leo/umy-ui): 表数据渲染库.
- [ssh2](https://github.com/mscdex/ssh2): SSH连接库.
- 核心连接库:

  - [node-mysql2](https://github.com/sidorares/node-mysql2) : MySQL连接库.
  - [node-postgres](https://github.com/brianc/node-postgres): PostgreSQL连接库.
  - [tedious](https://github.com/tediousjs/tedious): SqlServer连接库.
  - [ioredis](https://github.com/luin/ioredis): Redis连接库.
  - [vscode-sqlite](https://github.com/AlexCovizzi/vscode-sqlite): SQLite连接代码参考.
