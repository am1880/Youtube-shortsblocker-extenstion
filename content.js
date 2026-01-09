(function () {
	const HOME = "https://www.youtube.com/";
	let isHovering = false;
	let hoverTimer = null;
	let pendingShortsUrl = null;

	// only run actions when the YouTube tab is visible and focused
	let isActive = (document.visibilityState === "visible" && document.hasFocus());
	document.addEventListener("visibilitychange", () => {
		isActive = (document.visibilityState === "visible" && document.hasFocus());
		if (isActive) {
			try { scanAndBlankAll(); } catch (e) {}
		}
	}, { passive: true });
	window.addEventListener("focus", () => { isActive = true; try { scanAndBlankAll(); } catch (e) {} }, { passive: true });
	window.addEventListener("blur", () => { isActive = false; }, { passive: true });

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
		if (!isActive) return;
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
		// shorter defer so redirects happen faster after hover ends
		hoverTimer = setTimeout(() => {
			hoverTimer = null;
			if (pendingShortsUrl) {
				if (isShortsUrl(location.href)) performRedirect();
				pendingShortsUrl = null;
			}
		}, 100);
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

	// Early interceptors: pointer/mouse/touch/auxclick in capture phase to block navigation to /shorts immediately
	function interceptNavEvent(e, userInitiated = true) {
		// only intercept when active
		if (!isActive) return;
		try {
			if (e.defaultPrevented) return;
			const path = e.composedPath ? e.composedPath() : [e.target];
			for (const el of path) {
				if (!el || el.nodeType !== 1) continue;
				// anchor with href
				if (el.tagName && el.tagName.toLowerCase() === "a" && el.href) {
					if (isShortsUrl(el.href)) {
						e.preventDefault();
						e.stopImmediatePropagation();
						// open HOME in new tab if requested, else replace current
						if (e.button === 1 || e.ctrlKey || e.metaKey) window.open(HOME, "_blank");
						else location.replace(HOME);
						return;
					}
				}
				// elements that store navigation in data-href or href-like attributes
				const hrefAttr = el.getAttribute && (el.getAttribute("href") || el.getAttribute("data-href") || el.dataset && el.dataset.href);
				if (hrefAttr && isShortsUrl(hrefAttr)) {
					e.preventDefault();
					e.stopImmediatePropagation();
					if (e.button === 1 || e.ctrlKey || e.metaKey) window.open(HOME, "_blank");
					else location.replace(HOME);
					return;
				}
			}
		} catch (err) {}
	}
	document.addEventListener("pointerdown", (e) => interceptNavEvent(e, true), { capture: true, passive: false });
	document.addEventListener("mousedown", (e) => interceptNavEvent(e, true), { capture: true, passive: false });
	document.addEventListener("touchstart", (e) => interceptNavEvent(e, true), { capture: true, passive: false });
	document.addEventListener("auxclick", (e) => interceptNavEvent(e, true), { capture: true, passive: false });

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

	// Replace interval URL watcher with a requestAnimationFrame loop for faster detection
	let last = location.href;
	(function watchHref(){
		try {
			if (isActive && location.href !== last) {
				last = location.href;
				// use existing redirect handling
				try { redirectIfShorts(last); } catch (e) {}
			}
		} catch (e) {}
		requestAnimationFrame(watchHref);
	})();

	// add thumbnail-blanking constants and helpers
	// replace fixed size targets with aspect-ratio based detection
	const TARGET_RATIOS = [
		2 / 3,   // ~0.6667 (portrait 2:3)
		9 / 16   // ~0.5625 (portrait 9:16)
	];
	const RATIO_TOLERANCE = 0.08; // allowable deviation from target ratio

	function isRectThumbnailSize(rect) {
		try {
			if (!rect || !rect.width || !rect.height) return false;
			const ratio = rect.width / rect.height;
			for (const tr of TARGET_RATIOS) {
				if (Math.abs(ratio - tr) <= RATIO_TOLERANCE) return true;
			}
			// fallback: some elements may report swapped dims; check inverse
			const inv = rect.height / rect.width;
			for (const tr of TARGET_RATIOS) {
				if (Math.abs(inv - tr) <= RATIO_TOLERANCE) return true;
			}
			return false;
		} catch (e) { return false; }
	}

	function blankThumbnail(node) {
		// only blank when active
		if (!isActive) return;
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
		// don't scan when inactive
		if (!isActive) return;
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