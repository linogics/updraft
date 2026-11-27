// A headless service plugin. Other plugins list 'me/wind@1' in `requires` and call `ctx.use('me/wind@1')`.
export default {
  id: 'me/wind',
  name: 'Wind data',
  kind: 'service',
  apiVersion: 1,
  provides: {
    // The factory runs on the first use, the result is cached.
    'me/wind@1': () => ({
      // A fixed demo wind. A real plugin would look the wind up for the point and altitude.
      at: (lat, lon, alt) => ({ speed: 4, from: 270 })
    })
  }
};
