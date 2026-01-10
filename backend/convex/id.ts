// convex/id.ts
// Bootstrap-safe replacement for Id<TableName> that does NOT depend on convex/_generated.
// Once convex dev/codegen is healthy, you can optionally switch back to importing from _generated.

import type { GenericId } from "convex/values";

export type Id<TableName extends string> = GenericId<TableName>;
export type Doc<TableName extends string> = any;
