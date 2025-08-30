// src/adapters/paths.ts
import { join } from "node:path";
export const single = (root: string, location: string) => join(root, location);
export const under = (root: string, dir: string, rel: string) =>
  join(root, dir, rel);
