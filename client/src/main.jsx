import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from './context.jsx';
import App from './App.jsx';
import './styles.css';
import './source-features.css';
import { registerApp } from './lib/pwa.js';
if (import.meta.env.PROD) registerApp();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);
