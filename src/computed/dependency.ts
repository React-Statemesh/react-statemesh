/** Return true when two dependency paths overlap, such as `cart` and `cart.items`. */
export function dependencyIntersects(a: string, b: string): boolean {
  return a === b || a.startsWith(`${b}.`) || b.startsWith(`${a}.`);
}
