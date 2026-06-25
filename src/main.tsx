import './index.css'
import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Lobby from './pages/Lobby'
import WaitingRoom from './pages/WaitingRoom'
import Game from './pages/Game'
import GameOver from './pages/GameOver'
import DevRun from './pages/DevRun'
import NotFound from './pages/NotFound'

function AppRoutes() {
  const { user, loading } = useAuth()
  if (loading) return <div style={{ padding: 40, color: '#4a9eff' }}>Loading...</div>

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={user ? <Lobby /> : <Navigate to="/login" replace />} />
      <Route path="/game/:code/wait" element={user ? <WaitingRoom /> : <Navigate to="/login" replace />} />
      <Route path="/game/:code" element={<Game />} />
      <Route path="/game/:code/over" element={<GameOver />} />
      <Route path="/dev/run" element={user ? <DevRun /> : <Navigate to="/login" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
