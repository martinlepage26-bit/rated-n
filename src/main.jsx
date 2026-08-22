import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App.jsx';
import '@/index.css';
import '@/styles/tokens.css';
import '@/styles/shell.css';
import '@/styles/home.css';
import '@/styles/results.css';
import '@/styles/detail.css';
import '@/styles/dashboard.css';
import '@/styles/auth.css';
import '@/styles/responsive.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
