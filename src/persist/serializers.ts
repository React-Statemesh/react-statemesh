/** Default JSON serializer helpers used by persistence examples. */
export const jsonSerializer = {
  serialize: (value: unknown): string => JSON.stringify(value),
  deserialize: (value: string): unknown => JSON.parse(value)
};
