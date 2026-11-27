// Adds a scoring league. A league is plain data, so scoring never runs plugin code.
export default {
  id: 'acme/club-league',
  name: 'Club league',
  kind: 'xc-planner',
  apiVersion: 1,
  leagues: [
    {
      id: 'club',
      label: 'Club league',
      rules: [
        { name: 'Free distance', type: 'free', multiplier: 1 },
        { name: 'FAI triangle', type: 'fai', multiplier: 2, closing: { relative: 0.05 } }
      ]
    }
  ]
};
