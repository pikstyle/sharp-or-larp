import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import Terms from './Terms.tsx'

const isTermsPage = window.location.pathname === '/terms'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isTermsPage ? <Terms /> : <App />}</StrictMode>,
)
