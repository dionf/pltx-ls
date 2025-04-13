import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const ApiConfig = () => {
  const { currentUser } = useAuth();
  const [plytixApiKey, setPlytixApiKey] = useState('');
  const [plytixApiSecret, setPlytixApiSecret] = useState('');
  const [lightspeedApiKey, setLightspeedApiKey] = useState('');
  const [lightspeedApiSecret, setLightspeedApiSecret] = useState('');
  const [lightspeedCluster, setLightspeedCluster] = useState('eu');
  const [loading, setLoading] = useState(true);
  const [savingPlytix, setSavingPlytix] = useState(false);
  const [savingLightspeed, setSavingLightspeed] = useState(false);
  const [plytixError, setPlytixError] = useState('');
  const [lightspeedError, setLightspeedError] = useState('');
  const [plytixSuccess, setPlytixSuccess] = useState('');
  const [lightspeedSuccess, setLightspeedSuccess] = useState('');

  // Fetch existing API credentials
  useEffect(() => {
    const fetchCredentials = async () => {
      try {
        setLoading(true);
        
        // Fetch Plytix credentials
        try {
          const plytixResponse = await axios.get('/api/credentials/plytix');
          const plytixCreds = plytixResponse.data.credentials;
          setPlytixApiKey(plytixCreds.api_key || '');
          setPlytixApiSecret(plytixCreds.api_secret || '');
        } catch (err) {
          if (err.response?.status !== 404) {
            setPlytixError('Failed to load Plytix credentials');
            console.error(err);
          }
        }
        
        // Fetch Lightspeed credentials
        try {
          const lightspeedResponse = await axios.get('/api/credentials/lightspeed');
          const lightspeedCreds = lightspeedResponse.data.credentials;
          setLightspeedApiKey(lightspeedCreds.api_key || '');
          setLightspeedApiSecret(lightspeedCreds.api_secret || '');
          
          if (lightspeedCreds.additional_params) {
            const params = typeof lightspeedCreds.additional_params === 'string' 
              ? JSON.parse(lightspeedCreds.additional_params)
              : lightspeedCreds.additional_params;
              
            setLightspeedCluster(params.cluster || 'eu');
          }
        } catch (err) {
          if (err.response?.status !== 404) {
            setLightspeedError('Failed to load Lightspeed credentials');
            console.error(err);
          }
        }
      } catch (err) {
        console.error('Error fetching credentials:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCredentials();
  }, []);

  const handlePlytixSubmit = async (e) => {
    e.preventDefault();
    
    // Reset messages
    setPlytixError('');
    setPlytixSuccess('');
    
    // Validate form
    if (!plytixApiKey || !plytixApiSecret) {
      setPlytixError('API Key and Secret are required');
      return;
    }
    
    try {
      setSavingPlytix(true);
      
      await axios.post('/api/credentials', {
        platform: 'plytix',
        api_key: plytixApiKey,
        api_secret: plytixApiSecret
      });
      
      setPlytixSuccess('Plytix API credentials saved successfully');
    } catch (err) {
      setPlytixError(err.response?.data?.message || 'Failed to save Plytix API credentials');
      console.error(err);
    } finally {
      setSavingPlytix(false);
    }
  };

  const handleLightspeedSubmit = async (e) => {
    e.preventDefault();
    
    // Reset messages
    setLightspeedError('');
    setLightspeedSuccess('');
    
    // Validate form
    if (!lightspeedApiKey || !lightspeedApiSecret) {
      setLightspeedError('API Key and Secret are required');
      return;
    }
    
    try {
      setSavingLightspeed(true);
      
      await axios.post('/api/credentials', {
        platform: 'lightspeed',
        api_key: lightspeedApiKey,
        api_secret: lightspeedApiSecret,
        additional_params: {
          cluster: lightspeedCluster
        }
      });
      
      setLightspeedSuccess('Lightspeed API credentials saved successfully');
    } catch (err) {
      setLightspeedError(err.response?.data?.message || 'Failed to save Lightspeed API credentials');
      console.error(err);
    } finally {
      setSavingLightspeed(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-container">
        <div className="spinner-border text-primary" role="status">
          <span className="sr-only">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="api-config-container">
      <div className="page-header">
        <h2>API Configuration</h2>
        <p className="lead">Configure your Plytix and Lightspeed API credentials.</p>
      </div>
      
      <div className="row">
        <div className="col-md-6">
          <div className="card mb-4">
            <div className="card-header">
              <h5>Plytix API Credentials</h5>
            </div>
            <div className="card-body">
              {plytixError && (
                <div className="alert alert-danger" role="alert">
                  {plytixError}
                </div>
              )}
              
              {plytixSuccess && (
                <div className="alert alert-success" role="alert">
                  {plytixSuccess}
                </div>
              )}
              
              <form onSubmit={handlePlytixSubmit}>
                <div className="form-group">
                  <label htmlFor="plytixApiKey">API Key</label>
                  <input
                    type="text"
                    className="form-control"
                    id="plytixApiKey"
                    value={plytixApiKey}
                    onChange={(e) => setPlytixApiKey(e.target.value)}
                    disabled={savingPlytix}
                    placeholder="Enter Plytix API Key"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="plytixApiSecret">API Secret</label>
                  <input
                    type="password"
                    className="form-control"
                    id="plytixApiSecret"
                    value={plytixApiSecret}
                    onChange={(e) => setPlytixApiSecret(e.target.value)}
                    disabled={savingPlytix}
                    placeholder="Enter Plytix API Secret"
                  />
                </div>
                
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingPlytix}
                >
                  {savingPlytix ? 'Saving...' : 'Save Credentials'}
                </button>
                
                <a
                  href="/connection-test"
                  className="btn btn-outline-secondary ml-2"
                >
                  Test Connection
                </a>
              </form>
              
              <div className="api-info mt-3">
                <h6>How to get Plytix API credentials:</h6>
                <ol>
                  <li>Log in to your Plytix account</li>
                  <li>Go to Settings &gt; API Access</li>
                  <li>Generate a new API key and secret</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-6">
          <div className="card mb-4">
            <div className="card-header">
              <h5>Lightspeed API Credentials</h5>
            </div>
            <div className="card-body">
              {lightspeedError && (
                <div className="alert alert-danger" role="alert">
                  {lightspeedError}
                </div>
              )}
              
              {lightspeedSuccess && (
                <div className="alert alert-success" role="alert">
                  {lightspeedSuccess}
                </div>
              )}
              
              <form onSubmit={handleLightspeedSubmit}>
                <div className="form-group">
                  <label htmlFor="lightspeedApiKey">API Key</label>
                  <input
                    type="text"
                    className="form-control"
                    id="lightspeedApiKey"
                    value={lightspeedApiKey}
                    onChange={(e) => setLightspeedApiKey(e.target.value)}
                    disabled={savingLightspeed}
                    placeholder="Enter Lightspeed API Key"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="lightspeedApiSecret">API Secret</label>
                  <input
                    type="password"
                    className="form-control"
                    id="lightspeedApiSecret"
                    value={lightspeedApiSecret}
                    onChange={(e) => setLightspeedApiSecret(e.target.value)}
                    disabled={savingLightspeed}
                    placeholder="Enter Lightspeed API Secret"
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="lightspeedCluster">Cluster</label>
                  <select
                    className="form-control"
                    id="lightspeedCluster"
                    value={lightspeedCluster}
                    onChange={(e) => setLightspeedCluster(e.target.value)}
                    disabled={savingLightspeed}
                  >
                    <option value="eu">Europe (EU)</option>
                    <option value="us">United States (US)</option>
                  </select>
                </div>
                
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={savingLightspeed}
                >
                  {savingLightspeed ? 'Saving...' : 'Save Credentials'}
                </button>
                
                <a
                  href="/connection-test"
                  className="btn btn-outline-secondary ml-2"
                >
                  Test Connection
                </a>
              </form>
              
              <div className="api-info mt-3">
                <h6>How to get Lightspeed API credentials:</h6>
                <ol>
                  <li>Log in to your Lightspeed account</li>
                  <li>Go to Settings &gt; API Access</li>
                  <li>Create a new API application</li>
                  <li>Generate API credentials</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="security-info mt-4">
        <div className="alert alert-info">
          <h5>Security Information</h5>
          <p>
            Your API credentials are encrypted before being stored in our database.
            We use industry-standard encryption to protect your sensitive information.
          </p>
          <p>
            These credentials are only used to connect to the respective APIs and
            are never shared with third parties.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ApiConfig;
