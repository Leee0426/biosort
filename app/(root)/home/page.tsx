"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { supabase } from '@/lib/supabase';
import { roboflowAPI } from '@/lib/roboflowAPI';

// Utility functions for ESP32 communication
const fetchESP32 = async (endpoint, options = {}) => {
  const isProduction = process.env.NODE_ENV === 'production';
  
  let baseUrl;
  
  if (isProduction) {
    // In production, use the proxy
    baseUrl = '/api/esp32';
  } else {
    // In development, allow direct connection
    if (typeof window !== 'undefined') {
      const controllerIP = localStorage.getItem('controllerIP') || '192.168.1.101';
      baseUrl = `http://${controllerIP}`;
    } else {
      // Server-side fallback
      baseUrl = '/api/esp32';
    }
  }
  
  const url = `${baseUrl}/${endpoint}`;
  
  // Add timeout to prevent hanging requests
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    clearTimeout(timeoutId);
    
    // Handle specific errors
    if (error.name === 'AbortError') {
      throw new Error('Request timeout: ESP32 controller not responding');
    }
    
    // For development, fall back to direct connection if proxy fails
    if (!isProduction) {
      console.log('Proxy failed, trying direct connection...');
      const controllerIP = localStorage.getItem('controllerIP');
      if (controllerIP) {
        try {
          const directUrl = `http://${controllerIP}/${endpoint}`;
          const directResponse = await fetch(directUrl, {
            ...options,
            headers: {
              'Content-Type': 'application/json',
              ...options.headers,
            },
          });
          
          if (!directResponse.ok) {
            throw new Error(`Direct connection failed: HTTP ${directResponse.status}`);
          }
          
          return await directResponse.json();
        } catch (directError) {
          throw new Error(`Both proxy and direct connection failed: ${directError.message}`);
        }
      }
    }
    
    throw error;
  }
};

// Interface for detection with timestamp
interface DetectionWithTime {
  class: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  timestamp: number;
  color: string;
  displayName: string;
}

// Bin Status Interface
interface BinStatus {
  distance: number;
  state: string;
  fillPercentage: number;
  warningSent: boolean;
}

interface BinCapacityData {
  bin1: BinStatus;
  bin2: BinStatus;
  thresholds: {
    empty: number;
    nearlyFull: number;
    full: number;
  };
}

// Waste Classification Mapping
const wasteClassification = {
  "Carrots": "biodegradable",
  "Chili": "biodegradable", 
  "Egg shell": "biodegradable",
  "Fish Bones": "biodegradable",
  "food waste": "biodegradable",
  "Garlic peel": "biodegradable",
  "Garlic": "biodegradable",
  "Ginger": "biodegradable",
  "Laurel": "biodegradable",
  "Lettuce": "biodegradable",
  "Mixed Vegetables": "biodegradable",
  "Onion": "biodegradable",
  "Onion Peel": "biodegradable",
  "Rice": "biodegradable",
  "Tissue paper": "biodegradable",
  "Bones": "biodegradable",
  "Plastic": "plastic",
  "Juice Packet": "plastic",
  "Cigarette": "plastic",
  "Tansan": "plastic",
  "Paper Cup": "recyclable",
  "Can Lid": "recyclable",
  "Objects": "recyclable"
} as const;

type WasteType = "biodegradable" | "plastic" | "recyclable";

