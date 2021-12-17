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

That will open a SQL editor bind of database, it provider:

1. IntelliSense SQL edit.
2. snippets:`sel、del、ins、upd、joi`...
3. Run selected or current cursor SQL (Shortcut : Ctrl+Enter).
4. Run all SQL (Shortcut : Ctrl+Shift+Enter).

![run](images/run.jpg)

This extension supports codelen, but does not support stored procedures and functions. If you use them frequently, it is recommended to disable codelen
![image](https://user-images.githubusercontent.com/27798227/144196926-e581872e-5392-4744-a646-a644749c548c.png)

## Cache

In order to improve performance, the database information is cached. If your database structure changes externally, you need to click the refresh button to refresh the cache。

![](images/1638342622208.png)

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

This extension contain some setting, can be modified as follows.

![image](https://user-images.githubusercontent.com/27798227/146523121-9de9c708-8a8e-4e3b-ae1d-9da36f3217e1.png)
![](images/1611910592756.png)

## Filter

Used to quickly filter the table, if there is an input box to simplify the search operation, but unfortunately VSCode does not support this function.

![filter](images/filter.gif)

## Credits

- [sql-formatter](https://github.com/zeroturnaround/sql-formatter) Sql format lib.
- [umy-ui](https://github.com/u-leo/umy-ui): Result view render.
- [ssh2](https://github.com/mscdex/ssh2): SSH client.
- Client Lib:
  - [node-mysql2](https://github.com/sidorares/node-mysql2) : MySQL client.
  - [node-postgres](https://github.com/brianc/node-postgres): PostgreSQL client.
  - [tedious](https://github.com/tediousjs/tedious): SqlServer client.
  - [ioredis](https://github.com/luin/ioredis): Redis client.
  - [vscode-sqlite](https://github.com/AlexCovizzi/vscode-sqlite): SQLite client code reference.
