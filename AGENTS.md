# Repository Guidelines

## Project Structure & Module Organization
- `src/` holds the React + TypeScript UI and app logic. Key areas include `components/` (pages + UI), `hooks/`, `lib/` (services, sync, security, DB helpers), `locales/`, `main/` (Electron main process), and `types/`.
- `public/` contains static assets served by Vite.
- `scripts/` contains helper scripts (for example, Electron dev/serve helpers).
- `docs/` and `supabase/` contain design notes and data/schema artifacts.
- `dist/`, `dist-electron/`, and `dist_electron_build/` are build outputs.

## Build, Test, and Development Commands
- `npm run dev` starts the Vite dev server with HMR.
- `npm run build` runs `tsc` and creates a production web build.
- `npm run preview` serves the production build locally.
- `npm run lint` runs ESLint on `ts` and `tsx` files.
- `npm run electron:serve` launches the Electron shell pointing at the Vite build.
- `npm run electron:build` builds and packages the Electron app.

## Coding Style & Naming Conventions
- TypeScript strict mode is enabled (`tsconfig.json`); keep types explicit and avoid `any` where practical.
- Follow the existing formatting: 2-space indentation, single quotes, and `.tsx` for React components.
- Use PascalCase for components (`ContactsPage.tsx`), camelCase for functions/variables, and `useX` for hooks.
- Prefer path alias imports like `@/lib/...` over deep relative paths.

## Testing Guidelines
- There is no configured test runner or `npm test` script yet. If you add tests, introduce a runner and document it here.
- Suggested pattern: `src/**/__tests__/*.test.tsx` or `*.test.ts` alongside the code it covers.

## Commit & Pull Request Guidelines
- Recent history follows Conventional Commit prefixes (for example, `feat:`, `docs:`). Use the same pattern when possible.
- PRs should include a short summary, testing notes, and screenshots for UI changes. Call out schema updates in `supabase/` and document any new env vars.

## Security & Configuration Tips
- Store local configuration in `.env` and never commit secrets.
- Review `docs/DATA_SCHEMA.md` when touching local data models or sync behavior.
