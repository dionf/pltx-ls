import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Login from './components/Login';
import Register from './components/Register';
import Dashboard from './components/Dashboard';
import ApiConfig from './components/ApiConfig';
import ConnectionTest from './components/ConnectionTest';
import AttributeMapping from './components/AttributeMapping';
import WorkflowFilter from './components/WorkflowFilter';
import Synchronization from './components/Synchronization';
import Profile from './components/Profile';
import './App.css';

// Simple Navbar component
const Navbar = () => {
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <a href="/">Plytix to Lightspeed Integration</a>
      </div>
      <div className="navbar-menu">
        <a href="/login">Login</a>
        <a href="/register">Register</a>
      </div>
    </nav>
  );
};

// Simple PrivateRoute component for React Router v6
const PrivateRoute = ({ children }) => {
  const isAuthenticated = localStorage.getItem('token') !== null;
  return isAuthenticated ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <div className="app-container">
      <Navbar />
      <div className="content-container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          } />
          <Route path="/api-config" element={
            <PrivateRoute>
              <ApiConfig />
            </PrivateRoute>
          } />
          <Route path="/connection-test" element={
            <PrivateRoute>
              <ConnectionTest />
            </PrivateRoute>
          } />
          <Route path="/attribute-mapping" element={
            <PrivateRoute>
              <AttributeMapping />
            </PrivateRoute>
          } />
          <Route path="/workflow-filter" element={
            <PrivateRoute>
              <WorkflowFilter />
            </PrivateRoute>
          } />
          <Route path="/synchronization" element={
            <PrivateRoute>
              <Synchronization />
            </PrivateRoute>
          } />
          <Route path="/profile" element={
            <PrivateRoute>
              <Profile />
            </PrivateRoute>
          } />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
      <Footer />
    </div>
  );
}

const Home = () => {
  return (
    <div className="home-container">
      <div className="hero-section">
        <h1>Plytix to Lightspeed Integration</h1>
        <p>Connect your Plytix PIM to Lightspeed e-commerce and synchronize your product data seamlessly.</p>
        <div className="cta-buttons">
          <a href="/register" className="btn btn-primary">Get Started</a>
          <a href="/login" className="btn btn-secondary">Login</a>
        </div>
      </div>
      
      <div className="features-section">
        <h2>Key Features</h2>
        <div className="features-grid">
          <div className="feature-card">
            <h3>User Accounts</h3>
            <p>Secure user accounts to manage your integration settings and credentials.</p>
          </div>
          <div className="feature-card">
            <h3>API Configuration</h3>
            <p>Easily configure your Plytix and Lightspeed API credentials.</p>
          </div>
          <div className="feature-card">
            <h3>Attribute Mapping</h3>
            <p>Map Plytix attributes to Lightspeed fields with custom transformations.</p>
          </div>
          <div className="feature-card">
            <h3>Workflow Filtering</h3>
            <p>Only synchronize products with specific workflow status values.</p>
          </div>
          <div className="feature-card">
            <h3>Synchronization</h3>
            <p>Run manual or scheduled synchronization with detailed reporting.</p>
          </div>
          <div className="feature-card">
            <h3>Connection Testing</h3>
            <p>Test your API connections with detailed diagnostics.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const NotFound = () => {
  return (
    <div className="not-found">
      <h2>404 - Page Not Found</h2>
      <p>The page you are looking for does not exist.</p>
      <a href="/" className="btn btn-primary">Go Home</a>
    </div>
  );
};

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-content">
        <p>&copy; 2025 Plytix to Lightspeed Integration. All rights reserved.</p>
      </div>
    </footer>
  );
};

export default App;
