/**
 * AJAX Navigation Handler
 * 
 * Eliminates Android Chrome's loading bar by intercepting link clicks
 * and loading pages via fetch() instead of actual browser navigation.
 * 
 * This mimics SPA behavior without requiring a full rewrite.
 */

(function() {
  'use strict';

  // Track if AJAX nav is active
  let isNavigating = false;

  // Pages that should use AJAX navigation (internal app pages)
  const AJAX_PAGES = [
    '/index.html',
    '/pages/dashboard.html',
    '/pages/workout.html',
    '/pages/nutrition.html',
    '/pages/profile.html',
    '/pages/workout-completion.html',
    // Also match without leading slash
    'index.html',
    'pages/dashboard.html',
    'pages/workout.html',
    'pages/nutrition.html',
    'pages/profile.html',
    'pages/workout-completion.html',
    // Relative paths from pages folder
    'dashboard.html',
    'workout.html',
    'nutrition.html',
    'profile.html',
    'workout-completion.html',
    '../index.html',
    // Root paths
    '/',
    './',
    '../'
  ];

  /**
   * Check if a URL should use AJAX navigation
   */
  function shouldUseAjax(href) {
    if (!href) return false;
    
    // Skip external links
    if (href.startsWith('http') && !href.includes(window.location.host)) {
      return false;
    }
    
    // Skip anchors, javascript, mailto, etc.
    if (href.startsWith('#') || 
        href.startsWith('javascript:') || 
        href.startsWith('mailto:') ||
        href.startsWith('tel:')) {
      return false;
    }

    // Skip links with query params (often auth-related)
    if (href.includes('?') && (
        href.includes('access_token') ||
        href.includes('refresh_token') ||
        href.includes('type=') ||
        href.includes('token_hash') ||
        href.includes('code=')
    )) {
      return false;
    }

    // Check if it's one of our app pages
    const normalizedHref = href.replace(window.location.origin, '');
    return AJAX_PAGES.some(page => normalizedHref.endsWith(page) || normalizedHref === page);
  }

  /**
   * Resolve relative URL to absolute
   */
  function resolveUrl(href) {
    const a = document.createElement('a');
    a.href = href;
    return a.href;
  }

  /**
   * Extract the main content and scripts from fetched HTML
   */
  function parsePageContent(html) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    return {
      title: doc.title,
      body: doc.body.innerHTML,
      bodyClasses: doc.body.className,
      // Get inline scripts that need to be re-executed
      scripts: Array.from(doc.querySelectorAll('script:not([src])')).map(s => s.innerHTML),
      // Get external scripts specific to the page
      externalScripts: Array.from(doc.querySelectorAll('script[src]'))
        .map(s => s.getAttribute('src'))
        .filter(src => !src.includes('ajax-navigation.js')) // Don't reload this script
    };
  }

  /**
   * Execute scripts after page load
   */
  function executeScripts(scripts) {
    scripts.forEach(scriptContent => {
      try {
        // Create new script element and execute
        const script = document.createElement('script');
        script.textContent = scriptContent;
        document.body.appendChild(script);
        // Clean up
        setTimeout(() => script.remove(), 100);
      } catch (e) {
        console.warn('[AJAX Nav] Script execution error:', e);
      }
    });
  }

  /**
   * Reinitialize common app functionality after navigation
   */
  function reinitializeApp() {
    // Dispatch custom event for app scripts to listen to
    window.dispatchEvent(new CustomEvent('ajax-navigation-complete'));
    
    // Dispatch DOMContentLoaded-like event
    window.dispatchEvent(new Event('DOMContentLoaded'));
    
    // Trigger load event handlers
    window.dispatchEvent(new Event('load'));

    // Re-run viewport.js if it exists
    if (typeof updateDvhProperty === 'function') {
      updateDvhProperty();
    }

    // Scroll to top
    window.scrollTo(0, 0);
  }

  /**
   * Navigate to a page using AJAX
   */
  async function navigateAjax(href, pushState = true) {
    if (isNavigating) return;
    isNavigating = true;

    const absoluteUrl = resolveUrl(href);
    
    console.log('[AJAX Nav] Loading:', absoluteUrl);

    try {
      const response = await fetch(absoluteUrl, {
        method: 'GET',
        headers: {
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'same-origin'
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const pageContent = parsePageContent(html);

      // Update the page
      document.title = pageContent.title;
      document.body.innerHTML = pageContent.body;
      document.body.className = pageContent.bodyClasses;

      // Update URL in history
      if (pushState) {
        history.pushState({ ajaxNav: true }, pageContent.title, absoluteUrl);
      }

      // Execute page scripts
      executeScripts(pageContent.scripts);

      // Reinitialize app
      reinitializeApp();

      console.log('[AJAX Nav] Complete:', absoluteUrl);

    } catch (error) {
      console.error('[AJAX Nav] Failed, falling back to normal navigation:', error);
      // Fall back to normal navigation
      window.location.href = href;
    } finally {
      isNavigating = false;
    }
  }

  /**
   * Handle link clicks
   */
  function handleClick(e) {
    // Find the link element
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    
    // Check if we should use AJAX navigation
    if (!shouldUseAjax(href)) return;

    // Skip if modifier keys are pressed (user wants new tab/window)
    if (e.ctrlKey || e.shiftKey || e.metaKey || e.altKey) return;

    // Skip if link explicitly opens in new tab
    if (link.target === '_blank') return;

    // Prevent default navigation
    e.preventDefault();
    e.stopPropagation();

    // Navigate via AJAX
    navigateAjax(href);
  }

  /**
   * Handle browser back/forward
   */
  function handlePopState(e) {
    if (e.state && e.state.ajaxNav) {
      navigateAjax(window.location.href, false);
    } else {
      // For non-AJAX history entries, do normal navigation
      window.location.reload();
    }
  }

  /**
   * Initialize AJAX navigation
   */
  function init() {
    // Only enable in standalone PWA mode to avoid issues during development
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         window.navigator.standalone === true;
    
    // Also check if we're in a PWA context via the display-mode
    const isPWA = isStandalone || 
                  document.referrer.includes('android-app://') ||
                  window.matchMedia('(display-mode: fullscreen)').matches ||
                  window.matchMedia('(display-mode: minimal-ui)').matches;

    // Enable for all contexts for testing - can restrict to PWA only if needed
    // if (!isPWA) {
    //   console.log('[AJAX Nav] Not in PWA mode, disabled');
    //   return;
    // }

    console.log('[AJAX Nav] Initializing...');

    // Capture all clicks
    document.addEventListener('click', handleClick, { capture: true });

    // Handle browser back/forward
    window.addEventListener('popstate', handlePopState);

    // Mark current page in history
    history.replaceState({ ajaxNav: true }, document.title, window.location.href);

    console.log('[AJAX Nav] Ready');
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for programmatic navigation
  window.ajaxNavigate = navigateAjax;

})();
