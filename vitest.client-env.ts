// Plain node globals, but files are transformed for the client so Svelte compiles runes with live effects.
export default {
  name: 'client-node',
  viteEnvironment: 'client',
  setup: () => ({ teardown() {} })
};
