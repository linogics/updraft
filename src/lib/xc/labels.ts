import { m } from '../paraglide/messages';

/** Display names of the XC task types, shared by the planner and the stats panel. */
export const XC_TYPE_LABELS: Record<'free' | 'flat' | 'fai' | 'oar', () => string> = {
  free: () => m.xc_type_free(),
  flat: () => m.xc_type_flat(),
  fai: () => m.xc_type_fai(),
  oar: () => m.xc_type_oar()
};
