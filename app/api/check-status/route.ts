// This file is: app/api/check-status/route.ts
import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID required' }, { status: 400 });
    }

    // Get the job status from the database
    const jobData = await kv.get(jobId);

    if (!jobData) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Return the current job data
    return NextResponse.json(jobData, { status: 200 });
    
  } catch (error: any) {
    console.error('Error in check-status:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}