import { formatAirtime, formatNumber } from '../ui/format';
import { formatAlt, formatDistance, formatSpeed, formatVario, type Units } from '../ui/units';
import type { Category } from './rankings';

/** A ranking value as the viewer reads it, in their units. The club stores km, km/h, seconds and metres. */
export function formatCategory(cat: Category, value: number, u: Units): string {
  switch (cat) {
    case 'xcPoints':
      return formatNumber(value, 2);
    case 'freeDistance':
      return formatDistance(value * 1000, u);
    case 'xcSpeed':
      return formatSpeed(value / 3.6, u);
    case 'longestFlight':
    case 'totalAirtime':
      return formatAirtime(value * 1000);
    case 'mostFlights':
      return formatNumber(value);
    case 'bestClimb':
      return formatVario(value, u);
    default:
      return formatAlt(value, u);
  }
}
