# MySQL Client

[![Marketplace Version](https://vsmarketplacebadge.apphb.com/version-short/cweijan.vscode-mysql-client2.svg)](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client2) [![Installs](https://vsmarketplacebadge.apphb.com/installs-short/cweijan.vscode-mysql-client2.svg)](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client2) [![Rating](https://vsmarketplacebadge.apphb.com/rating-short/cweijan.vscode-mysql-client2.svg)](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client2) 

MySQL Client For Visual Studio Code

> Project site: [vscode-mysql](https://github.com/cweijan/vscode-mysql)

**Features**

- [MySQL Client](#mysql-client)
  - [Connect](#connect)
  - [View Tables](#view-tables)
  - [Execute Sql](#execute-sql)
  - [Generate Mock Data](#generate-mock-data)
  - [History](#history)
  - [Backup/Import](#backupimport)
  - [Setting](#setting)
  - [Filter](#filter)

## Installation

Install from vscode marketplace [vscode-mysql](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client2).

## Coffee

If you like this this extension, consider [buying me a coffee](https://www.buymeacoffee.com/cweijan). Thank you!

## Connect

1. Open MySQL Panel, then click the `+` button.
2. Input your connect info then click connect.

![connection](images/connection.jpg)

## View Tables

1. Click Table To Open Query page and Load data.
2. You can do data modification on query page.
![query](images/QueryTable.jpg)

## Execute Sql

* In the MySQL Panel, click the `New Query` button.
![newquery](images/newquery.jpg)
* This changes the active database.
* Now you can enjoy Intellisense for SQL code within the editor.
* Click Run Button or Press `F9` to Execute.
![run](images/run.jpg)

## Generate Mock Data
- Now you do not need spend time writing test data.
![mockData](images/mockData.png)

## History
- Click history button to open run history record.
![history](images/history.jpg)

## Backup/Import

* Move to ant DatabaseNode or TableNode, backup/import options are listed in the context menu (right click to open).
![bakcup](images/Backup.jpg)

## Setting

OpenSetting -> extensions -> Mysql

![Setting](images/setting.png)

## Other
* Find a suprise when you right click on a node.

![suprise](images/surprise.jpg)

## Filter 
![filter](images/filter.gif)

# Credits
- [vscode-mysql](https://github.com/formulahendry/vscode-mysql): The original version of this extension.
- [mysqldump](https://github.com/bradzacher/mysqldum): Use it to export data.

## RoadMap
- Sync table struct from diffrent connection.
- Fix Intetllisense sql.
- Better sql formatter.
- Add i18n.
- Change database from status bar.

