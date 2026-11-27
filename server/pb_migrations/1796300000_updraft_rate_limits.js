// PocketBase ships its rate limiter disabled, so turn it on to throttle login guessing.
// Behind the required reverse proxy every request comes from localhost, so the client IP is read from the last
// X-Forwarded-For entry, which the proxy appends. Port 8090 is only published on localhost, so clients cannot skip it.
// The updraft auth routes are limited in the hooks, because only a hook can send Retry-After.
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
