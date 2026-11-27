// A headless service plugin. Other plugins list 'me/wind@1' in `requires` and call `ctx.use('me/wind@1')`.
export default {
  id: 'me/wind',
  name: 'Wind data',
  kind: 'service',
  apiVersion: 1,
  provides: {
    'me/wind@1': {
      // Describes the service. Calls from other plugins are checked against it.
      // Generate it from your own .d.ts, see docs/plugins/service/README.md.
      schema: {
        name: 'me/wind@1',
        description: 'Wind lookup for a point and altitude.',
        methods: {
          at: {
            description: 'The wind at a point. Speed in m/s, direction in degrees the wind blows from.',
            access: 'read',
            params: [
              { name: 'lat', schema: { type: 'number', minimum: -90, maximum: 90 } },
              { name: 'lon', schema: { type: 'number', minimum: -180, maximum: 180 } },
              { name: 'alt', schema: { type: 'number' } }
            ],
            returns: {
              type: 'object',
              properties: { speed: { type: 'number' }, from: { type: 'number' } },
              required: ['speed', 'from']
            }
          }
        }
      },
      // The factory runs on the first use, the result is cached.
      create: () => ({
        // A fixed demo wind. A real plugin would look the wind up for the point and altitude.
        at: (lat, lon, alt) => ({ speed: 4, from: 270 })
      })
    }
  }
};
