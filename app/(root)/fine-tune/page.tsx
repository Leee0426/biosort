"use client";

import { useRouter } from "next/navigation";
import { useAuth } from '@/contexts/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { supabase } from '@/lib/supabase';
import { useEffect, useState, useRef } from "react";

interface Annotation {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  wasteType: string;
}

interface CapturedImage {
  id: string;
  url: string;
  name: string;
  classification: string;
  annotations: Annotation[];
  createdAt: Date;
  originalWidth: number;
  originalHeight: number;
}

export default function FineTunePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [userRole, setUserRole] = useState<string | null>(null);
  
  // Image collection states
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<CapturedImage | null>(null);
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);
  const [wasteName, setWasteName] = useState("");
  const [wasteClassification, setWasteClassification] = useState("Biodegradable");
  
  // Roboflow integration
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Canvas refs for annotation
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Annotation state
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

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
          setUserRole('user');
          return;
        }

        if (data) {
          setUserRole(data.role);
        } else {
          setUserRole('user');
        }

      } catch (error: any) {
        console.error('Error fetching user role:', error);
        setUserRole('user');
      }
    };

    fetchUserRole();
  }, [user]);

  // Handle image upload
  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const newImage: CapturedImage = {
            id: Date.now().toString(),
            url: e.target?.result as string,
            name: file.name.split('.')[0],
            classification: "Biodegradable",
            annotations: [],
            createdAt: new Date(),
            originalWidth: img.width,
            originalHeight: img.height
          };
          
          setCapturedImages(prev => [newImage, ...prev]);
          setSelectedImage(newImage);
        };
        img.src = e.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  // Get mouse position relative to canvas
  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    };
  };

  // Convert canvas coordinates to original image coordinates
  const canvasToImageCoords = (x: number, y: number, width: number, height: number) => {
    if (!selectedImage || !canvasRef.current) return { x, y, width, height };
    
    const canvas = canvasRef.current;
    const scaleX = selectedImage.originalWidth / canvas.width;
    const scaleY = selectedImage.originalHeight / canvas.height;
    
    return {
      x: x * scaleX,
      y: y * scaleY,
      width: width * scaleX,
      height: height * scaleY
    };
  };

  // Annotation functions
  const startAnnotation = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isAnnotating || !selectedImage || !canvasRef.current) return;

    const pos = getMousePos(e);
    setStartPos(pos);
    setIsDrawing(true);

    setCurrentAnnotation({
      id: Date.now().toString(),
      x: pos.x,
      y: pos.y,
      width: 0,
      height: 0,
      label: wasteName || "waste",
      wasteType: wasteClassification.toLowerCase()
    });
  };

  const updateAnnotation = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isAnnotating || !currentAnnotation || !isDrawing || !canvasRef.current) return;

    const pos = getMousePos(e);
    
    // Calculate width and height based on drag direction
    const width = pos.x - startPos.x;
    const height = pos.y - startPos.y;
    
    setCurrentAnnotation(prev => prev ? {
      ...prev,
      x: width < 0 ? pos.x : startPos.x,
      y: height < 0 ? pos.y : startPos.y,
      width: Math.abs(width),
      height: Math.abs(height)
    } : null);
  };

  const finishAnnotation = () => {
    if (currentAnnotation && selectedImage && 
        currentAnnotation.width > 10 && currentAnnotation.height > 10) {
      
      // Convert coordinates to original image scale
      const imageCoords = canvasToImageCoords(
        currentAnnotation.x,
        currentAnnotation.y,
        currentAnnotation.width,
        currentAnnotation.height
      );
      
      const finalAnnotation: Annotation = {
        ...currentAnnotation,
        x: imageCoords.x,
        y: imageCoords.y,
        width: imageCoords.width,
        height: imageCoords.height
      };
      
      const updatedImage = {
        ...selectedImage,
        annotations: [...selectedImage.annotations, finalAnnotation]
      };
      
      setSelectedImage(updatedImage);
      setCapturedImages(prev => 
        prev.map(img => img.id === selectedImage.id ? updatedImage : img)
      );
    }
    
    // Reset annotation state
    setCurrentAnnotation(null);
    setIsDrawing(false);
    setWasteName(""); // Reset waste name for next annotation
  };

  const deleteAnnotation = (annotationId: string) => {
    if (selectedImage) {
      const updatedImage = {
        ...selectedImage,
        annotations: selectedImage.annotations.filter(ann => ann.id !== annotationId)
      };
      
      setSelectedImage(updatedImage);
      setCapturedImages(prev => 
        prev.map(img => img.id === selectedImage.id ? updatedImage : img)
      );
    }
  };

  // Upload to Roboflow
  const uploadToRoboflow = async (image: CapturedImage) => {
    if (!image.annotations.length) {
      alert("No annotations to upload");
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    
    try {
      // Convert image URL to blob
      const response = await fetch(image.url);
      const blob = await response.blob();
      
      // Create form data for Roboflow upload
      const formData = new FormData();
      formData.append('file', blob, `${image.name}.jpg`);
      
      // Add annotations in Roboflow format
      const annotations = image.annotations.map(ann => {
        // Convert to normalized coordinates (0-1)
        const x_center = (ann.x + ann.width / 2) / image.originalWidth;
        const y_center = (ann.y + ann.height / 2) / image.originalHeight;
        const width = ann.width / image.originalWidth;
        const height = ann.height / image.originalHeight;
        
        return {
          class: ann.wasteType,
          coordinates: {
            x: x_center,
            y: y_center,
            width: width,
            height: height
          }
        };
      });
      
      formData.append('annotations', JSON.stringify(annotations));
      formData.append('split', 'train');
      formData.append('tags', image.classification);
      
      // Roboflow API configuration
      const roboflowConfig = {
        workspaceId: process.env.NEXT_PUBLIC_ROBOFLOW_WORKSPACE_ID,
        projectId: process.env.NEXT_PUBLIC_ROBOFLOW_PROJECT_ID,
        apiKey: process.env.NEXT_PUBLIC_ROBOFLOW_API_KEY
      };
      
      if (!roboflowConfig.apiKey || !roboflowConfig.projectId) {
        throw new Error('Roboflow configuration missing. Check environment variables.');
      }
      
      const uploadResponse = await fetch(
        `https://api.roboflow.com/dataset/${roboflowConfig.projectId}/upload`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${roboflowConfig.apiKey}`
          },
          body: formData
        }
      );
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        throw new Error(`Upload failed: ${uploadResponse.status} - ${errorText}`);
      }
      
      const result = await uploadResponse.json();
      console.log('Upload successful:', result);
      alert(`✅ Image "${image.name}" uploaded to Roboflow successfully!`);
      
    } catch (error: any) {
      console.error('Roboflow upload error:', error);
      alert(`❌ Upload failed: ${error.message}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // Submit all images to Roboflow
  const handleSubmitAll = async () => {
    const annotatedImages = capturedImages.filter(img => img.annotations.length > 0);
    
    if (annotatedImages.length === 0) {
      alert("No annotated images to submit.");
      return;
    }

    setIsUploading(true);
    
    for (let i = 0; i < annotatedImages.length; i++) {
      const image = annotatedImages[i];
      setUploadProgress(((i + 1) / annotatedImages.length) * 100);
      await uploadToRoboflow(image);
      
      // Small delay between uploads
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    setIsUploading(false);
    alert(`✅ Successfully submitted ${annotatedImages.length} annotated images to Roboflow!`);
  };

  // Draw annotations on canvas
  useEffect(() => {
    if (selectedImage && canvasRef.current && imageRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      const img = imageRef.current;
      
      // Set canvas size to match image display size
      canvas.width = img.offsetWidth;
      canvas.height = img.offsetHeight;
      
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Calculate scale factors
        const scaleX = canvas.width / selectedImage.originalWidth;
        const scaleY = canvas.height / selectedImage.originalHeight;
        
        // Draw existing annotations
        selectedImage.annotations.forEach(ann => {
          const x = ann.x * scaleX;
          const y = ann.y * scaleY;
          const width = ann.width * scaleX;
          const height = ann.height * scaleY;
          
          // Choose color based on waste type
          let color = '#00ff00'; // green for biodegradable
          if (ann.wasteType === 'plastic') color = '#ff0000'; // red for plastic
          if (ann.wasteType === 'recyclable') color = '#0066ff'; // blue for recyclable
          
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.strokeRect(x, y, width, height);
          
          ctx.fillStyle = color;
          ctx.font = 'bold 14px Arial';
          ctx.fillText(ann.label, x + 5, y - 5);
        });
        
        // Draw current annotation in progress
        if (currentAnnotation) {
          const x = currentAnnotation.x;
          const y = currentAnnotation.y;
          const width = currentAnnotation.width;
          const height = currentAnnotation.height;
          
          ctx.strokeStyle = '#ffff00'; // yellow for current annotation
          ctx.lineWidth = 2;
          ctx.setLineDash([5, 5]);
          ctx.strokeRect(x, y, width, height);
          ctx.setLineDash([]);
          
          // Draw label for current annotation
          ctx.fillStyle = '#ffff00';
          ctx.font = 'bold 14px Arial';
          ctx.fillText(currentAnnotation.label, x + 5, y - 5);
        }
      }
    }
  }, [selectedImage, currentAnnotation]);

  // Handle mouse leave canvas
  const handleMouseLeave = () => {
    if (isDrawing) {
      finishAnnotation();
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Navbar - Same blue color as original */}
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
              <li className="flex items-center space-x-2 cursor-pointer select-none text-[#3bff00]">
                <span>Fine Tune</span>
              </li>
              <li 
                onClick={() => router.push("/wifi-config")}
                className="flex items-center space-x-2 cursor-pointer select-none hover:text-[#3bff00] transition-colors"
              >
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
          <div className="max-w-7xl mx-auto">
            {/* Header Section */}
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">
                Dataset Annotation Tool
              </h1>
              <p className="text-gray-600 text-lg">
                Upload images and annotate them for Roboflow training
              </p>
            </div>
            
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
              
              {/* Left Column - Image Upload and Management */}
              <div className="space-y-6">
                {/* Image Upload Section */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Upload Images</h2>
                  
                  <div className="flex flex-col space-y-4">
                    <div className="flex items-center space-x-4">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageUpload}
                        className="hidden"
                        id="image-upload"
                        multiple
                      />
                      <label
                        htmlFor="image-upload"
                        className="flex-1 bg-[#0a6b9a] text-white px-6 py-4 rounded-lg text-center cursor-pointer hover:bg-[#0a5a8a] text-lg font-medium transition-colors duration-200"
                      >
                        📁 Upload Image Files
                      </label>
                    </div>
                    
                    <div className="text-gray-600 text-sm text-center">
                      Supported formats: JPG, PNG, JPEG
                    </div>
                  </div>
                </div>

                {/* Captured Images Grid */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">
                    Images ({capturedImages.length})
                  </h2>
                  <div className="grid grid-cols-3 gap-4 max-h-80 overflow-y-auto">
                    {capturedImages.map((image) => (
                      <div
                        key={image.id}
                        className={`relative cursor-pointer border-2 rounded-lg overflow-hidden transition-all ${
                          selectedImage?.id === image.id ? 'border-[#0a6b9a] scale-105' : 'border-transparent'
                        }`}
                        onClick={() => setSelectedImage(image)}
                      >
                        <img
                          src={image.url}
                          alt="Captured"
                          className="w-full h-20 object-cover"
                        />
                        <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-70 text-white text-xs p-1 truncate">
                          {image.name}
                        </div>
                        {image.annotations.length > 0 && (
                          <div className="absolute top-1 right-1 bg-green-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                            {image.annotations.length}
                          </div>
                        )}
                      </div>
                    ))}
                    {capturedImages.length === 0 && (
                      <div className="col-span-3 text-center text-gray-500 py-8 bg-gray-50 rounded-lg">
                        <div className="text-4xl mb-2">📸</div>
                        <p>No images uploaded yet</p>
                        <p className="text-sm mt-1">Upload images to start annotating</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Annotation Guide */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Annotation Guide</h2>
                  <div className="space-y-3 text-gray-700 text-sm">
                    <div className="flex items-center space-x-3">
                      <div className="w-4 h-4 bg-green-500 rounded"></div>
                      <span>🟢 Biodegradable - Food waste, paper, organic materials</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-4 h-4 bg-red-500 rounded"></div>
                      <span>🔴 Plastic - Bottles, packaging, non-biodegradable plastics</span>
                    </div>
                    <div className="flex items-center space-x-3">
                      <div className="w-4 h-4 bg-blue-500 rounded"></div>
                      <span>🔵 Recyclable - Metal, glass, certain plastics</span>
                    </div>
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
                      <p className="font-semibold text-gray-900">💡 Annotation Tips:</p>
                      <ul className="list-disc list-inside mt-2 space-y-1 text-xs text-gray-600">
                        <li>Draw tight bounding boxes around each object</li>
                        <li>Label objects clearly and consistently</li>
                        <li>Include variety in angles and lighting</li>
                        <li>Annotate multiple objects in single images</li>
                        <li>Use descriptive names (e.g., "plastic_bottle", "food_waste")</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column - Annotation Workspace */}
              <div className="space-y-6">
                {/* Annotation Tools */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">
                    {selectedImage ? `Annotate: ${selectedImage.name}` : 'Annotation Workspace'}
                  </h2>
                  
                  {selectedImage ? (
                    <div className="space-y-4">
                      {/* Annotation Canvas */}
                      <div className="relative border-2 border-gray-300 rounded-lg overflow-hidden bg-gray-100">
                        <img
                          ref={imageRef}
                          src={selectedImage.url}
                          alt="Selected for annotation"
                          className="max-w-full max-h-96 object-contain mx-auto"
                          onLoad={() => {
                            // Redraw annotations when image loads
                            if (canvasRef.current && imageRef.current) {
                              const canvas = canvasRef.current;
                              const img = imageRef.current;
                              canvas.width = img.offsetWidth;
                              canvas.height = img.offsetHeight;
                            }
                          }}
                        />
                        <canvas
                          ref={canvasRef}
                          className="absolute top-0 left-0 w-full h-full cursor-crosshair"
                          onMouseDown={startAnnotation}
                          onMouseMove={updateAnnotation}
                          onMouseUp={finishAnnotation}
                          onMouseLeave={handleMouseLeave}
                          style={{ pointerEvents: isAnnotating ? 'auto' : 'none' }}
                        />
                      </div>

                      {/* Annotation Controls */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-gray-700 text-sm font-medium mb-2">Object Name</label>
                          <input
                            type="text"
                            value={wasteName}
                            onChange={(e) => setWasteName(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                            placeholder="e.g., Plastic Bottle"
                          />
                        </div>
                        <div>
                          <label className="block text-gray-700 text-sm font-medium mb-2">Waste Type</label>
                          <select
                            value={wasteClassification}
                            onChange={(e) => setWasteClassification(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors duration-200"
                          >
                            <option>Biodegradable</option>
                            <option>Plastic</option>
                            <option>Recyclable</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex space-x-4">
                        <button
                          onClick={() => setIsAnnotating(!isAnnotating)}
                          className={`flex-1 px-4 py-3 rounded-lg font-medium transition-colors duration-200 ${
                            isAnnotating 
                              ? 'bg-red-600 text-white hover:bg-red-700' 
                              : 'bg-green-600 text-white hover:bg-green-700'
                          }`}
                        >
                          {isAnnotating ? '🟥 Stop Annotating' : '🟢 Start Annotating'}
                        </button>
                        
                        <button
                          onClick={() => {
                            if (selectedImage) {
                              const updatedImage = {
                                ...selectedImage,
                                name: wasteName || selectedImage.name,
                                classification: wasteClassification
                              };
                              setSelectedImage(updatedImage);
                              setCapturedImages(prev => 
                                prev.map(img => img.id === selectedImage.id ? updatedImage : img)
                              );
                              alert('✅ Image metadata updated!');
                            }
                          }}
                          className="flex-1 bg-[#0a6b9a] text-white px-4 py-3 rounded-lg font-medium hover:bg-[#0a5a8a] transition-colors duration-200"
                        >
                          💾 Save Metadata
                        </button>
                      </div>

                      {/* Annotation Instructions */}
                      {isAnnotating && (
                        <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                          <p className="text-yellow-800 text-sm text-center">
                            🎯 Click and drag to draw bounding boxes around waste objects
                          </p>
                        </div>
                      )}

                      {/* Annotations List */}
                      {selectedImage.annotations.length > 0 && (
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                          <h3 className="text-gray-900 text-sm font-semibold mb-2">
                            Annotations ({selectedImage.annotations.length}):
                          </h3>
                          <div className="space-y-2 max-h-32 overflow-y-auto">
                            {selectedImage.annotations.map((ann) => (
                              <div key={ann.id} className="flex justify-between items-center text-gray-800 text-sm bg-white p-2 rounded border border-gray-200">
                                <div className="flex items-center space-x-2">
                                  <div 
                                    className="w-3 h-3 rounded"
                                    style={{
                                      backgroundColor: 
                                        ann.wasteType === 'biodegradable' ? '#00ff00' :
                                        ann.wasteType === 'plastic' ? '#ff0000' : '#0066ff'
                                    }}
                                  ></div>
                                  <span>{ann.label} - {ann.wasteType}</span>
                                </div>
                                <button
                                  onClick={() => deleteAnnotation(ann.id)}
                                  className="text-red-600 hover:text-red-800 text-xs font-medium"
                                >
                                  Delete
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-gray-500 text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                      <div className="text-4xl mb-4">📝</div>
                      <p>Select an image to start annotating</p>
                      <p className="text-sm mt-2">Upload images using the panel on the left</p>
                    </div>
                  )}
                </div>

                {/* Submit to Roboflow */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Submit to Roboflow Dataset</h2>
                  <div className="space-y-4">
                    <button
                      onClick={handleSubmitAll}
                      disabled={capturedImages.filter(img => img.annotations.length > 0).length === 0 || isUploading}
                      className="w-full bg-[#0a6b9a] text-white px-6 py-4 rounded-lg font-medium hover:bg-[#0a5a8a] transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isUploading ? (
                        `Uploading... ${Math.round(uploadProgress)}%`
                      ) : (
                        `🚀 Submit All to Roboflow (${
                          capturedImages.filter(img => img.annotations.length > 0).length
                        } annotated images)`
                      )}
                    </button>
                    
                    {isUploading && (
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className="bg-green-600 h-3 rounded-full transition-all duration-300"
                          style={{ width: `${uploadProgress}%` }}
                        ></div>
                      </div>
                    )}
                    
                    <div className="text-gray-700 text-sm bg-gray-50 p-3 rounded-lg border border-gray-200">
                      <p className="font-semibold text-gray-900 mb-2">📊 Submission Summary:</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>Total Images: {capturedImages.length}</div>
                        <div>Annotated: {capturedImages.filter(img => img.annotations.length > 0).length}</div>
                        <div>Total Annotations: {capturedImages.reduce((sum, img) => sum + img.annotations.length, 0)}</div>
                        <div>Ready for Upload: {capturedImages.filter(img => img.annotations.length > 0).length}</div>
                      </div>
                    </div>
                    
                    <p className="text-gray-600 text-sm text-center">
                      This will upload all annotated images to your Roboflow dataset for model training.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
}