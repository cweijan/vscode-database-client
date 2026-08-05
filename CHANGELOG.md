# Database Client

# 9.0.2 2026-7-4
New:
  - Added network tools panel and task manager support
  - Support previewing SQLite and Parquet files in virtual spaces, with light and dark theme switching
Update:
  - Use a dropdown selector for font selection
  - Auto-refresh metadata cache after importing SQL
  - Added more icons for remote management and updated icon sets
  - Prevent auto-expanding connections when the parent group is collapsed
  - Improved theme contrast for select controls in settings, result style config, and design info panels
Fix:
  - Fixed failures when creating files over SFTP
  - Fixed SSH terminal layout issues after switching tabs

# 9.0.1 2026-6-19
New:
  - Added stock market support preview
  - Support preview for SQLite files
  - Support preview, edit, import and export for Parquet files
Update:
  - Improved VSCode theme adaptation
  - Supports Edit in VSCode for remote files
  - Data import supports overwrite update mode
  - Beautify the port forwarding management view
  - Integrated Microsoft Application Insights telemetry


# 9.0.0 2026-6-12
- Added image processing tools
- Improved SSH terminal user interaction
- Support schema synchronization for MySQL and PostgreSQL
- Improved quick connection support for SQLite and DuckDB
- Completely refactored the UI for a more modern and beautiful appearance

# 8.5.0 2026-6-8
- Added SSH monitoring feature
- Redis supports database filtering
- Compatible with SQLite version 3.53
- Refactored Redis UI for better user interaction
- Added new RabbitMQ UI with many convenient operations

# 8.4.7 2026-5-19
- Fixed abnormality when exporting result set data
- Added support for Redis connection via Unix Socket

# 8.4.6 2026-5-13

- Improved parsing of WITH statements
- Added support for searching Elasticsearch indexes
Fixed:
- Fixed slow result loading in Cursor
- Fixed 达梦 long CLOB data loading failures
- Fixed inability to display results vertically in Cursor
- Fixed file opening failure when file service had path conflicts

# 8.4.5 2026-2-4
- Support modifying the active database and schema directly in the result view

