// frontend/src/components/Synchronization.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

const Synchronization = () => {
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [jobLogs, setJobLogs] = useState([]);
  const [schedule, setSchedule] = useState(null);
  const [newSchedule, setNewSchedule] = useState({
    frequency: 'daily',
    time: '00:00',
    days: [1, 2, 3, 4, 5], // Monday to Friday
    enabled: true
  });
  const [loading, setLoading] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [syncRunning, setSyncRunning] = useState(false);
  // Add the missing variable
  const [showWorkflowFilter, setShowWorkflowFilter] = useState(true);
  
  const navigate = useNavigate();

  useEffect(() => {
    const fetchData = async () => {
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
        
        // Fetch synchronization jobs
        const jobsRes = await axios.get('/api/sync/jobs', config);
        setJobs(jobsRes.data.jobs || []);
        
        // Check if any job is running
        const runningJob = jobsRes.data.jobs.find(job => job.status === 'running');
        setSyncRunning(!!runningJob);
        
        setJobsLoading(false);
        
        // Fetch synchronization schedule
        const scheduleRes = await axios.get('/api/sync/schedule', config);
        setSchedule(scheduleRes.data.schedule);
        
        if (scheduleRes.data.schedule) {
          setNewSchedule({
            frequency: scheduleRes.data.schedule.frequency,
            time: scheduleRes.data.schedule.time,
            days: scheduleRes.data.schedule.days,
            enabled: scheduleRes.data.schedule.enabled
          });
        }
        
        setScheduleLoading(false);
        setLoading(false);
      } catch (err) {
        setError(err.response?.data?.error || 'Failed to load synchronization data');
        setLoading(false);
        setJobsLoading(false);
        setScheduleLoading(false);
        
        // If unauthorized, redirect to login
        if (err.response?.status === 401 || err.response?.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          navigate('/login');
        }
      }
    };
    
    fetchData();
    
    // Set up polling for job status updates
    const interval = setInterval(() => {
      if (syncRunning) {
        refreshJobs();
      }
    }, 5000); // Poll every 5 seconds
    
    return () => clearInterval(interval);
  }, [navigate, syncRunning]);

  const refreshJobs = async () => {
    try {
      // Get token from localStorage
      const token = localStorage.getItem('token');
      
      // Set auth header
      const config = {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      };
      
      // Fetch synchronization jobs
      const jobsRes = await axios.get('/api/sync/jobs', config);
      setJobs(jobsRes.data.jobs || []);
      
      // Check if any job is running
      const runningJob = jobsRes.data.jobs.find(job => job.status === 'running');
      setSyncRunning(!!runningJob);
      
      // If we have a selected job, refresh its details
      if (selectedJob) {
        const updatedJob = jobsRes.data.jobs.find(job => job.id === selectedJob.id);
        if (updatedJob) {
          setSelectedJob(updatedJob);
          fetchJobDetails(updatedJob.id);
        }
      }
    } catch (err) {
      console.error('Error refreshing jobs:', err);
    }
  };

  const fetchJobDetails = async (jobId) => {
    try {
      // Get token from localStorage
      const token = localStorage.getItem('token');
      
      // Set auth header
      const config = {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      };
      
      // Fetch job details
      const res = await axios.get(`/api/sync/jobs/${jobId}`, config);
      setSelectedJob(res.data.job);
      setJobLogs(res.data.logs || []);
    } catch (err) {
      setError(err.response?.data?.error || `Failed to load job details for job ${jobId}`);
    }
  };

  const startSync = async () => {
    // Clear previous messages
    setError('');
    setMessage('');
    
    try {
      // Get token from localStorage
      const token = localStorage.getItem('token');
      
      // Set auth header
      const config = {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      };
      
      // Start synchronization
      const res = await axios.post('/api/sync/start', {}, config);
      
      setSyncRunning(true);
      setMessage('Synchronization started successfully');
      
      // Refresh jobs list
      refreshJobs();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start synchronization');
    }
  };

  const handleScheduleChange = (e) => {
    const { name, value, type, checked } = e.target;
    
    if (name === 'days') {
      // Handle multiple select for days
      const dayValue = parseInt(value);
      const currentDays = [...newSchedule.days];
      
      if (currentDays.includes(dayValue)) {
        // Remove day if already selected
        setNewSchedule({
          ...newSchedule,
          days: currentDays.filter(day => day !== dayValue)
        });
      } else {
        // Add day if not already selected
        setNewSchedule({
          ...newSchedule,
          days: [...currentDays, dayValue].sort()
        });
      }
    } else {
      // Handle other inputs
      setNewSchedule({
        ...newSchedule,
        [name]: type === 'checkbox' ? checked : value
      });
    }
  };

  const saveSchedule = async () => {
    // Clear previous messages
    setError('');
    setMessage('');
    
    try {
      // Get token from localStorage
      const token = localStorage.getItem('token');
      
      // Set auth header
      const config = {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      };
      
      // Save schedule
      const res = await axios.post('/api/sync/schedule', newSchedule, config);
      
      setSchedule(res.data.schedule);
      setMessage('Synchronization schedule saved successfully');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save synchronization schedule');
    }
  };

  const deleteSchedule = async () => {
    // Clear previous messages
    setError('');
    setMessage('');
    
    try {
      // Get token from localStorage
      const token = localStorage.getItem('token');
      
      // Set auth header
      const config = {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      };
      
      // Delete schedule
      await axios.delete('/api/sync/schedule', config);
      
      setSchedule(null);
      setMessage('Synchronization schedule deleted successfully');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete synchronization schedule');
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString();
  };

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'running':
        return 'status-badge running';
      case 'completed':
        return 'status-badge completed';
      case 'failed':
        return 'status-badge failed';
      default:
        return 'status-badge';
    }
  };

  const getLogLevelClass = (level) => {
    switch (level) {
      case 'error':
        return 'log-level error';
      case 'warning':
        return 'log-level warning';
      case 'info':
        return 'log-level info';
      default:
        return 'log-level';
    }
  };

  const getDayName = (day) => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[day] || day;
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="synchronization-container">
      <div className="synchronization-header">
        <h1>Synchronization</h1>
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </button>
      </div>
      
      {error && <div className="alert alert-danger">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}
      
      <div className="synchronization-content">
        <div className="manual-sync-section">
          <h2>Manual Synchronization</h2>
          <p>
            Start a manual synchronization to push products from Plytix to Lightspeed.
            {showWorkflowFilter && (
              <span> Only products with the content workflow status "4. Ready to be published" will be synchronized.</span>
            )}
          </p>
          
          <button 
            className="btn btn-primary"
            onClick={startSync}
            disabled={syncRunning}
          >
            {syncRunning ? 'Synchronization Running...' : 'Start Synchronization'}
          </button>
        </div>
        
        <div className="schedule-section">
          <h2>Scheduled Synchronization</h2>
          <p>
            Set up automatic synchronization to regularly push products from Plytix to Lightspeed.
          </p>
          
          <div className="schedule-form">
            <div className="form-group">
              <label htmlFor="frequency">Frequency:</label>
              <select
                id="frequency"
                name="frequency"
                className="form-control"
                value={newSchedule.frequency}
                onChange={handleScheduleChange}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            
            {newSchedule.frequency === 'weekly' && (
              <div className="form-group">
                <label>Days of Week:</label>
                <div className="days-checkboxes">
                  {[0, 1, 2, 3, 4, 5, 6].map(day => (
                    <div className="day-checkbox" key={day}>
                      <input
                        type="checkbox"
                        id={`day-${day}`}
                        name="days"
                        value={day}
                        checked={newSchedule.days.includes(day)}
                        onChange={handleScheduleChange}
                      />
                      <label htmlFor={`day-${day}`}>{getDayName(day)}</label>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            <div className="form-group">
              <label htmlFor="time">Time (UTC):</label>
              <input
                type="time"
                id="time"
                name="time"
                className="form-control"
                value={newSchedule.time}
                onChange={handleScheduleChange}
              />
            </div>
            
            <div className="form-check">
              <input
                type="checkbox"
                id="enabled"
                name="enabled"
                className="form-check-input"
                checked={newSchedule.enabled}
                onChange={handleScheduleChange}
              />
              <label htmlFor="enabled" className="form-check-label">
                Enable scheduled synchronization
              </label>
            </div>
            
            <div className="schedule-actions">
              <button 
                className="btn btn-primary"
                onClick={saveSchedule}
              >
                Save Schedule
              </button>
              
              {schedule && (
                <button 
                  className="btn btn-danger"
                  onClick={deleteSchedule}
                >
                  Delete Schedule
                </button>
              )}
            </div>
          </div>
          
          {schedule && (
            <div className="current-schedule">
              <h3>Current Schedule</h3>
              <p>
                <strong>Frequency:</strong> {schedule.frequency.charAt(0).toUpperCase() + schedule.frequency.slice(1)}
              </p>
              
              {schedule.frequency === 'weekly' && (
                <p>
                  <strong>Days:</strong> {schedule.days.map(day => getDayName(day)).join(', ')}
                </p>
              )}
              
              <p>
                <strong>Time:</strong> {schedule.time} UTC
              </p>
              
              <p>
                <strong>Status:</strong> {schedule.enabled ? 'Enabled' : 'Disabled'}
              </p>
              
              {schedule.last_run && (
                <p>
                  <strong>Last Run:</strong> {formatDate(schedule.last_run)}
                </p>
              )}
            </div>
          )}
        </div>
        
        <div className="jobs-section">
          <h2>Synchronization History</h2>
          
          {jobsLoading ? (
            <p>Loading synchronization history...</p>
          ) : jobs.length === 0 ? (
            <p>No synchronization jobs found.</p>
          ) : (
            <div className="jobs-list">
              <table>
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
                  {jobs.map(job => (
                    <tr key={job.id} className={job.id === selectedJob?.id ? 'selected-job' : ''}>
                      <td>{job.id}</td>
                      <td>
                        <span className={getStatusBadgeClass(job.status)}>
                          {job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                        </span>
                      </td>
                      <td>{formatDate(job.started_at)}</td>
                      <td>{formatDate(job.completed_at)}</td>
                      <td>
                        {job.results ? (
                          <div className="job-results">
                            <span>Total: {job.results.total}</span>
                            <span>Created: {job.results.created}</span>
                            <span>Updated: {job.results.updated}</span>
                            <span>Failed: {job.results.failed}</span>
                          </div>
                        ) : job.error ? (
                          <span className="job-error">{job.error}</span>
                        ) : (
                          <span>-</span>
                        )}
                      </td>
                      <td>
                        <button 
                          className="btn btn-sm btn-info"
                          onClick={() => fetchJobDetails(job.id)}
                        >
                          View Details
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
  );
};

export default Synchronization;
