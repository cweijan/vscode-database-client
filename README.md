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

The Database Client make your life easy. It supports databases MySQL/MariaDB, Microsoft SQL Server, PostgreSQL, SQLite, MongoDB, Redis, and ElasticSearch.

> Project site: [vscode-database-client](https://github.com/cweijan/vscode-database-client), [中文文档](README_CN.md)

If this extension is helpful to you, please consider buy author a cup of coffee:

<a href="https://www.buymeacoffee.com/cweijan" target="_blank"><img src="https://www.buymeacoffee.com/assets/img/custom_images/orange_img.png" alt="Buy Me A Coffee" style="height: auto !important;width: auto !important;" ></a>

<a href="https://paypal.me/cweijan">
  <img alt="Donate" src="https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif">
</a>

## Features

- [Database Client](#database-client)
  - [Connect](#connect)
  - [Table](#table)
  - [Execute SQL Query](#execute-sql-query)
  - [Generate Mock Data](#generate-mock-data)
  - [History](#history)
  - [Backup/Import](#backupimport)
  - [Setting](#setting)
  - [Filter](#filter)

## Installation

Install from vscode marketplace [vscode-database-client](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client2).

## Connect

1. Open Database Explorer panel, then click the `+` button.
2. Select your database type, input connection config then click the connect button.

![connection](images/connection.jpg)

## Table

1. Click table to open table view.
2. Then you can do data modification on the view page.

![query](images/QueryTable.jpg)

## Execute SQL Query

In the Database Explorer panel, click the `Open Query` button.

![newquery](images/newquery.jpg)

That will open a sql editor bind of database, it provider:

1. IntelliSense sql edit.
2. snippets:`sel、del、ins、upd、joi`...
3. Run selected or current cursor sql (Shortcut : Ctrl+Enter).
4. Run all sql (Shortcut : Ctrl+Shift+Enter).

![run](images/run.jpg)

## Generate Mock Data

You can easily generate test data.

![mockData](images/mockData.jpg)

## History

Click the history button to open the list of recently executed query history records.

![history](images/history.jpg)

## Backup/Import

Move to ant DatabaseNode or TableNode. The export/import options are listed in the context menu (right click to open).

![bakcup](images/Backup.jpg)

## Setting

This extension contain some setting, find him in the following way.

![](images/1611910592756.png)

## Filter

![filter](images/filter.gif)

## Credits

- [vscode-mysql](https://github.com/formulahendry/vscode-mysql): The original version of this extension.
- [mysqldump](https://github.com/bradzacher/mysqldum): Data dump lib.
- [sql-formatter](https://github.com/zeroturnaround/sql-formatter) Sql format lib.
- [umy-ui](https://github.com/u-leo/umy-ui): Result view render.
- Core Lib:
  - [node-mysql2](https://github.com/sidorares/node-mysql2) : Mysql client.
  - [node-postgres](https://github.com/brianc/node-postgres): PostgreSql client.
  - [tedious](https://github.com/tediousjs/tedious): SqlServer client.
  - [ioredis](https://github.com/luin/ioredis): Redis client.
  - [vscode-sqlite](https://github.com/AlexCovizzi/vscode-sqlite): SQLite client code reference.
