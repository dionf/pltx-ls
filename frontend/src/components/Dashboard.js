import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const Dashboard = () => {
  const { currentUser } = useAuth();
  const [plytixStatus, setPlytixStatus] = useState('not_configured');
  const [lightspeedStatus, setLightspeedStatus] = useState('not_configured');
  const [recentJobs, setRecentJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        
        // Fetch Plytix credentials status
        try {
          const plytixResponse = await axios.get('/api/credentials/plytix');
          setPlytixStatus(plytixResponse.data.credentials.connection_status || 'configured');
        } catch (err) {
          if (err.response?.status === 404) {
            setPlytixStatus('not_configured');
          }
        }
        
        // Fetch Lightspeed credentials status
        try {
          const lightspeedResponse = await axios.get('/api/credentials/lightspeed');
          setLightspeedStatus(lightspeedResponse.data.credentials.connection_status || 'configured');
        } catch (err) {
          if (err.response?.status === 404) {
            setLightspeedStatus('not_configured');
          }
        }
        
        // Fetch recent sync jobs
        const jobsResponse = await axios.get('/api/sync');
        setRecentJobs(jobsResponse.data.jobs || []);
        
      } catch (err) {
        setError('Failed to load dashboard data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'connected':
        return <span className="badge badge-success">Connected</span>;
      case 'configured':
        return <span className="badge badge-warning">Not Tested</span>;
      case 'failed':
        return <span className="badge badge-danger">Connection Failed</span>;
      case 'not_configured':
      default:
        return <span className="badge badge-secondary">Not Configured</span>;
    }
  };

  const getJobStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return <span className="badge badge-success">Completed</span>;
      case 'running':
        return <span className="badge badge-primary">Running</span>;
      case 'failed':
        return <span className="badge badge-danger">Failed</span>;
      default:
        return <span className="badge badge-secondary">{status}</span>;
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleString();
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
    <div className="dashboard-container">
      <div className="page-header">
        <h2>Dashboard</h2>
        <p className="lead">Welcome, {currentUser.username}! Manage your Plytix to Lightspeed integration.</p>
      </div>
      
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      
      <div className="row">
        <div className="col-md-6">
          <div className="card mb-4">
            <div className="card-header">
              <h5>API Status</h5>
            </div>
            <div className="card-body">
              <div className="api-status-item">
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <span>Plytix API</span>
                  {getStatusBadge(plytixStatus)}
                </div>
                <div className="d-flex justify-content-between align-items-center">
                  <span>Lightspeed API</span>
                  {getStatusBadge(lightspeedStatus)}
                </div>
              </div>
              <div className="mt-3">
                <a href="/api-config" className="btn btn-primary btn-sm">Configure APIs</a>
                <a href="/connection-test" className="btn btn-outline-secondary btn-sm ml-2">Test Connection</a>
              </div>
            </div>
          </div>
        </div>
        
        <div className="col-md-6">
          <div className="card mb-4">
            <div className="card-header">
              <h5>Quick Actions</h5>
            </div>
            <div className="card-body">
              <div className="quick-actions">
                <a href="/synchronization" className="btn btn-success mb-2">Run Synchronization</a>
                <a href="/attribute-mapping" className="btn btn-outline-primary mb-2">Manage Attribute Mappings</a>
                <a href="/workflow-filter" className="btn btn-outline-primary mb-2">Configure Workflow Filter</a>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="card">
        <div className="card-header">
          <h5>Recent Synchronization Jobs</h5>
        </div>
        <div className="card-body">
          {recentJobs.length === 0 ? (
            <p className="text-muted">No synchronization jobs found. Run your first synchronization to see results here.</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Status</th>
                    <th>Started</th>
                    <th>Completed</th>
                    <th>Results</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.map(job => (
                    <tr key={job.id}>
                      <td>{job.id}</td>
                      <td>{getJobStatusBadge(job.status)}</td>
                      <td>{formatDate(job.started_at)}</td>
                      <td>{job.completed_at ? formatDate(job.completed_at) : '-'}</td>
                      <td>
                        {job.results ? (
                          <span>
                            {JSON.parse(job.results).successful || 0} successful, 
                            {JSON.parse(job.results).failed || 0} failed
                          </span>
                        ) : '-'}
                      </td>
                      <td>
                        <a href={`/synchronization/${job.id}`} className="btn btn-sm btn-outline-primary">View Details</a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-3">
            <a href="/synchronization" className="btn btn-link">View All Jobs</a>
          </div>
        </div>
      </div>
      
      <div className="getting-started-section mt-4">
        <h4>Getting Started</h4>
        <p>Follow these steps to set up your Plytix to Lightspeed integration:</p>
        <ol className="getting-started-steps">
          <li className={plytixStatus !== 'not_configured' && lightspeedStatus !== 'not_configured' ? 'completed' : ''}>
            <strong>Configure API Credentials</strong> - Add your Plytix and Lightspeed API keys
            {plytixStatus === 'not_configured' || lightspeedStatus === 'not_configured' ? (
              <a href="/api-config" className="btn btn-sm btn-outline-primary ml-2">Configure Now</a>
            ) : null}
          </li>
          <li className={plytixStatus === 'connected' && lightspeedStatus === 'connected' ? 'completed' : ''}>
            <strong>Test API Connections</strong> - Verify your API credentials work correctly
            {plytixStatus !== 'not_configured' && lightspeedStatus !== 'not_configured' && (plytixStatus !== 'connected' || lightspeedStatus !== 'connected') ? (
              <a href="/connection-test" className="btn btn-sm btn-outline-primary ml-2">Test Now</a>
            ) : null}
          </li>
          <li>
            <strong>Map Attributes</strong> - Define how Plytix attributes map to Lightspeed fields
            <a href="/attribute-mapping" className="btn btn-sm btn-outline-primary ml-2">Map Now</a>
          </li>
          <li>
            <strong>Configure Workflow Filter</strong> - Set which products to synchronize
            <a href="/workflow-filter" className="btn btn-sm btn-outline-primary ml-2">Configure Now</a>
          </li>
          <li>
            <strong>Run Synchronization</strong> - Start synchronizing your products
            <a href="/synchronization" className="btn btn-sm btn-outline-primary ml-2">Run Now</a>
          </li>
        </ol>
      </div>
    </div>
  );
};

export default Dashboard;
