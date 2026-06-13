/** Create a debounced function with a `cancel` method. */
export function debounce<TArgs extends readonly unknown[]>(
  fn: (...args: TArgs) => void,
  wait = 0
): {
  (...args: TArgs): void;
  cancel: () => void;
} {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: TArgs) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => {
      timeout = null;
      fn(...args);
    }, wait);
  };

  debounced.cancel = () => {
    if (timeout) clearTimeout(timeout);
    timeout = null;
  };

  return debounced;
}
