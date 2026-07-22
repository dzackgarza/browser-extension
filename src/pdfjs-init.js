/* global PDFViewerApplication */

import {
  mountReviewButton,
  REVIEW_BUTTON_HOST_ID,
  REVIEW_CLOSE_MESSAGE,
} from './review-button-ui.js';

// This script is run once PDF.js has loaded and it configures the viewer
// and injects the Hypothesis client.

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
  const reviewButtonHost = mountReviewButton(
    REVIEW_BUTTON_HOST_ID,
    REVIEW_CLOSE_MESSAGE,
  );
  const outerContainer = document.getElementById('outerContainer');
  if (outerContainer) {
    const placeReviewButton = () => {
      reviewButtonHost.style.left = outerContainer.classList.contains(
        'sidebarOpen',
      )
        ? 'calc(var(--sidebar-width) + 12px)'
        : '12px';
    };
    new MutationObserver(placeReviewButton).observe(outerContainer, {
      attributes: true,
      attributeFilter: ['class'],
    });
    placeReviewButton();
  }
}

init();
