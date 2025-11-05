// This file is: app/api/webhook/route.ts
import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ error: 'Job ID required' }, { status: 400 });
    }

    const data = await request.json();

    // Check the transcription status from AssemblyAI
    if (data.status === 'completed') {
      // Job is done! Save the final transcript to the database.
      await kv.set(jobId, { status: 'completed', text: data.text });
    } else if (data.status === 'error') {
      // Job failed. Save the error.
      await kv.set(jobId, { status: 'error', error: data.error });
    } else {
      // Still processing (e.g., 'processing' status)
      await kv.set(jobId, { status: data.status });
    }

    // Tell AssemblyAI we received the webhook
    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error('Error in webhook:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}