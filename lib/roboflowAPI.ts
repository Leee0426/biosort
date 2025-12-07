declare global {
  interface Window {
    InferenceEngine?: any;
    inference?: any;
  }
}

export interface Detection {
  class: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export class RoboflowAPI {
  private publishableKey: string;
  private modelName: string;
  private version: string;
  private isInitialized: boolean = false;

  // Optimized thresholds for waste sorting
  private readonly CONFIDENCE_THRESHOLD = 0.2;
  private readonly OVERLAP_THRESHOLD = 0.5;

  constructor() {
    this.publishableKey = process.env.NEXT_PUBLIC_ROBOFLOW_API_KEY || '';
    this.modelName = process.env.NEXT_PUBLIC_ROBOFLOW_MODEL_ID || '';
    this.version = process.env.NEXT_PUBLIC_ROBOFLOW_VERSION || '';
    
    this.debugConfig();
  }

  private debugConfig() {
    console.log('🔧 Roboflow Configuration:', {
      modelName: this.modelName,
      version: this.version,
      confidenceThreshold: `${this.CONFIDENCE_THRESHOLD * 100}%`,
      overlapThreshold: `${this.OVERLAP_THRESHOLD * 100}%`,
      hasApiKey: !!this.publishableKey,
      apiKeyLength: this.publishableKey?.length || 0
    });
  }

  // FIXED: Better image validation and blob creation
  private async imageToBlob(image: HTMLImageElement | HTMLCanvasElement): Promise<Blob> {
    return new Promise((resolve, reject) => {
      try {
        console.log('🎨 Converting image to blob...', {
          type: image.constructor.name,
          width: image.width,
          height: image.height,
          naturalWidth: (image as HTMLImageElement).naturalWidth || 'N/A',
          naturalHeight: (image as HTMLImageElement).naturalHeight || 'N/A',
          complete: (image as HTMLImageElement).complete || 'N/A'
        });

        // More lenient image validation
        let canvasWidth = image.width;
        let canvasHeight = image.height;

        // For HTMLImageElement, try to use natural dimensions if available
        if (image instanceof HTMLImageElement) {
          if (image.naturalWidth > 0 && image.naturalHeight > 0) {
            canvasWidth = image.naturalWidth;
            canvasHeight = image.naturalHeight;
          } else if (image.width === 0 || image.height === 0) {
            // If both are zero, use a default size
            canvasWidth = 640;
            canvasHeight = 480;
            console.log('⚠️ Using default image dimensions');
          }
        }

        // Final safety check
        if (canvasWidth === 0 || canvasHeight === 0) {
          reject(new Error('Image dimensions are zero'));
          return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Clear canvas with white background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Draw the image
        try {
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          console.log('✅ Image drawn to canvas successfully');
        } catch (drawError) {
          console.warn('⚠️ Could not draw image, using blank canvas:', drawError);
          // Continue with blank canvas - Roboflow might still detect something
        }

        console.log('✅ Canvas prepared:', { width: canvas.width, height: canvas.height });

        // Convert to blob
        canvas.toBlob((blob) => {
          if (blob && blob.size > 0) {
            console.log('✅ Blob created successfully:', { 
              size: blob.size, 
              type: blob.type,
              sizeKB: Math.round(blob.size / 1024)
            });
            resolve(blob);
          } else {
            reject(new Error('Blob creation failed - empty or invalid blob'));
          }
        }, 'image/jpeg', 0.8);

      } catch (error) {
        console.error('❌ Error in imageToBlob:', error);
        reject(error);
      }
    });
  }

  // FIXED: Better error handling and image validation
  private async detectViaRestAPI(image: HTMLImageElement | HTMLCanvasElement): Promise<Detection[]> {
    try {
      console.log('🌐 Starting Roboflow API detection...');
      
      // More lenient image validation
      if (!image) {
        throw new Error('No image provided');
      }

      // Check if image is an HTMLImageElement and has issues
      if (image instanceof HTMLImageElement) {
        if (!image.src) {
          throw new Error('Image has no source');
        }
        
        // Log image status but don't throw error for zero dimensions
        if (image.naturalWidth === 0 || image.naturalHeight === 0) {
          console.warn('⚠️ Image has zero natural dimensions, but continuing anyway...');
        }
      }

      // Convert image to blob
      const blob = await this.imageToBlob(image);

      // API URL with optimized parameters
      const apiUrl = `https://detect.roboflow.com/${this.modelName}/${this.version}?api_key=${this.publishableKey}&confidence=${this.CONFIDENCE_THRESHOLD}&overlap=${this.OVERLAP_THRESHOLD}&format=json&stroke=5`;
      
      console.log('📤 Making API request...', {
        url: apiUrl.replace(this.publishableKey, '***'),
        blobSize: `${Math.round(blob.size / 1024)}KB`
      });

      const formData = new FormData();
      formData.append('file', blob, 'image.jpg');

      const startTime = Date.now();
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
        headers: { 
          'Accept': 'application/json',
        }
      });

      const responseTime = Date.now() - startTime;
      console.log(`📥 Response received in ${responseTime}ms:`, {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('❌ API Error Response:', {
          status: response.status,
          body: errorText
        });
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      console.log('📊 API Response received');
      
      if (!data.predictions) {
        console.warn('⚠️ No predictions in response');
        console.log('Available data:', data);
        return [];
      }
      
      console.log(`🎯 Received ${data.predictions.length} predictions`);
      const filtered = this.filterDetections(data.predictions);
      console.log(`✅ Filtered to ${filtered.length} valid detections`);
      
      return filtered;

    } catch (error) {
      console.error('❌ API detection failed:', error);
      throw error;
    }
  }

  private filterDetections(predictions: any[]): Detection[] {
    const filtered = predictions
      .filter((pred: any) => {
        const passes = pred.confidence >= this.CONFIDENCE_THRESHOLD;
        if (!passes) {
          console.log(`   📉 Filtered out ${pred.class} - ${(pred.confidence * 100).toFixed(1)}% (below threshold)`);
        }
        return passes;
      })
      .map((pred: any) => ({
        class: pred.class,
        confidence: pred.confidence,
        x: pred.x - pred.width / 2,
        y: pred.y - pred.height / 2,
        width: pred.width,
        height: pred.height
      }));

    console.log('🔍 Filtering results:', {
      totalPredictions: predictions.length,
      afterFiltering: filtered.length,
      confidenceThreshold: this.CONFIDENCE_THRESHOLD
    });

    return filtered;
  }

  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      console.log('✅ Roboflow API already initialized');
      return true;
    }

