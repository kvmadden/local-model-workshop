import React from 'react'
import ReactDOM from 'react-dom/client'
// Fonts are bundled with the app, so the page makes no font request to another host.
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import '@fontsource/atkinson-hyperlegible-next/400.css'
import '@fontsource/atkinson-hyperlegible-next/500.css'
import '@fontsource/atkinson-hyperlegible-next/600.css'
import '@fontsource/atkinson-hyperlegible-next/700.css'
import '@fontsource/atkinson-hyperlegible-mono/300.css'
import '@fontsource/atkinson-hyperlegible-mono/400.css'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App initialTab="compare" />
  </React.StrictMode>,
)
