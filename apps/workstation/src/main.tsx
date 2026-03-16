import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { DebugView } from './debug/DebugView';

const isDebug = new URLSearchParams(window.location.search).has('debug');

const root = createRoot(document.getElementById('root')!);
root.render(
  <React.StrictMode>
    {isDebug ? <DebugView /> : <App />}
  </React.StrictMode>
);
