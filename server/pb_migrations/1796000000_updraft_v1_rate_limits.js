// The v1 sign in and signup routes are custom, so PocketBase's default auth rule does not cover them.
// Same budget as that rule: 2 requests per 3 seconds.
migrate(
  (app) => {
    const settings = app.settings();
    // First so it wins over the broad `/api/` rule.
    settings.rateLimits.rules = [
      { label: '/api/updraft/v1/auth/', maxRequests: 2, duration: 3 },
      ...settings.rateLimits.rules
    ];
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    settings.rateLimits.rules = settings.rateLimits.rules.filter((r) => r.label !== '/api/updraft/v1/auth/');
    app.save(settings);
  }
);
