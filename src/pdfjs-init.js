/* global PDFViewerApplication */

// This script is run once PDF.js has loaded and it configures the viewer
// and injects the Hypothesis client.

// Mount the "Send to agent" drain button in the PDF viewer page. The background's
// injectReviewButton (see background/review-button.ts) only fires on the HTML injection
// path; a PDF redirects to this viewer, so the button must be mounted here, in-page, where
// the client itself is injected. Kept in sync by hand with mountReviewButton in
// background/review-button.ts -- this viewer bootstrap is raw JS and cannot import it.
function mountReviewButton() {
  const HOST_ID = 'hypothesis-review-send-host';
  const MESSAGE = 'review:close'; // must match REVIEW_CLOSE_MESSAGE in background/review-button.ts
  if (document.getElementById(HOST_ID)) {
    return;
  }
  const host = document.createElement('div');
  host.id = HOST_ID;
  host.style.cssText =
    'position:fixed;left:12px;top:50%;transform:translateY(-50%);z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = [
    'button {',
    '  font: 600 13px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    '  color: #fff; background: #bd1c2b; border: none; border-radius: 6px;',
    '  padding: 10px 14px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,.3);',
    '  white-space: nowrap;',
    '}',
    'button:hover { background: #a3121f; }',
    'button:disabled { opacity: .7; cursor: default; }',
  ].join('\n');
  const button = document.createElement('button');
  const defaultLabel = 'Send to agent';
  button.textContent = defaultLabel;
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Sending…';
    try {
      const res = await chrome.runtime.sendMessage({ type: MESSAGE });
      if (res && res.ok) {
        button.textContent = 'Sent ✓';
        button.style.background = '#1c8a3b';
      } else {
        button.textContent = 'Failed ✗';
        button.style.background = '#8a1c1c';
      }
    } catch {
      button.textContent = 'Failed ✗';
      button.style.background = '#8a1c1c';
    }
    setTimeout(() => {
      button.textContent = defaultLabel;
      button.style.background = '';
      button.disabled = false;
    }, 2000);
  });
  shadow.append(style, button);
  (document.body || document.documentElement).appendChild(host);
}

async function init() {
  const configPromise = chrome.runtime.sendMessage(chrome.runtime.id, {
    type: 'getConfigForTab',
  });

  const viewerLoaded = new Promise(resolve => {
    // See https://github.com/mozilla/pdf.js/wiki/Third-party-viewer-usage
    document.addEventListener('webviewerloaded', () => {
      // Wait for the PDF viewer to be fully initialized before loading the client.
      // Note that the PDF may still be loading after initialization.
      //
      // @ts-expect-error - PDFViewerApplication is missing from types.
      PDFViewerApplication.initializedPromise.then(resolve);
    });
  });

  // Concurrently request Hypothesis client config and listen for PDF.js
  // to finish initializing.
  const [config] = await Promise.all([configPromise, viewerLoaded]);

  const configScript = document.createElement('script');
  configScript.type = 'application/json';
  configScript.className = 'js-hypothesis-config';
  configScript.textContent = JSON.stringify(config);

  // This ensures the client removes the script when the extension is deactivated
  configScript.setAttribute('data-remove-on-unload', '');
  // The boot script expects this attribute when running from the browser extension
  configScript.setAttribute('data-extension-id', chrome.runtime.id);

  document.head.appendChild(configScript);

  const embedScript = document.createElement('script');
  embedScript.src = '/client/build/boot.js';
  document.body.appendChild(embedScript);

  // The client is injected via <script> tags above; mount the drain button the same way,
  // in-page, now that the viewer and its DOM are ready.
  mountReviewButton();
}

init();
