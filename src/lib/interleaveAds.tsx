import type { ReactNode } from 'react';
import { AdSlot } from '../components/AdSlot';

/**
 * Inserts a full-width AdSlot after every `itemsPerBreak` items in a CSS grid.
 * `itemsPerBreak` should be sized for the widest breakpoint's column count
 * (e.g. 4 cols x 2 rows = 8) — grids with fewer columns will see ads slightly
 * more often than every 2 rows, which is fine since this is decorative.
 */
export function interleaveWithAds<T>(
  items: T[],
  renderItem: (item: T, index: number) => ReactNode,
  placement: string,
  itemsPerBreak = 8,
): ReactNode[] {
  return items.flatMap((item, i) => {
    const nodes: ReactNode[] = [renderItem(item, i)];
    if ((i + 1) % itemsPerBreak === 0 && i !== items.length - 1) {
      nodes.push(<AdSlot key={`${placement}-ad-${i}`} placement={placement} className="col-span-full" />);
    }
    return nodes;
  });
}
