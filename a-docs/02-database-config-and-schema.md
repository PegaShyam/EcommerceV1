# Commit 2 — Database Configuration and Schema for PostgreSQL

**Commit:** `d5b8588` · "2. Add database configuration and schema for PostgreSQL integration"
**Files touched:** `backend/drizzle.config.ts` (new), `backend/src/db/index.ts` (new), `backend/src/db/schema.ts` (new), `backend/package.json` (2 scripts added)

## Table of Contents

1. [What this commit does](#1-what-this-commit-does)
2. [New terms: ORM, migrations, connection pool](#2-new-terms-orm-migrations-connection-pool)
3. [`backend/drizzle.config.ts`](#3-backenddrizzleconfigts)
4. [`backend/src/db/index.ts`](#4-backendsrcdbindexts)
5. [`backend/src/db/schema.ts`](#5-backendsrcdbschemats)
   - 5.1 [The `users` table](#51-the-users-table)
   - 5.2 [The `products` table](#52-the-products-table)
   - 5.3 [The `checkoutSessions` table](#53-the-checkoutsessions-table)
   - 5.4 [The `orders` and `orderItems` tables](#54-the-orders-and-orderitems-tables)
   - 5.5 [Relations](#55-relations)
6. [`backend/package.json` script additions](#6-backendpackagejson-script-additions)
7. [Best practices seen in this commit](#7-best-practices-seen-in-this-commit)
8. [What's next](#8-whats-next)

---

## 1. What this commit does

Commit 1 set up the tools; this commit designs the **data model** — the shape of everything the app will eventually store: who the users are, what products exist, what a shopping cart/checkout looks like, and what a completed order looks like. It does this using **Drizzle ORM**, talking to a **PostgreSQL** database.

Nothing here talks to a live database yet or exposes any HTTP route — it's pure schema definition. That matters: **the data model is designed before the API routes that will use it.** Deciding "what does an order look like in the database" is a prerequisite for writing "here's the endpoint that creates an order."

## 2. New terms: ORM, migrations, connection pool

A few concepts that are foundational to this whole commit:

- **PostgreSQL ("Postgres")** — a relational (table-based) database. Data lives in *tables* (like `users`, `products`) made of *rows* and *columns*, and tables can reference each other (a row in `orders` can point at a row in `users`).
- **ORM (Object-Relational Mapper)** — a library that lets you describe database tables using your programming language (here, TypeScript objects) instead of writing raw SQL by hand, and gives you type-safe functions to query/insert/update data. **Drizzle** is the ORM used here.
- **Schema** — the definition of what tables exist and what columns each one has. `backend/src/db/schema.ts` *is* the schema — it's the single source of truth for the database's shape.
- **Migration** — the process of applying schema changes to an actual running database (e.g. "add this new table," "add this new column"). Drizzle Kit is the companion CLI tool that reads `schema.ts` and can either generate SQL migration files or push the schema straight to the database.
- **Connection pool** — opening a fresh network connection to the database for every single query would be slow. A *pool* keeps a small set of already-open connections ready to reuse, handing one out per query and returning it to the pool when done.

## 3. `backend/drizzle.config.ts`

```ts
/// <reference types="node" />
import { defineConfig } from "drizzle-kit";
import "dotenv/config";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
});
```

This file is read by the **Drizzle Kit CLI** (not by the running app itself) — it's config for the *tool*, not for the *server*.

- **`import "dotenv/config"`** — this line's only job is to run a side effect: as soon as it's imported, it reads your `.env` file and loads its key=value pairs into `process.env`. It's imported here *before* `process.env.DATABASE_URL` is read below, which is why it comes first — order matters, since `process.env.DATABASE_URL` would be `undefined` if this ran after.
- **`schema: "./src/db/schema.ts"`** — tells Drizzle Kit where to find the table definitions.
- **`out: "./drizzle"`** — where generated SQL migration files would be written (if you use `drizzle-kit generate` instead of `push`).
- **`dialect: "postgresql"`** — Drizzle also supports MySQL and SQLite; this tells it which SQL flavor to generate.
- **`dbCredentials.url: process.env.DATABASE_URL ?? ""`** — the database connection string, read from an environment variable rather than hard-coded. This is exactly why `.env` was git-ignored back in [Commit 1](01-project-and-tools-setup.md#3-root-gitignore) — a database URL often embeds a username and password.
- **`?? ""`** — the nullish coalescing operator: "if the left side is `null`/`undefined`, use the right side instead." Here it just avoids a TypeScript type error (the field expects a `string`, not `string | undefined`) — if the env var is genuinely missing, Drizzle Kit will fail with a connection error using the empty string, which is an acceptable failure mode for a CLI tool run by a developer who will immediately notice.

## 4. `backend/src/db/index.ts`

```ts
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export const db = drizzle(pool, { schema });
```

This is the file the *running application* will import to talk to the database (as opposed to `drizzle.config.ts`, which only the CLI tool reads).

- **`pg`** — the low-level PostgreSQL driver for Node.js. `drizzle-orm/node-postgres` is Drizzle's adapter that sits on top of `pg` and adds the type-safe query API.
- **`new pg.Pool({ connectionString: ... })`** — creates the connection pool described above, once, when this module is first imported.
- **`drizzle(pool, { schema })`** — wraps the pool with Drizzle's query builder, and hands it the schema so Drizzle knows about table shapes and relations (enabling type-checked queries like `db.query.users.findMany({ with: { orders: true } })`).
- **`export const db = ...`** — this single `db` object is meant to be imported everywhere else in the backend that needs to read/write data. Creating one pool and reusing it (a singleton) is important: creating a new pool per request would exhaust the database's connection limit under load.

## 5. `backend/src/db/schema.ts`

This is the heart of the commit. It defines five tables and the relationships between them.

### 5.1 The `users` table

```ts
export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    email: text("email").notNull().default(""),
    displayName: text("display_name"),
    role: text("role").$type<UserRole>().notNull().default("customer"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

- **`uuid("id").primaryKey().defaultRandom()`** — the primary key (the column that uniquely identifies a row) is a **UUID** (a 128-bit random-looking identifier, e.g. `a1b2c3d4-...`) rather than a simple auto-incrementing number. `defaultRandom()` means Postgres generates a new random UUID automatically on insert. UUIDs are commonly preferred over incrementing integers when IDs might ever be exposed externally (e.g. in a URL), since sequential integers leak information (like "how many users exist" or lets someone guess `/orders/1235` after seeing `/orders/1234`).
- **`clerkUserId: text(...).notNull().unique()`** — this table doesn't store passwords. `clerkUserId` links this row to a user managed by **Clerk** (the auth dependency spotted "installed but unused" in Commit 1 — this is the first place it's actually referenced, confirming that prediction). `.unique()` guarantees Postgres itself will reject a second row with the same Clerk ID — the database enforces the invariant, not just application code.
- **`.notNull()`** — the column is required; Postgres rejects an insert that omits it.
- **`role: text("role").$type<UserRole>().notNull().default("customer")`** — `.$type<UserRole>()` is a Drizzle-only, TypeScript-only annotation: the column is still just `text` in Postgres, but Drizzle will type it in your code as the union `"customer" | "support" | "admin"` (defined at the top of the file) instead of a plain `string`. This gets you autocomplete and compile-time errors if you typo a role name, at zero runtime cost.
- **`timestamp(..., { withTimezone: true }).defaultNow()`** — always store timestamps with timezone information, and let Postgres itself stamp "now" rather than computing it in application code (avoids clock-skew bugs between the app server and the database, and between the app server and users in other timezones).
- **`createdAt` and `updatedAt` as a pair** — a very common convention: `createdAt` is set once and never changes; `updatedAt` is meant to be bumped every time the row changes (note: Drizzle's `.defaultNow()` only sets the *initial* value — actually keeping `updatedAt` fresh on every update requires either an explicit update in application code or a Postgres trigger; that wiring isn't in this commit yet).

### 5.2 The `products` table

```ts
export const products = pgTable("products", {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    category: text("category").notNull().default("General"),
    description: text("description").notNull().default(""),
    priceCents: integer("price_cents").notNull(),
    currency: text("currency").notNull().default("usd"),
    imageUrl: text("image_url"),
    /** ImageKit `fileId` for deletes */
    imageKitFileId: text("image_kit_file_id"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

- **`slug`** — a URL-friendly, human-readable unique identifier (e.g. `"blue-running-shoes"` instead of a UUID) used for building clean product page URLs like `/products/blue-running-shoes`. It's `.unique()` for the same database-level-guarantee reason as `clerkUserId` above.
- **`priceCents: integer(...)`, not a decimal/float** — this is a deliberate and important choice: **money is stored as an integer number of cents, never as a floating-point dollar amount.** Floating-point numbers can't represent amounts like $0.10 exactly in binary, which causes rounding errors when adding up prices. Storing "1099" (meaning $10.99) sidesteps that entirely. Expect a `currency` column alongside it — "1099" is meaningless without knowing the unit.
- **`imageKitFileId`** with a comment explaining *why* it exists (`/** ImageKit fileId for deletes */`) — this is a good example of the *only* kind of comment worth writing: it's not obvious from the column name alone why you'd store a *second* image-related ID. The comment explains the non-obvious reason (you need ImageKit's own file ID later if you ever want to delete the image from ImageKit's storage, since a URL alone isn't enough to do that).
- **`active: boolean(...).default(true)`** — a soft way to "delete" or hide a product without actually removing its row (important once orders reference this product — see below).

### 5.3 The `checkoutSessions` table

```ts
export const checkoutSessions = pgTable("checkout_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  polarCheckoutId: text("polar_checkout_id").unique(),
  lines: jsonb("lines").$type<CheckoutSessionLine[]>().notNull(),
  totalCents: integer("total_cents").notNull(),
  currency: text("currency").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

- **`userId: uuid(...).references(() => users.id, ...)`** — this is a **foreign key**: it constrains `userId` to only ever hold a value that actually exists in `users.id`. This is how relational databases link rows across tables.
- **`{ onDelete: "cascade" }`** — explained by the schema file's own comment:

  > `// cascade = "delete children when parent is deleted"; restrict = "don't delete the parent if any child still points at it."`

  In practice: if a `users` row is deleted, Postgres will automatically delete any `checkoutSessions` rows that pointed at it too — a checkout session with no owning user makes no sense, so it's safe (even correct) to clean it up automatically.
- **`polarCheckoutId`** — a reference to an ID from **Polar** (a payments/checkout provider, inferred from the name — not yet wired into any code in this commit, another "what's coming" clue).
- **`lines: jsonb("lines").$type<CheckoutSessionLine[]>()`** — **`jsonb`** is Postgres's binary JSON column type: instead of a fixed set of columns, this column stores an arbitrary JSON value (here, an array of `{ productId, quantity, unitPriceCents }` objects — the cart's contents at the moment of checkout). This is a deliberate trade-off: a cart's line items *could* be modeled as their own separate table (like `orderItems` is, below), but since a checkout session is a short-lived, throwaway snapshot (not something you need to query "show me all checkout sessions containing product X" against), storing it as one JSON blob is simpler and avoids an extra table. Compare this to `orderItems`, which *does* get its own real table — because completed orders **do** need to be queried/reported on individually.

### 5.4 The `orders` and `orderItems` tables

```ts
export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: text("status").$type<OrderStatus>().notNull().default("pending"),
  polarCheckoutId: text("polar_checkout_id"),
  polarOrderId: text("polar_order_id").unique(),
  totalCents: integer("total_cents").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "restrict" }),
  quantity: integer("quantity").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
});
```

- **`status: text(...).$type<OrderStatus>().default("pending")`** — `OrderStatus` is `"pending" | "paid" | "failed"`. An order's life cycle: created as `pending`, then flipped to `paid` or `failed` once a payment webhook comes back (this is almost certainly what the `standardwebhooks` dependency, spotted unused back in Commit 1, is for).
- **Two different `onDelete` behaviors on purpose:**
  - `orderItems.orderId` → `onDelete: "cascade"` — if an order is deleted, its line items are meaningless on their own, so delete them too.
  - `orderItems.productId` → `onDelete: "restrict"` — the *opposite* choice. Postgres will **refuse** to delete a product if any `orderItems` row still references it. This protects historical order data: you should never be able to delete a product that appears in someone's past order, because that would corrupt the order history (order items would be pointing at nothing). If a product should stop being sold, the `products.active` flag (from 5.2) is the right tool — that's exactly why it exists.
- **`unitPriceCents` stored again here (not just looked up from `products`)** — this is intentional duplication, and a classic e-commerce data-modeling lesson: a product's price can change after the fact (a sale ends, a price goes up). An order must permanently record *the price the customer actually paid at the time*, independent of whatever `products.priceCents` says today. Copying the price into `orderItems` at order-creation time freezes it.

### 5.5 Relations

```ts
export const usersRelations = relations(users, ({ many }) => ({
  orders: many(orders),
}));

export const productsRelations = relations(products, ({ many }) => ({
  orderItems: many(orderItems),
}));

export const ordersRelations = relations(orders, ({ one, many }) => ({
  user: one(users, { fields: [orders.userId], references: [users.id] }),
  items: many(orderItems),
}));

export const orderItemsRelations = relations(orderItems, ({ one }) => ({
  order: one(orders, { fields: [orderItems.orderId], references: [orders.id] }),
  product: one(products, { fields: [orderItems.productId], references: [products.id] }),
}));
```

These `relations(...)` calls don't create anything in the actual Postgres database — the foreign keys (`.references(...)` above) already did that. This is purely **Drizzle's own bookkeeping**, so that later application code can write convenient, type-safe queries like:

```ts
const order = await db.query.orders.findFirst({
  where: eq(orders.id, someId),
  with: { user: true, items: { with: { product: true } } },
});
```

...and get back a fully nested object (`order.user.email`, `order.items[0].product.name`) in one query, instead of manually writing SQL `JOIN`s or making several round-trip queries. Note each relation file comment states the relationship in plain English right above the code (`// a user can have many orders over time.`) — a good habit, because "one-to-many" vs "many-to-many" isn't always obvious just from reading `one(...)`/`many(...)` calls out of context.

## 6. `backend/package.json` script additions

```diff
     "start": "node ./dist/index.js",
+    "db:push": "drizzle-kit push",
+    "db:seed": "tsx scripts/seed.ts"
```

- **`db:push`** — runs Drizzle Kit's `push` command, which compares `schema.ts` against the live database and directly applies whatever changes are needed (adds tables/columns, etc.), without generating separate SQL migration files first. This is the fast, iteration-friendly option, typically used in early development; larger/production projects often switch to `drizzle-kit generate` + a reviewed migration file once the schema stabilizes, since `push` can be riskier for changes that would destroy data (e.g. dropping a column).
- **`db:seed`** — intended to run a `scripts/seed.ts` file that would insert some starter/sample data (e.g. a handful of test products) into the database. That script doesn't exist yet in this commit — the script entry was added in anticipation of it.

## 7. Best practices seen in this commit

- **Money as integer cents, never floats.** Every price field (`priceCents`, `totalCents`, `unitPriceCents`) follows this rule consistently.
- **UUID primary keys** for anything that might be exposed externally (all five tables use them).
- **Foreign keys with explicit, considered `onDelete` behavior** — not left at the database default, and deliberately different (`cascade` vs `restrict`) depending on whether losing the child data is safe.
- **Freeze historical/financial facts at write time** (`orderItems.unitPriceCents`) rather than deriving them live from a mutable source (`products.priceCents`).
- **Prefer a database-level constraint over an application-level check** where possible (`.unique()`, `.notNull()`, foreign keys) — the database enforces these even if a bug in the application code forgets to.
- **Secrets via environment variables**, never hard-coded (`process.env.DATABASE_URL`), consistent with the `.env` git-ignore rule from Commit 1.

## 8. What's next

Two things to watch for in upcoming commits, based on what's referenced but not yet implemented:

- **`scripts/seed.ts`** doesn't exist yet — expect a commit that adds sample products/users so the app has something to display during development.
- **Clerk integration** — `clerkUserId` exists in the schema, and `@clerk/express` has been an installed dependency since Commit 1, but no backend code has actually used Clerk yet (no middleware, no webhook handler). That wiring — verifying signed-in requests and syncing Clerk users into the local `users` table via a webhook — is a natural next step, and is already in progress in the working directory (not yet committed) as `backend/src/webhooks/clerk.ts` and `backend/src/lib/env.ts`.
- **Polar payments** — `polarCheckoutId`/`polarOrderId` columns exist, but nothing yet calls Polar's API or handles its webhooks.
- **Order status transitions** — nothing yet flips an order from `"pending"` to `"paid"`/`"failed"`; that will likely arrive alongside the Polar/webhook work, using the same `standardwebhooks` dependency for verifying that incoming webhook requests are authentic and not forged.
