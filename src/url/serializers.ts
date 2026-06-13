import type { UrlSerializer } from "../core/types";

/** URL serializer for numeric query values. */
export const numberUrlSerializer: UrlSerializer<number> = {
  parse: (value) => Number(value ?? 0),
  serialize: (value) => String(value)
};

/** URL serializer for boolean query values. */
export const booleanUrlSerializer: UrlSerializer<boolean> = {
  parse: (value) => value === "true",
  serialize: (value) => String(value)
};
