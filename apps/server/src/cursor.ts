import type { z } from "zod";
import { ProblemError } from "./problems.ts";

// Thrown for any cursor that doesn't decode to a valid keyset position: a
// cursor we didn't issue, or one that was altered.
export class InvalidCursorError extends ProblemError {
  override name = "InvalidCursorError";

  constructor() {
    super(400, "invalid_cursor", "Pass back a nextCursor exactly as this API returned it.");
  }
}

// The one cursor codec every list endpoint uses: the keyset position as
// base64url JSON, checked against its Zod schema on the way back in.
export function cursorCodec<Position extends z.ZodType>(position: Position) {
  return {
    encode(value: z.infer<Position>): string {
      return Buffer.from(JSON.stringify(value)).toString("base64url");
    },
    decode(cursor: string): z.infer<Position> {
      let json: unknown;
      try {
        json = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      } catch {
        throw new InvalidCursorError();
      }
      const parsed = position.safeParse(json);
      if (!parsed.success) throw new InvalidCursorError();
      return parsed.data;
    },
  };
}
