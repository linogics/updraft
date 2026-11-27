// One badge that counts flights of an hour or more. Thresholds are SI, here a count.
export default {
  id: 'acme/badges',
  name: 'Acme badges',
  kind: 'badge',
  apiVersion: 1,
  badges: [
    {
      id: 'long-flights',
      label: 'Long flights',
      unit: 'count',
      // Bronze, Silver, Gold, Platinum, Diamond, Cloudbase, Stratos, Legend. Exactly 8, strictly increasing.
      thresholds: [1, 5, 10, 25, 50, 100, 250, 500],
      // A count never drops when a flight is added, as the app requires.
      value: (flights) => flights.filter((f) => f.durationS >= 3600).length
    }
  ]
};
