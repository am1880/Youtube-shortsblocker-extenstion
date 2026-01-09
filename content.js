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

	function isThumbnailAncestor(el) {
		if (!el || el.nodeType !== 1) return null;
		return el.closest && el.closest("ytd-thumbnail, ytd-rich-grid-media, ytd-video-renderer, ytd-rich-item-renderer, ytd-grid-video-renderer, .ytd-thumbnail, .yt-core-image");
	}

	function stopPreviewIn(node) {
		if (!node) return;
		const videos = node.querySelectorAll ? node.querySelectorAll("video") : [];
		for (const v of videos) {
			try {
				// pause and remove autoplay attributes/sources that trigger preview
				v.pause && v.pause();
				v.removeAttribute && v.removeAttribute("autoplay");
				v.autoplay = false;
				v.muted = true;
				// optional: reset currentTime to prevent resume
				try { v.currentTime = 0; } catch (e) {}
			} catch (e) {}
		}
	}

	// capture mouseover/mouseenter on thumbnail ancestors and immediately pause any preview videos
	document.addEventListener("mouseover", (e) => {
		try {
			const target = e.target;
			const thumb = isThumbnailAncestor(target);
			if (thumb) stopPreviewIn(thumb);
		} catch (err) {}
	}, { passive: true, capture: true });

	// Also cover pointerenter (some previews start on pointerenter)
	document.addEventListener("pointerenter", (e) => {
		try {
			const target = e.target;
			const thumb = isThumbnailAncestor(target);
			if (thumb) stopPreviewIn(thumb);
		} catch (err) {}
	}, { passive: true, capture: true });

	// MutationObserver: pause/remove autoplay for videos added dynamically
	const observer = new MutationObserver((mutations) => {
		for (const m of mutations) {
			if (m.addedNodes && m.addedNodes.length) {
				for (const node of m.addedNodes) {
					try {
						if (node.nodeType === 1) {
							// if a thumbnail-like node added, stop previews inside
							if (isThumbnailAncestor(node) || node.querySelector && node.querySelector("video")) {
								stopPreviewIn(node);
							}
						}
					} catch (e) {}
				}
			}
		}
	});
	try {
		observer.observe(document.documentElement || document.body, { childList: true, subtree: true });
	} catch (e) {}

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

	// Identify specific coordinates and treat as hover
	const TARGET_X = 194.78;
	const TARGET_Y = 292.17;
	const COORD_TOLERANCE = 1.0;
	let atTargetPoint = false;

	document.addEventListener("mousemove", (e) => {
		try {
			const x = e.clientX, y = e.clientY;
			const near = Math.abs(x - TARGET_X) <= COORD_TOLERANCE && Math.abs(y - TARGET_Y) <= COORD_TOLERANCE;
			if (near && !atTargetPoint) {
				atTargetPoint = true;
				// treat as hovering while at the point
				isHovering = true;
				// pause any preview video at that point
				const el = document.elementFromPoint(x, y);
				try { if (el) stopPreviewIn(el); } catch (err) {}
				if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
			} else if (!near && atTargetPoint) {
				atTargetPoint = false;
				// end hover state and schedule deferred checks
				isHovering = false;
				scheduleDeferredCheck();
			}
		} catch (err) {}
	}, { passive: true, capture: true });
})();