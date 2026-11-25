export const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object';

export const isFlight = (v: unknown) =>
  isObj(v) && typeof v.id === 'string' && Array.isArray(v.fixes) && v.fixes.length > 0;

export const isManual = (v: unknown) =>
  isObj(v) && typeof v.id === 'string' && typeof v.date === 'string' && v.manual === true;

export const isCameraPath = (v: unknown) => isObj(v) && typeof v.key === 'string';
