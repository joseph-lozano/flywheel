# ESLint + Prettier Setup

**Date**: 2026-03-27
**Status**: Approved

## Goal

Add strict linting (ESLint) and formatting (Prettier) to Flywheel with: semicolons, double quotes, organized imports, type-checked rules, and Solid.js reactivity linting.

## Packages

All added as `devDependencies`:

| Package                            | Purpose                                                   |
| ---------------------------------- | --------------------------------------------------------- |
| `eslint`                           | Linter                                                    |
| `typescript-eslint`                | Strict type-checked TS rules                              |
| `eslint-plugin-solid`              | Solid.js reactivity correctness                           |
| `eslint-config-prettier`           | Disables ESLint rules that conflict with Prettier         |
| `prettier`                         | Formatter                                                 |
| `prettier-plugin-organize-imports` | Sort/dedupe/remove unused imports via TS language service |

## Prettier Configuration

File: `.prettierrc.json`

```json
{
  "semi": true,
  "singleQuote": false,
  "trailingComma": "all",
  "printWidth": 100,
  "plugins": ["prettier-plugin-organize-imports"]
}
```

File: `.prettierignore`

```
out/
dist/
node_modules/
package-lock.json
build/
*.yaml
```

## ESLint Configuration

File: `eslint.config.ts` (flat config, native TS support)

Three layers:

1. **`tseslint.configs.strictTypeChecked` + `stylisticTypeChecked`** — strict TS rules with type information (`no-floating-promises`, `no-misused-promises`, `await-thenable`, `no-unnecessary-condition`, etc.)
2. **`eslint-plugin-solid` flat recommended** — reactivity rules scoped to `src/renderer/**/*.{ts,tsx}`
3. **`eslint-config-prettier`** — last in chain, turns off formatting rules

Parser options: `projectService: true` (uses existing `tsconfig.json` composite setup).

Global ignores: `out/`, `dist/`, `node_modules/`, `build/`.

## npm Scripts

```json
{
  "lint": "eslint .",
  "lint:fix": "eslint . --fix",
  "format": "prettier --write .",
  "format:check": "prettier --check ."
}
```

## CI Integration

Add lint and format-check steps to the existing `ci.yml` GitHub Actions workflow, running before the build step.

## Rollout

1. Install packages, add config files, add npm scripts
2. Run `prettier --write .` to reformat entire codebase (single commit: "chore: format codebase with prettier")
3. Run `eslint . --fix` for auto-fixable issues, then manually fix remaining findings
4. Update CI workflow
5. All changes in one PR on the `eslint-prettier` branch
