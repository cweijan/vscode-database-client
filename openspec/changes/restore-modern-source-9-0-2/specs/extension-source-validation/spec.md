## ADDED Requirements

### Requirement: Source recovery SHALL maintain a complete capability inventory

The migration SHALL maintain a machine-readable or reviewable mapping from target manifest entries, target product-code source markers, Webview entries, resources, and runtime dependencies to migrated source modules or explicit deferred items.

#### Scenario: Inventory has no silent omissions

- **WHEN** a migration slice is completed
- **THEN** its inventory SHALL report every in-scope target item as migrated, intentionally replaced, or deferred with a reason and follow-up task

### Requirement: Each migration slice SHALL pass its defined verification gates

Every completed slice SHALL pass applicable type checking, linting, production build, static reference validation, and focused behavior tests before its tasks are marked complete.

#### Scenario: Slice verification fails

- **WHEN** a focused build or behavior check fails for a slice
- **THEN** the slice SHALL remain incomplete and the failure SHALL be recorded against the task rather than hidden by copying or editing generated output

### Requirement: Generated output SHALL be compared with the target behavior baseline

The validation process SHALL compare manifest surfaces, resource closure, message contracts, and focused runtime behavior with the 9.0.2 active artifact. Byte-for-byte equality SHALL be required only for copied static baseline assets, not for newly generated source output.

#### Scenario: Generated package comparison

- **WHEN** a source slice produces a replacement package
- **THEN** the comparison SHALL identify any missing, added, or behaviorally changed contract and SHALL classify intentional modernization differences separately from regressions

### Requirement: The migration SHALL remain reversible until final parity

Source slices SHALL be committed independently, and the compiled restoration baseline SHALL remain available until the modern source build and validation gates pass. No legacy source or target baseline file SHALL be deleted solely to make an intermediate build pass.

#### Scenario: Roll back an incomplete slice

- **WHEN** a slice introduces an unresolved regression
- **THEN** the branch SHALL be able to revert that slice and return to the previous validated runtime/source state without reconstructing the target bundle
