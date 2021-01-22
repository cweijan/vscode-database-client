# Database Client

[![Marketplace Version](https://vsmarketplacebadge.apphb.com/version-short/cweijan.vscode-mysql-client2.svg)](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client2) [![Installs](https://vsmarketplacebadge.apphb.com/installs-short/cweijan.vscode-mysql-client2.svg)](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client2) [![Rating](https://vsmarketplacebadge.apphb.com/rating-short/cweijan.vscode-mysql-client2.svg)](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client2)

Database Client For Visual Studio Code

> Supported databases: Mysql/MariaDB、SqlServer、Postgresql、Redis、ElasticSearch
>
> Project site: [vscode-database-client](https://github.com/cweijan/vscode-database-client)
>
> [中文文档](README_CN.md)

**Features**

- [Database Client](#database-client)
  - [Connect](#connect)
  - [Table](#table)
  - [Execute SQL](#execute-sql)
  - [Generate Mock Data](#generate-mock-data)
  - [History](#history)
  - [Backup/Import](#backupimport)
  - [Filter](#filter)

## Installation

Install from vscode marketplace [vscode-mysql](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client2).

## Connect

1. Open MySQL Panel, then click the `+` button.
2. Input your connect info then click connect.

![connection](images/connection.jpg)

## Table

1. Click table to open table view.
2. Then you can do data modification on view page.
   ![query](images/QueryTable.jpg)

## Execute SQL

* In the MySQL Panel, click the `New Query` button.
  ![newquery](images/newquery.jpg)
* Now you can edit and run SQL within the editor.
* ![run](images/run.jpg)

## Generate Mock Data

- Now you do not need spend time writing test data.
  ![mockData](images/mockData.png)

## History

- Click history button to open run history record.
  ![history](images/history.jpg)

## Backup/Import

* Move to ant DatabaseNode or TableNode, backup/import options are listed in the context menu (right click to open).
  ![bakcup](images/Backup.jpg)

## Filter

![filter](images/filter.gif)

# Credits

- [vscode-mysql](https://github.com/formulahendry/vscode-mysql): The original version of this extension.
- [mysqldump](https://github.com/bradzacher/mysqldum): Data dump lib.
- [sql-formatter](https://github.com/zeroturnaround/sql-formatter) Sql format lib.
- [umy-ui](https://github.com/u-leo/umy-ui): Result view render.
- Core Lib:
  - [node-mysql2](https://github.com/sidorares/node-mysql2) : Mysql client.
  - [node-postgres](https://github.com/brianc/node-postgres): PostgreSql client.
  - [tedious](https://github.com/tediousjs/tedious): SqlServer client.

## RoadMap

- Sync table struct from diffrent connection.
- Better Intetllisense sql.
