# Changelog

All notable changes to this project will be documented in this file.

## [0.3.0] - 2025-12-16

### Added
- **Generic List Filtering**: Added support for filtering generic lists in GraphQL queries.
  - Automatically converts JSON Arrays in the store to GraphQL List types.
  - Adds optional arguments `filterField`, `filterOp`, `filterValue` to list fields.
  - Documented in README.

### Changed
- **BREAKING**: Topics containing JSON Arrays are now exposed as `GraphQLList` instead of `GraphQLObjectType`.
  - Queries accessing array indices (e.g., `list { _0 { ... } }`) or metadata keys on the list node itself (e.g., `list { _tree }`) will fail.
  - You must now query the list items directly or query `_tree` on the parent node.
