import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const apiKey = process.env.ROBOFLOW_PRIVATE_API_KEY;
    const modelId = process.env.ROBOFLOW_MODEL_ID;
    const version = process.env.ROBOFLOW_VERSION;

    if (!apiKey || !modelId || !version) {
      return NextResponse.json(
        { error: 'Roboflow not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(
      `https://detect.roboflow.com/${modelId}/${version}?api_key=${apiKey}`,
      {
        method: 'POST',
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(`Roboflow API error: ${response.status}`);
    }

    const result = await response.json();
    return NextResponse.json(result);
    
  } catch (error: any) {
    console.error('Detection API error:', error);
    return NextResponse.json(
      { error: error.message || 'Detection failed' },
      { status: 500 }
    );
  }
}