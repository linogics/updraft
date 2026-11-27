// Adds one export button to the XC planner that saves the turnpoints as CSV.
export default {
  id: 'acme/csv-route',
  name: 'CSV route',
  kind: 'xc-planner',
  apiVersion: 1,
  exports: [
    {
      label: 'CSV turnpoints',
      extension: 'csv',
      mime: 'text/csv',
      // `route` is { points, speed } with at least 2 turnpoints. Return a string or a Uint8Array.
      write: (route) => route.points.map((p) => [p.lat, p.lon].join(',')).join('\n')
    }
  ]
};
