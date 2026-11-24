/** Index a dragged item takes among the other items: the number of item midpoints before the pointer. */
export function dropIndex(mids: number[], pos: number): number {
  const i = mids.findIndex((mid) => mid > pos);
  return i === -1 ? mids.length : i;
}