// Bin Capacity Indicator Component
const BinCapacityIndicator: React.FC<{
  binNumber: 1 | 2;
  bin: BinStatus;
  thresholds: { empty: number; nearlyFull: number; full: number };
  label: string;
}> = ({ binNumber, bin, thresholds, label }) => {
  const getBinColor = () => {
    if (bin.state === 'Full') return 'bg-red-600';
    if (bin.state === 'Nearly Full') return 'bg-yellow-500';
    if (bin.state === 'Normal') return 'bg-green-600';
    return 'bg-gray-400';
  };

  const getBinTextColor = () => {
    if (bin.state === 'Full') return 'text-red-700 font-bold';
    if (bin.state === 'Nearly Full') return 'text-yellow-700 font-semibold';
    if (bin.state === 'Normal') return 'text-green-700';
    return 'text-gray-600';
  };

  const getBinBorderColor = () => {
    if (bin.state === 'Full') return 'border-red-300';
    if (bin.state === 'Nearly Full') return 'border-yellow-300';
    if (bin.state === 'Normal') return 'border-green-300';
    return 'border-gray-300';
  };

  return (
    <div className={`p-4 rounded-lg border-2 ${getBinBorderColor()} bg-white`}>
      <div className="flex justify-between items-center mb-2">
        <div className="flex items-center space-x-2">
          <span className="text-lg font-semibold text-gray-800">
            Bin {binNumber}: {label}
          </span>
          <span className={`text-sm px-2 py-1 rounded-full ${getBinTextColor()}`}>
            {bin.state}
          </span>
        </div>
        <span className="text-gray-600 text-sm">
          {bin.distance > 0 ? `${bin.distance.toFixed(1)} cm` : '--'}
        </span>
      </div>
      
      {/* Fill level indicator */}
      <div className="mb-3">
        <div className="flex justify-between text-sm text-gray-600 mb-1">
          <span>Fill Level:</span>
          <span className="font-semibold">{bin.fillPercentage}%</span>
        </div>
        <div className="w-full h-6 bg-gray-200 rounded-full overflow-hidden">
          <div 
            className={`h-full rounded-full ${getBinColor()} transition-all duration-500 ease-out`}
            style={{ width: `${bin.fillPercentage}%` }}
          >
            <div className="h-full flex items-center justify-end pr-2">
              {bin.fillPercentage >= 20 && (
                <span className="text-white text-xs font-bold">
                  {bin.fillPercentage}%
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Threshold markers */}
      <div className="relative h-4 mb-1">
        <div className="absolute left-0 top-0 w-full h-1 bg-gray-300"></div>
        <div 
          className="absolute top-0 h-4 w-1 bg-green-600 transform -translate-x-1/2"
          style={{ left: `${(thresholds.nearlyFull / thresholds.empty) * 100}%` }}
          title={`Nearly Full: ${thresholds.nearlyFull}cm`}
        ></div>
        <div 
          className="absolute top-0 h-4 w-1 bg-red-600 transform -translate-x-1/2"
          style={{ left: `${(thresholds.full / thresholds.empty) * 100}%` }}
          title={`Full: ${thresholds.full}cm`}
        ></div>
      </div>
      
      <div className="flex justify-between text-xs text-gray-500">
        <span>Empty ({thresholds.empty}cm)</span>
        <span>Full ({thresholds.full}cm)</span>
      </div>
      
      {/* Current position indicator */}
      {bin.distance > 0 && bin.distance <= thresholds.empty && (
        <div className="mt-2">
          <div className="text-xs text-gray-600 mb-1">Current level:</div>
          <div className="relative h-4 bg-gray-100 rounded">
            <div 
              className="absolute top-0 h-6 w-2 bg-blue-600 transform -translate-x-1/2 -translate-y-1"
              style={{ 
                left: `${((thresholds.empty - bin.distance) / thresholds.empty) * 100}%`,
                top: '-4px'
              }}
              title={`Current: ${bin.distance.toFixed(1)}cm`}
            >
              <div className="absolute -top-6 left-1/2 transform -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-blue-700">
                {bin.distance.toFixed(1)}cm
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const HomePage: React.FC = () => {
  const router = useRouter();
  const { user } = useAuth();
  const [cameraIP, setCameraIP] = useState("");
  const [controllerIP, setControllerIP] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  // AI Detection States
  const [activeDetections, setActiveDetections] = useState<DetectionWithTime[]>([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [wasteStats, setWasteStats] = useState({
    biodegradable: 0,
    nonBiodegradable: 0,
    recyclable: 0
  });
  const [detectionHistory, setDetectionHistory] = useState<string[]>([]);
  const [apiStatus, setApiStatus] = useState("Initializing Roboflow API...");
  const [controllerStatus, setControllerStatus] = useState("🔌 Controller Disconnected");
  const [lastCommandSuccess, setLastCommandSuccess] = useState<boolean | null>(null);

  // Detection Cooldown State
  const [isInCooldown, setIsInCooldown] = useState(false);
  const [cooldownRemaining, setCooldownRemaining] = useState(0);

  // Ultrasonic Sensor States
  const [ultrasonicData, setUltrasonicData] = useState({
    distance: 0,
    objectDetected: false,
    objectStable: false,
    detectionActive: false,
    captureTriggered: false,
    threshold: 15
  });
  
  // Bin Capacity State
  const [binCapacity, setBinCapacity] = useState<BinCapacityData>({
    bin1: {
      distance: -1,
      state: 'Empty',
      fillPercentage: 0,
      warningSent: false
    },
    bin2: {
      distance: -1,
      state: 'Empty',
      fillPercentage: 0,
      warningSent: false
    },
    thresholds: {
      empty: 59,
      nearlyFull: 15,
      full: 10
    }
  });
  
  const [sensorMonitoring, setSensorMonitoring] = useState(false);

  // Streaming States
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamActive, setStreamActive] = useState(false);
  const [streamStartTime, setStreamStartTime] = useState<number>(0);
  const [streamDuration, setStreamDuration] = useState(0);

  // Performance States
  const [fps, setFps] = useState(0);
  const [detectionEnabled, setDetectionEnabled] = useState(true); // Auto-enable detection

  // Refs
  const imageRef = useRef<HTMLImageElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  // Performance refs
  const frameCountRef = useRef(0);
  const detectionCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(Date.now());
  const lastDetectionTimeRef = useRef(0);
  const animationFrameRef = useRef<number>(0);
  const detectionCooldownRef = useRef<number>(0);
  const cooldownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const sensorIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const detectionIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const binCapacityIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Sensor cooldown ref
  const lastStreamStartRef = useRef<number>(0);

  // Detection configuration
  const detectionDisplayTime = 3000;
  const confidenceThreshold = 0.6;
  const DETECTION_COOLDOWN = 10000;
  const SENSOR_COOLDOWN = 60000; // 30 seconds sensor cooldown
  const STREAM_TIMEOUT = 30000; // 30 seconds max stream time
  const DETECTION_INTERVAL = 1000; // Detect every 1 second during stream

  // ==================== BIN CAPACITY FUNCTIONS ====================
  
  const fetchBinCapacity = async () => {
    try {
      const data = await fetchESP32('bins');
      setBinCapacity(data);
      console.log('🗑️ Bin capacity updated:', data);
      
      // Check for full bins and add to history
      if (data.bin1.state === 'Full' && !data.bin1.warningSent) {
        setDetectionHistory(prev => ["🚨 Bin 1 (Recyclable) is FULL! Please empty it.", ...prev.slice(0, 9)]);
      }
      if (data.bin2.state === 'Full' && !data.bin2.warningSent) {
        setDetectionHistory(prev => ["🚨 Bin 2 (Non-Bio) is FULL! Please empty it.", ...prev.slice(0, 9)]);
      }
    } catch (error) {
      console.error('Error fetching bin capacity:', error);
    }
  };

  // ==================== IMPROVED DETECTION FUNCTIONS ====================

  const detectFromCurrentImage = async () => {
    if (!imageRef.current || !imageRef.current.src || isDetecting || !isStreaming) {
      console.log('⏭️ Skipping detection - conditions not met');
      return;
    }

    try {
      setIsDetecting(true);
      lastDetectionTimeRef.current = Date.now();
      
      const currentImage = imageRef.current;
      
      // Enhanced image readiness check with timeout
      if (!currentImage.complete || currentImage.naturalWidth === 0) {
        console.log('⏳ Waiting for image to load...');
        
        const imageLoaded = await new Promise((resolve) => {
          if (currentImage.complete && currentImage.naturalWidth > 0) {
            resolve(true);
            return;
          }
          
          const onLoad = () => {
            currentImage.removeEventListener('load', onLoad);
            currentImage.removeEventListener('error', onError);
            resolve(true);
          };
          
          const onError = () => {
            currentImage.removeEventListener('load', onLoad);
            currentImage.removeEventListener('error', onError);
            resolve(false);
          };
          
          currentImage.addEventListener('load', onLoad);
          currentImage.addEventListener('error', onError);
          
          // Timeout after 3 seconds
          setTimeout(() => {
            currentImage.removeEventListener('load', onLoad);
            currentImage.removeEventListener('error', onError);
            resolve(false);
          }, 3000);
        });
        
        if (!imageLoaded) {
          console.log('❌ Image failed to load within timeout');
          setIsDetecting(false);
          return;
        }
      }

      // Additional validation
      if (currentImage.naturalWidth === 0 || currentImage.naturalHeight === 0) {
        console.log('❌ Image has zero dimensions');
        setIsDetecting(false);
        return;
      }

      console.log('🔍 Starting AI detection on stream frame:', {
        width: currentImage.naturalWidth,
        height: currentImage.naturalHeight,
        complete: currentImage.complete,
        src: currentImage.src.substring(0, 100) + '...'
      });

      // Ensure canvas matches image dimensions
      if (canvasRef.current) {
        canvasRef.current.width = currentImage.naturalWidth;
        canvasRef.current.height = currentImage.naturalHeight;
      }

      // Add a small delay to ensure image is fully rendered
      await new Promise(resolve => setTimeout(resolve, 100));

      const predictions = await roboflowAPI.detectFromImage(currentImage);
      
      if (predictions && predictions.length > 0) {
        const newDetections: DetectionWithTime[] = predictions.map((prediction: any) => {
          const { class: className, confidence, x, y, width, height } = prediction;
          
          let color = '#ffff00';
          let displayName = className;
          let wasteType = "unknown";
          
          if (wasteClassification[className as keyof typeof wasteClassification]) {
            wasteType = wasteClassification[className as keyof typeof wasteClassification];
            if (wasteType === "biodegradable") {
              color = '#00ff00';
              displayName = 'BIO: ' + className;
            } else if (wasteType === "plastic") {
              color = '#ff0000';
              displayName = 'NON-BIO: ' + className;
            } else if (wasteType === "recyclable") {
              color = '#0066ff';
              displayName = 'RECYCLE: ' + className;
            }
          } else {
            if (className.toLowerCase().includes('plastic') || 
                className.toLowerCase().includes('packet') ||
                className.toLowerCase().includes('cigarette')) {
              color = '#ff0000';
              displayName = 'NON-BIO: ' + className;
            } else if (className.toLowerCase().includes('paper') || 
                      className.toLowerCase().includes('cup') ||
                      className.toLowerCase().includes('can') ||
                      className.toLowerCase().includes('lid')) {
              color = '#0066ff';
              displayName = 'RECYCLE: ' + className;
            } else {
              color = '#00ff00';
              displayName = 'BIO: ' + className;
            }
          }
          
          return {
            class: className,
            confidence,
            x, y, width, height,
            timestamp: Date.now(),
            color,
            displayName
          };
        });

        setActiveDetections(prev => {
          const now = Date.now();
          const validPrevious = prev.filter(d => now - d.timestamp < detectionDisplayTime);
          return [...validPrevious, ...newDetections];
        });

        updateWasteStats(predictions);
        detectionCountRef.current++;
        
        // Only send to controller if we have high confidence detections
        const highConfidencePredictions = predictions.filter((p: any) => p.confidence >= confidenceThreshold);
        if (highConfidencePredictions.length > 0) {
          await sendDetectionToController(highConfidencePredictions);
        }
        
        console.log(`✅ Detected ${predictions.length} objects (${highConfidencePredictions.length} high confidence)`);
      } else {
        console.log('ℹ️ No objects detected in current frame');
      }
      
    } catch (error) {
      console.error('🚨 Detection error:', error);
      setDetectionHistory(prev => ["❌ AI Detection failed", ...prev.slice(0, 9)]);
    } finally {
      setIsDetecting(false);
    }
  };

  // Enhanced image error handler with better retry logic
  const handleImageError = useCallback((e: string | Event) => {
    console.error('❌ Stream image failed to load:', e);
    setDetectionHistory(prev => ["🔄 Stream connection failed - retrying...", ...prev.slice(0, 9)]);
    
    // Auto-retry the stream after a short delay
    setTimeout(() => {
      if (isStreaming && cameraIP && imageRef.current) {
        console.log('🔄 Retrying stream connection...');
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        
        // Clear current src first
        imageRef.current.src = '';
        
        // Set new src after a brief delay
        setTimeout(() => {
          if (imageRef.current) {
            imageRef.current.src = `http://${cameraIP}/stream?t=${timestamp}&r=${random}`;
          }
        }, 100);
      }
    }, 3000);
  }, [isStreaming, cameraIP]);

  // Enhanced image load handler
  const handleImageLoad = useCallback(() => {
    frameCountRef.current++;
    const currentImage = imageRef.current;
    
    if (currentImage) {
      console.log('📹 Stream frame loaded successfully', {
        naturalWidth: currentImage.naturalWidth,
        naturalHeight: currentImage.naturalHeight,
        complete: currentImage.complete,
        currentSrc: currentImage.currentSrc?.substring(0, 50) + '...'
      });
      
      // Update canvas dimensions to match the loaded image
      if (canvasRef.current && currentImage.naturalWidth > 0 && currentImage.naturalHeight > 0) {
        canvasRef.current.width = currentImage.naturalWidth;
        canvasRef.current.height = currentImage.naturalHeight;
      }
    }
  }, []);

  // FPS Monitoring
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsed = now - lastFpsUpdateRef.current;
      
      if (elapsed > 1000) {
        const currentFps = Math.round((frameCountRef.current * 1000) / elapsed);
        setFps(currentFps);
        frameCountRef.current = 0;
        detectionCountRef.current = 0;
        lastFpsUpdateRef.current = now;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Cooldown countdown timer
  useEffect(() => {
    if (isInCooldown) {
      cooldownIntervalRef.current = setInterval(() => {
        const remaining = DETECTION_COOLDOWN - (Date.now() - detectionCooldownRef.current);
        setCooldownRemaining(Math.max(0, Math.ceil(remaining / 1000)));
        
        if (remaining <= 0) {
          setIsInCooldown(false);
          setCooldownRemaining(0);
          if (cooldownIntervalRef.current) {
            clearInterval(cooldownIntervalRef.current);
          }
        }
      }, 1000);
    } else {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
      }
      setCooldownRemaining(0);
    }

    return () => {
      if (cooldownIntervalRef.current) {
        clearInterval(cooldownIntervalRef.current);
      }
    };
  }, [isInCooldown]);

  // Stream duration monitoring
  useEffect(() => {
    if (streamActive && streamStartTime > 0) {
      const interval = setInterval(() => {
        const duration = Math.floor((Date.now() - streamStartTime) / 1000);
        setStreamDuration(duration);
        
        // Auto-stop stream after timeout
        if (duration >= STREAM_TIMEOUT / 1000) {
          stopStream();
          setDetectionHistory(prev => ["⏰ Stream timeout - Auto stopped", ...prev.slice(0, 9)]);
        }
      }, 1000);
      
      return () => clearInterval(interval);
    } else {
      setStreamDuration(0);
    }
  }, [streamActive, streamStartTime]);

  // Bin Capacity Monitoring
  useEffect(() => {
    if (sensorMonitoring) {
      binCapacityIntervalRef.current = setInterval(() => {
        fetchBinCapacity();
      }, 2000); // Update every 2 seconds
      
      // Initial fetch
      fetchBinCapacity();
    }
    
    return () => {
      if (binCapacityIntervalRef.current) {
        clearInterval(binCapacityIntervalRef.current);
        binCapacityIntervalRef.current = null;
      }
    };
  }, [sensorMonitoring]);

  // SIMPLIFIED Ultrasonic Sensor Monitoring - Object detection starts stream with 30s cooldown
  useEffect(() => {
    if (!sensorMonitoring) return;

    console.log('🔍 Starting simplified ultrasonic monitoring...');

    const monitorSensor = async () => {
      try {
        const data = await fetchESP32('sensor');
        setUltrasonicData(data);
        
        // Also fetch bin capacity data
        await fetchBinCapacity();
        
        const now = Date.now();
        const timeSinceLastStream = now - lastStreamStartRef.current;
        const canStartStream = timeSinceLastStream > SENSOR_COOLDOWN;

        console.log('📊 Sensor Data:', {
          objectDetected: data.objectDetected,
          distance: data.distance,
          isStreaming,
          canStartStream,
          timeSinceLastStream: Math.round(timeSinceLastStream/1000) + 's',
          cooldownRemaining: Math.max(0, Math.round((SENSOR_COOLDOWN - timeSinceLastStream)/1000)) + 's'
        });

        // SIMPLE LOGIC: If object detected and not streaming and cooldown passed, start stream
        if (data.objectDetected && !isStreaming && canStartStream) {
          console.log('🎯 Object detected - Starting stream with 30s cooldown');
          setDetectionHistory(prev => ["📹 Object detected - Starting stream", ...prev.slice(0, 9)]);
          lastStreamStartRef.current = now;
          startStream();
        }
        
        // If no object detected and streaming for more than 5 seconds, consider stopping
        if (!data.objectDetected && isStreaming && !streamTimeoutRef.current) {
          console.log('💤 Object disappeared - Will stop stream soon');
          streamTimeoutRef.current = setTimeout(() => {
            // Only stop if still no object and not detecting
            if (!isDetecting) {
              console.log('⏹️ Object gone - Stopping stream');
              stopStream();
            }
            streamTimeoutRef.current = null;
          }, 5000);
        }
        
        // Cancel stop timeout if object reappears
        if (data.objectDetected && streamTimeoutRef.current) {
          console.log('🔁 Object returned - Cancelling stream stop');
          clearTimeout(streamTimeoutRef.current);
          streamTimeoutRef.current = null;
        }

      } catch (error) {
        console.error('Error reading ultrasonic sensor:', error);
      }
    };

    sensorIntervalRef.current = setInterval(monitorSensor, 1000);
    monitorSensor();

    return () => {
      if (sensorIntervalRef.current) {
        clearInterval(sensorIntervalRef.current);
      }
      if (streamTimeoutRef.current) {
        clearTimeout(streamTimeoutRef.current);
        streamTimeoutRef.current = null;
      }
    };
  }, [sensorMonitoring, isStreaming, isDetecting]);

  // Improved detection interval management
  useEffect(() => {
    if (isStreaming && detectionEnabled && !isInCooldown) {
      console.log('🔄 Starting detection interval');
      
      detectionIntervalRef.current = setInterval(() => {
        // Check if we should run detection
        const shouldDetect = 
          imageRef.current && 
          imageRef.current.src && 
          !isDetecting &&
          imageRef.current.complete &&
          imageRef.current.naturalWidth > 0;
        
        if (shouldDetect) {
          detectFromCurrentImage();
        } else {
          console.log('⏭️ Skipping detection - image not ready');
        }
      }, DETECTION_INTERVAL);
    } else {
      if (detectionIntervalRef.current) {
        console.log('🛑 Stopping detection interval');
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
    }

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
      }
    };
  }, [isStreaming, detectionEnabled, isInCooldown, isDetecting]);

  // Initialize Roboflow API
  useEffect(() => {
    const initRoboflow = async () => {
      if (roboflowAPI.isConfigured()) {
        setApiStatus("🚀 Initializing Roboflow API...");
        try {
          const success = await roboflowAPI.initialize();
          if (success) {
            setApiStatus("✅ Roboflow API Ready");
          } else {
            setApiStatus("❌ Failed to initialize Roboflow API");
          }
        } catch (error) {
          setApiStatus("❌ Roboflow API Initialization Error");
        }
      } else {
        setApiStatus("❌ Roboflow not configured");
      }
    };

    initRoboflow();
  }, []);

  // Controller status check
  useEffect(() => {
    const checkControllerStatus = async () => {
      try {
        await fetchESP32('status');
        setControllerStatus("✅ Controller Online");
        setLastCommandSuccess(true);
      } catch (error) {
        setControllerStatus("❌ Controller Unreachable");
        setLastCommandSuccess(false);
      }
    };

    const interval = setInterval(checkControllerStatus, 10000);
    checkControllerStatus();

    return () => clearInterval(interval);
  }, []);

  // Initialize
  useEffect(() => {
    const savedCameraIP = localStorage.getItem("cameraIP") || "";
    const savedControllerIP = localStorage.getItem("controllerIP") || "";
    
    setCameraIP(savedCameraIP);
    setControllerIP(savedControllerIP);
    
    setIsLoading(false);

    return () => {
      stopStream();
    };
  }, []);

  // Continuous canvas rendering for persistent detections
  useEffect(() => {
    if (!canvasRef.current) return;

    const renderCanvas = () => {
      if (!canvasRef.current || !imageRef.current) {
        animationFrameRef.current = requestAnimationFrame(renderCanvas);
        return;
      }

      drawAllDetections();
      animationFrameRef.current = requestAnimationFrame(renderCanvas);
    };

    renderCanvas();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [activeDetections]);

  // Clean up old detections periodically
  useEffect(() => {
    const cleanupInterval = setInterval(() => {
      const now = Date.now();
      const validDetections = activeDetections.filter(
        detection => now - detection.timestamp < detectionDisplayTime
      );
      
      if (validDetections.length !== activeDetections.length) {
        setActiveDetections(validDetections);
      }
    }, 1000);

    return () => clearInterval(cleanupInterval);
  }, [activeDetections]);

  // ==================== STREAM CONTROL FUNCTIONS ====================

  const startStream = () => {
    if (!cameraIP) {
      alert('❌ Camera IP not set');
      return;
    }

    console.log('🎬 Starting video stream...');
    
    // Ensure we're not already streaming
    if (isStreaming) {
      console.log('⚠️ Stream already active, ignoring start request');
      return;
    }
    
    // Clean up any existing stream first
    if (imageRef.current) {
      imageRef.current.onload = null;
      imageRef.current.onerror = null;
      imageRef.current.src = '';
    }
    
    // Set states immediately
    setIsStreaming(true);
    setStreamActive(true);
    setStreamStartTime(Date.now());
    setDetectionHistory(prev => ["📹 Video stream starting...", ...prev.slice(0, 9)]);
    
    // Small delay to ensure cleanup, then start fresh
    setTimeout(() => {
      // Start the stream
      if (imageRef.current) {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        const streamUrl = `http://${cameraIP}/stream?t=${timestamp}&r=${random}`;
        
        console.log('📹 Setting stream URL:', streamUrl);
        
        // Attach event handlers
        imageRef.current.onload = handleImageLoad;
        imageRef.current.onerror = handleImageError;
        
        // Set the source - this should trigger the stream
        imageRef.current.src = streamUrl;
        
        console.log('✅ Stream URL set, waiting for connection...');
      }
    }, 100);
  };

  const stopStream = () => {
    console.log('⏹️ Stopping video stream');
    
    // Clear any pending timeouts
    if (streamTimeoutRef.current) {
      clearTimeout(streamTimeoutRef.current);
      streamTimeoutRef.current = null;
    }
    
    if (detectionIntervalRef.current) {
      clearInterval(detectionIntervalRef.current);
      detectionIntervalRef.current = null;
    }
    
    setIsStreaming(false);
    setStreamActive(false);
    setStreamStartTime(0);
    setDetectionHistory(prev => ["⏹️ Video stream stopped", ...prev.slice(0, 9)]);
    setIsDetecting(false);
    
    // Properly clear the image source and force cache clear
    if (imageRef.current) {
      // Remove event listeners to prevent errors
      imageRef.current.onload = null;
      imageRef.current.onerror = null;
      
      // Set to a blank image first to break the stream connection
      imageRef.current.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
      
      // Use setTimeout to clear after a moment (non-blocking)
      setTimeout(() => {
        if (imageRef.current) {
          imageRef.current.src = '';
          imageRef.current.removeAttribute('src');
        }
      }, 100);
    }
    
    // Clear canvas
    if (canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      }
    }
    
    // Clear active detections
    setActiveDetections([]);
    
    console.log('🧹 Stream cache cleared');
  };

  // Draw all active detections on canvas
  const drawAllDetections = () => {
    if (!canvasRef.current || !imageRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.lineWidth = 3;
    ctx.font = 'bold 14px Arial';
    ctx.textBaseline = 'top';

    activeDetections.forEach((detection) => {
      const { color, displayName, confidence, x, y, width, height, timestamp } = detection;
      
      const timeSinceDetection = Date.now() - timestamp;
      const timeLeft = detectionDisplayTime - timeSinceDetection;
      const opacity = Math.min(1, timeLeft / 1000);
      
      ctx.strokeStyle = color;
      ctx.globalAlpha = opacity;
      ctx.strokeRect(x, y, width, height);
      
      const text = `${displayName} ${(confidence * 100).toFixed(0)}%`;
      const textWidth = ctx.measureText(text).width;
      
      ctx.fillStyle = color;
      ctx.fillRect(x, y - 20, textWidth + 8, 20);
      
      ctx.fillStyle = '#ffffff';
      ctx.fillText(text, x + 4, y - 16);
      
      ctx.globalAlpha = 1.0;
    });
  };

  const updateWasteStats = (predictions: any[]) => {
    const newStats = { biodegradable: 0, nonBiodegradable: 0, recyclable: 0 };
    const newHistory: string[] = [];
    
    predictions.forEach((prediction: any) => {
      const className = prediction.class;
      const confidence = (prediction.confidence * 100).toFixed(0);
      
      let wasteType = "biodegradable";
      
      if (wasteClassification[className as keyof typeof wasteClassification]) {
        wasteType = wasteClassification[className as keyof typeof wasteClassification];
      } else {
        if (className.toLowerCase().includes('plastic') || 
            className.toLowerCase().includes('packet') ||
            className.toLowerCase().includes('cigarette')) {
          wasteType = "plastic";
        } else if (className.toLowerCase().includes('paper') || 
                  className.toLowerCase().includes('cup') ||
                  className.toLowerCase().includes('can') ||
                  className.toLowerCase().includes('lid')) {
          wasteType = "recyclable";
        }
      }
      
      if (wasteType === "biodegradable") {
        newStats.biodegradable++;
      } else if (wasteType === "plastic") {
        newStats.nonBiodegradable++;
      } else if (wasteType === "recyclable") {
        newStats.recyclable++;
      }
      
      newHistory.push(`${className} → ${wasteType.toUpperCase()} (${confidence}%)`);
    });

    setWasteStats(prev => ({
      biodegradable: prev.biodegradable + newStats.biodegradable,
      nonBiodegradable: prev.nonBiodegradable + newStats.nonBiodegradable,
      recyclable: prev.recyclable + newStats.recyclable
    }));
    
    if (newHistory.length > 0) {
      setDetectionHistory(prev => [
        ...newHistory.slice(0, 3),
        ...prev.slice(0, 7)
      ]);
    }
  };

  // Send detection result to ESP32 controller
  const sendDetectionToController = async (predictions: any[]) => {
    if (predictions.length === 0 || isInCooldown) return;

    try {
      const now = Date.now();
      
      if (now - detectionCooldownRef.current < DETECTION_COOLDOWN) {
        console.log(`⏳ In cooldown, skipping detection. ${DETECTION_COOLDOWN - (now - detectionCooldownRef.current)}ms remaining`);
        return;
      }

      const topDetection = predictions.reduce((prev, current) => 
        (prev.confidence > current.confidence) ? prev : current
      );

      const className = topDetection.class;
      const confidence = topDetection.confidence;
      
      console.log(`🎯 Detected: ${className} (${(confidence * 100).toFixed(1)}%)`);

      let command: WasteType = "biodegradable";

      const normalizedClassName = className.trim();
      const classificationKey = Object.keys(wasteClassification).find(
        key => key.toLowerCase() === normalizedClassName.toLowerCase()
      );

      if (classificationKey) {
        command = wasteClassification[classificationKey as keyof typeof wasteClassification];
        console.log(`🏷️ Classification: ${command.toUpperCase()} | Object: ${className}`);
      } else {
        if (className.toLowerCase().includes('plastic') || 
            className.toLowerCase().includes('packet') ||
            className.toLowerCase().includes('cigarette')) {
          command = "plastic";
        } else if (className.toLowerCase().includes('paper') || 
                  className.toLowerCase().includes('cup') ||
                  className.toLowerCase().includes('can') ||
                  className.toLowerCase().includes('lid')) {
          command = "recyclable";
        }
        console.log(`🔍 Auto-classified as: ${command.toUpperCase()} | Object: ${className}`);
      }

      if (confidence >= confidenceThreshold) {
        detectionCooldownRef.current = now;
        setIsInCooldown(true);
        setCooldownRemaining(Math.ceil(DETECTION_COOLDOWN / 1000));
        
        await manualControl(command);
        
        const historyMessage = `${className} → ${command.toUpperCase()} (${(confidence * 100).toFixed(0)}%)`;
        setDetectionHistory(prev => [historyMessage, ...prev.slice(0, 9)]);
        
        console.log(`⏳ Cooldown started: ${DETECTION_COOLDOWN}ms`);
        
        // Stop stream after successful detection to process waste
        setTimeout(() => {
          stopStream();
          setDetectionHistory(prev => ["⏹️ Stream stopped - Processing waste", ...prev.slice(0, 9)]);
        }, 2000);
        
      } else {
        console.log(`⚠️ Low confidence (${(confidence * 100).toFixed(1)}%), skipping command`);
        const historyMessage = `${className} → ${command.toUpperCase()} (${(confidence * 100).toFixed(0)}% - LOW CONFIDENCE)`;
        setDetectionHistory(prev => [historyMessage, ...prev.slice(0, 9)]);
      }

    } catch (error) {
      console.error('❌ Error sending detection to controller:', error);
      setIsInCooldown(false);
      setCooldownRemaining(0);
    }
  };

  // Clear all bounding boxes manually
  const clearDetections = () => {
    setActiveDetections([]);
  };

  // Ultrasonic Sensor Functions
  const startSensorMonitoring = () => {
    setSensorMonitoring(true);
    setDetectionHistory(prev => ["📏 Ultrasonic monitoring started", ...prev.slice(0, 9)]);
  };

  const stopSensorMonitoring = () => {
    setSensorMonitoring(false);
    setDetectionHistory(prev => ["📏 Ultrasonic monitoring stopped", ...prev.slice(0, 9)]);
    stopStream();
  };

  const updateSensorData = async () => {
    try {
      const data = await fetchESP32('sensor');
      setUltrasonicData(data);
      setDetectionHistory(prev => ["📏 Sensor data updated", ...prev.slice(0, 9)]);
    } catch (error) {
      console.error('Error reading ultrasonic sensor:', error);
    }
  };

  const forceDetection = async () => {
    try {
      await fetchESP32('control', {
        method: 'POST',
        body: JSON.stringify({ command: 'force_detection' })
      });
      setDetectionHistory(prev => ["🔧 Force started detection window", ...prev.slice(0, 9)]);
      alert('✅ Force started detection window');
    } catch (error) {
      console.error('Error forcing detection:', error);
      alert('❌ Failed to force detection');
    }
  };

  const resetDetection = async () => {
    try {
      await fetchESP32('control', {
        method: 'POST',
        body: JSON.stringify({ command: 'reset_detection' })
      });
      setDetectionHistory(prev => ["🔄 Detection state reset", ...prev.slice(0, 9)]);
      alert('✅ Detection state reset');
    } catch (error) {
      console.error('Error resetting detection:', error);
      alert('❌ Failed to reset detection');
    }
  };

  const manualControl = async (command: string) => {
    try {
      await fetchESP32('control', {
        method: 'POST',
        body: JSON.stringify({ command })
      });
      setLastCommandSuccess(true);
      setControllerStatus("✅ Controller Online");
      alert(`✅ Command sent: ${command}`);
    } catch (error) {
      console.error('Command error:', error);
      setLastCommandSuccess(false);
      setControllerStatus("❌ Controller Unreachable");
      
      // Get the controller IP for error message
      const controllerIP = localStorage.getItem('controllerIP') || '192.168.1.101';
      alert(`❌ Cannot reach controller at ${controllerIP}`);
    }
  };

  const testCameraConnection = async () => {
    if (!cameraIP) {
      alert('Please enter Camera IP first');
      return;
    }
    
    try {
      setIsLoading(true);
      
      // Test stream connection
      const testResponse = await fetch(`http://${cameraIP}/status`, {
        mode: 'no-cors'
      });
      
      alert(`✅ Camera is reachable!\nIP: ${cameraIP}`);
      
    } catch (error) {
      console.log('Camera test failed:', error);
      alert(`❌ Cannot reach camera at ${cameraIP}\n\nCheck:\n• Camera IP address\n• Network connectivity\n• ESP32-CAM is running`);
    } finally {
      setIsLoading(false);
    }
  };

  const testControllerConnection = async () => {
    const controllerIP = localStorage.getItem('controllerIP');
    
    if (!controllerIP) {
      alert('Please enter Controller IP first');
      return;
    }
    
    try {
      // Try direct connection first
      const response = await fetch(`http://${controllerIP}/status`);
      
      if (response.ok) {
        alert(`✅ Controller is reachable at ${controllerIP}`);
        setControllerStatus("✅ Controller Online");
        setLastCommandSuccess(true);
      } else {
        throw new Error('Controller not reachable');
      }
    } catch (error) {
      alert(`❌ Cannot reach controller at ${controllerIP}`);
      setControllerStatus("❌ Controller Unreachable");
      setLastCommandSuccess(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  const handleCameraIPChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newIP = e.target.value;
    setCameraIP(newIP);
    localStorage.setItem("cameraIP", newIP);
  };

  const handleControllerIPChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newIP = e.target.value;
    setControllerIP(newIP);
    localStorage.setItem("controllerIP", newIP);
  };

  // Fetch user role
  useEffect(() => {
    const fetchUserRole = async () => {
      if (!user?.email) return;

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

  return (
    <ProtectedRoute>
      <div className="bg-white min-h-screen flex flex-col">
        {/* Navbar */}
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
              <li className="flex items-center space-x-2 cursor-pointer select-none text-[#3bff00]">
                <span>Home</span>
              </li>
              
              <li
                className="flex items-center space-x-2 cursor-pointer select-none hover:text-[#3bff00]"
                onClick={() => router.push("/fine-tune")}
              >
                <span>Fine Tune</span>
              </li>

              <li 
                className="flex items-center space-x-2 cursor-pointer select-none hover:text-[#3bff00]"
                onClick={() => router.push("/wifi-config")}
              >
                <span>WiFi Config</span>
              </li>

              {userRole === 'admin' && (
                <li 
                  className="flex items-center space-x-2 cursor-pointer select-none hover:text-[#3bff00]"
                  onClick={() => router.push("/accounts")}
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

        {/* Status Indicators */}
        <div className="bg-blue-50 border-b border-blue-100">
          <div className="px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex flex-wrap justify-center gap-3">
              <div className={`px-4 py-2 rounded-full text-sm font-medium ${
                roboflowAPI.isConfigured() ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'
              }`}>
                🤖 AI: {roboflowAPI.isConfigured() ? 'Ready' : 'Offline'}
              </div>
              <div className={`px-4 py-2 rounded-full text-sm font-medium ${
                isStreaming ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'
              }`}>
                📹 Stream: {isStreaming ? `ON (${streamDuration}s)` : 'OFF'}
              </div>
              <div className={`px-4 py-2 rounded-full text-sm font-medium ${
                detectionEnabled ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-gray-100 text-gray-800 border border-gray-200'
              }`}>
                🎯 Detection: {detectionEnabled ? `${fps} FPS` : 'Paused'}
              </div>
              <div className={`px-4 py-2 rounded-full text-sm font-medium ${
                isInCooldown ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' : 
                controllerStatus.includes('✅') || lastCommandSuccess === true ? 'bg-green-100 text-green-800 border border-green-200' : 'bg-red-100 text-red-800 border border-red-200'
              }`}>
                {isInCooldown ? `⏳ Cooldown: ${cooldownRemaining}s` : controllerStatus}
              </div>
              <div className={`px-4 py-2 rounded-full text-sm font-medium ${
                sensorMonitoring ? 'bg-teal-100 text-teal-800 border border-teal-200' : 'bg-gray-100 text-gray-800 border border-gray-200'
              }`}>
                📏 Sensor: {sensorMonitoring ? 'Monitoring' : 'Off'}
              </div>
              {/* Bin Status Indicator */}
              <div className="px-4 py-2 rounded-full text-sm font-medium bg-gray-100 text-gray-800 border border-gray-200">
                🗑️ Bins: 
                <span className={`ml-1 ${binCapacity.bin1.state === 'Full' ? 'text-red-600' : binCapacity.bin1.state === 'Nearly Full' ? 'text-yellow-600' : 'text-green-600'}`}>
                  B1:{binCapacity.bin1.fillPercentage}%
                </span>
                <span className="mx-1">/</span>
                <span className={`ml-1 ${binCapacity.bin2.state === 'Full' ? 'text-red-600' : binCapacity.bin2.state === 'Nearly Full' ? 'text-yellow-600' : 'text-green-600'}`}>
                  B2:{binCapacity.bin2.fillPercentage}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Main content */}
        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-8">
          <div className="max-w-7xl mx-auto">
            {/* Header Section */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                BioSort Control Panel
              </h1>
              <p className="text-gray-600 text-lg">
                Intelligent waste management system with real-time AI detection
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column - Video Stream */}
              <div className="lg:col-span-2 space-y-6">
                {/* Video Stream Section */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Live Video Stream</h2>
                  
                  <div className="relative rounded-lg overflow-hidden w-full aspect-[4/3] bg-gray-100">
                    {isLoading && (
                      <div className="w-full h-full flex items-center justify-center text-gray-600">
                        <div className="text-center">
                          <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-blue-600"></div>
                          <p className="mt-2">Testing camera connection...</p>
                        </div>
                      </div>
                    )}
                    
                    {!sensorMonitoring ? (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 p-6 text-center">
                        <div className="text-5xl mb-4">📹</div>
                        <p className="text-lg font-semibold mb-2">Simple Object Detection Mode</p>
                        <p className="text-gray-500 mb-6">Stream starts when object detected, 30s cooldown between detections</p>
                        <div className="space-y-3">
                          <button 
                            onClick={startSensorMonitoring}
                            className="px-6 py-3 bg-[#0a6b9a] text-white rounded-lg font-medium hover:bg-[#0a5a8a] transition-colors duration-200"
                          >
                            Start Sensor Monitoring
                          </button>
                          
                          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-gray-600">Detection Mode:</span>
                              <span className="text-sm font-semibold text-orange-600">
                                Simple + 30s Cooldown
                              </span>
                            </div>
                            <p className="text-xs text-gray-500">
                              Object → Start Stream → Detect → Process → 30s Cooldown
                            </p>
                          </div>
                        </div>
                      </div>
                    ) : !isStreaming ? (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 p-6 text-center">
                        <div className="text-5xl mb-4">📏</div>
                        <p className="text-lg font-semibold mb-2">Monitoring for Objects</p>
                        <p className="text-gray-500 mb-4">Place object near sensor to start detection</p>
                        <div className="mb-4">
                          <div className="inline-block animate-pulse bg-yellow-100 text-yellow-800 px-4 py-2 rounded-full text-sm border border-yellow-200">
                            📏 Scanning: {ultrasonicData.distance > 0 ? ultrasonicData.distance.toFixed(1) + 'cm' : '--'}
                          </div>
                        </div>
                        <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
                          <p className="text-xs text-yellow-700">Next detection available in 30s after processing</p>
                        </div>
                      </div>
                    ) : (
                      <div className="relative w-full h-full">
                        <img
                          ref={imageRef}
                          src={`http://${cameraIP}/stream?t=${Date.now()}`}
                          className="w-full h-full object-contain"
                          onLoad={handleImageLoad}
                          onError={handleImageError}
                          alt="ESP32-CAM Live Stream"
                          crossOrigin="anonymous"
                        />
                        <canvas
                          ref={canvasRef}
                          className="absolute top-0 left-0 w-full h-full pointer-events-none"
                          style={{ zIndex: 10 }}
                        />
                        
                        {/* Connection status indicator */}
                        <div className="absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-semibold bg-red-500 text-white">
                          🔴 LIVE
                        </div>
                      </div>
                    )}
                    
                    {/* Status Overlay */}
                    {isStreaming && (
                      <div className="absolute top-4 left-4 bg-black bg-opacity-80 rounded-lg px-4 py-3 text-white text-sm space-y-1">
                        <div>📹 Mode: {isStreaming ? 'LIVE STREAM' : 'OFF'}</div>
                        <div>🤖 AI: {detectionEnabled ? `${fps} FPS` : 'PAUSED'}</div>
                        <div>🎯 Active: {activeDetections.length} boxes</div>
                        <div>📏 Distance: {ultrasonicData.distance > 0 ? ultrasonicData.distance.toFixed(1) + 'cm' : '--'}</div>
                        <div>🎯 Object: {ultrasonicData.objectDetected ? 'DETECTED' : 'NONE'}</div>
                        <div>⏰ Stream Time: {streamDuration}s / {STREAM_TIMEOUT/1000}s</div>
                        {isInCooldown && (
                          <div className="text-yellow-300 font-semibold">
                            ⏳ Cooldown: {cooldownRemaining}s
                          </div>
                        )}
                      </div>
                    )}

                    {/* Classification Legend */}
                    <div className="absolute bottom-4 left-4 bg-black bg-opacity-80 rounded-lg px-4 py-3 text-white text-sm space-y-1">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-green-500 rounded"></div>
                        <span>🟢 BIO</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-red-500 rounded"></div>
                        <span>🔴 NON-BIO</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 bg-blue-500 rounded"></div>
                        <span>🔵 RECYCLABLE</span>
                      </div>
                    </div>

                    {/* Stream Indicator */}
                    {isStreaming && (
                      <div className="absolute bottom-4 right-4 bg-red-500 rounded-full px-3 py-2 flex items-center space-x-2">
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                        <span className="text-white text-sm font-semibold">LIVE</span>
                      </div>
                    )}
                  </div>
                  
                  <p className="mt-4 text-center text-gray-700 font-medium">
                    SIMPLE DETECTION: Object → Stream → Detect → 30s Cooldown
                  </p>
                  
                  {/* IP Configuration */}
                  <div className="mt-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <h3 className="text-gray-900 font-semibold mb-3">🔧 Device Configuration</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="text-gray-700 text-sm font-medium block mb-2">ESP32-CAM IP:</label>
                        <input
                          type="text"
                          value={cameraIP}
                          onChange={handleCameraIPChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                          placeholder="192.168.1.100"
                        />
                      </div>
                      <div>
                        <label className="text-gray-700 text-sm font-medium block mb-2">Controller IP:</label>
                        <input
                          type="text"
                          value={controllerIP}
                          onChange={handleControllerIPChange}
                          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                          placeholder="192.168.1.101"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button 
                        onClick={testCameraConnection}
                        className="px-4 py-2 bg-[#0a6b9a] text-white rounded-lg font-medium hover:bg-[#0a5a8a] transition-colors duration-200"
                      >
                        Test Camera
                      </button>
                      <button 
                        onClick={testControllerConnection}
                        className="px-4 py-2 bg-[#0a6b9a] text-white rounded-lg font-medium hover:bg-[#0a5a8a] transition-colors duration-200"
                      >
                        Test Controller
                      </button>
                      <button 
                        onClick={startSensorMonitoring}
                        disabled={sensorMonitoring}
                        className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:bg-gray-400 transition-colors duration-200"
                      >
                        Start Monitoring
                      </button>
                      <button 
                        onClick={stopSensorMonitoring}
                        disabled={!sensorMonitoring}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:bg-gray-400 transition-colors duration-200"
                      >
                        Stop Monitoring
                      </button>
                      <button 
                        onClick={startStream}
                        disabled={isStreaming || !sensorMonitoring}
                        className="px-4 py-2 bg-[#0a6b9a] text-white rounded-lg font-medium hover:bg-[#0a5a8a] disabled:bg-gray-400 transition-colors duration-200"
                      >
                        Start Stream
                      </button>
                      <button 
                        onClick={stopStream}
                        disabled={!isStreaming}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:bg-gray-400 transition-colors duration-200"
                      >
                        Stop Stream
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column - Controls and Statistics */}
              <div className="space-y-6">
                {/* Waste Statistics */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Waste Statistics</h2>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-green-50 rounded-lg p-4 text-center border-2 border-green-200">
                      <div className="text-2xl font-bold text-green-700">{wasteStats.biodegradable}</div>
                      <div className="text-sm text-green-800 font-semibold">🟢 Bio</div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4 text-center border-2 border-red-200">
                      <div className="text-2xl font-bold text-red-700">{wasteStats.nonBiodegradable}</div>
                      <div className="text-sm text-red-800 font-semibold">🔴 Non-Bio</div>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-4 text-center border-2 border-blue-200">
                      <div className="text-2xl font-bold text-blue-700">{wasteStats.recyclable}</div>
                      <div className="text-sm text-blue-800 font-semibold">🔵 Recyclable</div>
                    </div>
                  </div>
                </div>

                {/* Bin Capacity Indicators */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">🗑️ Bin Capacity</h2>
                  
                  <div className="space-y-4">
                    <BinCapacityIndicator 
                      binNumber={1}
                      bin={binCapacity.bin1}
                      thresholds={binCapacity.thresholds}
                      label="Recyclable"
                    />
                    
                    <BinCapacityIndicator 
                      binNumber={2}
                      bin={binCapacity.bin2}
                      thresholds={binCapacity.thresholds}
                      label="Non-Biodegradable"
                    />
                    
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex justify-between items-center">
                        <div className="text-sm text-gray-600">
                          <span className="inline-block w-3 h-3 bg-green-600 rounded mr-1"></span>
                          Normal
                          <span className="inline-block w-3 h-3 bg-yellow-500 rounded mx-2 ml-4"></span>
                          Nearly Full
                          <span className="inline-block w-3 h-3 bg-red-600 rounded mx-2 ml-4"></span>
                          Full
                        </div>
                        <button 
                          onClick={fetchBinCapacity}
                          className="px-3 py-1 bg-[#0a6b9a] text-white rounded text-sm hover:bg-[#0a5a8a] transition-colors"
                        >
                          Refresh
                        </button>
                      </div>
                      
                      {/* Threshold explanation */}
                      <div className="mt-3 text-xs text-gray-500 bg-gray-50 p-2 rounded">
                        <div>Thresholds: 
                          <span className="ml-2">Empty: &gt;{binCapacity.thresholds.empty}cm</span>
                          <span className="mx-2">•</span>
                          <span>Nearly Full: ≤{binCapacity.thresholds.nearlyFull}cm</span>
                          <span className="mx-2">•</span>
                          <span>Full: ≤{binCapacity.thresholds.full}cm</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stream Status */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">📹 Stream Status</h2>
                  
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-700 font-medium">Stream Status:</span>
                      <span className={isStreaming ? "text-green-600 font-bold" : "text-red-600 font-bold"}>
                        {isStreaming ? "🟢 LIVE STREAMING" : "🔴 STREAM OFF"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-700 font-medium">Stream Duration:</span>
                      <span className="text-gray-900">{streamDuration} seconds</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-700 font-medium">Frame Rate:</span>
                      <span className="text-gray-900">{fps} FPS</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-700 font-medium">Auto-Stream:</span>
                      <span className={sensorMonitoring ? "text-green-600 font-bold" : "text-red-600"}>
                        {sensorMonitoring ? "🟢 ACTIVE" : "🔴 INACTIVE"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                      <span className="text-gray-700 font-medium">Detection Active:</span>
                      <span className={detectionEnabled ? "text-green-600 font-bold" : "text-red-600"}>
                        {detectionEnabled ? "🟢 RUNNING" : "🔴 PAUSED"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-gray-700 font-medium">Cooldown:</span>
                      <span className={isInCooldown ? "text-yellow-600 font-bold" : "text-green-600 font-bold"}>
                        {isInCooldown ? `${cooldownRemaining}s remaining` : "🟢 READY"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Detection Log */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Detection Log</h2>
                  <div className="h-48 overflow-y-auto bg-gray-50 rounded-lg p-4 border border-gray-200">
                    {detectionHistory.length > 0 ? (
                      detectionHistory.map((message, index) => {
                        let bgColor = 'bg-green-50';
                        let borderColor = 'border-green-200';
                        let icon = '🟢';
                        
                        if (message.includes('→ PLASTIC') || message.includes('→ NON-BIO')) {
                          bgColor = 'bg-red-50';
                          borderColor = 'border-red-200';
                          icon = '🔴';
                        } else if (message.includes('→ RECYCLABLE')) {
                          bgColor = 'bg-blue-50';
                          borderColor = 'border-blue-200';
                          icon = '🔵';
                        } else if (message.includes('AI Detection')) {
                          bgColor = 'bg-purple-50';
                          borderColor = 'border-purple-200';
                          icon = '🤖';
                        } else if (message.includes('Ultrasonic') || message.includes('Sensor')) {
                          bgColor = 'bg-teal-50';
                          borderColor = 'border-teal-200';
                          icon = '📏';
                        } else if (message.includes('Stream')) {
                          bgColor = 'bg-indigo-50';
                          borderColor = 'border-indigo-200';
                          icon = '📹';
                        } else if (message.includes('COOLDOWN')) {
                          bgColor = 'bg-yellow-50';
                          borderColor = 'border-yellow-200';
                          icon = '⏳';
                        } else if (message.includes('❌') || message.includes('FAILED')) {
                          bgColor = 'bg-red-50';
                          borderColor = 'border-red-200';
                          icon = '❌';
                        } else if (message.includes('🔄')) {
                          bgColor = 'bg-blue-50';
                          borderColor = 'border-blue-200';
                          icon = '🔄';
                        } else if (message.includes('🚨') || message.includes('FULL')) {
                          bgColor = 'bg-red-100';
                          borderColor = 'border-red-300';
                          icon = '🚨';
                        }
                        
                        return (
                          <div key={index} className={`text-sm text-gray-800 mb-2 p-2 ${bgColor} border ${borderColor} rounded-lg`}>
                            <span className="mr-2">{icon}</span> {message}
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-sm text-gray-500 text-center py-8">
                        {sensorMonitoring ? 
                          "📏 Monitoring for objects..." : 
                          "⏸️ System paused - Start monitoring to begin"
                        }
                      </div>
                    )}
                  </div>
                </div>

                {/* Manual Controller Controls */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Manual Controller</h2>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <button 
                      onClick={() => manualControl('biodegradable')}
                      className="px-3 py-2 bg-[#0a6b9a] text-white rounded-lg font-medium hover:bg-[#0a5a8a] transition-colors duration-200"
                    >
                      🟢 Bio
                    </button>
                    <button 
                      onClick={() => manualControl('plastic')}
                      className="px-3 py-2 bg-[#0a6b9a] text-white rounded-lg font-medium hover:bg-[#0a5a8a] transition-colors duration-200"
                    >
                      🔴 Plastic
                    </button>
                    <button 
                      onClick={() => manualControl('stop')}
                      className="px-3 py-2 bg-[#0a6b9a] text-white rounded-lg font-medium hover:bg-[#0a5a8a] transition-colors duration-200"
                    >
                      ⏹️ Stop
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    <button 
                      onClick={() => manualControl('recyclable')}
                      className="px-3 py-2 bg-[#0a6b9a] text-white rounded-lg font-medium hover:bg-[#0a5a8a] transition-colors duration-200"
                    >
                      🔵 Recyclable
                    </button>
                  </div>
                </div>

                {/* System Info */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-2">🎯 Simple Detection Flow</h2>
                  <ul className="text-sm text-gray-600 space-y-2">
                    <li>1. <strong>Object Detected:</strong> Ultrasonic sensor detects object</li>
                    <li>2. <strong>Start Stream:</strong> Camera stream starts automatically</li>
                    <li>3. <strong>AI Detection:</strong> Roboflow analyzes the stream</li>
                    <li>4. <strong>Process Waste:</strong> Controller sorts the waste</li>
                    <li>5. <strong>30s Cooldown:</strong> System waits before next detection</li>
                    <li>6. <strong>Repeat:</strong> Ready for next object</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
};

export default HomePage;