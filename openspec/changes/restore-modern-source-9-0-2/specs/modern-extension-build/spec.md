## ADDED Requirements

### Requirement: The extension SHALL have a reproducible modern build

The project SHALL build the extension backend and Vue Webview from source using the modern Vite, TypeScript, and Vue 3 toolchain declared by the target version. A clean checkout SHALL be able to install the locked dependencies and produce the declared extension entry and Webview assets without relying on the previously copied compiled bundle as an input.

#### Scenario: Clean checkout build

- **WHEN** a clean checkout installs dependencies with the committed lockfile and runs the production build
- **THEN** the build SHALL complete successfully and produce `out/extension.js` and the Webview entry with all referenced assets

### Requirement: Migrated source SHALL be type checked and lintable

All migrated TypeScript and Vue source SHALL be included in the configured type-check and lint commands. The commands SHALL report actionable file and line locations and SHALL not silently exclude migrated modules because they are outside the old Webpack entry graph.

#### Scenario: Type-check catches a migrated source error

- **WHEN** a migrated source module contains an incompatible type or an invalid Vue binding
- **THEN** the type-check command SHALL fail and identify that source module

### Requirement: Dependency resolution SHALL be reproducible

The project SHALL commit a dependency lockfile compatible with the supported Node/npm runtime and SHALL declare all build-time and runtime dependencies required by the source build. The production build SHALL not depend on undeclared globally installed packages.

#### Scenario: Build in an isolated dependency directory

- **WHEN** the project is installed without a pre-existing `node_modules` directory
- **THEN** dependency installation and the production build SHALL succeed using only the manifest and lockfile

### Requirement: The legacy build path SHALL be retired only after source parity

The old Webpack/Vue 2 build configuration SHALL not be the active build path once the modern source slices are complete. Legacy files and dependencies MAY remain during migration, but SHALL be removed or explicitly isolated only after the new build passes the parity and validation requirements.

#### Scenario: Modern build is the active package build

- **WHEN** the extension is packaged after source migration
- **THEN** the package SHALL invoke the modern source build and SHALL not require the old Webpack configuration
