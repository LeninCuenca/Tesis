import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './estilos/globales.css'
import PanelPrincipal from './vistas/PanelPrincipal.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PanelPrincipal />
  </StrictMode>,
)
