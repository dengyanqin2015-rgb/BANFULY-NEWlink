import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

import { ErrorBoundary } from './components/ErrorBoundary.tsx';

// Suppress benign ResizeObserver warnings
const resizeObserverErrors = [
  'ResizeObserver loop completed with undelivered notifications.',
  'ResizeObserver loop limit exceeded'
];

const originalError = window.console.error;
window.console.error = (...args) => {
  if (typeof args[0] === 'string' && resizeObserverErrors.some(msg => args[0].includes(msg))) return;
  originalError(...args);
};

window.addEventListener('error', (e) => {
  if (resizeObserverErrors.some(msg => e.message?.includes(msg))) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

window.addEventListener('unhandledrejection', (e) => {
  if (typeof e.reason?.message === 'string' && resizeObserverErrors.some(msg => e.reason.message.includes(msg))) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
