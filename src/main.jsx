import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { enableOffline } from './lib/offline.js';
import './style.css';

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);

enableOffline();
