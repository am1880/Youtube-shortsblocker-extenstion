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

	// add thumbnail-blanking constants and helpers
	// accept multiple thumbnail target sizes
	const TARGET_SIZES = [
		{ width: 194.78, height: 292.17 },
		{ width: 272.18, height: 408.27 }
	];
	const SIZE_TOLERANCE = 1.0;

	function isRectThumbnailSize(rect) {
		try {
			if (!rect) return false;
			for (const t of TARGET_SIZES) {
				if (Math.abs(rect.width - t.width) <= SIZE_TOLERANCE &&
					Math.abs(rect.height - t.height) <= SIZE_TOLERANCE) {
					return true;
				}
			}
			return false;
		} catch (e) { return false; }
	}

	function blankThumbnail(node) {
		if (!node || node.nodeType !== 1) return;
		// avoid repeated work
		if (node.dataset.__thumbBlanked === "1") return;
		let rect;
		try { rect = node.getBoundingClientRect(); } catch (e) { rect = null; }
		if (!isRectThumbnailSize(rect)) return;
		node.dataset.__thumbBlanked = "1";
		// remove/disable videos
		try {
			const vids = node.querySelectorAll ? node.querySelectorAll("video") : [];
			for (const v of vids) {
				try { v.pause && v.pause(); v.removeAttribute && v.removeAttribute("src"); v.src = ""; v.load && v.load(); } catch (e) {}
			}
		} catch (e) {}
		// remove images
		try {
			const imgs = node.querySelectorAll ? node.querySelectorAll("img") : [];
			for (const img of imgs) {
				try { img.removeAttribute && img.removeAttribute("src"); img.src = ""; img.alt = ""; } catch (e) {}
			}
		} catch (e) {}
		// neutralize styling but preserve layout
		try {
			if (rect) {
				node.style.minWidth = rect.width + "px";
				node.style.minHeight = rect.height + "px";
			}
			node.style.backgroundImage = "none";
			node.style.background = "transparent";
			node.style.pointerEvents = "none";
			node.style.userSelect = "none";
			node.innerHTML = "";
		} catch (e) {}
	}

	function scanAndBlankAll() {
		try {
			const selectors = [
				"ytd-thumbnail",
				"ytd-rich-grid-media",
				"ytd-video-renderer",
				"ytd-grid-video-renderer",
				"ytd-rich-item-renderer",
				".ytd-thumbnail",
				".yt-core-image",
				"a[href]",
				"div"
			];
			const seen = new Set();
			for (const sel of selectors) {
				const list = document.querySelectorAll ? document.querySelectorAll(sel) : [];
				for (const node of list) {
					if (!node || seen.has(node)) continue;
					seen.add(node);
					blankThumbnail(node);
				}
			}
			const all = document.getElementsByTagName ? document.getElementsByTagName("*") : [];
			for (let i = 0; i < Math.min(all.length, 5000); i++) {
				const node = all[i];
				if (!node || seen.has(node)) continue;
				try {
					const rect = node.getBoundingClientRect && node.getBoundingClientRect();
					if (isRectThumbnailSize(rect)) blankThumbnail(node);
				} catch (e) {}
			}
		} catch (e) {}
	}

	// observe DOM for additions/attribute changes
	const blankObserver = new MutationObserver((mutations) => {
		for (const m of mutations) {
			if (m.addedNodes && m.addedNodes.length) {
				for (const node of m.addedNodes) {
					try {
						if (node.nodeType !== 1) continue;
						blankThumbnail(node);
						if (node.querySelectorAll) {
							const desc = node.querySelectorAll("ytd-thumbnail, img, video, .ytd-thumbnail, .yt-core-image, ytd-video-renderer");
							for (const d of desc) blankThumbnail(d);
						}
					} catch (e) {}
				}
			}
			if (m.type === "attributes" && m.target) {
				try { blankThumbnail(m.target); } catch (e) {}
			}
		}
	});
	try {
		blankObserver.observe(document.documentElement || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "style", "class"] });
	} catch (e) {}

	// re-scan on resize and periodically
	window.addEventListener("resize", () => { try { scanAndBlankAll(); } catch (e) {} }, { passive: true });
	setInterval(() => { try { scanAndBlankAll(); } catch (e) {} }, 2000);

	// initial scan
	try { scanAndBlankAll(); } catch (e) {}
})();