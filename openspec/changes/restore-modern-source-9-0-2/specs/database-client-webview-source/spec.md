## ADDED Requirements

### Requirement: Webview pages SHALL have maintainable Vue source entries

Each migrated Webview page SHALL have a readable Vue source entry, component structure, styles, and asset references that generate the target-compatible Webview entry graph. Generated chunks SHALL be build outputs, not the only implementation source.

#### Scenario: Webview page production build

- **WHEN** a migrated page is built in production mode
- **THEN** its entry, styles, dynamic chunks, and local assets SHALL be emitted and referenced by the generated HTML without missing files

### Requirement: Extension-to-Webview messaging SHALL remain compatible

Webview source SHALL preserve the target message names, payload boundaries, initialization/state handshake, error reporting, and extension command routing required by the corresponding backend handlers.

#### Scenario: Webview initialization handshake

- **WHEN** a Webview opens or becomes visible
- **THEN** it SHALL receive the expected configuration and persisted state, establish the message handler, and render without requiring a full extension restart

### Requirement: Query, result, design, terminal, and editor flows SHALL remain functional

The modern Webview source SHALL cover the target activity pages and their core flows, including connection forms, query execution, result viewing/editing/export, design/structure operations, SSH terminal behavior, database-file and Parquet editors, and shared loading/error states where present in the target manifest.

#### Scenario: Query result flow

- **WHEN** a user executes a query from a migrated SQL page
- **THEN** the page SHALL display the returned result, preserve relevant metadata and editing actions, and report failures through the compatible message path

### Requirement: Webview state and resources SHALL be scoped and cleaned up

Components SHALL register and dispose message listeners, timers, subscriptions, and terminal/editor resources according to their lifecycle. Webview assets SHALL resolve from the packaged extension path and SHALL not depend on a development server in production.

#### Scenario: Dispose a hidden or closed page

- **WHEN** a Webview page is closed or replaced
- **THEN** its listeners and owned resources SHALL be released and a later page instance SHALL not receive stale messages
