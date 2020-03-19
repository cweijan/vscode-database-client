# MySQL

[![Marketplace Version](https://vsmarketplacebadge.apphb.com/version-short/cweijan.vscode-mysql-manager.svg)](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-manager) [![Installs](https://vsmarketplacebadge.apphb.com/installs-short/cweijan.vscode-mysql-manager.svg)](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-manager) [![Rating](https://vsmarketplacebadge.apphb.com/rating-short/cweijan.vscode-mysql-manager.svg)](https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-manager) [![Build Status](https://travis-ci.org/formulahendry/vscode-mysql.svg?branch=master)](https://travis-ci.org/formulahendry/vscode-mysql)

MySQL management tool Plus


> This plugin forked from [MySQL](https://marketplace.visualstudio.com/items?itemName=formulahendry.vscode-mysql)
> 
> Many amazing improvements have been made
> 
> Welcome to contribute in [repository](https://github.com/cweijan/vscode-mysql)
>
> You can see changes in the [changelog](/CHANGELOG.md)

## Features

* Manage MySQL Connections 
* List MySQL User、Database、Table、Procedure、Trigger、Function、TableColumn
* Run MySQL Query
* Sql code assistant(Syntax,Format)

## Usage

* Add MySQL connection: click "MYSQL" in Explorer, then click the `+` button.

![connection](images/connection.jpg)

* To run MySQL query, open a SQL file first then:
  * Click run button
  * Or press `F9` 

![run](images/run.jpg)

* To create a new MySQL query or change active MySQL connection:
  * In MySQL Pannel, Click `New Query` button.
  * or right click on a MySQL database, then click `New Query`

![newquery](images/newquery.jpg)

<!-- ## Settings

* `vscode-mysql.maxTableCount`: The maximum table count shown in the tree view. (Default is **500**) -->

## Future Plain
- Record sql execute history.
- table inference