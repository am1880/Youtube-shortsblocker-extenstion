(function () {
  let lastUrl = location.href;

  function redirectIfShorts() {
    if (location.pathname.startsWith("/shorts")) {
      window.location.replace("https://www.youtube.com/");
    }
  }

  // Run once on load
  redirectIfShorts();

  // Watch for URL changes (YouTube SPA behavior)
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      redirectIfShorts();
    }
  }).observe(document, { subtree: true, childList: true });
})();
