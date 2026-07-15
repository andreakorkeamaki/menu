import { createHash } from "node:crypto";

export function sourceHash(value: string) {
  return createHash("sha256")
    .update(value, "utf8")
    .digest("hex");
}
