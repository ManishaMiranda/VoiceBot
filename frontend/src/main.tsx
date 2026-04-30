import React from 'react';
import { render } from 'react-dom';
import App from './App';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

// Use legacy render (React 17 API) to avoid concurrent mode scheduler crashes
render(<App />, rootElement);
