import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './Layout.css';

function Layout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const menuItems = [
    { path: '/scenarios', icon: '📋', label: 'Scenarios' },
    { path: '/import', icon: '📥', label: 'Import Data' },
    { path: '/settings', icon: '⚙️', label: 'Settings' },
    { path: '/montecarlo', icon: '🎲', label: 'Monte Carlo' }
  ];

  return (
    <div className="layout">
      <header className="header">
        <div className="header-left">
          <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </button>
          <h1>Freighter Profitability Planner</h1>
        </div>
        <div className="header-right">
          <span className="user-info">
            {user.username} ({user.role})
          </span>
          <button className="logout-btn" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <div className="layout-body">
        <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          <nav>
            {menuItems.map(item => (
              <button
                key={item.path}
                className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                onClick={() => navigate(item.path)}
              >
                <span className="nav-icon">{item.icon}</span>
                {sidebarOpen && <span className="nav-label">{item.label}</span>}
              </button>
            ))}
          </nav>
        </aside>

        <main className="main-content">
          {children}
        </main>
      </div>
    </div>
  );
}

export default Layout;
