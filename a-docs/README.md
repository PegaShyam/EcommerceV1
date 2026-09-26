# Build Log — Learning Docs

This folder is a **per-commit tutorial** of this e-commerce project. Each file matches one commit in `git log` and explains, in plain language:

- what was added and why
- what every new term/tool means the first time it shows up
- why the code is arranged the way it is (order, structure, conventions)
- best practices worth remembering
- what's likely coming next, so you know what to look for when you read the next commit

Read them in order — each one assumes you already understand the previous ones. When you come back to this project after a break, start here, find the last commit you understood, and read forward from there.

## How to use this alongside git

For any doc, you can see the real diff yourself with:

```bash
git show <short-hash>
```

The hash is written at the top of each doc's Overview section.

## Commit index

| # | Commit | Doc | What it covers |
|---|--------|-----|-----------------|
| 1 | `1c9684b` — "1.Projects and Tools Setup" | [01-project-and-tools-setup.md](01-project-and-tools-setup.md) | Repo skeleton: Vite + React frontend, Express + TypeScript backend, ESLint, `.gitignore`, tsconfig |
| 2 | `d5b8588` — "2. Add database configuration and schema for PostgreSQL integration" | [02-database-config-and-schema.md](02-database-config-and-schema.md) | PostgreSQL + Drizzle ORM setup, first data model (users, products, orders, order items) |

New docs get added here as new commits land — one file per commit, same naming pattern (`03-...md`, `04-...md`, ...).

## Glossary (cross-doc reference)

Terms that show up across multiple docs, defined once here so each doc doesn't have to repeat itself:

- **Repo / monorepo** — one git repository containing more than one project. Here, `backend/` and `frontend/` are two independent Node.js projects living side by side in the same repo, each with its own `package.json`.
- **`package.json`** — a Node.js project's manifest: its name, scripts (`npm run <script>`), and its two dependency lists (see below).
- **`dependencies` vs `devDependencies`** — `dependencies` are needed when the app *runs* (e.g. `express`). `devDependencies` are only needed while *developing/building* (e.g. `typescript`, `eslint`) and are not needed on the production server.
- **`package-lock.json`** — an exact, auto-generated record of every installed package version (including sub-dependencies). It guarantees that everyone who runs `npm install` gets byte-for-byte the same versions. Always commit it; never hand-edit it.
- **`node_modules`** — the folder where installed packages physically live. It's huge and fully reproducible from `package.json` + `package-lock.json`, so it's git-ignored, never committed.
- **Environment variable / `.env`** — a secret or environment-specific setting (database URL, API key) injected at runtime instead of hard-coded. `.env` files are git-ignored because they hold secrets.

---
*This index is maintained by hand alongside the commit history. If a commit's doc is missing, it means the doc hasn't caught up yet — check `git log` for the latest state of the code itself.*
