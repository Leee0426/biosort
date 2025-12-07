"use client";

import React, { useState, useEffect } from 'react';

export function NetworkScanner() {
  const [networks, setNetworks] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const scanNetworks = async () => {
    setLoading(true);
    setError('');
    
    try {
      const response = await fetch('/api/wifi/scan');
      const data = await response.json();
      
      if (response.ok) {
        setNetworks(data.networks);
      } else {
        setError(data.error || 'Failed to scan networks');
      }
    } catch (err) {
      setError('Network scanning unavailable');
      console.error('Scan failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    scanNetworks();
  }, []);

  return (
    <div>
      <button onClick={scanNetworks} disabled={loading}>
        {loading ? 'Scanning...' : 'Scan Networks'}
      </button>
      {error && <div className="error">{error}</div>}
      <div className="networks">
        {networks.map((network, index) => (
          <div key={index} className="network">
            <strong>{network.ssid}</strong>
            <span>Signal: {network.signal}%</span>
            <span>Security: {network.security}</span>
          </div>
        ))}
      </div>
    </div>
  );
}