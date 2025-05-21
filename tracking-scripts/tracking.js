
/**
 * DataLens Tracking Script
 * 
 * This is a consolidated tracking script that handles analytics tracking
 * with offline support through service workers.
 */

(function() {
  // DataLens Tracking - Configuration Module
  var dl_config = {
    websiteId: null,
    trackingEndpoint: 'https://fkrjiruxradrofgcozcp.supabase.co/functions/v1/track-event',
    sessionId: null,
    visitorId: null,
    sessionStartTime: null,
    lastActiveTime: null,
    currentFunnelStep: null
  };

  // DataLens Tracking - Utilities Module
  var dl_utils = (function() {
    // Generate a unique ID
    function generateId() {
      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }
    
    // Get or create a persistent visitor ID
    function getOrCreateVisitorId() {
      let id = localStorage.getItem('dl_visitor_id');
      if (!id) {
        id = generateId();
        localStorage.setItem('dl_visitor_id', id);
      }
      return id;
    }
    
    // Extract website ID from script src if available
    function getWebsiteIdFromScript() {
      const scripts = document.getElementsByTagName('script');
      for (let i = 0; i < scripts.length; i++) {
        const src = scripts[i].src || '';
        if (src.includes('datalens.com/tracking.js') || src.includes('/tracking.js')) {
          // Extract website ID from URL parameter if available
          const urlParams = new URLSearchParams(src.split('?')[1] || '');
          const websiteId = urlParams.get('id');
          if (websiteId) return websiteId;
        }
      }
      return null;
    }
    
    // Get URL parameter by name
    function getParameterByName(name) {
      const url = window.location.href;
      name = name.replace(/[\[\]]/g, '\\$&');
      const regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
      const results = regex.exec(url);
      if (!results) return null;
      if (!results[2]) return '';
      return decodeURIComponent(results[2].replace(/\+/g, ' '));
    }
    
    // Determine device type from user agent
    function getDeviceType() {
      const ua = navigator.userAgent;
      if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
        return 'tablet';
      }
      if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
        return 'mobile';
      }
      return 'desktop';
    }
    
    // Safe text getter - ensures no null exception when getting text
    function safeGetText(element) {
      if (!element) return '';
      if (typeof element.innerText !== 'undefined' && element.innerText) return element.innerText;
      if (typeof element.textContent !== 'undefined' && element.textContent) return element.textContent;
      return '';
    }
    
    return {
      generateId,
      getOrCreateVisitorId,
      getWebsiteIdFromScript,
      getParameterByName,
      getDeviceType,
      safeGetText
    };
  })();

  // DataLens Tracking - API Module
  var dl_api = (function() {
    // Send data to the tracking server
    function sendToServer(endpoint, data) {
      // Check if we have service worker active
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        // Use service worker to send data
        navigator.serviceWorker.controller.postMessage({
          type: 'track',
          endpoint: endpoint.replace('/', ''),
          trackingData: data
        });
      } else {
        // Fallback to direct sending
        const fullEndpoint = dl_config.trackingEndpoint + (endpoint.startsWith('/') ? endpoint : '/' + endpoint);
        
        // Use navigator.sendBeacon for more reliable data sending
        if (navigator.sendBeacon) {
          const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
          navigator.sendBeacon(fullEndpoint, blob);
        } else {
          // Fallback to fetch
          fetch(fullEndpoint, {
            method: 'POST',
            body: JSON.stringify(data),
            headers: {
              'Content-Type': 'application/json'
            },
            keepalive: true
          }).catch(e => console.error('DataLens tracking error:', e));
        }
      }
    }
    
    return {
      sendToServer
    };
  })();

  // DataLens Tracking - Page View Module
  var dl_page_view = (function() {
    // Track page view with metadata
    function trackPageView(url = window.location.href, path = window.location.pathname) {
      const data = {
        websiteId: dl_config.websiteId,
        url: url,
        path: path,
        title: document.title || '',
        referrer: document.referrer || null,
        visitorId: dl_config.visitorId,
        sessionId: dl_config.sessionId,
        timestamp: new Date().toISOString(),
        utmSource: dl_utils.getParameterByName('utm_source'),
        utmMedium: dl_utils.getParameterByName('utm_medium'),
        utmCampaign: dl_utils.getParameterByName('utm_campaign'),
        utmTerm: dl_utils.getParameterByName('utm_term'),
        utmContent: dl_utils.getParameterByName('utm_content'),
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        },
        deviceType: dl_utils.getDeviceType()
      };
      
      // Send the data to the server
      dl_api.sendToServer('/pageview', data);
      
      // Check if the current URL matches success patterns
      checkForSuccessPage(url, path);
    }

    // Check for success page based on URL or page content
    function checkForSuccessPage(url = window.location.href, path = window.location.pathname) {
      try {
        // Common success URL patterns
        const successUrlPatterns = [
          '/success', '/thank-you', '/checkout/complete', '/order-confirmation',
          '/payment-successful', '/purchase-complete', '/confirmation'
        ];
        
        // Check if current URL matches success patterns
        const isSuccessUrl = successUrlPatterns.some(pattern => 
          (path || window.location.pathname).toLowerCase().includes(pattern)
        );
        
        // Check for success message in page content - with proper null checks
        const successTextPatterns = [
          'order confirmed', 'payment successful', 'thank you for your purchase',
          'order completed', 'transaction complete', 'purchase successful'
        ];
        
        // Safely access document.body and check for text content
        let hasSuccessText = false;
        if (document && document.body) {
          const pageText = dl_utils.safeGetText(document.body);
          hasSuccessText = successTextPatterns.some(pattern => 
            pageText.toLowerCase().includes(pattern)
          );
        }
        
        if (isSuccessUrl || hasSuccessText) {
          dl_event_handler.trackEvent('purchase_completed', {
            path: path || window.location.pathname,
            success_page: true,
            isSuccessUrl: isSuccessUrl,
            hasSuccessText: hasSuccessText
          });
        }
      } catch (err) {
        console.error('Error checking for success page:', err);
      }
    }

    return {
      trackPageView,
      checkForSuccessPage
    };
  })();

  // DataLens Tracking - Event Handler Module
  var dl_event_handler = (function() {
    // Track custom events
    function trackEvent(eventName, properties = {}) {
      const data = {
        websiteId: dl_config.websiteId,
        event: eventName,
        url: window.location.href,
        path: window.location.pathname,
        visitorId: dl_config.visitorId,
        sessionId: dl_config.sessionId,
        timestamp: new Date().toISOString(),
        properties: properties
      };
      
      // Send the data to the server
      dl_api.sendToServer('/event', data);
      
      // Update last active time
      dl_config.lastActiveTime = new Date().getTime();
    }

    return {
      trackEvent
    };
  })();

  // DataLens Tracking - Element Tracking Module
  var dl_element_tracking = (function() {
    // Set up tracking for revenue elements and other interactive elements
    function setupElementTracking() {
      // Check for elements periodically as they may be dynamically added
      if (typeof MutationObserver !== 'undefined' && document && document.body) {
        const observer = new MutationObserver(checkForInteractiveElements);
        observer.observe(document.body, { childList: true, subtree: true });
        
        // Initial check for elements
        setTimeout(checkForInteractiveElements, 1000);
        
        // Check for success page
        dl_page_view.checkForSuccessPage();
      }
    }
    
    // Check for interactive elements in the DOM
    function checkForInteractiveElements() {
      // Skip if document is not available
      if (!document || !document.querySelectorAll) {
        return;
      }
      
      try {
        // Elements that might be related to revenue/conversions
        const revenueSelectorPatterns = [
          // Buttons
          'button', '[role="button"]', 'input[type="submit"]', 'input[type="button"]',
          // Links styled as buttons
          'a.button', '.btn', '.button', '.cta', 
          // Shopping related
          '.add-to-cart', '.buy-now', '.checkout', '.subscribe', 
          // Images that might be clickable for purchasing
          'img[onclick]', 'img.product-image[alt*="buy"]', 'img.cta', 
          // Custom elements
          '[data-dl-track="revenue"]', '[data-product-purchase]'
        ];
        
        // Common text patterns that suggest revenue actions
        const revenueTextPatterns = [
          'buy now', 'purchase', 'checkout', 'pay', 'subscribe',
          'add to cart', 'order now', 'complete order', 'complete purchase',
          'submit order', 'place order', 'confirm', 'sign up', 'join now',
          'get started', 'try it free', 'start trial', 'get access'
        ];
        
        // Find all potential interactive elements
        const elements = document.querySelectorAll(revenueSelectorPatterns.join(', '));
        
        elements.forEach(element => {
          if (!element || (element.dataset && element.dataset.dlTracked)) {
            return;
          }
          
          // Safely get text content using the utility function
          const elementText = dl_utils.safeGetText(element);
          const elementValue = element.value || '';
          const elementAlt = element.alt || '';
          
          const visibleText = (elementText || elementValue || elementAlt).toLowerCase().trim();
          
          // Check for image elements specifically
          const isImage = element.tagName && 
                          element.tagName.toLowerCase && 
                          element.tagName.toLowerCase() === 'img';
                          
          const parentIsLink = element.parentElement && 
                               element.parentElement.tagName && 
                               element.parentElement.tagName.toLowerCase && 
                               element.parentElement.tagName.toLowerCase() === 'a';
          
          // Check if this element might be revenue-related
          const isRevenueElement = 
            // Has revenue-related text
            revenueTextPatterns.some(pattern => visibleText.includes(pattern)) ||
            // Has explicit tracking attributes
            (element.hasAttribute && element.hasAttribute('data-dl-track')) || 
            // Image with revenue-related alt text or inside a link
            (isImage && ((visibleText.match && visibleText.match(/buy|purchase|order|checkout/i)) || parentIsLink));
          
          if (isRevenueElement && element.dataset) {
            // Mark as tracked to avoid duplicate event listeners
            element.dataset.dlTracked = 'true';
            
            // Add click event listener
            if (element.addEventListener) {
              element.addEventListener('click', function(e) {
                const elementData = {
                  elementType: element.tagName ? 
                                (element.tagName.toLowerCase ? element.tagName.toLowerCase() : element.tagName) 
                                : 'unknown',
                  elementText: visibleText,
                  elementId: element.id || '',
                  elementClass: element.className || '',
                  isImage: isImage,
                  parentIsLink: parentIsLink,
                  path: window.location.pathname
                };
                
                dl_event_handler.trackEvent('revenue_element_click', elementData);
              });
            }
          }
        });
      } catch (err) {
        console.error('Error in DataLens interactive elements detection:', err);
      }
    }

    return {
      setupElementTracking,
      checkForInteractiveElements
    };
  })();

  // DataLens Tracking - Funnel Tracking Module
  var dl_funnel = (function() {
    // Track funnel step
    function trackFunnelStep(stepName, properties = {}) {
      dl_config.currentFunnelStep = stepName;
      
      const data = {
        websiteId: dl_config.websiteId,
        event: 'funnel_step',
        funnelStep: stepName,
        url: window.location.href,
        path: window.location.pathname,
        visitorId: dl_config.visitorId,
        sessionId: dl_config.sessionId,
        timestamp: new Date().toISOString(),
        properties: properties
      };
      
      // Send the data to the server
      dl_api.sendToServer('/funnel', data);
    }

    return {
      trackFunnelStep
    };
  })();

  // DataLens Tracking - Session Module
  var dl_session = (function() {
    // Initialize session data
    function initialize() {
      dl_config.sessionId = dl_utils.generateId();
      dl_config.visitorId = dl_utils.getOrCreateVisitorId();
      dl_config.sessionStartTime = new Date().getTime();
      dl_config.lastActiveTime = dl_config.sessionStartTime;
    }
    
    // Setup session tracking
    function setupSessionTracking() {
      // Track user activity for session duration calculations
      const activityEvents = ['click', 'mousemove', 'keypress', 'scroll', 'touchstart'];
      
      activityEvents.forEach(eventType => {
        document.addEventListener(eventType, () => {
          dl_config.lastActiveTime = new Date().getTime();
        }, { passive: true });
      });
      
      // Send periodic session heartbeats
      setInterval(() => {
        const now = new Date().getTime();
        const timeSinceLastActive = now - dl_config.lastActiveTime;
        
        // Only send heartbeat if user was active in last 5 minutes
        if (timeSinceLastActive < 300000) { // 5 minutes
          dl_api.sendToServer('/session', {
            websiteId: dl_config.websiteId,
            visitorId: dl_config.visitorId,
            sessionId: dl_config.sessionId,
            timestamp: new Date().toISOString(),
            sessionDuration: Math.round((now - dl_config.sessionStartTime) / 1000), // in seconds
            currentFunnelStep: dl_config.currentFunnelStep,
            path: window.location.pathname
          });
        }
      }, 60000); // every minute
      
      // Track session end when page is unloaded
      window.addEventListener('beforeunload', () => {
        const sessionDuration = Math.round((new Date().getTime() - dl_config.sessionStartTime) / 1000); // in seconds
        
        // Use sendBeacon for more reliable data sending during page unload
        if (navigator.sendBeacon) {
          const data = {
            websiteId: dl_config.websiteId,
            visitorId: dl_config.visitorId,
            sessionId: dl_config.sessionId,
            timestamp: new Date().toISOString(),
            sessionDuration: sessionDuration,
            event: 'session_end',
            path: window.location.pathname
          };
          
          const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
          navigator.sendBeacon(`${dl_config.trackingEndpoint}/session`, blob);
        }
      });
    }
    
    return {
      initialize,
      setupSessionTracking
    };
  })();

  // DataLens Tracking - Events Module Main Entry Point
  var dl_events = (function() {
    // Handle all items pushed to dl array
    function pushHandler(item) {
      if (item.event) {
        dl_event_handler.trackEvent(item.event, item.properties || {});
      } else if (item.funnelStep) {
        dl_funnel.trackFunnelStep(item.funnelStep, item.properties || {});
      }
    }
    
    return {
      pushHandler,
      trackPageView: dl_page_view.trackPageView,
      trackEvent: dl_event_handler.trackEvent,
      trackFunnelStep: dl_funnel.trackFunnelStep,
      setupElementTracking: dl_element_tracking.setupElementTracking,
      checkForSuccessPage: dl_page_view.checkForSuccessPage,
      checkForInteractiveElements: dl_element_tracking.checkForInteractiveElements
    };
  })();

  // DataLens Tracking - Service Worker Module
  var dl_serviceWorker = (function() {
    // Register the service worker
    function registerServiceWorker() {
      if ('serviceWorker' in navigator) {
        // Try to use CDN version first for better delivery
        const serviceWorkerUrl = 'https://cdn.jsdelivr.net/gh/YG2705/datalens-tracking-scripts@main/tracking-scripts/tracking-worker.js';
        
        navigator.serviceWorker.register(serviceWorkerUrl)
          .then(registration => {
            console.log('DataLens tracking service worker registered:', registration.scope);
          })
          .catch(error => {
            console.error('Error registering tracking service worker from CDN:', error);
            
            // Fallback to local path if CDN fails
            navigator.serviceWorker.register('/tracking-worker.js')
              .then(registration => {
                console.log('DataLens tracking service worker registered from local path:', registration.scope);
              })
              .catch(fallbackError => {
                console.error('Failed to register tracking service worker from fallback path:', fallbackError);
              });
          });
        
        // Listen for messages from the service worker
        if (navigator.serviceWorker.addEventListener) {
          navigator.serviceWorker.addEventListener('message', event => {
            if (event && event.data && event.data.type === 'navigation') {
              // Process navigation event from other pages
              console.log('Navigation detected by service worker:', event.data);
              if (typeof dl_events !== 'undefined' && dl_events.trackPageView) {
                dl_events.trackPageView(event.data.url, event.data.path);
              }
            }
          });
        }
      }
    }
    
    return {
      registerServiceWorker
    };
  })();

  // Global data lens object
  window.dl = window.dl || [];
  
  // Initialize tracking
  init();
  
  // Main initialization
  function init() {
    try {
      // Extract website ID from script or existing config
      const scriptWebsiteId = dl_utils.getWebsiteIdFromScript();
      const dlConfig = Array.isArray(window.dl) ? window.dl.find(item => item.websiteId) : null;
      dl_config.websiteId = dlConfig ? dlConfig.websiteId : (scriptWebsiteId || 'unknown');
      
      console.log("DataLens tracking initialized for website:", dl_config.websiteId);
      
      // Initialize session data
      dl_session.initialize();
      
      // Track page view immediately
      dl_events.trackPageView();
      
      // Setup click tracking
      dl_events.setupElementTracking();
      
      // Track session time and activity
      dl_session.setupSessionTracking();
      
      // Register service worker for site-wide tracking
      dl_serviceWorker.registerServiceWorker();
      
      // Expose public API methods
      if (Array.isArray(window.dl)) {
        window.dl.push = dl_events.pushHandler;
      }
      window.dl.trackEvent = dl_events.trackEvent;
      window.dl.trackFunnelStep = dl_events.trackFunnelStep;
    } catch (err) {
      console.error("Error initializing DataLens tracking:", err);
    }
  }
})();
