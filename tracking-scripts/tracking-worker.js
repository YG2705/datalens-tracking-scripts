// DataLens Tracking Service Worker
const TRACKING_VERSION = '1.0';

// Cache name for the tracking service worker
const CACHE_NAME = 'datalens-tracking-cache-v1';

// Track these events
self.addEventListener('install', event => {
  self.skipWaiting(); // Ensure the service worker activates immediately
  console.log('DataLens Tracking Service Worker installed');
});

self.addEventListener('activate', event => {
  console.log('DataLens Tracking Service Worker activated');
  event.waitUntil(clients.claim()); // Take control of all clients immediately
});

// Handle navigation events across the site
self.addEventListener('fetch', event => {
  // Only process GET requests for HTML pages
  if (event.request.method !== 'GET') return;
  
  const url = new URL(event.request.url);
  const isHTMLPage = event.request.mode === 'navigate' || 
                    (event.request.destination === 'document' ||
                     url.pathname.endsWith('.html') ||
                     url.pathname.endsWith('/'));
  
  if (!isHTMLPage) return;
  
  // Pass navigation info to the tracking script
  event.waitUntil(
    (async () => {
      try {
        const allClients = await clients.matchAll({ includeUncontrolled: true });
        
        allClients.forEach(client => {
          // Send page navigation data to the client to track
          client.postMessage({
            type: 'navigation',
            url: event.request.url,
            path: url.pathname,
            time: new Date().toISOString()
          });
        });
      } catch (err) {
        console.error('Error in tracking service worker:', err);
      }
    })()
  );
});

// Listen for tracking events from the page
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'track') {
    // Forward tracking data to the central tracking endpoint
    const trackingData = event.data.trackingData;
    
    // Use fetch to send the data to the tracking endpoint
    fetch('https://api.datalens.com/track/' + (event.data.endpoint || 'event'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(trackingData),
      // Use keepalive to ensure the request completes even if the page is unloaded
      keepalive: true
    }).catch(error => {
      console.error('Error sending tracking data:', error);
    });
  }
});

// Handle background sync for offline tracking data
self.addEventListener('sync', event => {
  if (event.tag === 'datalens-tracking-sync') {
    event.waitUntil(syncTrackingData());
  }
});

// Function to sync offline tracking data
async function syncTrackingData() {
  try {
    // Implementation would retrieve stored tracking data from IndexedDB
    // and send it to the tracking server
    console.log('Syncing offline tracking data');
  } catch (error) {
    console.error('Error syncing tracking data:', error);
  }
}
