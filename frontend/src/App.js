import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Login from './pages/Login';
import Scenarios from './pages/ScenariosEnhanced';
import Import from './pages/Import';
import Settings from './pages/Settings';
import MonteCarloSimulation from './pages/MonteCarloSimulation';
import './App.css';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(
    !!localStorage.getItem('token')
  );

  const ProtectedRoute = ({ children }) => {
    return isAuthenticated ? (
      <Layout>{children}</Layout>
    ) : (
      <Navigate to="/login" />
    );
  };

  return (
    <Router>
      <div className="App">
        <Toaster position="top-right" />
        <Routes>
          <Route
            path="/login"
            element={<Login setIsAuthenticated={setIsAuthenticated} />}
          />

          <Route
            path="/scenarios"
            element={<ProtectedRoute><Scenarios /></ProtectedRoute>}
          />
          <Route
            path="/montecarlo"
            element={<ProtectedRoute><MonteCarloSimulation /></ProtectedRoute>}
          />

          <Route
            path="/import"
            element={<ProtectedRoute><Import /></ProtectedRoute>}
          />

          <Route
            path="/settings"
            element={<ProtectedRoute><Settings /></ProtectedRoute>}
          />

          <Route path="/" element={<Navigate to="/scenarios" />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
