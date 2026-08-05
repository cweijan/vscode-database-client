## ADDED Requirements

### Requirement: Core extension behavior SHALL be owned by readable source modules

The extension backend SHALL implement its entry point, services, models, dialects, commands, and Providers in named TypeScript modules with explicit imports and exports. No migrated core capability SHALL require parsing or editing the generated monolithic bundle.

#### Scenario: Core module can be changed independently

- **WHEN** a core service or database model is modified in its source module
- **THEN** type checking and the production build SHALL consume that module directly without manual edits to `out/extension.js`

### Requirement: Database adapters SHALL preserve dialect-specific semantics

Each supported database adapter SHALL expose typed operations for connection, metadata, query execution, pagination, DDL, and result conversion where supported. Unsupported operations SHALL be explicit rather than silently falling back to another dialect.

#### Scenario: Dialect-specific metadata operation

- **WHEN** a tree node requests metadata for a supported database type
- **THEN** the corresponding dialect adapter SHALL generate the target-compatible operation and normalize its result into the shared model type

### Requirement: Connection and service lifecycles SHALL be explicit

Source modules SHALL manage connection creation, cancellation, resource cleanup, errors, and long-running terminal or remote operations through explicit service boundaries. Shared state SHALL have a typed owner and SHALL not rely on bundle-generated globals.

#### Scenario: Cancelled database operation

- **WHEN** a user cancels an in-flight query or metadata request
- **THEN** the source service SHALL stop or detach the operation, release owned resources, and report a controlled cancellation result without corrupting the active connection state

### Requirement: Tree models, commands, and Providers SHALL remain composable

Database tree nodes and groups SHALL expose stable context values and typed parent/child relationships so commands, menus, filtering, pagination, and Providers can be composed without depending on minified variable names.

#### Scenario: Filtered tree refresh

- **WHEN** a user filters and refreshes a database object group
- **THEN** the source model SHALL apply the filter to the refreshed children, preserve ordering and context values, and expose the same command targets as the target activity version

### Requirement: Core source coverage SHALL be tracked against the target module inventory

Every target product-code source marker included in the core slice SHALL map to a source module, an intentional replacement, or an explicitly recorded deferred item. Third-party bundle markers SHALL be tracked separately from product modules.

#### Scenario: Core inventory review

- **WHEN** the core slice is marked complete
- **THEN** its mapping report SHALL contain no unclassified product module and SHALL identify any deferred module with an owner and validation plan
