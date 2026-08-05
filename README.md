# Database Client

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client2">
    <img src="https://img.shields.io/vscode-marketplace/v/cweijan.vscode-mysql-client2.svg?label=vscode%20marketplace">
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=cweijan.vscode-mysql-client2">
    <img src="https://img.shields.io/vscode-marketplace/r/cweijan.vscode-mysql-client2.svg">
  </a>
  <a href="https://github.com/cweijan/vscode-database-client">
    <img src="https://img.shields.io/github/stars/cweijan/vscode-database-client?logo=github&style=flat">
  </a>
</p>

<br>

All-in-one database management extension for Visual Studio Code. Connect to SQL and NoSQL databases, browse and edit data, run queries with IntelliSense, manage SSH servers, Docker, and remote files — without leaving the editor.

> Website: [database-client.com](https://database-client.com/) · Docs: [https://database-client.com/docs](https://database-client.com/docs)

[![Logo](https://doc.database-client.com/public/logo.png)](https://database-client.com)

## Telemetry

The extension collects anonymous usage data to help improve the product. Read the [Privacy Policy](https://database-client.com/#/privacyPolicy) for details.

Telemetry follows VS Code's [telemetry settings](https://code.visualstudio.com/docs/getstarted/telemetry). You can also disable it independently:

```json
"database-client.telemetry.usesOnlineServices": false
```

## Getting Started

### Connect

1. Open the **Database** panel in the sidebar.
2. Click the `+` button.
3. Select a service type, fill in the connection details, and click **Connect**.

![connection](https://doc.database-client.com/images/connection.jpg)

Connections support SSH tunnel, SSL/TLS, SOCKS proxy, and HTTP auth where applicable.

### Browse Tables

1. Click a table to open the table view.
2. Click the button beside a table to open it in a new tab.
3. Edit data directly in the grid.

![query](https://doc.database-client.com/images/view.png)

Use the search box next to **Tables** to filter objects in the explorer.

### Execute SQL

Click **Open Query** on a connection to open a SQL editor bound to that database.

![newquery](https://doc.database-client.com/images/newquery.jpg)

The editor provides:

- SQL IntelliSense and auto-completion
- Snippets: `sel`, `del`, `ins`, `upd`, `joi`, etc.
- **Run current/selected SQL** — `Ctrl+Enter` / `Cmd+Enter`
- **Run all SQL** — `Ctrl+Shift+Enter` / `Cmd+Shift+Enter`
- **Run in new panel** — `Ctrl+Alt+Enter` / `Cmd+Ctrl+Enter`

![run](https://doc.database-client.com/images/run.jpg)

### Cache

Database metadata is cached for performance. If the schema changes externally, click the **Refresh** button on the connection to update.

![](https://doc.database-client.com/image/connection/1638342622208.png)

### Backup & Import

Right-click any database or table node to access **Export** and **Import** options.

For MySQL and PostgreSQL, adding `mysqldump` or `pg_dump` to your `PATH` enables native backup tools.

![backup](https://doc.database-client.com/images/Backup.jpg)

### SSH & Port Forwarding

Connect to an SSH server to access the terminal, browse remote files, and set up port forwarding for tunneling database connections.

### Mock Data

Generate test data from table templates or `mock.json` files. Press `Ctrl+Enter` / `Cmd+Enter` in a mock file to run.

![mockData](https://doc.database-client.com/image/minor/mockData.jpg)

### Query History

Click the history button in the SQL editor toolbar to view recently executed queries.

## Settings

Open VS Code Settings and search for `database-client` to configure SQL behavior, result layout, telemetry, and more.

Common options:

| Setting                                           | Description                               |
| ------------------------------------------------- | ----------------------------------------- |
| `database-client.defaultSelectLimit`            | Default row limit for SELECT queries      |
| `database-client.confirmWhenUpdateWithoutWhere` | Warn before UPDATE/DELETE without WHERE   |
| `database-client.autoPagingSQL`                 | Auto-paginate large result sets           |
| `database-client.enableSQLVariable`             | Enable`${variable}` substitution in SQL |
| `database-client.splitEditorWhenQuery`          | Open results in a split editor            |

## Development

### Prerequisites

- Node.js 20+
- [Yarn](https://yarnpkg.com/)

### Build

```bash
yarn install
yarn dev      # watch mode for development
yarn build    # production build to out/
yarn lint     # type check
```

Press `F5` in VS Code to launch the Extension Development Host.

### Package

```bash
yarn repackage  # build and create .vsix
```

## Credits

- [ssh2](https://github.com/mscdex/ssh2) — SSH client
- [sql-formatter](https://github.com/zeroturnaround/sql-formatter) — SQL formatting
- Client libraries:
  - [@cweijan/mysql2](https://github.com/sidorares/node-mysql2) — MySQL
  - [pg](https://github.com/brianc/node-postgres) — PostgreSQL
  - [tedious](https://github.com/tediousjs/tedious) — SQL Server
  - [ioredis](https://github.com/luin/ioredis) — Redis
  - [mongodb](https://github.com/mongodb/node-mongodb-native) — MongoDB
  - [kafkajs](https://github.com/tulios/kafkajs) — Kafka
  - [neo4j-driver](https://github.com/neo4j/neo4j-javascript-driver) — Neo4j
  - [snowflake-sdk](https://github.com/snowflakedb/snowflake-connector-nodejs) — Snowflake
  - [vscode-sqlite](https://github.com/AlexCovizzi/vscode-sqlite) — SQLite client code reference
