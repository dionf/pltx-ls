import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const WorkflowFilter = () => {
  const { currentUser } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [filterValue, setFilterValue] = useState('4. Ready to be published');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch current workflow filter settings
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const response = await axios.get('/api/workflow-filter');
        setEnabled(response.data.enabled);
        setFilterValue(response.data.filter_value || '4. Ready to be published');
      } catch (err) {
        setError('Failed to load workflow filter settings');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Reset messages
    setError('');
    setSuccess('');
    
    try {
      setSaving(true);
      
      await axios.post('/api/workflow-filter', {
        enabled,
        filter_value: filterValue
      });
      
      setSuccess('Workflow filter settings saved successfully');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save workflow filter settings');
      console.error(err);
    } finally {
      setSaving(false);
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
    <div className="workflow-filter-container">
      <div className="page-header">
        <h2>Workflow Filter</h2>
        <p className="lead">Configure which products to synchronize based on their workflow status in Plytix.</p>
      </div>
      
      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}
      
      {success && (
        <div className="alert alert-success" role="alert">
          {success}
        </div>
      )}
      
      <div className="card">
        <div className="card-body">
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <div className="custom-control custom-switch">
                <input
                  type="checkbox"
                  className="custom-control-input"
                  id="enableWorkflowFilter"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  disabled={saving}
                />
                <label className="custom-control-label" htmlFor="enableWorkflowFilter">
                  Enable Workflow Filter
                </label>
              </div>
              <small className="form-text text-muted">
                When enabled, only products with the specified workflow status will be synchronized to Lightspeed.
              </small>
            </div>
            
            {enabled && (
              <div className="form-group mt-4">
                <label htmlFor="filterValue">Workflow Status Value</label>
                <input
                  type="text"
                  className="form-control"
                  id="filterValue"
                  value={filterValue}
                  onChange={(e) => setFilterValue(e.target.value)}
                  disabled={saving}
                  placeholder="Enter workflow status value"
                />
                <small className="form-text text-muted">
                  Only products with this exact workflow status value will be synchronized.
                  Default value is "4. Ready to be published".
                </small>
              </div>
            )}
            
            <div className="form-group mt-4">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </form>
        </div>
      </div>
      
      <div className="info-section mt-4">
        <h4>About Workflow Filtering</h4>
        <p>
          The workflow filter allows you to control which products are synchronized from Plytix to Lightspeed
          based on their content workflow status in Plytix.
        </p>
        <p>
          This is particularly useful for ensuring that only approved and ready-to-publish products
          appear in your Lightspeed store.
        </p>
        <div className="alert alert-info">
          <strong>Tip:</strong> Make sure the "content_workflow" attribute exists in your Plytix PIM
          and contains the appropriate values for your products.
        </div>
      </div>
    </div>
  );
};

export default WorkflowFilter;
