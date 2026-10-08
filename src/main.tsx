import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/libre-franklin'
import '@fontsource-variable/newsreader/opsz.css'
import '@fontsource-variable/newsreader/opsz-italic.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
