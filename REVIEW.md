# Code Review Guidelines

## Always check

- TypeScript strict mode compliance — no `any` casts without justification
- Electron IPC boundaries: main process vs renderer process separation
- node-pty and xterm.js lifecycle management (dispose, cleanup)
- New IPC handlers have corresponding preload API exposure
- State management follows existing SolidJS reactive patterns
- No hardcoded credentials, secrets, or file paths
- Error messages don't leak internal system details

## Security

- IPC messages validate input on the main process side
- No `nodeIntegration: true` or `contextIsolation: false` in renderer
- File system access is scoped and validated
- No shell injection via user-controlled terminal input

## Testing

- New logic has corresponding Vitest tests
- Tests don't rely on Electron runtime (unit-testable logic is separated)

## Skip

- Files under `out/` or `dist/`
- `pnpm-lock.yaml` changes
- Generated type declarations
