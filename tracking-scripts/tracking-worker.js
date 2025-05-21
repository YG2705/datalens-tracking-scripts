
/**
 * DataLens Tracking Service Worker
 * 
 * This is a consolidated service worker with offline support and 
 * automatic retry capabilities for tracking events.
 */

// DataLens Tracking Worker - Configuration Module
const WORKER_CONFIG = {
  version: '1.0',
  cacheName: 'datalens-tracking-cache-v1',
  trackingEndpoint: 'https://fkrjiruxradrofgcozcp.supabase.co/functions/v1/track-event',
  dbName: 'datalens-tracking',
  dbVersion: 1
};

// Include IndexedDB from CDN for offline capability
importScripts('https://cdn.jsdelivr.net/npm/idb@7/build/iife/index-min.js');

// Initialize IndexedDB storage for failed events
const initDatabase = () => {
  return idb.openDB(WORKER_CONFIG.dbName, WORKER_CONFIG.dbVersion, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('failedEvents')) {
        db.createObjectStore('failedEvents', { keyPath: 'id', autoIncrement: true });
      }
    }
  });
};

// Guard against initialization errors
let dbPromise;
try {
  dbPromise = initDatabase();
} catch (error) {
  console.error('[SW] Database initialization failed:', error);
  dbPromise = Promise.resolve(null);
}

// DataLens Tracking Worker - Database Module
const DB = {
  // Store a failed event for later retry
  storeFailedEvent: async (eventData) => {
    try {
      const db = await dbPromise;
      if (!db) {
        console.error('[SW] Database not available, cannot store event');
        return;
      }
      
      await db.add('failedEvents', { ...eventData });
      console.log('[SW] Event stored for later retry');
      
      // Register a background-sync so the browser retries when online
      if (self.registration && self.registration.sync) {
        await self.registration.sync.register('datalens-tracking-sync');
      }
    } catch (storeError) {
      console.error('[SW] Failed to store event for later:', storeError);
    }
  },

  // Get all stored failed events
  getAllFailedEvents: async () => {
    try {
      const db = await dbPromise;
      if (!db) return [];
      return await db.getAll('failedEvents');
    } catch (error) {
      console.error('[SW] Error getting failed events:', error);
      return [];
    }
  },

  // Delete a failed event after successful sending
  deleteFailedEvent: async (eventId) => {
    try {
      const db = await dbPromise;
      if (!db) return;
      await db.delete('failedEvents', eventId);
    } catch (error) {
      console.error('[SW] Error deleting event:', error);
    }
  },

  // Clean up old events (older than 7 days)
  cleanupOldEvents: async () => {
    try {
      const db = await dbPromise;
      if (!db) return;
      
      const all = await db.getAll('failedEvents');
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      for (const ev of all) {
        if (ev.timestamp && new Date(ev.timestamp) < sevenDaysAgo) {
          await db.delete('failedEvents', ev.id);
          console.log(`[SW] Deleted old event ${ev.id} from ${ev.timestamp}`);
        }
      }
    } catch (cleanupError) {
      console.error('[SW] Error cleaning up old events:', cleanupError);
    }
  }
};

// DataLens Tracking Worker - Network Module
const NETWORK = {
  // Send tracking data to the backend
  sendTrackingData: async (endpoint, data) => {
    const url = `${WORKER_CONFIG.trackingEndpoint}/${endpoint || 'event'}`;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data),
        keepalive: true
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }
      
      return true;
    } catch (err) {
      console.warn('[SW] Network error sending tracking data:', err);
      await DB.storeFailedEvent(data);
      return false;
    }
  },

  // Sync all failed tracking events
  syncTrackingData: async () => {
    try {
      const all = await DB.getAllFailedEvents();
      console.log(`[SW] Syncing ${all.length} offline tracking events`);
      
      // Loop through and send all stored events
      for (const ev of all) {
        try {
          // Ensure the source is preserved, but mark that it was resent via sync
          if (!ev.source) {
            ev.source = 'service-worker';
          }
          ev.resent = true;
          
          const result = await NETWORK.sendTrackingData('event', ev);
          if (result) {
            await DB.deleteFailedEvent(ev.id);
            console.log(`[SW] Successfully resent event ${ev.id}`);
          } else {
            console.error('[SW] Resend failed, will retry later');
            break; // Stop loop so sync will fire again
          }
        } catch (err) {
          console.error('[SW] Resend failed, will retry later:', err);
          break; // Stop loop so sync will fire again
        }
      }
      
      // Clean up old events
      await DB.cleanupOldEvents();
    } catch (error) {
      console.error('[SW] Error syncing tracking data:', error);
    }
  }
};

// DataLens Tracking Worker - Event Handlers Module
const HANDLERS = {
  // Handle navigation events across the site
  handleNavigation: async (event) => {
    if (!event || !event.request || event.request.method !== 'GET') return;
    
    try {
      const url = new URL(event.request.url);
      const isNavigation = event.request.mode === 'navigate';
      
      if (!isNavigation) return;
      
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
      console.error('Error in tracking service worker navigation handler:', err);
    }
  },

  // Handle tracking events from the page
  handleTrackingMessage: (event) => {
    if (!event || !event.data || event.data.type !== 'track') return;
    
    try {
      // Forward tracking data to the central tracking endpoint
      const trackingData = event.data.trackingData;
      
      if (!trackingData) {
        console.warn('[SW] Received tracking event with no data');
        return;
      }
      
      // Log just the event name, not the full payload
      console.log('[SW] Processing event:', trackingData.eventName || trackingData.event || 'unnamed event');
      
      // Preserve the source or set it to 'service-worker' if not already set
      if (!trackingData.source) {
        trackingData.source = 'service-worker';
      }
      
      // Send the data to the backend
      NETWORK.sendTrackingData(event.data.endpoint || 'event', trackingData);
    } catch (error) {
      console.error('[SW] Error handling tracking message:', error);
    }
  }
};

// Service worker lifecycle events
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
  event.waitUntil(HANDLERS.handleNavigation(event));
});

// Listen for tracking events from the page
self.addEventListener('message', event => {
  HANDLERS.handleTrackingMessage(event);
});

// Handle background sync for offline tracking data
self.addEventListener('sync', event => {
  if (event.tag === 'datalens-tracking-sync') {
    event.waitUntil(NETWORK.syncTrackingData());
  }
});

// Handle service worker shutdown
self.addEventListener('beforeunload', (ev) => {
  console.log('Tracking service worker shutting down due to:', ev.detail?.reason);
});
