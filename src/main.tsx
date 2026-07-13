import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist/index.css'
import '@xyflow/react/dist/style.css'
import App from './App.tsx'
import { WorkspaceProvider } from './app/workspace-context.tsx'
import { AccessGate } from './components/AccessGate.tsx'
import './styles/global.css'
import './styles/access-gate.css'
import './styles/workshop/chrome.css'
import './styles/workshop/canvas.css'
import './styles/workshop/assembly.css'
import './styles/workshop/overlays.css'
import './styles/workshop/responsive.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccessGate>
      <WorkspaceProvider>
        <App />
      </WorkspaceProvider>
    </AccessGate>
  </StrictMode>,
)
