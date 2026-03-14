/** Normalize Express param/query to a single string (for route params like :id). */
export function strParam(p: string | string[] | undefined): string {
  return (Array.isArray(p) ? p[0] : p) ?? '';
}
