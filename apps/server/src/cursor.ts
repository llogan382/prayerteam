import type { z } from "zod";

// Thrown for any cursor that doesn't decode to a valid keyset position. The
// error handler turns it into 400 invalid_cursor.
export class InvalidCursorError extends Error {
  override name = "InvalidCursorError";
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
        throw new InvalidCursorError("cursor is not base64url JSON");
      }
      const parsed = position.safeParse(json);
      if (!parsed.success) throw new InvalidCursorError("cursor is not a valid position");
      return parsed.data;
    },
  };
}
