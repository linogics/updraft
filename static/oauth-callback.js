// Landing page of the OAuth popup. The sync server redirects here with the result in the URL fragment.
// It hands the result to the app tab on a BroadcastChannel, because the provider's COOP header cuts window.opener.
(() => {
  const raw = location.hash.slice(1);
  // Drop the token from the address bar and the history right away.
  history.replaceState(null, '', location.pathname);

  let message = null;
  try {
    message = JSON.parse(decodeURIComponent(raw));
  } catch {
    // Opened by hand or damaged, nothing to send.
  }

  if (message && typeof message === 'object') {
    const channel = new BroadcastChannel('updraft-auth');
    channel.postMessage(message);
    channel.close();
  }

  // Works for a popup. A tab the user opened itself stays open with the text above.
  window.close();
})();
