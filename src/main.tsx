import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import { ErrorBoundary } from './components/ErrorBoundary.tsx';

// Suppress benign ResizeObserver warning
const resizeObserverErr = 'ResizeObserver loop completed with undelivered notifications.';
const originalError = window.console.error;
window.console.error = (...args) => {
  if (args[0]?.includes?.(resizeObserverErr) || args[0] === resizeObserverErr) return;
  originalError(...args);
};

// Also catch via window error event for some browsers/environments
window.addEventListener('error', (e) => {
  if (e.message.includes(resizeObserverErr)) {
    e.stopImmediatePropagation();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
