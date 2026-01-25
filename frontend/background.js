
/**
 * KeyShield Background Script
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SAVE_KEY') {
    const { name, value, domain, providerId } = message.payload;
    
    // Construct pre-fill URL
    const url = chrome.runtime.getURL('index.html') + 
      `?action=add&name=${encodeURIComponent(name)}&value=${encodeURIComponent(value)}&domain=${encodeURIComponent(domain)}&provider=${encodeURIComponent(providerId)}`;
    
    // Open dashboard or extension page
    chrome.tabs.create({ url });
  }
});

// Basic heartbeat to keep service worker alive if needed
chrome.runtime.onInstalled.addListener(() => {
  console.log('[KeyShield] Extension installed and monitoring...');
});
