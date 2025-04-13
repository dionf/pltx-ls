// frontend/src/components/ConnectionTest.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const ConnectionTest = () => {
  const [plytixConfig, setPlytixConfig] = useState(null);
  const [lightspeedConfig, setLightspeedConfig] = useState(null);
  const [plytixTestResults, setPlytixTestResults] = useState(null);
  const [lightspeedTestResults, setLightspeedTestResults] = useState(null);
  const [plytixTesting, setPlytixTesting] = useState(false);
  const [lightspeedTesting, setLightspeedTesting] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  
  const navigate = useNavigate();

  useEffect(() => {
    const fetchApiConfigs = async () => {
      try {
        // Get token from localStorage
        const token = localStorage.getItem('token');
        
        if (!token) {
          // No token found, redirect to login
          navigate('/login');
          return;
        }
        
        // Set auth header
        const config = {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        };
        
        // Fetch API configurations
        const res = await axios.get('/api/credentials', config);
        
        if (res.data.plytix) {
          setPlytixConfig(res.data.plytix);
        }
        
        if (res.data.lightspeed) {
          setLightspeedConfig(res.data.lightspeed);
        }
        
        setLoading(false);
      } catch (err) {
        setLoading(false);
        
        // If unauthorized, redirect to login
        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          navigate('/login');
        }
      }
    };
    
    fetchApiConfigs();
  }, [navigate]);

  const runPlytixDetailedTest = async () => {
    // Clear previous messages
    setError('');
    setMessage('');
    
    if (!plytixConfig) {
      setError('Plytix API configuration not found. Please configure your API credentials first.');
      return;
    }
    
    try {
      setPlytixTesting(true);
      
      // Get token from localStorage
      const token = localStorage.getItem('token');
      
      // Set auth header
      const config = {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      };
      
      // Run detailed test
      const res = await axios.post('/api/test/plytix/detailed', {}, config);
      
      setPlytixTestResults(res.data);
      setPlytixTesting(false);
      
      if (res.data.connected) {
        setMessage('Plytix API connection test completed successfully');
      } else {
        setError('Plytix API connection test failed: ' + res.data.message);
      }
    } catch (err) {
      setPlytixTesting(false);
      setError(err.response?.data?.error || 'Failed to run Plytix API connection test');
    }
  };

  const runLightspeedDetailedTest = async () => {
    // Clear previous messages
    setError('');
    setMessage('');
    
    if (!lightspeedConfig) {
      setError('Lightspeed API configuration not found. Please configure your API credentials first.');
      return;
    }
    
    try {
      setLightspeedTesting(true);
      
      // Get token from localStorage
      const token = localStorage.getItem('token');
      
      // Set auth header
      const config = {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      };
      
      // Run detailed test
      const res = await axios.post('/api/test/lightspeed/detailed', {}, config);
      
      setLightspeedTestResults(res.data);
      setLightspeedTesting(false);
      
      if (res.data.connected) {
        setMessage('Lightspeed API connection test completed successfully');
      } else {
        setError('Lightspeed API connection test failed: ' + res.data.message);
      }
    } catch (err) {
      setLightspeedTesting(false);
      setError(err.response?.data?.error || 'Failed to run Lightspeed API connection test');
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="connection-test-container">
      <div className="connection-test-header">
        <h1>API Connection Testing</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </button>
      </div>
      
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      
      <div className="connection-test-content">
        <div className="connection-test-card">
          <h2>Plytix API Connection</h2>
          
          {plytixConfig ? (
            <div className="config-summary">
              <p><strong>API Key:</strong> {plytixConfig.api_key.substring(0, 5)}...{plytixConfig.api_key.substring(plytixConfig.api_key.length - 5)}</p>
              <p><strong>Base URL:</strong> {plytixConfig.base_url}</p>
              <p><strong>Status:</strong> {plytixConfig.connection_status === 'connected' ? 
                <span className="status-connected">Connected</span> : 
                <span className="status-disconnected">Not Connected</span>}
              </p>
              {plytixConfig.last_tested && (
                <p><strong>Last Tested:</strong> {new Date(plytixConfig.last_tested).toLocaleString()}</p>
              )}
            </div>
          ) : (
            <div className="config-missing">
              <p>No Plytix API configuration found.</p>
              <button 
                className="btn btn-primary" 
                onClick={() => navigate('/api-config')}
              >
                Configure Plytix API
              </button>
            </div>
          )}
          
          {plytixConfig && (
            <div className="test-actions">
              <button 
                className="btn btn-primary" 
                onClick={runPlytixDetailedTest}
                disabled={plytixTesting}
              >
                {plytixTesting ? 'Testing...' : 'Run Detailed Test'}
              </button>
            </div>
          )}
          
          {plytixTestResults && (
            <div className="test-results">
              <h3>Test Results</h3>
              
              <div className={`result-status ${plytixTestResults.connected ? 'success' : 'error'}`}>
                <span className="status-indicator"></span>
                <span className="status-message">{plytixTestResults.message}</span>
              </div>
              
              {plytixTestResults.connected && plytixTestResults.diagnostics && (
                <div className="diagnostics">
                  <h4>Diagnostics</h4>
                  
                  <div className="diagnostic-item">
                    <span className="diagnostic-label">Authentication:</span>
                    <span className={`diagnostic-value ${plytixTestResults.diagnostics.authentication.success ? 'success' : 'error'}`}>
                      {plytixTestResults.diagnostics.authentication.success ? 'Successful' : 'Failed'}
                    </span>
                    <span className="diagnostic-detail">
                      Response Time: {plytixTestResults.diagnostics.authentication.responseTime}ms
                    </span>
                  </div>
                  
                  <h4>Endpoint Permissions</h4>
                  {plytixTestResults.diagnostics.permissions.map((permission, index) => (
                    <div className="diagnostic-item" key={index}>
                      <span className="diagnostic-label">{permission.endpoint}:</span>
                      <span className={`diagnostic-value ${permission.success ? 'success' : 'error'}`}>
                        {permission.success ? 'Accessible' : 'Not Accessible'}
                      </span>
                      {!permission.success && (
                        <span className="diagnostic-detail">
                          {permission.message}
                        </span>
                      )}
                    </div>
                  ))}
                  
                  <div className="diagnostic-item">
                    <span className="diagnostic-label">API Version:</span>
                    <span className="diagnostic-value">{plytixTestResults.diagnostics.apiVersion}</span>
                  </div>
                  
                  <div className="diagnostic-item">
                    <span className="diagnostic-label">Total Test Time:</span>
                    <span className="diagnostic-value">{plytixTestResults.diagnostics.totalTime}ms</span>
                  </div>
                </div>
              )}
              
              {!plytixTestResults.connected && plytixTestResults.diagnostics && (
                <div className="diagnostics">
                  <h4>Error Details</h4>
                  
                  {plytixTestResults.diagnostics.error.status && (
                    <div className="diagnostic-item">
                      <span className="diagnostic-label">Status Code:</span>
                      <span className="diagnostic-value">{plytixTestResults.diagnostics.error.status}</span>
                    </div>
                  )}
                  
                  {plytixTestResults.diagnostics.error.statusText && (
                    <div className="diagnostic-item">
                      <span className="diagnostic-label">Status Text:</span>
                      <span className="diagnostic-value">{plytixTestResults.diagnostics.error.statusText}</span>
                    </div>
                  )}
                  
                  {plytixTestResults.diagnostics.error.message && (
                    <div className="diagnostic-item">
                      <span className="diagnostic-label">Error Message:</span>
                      <span className="diagnostic-value">{plytixTestResults.diagnostics.error.message}</span>
                    </div>
                  )}
                  
                  <div className="diagnostic-item">
                    <span className="diagnostic-label">Request URL:</span>
                    <span className="diagnostic-value">{plytixTestResults.diagnostics.requestUrl}</span>
                  </div>
                  
                  <div className="diagnostic-item">
                    <span className="diagnostic-label">Total Test Time:</span>
                    <span className="diagnostic-value">{plytixTestResults.diagnostics.totalTime}ms</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        
        <div className="connection-test-card">
          <h2>Lightspeed API Connection</h2>
          
          {lightspeedConfig ? (
            <div className="config-summary">
              <p><strong>API Key:</strong> {lightspeedConfig.api_key.substring(0, 5)}...{lightspeedConfig.api_key.substring(lightspeedConfig.api_key.length - 5)}</p>
              <p><strong>Cluster:</strong> {lightspeedConfig.cluster}</p>
              <p><strong>Language:</strong> {lightspeedConfig.language}</p>
              <p><strong>Status:</strong> {lightspeedConfig.connection_status === 'connected' ? 
                <span className="status-connected">Connected</span> : 
                <span className="status-disconnected">Not Connected</span>}
              </p>
              {lightspeedConfig.last_tested && (
                <p><strong>Last Tested:</strong> {new Date(lightspeedConfig.last_tested).toLocaleString()}</p>
              )}
            </div>
          ) : (
            <div className="config-missing">
              <p>No Lightspeed API configuration found.</p>
              <button 
                className="btn btn-primary" 
                onClick={() => navigate('/api-config')}
              >
                Configure Lightspeed API
              </button>
            </div>
          )}
          
          {lightspeedConfig && (
            <div className="test-actions">
              <button 
                className="btn btn-primary" 
                onClick={runLightspeedDetailedTest}
                disabled={lightspeedTesting}
              >
                {lightspeedTesting ? 'Testing...' : 'Run Detailed Test'}
              </button>
            </div>
          )}
          
          {lightspeedTestResults && (
            <div className="test-results">
              <h3>Test Results</h3>
              
              <div className={`result-status ${lightspeedTestResults.connected ? 'success' : 'error'}`}>
                <span className="status-indicator"></span>
                <span className="status-message">{lightspeedTestResults.message}</span>
              </div>
              
              {lightspeedTestResults.connected && lightspeedTestResults.diagnostics && (
                <div className="diagnostics">
                  <h4>Diagnostics</h4>
                  
                  <div className="diagnostic-item">
                    <span className="diagnostic-label">Authentication:</span>
                    <span className={`diagnostic-value ${lightspeedTestResults.diagnostics.authentication.success ? 'success' : 'error'}`}>
                      {lightspeedTestResults.diagnostics.authentication.success ? 'Successful' : 'Failed'}
                    </span>
                    <span className="diagnostic-detail">
                      Response Time: {lightspeedTestResults.diagnostics.authentication.responseTime}ms
                    </span>
                  </div>
                  
                  <h4>Endpoint Permissions</h4>
                  {lightspeedTestResults.diagnostics.permissions.map((permission, index) => (
                    <div className="diagnostic-item" key={index}>
                      <span className="diagnostic-label">{permission.endpoint}:</span>
                      <span className={`diagnostic-value ${permission.success ? 'success' : 'error'}`}>
                        {permission.success ? 'Accessible' : 'Not Accessible'}
                      </span>
                      {!permission.success && (
                        <span className="diagnostic-detail">
                          {permission.message}
                        </span>
                      )}
                    </div>
                  ))}
                  
                  <div className="diagnostic-item">
                    <span className="diagnostic-label">API Version:</span>
                    <span className="diagnostic-value">{lightspeedTestResults.diagnostics.apiVersion}</span>
                  </div>
                  
                  <div className="diagnostic-item">
                    <span className="diagnostic-label">Cluster:</span>
                    <span className="diagnostic-value">{lightspeedTestResults.diagnostics.cluster}</span>
                  </div>
                  
                  <div className="diagnostic-item">
                    <span className="diagnostic-label">Language:</span>
                    <span className="diagnostic-value">{lightspeedTestResults.diagnostics.language}</span>
                  </div>
                  
                  <div className="diagnostic-item">
                    <span className="diagnostic-label">Total Test Time:</span>
                    <span className="diagnostic-value">{lightspeedTestResults.diagnostics.totalTime}ms</span>
                  </div>
                </div>
              )}
              
              {!lightspeedTestResults.connected && lightspeedTestResults.diagnostics && (
                <div className="diagnostics">
                  <h4>Error Details</h4>
                  
                  {lightspeedTestResults.diagnostics.error.status && (
                    <div className="diagnostic-item">
                      <span className="diagnostic-label">Status Code:</span>
                      <span className="diagnostic-value">{lightspeedTestResults.diagnostics.error.status}</span>
                    </div>
                  )}
                  
                  {lightspeedTestResults.diagnostics.error.statusText && (
                    <div className="diagnostic-item">
                      <span className="diagnostic-label">Status Text:</span>
                      <span className="diagnostic-value">{lightspeedTestResults.diagnostics.error.statusText}</span>
                    </div>
                  )}
                  
                  {lightspeedTestResults.diagnostics.error.message && (
                    <div className="diagnostic-item">
                      <span className="diagnostic-label">Error Message:</span>
                      <span className="diagnostic-value">{lightspeedTestResults.diagnostics.error.message}</span>
                    </div>
                  )}
                  
                  <div className="diagnostic-item">
                    <span className="diagnostic-label">Request URL:</span>
                    <span className="diagnostic-value">{lightspeedTestResults.diagnostics.requestUrl}</span>
                  </div>
                  
                  <div className="diagnostic-item">
                    <span className="diagnostic-label">Total Test Time:</span>
                    <span className="diagnostic-value">{lightspeedTestResults.diagnostics.totalTime}ms</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      <div className="connection-test-footer">
        <div className="navigation-buttons">
          <button className="btn btn-secondary" onClick={() => navigate('/api-config')}>
            Back to API Configuration
          </button>
          
          <button 
            className="btn btn-primary" 
            onClick={() => navigate('/attribute-mapping')}
            disabled={!plytixConfig?.connection_status === 'connected' || !lightspeedConfig?.connection_status === 'connected'}
          >
            Continue to Attribute Mapping
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConnectionTest;
