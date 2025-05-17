
// DataLens Tracking Script
(function() {
  // Global data lens object
  window.dl = window.dl || [];
  
  // Extract website ID from script src if available
  const getWebsiteIdFromScript = () => {
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
  };
  
  // Get the DataLens configuration from initialization or script tag
  const scriptWebsiteId = getWebsiteIdFromScript();
  const dlConfig = window.dl.find(item => item.websiteId) || { websiteId: scriptWebsiteId || 'unknown' };
  const websiteId = dlConfig.websiteId;
  
  console.log("DataLens tracking initialized for website:", websiteId);
  
  // Basic session and user data
  const sessionId = generateId();
  const visitorId = getOrCreateVisitorId();
  const sessionStartTime = new Date().getTime();
  let currentFunnelStep = null;
  let lastActiveTime = sessionStartTime;
  
  // Initialize tracking
  init();
  
  // Main initialization
  function init() {
    // Track page view immediately
    trackPageView();
    
    // Setup click tracking
    setupElementTracking();
    
    // Track session time and activity
    setupSessionTracking();
    
    // Register service worker for site-wide tracking
    registerServiceWorker();
    
    // Expose public API methods
    window.dl.push = pushHandler;
    window.dl.trackEvent = trackEvent;
    window.dl.trackFunnelStep = trackFunnelStep;
  }

  // Register the service worker
  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/tracking-worker.js')
        .then(registration => {
          console.log('DataLens tracking service worker registered:', registration.scope);
        })
        .catch(error => {
          console.error('Error registering tracking service worker:', error);
        });
      
      // Listen for messages from the service worker
      navigator.serviceWorker.addEventListener('message', event => {
        if (event.data && event.data.type === 'navigation') {
          // Process navigation event from other pages
          console.log('Navigation detected by service worker:', event.data);
          trackPageView(event.data.url, event.data.path);
        }
      });
    }
  }
  
  // Handle all items pushed to dl array
  function pushHandler(item) {
    if (item.event) {
      trackEvent(item.event, item.properties || {});
    } else if (item.funnelStep) {
      trackFunnelStep(item.funnelStep, item.properties || {});
    }
  }
  
  // Track page view with metadata
  function trackPageView(url = window.location.href, path = window.location.pathname) {
    const data = {
      websiteId: websiteId,
      url: url,
      path: path,
      title: document.title,
      referrer: document.referrer || null,
      visitorId: visitorId,
      sessionId: sessionId,
      timestamp: new Date().toISOString(),
      utmSource: getParameterByName('utm_source'),
      utmMedium: getParameterByName('utm_medium'),
      utmCampaign: getParameterByName('utm_campaign'),
      utmTerm: getParameterByName('utm_term'),
      utmContent: getParameterByName('utm_content'),
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      deviceType: getDeviceType()
    };
    
    // Send the data to the server
    sendToServer('/track/pageview', data);
    
    // Check if the current URL matches success patterns
    checkForSuccessPage(url, path);
  }
  
  // Track custom events
  function trackEvent(eventName, properties = {}) {
    const data = {
      websiteId: websiteId,
      event: eventName,
      url: window.location.href,
      path: window.location.pathname,
      visitorId: visitorId,
      sessionId: sessionId,
      timestamp: new Date().toISOString(),
      properties: properties
    };
    
    // Send the data to the server
    sendToServer('/track/event', data);
    
    // Update last active time
    lastActiveTime = new Date().getTime();
  }
  
  // Track funnel step
  function trackFunnelStep(stepName, properties = {}) {
    currentFunnelStep = stepName;
    
    const data = {
      websiteId: websiteId,
      event: 'funnel_step',
      funnelStep: stepName,
      url: window.location.href,
      path: window.location.pathname,
      visitorId: visitorId,
      sessionId: sessionId,
      timestamp: new Date().toISOString(),
      properties: properties
    };
    
    // Send the data to the server
    sendToServer('/track/funnel', data);
  }
  
  // Set up tracking for revenue elements and other interactive elements
  function setupElementTracking() {
    // Check for elements periodically as they may be dynamically added
    const observer = new MutationObserver(checkForInteractiveElements);
    observer.observe(document.body, { childList: true, subtree: true });
    
    // Initial check for elements
    setTimeout(checkForInteractiveElements, 1000);
    
    // Check for success page
    checkForSuccessPage();
  }
  
  // Check for success page based on URL or page content
  function checkForSuccessPage(url = window.location.href, path = window.location.pathname) {
    // Common success URL patterns
    const successUrlPatterns = [
      '/success', '/thank-you', '/checkout/complete', '/order-confirmation',
      '/payment-successful', '/purchase-complete', '/confirmation'
    ];
    
    // Check if current URL matches success patterns
    const isSuccessUrl = successUrlPatterns.some(pattern => 
      (path || window.location.pathname).toLowerCase().includes(pattern)
    );
    
    // Check for success message in page content
    const successTextPatterns = [
      'order confirmed', 'payment successful', 'thank you for your purchase',
      'order completed', 'transaction complete', 'purchase successful'
    ];
    
    const pageText = document.body.innerText.toLowerCase();
    const hasSuccessText = successTextPatterns.some(pattern => 
      pageText.includes(pattern)
    );
    
    if (isSuccessUrl || hasSuccessText) {
      trackEvent('purchase_completed', {
        path: path || window.location.pathname,
        success_page: true,
        isSuccessUrl: isSuccessUrl,
        hasSuccessText: hasSuccessText
      });
    }
  }
  
  // Check for interactive elements in the DOM
  function checkForInteractiveElements() {
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
      if (!element.dataset.dlTracked) {
        // Get visible text content
        const visibleText = (element.textContent || '').toLowerCase().trim() || 
                           (element.value || '').toLowerCase().trim() ||
                           element.alt?.toLowerCase().trim() || '';
        
        // Check for image elements specifically
        const isImage = element.tagName.toLowerCase() === 'img';
        const parentIsLink = element.parentElement && element.parentElement.tagName.toLowerCase() === 'a';
        
        // Check if this element might be revenue-related
        const isRevenueElement = 
          // Has revenue-related text
          revenueTextPatterns.some(pattern => visibleText.includes(pattern)) ||
          // Has explicit tracking attributes
          element.hasAttribute('data-dl-track') || 
          // Image with revenue-related alt text or inside a link
          (isImage && (visibleText.match(/buy|purchase|order|checkout/i) || parentIsLink));
        
        if (isRevenueElement) {
          // Mark as tracked to avoid duplicate event listeners
          element.dataset.dlTracked = 'true';
          
          // Add click event listener
          element.addEventListener('click', function(e) {
            const elementData = {
              elementType: element.tagName.toLowerCase(),
              elementText: visibleText,
              elementId: element.id,
              elementClass: element.className,
              isImage: isImage,
              parentIsLink: parentIsLink,
              path: window.location.pathname
            };
            
            trackEvent('revenue_element_click', elementData);
          });
        }
      }
    });
  }
  
  // Setup session tracking
  function setupSessionTracking() {
    // Track user activity for session duration calculations
    const activityEvents = ['click', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    
    activityEvents.forEach(eventType => {
      document.addEventListener(eventType, () => {
        lastActiveTime = new Date().getTime();
      }, { passive: true });
    });
    
    // Send periodic session heartbeats
    setInterval(() => {
      const now = new Date().getTime();
      const timeSinceLastActive = now - lastActiveTime;
      
      // Only send heartbeat if user was active in last 5 minutes
      if (timeSinceLastActive < 300000) { // 5 minutes
        sendToServer('/track/session', {
          websiteId: websiteId,
          visitorId: visitorId,
          sessionId: sessionId,
          timestamp: new Date().toISOString(),
          sessionDuration: Math.round((now - sessionStartTime) / 1000), // in seconds
          currentFunnelStep: currentFunnelStep,
          path: window.location.pathname
        });
      }
    }, 60000); // every minute
    
    // Track session end when page is unloaded
    window.addEventListener('beforeunload', () => {
      const sessionDuration = Math.round((new Date().getTime() - sessionStartTime) / 1000); // in seconds
      
      // Use sendBeacon for more reliable data sending during page unload
      if (navigator.sendBeacon) {
        const data = {
          websiteId: websiteId,
          visitorId: visitorId,
          sessionId: sessionId,
          timestamp: new Date().toISOString(),
          sessionDuration: sessionDuration,
          event: 'session_end',
          path: window.location.pathname
        };
        
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        navigator.sendBeacon('https://api.datalens.com/track/session', blob);
      }
    });
  }
  
  // Helper functions
  function generateId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  function getOrCreateVisitorId() {
    let id = localStorage.getItem('dl_visitor_id');
    if (!id) {
      id = generateId();
      localStorage.setItem('dl_visitor_id', id);
    }
    return id;
  }
  
  function getParameterByName(name) {
    const url = window.location.href;
    name = name.replace(/[\[\]]/g, '\\$&');
    const regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
    const results = regex.exec(url);
    if (!results) return null;
    if (!results[2]) return '';
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
  }
  
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
  
  function sendToServer(endpoint, data) {
    // Check if we have service worker active
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      // Use service worker to send data
      navigator.serviceWorker.controller.postMessage({
        type: 'track',
        endpoint: endpoint.replace('/track/', ''),
        trackingData: data
      });
    } else {
      // Fallback to direct sending
      // URL of the tracking endpoint
      const trackingServer = 'https://api.datalens.com';
      
      // Use navigator.sendBeacon for more reliable data sending
      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        navigator.sendBeacon(trackingServer + endpoint, blob);
      } else {
        // Fallback to fetch
        fetch(trackingServer + endpoint, {
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
})();
