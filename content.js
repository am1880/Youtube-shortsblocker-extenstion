(function () {
	const HOME = "https://www.youtube.com/";
	let isHovering = false;
	let hoverTimer = null;
	let pendingShortsUrl = null;

	function isShortsUrl(url) {
		if (!url) return false;
		try {
			const u = new URL(url, location.href);
			return u.pathname.startsWith("/shorts/") || u.pathname === "/shorts";
		} catch (e) {
			return String(url).includes("/shorts/");
		}
	}

	function performRedirect() {
		if (location.href !== HOME) location.replace(HOME);
	}

	function handleDetectedShorts(url, userInitiated = false) {
		if (!isShortsUrl(url)) return;
		// If user clicked (userInitiated) block immediately; otherwise defer if hovering
		if (userInitiated || !isHovering) {
			performRedirect();
		} else {
			pendingShortsUrl = url;
		}
	}

	function scheduleDeferredCheck() {
		if (hoverTimer) clearTimeout(hoverTimer);
		hoverTimer = setTimeout(() => {
			hoverTimer = null;
			if (pendingShortsUrl) {
				if (isShortsUrl(location.href)) performRedirect();
				pendingShortsUrl = null;
			}
		}, 200);
	}

	// track hover state (capture so we see it early)
	window.addEventListener("mouseover", () => {
		isHovering = true;
		if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
	}, { passive: true, capture: true });

	window.addEventListener("mouseout", () => {
		isHovering = false;
		scheduleDeferredCheck();
	}, { passive: true, capture: true });

	// Intercept clicks on anchors (capture phase) to prevent navigation to /shorts
	document.addEventListener("click", (e) => {
		try {
			if (e.defaultPrevented) return;
			const path = e.composedPath ? e.composedPath() : [e.target];
			for (let el of path) {
				if (!el) continue;
				// stop at document boundaries
				if (el.nodeType !== 1) continue;
				if (el.tagName && el.tagName.toLowerCase() === "a" && el.href) {
					if (isShortsUrl(el.href)) {
						e.preventDefault();
						e.stopImmediatePropagation();
						// if user requested new tab, open HOME in new tab, else redirect current
						if (e.button === 1 || e.ctrlKey || e.metaKey) {
							window.open(HOME, "_blank");
						} else {
							location.replace(HOME);
						}
						return;
					}
				}
			}
		} catch (err) {}
	}, true);

	// Override window.open to prevent programmatic opens to shorts
	(function () {
		const origOpen = window.open;
		window.open = function (url, target, features) {
			try {
				if (isShortsUrl(url)) url = HOME;
			} catch (e) {}
			return origOpen.call(this, url, target, features);
		};
	})();

	// intercept history API changes (SPA navigations)
	(function () {
		const origPush = history.pushState;
		const origReplace = history.replaceState;
		history.pushState = function () {
			const res = origPush.apply(this, arguments);
			try { handleDetectedShorts(location.href, false); } catch (e) {}
			return res;
		};
		history.replaceState = function () {
			const res = origReplace.apply(this, arguments);
			try { handleDetectedShorts(location.href, false); } catch (e) {}
			return res;
		};
		window.addEventListener("popstate", () => handleDetectedShorts(location.href, false), { passive: true });
	})();

	// initial check
	handleDetectedShorts(location.href, false);

	// fast fallback watcher for any URL changes (covers navigation methods not caught above)
	let last = location.href;
	setInterval(() => {
		if (location.href !== last) {
			last = location.href;
			handleDetectedShorts(last, false);
		}
	}, 200);
})();