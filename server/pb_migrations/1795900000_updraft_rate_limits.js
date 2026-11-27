// PocketBase ships its rate limiter disabled, so turn it on to throttle login guessing (default rules cover auth routes).
// Behind the required reverse proxy every request comes from localhost, so the client IP is read from the last
// X-Forwarded-For entry, which the proxy appends. Port 8090 is only published on localhost, so clients cannot skip it.
migrate(
  (app) => {
    const settings = app.settings();
    settings.rateLimits.enabled = true;
    settings.trustedProxy.headers = ['X-Forwarded-For'];
    settings.trustedProxy.useLeftmostIP = false;
    app.save(settings);
  },
  (app) => {
    const settings = app.settings();
    settings.rateLimits.enabled = false;
    settings.trustedProxy.headers = [];
    app.save(settings);
  }
);
