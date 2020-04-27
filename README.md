# MySQL Client

[![Marketplace Version](https://vsmarketplacebadge.apphb.com/version-short/cweijan.vscode-mysql-client.svg)](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client) [![Installs](https://vsmarketplacebadge.apphb.com/installs-short/cweijan.vscode-mysql-client.svg)](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client) [![Rating](https://vsmarketplacebadge.apphb.com/rating-short/cweijan.vscode-mysql-client.svg)](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client) 

MySQL Client For Visual Studio Code


> This plugin inspired for [MySQL](https://github.com/formulahendry/vscode-mysql)
> 
> Give [project](https://github.com/cweijan/vscode-mysql) star keep me motivated to keep updating

**Features**

- [MySQL Client](#mysql-client)
  - [Connection](#connection)
  - [View Table](#view-table)
  - [Execute Sql](#execute-sql)
  - [Generate Mock Date](#generate-mock-date)
  - [History](#history)
  - [Backup/Import](#backupimport)
  - [Setting](#setting)
  - [Suprise](#suprise)

## Connection

1. Click MySQL Panel, then click the `+` button.
2. Input you connect info then click connect.

![connection](images/connection.jpg)

## View Table

1. Click Table To Open Query page and Load data.
2. You can do data modification on query page.
![query](images/QueryTable.jpg)

## Execute Sql

* In MySQL Pannel, Click `New Query` button.
![newquery](images/newquery.jpg)
* This will change active database.
* Now You can enjoy Intelli SQL code in Editor.
* Click Run Button or Press `F9` to Execute.
![run](images/run.jpg)

## Generate Mock Date
- Now you not need spend time to writing test data
![mockData](images/mockData.png)

## History
- Click history button to open run history record.
![history](images/history.jpg)

## Backup/Import

* Move to DatabaseNode/TableNode, Right click to open menu
![bakcup](images/Backup.jpg)

## Setting

```json
{
  // enable delimiter when import data
  "vscode-mysql.enableDelimiter": false,
  
  // open query result as full screen.
  "vscode-mysql.fullQueryScreen":false,
}
```

## Suprise
* You can find suprise when right click on node.

![suprise](images/surprise.jpg)
