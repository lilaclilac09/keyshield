import React from 'react';
import ReactDOM from 'react-dom/client';
import { PopupApp } from './PopupApp';

const root = document.getElementById('popup-root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <PopupApp />
    </React.StrictMode>
  );
}