# 8.4.4 2025-11-26
- Fix port forwarding unable to start
- Fix importing data with object columns failure
- Add multi-language support for German, Spanish, French, Japanese, Korean, Brazilian Portuguese, Russian, and Traditional Chinese. Translation files are maintained in the [database-client-i18n](https://github.com/database-client/database-client-i18n) repository. If you encounter any errors or inaccuracies, please don't hesitate to report them to me.


# 8.4.3 2025-11-24

New:
  - Support opening FTP as workspace
  - Support vhost and user management for RabbitMQ
  - Support recovery on restart for query results, SSH terminals and Docker container logs
Update:
  - Enable auto sync by default
  - Adapt border color for contrast theme
  - Automatically close idle timeout connections
  - Always attempt to restore database connections after VS Code restart
Fix:
  - Fix SSH terminal panel buttons not aligned
  - Fix database objects not using natural sorting
  - Fix port forwarding unable to create new entries on first load
  - Fix container status not refreshing after interaction in Docker Compose Container
  - Fix SQL variables not supporting array types and optimize variable panel interaction logic

# 8.4.2 2025-9-26
- Enhanced view compatibility.

# 8.4.1 2025-9-22
- Fix DuckDB unable to correctly display backtick when unicode characters are present

# 8.4.0 2025-8-29
- Better SSH terminal interface
- Fixed Redis key exceptions in special cases
- Fixed SSH port forwarding data loading failure

# 8.3.8 2025-8-13
- Restored AI tools
- Fixed unable to split result in Trae Editor
- Fixed unable to display DDL for tables with long content
- Fixed incorrect quotes added when exporting tables with schema to SQL

# 8.3.7 2025-8-6
- Remove AI tools
- Fixed repeated triggering of ctrl+c in terminal on Mac OS
- Added blue status indicator for Filter when using New Query

# 8.3.6 2025-6-16
- Support skipping listBucket for S3 connections
- Fixed:
  - Fixed Oracle DDL not displaying
  - Fixed missing icons in connection view
  - Fixed remember variable value not working
  - Fixed unable to modify table name in SQLite3
  - Fixed table DDL loading failure for content over 65535 characters

# 8.3.5 2025-6-5
- Fixed:
  - fixed extension load failure caused by incorrect custom connection URL

# 8.3.4 2025-5-21
- Supported quickly switching between connected databases
- Quick connect now supports more SQLite extensions and improves experience
- Fixed:
  - Fixed column filter clearing not working
  - Fixed unable to bind connections in dirty documents
  - Fixed unable to edit columns in design table of PostgreSQL
  - Fixed some active connection indicator icons not displaying

# 8.3.3 2025-5-18
- Added service icons to active connection selection
- Fixed Oracle connection not being recognized when using custom JDBC URL

# 8.3.2 2025-5-16
- Removed SQL highlighting in programming languages
- Fixed DDL display failure for stored procedures with length over 65535 characters

# 8.3.1 2025-5-12
- Compatible with older versions of VS Code

# 8.3.0 2025-5-11
- Changed table default style to borderless mode
- No longer override SQL highlighting in PHP code
- Fixed etcd not supporting username/password authentication

# 8.2.9 2025-5-8
- Compatible with older versions of VS Code
- Connection state recovery enabled by default
- Better SQL block highlighting, enabled by default

# 8.2.8 2025-5-6
- Fixed some bugs
- Improved view performance
- Support hiding schemas using regular expressions
- Support parsing result sets from MariaDB stored procedures

# 8.2.7 2025-4-21
- Fixed unable to load views in remote environment

# 8.2.6 2025-4-21
- Support collapsing SQL blocks
- Added Security node to tree panel
- Fixed some bugs and improve view performance
- Fixed slow page loading in vscode version 1.99
- Support syntax highlighting for SQL within programming language strings

# 8.2.5 2025-4-10

- Add Exasol dialect for JDBC
- Add shortcut for reversing data
- Register table nodes as WorkspaceSymbol
- Fixed some bugs and improve user experience.
- Support modifying default values of SQL Server columns
- Support monitoring macOS system status with SSH connection

# 8.2.4 2025-3-31
- Fixed Cockroach unable to load tables and indexes.

# 8.2.3 2025-3-22
- Beautified some page details
- Added Elasticsearch Monitor panel
- Support login with Google account
- Support showing password on connection page
- Support displaying data space usage for PostgreSQL, SQL Server, Oracle and SQLite
- Fixed
  - Fixed databricks not supporting schema switching
  - Fixed SSL option not working when using connection string with PostgreSQL
  - Fixed foreign key loading failure in older versions of PostgreSQL, Redshift and GaussDB

# 8.2.2 2025-3-18
- Fixed SQLite connection not working properly on Windows.

# 8.2.1 2025-3-18

- Update:
  - Adapted to more themes
  - Better support for BigQuery
- New:
  - Support connection to Azure SQL Server
  - Support custom tree node color for connections
  - Support login to SQL Server via Windows credentials
  - Support exporting and importing port forwarding configurations
- Fixed:
  - Fixed copying rows triggers editing of old rows
  - Fixed single quotes in SQL Server not handled correctly

# 8.2.0 2025-3-12
- Add native SSH connection type.
- Add copy with header option for CSV.
- Fix SQL Server's GO being parsed as SQL.
- To update database objects, use ALTER and CREATE Or REPLACE first.

# 8.1.8 2025-3-2
- Support connecting to Databricks.
- Change the number of free version connections from 2 to 3.

# 8.1.7 2025-2-28
- Support connecting to 华为GaussDB.
- Support hiding databases using regular expressions.
- No longer add -y parameter when automatically installing dependencies.
- fixed:
  - fixed anonymous column data not displaying.
  - fixed backslashes being escaped in SQL Server.
  - fixed ssh connection timeout configuration not working.
  - fixed some clickhouse versions unable to execute alter statements.
  - fixed parameters not being cleared after closing the add column dialog in design table.

# 8.1.6 2025-2-20

- Hide checks in MySQL 5.x version on design tables.
- Add configuration to disable remembering SQL variables.
- Result view editor
  - Support toggling comments via ctrl/cmd+/.
  - Automatically display line numbers for multi-line SQL.
- Fixed:
  - Fixed clickhouse cannot execute set statements.
  - Fixed begin statement not being parsed correctly.

# 8.1.5 2025-2-14

- Supported connecting to Cloudflare D1 and WebDAV.
- Fixed:
  - Fixed SSH key might be overwritten.

# 8.1.4 2025-1-25

- Automatically close idle connections.
- Automatically open the variable window when there are variables in the SQL.
- Fixed schema not being automatically included when editing in the result page.

# 8.1.3 2025-1-25

- Fixed the issue that the connection cannot be checked correctly based on the query path on Windows.

# 8.1.2 2025-1-13

- Better tunnel activation indication.
- Remove the gutter icon that shows the connection status.

# 8.1.1 2025-1-12

- Reduced annoying notifications.
- Supported using Windows system proxy.
- Query file no longer generates active mark.
- Supported displaying kafka topic configurations.
- Supported filtering stored procedures and functions.
- Supported editing files via cmd/ctrl+click in the SSH terminal.
- Fixed:
  - Fixed Redis refresh not working.
  - Fixed END CASE causing SQL parsing exceptions.
  - Fixed MySQL text type being parsed as hexadecimal.
  - Fixed cache not being cleared after drop a database.
  - Fixed loading triggers in older versions of PostgreSQL.
  - Fixed CapsLock triggering double input in SSH terminal on MacOS.

# 8.0.8 2024-12-24

##### 非常抱歉由于版本8.x存在SQL解析异常，因此最近频繁更新。

##### Sorry for the frequent updates recently due to SQL parser exceptions in version 8.x.

- Control VS Code to not auto-format SQL.
- Added a duplicate tab button to SSH connections.
- Fixed:
  - Fixed connection name was not displayed when change active connection.
  - Fixed SQLite was still shown as not installed after downloading on Windows.

# 8.0.7 2024-12-23

- New:
  - Supported multi-column editing.
  - Supported copying tables by dragging.
  - Supported executing PostgreSQL COPY statements.
  - Supported quick adding SQLite and DuckDB connections.
  - Supported exporting configuration files with query files.
- View:
  - Added animations to tab and dialog components.
  - Beautified input fields, switches, checkboxes and other UI elements.
- Fixed:
  - Fixed incorrect display and editing of bit type.
  - Fixed inability to edit bigint after exceeding precision.
  - Fixed some PostgreSQL functions not being parsed correctly.
  - Fixed incorrect display of serial or generated columns in pg DDL view.

# 8.0.4~6 2024-12-19

- Added SQL variable configuration panel.
- Improved Docker interaction performance.
- Added new connection types: Cockroach and Kingbase(电科金仓).
- Support displaying whether the column is auto-generated when adding a new column.
- Fixed:
  - Fixed label causing parsing exceptions in stored procedures.
  - Fixed the selected text in the edited cell cannot be copied.
  - Fixed MongoDB and Elasticsearch cannot filter numbers and null.

# 8.0.1~3 2024-12-18

- Fixed unable to change active connection.
- Oracle:
  - Support displaying database object status.
  - Fixed unable to create packages/stored procedures and functions.

# 8.0.0 2024-12-17

- Rewritten the SQL parser to support complex DDL definitions.
- Result View:
  - Support copying rows.
  - No longer create a separate filter row.
  - Beautify the free version user interface.
  - Added temporary rows will be highlighted.
  - Fixed loss of original row numbers after editing searched data.
- Codelens:
  - Integrated with Cursor and Github Copilot.
  - Added codelens to view data in DDL files.
  - New templates no longer overwrite old files, providing quick reset for Codelens.
- Fixed:
  - Fixed "Copy Table" only supporting MySQL.
  - Fixed unable to complete SQL Server stored procedures
  - Fixed run all (without parse) causing a large number of panels
  - Fixed Clickhouse sometimes executing successfully but showing errors.

# 7.7.6 2024-12-13

- Enable file saving feature for free use.
- Fixes:
  - Fix JSON output object being converted to string
  - Fix Active mark not taking effect when switching files.
  - Fix queryWithSchema configuration item not taking effect
  - Fix MySQL editing string column causing character set definition

# 7.7.5 2024-12-10

- Better support for MongoDB.
- Enhanced page details to improve user experience.
- Add compatibility mode for MySQL, PostgreSQL, and FTP.
- Support setting columns to automatically sort in reverse order.

# 7.7.4 2024-12-6

- Fix MariaDB cannot open the terminal and fails to dump data.
- Result View:
  - Add auto refresh.
  - Add "Edit in VSCode".
  - Add aggregate status bar.
  - Supports viewing more data types (Date, Time, Geometry, Binary).

# 7.7.3 2024-12-3

- Fix text type being parsed into hex.
- Fix MySQL stored procedure results not being displayed.
- Fix JSON data being exported as strings when exporting to JSON files.

# 7.7.0 2024-12-2

- View:
  - Beautify the date picker.
  - Beautify the contextmenu.
- Result View:
  - Supports exporting column data to file.
  - Supports displaying and modifying binary data.
  - Supports filtering current table data without new query.
  - Fix losing focus when pressing Esc and Enter while editing data.
- SQL Server:
  - Fix inserting unicode data causing garbled code.
  - Support for displaying and editing table and column comments.
- Fix database active state not displayed when connection has schema.

# 7.6.9 2024-11-25

- Fix DuckDB showing connection timeout.
- Fix Schema level SQL history not being recorded correctly.
- Fix Casandra tables with clustering columns failing to execute DML.

# 7.6.7 2024-11-21

- Fix Casandra can't update and delete data.
- Fix the advanced configuration options not being correctly merged.

# 7.6.6 2024-11-20

- Support hiding cost time.
- Support searching Redis Hash Field.
- Support dumping and restoring MongoDB.
- Support disabling HTTP Tls verification.
- Use multi-level grouping for table grouping.
- Fix unique flag of columns not displaying correctly.
- Simplify connecting to SQL Server via Windows Auth.

# 7.6.5 2024-11-14

- Support setting columns to empty strings.
- Fixes
  - Fix cache not being correctly auto-updated.
  - Fix empty strings becoming null in exported SQL data.
  - Fix Oracle indexes not showing whether they are Unique.
  - Fix the SQL generated by the built-in dump cannot be executed.
  - Fix tables without auto-increment columns in SQL Server fail to import external data.

# 7.6.4 2024-10-19

- Support clearing SQL history.
- Fix long text cannot be copied.
- Fix missing space in PostgreSQL terminal password.
- Fix unable to connect to the latest version of MariaDB.

# 7.6.3 2024-10-11

- Fixed some view issues.
- Support for custom MongoDB and SSH terminal commands.

# 7.6.2 2024-9-16

- Added log panel (Preview).
- SQL panel height is no longer remembered.

# 7.6.1 2024-9-14

- Added the ability to close all connections in the settings page.
- "Login On Browser" now supports Cursor and other VS Code distributions.
- Column and row numbers are now configurable, with row numbers hidden by default.
- Fixes:
  - Fixed copy table data cannot be pasted into Excel as table.
  - Fixed loading images failing when Docker has anonymous images.
  - Fixed Clickhouse failing to execute SQL with comments at the end.
  - Fixed files and groups triggering events when dragged onto themselves.
  - Fixed column alignment not working when result page alignment is set to auto.
  - Fixed inability to load Types, Sequences, and Triggers in PostgreSQL version 13.
  - Fixed numeric columns in result data being incorrectly treated as array index references.

# 7.6.0 2024-9-4

- Support custom terminal commands.
- Fix:
  - Fix S3 connection cannot successfully upload large files.
  - Fix the scroll bar of the expanded row view blocking the data.
  - Fix the conflict between data inversion and tab switching shortcut keys.

# 7.5.9 2024-8-25

- Fix unable to query Hive.
- Support dragging result columns.

# 7.5.7 2024-7-28

- Modify the Query file to sort by file name.
- Add Run current SQL back to the editor contextmenu.
- Fix:
  - Fix cannot detect database cli.
  - Fix unable to execute multi-line string SQL in Clickhouse.
  - Fix unable to specify a deliimiter when executing "copy from csv" in PostgreSQL.

# 7.5.6 2024-7-15

- Web VS Code:
  - Fix cannot copy and paste.
  - Fix result view context menu not showing.
- Fix:
  - Fix monitor view cannot kill database connection.
  - Fix DDL cannot be displayed for long views in Oracle.
  - Fix duplicate schema when performing curd for SQL Server.
  - Fix MongoDB and ElasticSearch cannot perform delete operations.

# 7.5.5 2024-7-11

- Add AS400 dialect for JDBC.
- Fix duplicate pasting on Mac OS.
- Support connecting etcd in LAN.
- Support connecting to 达梦 via service name.

# 7.5.2 2024-6-27

- Improve extension performance.
- Support skipping primary key to import data.
- Fix completion will display Output when an error occurs.

# 7.5.1 2024-6-22

- Export:
  - Improve Excel export performance.
  - Support exporting CSV to GBK format.
- View:
  - Support kill process from monitor view
  - Diagram view adapted to VS Code theme.
- Improve cloud configuration upload performance.
- Query supports creating folders and linking external folders.

# 7.5.0 2024-6-19

- Fix some UI bugs.
- Add ER Diagram view.

# 7.4.9 2024-6-14

- Better UI.
- Support running all SQL without parsing.

# 7.4.5 2024-6-8

- Support connect to BigQuery.

# 7.4.4 2024-6-5

- Fix some UI bugs.
- Improve completion performance.
- Support connect to etcd, Trino, Presto, Hive and AWS Athena.

# 7.4.3 2024-5-30

- Fix file sync not working.
- Fix execution status is not displayed correctly.

# 7.4.2 2024-5-29

- Migrate the query file to the home directory.
- Cloud sync supports synchronizing query files.
- Only select statements will create new results views.
- Fix the execution does not actually end after clicking the stop execute button.

# 7.4.1 2024-5-27

- Fix some UI bugs.
- Result view:
  - Remove the console log.
  - Fix width calculation does not include column types.
  - Only display the length for type varchar, number and decimal.

# 7.4.0 2024-5-24

- Fix some UI bugs.
- Clear warnings caused by this extension.
- Fix batch execution SQL may create a large number of views.

# 7.3.9 2024-5-21

- Supports detection of Java through JAVA_HOME.
- UI:
  - Fixed incorrect button disabled state.
  - Add a refresh button to the results view.
  - Add the Query button back to the database node.
- Fix the loading status cannot be displayed when executing SQL in batches.

# 7.3.8 2024-5-16

- Better UI for treeview and redis view.
- Support skipping foreign key checks.
- Add prompt when loading database metadata.
- Fix:
  - Fix unable to display DuckDB error.
  - Fix pagination for "with delete" clause.
  - Fix automatically switches paging after executing SQL with paging.
  - Fix automatically enables SSH tunneling when creating an SSH connection.

# 7.3.7 2024-5-13

- Fix cannot complete table fields using alias.

# 7.3.6 2024-5-13

- Better english translation.
- Improve SQL parsing performance.
- Execute:
  - Only one results panel is displayed for DDL.
  - Supports batch running of SQL in two newlines delimiter mode.
- Supports displaying foreign keys for PostgreSQL, SQLite, SQL Server, Oracle and Db2.

# 7.3.2 2024-5-6

- Highlight output panel.
- Improve performance of tree view and results view.
- Tree View:
  - Improve Oracle loading performance.
  - Supports configuring which features should be enabled.
- Fix:
  - Fix incorrect sort button behavior.
  - Fix editing connections using tunnels requiring connecting twice.
- Result View:
  - Support reading content from files.
  - Supports displaying results view horizontally
  - Add an identifier to the foreign key column.
  - Fix incorrect sort button behavior.
  - Fix pagination triggers multiple times after switching page numbers.

# 7.3.0 2024-5-2

- Supports direct connection to Db2 and Cassandra.
- Update:
  - Improve result view performance.
  - Supports copying results as CSV.
  - Supports configuring the maximum column width.
  - Support displaying MySQL spatial data as Well-Known Text.
  - Supports connecting to SQlite and DuckDB in read-only mode.

# 7.2.8 2024-4-29

- Fix some page issues.
- Support connect to TDengine and LibSQL(Turso).

# 7.2.7 2024-4-26

- Result:
  - Supports multiple selections.
  - Expand column no longer selectable.
  - Fix selection is lost after switching focus.
- Fix repeated display in ssh terminal.

# 7.2.6 2024-4-25

- Support displaying big data in dialog.
- Supports configuring the number of redis databases.
- Fix:
  - Fix cannot modify the value of the primary key.
  - Fix SSH advanced configuration options missing.
  - Fix design table cannot adjust table column width.
  - Fix result total is incorrect when it is less than page size.

# 7.2.2 2024-4-12

- Added new codelen and command for opening new result pages.

# 7.2.0 2024-4-8

- Result View:
  - Improve table scrolling performance.
  - Supports highlighting search results.
  - Fix page gets stuck when the has binary data.
  - Editing data is changed from single click to double click.
- Remove font ligatures to improve terminal performance.

# 7.1.8 2024-4-2

- Follow VS Code font size.

# 7.1.7 2024-3-31

- Support connect to apache doris.
- Fix Docker log not displaying correctly.
- Interface font size no longer follow VS Code.

# 7.1.4 2024-3-25

- New connect view.
- Supports quick viewing of table properties.

# 7.1.3 2024-3-21

- Supports multi-level connection grouping.

# 7.1.2 2024-3-20

- Result:
  - Add JSON view.
  - Support expanding rows.
- Update:
  - Add external dependency CDN.
  - Support completion with table alias.
  - The disabled state of a workspace connection is no longer saved to a file.
- Fix:
  - Fix Redis view losing numeric precision.
  - Fix mongodb shows utf8 verification failed.
  - Fix cannot load the version number of mongodb cloud.

# 7.1.1 2024-3-18

- Disable completion in comments.
- Fix:
  - Fix Import SQL fails on MacOS.
  - Fix cannot be connected to SSH through Agent.
  - Fix cannot be displayed affected rows of SQL Server.

# 7.1.0 2024-3-13

- Improve the count efficiency of select *, [#1070](https://github.com/cweijan/vscode-database-client/issues/1070).
- Fix:
  - Fix filter table case sensitivity, [#1073](https://github.com/cweijan/vscode-database-client/issues/1073).
  - Fix shortcut key triggering repeatedly on MacOS.
  - Fix failure to update PostgreSQL interval type, [#1066](https://github.com/cweijan/vscode-database-client/issues/1066).
  - Fix backslash '\' being escaped in non-MySQL databases, [#1067](https://github.com/cweijan/vscode-database-client/issues/1067).

# 7.0.9 2024-3-3

- Port forwarding supports automatic reconnection.
- Make the interface font size consistent with the VS Code font.
- Fix the container log becomes unresponsive when the Docker connection is disconnected.

# 7.0.8 2024-3-3

- Docker:
  - Fix strange container log output.
  - Group image versions by image name
  - Supports connecting to Windows Docker Desktop.
- Fix SSH tunnel sometimes fails to automatically reconnect.

# 7.0.7 2024-2-28

- Supports configuration not to split the editor when executing SQL.
- Docker:
  - Compatible with podman.
  - Fix cannot load search images data.
- Fix:
  - Fix number 0 becomes null when exporting csv.
  - Fix exported configuration cannot be imported in older versions
  - Fix collapsed all connections losing status after restarting VS Code.
  - Fix design table data is not updated when database objects change.
  - Fix the terminal page will be triggered repeatedly when switching tabs in Mac OS.
- File:
  - Add macOS dmg and pkg icons.
  - Simplified button text when exporting or importing.
  - The binary file opening method is changed to viewing in the file manager.

# 7.0.6 2024-2-24

- Supports full-text search of the database.
- Connection:
  - Improve the security of connection configuration.
  - Add a flag to the status bar for unrecognized connections.
  - No longer compatible with connections created before version 4.5.7(global) and 5.7.8(workspace).

# 7.0.5 2024-2-19

- Always escape object names for inserts, updates and mock.
- Result View:
  - Fix failure to copy numeric values.
  - Fix unable to load MongoDB indexes.
  - Fix big int precision lost after json format.
  - Support saving columns as empty strings.
- SQL:
  - Fix join query cannot get total number after using column alias.
  - Fix The pagination clause is added when the "with .. update" statement is executed.
- Fix:
  - Fix database and NoSQL connection total calculations are reversed.
  - Fix "new buffer deprecation" warning appears after loading extension.

# 7.0.4 2024-1-24

- Fix ssh connection failed.

# 7.0.3 2024-1-24

- Support connecting to services through http proxy.
- Update:
  - Add refresh button back to ssh connection.
  - Better port forwarding configuration interface.
  - Querying table data in PostgreSQL not public schema will be with schema.
- Dump:
  - Upgrade pgdump version.
  - Fix unable to dump data for connections created using connection strings.
- Fix cannot modify the "Show column comments" configuration in the console page.

# 7.0.2 2024-1-22

- Support automatic synchronization connection and status.
- Fix that the port forwarding list cannot be loaded when the port number is not filled in.

# 7.0.1 2024-1-18

- Supports Remote and Dynamic port forwarding.
- Fix:
  - Fix cannot be activated offline.
  - Fix Unable to connect to s3 after switching regions.
  - Fix table names with backticks cannot complete columns.
  - Fix zookeeper connection fails to load keys after specifying grouping.

# 7.0.0 2024-1-16

- SSH port forwarding supports auto starting with VS Code.
- Formatter:
  - Upgrade sql-formatter from 7.0 to 15.0.
  - Fix some words will be separated after formatting.
- Update:
  - Do not escape underscores in database object names.
  - Supports completion of table names in where conditions.
  - The results page only displays Chinese column comments by default.
- Fix:
  - Fix conditions with empty strings will fail to update.
  - Fix editor font configuration may cause terminal font confusion.

# 6.9.10 2024-1-11

- Supports automatic escaping of database object names containing special symbols.
- Fix:
  - Fix cannot export temporary table.
  - Fix view table data result page will be split.
  - Fix cannot display MQ consumption codelen.
  - Fix node is not refreshed after deleting redis folder.
  - Fix redis terminal cursor style not following VS Code.
  - Fix `select into termporary table` SQL should not be paginated.

# 6.9.9 2024-1-5

- SSH terminal cursor style follows VS Code terminal.
- Copy codelen is only displayed in SQL with more than 4 rows.
- Fix:
  - Fix host is empty causing loading connection failure.
  - Fix unable to sync settings without configuration key.
  - Fix SQL is different from the original after formatting.

# 6.9.8 2023-12-29

- Fix mysql cannot successfully dump.

# 6.9.7 2023-12-28

- Fix cannot find dump command.

# 6.9.6 2023-12-22

- Show run button even in portrait mode.
- Snowflake:
  - Supports connecting through tunnels.
  - Support using snowsql to open the terminal.
  - Connection supports specified warehouse and authenticator.
- Fix:
  - Fix sync cloud configuration failure.
  - Fix configuration ftp encoding does not take effect.
  - Fix union query with join cannot obtain the total number.
  - Fixed downloaded http dependencies showing not installed.

# 6.9.5 2023-12-20

- Fix workspace level SSH connection failing to save password.

# 6.9.4 2023-12-19

- Fix typo.
- Fix Oracle and JDBC pagination failure.

# 6.9.3 2023-12-18

- Supports displaying the number of keys in the Redis folder.
- Security:
  - Encrypt passwords for workspace level connections.
  - Added confirmation when executing update statement without where clause.
- Fix:
  - Fix cannot execute select for update statement.
  - Fix comments cannot be preserved in stored procedures.

# 6.9.2 2023-12-14

- 3 connections individually limited per panel.
- New:
  - Supports completion of parameters and variables.
  - Supports tunneling for custom connection strings and JDBC connections.
  - Supports connecting MySQL and MariaDB through custom connection strings.
- Update:
  - Disable completion within large files.
  - Formatting no longer affects blank lines between comments.
- Fix:
  - Fix that new connections are not placed at the end.
  - Fix some connections cannot create tunnels properly.

# 6.9.1 2023-12-13

- Supports connecting to RabbitMQ.
- Supports creating new results views for each query.
- Update:
  - Sorting tree nodes for kafka.
  - Added no primary key warning.
  - Allow free accounts to import external data.
  - Display invisible characters \u0000 as spaces.
- Fix:
  - Fix unable to edit PostgreSQL array.
  - Fix unable to execute fetch first/next query.
  - Fix cannot hide all PostgreSQL system schema.
  - Fix with query cannot paginate and get count normally.

# 6.9.0 2023-12-8

- Improve JDBC connection performance.
- Support connect to DB2, Hive, Presto, Cassandra、CockroachDB and Greenplum.
- Fix:
  - Fix docker container log and terminal to use the same view id.
  - Fix extension does not create a connection immediately after starting.
  - Fix drag-and-drop modification of connection sorting not as expected.
  - Fix JDBC connection cannot be created successfully when user name has spaces.

# 6.8.9 2023-12-1

- JDBC:
  - Add trino dialect.
  - Parse oracle blob data to hex.
  - Improve connection performance.
- Support connecting to postgreSQL 8.x.
- Fix dump mysql 5.x fails on window OS.

# 6.8.8 2023-11-27

- Fix can't search on results view.
- Fix failed to generate mock data for table named keywords.

# 6.8.7 2023-11-25

- New:
  - Support completion of MySQL enumeration values.
  - Support go to expanded tree nodes through ctrl+click.
  - Added configuration to support capitalizing keywords when formatting.
  - Support configuring MySQL column zerofill and timestamp default values in design tables.
- Update:
  - Support list all redis databases.
  - Supports object names with dots.
  - PostgreSQL displays varchar replacing character varying.
  - The maximum number of parsed rows in the SQL parser is reduced from 20,000 to 5,000.
- Fix:
  - Fix unadded rows not being deleted correctly.
  - Fix Redshift and SQL Server multi-schema not working properly.
  - Fix database and schema cannot be loaded for the first time when tree view is not loaded.

# 6.8.6 2023-11-21

- Added filter input to column display selector.
- Fix details view cannot display data.
- Fix cannot clear nvarchar like query conditions generated by filter.

# 6.8.5 2023-11-20

- Add "Set NULL" to the cell right-click menu.
- Compatible with "PostgreSQL Language Server" extension.
- Fix:
  - Fix incorrectly checking DuckDB version.
  - Fix will bring spaces when copying column headers.
  - Fix Unable to edit file service whose connection name has symbol "|"
  - Fix "actual command not found" will appear when there are many expanded nodes.

# 6.8.4 2023-11-13

- Fix failure to connect to MongoDB service.

# 6.8.3 2023-11-12

- Support connect to DuckDB.
- Update:
  - Supports configuring MongoDB's Authentication Database.
  - Supports select clause completion function for PostgreSQL.
- Fix:
  - Fix completion shows irrelevant tables
  - Fix foreign key constraints are invalid after dropping table.
  - Fix row height configuration causing data to be unable to be displayed.
  - Fix that the connection page cannot load the icon in the remote environment.

# 6.8.2 2023-10-31

- Add copy table feature.
- Add status effects to connection group icons.
- The variable input box does not pop up when editing DDL.
- Result view:
  - Hover style adapts to light theme.
  - Fix lock icon not refreshing correctly.
  - Supports right alignment of numeric type data.

# 6.8.1 2023-10-25

- Fix cannot choose to execute multiple SQLs.
- Fix elastic search array data will become string when editing keyword type columns

# 6.8.0 2023-10-20

- New:
  - Support creating new connections from group nodes.
  - Support remembering SQL execution status of multiple files.
- Result view:
  - Better hover style.
  - Add icon to primary key column.
- Fix:
  - Fix SQL with multiple empty rows cannot get count.
  - Fix page confusion when docker logs fonts cannot be found.
  - Fix web environment cannot log in and load connection icon.

# 6.7.9 2023-10-18

- Oracle:
  - Fix cannot import data.
  - Fix cannot execute SQL in batches.
  - Fix incorrect generated DDL constraints.
- Fix failure to get count for SQL with comments.

# 6.7.8 2023-10-13

- Show column comments in result page.
- Fix:
  - Fix Oracle multi-line SQL cannot be paged.
  - Fix old version MySQL cannot load column list.
  - Fix page confusion when SSH terminal fonts cannot be found.

# 6.7.7 2023-10-10

- Support displaying PostgreSQL foreign tables.
- Fix:
  - Fix unable to load count after disabling automatic paging.
  - Fix sql server cannot import external data with primary key.
  - Fix unable to cancel after checking UNSIGNED for a new column.
  - Fix unable to assign a value to a variable when selecting SQL and executing it.

# 6.7.3 2023-9-19

- Support parsing # line comments.
- SSH disable diffie-hellman-group1-sha1.
- Fix:
  - Fix ftp batch file download failure.
  - Fix rdp connection can be expanded.
  - Fixed built-in dump not escaping objects.
  - Fix elasticsearch empty body display invalid body.
  - Fix cannot delete tables with foreign key constraints.

# 6.7.2 2023-9-1

- Display SQL Server binary data as hex.
- Fix:
  - Fix cannot open rdp connection.
  - Fix cannot delete Clickhouse data.

# 6.7.1 2023-8-29

- Fix some bugs.

# 6.7.0 2023-8-16

- Support preview delete SQL.
- Update:
  - Show copy button only after row is selected.
  - Better SQL parser, and force enable codelen.
  - Design table shows whether column is nullable.
  - Add delete statement when viewing object DDL.
- Fix:
  - Fix read-only connection can still execute DML on result page.
  - Fix reverse data does not support displaying duplicate columns.
  - Fix pagination not being handled correctly when line breaks appear.

# 6.6.7 2023-8-7

- Better export SQL support.
- Improve performance of importing data.
- Improve the parsing ability of complex SQL.

# 6.6.6 2023-8-2

- Support connect to loki.

# 6.6.5 2023-7-31

- Result:
  - Support exporting reverse data.
  - Support adding \G at the end of SQL to reverse data.
- Support configuration of ssh connection algorithms.
- Allow free accounts to export and import configuration.

# 6.6.3 2023-7-25

- Allow free accounts to use dump, show DDL and open terminal.
- Fix:
  - Fix cannot use grouping table.
  - Fix can't upload files larger than 528MB to minio

# 6.6.1 2023-7-20

- SSH:
  - Better connection view.
  - Support connection via ssh agent.
  - Improve sftp upload and download speed.
- Fix:
  - Fixed Kafka cannot produce and consume.
  - Fixed generated DDL not escaping columns.
- Support editing Date, Timestamp, Binary and ObjectID types of mongodb.

# 6.6.0 2023-7-13

- Support free account to use in remote ssh environment.
- SSH:
  - Modify Prune SFTP ROOT to blacklist mode.
  - Support uploading and downloading files via rz/sz.
  - Support using ssh rsa key to connect to OpenSSH 9.
- Fix:
  - Fix empty cells displayed incorrectly.
  - Fix wrongly detected multiple results.

# 6.5.12 2023-7-11

- Fix cannot display multiple spaces.
- Better formatting support for elastic search.
- Fix timeout not working for ssh connections
- Fix ssh session interruption after sz download file completes.

# 6.5.11 2023-7-3

- Better dependency installation process.
- Support for downloading ssh files using sz.

# 6.5.9 2023-6-29

- Support prune SFTP root path.
- Fix unable to display redis list data.

# 6.5.7 2023-6-25

- Fix cannot view history.
- Support ssh connection disable SFTP support.
- Fix the failure of automatic pagination in some cases.

# 6.5.6 2023-6-24

- Fix cannot use the details dialog.
- Better highlighting for MongoDB.
- Fix the failure of changing the column to a numeric type in the design table.

# 6.5.5 2023-6-20

- Add new Redis data editing dialog.
- Migrating the storage path of Query.
- TreeView:
  - MySQL database size includes index size.
  - Support to display the database size of mongodb, clickhouse, PostgreSQL and SQLite.
- Completion:
  - Better support for completion.
  - Comma no longer triggers completion.

# 6.5.4 2023-6-18

- Support download terminal and dump dependency.
- Support to export custom SQL through dump client.

# 6.5.3 2023-6-15

- Support connect to kafka.
- ">","<","=","(" does not trigger completion by default.
- Change the first letter of the group name to uppercase.
- Fix:
  - Fix connection timeout cannot be saved.
  - Fix sql with comments cannot query count.
  - Fix SQL panel edits cannot be synchronized.

# 6.5.2 2023-6-12

- Adjust some view design.
- Support view Redis key on new page.
- Supports completion of SQLite functions and keywords.
- Support configuration to execute the shell after opening the ssh terminal.

# 6.5.1 2023-6-8

- Better support for clickhouse.
- Query file does not show "Active Connection".

# 6.5.0 2023-6-8

- Support connect to zookeeper.
- Support remembering the exported path.
- Result View:
  - Support export data to editor.
  - Support copy data to clipboard.
  - Supports moving cells by pressing left and right.
- ElasticSearch:
  - Support validating for errors in the request body.
  - Fix formatting exception when the request body has a long array.
- Added telemetry data reporter (support disabled).

# 6.4.9 2023-6-4

- Fix SQL Server cannot edit data.
- Remember cursor position after editing data.
- The page has better support for small screens.
- The ssh terminal supports modifying the theme.

# 6.4.8 2023-6-2

- Add demo to mysql json function.
- Remove the limit of 5000 data from the results page.
- Fix:
  - Fix redshift cannot query data except public schema.
  - Fix the problem that the terminal cannot input Chinese correctly.

# 6.4.7 2023-5-29

- Add QR code parsing util.
- Add quick creation of sqlbook.
- Support for creating rdp connections on Windows OS.

# 6.4.6 2023-5-22

- Better console display on small screens.
- Support using tunnel to connect docker.
- Execute:
  - Do not remove comments when executing SQL.
  - Support automatic pagination for sql server query.
- Fix:
  - Fix Unable to re-mock data after restarting vscode.
  - Fix the result page cannot display and edit the symbol &.

# 6.4.5 2023-5-12

- Registered user authentication to the VS Code panel.
- Update:
  - Not longer modified NODE_TLS_REJECT_UNAUTHORIZED variable.
  - Remove redundant dependencies to enhance extension performance.
- Elastic Search:
  - Support for formatting elastic search queries.
  - Support for parsing the results of aggregation.
- Fix:
  - Fix s3 can't delete folder.
  - Fix windows ssh can't delete folder and load Chinese.

# 6.4.4 2023-5-10

- Support export data without rerun SQL.
- File:
  - Add progress bar for downloading ftp files.
  - Improve the performance of batch upload and download files.
- Fix:
  - Fix failure to open sqlite terminal.
  - Fix docker can't cancel file upload.
  - Fixed tree view stop responding when executing slow query.
  - Fix the connection sort disorder after creating a new connection and editing it.

# 6.4.3 2023-5-7

- SSH key paths support using the symbol ~.
- File:
  - Support to display the number of s3 bucket files and size.
  - Support to select the buckets to display for s3 connection.
  - Support to display the number of files for folders of ftp, s3 and docker connection.
- Fix:
  - Fix jdbc connection cannot switch database.
  - Fix no authenticated user when connecting to clickhouse.

# 6.4.2 2023-5-2

- Adjust some user interface.
- Fix:
  - Fix Unable to connect to docker.
  - Fix only one database status view can be opened.
  - Fix that the boolean type cannot be edited in the edit dialog.

# 6.4.1 2023-4-25

- Redis Terminal:
  - Support highlight command.
  - Supports completion of command arguments.
  - Command history does not record duplicate commands.
- Docker:
  - Fix no exception display when opening container log fails.
  - Improve performance of connections created via SSH mode.
- Fix:
  - Fix panel focus loss after executing SQL.
  - Fix bit type can only display true and false.
  - Fix terminal responsive height not working.
  - Fix the text that starts with 0 in the exported excel data will be removed.

# 6.4.0 2023-4-23

- Design Table:
  - Support configuration column unsigned and zerofill.
  - Support configuring constraint name when creating foreign key.
- Fix that the s3 folder cannot be deleted and renamed when there are subfolders.

# 6.3.7 2023-4-13

- Fix log loss.
- Better result tab name.
- Fix unable to connect ssh through socks proxy.

# 6.3.6  2023-4-12

- Update view color.

# 6.3.5 2023-4-6

- Support connect to server via socks proxy.

# 6.3.2 2023-4-4

- Dump mysql and mariaDB with --hex-blob flah.
- Fix that small files cannot be uploaded to the ftp server.
- UI:
  - Adjust view font size.
  - Better key view for redis.
  - Fix duplicate descriptions for nodes.
  - Support config maximum column width.
  - Add background color to data table header for result view.
- ElasticSearch:
  - Support dump custom query.
  - Support to activate connection after restarting VS Code.

# 6.3.1 2023-3-29

- Improve the speed of oracle paging.
- The edit dialog supports zoom-in editing.
- UI:
  - Use connection name as terminal name.
  - Add confirmation when dragging to modify the file path.
- Fix:
  - Fix unable to create Redis key.
  - Fix ssh status can't load debian status.
  - Fix cells with empty strings cannot be edited.
  - Fix the inaccurate total number of grouped SQL.

# 6.3.0 2023-3-25

- Result view:
  - Remove top and bottom borders of rows by default.
  - Support for configuring the row height of the result page.
- Redis:
  - Add key creation view.
  - Show type for Redis keys.
  - Support displaying memory usage.
  - Support save key value via ctrl/meta+S.
- Tree view:
  - Add security protection for SSH drag and drop files.
  - Support to display the index data size of Elasticsearch.

# 6.2.8 2023-3-18

- Editor:
  - SQL highlighting skips trailing blank lines.
  - Added option to disable active connection binding comments.
  - Selecting Execute SQL from the editor will no longer get focus and highlighting.
- Redis:
  - Support to close the terminal by typing exit.
  - Fixed not clearing cache after deleting folder.

# 6.2.7 2023-3-17

- SQLite:
  - Fix not using correct version on Ubuntu.
  - Fix process no kill after close connection.

# 6.2.6 2023-3-17

- Automatically paginate SQL executed from code len.
- TreeView:
  - New feature query.
  - Support for display table partitions for MySQL.
- Update:
  - Persistent SQLite connection.
  - Fix split screen detection is not accurate.
  - Support to connect to MariaDB through MariaDB official library.

# 6.2.5 2023-3-14

- Adjust some result view.
- Enhance the query feature.
- Editor:
  - Highlight executed SQL.
  - Display the cost time of executing SQL.
  - Automatically paging the SQL to be executed.
- Elasticsearch:
  - Fix unable to detect head request.
  - Fix the request failure when restoring big data.
- Result view:
  - Remove SQL from info panel.
  - Hide SQL panel when page height is small.
  - Support for remembering output sql options.
  - Fix incomplete data exported by Oracle.
  - Fix can't get the total number of tables in some cases.

# 6.2.4 2023-3-4

- Adjust some user interface.
- Snowflake uses account as the connection name by default.
- Elasticsearch:
  - Fix unable to update composite object data.
  - Support for listing nested fields in tree view.
  - Support to dump and restore elasticsearch data.

# 6.2.3 2023-2-28

- Support connect to snowflake.
- Update:
  - Better elasticsearch query result view.
  - Automatically install sqlite under Windows system.
  - The connection can correctly obtain the active state after restart.
- Fix:
  - Fix docker container terminal size not syncing.
  - Fix that the tree view is not refreshed after operating the file.
- Oracle:
  - Fix loading total failed when executes complex SQL.
  - Fix the check constraint of the table that cannot be loaded.
  - Fix the precision of the number type that cannot be loaded.

# 6.2.2 2023-2-23

- Support to delete cloud sync content.
- Fix:
  - Fix wrong output when not splitting results pages.
  - Fix the number type can not use negative numbers.
  - Fix failure to load table data in some versions of sqlite.

# 6.2.1 2023-2-16

- Support exporting data as Markdown.
- Update:
  - Reduce the completion weight of the when keyword.
  - Add common time zone to MySQL time zone configuration.
- Fix:
  - Fix the complex SQL that cannot be counted.
  - Fix line breaks causing failure to load outline.

# 6.2.0 2023-2-14

- New:
  - Support complete case function.Add case SQL template.
  - Support time zone configuration for MySQL connection.
- Result view:
  - Better layout of results panel after executing SQL.
  - Only keep one editor when clicking the result full button.
- Fix:
  - Fix no error message when exporting data failed.
  - Fix sql_mode option not working for read-only connections.

# 6.1.9 2023-2-9

- Update:
  - Support show table DDL based on table alias.
  - Do not create Select template when opening query file.
  - Support using Azure configuration to connect to SQL Server (Beta).
- Fix:
  - Fix focus loss after executing SQL.
  - Fix wrong table definition displayed in some cases.
  - Fix cannot connect to elasticsearch when ending with /

# 6.1.8 2023-2-7

- Add more chinese.
- Result view:
  - Better toolbar design.
  - Fix escapedAllObjectName option not working.
  - Do not display the SQL panel when the SQL is too long.

# 6.1.7 2023-2-3

- Fix SQL Server sorting results failed.
- Fix cannot display mongodb array correctly.

# 6.1.5 2023-1-31

- Support show sqlite version.
- Fix postgresql DDL showing incomplete.

# 6.1.4 2023-1-30

- Support show multiple result.
- Tree view:
  - Support using custom database.
  - Add inline icon to clear favorites.
  - Support for distinguishing between favorite and non-favorite files.

# 6.1.3 2023-1-14

- Fix some bugs.

# 6.1.2 2023-1-13

- Distinct SQL column completion.
- Support SSH connection favorite file.
- Data export:
  - Beautify the exported xlsx file.
  - Does not output SQL to a separate table by default.
  - Fix exported xlsx can not perform mathematical calculations.

# 6.1.1 2023-1-9

- Support manager ssh users for windows system.
- SSH status:
  - Better view responsiveness.
  - Fix can't display Linux cpu speed correctly.
  - Support show ssh status for windows system.
- Result view:
  - Better export dialog view.
  - Fixed completion not meeting expected results.
- Fix:
  - Fix unable to generate s3 temporary URL.
  - Fix ftp connection cannot download files in batches.
  - Fixed the failure to export xlsx when result has duplicate fields.
  - Fixed the failure to import SQL when the password had special characters.

# 6.1.0 2022-1-4

- Clean up redundant logs in the console.
- Terminal:
  - Support font ligatures.
  - Responsive width and height.
  - Improve rendering performance.

# 6.0.9 2022-1-3

- Support filtering Redis keys.
- Added change active connection to command palette.
- View:
  - Fix mongodb cannot use object id to filter.
  - Gray out the dates of other months in the date picker.

# 6.0.8 2023-1-1

- Better es template.
- Hide useless commands from the vscode command palette.
- TreeView:
  - Support to move the file path by dragging.
  - Support open docker container port in browser.
- MongoDB:
  - Support drop collection.
  - Add insert template to collection node.
  - Support for parsing more column types.
  - Fix result view cannot filter MongoDB correctly.
  - Fixed property being converted to string after edit.

# 6.0.6 2022-12-25

- Better SQL completion.
- Enhancing the generated DDL.
- Limit the default docker container memory to 900m.
- Table design:
  - Support preview modify SQL.
  - Support config reference option.
  - Support create multicolumn indexes.
- TreeView:
  - Show ssh connection port if not 22.
  - Fix infinite refresh when node group is empty.
  - Fixed not being able to remove connection groups by dragging.

# 6.0.4 2022-12-20

- New:

  - Support displaying MySQL Events.
  - Support generate crud SQL template.
- Tree view:

  - Support uploading file by dragging.
  - Cache connection version permanently.
  - Display the number of child nodes immediately.
  - FTP connection supports displaying progress while uploading files.
- Docker:

  - Fix cannot properly clean up images.
  - Support create docker compose service.
  - Do not display the creation time of the image.
  - Add an inline Icon to view the status of the containers.
  - The click operation only displays 500 lines of container logs.
- SSH:

  - Better user design for port forwarding.
  - Fix incorrect memory percentage in status view.

# 6.0.1 2022-12-12

- Completion:
  - Show all keyword.
  - Support show function signature.
- Tree view:
  - Improve performance.
  - Add insert template for ElasticSearch index.
  - Support manager data stream for elastic search.
  - Add identity for connections that using SSH tunnel.
- SFTP:
  - Support for expanding Link nodes.
- Docker:
  - Show image size.
  - Add popular image selection.
  - Better container name display.
- Fix:
  - Fix grouped list not loading NoSQL.
  - Fix MySQL cannot executing LOAD DATA SQL.
  - Fix cannot connect to SQL Server through the port.
  - Fix the failure when SSH tunnel re-forwarded ports.
  - Fix shift+insert triggering two pastes in the terminal.
  - Fix the failure to export files in the Remote environment.

# 6.0.0 2022-12-6

- New:
  - Add common development tools on console.
  - Support uploading public key to user for ssh connection.
  - Support to completing MySQL and PostgreSQL built-in functions.
  - Support management check and modifying collation in the table design.
- Enhance:
  - Better user interface design.
  - Support editing data without primary key.
  - Highlight important information in ssh status.
  - Generate a more complete Postgresql table DDL.
  - Use the selector in the configuration foreign key dialog.
- Fix:
  - Fix sorting failure when SQL has an order by clause.
  - Fix edit row not getting focus if view was already created.

# 5.9.3 2022-11-28

- Record insert and update SQL as history.
- New:
  - Support manager users of ssh connection.
  - Support display error messages of elastic search query.
- Fix:
  - Fix connection not being closed when executing SQL.
  - Fix that postgresql cannot mock when using uuid as the primary key.
  - Fix that the configuration cannot be synchronized when no key is configured.

# 5.9.2 2022-11-21

- Delete config file on VS Code startup if it exists.
- New:
  - Support for disabling automatic escape of database object names.
  - Support configuration of cipher, kex and serverHostKey for connecting to ssh server.
- Elasticsearch:
  - Added status display when executing query.
  - Display the response size after executing the query.
- Fix:
  - Fix failure when creating jdbc connection for the first time.
  - Fix failure to load columns for older versions of postgresql.
  - Fix the type being changed after editing a column of text type.

# 5.9.1 2022-11-10

- Fix cannot use single quotes.

# 5.9.0 2022-11-9

- Speed up extension activation.
- New:
  - Add toolbar to ssh terminal.
  - Support view geometry type.
- Create view:
  - Better docker connection panel.
  - Supports selection of created groups.
- Result view:
  - Added snippets to sql panel.
  - Long type does not display length.
  - Keep the edit dialog when saving fails.
  - Support display field type after executes join query for postgresql, mariadb and oracle.
- Fix:
  - Fix connecting to s3 service failed.
  - Fix docker container file using wrong cache.
  - Fix SQL generated in dialog not being preserved.
  - Fix the server file is empty when the network is abnormal.

# 5.8.16 2022-11-7

- Result view:
  - Support show column types for join SQL.
  - SQL panel supports extracting SQL based by cursor.
  - Do not clear content after executing SQL in SQL panel.
- Fix:
  - Fix tinyint and bit do not support mock.
  - Fix column comments not displaying correctly when they have newlines.

# 5.8.15 2022-11-3

- Better form styles.
- Support reverse result data.
- Supports display multi-level fields for es server.

# 5.8.12 2022-10-28

- Columns will be escaped when completing columns.
- Fix:

  - Fix execution cost time are wrong.
  - Fix the sorting status is not cleared after executing SQL.
  - Fix that the selected background color cannot be displayed under the light theme of the ssh terminal.

# 5.8.10 2022-10-18

- Improve ssh folder refresh performance.
- Fix:
  - Fix the refresh not triggering after batch delete files.
  - Fix unable to delete mongodb data.
  - Fix can't be activated offline.

# 5.8.9 2022-10-17

- Fix abnormal data after enable filter on the result page.

# 5.8.8 2022-10-14

- Fix result page interaction not working.

# 5.8.7 2022-10-13

- New:

  - Supports copying all columns of result.
  - Show the result status after executing SQL.
- Update

  - Improve view performance.
  - Connection page to be responsive.
- Fix:

  - Fix filter legacy bug on result view.
  - Fix being able to update when primary key value is null.

# 5.8.4 2022-10-3

- Better view design and improved page performance.

# 5.8.3 2022-10-1

- Remove binary of sqlite.
- Support to hide the magnifier in the result view.
- Beautify the view to make it more appropriate to the vscode theme.
- Workspace:
  - Fix workspace connection state cannot be saved.
  - Fix connections that can only create one workspace.
- Fix:
  - Fix the failure to export excel when the column length exceeds 32767.
  - Fix wrong format of exported when data contains quotes, commas or \n.

# 5.8.2 2022-9-29

- Fix the redis folder cannot refresh the keys.

# 5.8.1 2022-9-29

- Update ssh connection icon.
- Support clear redis terminal.
- Docker:
  - Improve performance of tree view operations.
  - Add inline execution buttons for common operations.

# 5.8.0 2022-9-26

- Update codelen icon.
- Speed up view opening.
- Make mock configuration independent of table.
- Support for specifying the location of the connection terminal.
- Docker:
  - Better cleanup tips.
  - Sort images on treeview.
- Redis:
  - Fix redis terminal not being able to parse numeric reply.
  - Fix the cache is not cleared when refresh the connection.

# 5.7.15 2022-9-22

- Fix bugs.

# 5.7.14 2022-9-21

- Fix cannot query mongodb data.
- Support view the the image on docker hub.

# 5.7.13 2022-9-20

- Support for parsing the result of redis hgetall.
- Remove special characters when creating docker container.
- Support forwarding unix socket through ssh tunnel to connect to mysql.
- Elasticsearch:
  - Add completion when configuration mapping.
  - Support parsing pagination parameters on request path.

# 5.7.12 2022-9-13

- Fix failure to import sql file on unix system.

# 5.7.11 2022-9-11

- Elasticsearch:
  - Support open api document.
  - Support copy request as curl.

# 5.7.10 2022-9-7

- Fixed unable to create workspace connection.

# 5.7.9 2022-9-7

- Redis:
  - Using parallel to dump data.
  - Support view RedisJSON type.
- Better support for table design.
- Add duplicate extension detection.
- Add a err log when opening remote files fail.

# 5.7.8 2022-9-3

- new:

  - Support folding in json viewer.
  - Added inline button to run the shell of the sftp connection.
- Update:

  - Enhanced SQL template editing.
  - Remove vscode default menu on webview.
  - Add confirm when uploading configuration.
  - Improve the performance of ftp, sftp and s3 editing files.
- Fix:

  - Fixed can't delete old version connection.
  - Fixed some legacy bugs.

# 5.7.6 2022-8-30

- Support LOAD DATA operation of MariaDB.
- Fix docker config lost after editing config file.

# 5.7.5 2022-8-30

- New:
  - Support clear cache files.
  - Support connect to MariaDB.
  - Support show database data length.
  - Supports configuration sort rules of the table.
- SQL Parser:
  - Support parsing oracle package syntax.
  - Support parsing do syntax, and improve support for procedures and functions.
- Fixed not formatting views correctly.
- Clear old message after executing SQL.

# 5.7.4 2022-8-26

- Support setting the sql_mode of the connection.
- Support showing mysql foreign keys in tree view.
- Fixed sort button active state has no color.
- Fixed disconnection during ftp batch operations.
- Fixed unable to display stored procedures and functions in older versions of pg.

# 5.7.3 2022-8-22

- Support free use in remote-ssh.
- Index:
  - Show the union index as one index.
  - Fixed drop postgresql index failure in tree view.
  - Show Modify Index Template when Index is clicked.
- Fixed the failure to modify the connection group node by dragging and dropping.

# 5.7.1 2022-8-18

- Support collapse tree view.
- Better interactive experience for column editing.
- Add the table name to the name of the export file.
- Fixed distinct query get count fail.
- Fixed es data cannot be edited when it is empty.
- Fixed the exported mysql excel cannot perform formula calculation.

# 5.7.0 2022-8-13

- Better performance of tree node connections.
- Modify connection ordering only when dragging connection nodes.
- Fix:
  - Fixed ssh connection no refresh button.
  - Fixed the wrong endpoint of aws s3 service.
  - Fixed the checkbox cannot be displayed under the light theme.
  - Fixed the dialog not working after shrinking the screen on result view.

# 5.6.10 2022-8-11

- Support offline activation of premium.
- Better support for elastic search completion.
- Support to display column comment by hover.
- Fixed unable to delete item from redis set.
- Fixed cells become empty after pasting on result view.
- S3:
  - Fixed public url not encoded.
  - Fix created object with spaces at the end.

# 5.6.8 2022-8-8

- Support for copying public urls of s3 files.
- Don't trigger refresh when the switch file is bind to the same connection.
- ElasticSearch:
  - Display results using horizon view.
  - Add cost time display when displaying json results.
  - Fixed can't parse when body has blank lines.
  - Fixed not detecting pagination status correctly.
  - Fix the data cannot be saved when the field is object.
  - Fixed the incorrect total displayed when es data exceeds 10,000.

# 5.6.5 2022-7-24

- Add native ssh connection.

# 5.6.3 2022-7-20

- Support show ssh server status.
- Remember the last selected path.
- Support connect to docker by ssh connection.
- Support more key exchange algorithms for ssh server.
- Fixed es query cannot be highlighted on result view.

# 5.6.1 2022-7-15

- Added timeout detection when creating connection.
- Docker:
  - Fixed connect to docker by ssl fail.
  - Support connect to docker over unix socket and ssl.
  - Add menu to run docker image in background.

# 5.6.0 2022-7-14

- Better active connection selector.
- Support connect to docker service.
- Support setting mysql connection to safe mode.

# 5.5.5 2022-7-7

- Support change group name.
- Support connect to active mode ftp server.
- Better operation support for ftp, sftp and s3 service.

# 5.5.4 2022-7-5

- Support connect to S3 service.
- Better support for elastic search.
- Support filter tables by input box.
- Fix:
  - Fixed Hover table will display ddl.
  - Fixed ssh server showing version repeatedly.
  - Fixed the view not updating after modifying the file.

# 5.5.3 2022-7-2

- Support cancel import and dump data.
- Support for save connections without connected.
- Support show mongodb, elasticsearch object count.
- Fix:
  - Fixed dump structure still dumping data.
  - Fixed the ssh terminal not entering the path.
  - Fixed failure to parse redis command results.
  - Fixed postgresql unable to import/dump data with non-public schema.

# 5.5.2 2022-6-29

- Implement SQL notebook.
- Remember the chosen export path and import path.
- Fix:
  - Fixed sftp directory showing server name.
  - Fixed the selected ssh key cannot be displayed in some cases.

# 5.5.1 2022-6-29

- Upgrade sql formatter version.
- Fix:
  - Fixed show 达梦 view DDL fail.
  - Fixed unable to show oracle view DDL.
  - Fixed sqlite not parsing backslash correctly.]\
  - Fixed unable to edit SSH connections created by older versions.

# 5.5.0 2022-6-28

- Query file to add connection status.
- Show connection status in query file.
- Support choose ftp encoding on connect view.
- Do not toggle editor layout when has active query page.
- Fix:
  - Fixed some query files do not generate bind connection comment.
  - Fixed unparseable \\" strings

# 5.4.8 2022-6-24

- Remove like from clickhouse dialect.
- Support bind connection in SQL files.
- Support gbk encoded ftp connection.
- Support run sql without actived the tree panel.
- Supports dumping mysql and postgresql tables through multiple selections.
- ElasticSearch
  - Ignore comments in request body when running query.
  - Provide completion for search API.
- Fix:
  - Fixed ftp wrong folder icon.
  - Fixed detection SQL block failure when string in SQL has quotes.

# 5.4.6 2022-6-21

- Supports send elasticsearch query with any request body.
- Fix can't automatically switch active connections.

# 5.4.5 2022-6-20

- Do not restore expand state of connection after start vscode by default.
- Support to restore sql active state after vscode restart.
- Support for opening an inactive connection terminal through ssh tunnel.
- Fix:
  - Fixed connection stuck after executing failed SQL.
  - Fixed unable to display the cost time of running failed SQL.
  - Fixed create ssh connection can't automatically select private key.

# 5.4.4 2022-6-19

- Support for parsing SQL with backslash.
- Support paths with special characters when export/import mysql sql.
- Fixed unable to display sftp hidden files.

# 5.4.2 2022-6-16

- Add more mysql data type highlight.
- Use better names for ssh tunneled connections.
- Support connect to ssh server by ssh tunnel.
- MongoDB:

  - Fixed can't use filter.
  - Support show columns and index of collection.
- ElasticSearch:

  - Don't reload data after update date.
  - Fixed can't use filter.
- 达梦:

  - Fixed the result cannot be rendered when the data has bigInt or text stream.
  - Fixed cannot show view,procedure, function ddl.
  - Support show package.
- Fix:

  - Fixed console interface being cluttered on small resolutions.
  - Fixed the data cannot be updated after the filter is turned on.
  - Fixed wrong insert SQL being generated by copy row.
  - Fixed unable to dump data using built-in dump.

# 5.4.1 2022-6-13

- Support dump/restore redis data by ndjson.
- SSH:
  - Show ssh server system name after active.
  - Support connect to ssh server by private key and password.
- Treeview:
  - Update folder icon.
  - Support change group node sorting by drag.

# 5.4.0 2022-6-8

- Support connect to custom jdbc server.
- Tree View:

  - Fixed cannot change nosql connection sort by drag.
  - Automatically collapse invalid connections.
  - Fetch server version after connection active.
- Result view:

  - Update selected SQL background color on result view.
  - Support for modifying table data with unicode names.
  - Fix the failure to terminate running SQL in some cases.
- SSH:

  - Block ctrl+pageHome and ctrl+pageDown in the ssh terminal.
  - Using terminal.integrated.fontFamily as terminal font family.
- Redis:

  - Fix loading key fails when the number of clusters is odd.
  - Cache keys to improve performance.
  - Support connect to cluster by ssh tunnel.
- Oracle:

  - Support show table rows count.
  - Support show table comment.
  - Better support pl/sql detect.
- MongoDb:

  - Sort collection in tree view
  - Show date type as better format.
  - Support for displaying dynamic documents.
  - Support show column type.

# 5.3.9 2022-6-4

- Upgrade sqlite3 for windows version.
- Support read sqlite3 resource file .sqliterc.

# 5.3.8 2022-6-2

- Tree view:
  - Support show node child count.
  - Add trigger group to table node.
  - Reload after reset options.
  - Support drop oracle package.
- Support change column notNull, auto_increment directly on design table.
- Kill connection after connect timeout.
- Support show pg_catalog tables ddl without prefix.
- Fixed:
  - Fixed no reload columns after add column on design table.
  - Fixed paging failure after data exceeds the limit.

# 5.3.7 2022-5-29

- Support show oracle package source.
- Sort stored procedures, functions for all types of databases.
- Improve the security of configuration synchronization.
- Fixed delete row no quote primary key value.

# 5.3.6 2022-5-28

- Support show approximate count for table of postgresql.
- Save execute state even change active editor.
- Result view:
  - Limit input length on edit dialog.
  - Better cost time format and real-time display.
  - Support delete row with multiple primary key.
  - Support disable fetch columns when open table.
  - Fixed update not working after modify primary key value.
  - Fixed cannot delete after select all.

# 5.3.5 2022-5-26

- Fixed dialog not closing properly after save.

# 5.3.4 2022-5-26

- Support open oracle terminal by sqlplus.
- Result view:
  - Add option to escaped all object name.
  - Fix load columns fail when change active connection.
  - Supports edit row without primary keys by opening the edit dialog.
  - Do not refresh data after modifying data.
- Fix:
  - Fixed count was called at the wrong time for neo4j.

# 5.3.2 2022-5-23

- Support copy connection.
- Result:
  - Live preview for insert/edit data.
  - Record execute SQL history(By ctrl+up/download).
  - Add open new panel to NoSQL connection.
  - Pin/unpin result view after click unlock/lock.

# 5.3.1 2022-5-21

- Record history per connection, database and schema.
- Support show DDL cross schema or database.
- Result view:
  - Limit the maximum number of results page loads to 1000.
  - Better sort interaction on result view.
  - Set reasonable editor focus when displaying SQL results.
- Oracle:
  - Support completion cross schema.
  - Fixed change active connection to oracle fail.
  - Fixed cannel executing sql fail.
- Redis:
  - Support dump redis folder.
  - Speed up page open.
  - Add menu of dump data to redis connection.
  - Fixed opening terminal affecting tree view.
  - Fixed the highlight disappearing when switching different types of keys.
  - Fixed ttl seconds being set to milliseconds when restoring dump files.

# 5.3.0 2022-5-18

- Better support for **neo4j**.
- Speed up the loading of large data for **redis**.
- Support **case insensitivity** to provided completions.
- Optimize the **performance** for ftp view operations.
- Fix:
  - Fixed sql server cannot load system table columns.
  - Fixed generate document failed for postgreSQL.
  - Fix the error message cannot be displayed after hiding the toolbar.

# 5.2.9 2022-5-15

- Support sync file to ftp server.
- Tree UI:

  - Optimize some UI experience.
  - Supports configuring timeout for all connection.
  - Fixed incorrect connection configuration causing the view to freeze.
  - postgresql supports viewing the source code of overloaded functions and procedures.

# 5.2.8 2022-5-13

- Support change connection sorting by drag.
- Parse postgreSQL float as string.
- Oracle:
  - Support batch execute SQL.
  - Support connect by custom jdbc url.
  - Fixed not being able to switch to lowercase schema.
- Neo4j:
  - Support view all relations.
  - Better support for pagination.
  - Support query node event label with keyword.
  - Add inline icon to create query file for nodes and relationships.

# 5.2.7 2022-5-11

- Result View:
  - Hide filter switch.
  - Fix show empty string fail.
  - Support select multiple rows by press shift key and check box.
- Support batch upload and download sftp files.
- Show table ddl supports showing foreign keys of postgresql.

# 5.2.5 2022-5-10

- Support show foreign keys for postgresql, oracle, sqlite.
- Support import external data to elasticsearch and mongodb.
- Better table DDL generator.
- Result View:
  - Clear result view after execute other sql.
  - Show magnifying glass only on multiple lines of text.
  - Add save button to save data modify.
  - Correctly display post-operation SQL.
  - Support pagination for oracle and sql server.
- Fix:
  - Fixed cannot save by command+s.
  - Fixed select showed dbs cannot be cancel.
  - Fixed loss of editing effects after view scrolling
  - Fixed executing paginated SQL not paging correctly.
  - Fixed show sqlite null column fail.
  - Fixed duplicate actions performed when the view is first created.
  - Fixed mongodb update fail on edit dialog.
  - Fixed elasticsearch delete data fail.

# 5.2.4 2022-4-29

- Enhance SQL Formatter.
- Show non-nullable column in red.
- Exporting excel will come with query sql.
- Fix show data count fail if sql contain line separator.

# 5.2.2 2022-4-27

- new:
  - Support parse sql parameter.
  - Support selecting the schema to display.
  - Support connect to clickhouse by https protocol.
- enhance:
  - Provides better completion based on database type.
  - SQL Codelen support parse function and procedure.
  - Support completion when editing procedure, function and view statement.
- fix:
  - Fixed running status not updating after editing SQL.
  - fix database cannot be drop for postgresql.
  - Fix mysql8 display index failure.
  - Fix panel not focus after create connection.

# 5.2.1 2022-4-25

- new:
  - Support connect to redshift.
  - Support show table index on tree view.
- enhance:
  - Better mysql icon.
  - Better support for oracle.
  - Support completion of hidden object.
  - Better SQL highlighting in the result view.
- Fixed the high version of mysql to import SQL failed.

# 5.2.0 2022-4-21

- Support connect to oracle.
- Improve table loading performance.

# 5.1.7 2022-4-19

- new:
  - Support change connection group by drag.
  - Support for selecting databases to display.
  - Support don't save password for premium user.
  - Support import xlsx, csv, json, xlsx for premium user.
- update:
  - Support config the number of keys loaded by Redis scan.
- Fix:
  - Fix loading database infinite times.
  - Fix can't completion cross schema.
  - Fixed unable to drop tables with keywords.
  - Fixed not being able to modify table data when database panel is not active.

# 5.1.6 2022-4-12

- new:
  - Add configuration for new panel button display, default is false.
  - Add new column button next to table and column node.
  - Support edit set and zet value for redis.
- Fix:
  - Fix change active db fail.
  - Fix loss auto_increment,charset after update for mysql.
  - Fix show payment instructions when hover sql.
  - Fix mssql non-default schema mock data failure.
  - Fix 达梦 can't change schema.

# 5.1.0 2022-4-10

- new:
  - Show execute status on editor panel.
  - Support show table ddl by "go to definition", premium only.
- Keep showed database as database on connect view.
- fix:
  - Fix the failure of parsing sqlite and postgresql to execute multiple sql.
  - Fix the failure of mariadb backup and open terminal.
- Result view:
  - Support hide SQL panel and toolbar, premium only.
  - Fix completion for table fail.

# 5.0.8 2022-4-4

- Auto format json value for redis string.
- Compatible with dark theme for redis string.

# 5.0.7 2022-4-3

- Better inner document.
- Remote development:
  - Fix github login on remote fail.
  - Fix open document fail.
  - Fix server icon gone on connect view.

# 5.0.6 2022-4-2

- Do not open terminal in editor group when file is autosaved
- Supports code completion with commas.
- Clear old data when create table template.

# 5.0.4 2022-4-1

- new:

  - Add welcome button.
  - Redesign redis integrate terminal.
  - Support show table and column comment on completion.
- update:

  - Update connection container icon.
  - Update table complete icon on completion.
  - Support change on detail dialog.
  - Better support for jsonb type of postgres.
  - Migrate terminal to editor group.
  - Update integrate document.
- Fix:

  - Fix save configuration fail after clearing the configuration.
  - Fix conflict sftp same name with different server.

# 5.0.2 2022-3-30

- Support completion on result view.
- update:
  - Reject modify SQL for read-only connection.
  - Better design for connect view.
- fix:
  - Fix column meta gone after change position.
- option:
  - Open basic options for free.
  - Don't save connection collapseState option.
  - Don't execute sql of current cursor option.
- SFTP
  - Support show not hidden file for free.
  - Support remove not empty folder.
  - Support synchronous modification of the same file name.

# 5.0.0 2022-3-27

- Better design for connect, result, design, redis and console view.
- New:
  - Highlight active SQL and preview SQL.
  - Add validator for insert dialog.
  - Bind shortcut for mac cmd key.
  - Support dump and restore redis.
- Update
  - Update document theme to dark.
  - Add keyword completion for alter sql.
  - Order procedure and function for mysql.
  - Don't switch editor layouts when there are multiple editors.
- Redis:
  - Fix legacy bugs.
  - Support view stream data.
  - Fix redis ttl lose when update.
  - Redis terminal support get error message.
  - Reload nosql panel after delete redis key on redis view.
- SSH:
  - Fix duplicated paste when using ssh terminal on mac os.
  - Fix forward port fail.

# 4.8.7 2022-3-24

- Support batch delete table.
- Support configure which keys trigger completion.
- Fixed can't insert data when table has no primary key.
- Better SQL template.
- Keep previous content when generate SQL template.
- Support show neo4j  all nodes.
- Better support for clickhouse
  - Support show table primaryKey, comment.
  - Support mock data.

# 4.8.6 2022-3-19

- new:
  - Focus panel when connect to server.
  - Setting connection sorting rule.
  - Connect to graph database neo4j.
- change:
  - Update full result view icon.
  - Improve redis performance.
  - Remove editing focus when scroll result view.
  - Support clickhouse and 达梦 open terminal
- Fix
  - Connection no close when update connection info.
  - Check free account limit incorrectly.
  - Fix SQL Server column can not display results when column is empty.
  - FTP Server icon not show.

# 4.8.5 2022-3-17

- Update toolbar icons.
- Fix order by column fail.
- Sort es indexes.

# 4.8.3 2022-3-15

- Fix login by github oauth fail.
- New:
  - Support grouping connection(对连接进行分组).
  - Speed up data loading.
  - Support setting connection is read only.
  - Auto read private key when using ssh.
  - Support using code action to show table source or view table data.
  - Support kill running execute.
- Update:
  - Edit connect always open new view.
  - Filter menu add is null condition.
  - Update connection document, and add change log to nav bar.
- Fix:
  - Data is not displayed correctly when a query has duplicate column names(当查询有重复列名显示不正确的问题).
  - Sqlite and sql server completion fail.
  - Columns containing keywords are not quoted when exporting sql.

# 4.8.0 2022-3-12

- New:
  - Support connect to "达梦" database.
  - Add refresh columns cache button of table node.
- Update:
  - Support using command+s to save new row.
  - Save result view filter state.
  - Always open new connect view when click connect button, and update icon when connect success.
  - Better filter context menu on result view.
  - Rollback ssh terminal icon.
  - Update some document.
  - 提高中国用户访问速度

# 4.7.8 2022-3-10

- Fix ssh terminal triggering copy without text selection.
- Support detect elasticsearch connection state.

# 4.7.7 2022-3-9

- new:
  - Premium user support cloud config sync.
  - Add usage documents.
- update:
  - Better ssh terminal view.
- fix:
  - Sometime ssh tunnel can not be reconnected after disconnection.
  - Edit connection lose private key path.
- limit:
  - free account not allow using workspace connection and close connection.

# 4.7.5 2022-3-5

- new:

  - Login by github oauth.
  - Change option, export and import config on console view.
  - Connection configuration support completion.
- Fix create workspace connection fail on remote ssh.
- Fix show postgresql jsonb fail.

# 4.7.4 2022-3-3

- Better toolbar design on result view.
- Better design for connect view.
- Fix record sql history fail.

# 4.7.3 2022-3-1

- Better design for result view.
- Support completion on postgresql database query file.
- Fix open postgresql terminal fail.

# 4.7.0 2022-2-26

- Access to the paid system, now the free use connection and some function(export, ftp) will be limited.
- new:

  - Support connect to ftp server.
  - Better design for message notice.
  - Support insert data by dialog.
- Enhance:

  - Detection of columns containing keywords.
  - Get result lock state when open result view.
  - Mock data config support remove unnecessary columns.
- fix:

  - Design table not check keyword and not refresh column cache.
  - Old version connection refresh not work.
  - Create ssh tunnel fail when has multiple ssh tunnel.
  - SFTP copy path fail.
  - Count sql did not remove group by clause.
  - Result view filter multi column fail.

# 4.6.0 2022-2-16

- Better completion for columns.
- Support lock and unlock result view.
- Fix sql message not hidden correctly.
- Support connect to clickhouse by connection url.
- Fix mongo delete db fail.
- Add more keyword detect for auto wrapper quote.

# 4.5.7 2022-2-6

- Support connect to redis with username.
- Auto scroll redis terminal.
- Copy ssh host if using ssh.
- Fix open es query not active connection [#450](https://github.com/cweijan/vscode-database-client/issues/450).
- Better query file for table.

# 4.5.2 2022-1-21

- Add more error tolerance when connecting.
- Support show redis server version.
- Redis string key view support responsive.
- Fix join result causing the editor to disappear.
- Support special sftp root path.
- Remove ftp support.
- Hide ssh passphrase.
- SSH terminal add padding.
- Fix sqlite show name error.
- Fix sqlite completion fail.
- Other bugs fix.

# 4.5.0 2022-1-7

- Support connect to clickhouse.
- Show results in vertical direction.
- Using new empty row instead of dialog for insert data.
- Fix join result view and editor fail.
- Fix completion fail when has as keyword.

# 4.4.0 2021-12-30

- Update extension logo.
- Do not set the default statement timeout.

# 4.3.6 2021-12-25

- Update connect and result view some style.
- Redis show key count.
- Refresh column cache when click table.
- Import sql support multiple files.
- Sort mysql database name by alphabet.
- Change mysql column position add confirm.

# 4.3.5 2021-12-11

- Support delete multi redis key.
- Fix mysqldump8 dump mysql5.7 server fail.
- Fix completion fail when hidden procedure group.

# 4.3.1 2021-12-1

- Reduce mysql table info description.
- Reduce ssh connection description.
- Fix parse jsonb error [#381](https://github.com/cweijan/vscode-database-client/issues/381).
- Fix redis change page size not work.

# 4.3.0 2021-11-29

- Improve tree view render performance.
- Update active connection icon.
- Support show redis database.
- Better result view design.
- Fix table columns completion fail.
- Fix not show call procedure result.
- Fix using ssh private key open terminal fail.
- Fix redis cluster load key fail.

# 4.2.3 2021-11-24

- Upgrade ssh2 version, now support more ssh private key format.
- Support connect postgresql and mysql by connectionUrl.
- Show postgresql and mysql version on panel.
- Fix result view not work on remote development.
- Fix postgresql not reload data when execute DML.

# 4.2.1 2021-11-22

- Using pg_dump to dump postgreSQL.
- Fix es load index fail.
- Fix socket path gone [#364](https://github.com/cweijan/vscode-database-client/issues/364).
- Always open new ssh terminal and enhance key event dispatch.
- Supports running in offline environment.
- Fix filter operation error.

# 4.2.0 2021-11-15

- Remove export file default path.

# 4.1.9 2021-11-11

- Using scan command instead keys for redis.
- Result and ssh terminal view font style follow vscode setting.
- Result view add sql preview feature.
- Better support for singe quote [#341](https://github.com/cweijan/vscode-database-client/issues/341).

# 4.1.8 2021-10-29

- Better support for sqlite.
- Paste as plain text when edit on result view.
- Change filter operation from = to like.
- Support change default value for mysql [#317](https://github.com/cweijan/vscode-database-client/issues/317).
- Change default dump url is workspace [#293](https://github.com/cweijan/vscode-database-client/issues/293).
- Add more chinese support on web view.

# 4.1.7 2021-10-8

- Ignore ElasticSearch ssl certificate check.
- Fix show error column type on result view.
- Support config ssh connect timeout.
- Update result view filter color.
- Ftp node add refresh button.

# 4.1.6 2021-9-18

- Improve security, config.json will auto delete when close.
- Update some button border and icon.
- Add shortcut to run ElasticSearch query.
- Fix run postgresql explain sql fail.
- Fix show duplicate column nodes when have more constraint.
- Fix generate postgresql mock data fail.

# 4.1.5 2021-9-12

- Add pagination to view redis value with big data.
- Improve sql completion.
- Mongodb support sort by column.
- Change default export path as workspace.

# 4.1.3 2021-9-6

- Reduce ram usage for webview cache.

# 4.1.2 2021-8-29

- Better redis view.

# 4.1.0 2021-8-15

- Support connect to redis cluster, [#242](https://github.com/cweijan/vscode-database-client/issues/242).
- Better result view .
- Export csv with header, [#273](https://github.com/cweijan/vscode-database-client/issues/273).
- Fix result view loading state gone.
- Fix codelen check delimiter fail.
- Fix mysql8 cannot show index.

# 4.0.5 2021-8-13

- Strut sync remove disable connection.
- Fix auto complete fail on SQL file.
- Support close ssh connection.
- Fix result view border not fit for theme.`activeDocument`
- Fix untitled document cannot split.

# 4.0.0 2021-8-7

- Support multiple result view.
- Fix conflict with other extension.
- Fix result view show vertical scrollbar.
- Fix connect and result view legacy bugs.
- Remove native ssh from connect view.

# 3.9.9 2021-8-2

- Fix hover query table action not work.

# 3.9.8 2021-7-27

- Support special ssl ca certificate.
- Hover info add action to query table data.
- Fix completion bug.
- ElasticSearch support connect with token or account.
- Support connect by native ssh command.
- Fix open structure sync fail.

# 3.9.6 2021-7-22

- Add hover to run selected sql.
- Add sql template action icon to table node.

# 3.9.5 2021-7-19

- Using mysqldump to dump database.
- Fix connect to elasticsearch using ssh tunnel fail.
- Better postgresql support.

# 3.9.3 2021-7-2

- Better sql completion.
- Fix multi line space ignored.

# 3.9.2 2021-6-24

- Enhance sql detect.
- Update run query shortcut.
- Keep query file content.
- Create SQL document outline.

# 3.9.0 2021-6-22

- Support edit connection config.
- Isolate the configuration of vscode and ssh-remote.
- Support load data when load timeout.
- Support install sqlite3 from connect page.
- Better change active database item.
- Fix vscode shortcut not working on ssh terminal.
- Fix mongo export data fail.
- Update some ui.

# 3.8.9 2021-6-16

- Add shortcut of run sql on result view(ctrl+enter).
- Support generate database document.
- Fix bugs.

# 3.8.8 2021-6-11

- Fix date incorrect of sqlserver [#199](https://github.com/cweijan/vscode-database-client/issues/199).
- Prefer using connection name [#215](https://github.com/cweijan/vscode-database-client/issues/215).
- Postgresql query with quote [#217](https://github.com/cweijan/vscode-database-client/issues/217).
- Fix export occur undefined [#218](https://github.com/cweijan/vscode-database-client/issues/218).

# 3.8.7 2021-6-8

- Update toolbar style.
- Fix trigger template error.
- Support using sqlite3 from path.

# 3.8.6 2021-6-3

- Support connect redis with ssl.
- Fix parse empty string or zero as null on result.

# 3.8.3 2021-5-18

- Support connect to MongoDB.
- Fix postgresql duplicate tables.

# 3.8.2 2021-5-15

- Connection keep origin position when edit.
- Support export SQLite data and structure.
- Fix possible connection delete bug.

# 3.8.0 2021-5-14

- Support sqlite.
- SSH support download folder.

# 3.7.6 2021-5-12

- Update ui operation icon.
- Set ssh terminal as full height.
- Support open mysql and postgresql terminal.
- Fix some legacy bugs.

# 3.7.4 2021-5-11

- Support config ssl connection.
- Update ui operation icon.
- Better sql server support.
- Fix sqlserver cannot edit.
- Fix sqlserver show object source fail.

# 3.7.3 2021-5-9

- Compatible icon with version 1.56.0 of vscode.
- Fix include database not work.

# 3.7.2 2021-5-8

- Add cost time to result view.
- Fix ssh connection private key not persist.
- Result show column type.

# 3.7.0 2021-5-7

- Fix structure sync open fail.
- Mssql add  windows auth option.
- Fix first data load fail.
- Trigger refresh when create object.
- Add run all sql command.
- Format postgresql timestamp show like pgadmin4.

# 3.6.9 2021-4-28

- Support show multi DML execute result.
- Result view select column without '*'.
- Disable retry.
- Fix filter trigger save on result view.
- Update donate button style.

# 3.6.7 2021-4-2

- Postgresql support config ssl enable option.
- Support delimiter on codelen.
- Change ElasticSearch connect host:port to url.

# 3.6.5 2021-3-29

- Support connect to ftp server.
- Support delete ssh connection.
- Support show procedure one result.
- Fix bugs.

# 3.6.0 2021-3-11

- Support connect to database server without exists connection.
- Support connect to ssh server.
- Implement some ui feature of postgresql.

# 3.5.6 2021-3-7

- Redis Support add、delete of list、set、hash

# 3.5.5 2021-3-5

- Redis terminal support show some command.

# 3.5.3 2021-2-24

- SqlServer support change Port.
- Fix postgresql import sql fail.
- Sort table by name.

# 3.5.2 2021-2-5

- Fix treeview not refresh when drop node.
- Result view update and get better update interactive.

# 3.5.0 2021-2-3

- Result View :
  - Adapt scroll bar when height change.
  - Move full button position.
  - Split only when run from editor
  - Fix elasticSearch query error message not showed
- Tree Ui :
  - Support hide userNode, viewNode.
  - Add some node info as tooltip.
  - Reduce connection name.
  - Support remember workspace connection status.
- Support sql intellisense cross schema.
- Update server status view.
- Support show postgresql, sqlserver schemas.

# 3.4.4 2021-1-29

- Support schema with postgresql、sqlserver.
- Design table view update.
- Add ui config
- Support config  connection timeout.

# 3.4.3 2021-1-28

- Fix new table panel cannot execute sql.
- Speed up data dump and support sqlserver、postgresql.
- Support disable sql code lens.
- Support connect to mssql with encrypt disabled.

# 3.3.4 2021-1-27

- Fix 3.3.1 add connection fail.
- Trim legacy code, better performance right now.
- Add full result view icon.

# 3.3.1 2021-1-26

- More implement or table design.

# 3.3.0 2021-1-26

- Support close connection.
- Add snippet to sql editor.
- compatible with old vscode version.
- Fix code len detect comment as sql.
- Add context menu to result view.
- Add more chinese content.
- Init design table.

# 3.2.2 2021/1/25

- Fix redis folder Infinite recursion load bug.
- Add GUI of index manager view.
- Implement database structure sync feature.
- Enhance intellisense sql.

# 3.2.1 2021/1/23

- Resign connect page.
- Add sql code lens.

# 3.2.0 2020/1/20

- Migrate elasticsearch node to nosql explorer.
- Support connect to redis server.

# 3.1.0 2021/1/17

- Support connect to elasticsearch.

# 3.0.0 2021/1/13

- Support connect to postgresql and sqlserver.
- Reduce resource consumption.
- Fix cannot edit json column data.

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

- Result view theme follow vscode theme.

## 2.6.0 - 2020/10/20

- Support config connection per workspace.
- Hide error messages.

## 2.5.7 - 2020/9/21

- Refactor export panel.

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

- Enhance dashboard.
- Highlight active database.
- Support open table in new panel.

## 1.9.6 (2020/5/1)

- Fix bugs.

## 1.9.0 - 2020/4/28

- Support SSH tunnel.
- Show comment of column、table on tree view.
- Support export table structure.

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
- Remember sql history for database
- Ui improve

## 1.7.1 - 2020/4/11

- Support sort、filter in result page.
- Enhance sql intelliCode.

## 1.7.0 - 2020/4/10

- Support Insert,Update,Delete in result page.
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

- Split sql with semicolon on editor.
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

## 1.4.5 - 2019/4/30

- Add database meta cache.

## 1.4.0 - 2019/3/18

- Officially refactored project by @cweijan.
- Add sql intelligent prompt, SQL statement template, click on the data table to query directly.

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
* [#2](https://github.com/formulahendry/vscode-mysql/issues/2): Add option to set maximum table count, and increase the default count

## 0.0.1 (2017-11-22)

* Initial Release
