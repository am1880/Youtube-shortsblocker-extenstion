(function () {
	const HOME = "https://www.youtube.com/";
	let isHovering = false;
	let hoverTimer = null;
	let pendingShortsUrl = null;

	function isShortsUrl(url) {
		try {
			const u = new URL(url);
			return u.pathname.startsWith("/shorts/") || u.pathname === "/shorts";
		} catch (e) {
			return String(url).includes("/shorts/");
		}
	}

	function performRedirect() {
		if (location.href !== HOME) location.replace(HOME);
	}

	function redirectIfShorts(url) {
		if (!isShortsUrl(url)) return;
		if (isHovering) {
			// Defer redirect until hover ends
			pendingShortsUrl = url;
			return;
		}
		performRedirect();
	}

	// handle deferred redirect after hover ends
	function scheduleDeferredCheck() {
		if (hoverTimer) clearTimeout(hoverTimer);
		hoverTimer = setTimeout(() => {
			hoverTimer = null;
			if (pendingShortsUrl) {
				// double-check URL still shorts before redirecting
				if (isShortsUrl(location.href)) performRedirect();
				pendingShortsUrl = null;
			}
		}, 250);
	}

	// track hover state
	window.addEventListener("mouseover", () => {
		isHovering = true;
		if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
	}, { passive: true, capture: true });

	window.addEventListener("mouseout", () => {
		isHovering = false;
		scheduleDeferredCheck();
	}, { passive: true, capture: true });

	// initial check
	redirectIfShorts(location.href);

	// intercept history API changes
	(function () {
		const origPush = history.pushState;
		const origReplace = history.replaceState;
		history.pushState = function () {
			const res = origPush.apply(this, arguments);
			try { redirectIfShorts(location.href); } catch (e) {}
			return res;
		};
		history.replaceState = function () {
			const res = origReplace.apply(this, arguments);
			try { redirectIfShorts(location.href); } catch (e) {}
			return res;
		};
		window.addEventListener("popstate", () => redirectIfShorts(location.href), { passive: true });
	})();

	// fallback watcher for any other URL changes
	let last = location.href;
	setInterval(() => {
		if (location.href !== last) {
			last = location.href;
			redirectIfShorts(last);
		}
	}, 300);
})();
