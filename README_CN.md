# Database Client for Visual Studio Code

<p align="center">
<a href="https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client2">
    <img src="https://img.shields.io/vscode-marketplace/v/cweijan.vscode-mysql-client2.svg?label=vscode%20marketplace">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client2">
    <img src="https://vsmarketplacebadge.apphb.com/installs-short/cweijan.vscode-mysql-client2.svg">
  </a>
  <a href="https://github.com/cweijan/vscode-database-client">
    <img src="https://img.shields.io/github/stars/cweijan/vscode-database-client?logo=github&style=flat">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client2">
    <img src="https://img.shields.io/vscode-marketplace/r/cweijan.vscode-mysql-client2.svg">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client2">
  <img alt="GitHub" src="https://img.shields.io/github/license/cweijan/vscode-database-client">
  </a>
</p>
<br>

该项目为Visual Studio Code的数据库客户端扩展, 意在让你的生活更加简单, 支持**MySQL/MariaDB, Microsoft SQL Server, PostgreSQL, SQLite, MongoDB, Redis**以及**ElasticSearch**的管理.

如果这个扩展对你有帮助, 可以请作者喝杯咖啡:

<a href="https://www.buymeacoffee.com/cweijan" target="_blank"><img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy Me A Coffee" style="height: auto !important;width: auto !important;" ></a>

<a href="https://paypal.me/cweijan">
  <img alt="Donate" src="https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif">
</a>

- 功能
  - [连接](#连接)
  - [数据表](#数据表)
  - [执行SQL](#执行SQL)
  - [生成测试数据](#生成测试数据)
  - [历史记录](#历史记录)
  - [备份/导出](#备份/导出)
  - [设置](#设置)
  - [表过滤](#表过滤)

## 安装

在 Visual Studio Code 扩展中心安装 [Database Client](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client2).

## 连接

1. 打开左侧数据库面板, 点击添加按钮
2. 在连接页面配置相应的数据库信息

![connection](images/connection.jpg)

## 数据表

1. 点击数据库表打开数据视图
2. 之后便可在页面进行CRUD、数据导出(**Excel、JSON**)等操作.![query](images/QueryTable.jpg)

## 执行SQL

* 点击数据库节点的`New Query` 按钮.![newquery](images/newquery.jpg)
* 之后可在编辑器中编辑和执行SQL(快捷键 : F9).
* ![run](images/run.jpg)

## 生成测试数据

- 该扩展提供一键生成虚拟数据的功能, 再也不用为没有测试数据而烦恼.![mockData](images/mockData.jpg)

## 历史记录

- 点击历史记录按钮后可查看以往执行的Sql记录.![history](images/history.jpg)

## 备份/导入

* 在表或者数据库节点右击, 之后便可以进行数据的导入导出.![bakcup](images/Backup.jpg)

## 设置

该扩展包含一些设置, 可通过以下方式打开设置界面.

![](images/1611910592756.png)

## 表过滤

用于快速筛选数据表.

![filter](images/filter.gif)

# 致谢

- [vscode-mysql](https://github.com/formulahendry/vscode-mysql): 本插件的灵感来源
- [mysqldump](https://github.com/bradzacher/mysqldum): 数据备份库.
- [sql-formatter](https://github.com/zeroturnaround/sql-formatter) Sql格式化库.
- [umy-ui](https://github.com/u-leo/umy-ui): 表数据渲染库.
- 核心连接库:

  - [node-mysql2](https://github.com/sidorares/node-mysql2) : Mysql client.
  - [node-postgres](https://github.com/brianc/node-postgres): PostgreSql client.
  - [tedious](https://github.com/tediousjs/tedious): SqlServer client.
