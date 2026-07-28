# Repository Guidelines

## Project Structure & Module Organization

Application code lives in `src/`. `index.ts` defines the HTTP API,
`direct-zigbee-source.ts` owns direct coordinator access, and `device-store.ts`
normalizes Zigbee data into UID-based device views. Home Assistant discovery,
favorites, connection settings, and Matterbridge integration each have focused
modules beside their tests. The dependency-free dashboard is
`public/index.html`. Deployment units and the Matterbridge alias hook are in
`deploy/`; safe defaults are in `config/default.yaml`.

## Build, Test, and Development Commands

- `npm install` installs Node.js dependencies.
- `npm run dev` starts the TypeScript server in watch mode.
- `npm run build` compiles `src/` into `dist/`.
- `npm test` builds and runs all `node:test` suites.
- `npm start` runs the compiled production server.

Use Node.js 22 or newer. Run `npm test` before publishing changes.

## Coding Style & Naming Conventions

Use TypeScript with two-space indentation, semicolons, and ESM imports ending
in `.js`. Prefer small modules with explicit interfaces. Functions and
variables use `camelCase`; classes and interfaces use `PascalCase`; test files
end in `.test.ts`. All low-level device operations must use the immutable IEEE
UID, never a friendly name.

## Testing Guidelines

Tests use the built-in `node:test` runner and strict assertions. Add focused
tests for validation, device-control mapping, MQTT discovery, and persistent
state. Tests must not toggle physical devices or require a live coordinator.

## Commit & Pull Request Guidelines

Use short imperative commit subjects, such as `Add Home Assistant discovery`.
Pull requests should explain behavior changes, affected protocols, validation
performed, and any restart or migration requirement. Include screenshots for
material dashboard changes.

## Security & Configuration

Never commit MQTT passwords, Home Assistant tokens, Zigbee network keys,
runtime favorites, or backup files. Keep `config/default.yaml` generic and use
environment overrides or deployment-local configuration for secrets.