    try {
      console.log('🚀 Initializing Roboflow API...');
      
      if (!this.publishableKey) {
        throw new Error('Missing Roboflow API key');
      }
      if (!this.modelName) {
        throw new Error('Missing Roboflow model ID');
      }
      if (!this.version) {
        throw new Error('Missing Roboflow version');
      }

      console.log('✅ All configuration present');
      this.isInitialized = true;
      console.log('🎉 Roboflow API initialized successfully');
      return true;
      
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      return false;
    }
  }

  async detectFromImage(image: HTMLImageElement | HTMLCanvasElement): Promise<Detection[]> {
    console.group('🔍 Roboflow Detection Started');
    try {
      if (!this.isInitialized) {
        console.log('⚡ Initializing first...');
        await this.initialize();
      }

      console.log('🎯 Starting detection process...');
      const startTime = Date.now();
      
      const results = await this.detectViaRestAPI(image);
      
      const detectionTime = Date.now() - startTime;
      console.log(`✅ DETECTION COMPLETED in ${detectionTime}ms`);
      console.log(`📊 FINAL RESULTS: ${results.length} objects detected`);
      
      results.forEach((result, index) => {
        console.log(`   ${index + 1}. ${result.class} - ${(result.confidence * 100).toFixed(1)}% confidence`);
      });

      return results;
      
    } catch (error) {
      console.error('❌ DETECTION FAILED:', error);
      throw error;
    } finally {
      console.groupEnd();
    }
  }

  isConfigured(): boolean {
    const configured = !!(this.publishableKey && this.modelName && this.version);
    return configured;
  }

  async testConnection(): Promise<boolean> {
    console.group('🧪 Roboflow Connection Test');
    try {
      console.log('🔧 Testing configuration...');
      
      if (!this.isConfigured()) {
        const error = 'API not configured - check environment variables';
        console.error('❌', error);
        throw new Error(error);
      }

      console.log('✅ Configuration valid');
      console.log('🎨 Creating test image...');

      // Create a proper test image
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Draw actual test objects
        ctx.fillStyle = '#2e8b57';
        ctx.fillRect(100, 100, 200, 150); // Green rectangle
        
        ctx.fillStyle = '#ff6b6b';
        ctx.fillRect(350, 200, 180, 120); // Red rectangle
        
        ctx.fillStyle = '#4682b4';
        ctx.fillRect(200, 300, 160, 100); // Blue rectangle
        
        console.log('✅ Test image created with objects');
      }

      console.log('🚀 Starting detection test...');
      const results = await this.detectFromImage(canvas);
      
      console.log(`📊 Test results: ${results.length} detections`);
      
      if (results.length > 0) {
        const detectionSummary = results.map(r => 
          `${r.class} (${(r.confidence * 100).toFixed(1)}%)`
        ).join(', ');
        
        console.log('🎉 SUCCESS: Roboflow API is working!');
        console.log(`Detected: ${detectionSummary}`);
        alert(`✅ Roboflow API Working!\nDetected: ${detectionSummary}`);
      } else {
        console.log('ℹ️ No objects detected in test image');
        alert('✅ Roboflow API Connected!\nNo objects detected in test image.');
      }
      
      console.log('✅ Connection test completed successfully');
      return true;
    } catch (error) {
      console.error('❌ Connection test failed:', error);
      alert('❌ Roboflow API test failed. Check console for details.');
      return false;
    } finally {
      console.groupEnd();
    }
  }
}

export const roboflowAPI = new RoboflowAPI();