import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from './lib/theme'
import { RoleProvider, RequireRole, RequireSession } from './lib/role'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ExecutiveCommandCenter from './pages/app/Dashboard'
import Optimizer from './pages/app/Optimizer'
import Ask from './pages/app/Ask'
import TechnicalAudit from './pages/app/TechnicalAudit'
import RemediationQueue from './pages/app/RemediationQueue'
import ScenarioSimulator from './pages/app/ScenarioSimulator'
import Compliance from './pages/app/Compliance'
import Telemetry from './pages/app/Telemetry'
import BusinessProcesses from './pages/app/BusinessProcesses'
import Settings from './pages/app/Settings'

export default function App() {
  return (
    <ThemeProvider>
      <RoleProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />

            {/* Executive workspace */}
            <Route
              path="/app/executive"
              element={
                <RequireRole role="executive">
                  <ExecutiveCommandCenter />
                </RequireRole>
              }
            />
            <Route
              path="/app/optimizer"
              element={
                <RequireRole role="executive">
                  <Optimizer />
                </RequireRole>
              }
            />
            <Route
              path="/app/ask"
              element={
                <RequireRole role="executive">
                  <Ask />
                </RequireRole>
              }
            />

            {/* SecOps workspace */}
            <Route
              path="/app/technical"
              element={
                <RequireRole role="secops">
                  <TechnicalAudit />
                </RequireRole>
              }
            />
            <Route
              path="/app/remediation"
              element={
                <RequireRole role="secops">
                  <RemediationQueue />
                </RequireRole>
              }
            />
            <Route
              path="/app/simulator"
              element={
                <RequireRole role="secops">
                  <ScenarioSimulator />
                </RequireRole>
              }
            />
            <Route
              path="/app/compliance"
              element={
                <RequireRole role="secops">
                  <Compliance />
                </RequireRole>
              }
            />
            <Route
              path="/app/telemetry"
              element={
                <RequireRole role="secops">
                  <Telemetry />
                </RequireRole>
              }
            />
            <Route
              path="/app/processes"
              element={
                <RequireRole role="secops">
                  <BusinessProcesses />
                </RequireRole>
              }
            />

            {/* Shared — reachable from either workspace */}
            <Route
              path="/app/settings"
              element={
                <RequireSession>
                  <Settings />
                </RequireSession>
              }
            />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </RoleProvider>
    </ThemeProvider>
  )
}
