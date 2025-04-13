import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';

const AttributeMapping = () => {
  const { currentUser } = useAuth();
  const [plytixAttributes, setPlytixAttributes] = useState([]);
  const [lightspeedAttributes, setLightspeedAttributes] = useState([]);
  const [currentMappings, setCurrentMappings] = useState([]);
  const [selectedPlytixAttr, setSelectedPlytixAttr] = useState('');
  const [selectedLightspeedAttr, setSelectedLightspeedAttr] = useState('');
  const [transformationRule, setTransformationRule] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Fetch attributes and current mappings
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        
        // Fetch Plytix attributes
        const plytixResponse = await axios.get('/api/plytix/attributes');
        setPlytixAttributes(plytixResponse.data.attributes || []);
        
        // Fetch Lightspeed attributes
        const lightspeedResponse = await axios.get('/api/lightspeed/attributes');
        setLightspeedAttributes(lightspeedResponse.data.attributes || []);
        
        // Fetch current mappings
        const mappingsResponse = await axios.get('/api/attribute-mapping');
        setCurrentMappings(mappingsResponse.data.mappings || []);
        
      } catch (err) {
        setError('Failed to load attributes or mappings');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleAddMapping = async (e) => {
    e.preventDefault();
    
    // Reset messages
    setError('');
    setSuccess('');
    
    // Validate form
    if (!selectedPlytixAttr || !selectedLightspeedAttr) {
      setError('Both Plytix and Lightspeed attributes are required');
      return;
    }
    
    try {
      setSaving(true);
      
      await axios.post('/api/attribute-mapping', {
        plytix_attribute: selectedPlytixAttr,
        lightspeed_attribute: selectedLightspeedAttr,
        transformation_rule: transformationRule || null
      });
      
      // Refresh mappings
      const mappingsResponse = await axios.get('/api/attribute-mapping');
      setCurrentMappings(mappingsResponse.data.mappings || []);
      
      // Reset form
      setSelectedPlytixAttr('');
      setSelectedLightspeedAttr('');
      setTransformationRule('');
      
      setSuccess('Attribute mapping added successfully');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add attribute mapping');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMapping = async (id) => {
    try {
      await axios.delete(`/api/attribute-mapping/${id}`);
      
      // Refresh mappings
      const mappingsResponse = await axios.get('/api/attribute-mapping');
      setCurrentMappings(mappingsResponse.data.mappings || []);
      
      setSuccess('Attribute mapping deleted successfully');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete attribute mapping');
      console.error(err);
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
    <div className="attribute-mapping-container">
      <div className="page-header">
        <h2>Attribute Mapping</h2>
        <p className="lead">Map Plytix attributes to Lightspeed fields to control how data is synchronized.</p>
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
      
      <div className="row">
        <div className="col-md-6">
          <div className="card mb-4">
            <div className="card-header">
              <h5>Create New Mapping</h5>
            </div>
            <div className="card-body">
              <form onSubmit={handleAddMapping}>
                <div className="form-group">
                  <label htmlFor="plytixAttribute">Plytix Attribute</label>
                  <select
                    className="form-control"
                    id="plytixAttribute"
                    value={selectedPlytixAttr}
                    onChange={(e) => setSelectedPlytixAttr(e.target.value)}
                    disabled={saving}
                  >
                    <option value="">Select Plytix Attribute</option>
                    {plytixAttributes.map(attr => (
                      <option key={attr.id} value={attr.id}>
                        {attr.label} ({attr.id})
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label htmlFor="lightspeedAttribute">Lightspeed Attribute</label>
                  <select
                    className="form-control"
                    id="lightspeedAttribute"
                    value={selectedLightspeedAttr}
                    onChange={(e) => setSelectedLightspeedAttr(e.target.value)}
                    disabled={saving}
                  >
                    <option value="">Select Lightspeed Attribute</option>
                    {lightspeedAttributes.map(attr => (
                      <option key={attr.id} value={attr.id}>
                        {attr.label} ({attr.id})
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group">
                  <label htmlFor="transformationRule">Transformation Rule (Optional)</label>
                  <input
                    type="text"
                    className="form-control"
                    id="transformationRule"
                    value={transformationRule}
                    onChange={(e) => setTransformationRule(e.target.value)}
                    disabled={saving}
                    placeholder="e.g., uppercase, lowercase, etc."
                  />
                  <small className="form-text text-muted">
                    Specify how to transform the data before synchronization (e.g., uppercase, lowercase).
                  </small>
                </div>
                
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  {saving ? 'Adding...' : 'Add Mapping'}
                </button>
              </form>
            </div>
          </div>
        </div>
        
        <div className="col-md-6">
          <div className="card">
            <div className="card-header">
              <h5>Current Mappings</h5>
            </div>
            <div className="card-body">
              {currentMappings.length === 0 ? (
                <p className="text-muted">No attribute mappings found. Create your first mapping to get started.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover">
                    <thead>
                      <tr>
                        <th>Plytix Attribute</th>
                        <th>Lightspeed Attribute</th>
                        <th>Transformation</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentMappings.map(mapping => (
                        <tr key={mapping.id}>
                          <td>{mapping.plytix_attribute}</td>
                          <td>{mapping.lightspeed_attribute}</td>
                          <td>{mapping.transformation_rule || '-'}</td>
                          <td>
                            <button
                              className="btn btn-sm btn-danger"
                              onClick={() => handleDeleteMapping(mapping.id)}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <div className="mapping-info mt-4">
        <div className="alert alert-info">
          <h5>About Attribute Mapping</h5>
          <p>
            Attribute mapping defines how product data from Plytix is transformed and mapped to
            Lightspeed fields during synchronization.
          </p>
          <p>
            <strong>Important:</strong> Make sure to map all required Lightspeed fields to ensure
            products can be created successfully.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AttributeMapping;
