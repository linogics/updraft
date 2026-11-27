import { coreSchemas } from './coreSchemas';
import { services } from './services';

export interface WriteService {
  name: string;
  /** Names of the methods that change data. */
  methods: string[];
}

/** The required services that have write methods. A provided service wins over the core schema of the same name. */
export function writeServices(requires: readonly string[] = []): WriteService[] {
  const out: WriteService[] = [];
  for (const name of requires) {
    const schema = services.schemaOf(name) ?? coreSchemas.find((s) => s.name === name);
    const methods = Object.entries(schema?.methods ?? {})
      .filter(([, def]) => def.access === 'write')
      .map(([method]) => method);
    if (methods.length) out.push({ name, methods });
  }

  return out;
}
