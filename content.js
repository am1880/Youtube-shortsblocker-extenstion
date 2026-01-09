(function () {
	// ...new file...
	const HOME = "https://www.youtube.com/";
	function isShortsUrl(url) {
		try {
			const u = new URL(url);
			return u.pathname.startsWith("/shorts/") || u.pathname === "/shorts";
		} catch (e) {
			return String(url).includes("/shorts/");
		}
	}
	function redirectIfShorts(url) {
		if (isShortsUrl(url)) {
			if (location.href !== HOME) location.replace(HOME);
		}
	}
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