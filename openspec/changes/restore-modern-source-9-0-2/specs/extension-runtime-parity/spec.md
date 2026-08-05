## ADDED Requirements

### Requirement: The restored source SHALL preserve the extension manifest contract

The source build SHALL preserve the target version's activation behavior, extension entry path, command IDs, view IDs, view containers, settings keys, language and Grammar identifiers, custom editor types, and language-model tool names unless an explicit compatibility decision is recorded.

#### Scenario: Manifest surface comparison

- **WHEN** the generated package manifest is compared with the 9.0.2 activity manifest
- **THEN** every required identifier and entry point SHALL be present with equivalent activation and contribution behavior

### Requirement: The restored source SHALL close its runtime resource graph

The generated package SHALL include every resource, syntax file, Webview asset, protocol file, runtime adapter, and local dependency required by the manifest and source code. No package entry SHALL point to an absent file.

#### Scenario: Package reference validation

- **WHEN** package paths and Webview references are resolved from a clean build output
- **THEN** all referenced files SHALL exist and the extension entry SHALL be loadable by the VS Code extension host

### Requirement: The restored source SHALL preserve extension activation and state boundaries

Activation SHALL initialize the extension context, resource paths, configuration, services, and persisted user state without changing the existing user data directory or silently resetting stored connections and preferences.

#### Scenario: Existing user data is opened after upgrade

- **WHEN** the modern source is activated with an existing `.dbclient` data directory
- **THEN** existing connections, preferences, history, and expanded-state data SHALL remain readable under the same compatibility keys

### Requirement: Oracle synonym support SHALL remain available

The modern source SHALL preserve the active Oracle synonym behavior, including synonym metadata discovery, owner/public resolution, tree representation, table/column lookup against the resolved object, filtering, pagination, and DDL preview/export semantics evidenced by the target activity bundle.

#### Scenario: Oracle synonym resolves to a table

- **WHEN** an Oracle schema exposes a private or PUBLIC synonym for a table and the tree refreshes
- **THEN** the synonym SHALL be listed with its owner and target, and querying or showing DDL SHALL use the resolved target object

### Requirement: User-visible database capability behavior SHALL remain compatible

Database connection, query, metadata, import/export, terminal, remote-file, and database-specific command behavior SHALL remain compatible with the target activity surface; modernization SHALL not change SQL dialect semantics without a separately recorded requirement.

#### Scenario: Existing command ID remains callable

- **WHEN** a command contributed by the target manifest is invoked in the modern extension
- **THEN** the corresponding source command handler SHALL run with equivalent input, cancellation, error, and result behavior
