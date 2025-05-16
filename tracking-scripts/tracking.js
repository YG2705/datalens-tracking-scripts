(function () {
  const scriptTag = document.currentScript;
  const websiteId = new URLSearchParams(scriptTag.src.split('?')[1]).get('id') || 'unknown';

  const SUPABASE_ENDPOINT = 'https://fkrjiruxradrofgcozcp.supabase.co/functions/v1/track-event';

  function sendEvent(eventName, data = {}) {
    const payload = {
      website_id: websiteId,
      event_name: eventName,
      url: window.location.href,
      referrer: document.referrer,
      timestamp: new Date().toISOString(),
      ...data,
    };

    navigator.sendBeacon(SUPABASE_ENDPOINT, JSON.stringify(payload));
  }

  // Track page view
  sendEvent('page_view');

  // Track clicks on buttons and links
  document.addEventListener('click', (e) => {
    const target = e.target.closest('button, a');
    if (!target) return;

    const label = target.innerText || target.getAttribute('aria-label') || target.id || 'unknown';
    const type = target.tagName.toLowerCase() === 'a' ? 'link_click' : 'button_click';

    sendEvent(type, { label });
  });
})();
