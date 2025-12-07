"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { supabase } from '@/lib/supabase';

interface Device {
  serial: string;
  ip: string;
  status: string;
  type: string;
  connection: 'ap' | 'sta';
  ap_ssid?: string;
}

interface Network {
  ssid: string;
  security: string;
  signal: number;
  hasPassword: boolean;
}

// DeviceDiscovery component defined OUTSIDE the main component
const DeviceDiscovery = ({ onDeviceFound }: { onDeviceFound: (device: any) => void }) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [scanning, setScanning] = useState(true);

  useEffect(() => {
    discoverNetworkDevices();
  }, []);

  const discoverNetworkDevices = async () => {
    setScanning(true);
    try {
      // Try common ESP32 IP ranges
      const commonIPs = [
        '192.168.100.182', // The one we know
        '192.168.1.100', '192.168.1.101', '192.168.1.102',
        '192.168.0.100', '192.168.0.101', '192.168.0.102',
        'esp32-cam.local' // mDNS
      ];

      const foundDevices: Device[] = [];

      for (const ip of commonIPs) {
        try {
          const response = await fetch(`http://${ip}/info`, {
            signal: AbortSignal.timeout(2000)
          });
          if (response.ok) {
            const data = await response.json();
            foundDevices.push({
              serial: data.serial,
              ip: ip,
              status: data.status,
              type: 'ESP32-CAM',
              connection: 'sta',
              ap_ssid: undefined
            });
            onDeviceFound({ ip, serial: data.serial });
          }
        } catch (error) {
          // Continue to next IP
        }
      }

      setDevices(foundDevices);
    } catch (error) {
      console.error('Device discovery failed:', error);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="border border-gray-300 rounded-lg p-4 bg-white">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-gray-900">Network Devices</h3>
        <button 
          onClick={discoverNetworkDevices}
          disabled={scanning}
          className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:bg-gray-400 hover:bg-blue-700 transition-colors duration-200"
        >
          {scanning ? "Scanning..." : "Rescan"}
        </button>
      </div>
      
      {scanning ? (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-sm text-gray-600 mt-2">Scanning network for devices...</p>
        </div>
      ) : devices.length === 0 ? (
        <div className="text-center py-4 text-gray-500">
          <p>No devices found automatically.</p>
          <p className="text-sm mt-1">Try manual IP: <strong>192.168.100.182</strong></p>
        </div>
      ) : (
        <div className="space-y-2">
          {devices.map((device, idx) => (
            <div key={idx} className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="font-medium text-gray-900">✅ {device.serial}</div>
              <div className="text-sm text-gray-600">IP: {device.ip}</div>
              <div className="text-xs text-gray-500">Status: {device.status}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Main WiFiConfigPage component
export default function WiFiConfigPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [selectedNetwork, setSelectedNetwork] = useState("");
  const [password, setPassword] = useState("");
  const [serialCode, setSerialCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [manualIP, setManualIP] = useState("");

  // Fetch user role from database
  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user?.email) {
        console.log("No user email available");
        return;
      }

      try {
        const { data, error } = await supabase
          .from('accounts')
          .select('role, email, name')
          .eq('email', user.email)
          .single();

        if (error) {
          console.error("Error fetching role:", error);
          if (user.email === 'analynrapsing@gmail.com' || user.email === 'eduardocardinum@gmail.com') {
            setUserRole('admin');
          } else {
            setUserRole('user');
          }
          return;
        }

        if (data) {
          setUserRole(data.role);
        } else {
          if (user.email === 'analynrapsing@gmail.com' || user.email === 'eduardocardinum@gmail.com') {
            setUserRole('admin');
          } else {
            setUserRole('user');
          }
        }

      } catch (error: any) {
        console.error('Error fetching user role:', error);
        if (user.email === 'analynrapsing@gmail.com' || user.email === 'eduardocardinum@gmail.com') {
          setUserRole('admin');
        } else {
          setUserRole('user');
        }
      }
    };

    fetchUserRole();
  }, [user]);

  // Hardcoded valid serial codes (you can change these)
  const validSerialCodes = [
    "ESP32CAM12345",
    "ESP32CAM67890", 
    "BIOSORT2024",
    "SECURE123"
  ];

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/');
  };

  // Discover ESP32 devices
  const discoverDevices = async () => {
    setIsLoading(true);
    setMessage("🔍 Searching for ESP32 devices...");
    
    try {
      const response = await fetch('/api/devices/discover');
      const data = await response.json();
      
      if (data.devices && data.devices.length > 0) {
        setDevices(data.devices);
        setMessage(`✅ Found ${data.devices.length} device(s)`);
        
        // Group devices by connection type
        const apDevices = data.devices.filter((d: Device) => d.connection === 'ap');
        const staDevices = data.devices.filter((d: Device) => d.connection === 'sta');
        
        if (apDevices.length > 0) {
          setMessage(`📡 ${apDevices.length} device(s) in setup mode, ${staDevices.length} already connected`);
        }
      } else {
        setMessage("❌ No ESP32 devices found. Make sure they are powered on.");
      }
    } catch (error) {
      setMessage("❌ Device discovery failed");
    } finally {
      setIsLoading(false);
    }
  };

  // Manual IP device addition function
  const addManualDevice = async () => {
    if (!manualIP) {
      setMessage("❌ Please enter an IP address");
      return;
    }

    setIsLoading(true);
    setMessage(`🔍 Testing ${manualIP}...`);
    
    try {
      const response = await fetch('/api/devices/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: manualIP })
      });

      const data = await response.json();
      
      if (response.ok && data.device) {
        setDevices(prev => {
          const exists = prev.find(d => d.ip === data.device.ip);
          return exists ? prev : [...prev, data.device];
        });
        setSelectedDevice(data.device);
        setMessage(`✅ Found ESP32 device at ${manualIP}`);
        setManualIP("");
      } else {
        setMessage(`❌ ${data.error || "No ESP32 device found"}`);
      }
    } catch (error) {
      setMessage(`❌ Failed to connect to ${manualIP}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Scan networks via selected ESP32 device
  const scanNetworks = async () => {
    if (!selectedDevice) {
      setMessage("❌ Please select a device first");
      return;
    }

    setIsLoading(true);
    setMessage(`📡 Scanning networks via ${selectedDevice.serial}...`);
    
    try {
      const response = await fetch('/api/wifi/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceIp: selectedDevice.ip })
      });

      const data = await response.json();
      
      if (response.ok) {
        setNetworks(data.networks);
        setMessage(`✅ Found ${data.networks.length} networks`);
        setStep(2);
      } else {
        setMessage(`❌ ${data.error || "Failed to scan networks"}`);
      }
    } catch (error) {
      setMessage("❌ Network scanning failed");
    } finally {
      setIsLoading(false);
    }
  };

  // Configure device with WiFi credentials
  const configureDevice = async () => {
    if (!selectedDevice || !selectedNetwork) {
      setMessage("❌ Please select device and network");
      return;
    }

    setIsLoading(true);
    setMessage("📡 Configuring device...");
    
    try {
      const response = await fetch('/api/devices/configure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceIp: selectedDevice.ip,
          ssid: selectedNetwork,
          password: password
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessage(`✅ WiFi credentials sent to device!`);
        setStep(3);
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch (error) {
      setMessage("❌ Configuration failed");
    } finally {
      setIsLoading(false);
    }
  };

  // Verify serial code and complete configuration
  const verifySerialCode = async () => {
    if (!selectedDevice || !serialCode) {
      setMessage("❌ Please enter serial code");
      return;
    }

    setIsLoading(true);
    setMessage("🔐 Verifying serial code and completing configuration...");
    
    try {
      // FIRST: Send serial code to ESP32 via your API
      const response = await fetch('/api/devices/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceIp: selectedDevice.ip,
          serialCode: serialCode.trim()
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessage(`✅ Device configured successfully! Connected to: ${data.ssid}`);
        localStorage.setItem("esp32IP", data.ip);
        setStep(4);
      } else {
        setMessage(`⚠️ ${data.error} - But checking for device anyway...`);
        // Still proceed to step 4 even if there's an error
        setStep(4);
      }
    } catch (error) {
      setMessage("⚠️ Network issue - but checking for device anyway...");
      // Always proceed to step 4 even on error
      setStep(4);
    } finally {
      setIsLoading(false);
    }
  };

  // DISCONNECT DEVICE FUNCTION
  const disconnectDevice = async () => {
    if (!selectedDevice) return;
    
    setIsLoading(true);
    setMessage("🔌 Disconnecting device...");
    
    try {
      const response = await fetch('/api/devices/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceIp: selectedDevice.ip })
      });

      const data = await response.json();
      
      if (response.ok) {
        setMessage("✅ Disconnect command sent! Device will reboot and be ready for new configuration.");
        // Refresh device list after a delay
        setTimeout(() => {
          discoverDevices();
        }, 3000);
      } else {
        setMessage(`❌ ${data.error}`);
      }
    } catch (error) {
      setMessage("❌ Disconnect failed");
    } finally {
      setIsLoading(false);
    }
  };

  // Connect to device Access Point
  const connectToDeviceAP = async (device: Device) => {
    if (!device.ap_ssid) return;
    
    setMessage(`📱 Connect to WiFi: ${device.ap_ssid} (password: 12345678)`);
  };

  useEffect(() => {
    discoverDevices();
  }, []);

  return (
    <ProtectedRoute>
      {/* Updated to match Fine Tune page background color */}
      <div className="min-h-screen bg-gray-50">
       {/* Navbar - Same blue color as Fine Tune page */}
        <nav className="bg-[#0a6b9a] flex items-center justify-between px-4 sm:px-6 md:px-6 h-14">
          <div className="flex items-center space-x-2">
            <img 
              src="/logo.png" 
              alt="BioSort Logo" 
              className="h-8 w-8"
            />
            <span className="text-white text-xl ml-3">BioSort</span>
          </div>
          <div className="flex items-center space-x-6">
            <ul className="flex items-center space-x-6 text-white text-base font-normal">
              <li 
                onClick={() => router.push("/home")}
                className="flex items-center space-x-2 cursor-pointer select-none hover:text-[#3bff00] transition-colors"
              >
                <span>Home</span>
              </li>
              <li 
                onClick={() => router.push("/fine-tune")}
                className="flex items-center space-x-2 cursor-pointer select-none hover:text-[#3bff00] transition-colors"
              >
                <span>Fine Tune</span>
              </li>
              <li className="flex items-center space-x-2 cursor-pointer select-none text-[#3bff00]">
                <span>WiFi Config</span>
              </li>
              {userRole === 'admin' && (
                <li 
                  onClick={() => router.push("/accounts")}
                  className="flex items-center space-x-2 cursor-pointer select-none hover:text-[#3bff00] transition-colors"
                >
                  <span>Accounts</span>
                </li>
              )}
            </ul>
            <button 
              onClick={handleLogout}
              className="ml-6 px-4 py-2 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors"
            >
              Logout
            </button>
          </div>
        </nav>

        {/* Main Content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-4xl mx-auto">
            {/* Header Section */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                ESP32 WiFi Configuration
              </h1>
              <p className="text-gray-600 text-lg">
                Configure your ESP32 devices for network connectivity
              </p>
            </div>

            {/* Progress Steps */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
              <div className="flex justify-center">
                {[1, 2, 3, 4].map((stepNum) => (
                  <div key={stepNum} className="flex items-center">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
                      step >= stepNum 
                        ? 'bg-blue-600 border-blue-600 text-white' 
                        : 'bg-white border-gray-300 text-gray-500'
                    } font-semibold`}>
                      {stepNum}
                    </div>
                    {stepNum < 4 && (
                      <div className={`w-16 h-1 mx-2 ${
                        step > stepNum ? 'bg-blue-600' : 'bg-gray-300'
                      }`} />
                    )}
                  </div>
                ))}
              </div>
              <div className="flex justify-center mt-4 text-sm text-gray-600">
                <div className="w-24 text-center">Device</div>
                <div className="w-24 text-center">Network</div>
                <div className="w-24 text-center">Verify</div>
                <div className="w-24 text-center">Complete</div>
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              {message && (
                <div className={`p-4 rounded-lg mb-6 ${
                  message.includes("✅") ? "bg-green-50 border border-green-200 text-green-800" :
                  message.includes("❌") ? "bg-red-50 border border-red-200 text-red-800" :
                  "bg-blue-50 border border-blue-200 text-blue-800"
                }`}>
                  {message}
                </div>
              )}

              {/* Step 1: Device Selection */}
              {step === 1 && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Select ESP32 Device</h2>
                  
                  {/* Manual IP Entry Section */}
                  <div className="border border-gray-300 rounded-lg p-4 bg-gray-50">
                    <h3 className="font-medium mb-3 text-gray-900">Manual IP Entry</h3>
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        value={manualIP}
                        onChange={(e) => setManualIP(e.target.value)}
                        placeholder="Enter device IP (e.g., 192.168.4.1)"
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 text-gray-900"
                      />
                      <button
                        onClick={addManualDevice}
                        disabled={isLoading || !manualIP}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-400 hover:bg-blue-700 transition-colors duration-200"
                      >
                        Test IP
                      </button>
                    </div>
                    <p className="text-sm text-gray-600 mt-2">
                      Try: <strong>192.168.4.1</strong> (AP mode) or check your router for the device IP
                    </p>
                  </div>

                  <div className="border border-gray-300 rounded-lg">
                    <div className="bg-gray-50 p-4 border-b flex justify-between items-center">
                      <span className="text-gray-900 font-medium">Available Devices</span>
                      <button 
                        onClick={discoverDevices}
                        disabled={isLoading}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm disabled:bg-gray-400 hover:bg-blue-700 transition-colors duration-200"
                      >
                        {isLoading ? "Scanning..." : "Rescan"}
                      </button>
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {devices.length === 0 ? (
                        <div className="p-8 text-center text-gray-500">
                          <div className="text-4xl mb-2">🔍</div>
                          <p>No devices found.</p>
                          <p className="text-sm mt-1">Use manual IP entry above or make sure your ESP32 is connected.</p>
                        </div>
                      ) : (
                        devices.map((device, idx) => (
                          <div
                            key={idx}
                            className={`p-4 border-b cursor-pointer ${
                              selectedDevice?.serial === device.serial ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50 border-gray-200'
                            } transition-colors duration-200`}
                            onClick={() => setSelectedDevice(device)}
                          >
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-medium text-gray-900">{device.serial}</div>
                                <div className="text-sm text-gray-600">
                                  {device.connection === 'ap' ? '🔵 Setup Mode' : '🟢 Connected'}
                                  {device.ap_ssid && ` • AP: ${device.ap_ssid}`}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  IP: {device.ip} • {device.type}
                                </div>
                              </div>
                              
                              <div className="flex space-x-2">
                                {device.connection === 'ap' && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      connectToDeviceAP(device);
                                    }}
                                    className="px-3 py-1 bg-orange-500 text-white rounded text-sm hover:bg-orange-600 transition-colors duration-200"
                                  >
                                    Connect to AP
                                  </button>
                                )}
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedDevice(device);
                                  }}
                                  className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors duration-200"
                                >
                                  Select
                                </button>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* DISCONNECT SECTION */}
                  {selectedDevice && selectedDevice.status === 'configured' && (
                    <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <h3 className="font-semibold text-yellow-800">⚠️ Device Already Configured</h3>
                      <p className="text-sm text-yellow-700 mt-1">
                        This device is already connected to a network. You need to disconnect it first to configure a new network.
                      </p>
                      <button
                        onClick={disconnectDevice}
                        disabled={isLoading}
                        className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-400 transition-colors duration-200"
                      >
                        {isLoading ? "Disconnecting..." : "Disconnect Device"}
                      </button>
                    </div>
                  )}

                  {selectedDevice && selectedDevice.connection === 'ap' && (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                      <h3 className="font-semibold text-gray-900">Ready to Configure</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        This device is in setup mode and ready for WiFi configuration.
                      </p>
                      <button
                        onClick={scanNetworks}
                        disabled={isLoading}
                        className="mt-3 w-full py-3 bg-blue-600 text-white rounded-lg font-semibold disabled:bg-gray-400 hover:bg-blue-700 transition-colors duration-200"
                      >
                        {isLoading ? "Scanning..." : "Scan Networks"}
                      </button>
                    </div>
                  )}

                  {selectedDevice && selectedDevice.connection === 'sta' && selectedDevice.status !== 'configured' && (
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <h3 className="font-semibold text-gray-900">Device Ready</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        This device is connected and ready for configuration.
                      </p>
                      <button
                        onClick={scanNetworks}
                        disabled={isLoading}
                        className="mt-3 w-full py-3 bg-blue-600 text-white rounded-lg font-semibold disabled:bg-gray-400 hover:bg-blue-700 transition-colors duration-200"
                      >
                        {isLoading ? "Scanning..." : "Scan Networks"}
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Step 2: Network Selection */}
              {step === 2 && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Select WiFi Network</h2>
                  
                  <div className="border border-gray-300 rounded-lg">
                    <div className="bg-gray-50 p-4 border-b text-gray-900 font-medium">
                      Available Networks
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {networks.map((network, idx) => (
                        <div
                          key={idx}
                          className={`p-4 border-b cursor-pointer ${
                            selectedNetwork === network.ssid ? 'bg-blue-50 border-blue-200' : 'hover:bg-gray-50 border-gray-200'
                          } transition-colors duration-200`}
                          onClick={() => setSelectedNetwork(network.ssid)}
                        >
                          <div className="font-medium text-gray-900">{network.ssid}</div>
                          <div className="text-sm text-gray-600">
                            {network.security} • {network.signal}% signal
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {selectedNetwork && networks.find(n => n.ssid === selectedNetwork)?.hasPassword && (
                    <div>
                      <label className="block text-sm font-medium mb-2 text-gray-700">
                        Password for {selectedNetwork}
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 text-gray-900"
                        placeholder="Enter WiFi password"
                      />
                    </div>
                  )}

                  <div className="flex space-x-3">
                    <button
                      onClick={() => setStep(1)}
                      className="flex-1 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors duration-200"
                    >
                      Back
                    </button>
                    <button
                      onClick={configureDevice}
                      disabled={!selectedNetwork || isLoading}
                      className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-semibold disabled:bg-gray-400 hover:bg-blue-700 transition-colors duration-200"
                    >
                      {isLoading ? "Configuring..." : "Send WiFi Credentials"}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Serial Code Verification */}
              {step === 3 && (
                <div className="space-y-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Enter Serial Code</h2>
                  <p className="text-gray-600">
                    Enter the serial code to authorize WiFi configuration
                  </p>
                  
                  <div className="text-center">
                    <input
                      type="text"
                      value={serialCode}
                      onChange={(e) => setSerialCode(e.target.value)}
                      className="w-full p-4 border border-gray-300 rounded-lg text-center text-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200 text-gray-900"
                      placeholder="Enter serial code"
                    />
                  </div>

                  <div className="flex space-x-3">
                    <button
                      onClick={() => setStep(2)}
                      className="flex-1 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors duration-200"
                    >
                      Back
                    </button>
                    <button
                      onClick={verifySerialCode}
                      disabled={!serialCode || isLoading}
                      className="flex-1 py-3 bg-blue-600 text-white rounded-lg font-semibold disabled:bg-gray-400 hover:bg-blue-700 transition-colors duration-200"
                    >
                      {isLoading ? "Verifying..." : "Verify & Connect"}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 4: Success */}
              {step === 4 && (
                <div className="text-center space-y-6">
                  <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto">
                    <span className="text-white text-2xl">✓</span>
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-900">Configuration Complete!</h2>
                  <p className="text-gray-600">
                    WiFi credentials sent to device. Searching for connected devices...
                  </p>
                  
                  <DeviceDiscovery 
                    onDeviceFound={(device) => {
                      localStorage.setItem("esp32IP", device.ip);
                      setMessage(`✅ Found device: ${device.ip}`);
                    }} 
                  />
                  
                  <div className="space-y-3">
                    <button
                      onClick={() => router.push('/home')}
                      className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors duration-200"
                    >
                      Go to Home
                    </button>
                    <button
                      onClick={() => {
                        setStep(1);
                        setSerialCode('');
                        setSelectedNetwork('');
                        setPassword('');
                        setMessage('');
                        discoverDevices();
                      }}
                      className="w-full py-3 bg-gray-500 text-white rounded-lg font-semibold hover:bg-gray-600 transition-colors duration-200"
                    >
                      Configure Another Device
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}