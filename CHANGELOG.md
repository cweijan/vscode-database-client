# CHANGELOG

# 2.9.2 2021/1/4

- Better result view border color.
- Remember page size.
- Fix sql formatter could not be detect comment correctly.
- Add i18n of chinese.

# 2.9.0 2020/12/31

- Better update operation interactive.
- Support auto show total.
- Show column require hint.

# 2.8.9 2020/12/29

- Support export as csv、json.
- Enhance result UX.

# 2.8.8 2020/12/28

- Resign result page.

## 2.8.7 2020/12/22

- Resign connect page @donnisnoni.
- Reduce resource consumption when node change.
- Support save query as query node.

## 2.8.5 2020/12/6

- Add more feature to view node.
- Support change column position.

## 2.8 - 2020/11/29

- Support change active database from status bar.
- Support export view, procedure, function.
- Fix multi query page database change.
- Change mysql client to mysql2, now support mysql8.

## 2.7.5 - 2020/11/19

- Migrate status to status bar.

## 2.7.0 -2020/11/9

- Resule view theme follow vscode theme.

## 2.6.0 - 2020/10/20

- Support config connection per workspace.
- Hide error messages.

## 2.5.7 - 2020/9/21

- Refacotr export panel.

## 2.5.5 - 2020/9/6

- Change update as edit in same view.

## 2.5.0 - 2020/8/17

- Improvement query result render performance.

## 2.4.8 - 2020/8/14

- Fix new panel bug.

## 2.4.7 - 2020/8/13

- Fix overview render bug.

## 2.4.6 - 2020/8/11

- Add more keyword.

## 2.4.5 - 2020/8/10

- Support big number type.

## 2.4.3 - 2020/8/7

- Add database overview.
- Add diagram design.

## 2.4.2 - 2020/8/5

- Fix limit generator error.
- Adjust result page height.

## 2.4.0 - 2020/8/3

- Enhance dump performance.
- Refactor data import.

## 2.3.12 - 2020/8/3

- Auto add limit for select statement.

## 2.3.11 - 2020/8/2

- Hight light active connection.
- Show more info when open edit panel.
- Add column type tooltip in result panel.
- Fix copy fail.

## 2.3.7 - 2020/7/20

- Support config default limit of query.

## 2.3.6 - 2020/7/15

- Support edit date in result view.

## 2.3.5 - 2020/7/14

- Not record repeat history.
- Support query in new panel.
- Add count query to content menu of table node.
- Add truncate database to content menu of database node.

## 2.3.0 - 2020/7/10

- Update result view.

## 2.3.0 - 2020/7/8

- Add dark theme.

## 2.2.8 - 2020/7/7

- Add count button in view.

## 2.2.4~2.2.7

- Fix bugs and adjust result view.

## 2.2.3 - 2020/6/24

- Add copy host feature.
- Support add name prefix to connection.

## 2.2.0 - 2020/6/13

- Reduce package size.
- Support export data as xlsx.

## 2.1.4 - 2020/5/20

- Fix connect database by ssh tunnel fail.

## 2.1.0 - 2020/5/14

- Update Query Result Page

## 2.0.1 (2020/5/6)

- Highlight active database.
- Enhance dashboard.
- Support open table in new panel.

## 1.9.6 (2020/5/1)

- Fix bugs.

## 1.9.0 - 2020/4/28

- Support SSH tunel.
- Show comment of column、table on tree view.
- Suport export table struct.

## 1.8.1 - 2020/4/23

- Connect can specify database.
- Add mock data feature.
- Update mysql connect client to newest version.
- Fix inteliij bugs.

## 1.8.0 - 2020/4/22

- Show template sql in same file.
- Get connection correctly when connection multi server.
- Improve UI Interactive.
- Rollback when batch execute sql occur error.
- Fix bugs.

## 1.7.32 - 2020/4/18

- Fix legacy bug: connect to same host fail.

## 1.7.31 - 2020/4/17

- Switch active database using open query.
- support insert or update in any query result page.
- intellij insert|update code.
- show comment when edit.
- fix bugs.

## 1.7.2 - 2020/4/15

- Support copy database、table、column name
- Support show error message when importing data occur error.
- Remeber sql history for database
- Ui improve

## 1.7.1 - 2020/4/11

- Support sort、filter in result page.
- Enhance sql intelliCode.

## 1.7.0 - 2020/4/10

- Support Insert,Update,Delete in reuslt page.
- Refactoring event message.

## 1.6.37- 2020/3/20

- Table name inference
- Sql formatter
- Record History
- Import sql file
- Hover table to get info

## 1.6.36 - 2020/3/19

- Fix many mysql connection error.

## 1.6.35 - 2020/3/18

- get sql divisiton with semicolon on editor
- fix mysql 8.0 get function|procedure info fail.

## 1.6.2 (2020/3/9)

- Beautify query result page.

## 1.6.0 (2020/3/8)

- Fix refresh not update treeview
- Support operate user、trigger、view、procedure、function

## 1.5.4 (2020/3/7)

- Fix change database fail
- Query result page beautify
- Sql assistant enhance

## 1.5.3 - 2020/2/22

- Focus query result panel when query

## 0.3.0 (2018-03-12)

* Show query result as HTML table

## 0.2.3 (2018-02-23)

* Add support for executing selected query

## 0.2.2 (2017-12-31)

* [#10](https://github.com/formulahendry/vscode-mysql/issues/10): Add key bindings for 'Run MySQL Query'

## 0.2.1 (2017-12-05)

* Keep original properties when creating connection
* Close the connection after query

## 0.2.0 (2017-12-04)

* Support SSL connection

## 0.1.1 (2017-12-03)

* List columns

## 0.1.0 (2017-11-30)

* Support multiple statement queries

## 0.0.3 (2017-11-26)

* Activate extension when running MySQL query

## 0.0.2 (2017-11-24)

* Better output format: display output as table
* [#2](https://github.com/formulahendry/vscode-mysql/issues/2): Add option to set maximum table count, and increase the dafault count

## 0.0.1 (2017-11-22)

* Initial Release
