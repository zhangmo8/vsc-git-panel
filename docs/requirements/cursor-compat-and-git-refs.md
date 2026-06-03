# Cursor Compatibility and Git References Panels Requirement

## Background

Cursor 3.6.31 exposes VS Code Extension API 1.105.1. The current extension manifest requires VS Code API 1.106.x, which prevents installation in that Cursor version even though the extension does not need 1.106-only APIs.

The current Git Panel UI already contains a history tab and stash tab. GitLens exposes focused Branches and Remotes views for navigating and managing repository references, and Git Panel should add a lightweight version that matches the existing layout instead of introducing a separate experience.

## Requirement 1: Cursor 3.6.31 Compatibility

### Goal

Allow Git Panel to install and run in Cursor 3.6.31 / VS Code Extension API 1.105.1.

### Scope

- Lower the extension manifest `engines.vscode` minimum from `^1.106.0` to a range compatible with API 1.105.1.
- Align the local VS Code API type dependency with the supported API baseline so development does not accidentally rely on newer APIs.
- Preserve the existing build and runtime behavior.

### Acceptance Criteria

- `package.json` declares a VS Code engine range compatible with API 1.105.1.
- Type checking and build pass with the 1.105 API type baseline.
- No feature behavior changes are included in this compatibility branch.

## Requirement 2: Branch and Remote Panels

### Goal

Add Branch and Remote panels to the existing Git Panel webview so users can inspect local branches, remote branches, and remotes without leaving the extension.

### Reference

- GitLens side bar views describe Branches as a place to manage and navigate branches, and Remotes as a place to manage and navigate remotes and remote branches: https://github.com/gitkraken/vscode-gitlens

### Scope

- Keep the existing tabbed layout and VS Code theme-variable styling.
- Add a Branches tab listing local and remote branches with current/upstream/ahead-behind metadata when available.
- Add a Remotes tab grouping remote branches by remote name.
- Provide refresh and search controls matching the current History/Stash toolbar behavior.
- Selecting a branch should drive the existing history view/filter workflow where possible.
- Keep destructive branch/remote operations out of the first implementation unless separately requested.

### Acceptance Criteria

- Branch and Remote tabs render in the current Git Panel webview beside History and Stash.
- Empty, loading, filtered, and error states are handled without layout breakage.
- Git data is loaded through the extension host, not through webview-side Git execution.
- The implementation builds, type-checks, and follows the existing UI conventions.
