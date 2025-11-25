/**
 * Instant Navigation Handler
 * 
 * Intercepts navigation clicks and shows instant transition overlay
 * to hide browser's native loading bar during page transitions.
 * 
 * This makes the PWA feel like a native app with instant navigation.
 * CRITICAL: This is especially important for Android Chrome PWA which
 * shows a loading bar at the top during navigation.
 */

(function() {
  'use strict';

  // Create overlay element immediately
  const overlay = document.createElement('div');
  overlay.className = 'nav-transition-overlay';
  overlay.id = 'nav-transition-overlay';
  
  // Insert as FIRST child of body for maximum z-index effectiveness
  function insertOverlay() {
    if (document.body) {
      // Insert at the very beginning of body
      if (document.body.firstChild) {
        document.body.insertBefore(overlay, document.body.firstChild);
      } else {
        document.body.appendChild(overlay);
      }
    }
  }
  
  // Add to DOM on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', insertOverlay);
  } else {
    insertOverlay();
  }

  // Show overlay function - make it available globally for programmatic navigation
  window.showNavOverlay = function() {
    const transitionOverlay = document.getElementById('nav-transition-overlay');
    if (transitionOverlay) {
      transitionOverlay.classList.add('active');
    }
  };

  // Hide overlay function
  window.hideNavOverlay = function() {
    const transitionOverlay = document.getElementById('nav-transition-overlay');
    if (transitionOverlay) {
      transitionOverlay.classList.remove('active');
    }
  };

  // Intercept all navigation clicks
  document.addEventListener('click', (e) => {
    // Find if click was on a link or inside a link
    const link = e.target.closest('a');
    
    if (!link) return;
    
    const href = link.getAttribute('href');
    
    // Skip if:
    // - No href
    // - External link (contains http)
    // - Anchor link (starts with #)
    // - Opens in new tab
    // - Has download attribute
    // - JavaScript link
    if (!href || 
        href.startsWith('http') || 
        href.startsWith('#') || 
        href.startsWith('javascript:') ||
        link.target === '_blank' ||
        link.hasAttribute('download')) {
      return;
    }
    
    // Show overlay IMMEDIATELY before navigation
    window.showNavOverlay();
    
  }, { capture: true, passive: true });

  // Also intercept form submissions that navigate
  document.addEventListener('submit', (e) => {
    const form = e.target;
    if (form && form.action && !form.action.startsWith('javascript:')) {
      window.showNavOverlay();
    }
  }, { capture: true, passive: true });

  // Also intercept programmatic navigation (window.location changes)
  // Store original functions
  const originalAssign = window.location.assign;
  const originalReplace = window.location.replace;
  
  // Override with overlay-showing versions
  if (originalAssign) {
    window.location.assign = function(url) {
      if (url && !url.startsWith('#')) {
        window.showNavOverlay();
      }
      return originalAssign.call(window.location, url);
    };
  }
  
  if (originalReplace) {
    window.location.replace = function(url) {
      if (url && !url.startsWith('#')) {
        window.showNavOverlay();
      }
      return originalReplace.call(window.location, url);
    };
  }

  // Hide overlay when new page loads (with small delay to ensure content is rendered)
  window.addEventListener('pageshow', () => {
    // Small delay to ensure content is visible before removing overlay
    setTimeout(() => {
      window.hideNavOverlay();
    }, 100);
  });

  // Also hide on DOMContentLoaded for cases where pageshow doesn't fire
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      window.hideNavOverlay();
    }, 100);
  });

  // Fallback: hide overlay after a maximum time (in case of slow loads)
  window.addEventListener('load', () => {
    setTimeout(() => {
      window.hideNavOverlay();
    }, 200);
  });

})();
