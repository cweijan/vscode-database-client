# MySQL Client

[![Marketplace Version](https://vsmarketplacebadge.apphb.com/version-short/cweijan.vscode-mysql-client.svg)](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client) [![Installs](https://vsmarketplacebadge.apphb.com/installs-short/cweijan.vscode-mysql-client.svg)](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client) [![Rating](https://vsmarketplacebadge.apphb.com/rating-short/cweijan.vscode-mysql-client.svg)](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client) 

MySQL Client For Visual Studio Code

> You are welcome to contribute via the [repository](https://github.com/cweijan/vscode-mysql)
>
> This extension was inspired by the [MySQL](https://github.com/formulahendry/vscode-mysql) extension.

## Features

* [Connect To MySQL Server](#how-to-connect)
* Overview, Users, Databases, Tables, Procedures, Triggers, Functions
* [SQL Assistant ( Syntax, Formatter, Completion )](#execute-sql)
* [Run MySQL Query](#execute-sql)
* Tabular CRUD editor
* [Backup / import](#backupimport) data

## How to Connect

Open the MySQL tab, then press the `+` button.

![connection](images/connection.jpg)

## View Tables

Press any 'Table' node to open the query page.

![query](images/QueryTable.jpg)

## Execute SQL

* Under the MySQL tab, press the `New Query` button.
![newquery](images/newquery.jpg)
* This changes the active database.
* Now you may enjoy the Intelli SQL code within the editor.
* Press the 'Run' button or the `F9` key to execute.
![run](images/run.jpg)


## Backup/Import

Go to any Database or Table node, backup/import options are listed in the context menu (right click to open).
![backup](images/Backup.jpg)
