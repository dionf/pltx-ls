// frontend/src/components/Profile.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const Profile = () => {
  const [formData, setFormData] = useState({
    email: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('profile');
  const navigate = useNavigate();

  const { email, currentPassword, newPassword, confirmPassword } = formData;

  useEffect(() => {
    const fetchUserData = async () => {
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
        
        // Fetch user profile
        const res = await axios.get('/api/auth/profile', config);
        
        setUser(res.data.user);
        setFormData(prevState => ({
          ...prevState,
          email: res.data.user.email
        }));
        setLoading(false);
      } catch (err) {
        setError('Failed to load user data');
        setLoading(false);
        
        // If unauthorized, redirect to login
        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          navigate('/login');
        }
      }
    };
    
    fetchUserData();
  }, [navigate]);

  const onChange = e => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const updateProfile = async e => {
    e.preventDefault();
    
    // Clear previous messages
    setError('');
    setMessage('');
    
    try {
      setUpdating(true);
      
      // Get token from localStorage
      const token = localStorage.getItem('token');
      
      // Set auth header
      const config = {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      };
      
      const body = JSON.stringify({ email });
      
      // Update profile
      const res = await axios.put('/api/auth/profile', body, config);
      
      setUser(res.data.user);
      setMessage('Profile updated successfully');
      setUpdating(false);
    } catch (err) {
      setUpdating(false);
      setError(err.response?.data?.error || 'Failed to update profile');
    }
  };

  const changePassword = async e => {
    e.preventDefault();
    
    // Clear previous messages
    setError('');
    setMessage('');
    
    // Validate passwords
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long');
      return;
    }
    
    try {
      setUpdating(true);
      
      // Get token from localStorage
      const token = localStorage.getItem('token');
      
      // Set auth header
      const config = {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      };
      
      const body = JSON.stringify({ currentPassword, newPassword });
      
      // Change password
      await axios.put('/api/auth/change-password', body, config);
      
      // Clear password fields
      setFormData({
        ...formData,
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      
      setMessage('Password changed successfully');
      setUpdating(false);
    } catch (err) {
      setUpdating(false);
      setError(err.response?.data?.error || 'Failed to change password');
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="profile-container">
      <div className="profile-header">
        <h1>Account Settings</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </button>
      </div>
      
      <div className="profile-tabs">
        <button 
          className={`tab-button ${activeTab === 'profile' ? 'active' : ''}`}
          onClick={() => setActiveTab('profile')}
        >
          Profile Information
        </button>
        <button 
          className={`tab-button ${activeTab === 'password' ? 'active' : ''}`}
          onClick={() => setActiveTab('password')}
        >
          Change Password
        </button>
      </div>
      
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      
      {activeTab === 'profile' && user && (
        <div className="profile-content">
          <div className="profile-info">
            <div className="info-item">
              <span className="info-label">Username:</span>
              <span className="info-value">{user.username}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Account Created:</span>
              <span className="info-value">{new Date(user.created_at).toLocaleDateString()}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Last Login:</span>
              <span className="info-value">
                {user.last_login ? new Date(user.last_login).toLocaleString() : 'N/A'}
              </span>
            </div>
          </div>
          
          <form onSubmit={updateProfile} className="profile-form">
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                value={email}
                onChange={onChange}
                required
              />
            </div>
            
            <button type="submit" className="btn btn-primary" disabled={updating}>
              {updating ? 'Updating...' : 'Update Profile'}
            </button>
          </form>
        </div>
      )}
      
      {activeTab === 'password' && (
        <div className="profile-content">
          <form onSubmit={changePassword} className="password-form">
            <div className="form-group">
              <label htmlFor="currentPassword">Current Password</label>
              <input
                type="password"
                id="currentPassword"
                name="currentPassword"
                value={currentPassword}
                onChange={onChange}
                required
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="newPassword">New Password</label>
              <input
                type="password"
                id="newPassword"
                name="newPassword"
                value={newPassword}
                onChange={onChange}
                required
              />
              <small>Password must be at least 8 characters long</small>
            </div>
            
            <div className="form-group">
              <label htmlFor="confirmPassword">Confirm New Password</label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={confirmPassword}
                onChange={onChange}
                required
              />
            </div>
            
            <button type="submit" className="btn btn-primary" disabled={updating}>
              {updating ? 'Changing Password...' : 'Change Password'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default Profile;
