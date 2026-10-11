# lognot

> Fast, local-first Conventional Commits changelog generator & GitHub release notes CLI.

[![CI](https://github.com/Sabari-Vasan-SM/lognot/actions/workflows/ci.yml/badge.svg)](https://github.com/Sabari-Vasan-SM/lognot/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/lognot.svg)](https://www.npmjs.com/package/lognot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Turn your git history into a clean, grouped [Keep a Changelog](https://keepachangelog.com) `CHANGELOG.md` entry and GitHub release with a single command. Works 100% offline, never mutates git state, supports monorepos, and requires zero telemetry or third-party accounts.

```
$ lognot --dry-run
## [1.3.0] - 2026-10-11

### 💥 Breaking Changes
- **auth:** replace legacy cookie sessions with JWT ([c3d4e5f](https://github.com/you/repo/commit/c3d4e5f))

### ✨ Features
#### auth
- Add OTP authentication ([a1b2c3d](https://github.com/you/repo/commit/a1b2c3d)) closes #42

### 🐛 Bug Fixes
- Fix race condition during token refresh ([b2c3d4e](https://github.com/you/repo/commit/b2c3d4e)) #99
```

---

## ⚡ Features

- **Local-first & Safe**: Operates directly on local git commits. Supports `--dry-run`, atomic writes with backup rollback, and never rewrites git history.
- **Automated Semver Bumping**: Detects `major`, `minor`, or `patch` increments from Conventional Commits and tags.
- **Keep a Changelog Layout**: Prepends entries seamlessly, preserves existing headers, comments, and CRLF line endings.
- **GitHub Release Integration**: Publish release notes directly to GitHub with `lognot release`.
- **Monorepo Ready**: Scope changelogs to individual package subdirectories with `--package`.
- **CI & Machine Friendly**: `--json` output, strict exit codes, and commit linting (`lognot check`).

---

## 📦 Installation

Install globally via npm:

```bash
npm install -g lognot
```

Or run directly on-demand via `npx`:

```bash
npx lognot
```

---

## 🚀 Quick Start

Generate your first changelog entry in 3 commands:

```bash
# 1. Preview the generated changelog without writing anything
npx lognot --dry-run

# 2. Write the changelog entry to CHANGELOG.md
npx lognot

# 3. (Optional) Publish a GitHub release for your latest tag
npx lognot release
```

---

## 📖 Conventional Commits Cheat Sheet

`lognot` follows the [Conventional Commits 1.0.0](https://www.conventionalcommits.org) specification:

```
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types & Mappings

| Commit Type | Section | Emoji | Version Bump |
|---|---|---|---|
| `feat` | Features | ✨ | **minor** |
| `fix` | Bug Fixes | 🐛 | **patch** |
| `perf` | Performance | ⚡ | **patch** |
| `security` | Security | 🔒 | **patch** |
| `refactor` | Refactoring | ♻️ | *(no bump)* |
| `docs` | Documentation | 📝 | *(no bump)* |
| `revert` | Reverts | ⏪ | *(no bump)* |
| `chore`, `ci`, `test`, `style`, `build` | *Ignored by default* | — | *(no bump)* |
| `!` or `BREAKING CHANGE:` | Breaking Changes | 💥 | **major** |
| *(unknown format)* | Other Changes | 📦 | *(no bump)* |

### Examples

- **Feature with scope & issue link:**
  ```bash
  git commit -m "feat(billing): add Stripe webhooks (#104)"
  ```
- **Bug fix closing a PR:**
  ```bash
  git commit -m "fix(auth): handle expired refresh tokens closes #88"
  ```
- **Breaking change (exclamation marker):**
  ```bash
  git commit -m "feat(api)!: migrate endpoint to v2 payload"
  ```
- **Breaking change (footer trailer):**
  ```bash
  git commit -m "refactor: simplify db client

  BREAKING CHANGE: connection string URL parameter is now required."
  ```

---

## 🛠️ CLI Reference

```
lognot [options] [command]
```

### Default Command Options

| Flag | Description | Default |
|---|---|---|
| `--dry-run` | Print changelog output to terminal without writing | `false` |
| `--from <ref>` | Starting git commit ref or tag | Latest semver tag |
| `--to <ref>` | Ending git commit ref | `HEAD` |
| `--version <ver>` | Force a specific version instead of auto-calculating | Auto-detected |
| `--bump <strategy>` | Version bump strategy (`auto`, `major`, `minor`, `patch`) | `auto` |
| `--out <file>` | Destination changelog file path | `CHANGELOG.md` |
| `--format <style>` | Output style (`keepachangelog` or `release`) | `keepachangelog` |
| `--stdout` | Print generated changelog to stdout only | `false` |
| `--package <name>` | Scope commits to a monorepo package defined in config | Root repository |
| `--force` | Allow duplicate version entries or file overwrites | `false` |

### Global Options

| Flag | Description |
|---|---|
| `--cwd <path>` | Working directory (must be inside git repository) |
| `--verbose` | Output detailed debugging and commit statistics |
| `--no-color` | Disable colored terminal output |
| `--json` | Output machine-readable JSON for CI integration |
| `-V, --app-version` | Display lognot CLI version |
| `-h, --help` | Display command help |

### Subcommands

#### `lognot check`
Validates commit messages in range against the Conventional Commits format. Exits with code `1` if any commit is malformed. Useful in CI pull request pipelines.

```bash
lognot check --from origin/main --to HEAD
```

#### `lognot init`
Scaffolds a `lognot.config.json` configuration file with sensible defaults.

```bash
lognot init
```

#### `lognot release`
Creates or updates a GitHub Release for the latest tag using notes rendered in release format. Requires `GITHUB_TOKEN` or `LOGNOT_GITHUB_TOKEN` in environment variables.

```bash
export GITHUB_TOKEN="ghp_xxx"
lognot release
lognot release --draft
lognot release --prerelease
```

### Exit Codes

- `0`: Success (or nothing to release)
- `1`: Validation error (malformed commit from `check`, invalid config, or duplicate version)
- `2`: Git error (not a git repo, bad ref, shallow clone issue)
- `3`: GitHub API or token error
- `4`: Unexpected error

---

## ⚙️ Configuration (`lognot.config.json`)

`lognot` looks for configuration in `lognot.config.json`, `.lognotrc`, or `"lognot"` in `package.json`.

```json
{
  "output": "CHANGELOG.md",
  "format": "keepachangelog",
  "tagPrefix": "v",
  "bump": "auto",
  "ignoreTypes": ["chore", "ci", "test", "style", "build"],
  "includeMergeCommits": false,
  "sections": {
    "feat": { "title": "Features", "emoji": "✨" },
    "fix": { "title": "Bug Fixes", "emoji": "🐛" },
    "perf": { "title": "Performance Improvements", "emoji": "⚡" },
    "security": { "title": "Security Fixes", "emoji": "🔒" }
  },
  "repoUrl": "https://github.com/you/repo",
  "github": {
    "owner": "you",
    "repo": "repo",
    "draft": false,
    "prerelease": false
  },
  "packages": {
    "core": {
      "path": "packages/core",
      "output": "packages/core/CHANGELOG.md"
    }
  }
}
```

---

## 🏗️ Monorepo Support

In multi-package workspaces, define your packages in `lognot.config.json`:

```json
{
  "packages": {
    "core": {
      "path": "packages/core",
      "output": "packages/core/CHANGELOG.md"
    },
    "cli": {
      "path": "packages/cli",
      "output": "packages/cli/CHANGELOG.md"
    }
  }
}
```

Run lognot for a specific package:

```bash
lognot --package core
```

- Scopes git commits using `git log -- packages/core`.
- Finds tags matching `<package>@<version>` (e.g. `core@1.4.0` or `core@v1.4.0`).
- Writes to `packages/core/CHANGELOG.md`.

---

## 🤖 GitHub Action

Automate changelog generation and GitHub releases with `action/action.yml`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate Changelog & Release
        uses: Sabari-Vasan-SM/lognot/action@v0.1.0
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          release: 'true'
```

---

## ⚖️ Why `lognot`?

| Feature | `lognot` | `conventional-changelog` | `semantic-release` |
|---|:---:|:---:|:---:|
| **Local-first (offline)** | ✅ **Yes** | ⚠️ Partial | ❌ No (designed for CI) |
| **Zero config required** | ✅ **Yes** | ❌ Complex presets | ❌ Heavy plugin setup |
| **Safe by default (no history overwrite)** | ✅ **Yes** | ⚠️ Overwrites file | ❌ Creates git tags/pushes |
| **Atomic write & backup protection** | ✅ **Yes** | ❌ No | ❌ No |
| **Monorepo path scoping** | ✅ Built-in | ❌ Multi-package plugin required | ❌ Complex config |
| **Interactive CLI & dry-run** | ✅ Rich UX | ❌ CLI output only | ❌ CLI runs dry-run via mock |
| **Direct GitHub Release integration** | ✅ Built-in | ❌ Separate plugin | ❌ Plugin required |

`lognot` is built for engineers who want a dependable tool that works just as well from the local terminal on an airplane as it does inside a locked-down GitHub Actions CI environment.

---

## 🤝 Contributing

1. Clone the repository: `git clone https://github.com/Sabari-Vasan-SM/lognot.git`
2. Install dependencies: `npm install`
3. Run tests with coverage: `npm run test:coverage`
4. Lint and typecheck: `npm run lint && npm run typecheck`
5. Build: `npm run build`

---

## 📄 License

[MIT](LICENSE) © 2026 Sabarivasan
