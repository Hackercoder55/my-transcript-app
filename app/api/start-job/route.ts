// This file is: app/api/start-job/route.ts
import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import { YoutubeTranscript } from 'youtube-transcript';
// --- THIS IS THE FIRST FIX ---
import { AssemblyAI } from 'assemblyai';
// ------------------------------
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

// --- THIS IS THE SECOND FIX ---
const assembly = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY || '',
});
// ------------------------------

// Helper to get Vercel's public URL
const getBaseUrl = () => {
  if (process.env.VERCEL_URL) {
    // This should be your project name.
    return `https://my-transcript-app.vercel.app`; 
  }
  return 'http://localhost:3000'; // Default for local development
};

export async function POST(request: Request) {
  try {
    const { url } = await request.json();
    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const baseUrl = getBaseUrl();

    // --- Path 1: YouTube (Fast & Free) ---
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(url);
        const transcriptText = transcript.map((t) => t.text).join(' ');
        
        // Job done! Return it immediately.
        return NextResponse.json(
          { status: 'completed', text: transcriptText },
          { status: 200 }
        );
      } catch (youtubeError) {
        // If YouTube transcripts are disabled, we fall back to AssemblyAI
        console.warn(
          'YouTube transcript failed, falling back to AssemblyAI:',
          youtubeError
        );
        // Do not return here, let it fall through to Path 2
      }
    }

    // --- Path 2: Instagram / Failed YouTube (Slow & Paid) ---
    
    // 1. Generate a unique Job ID
    const jobId = `job_${Date.now()}`;

    // 2. Set initial status in KV database
    await kv.set(jobId, { status: 'pending' });

    // 3. Get audio URL with yt-dlp
    let audioUrl: string;
    try {
      // We use --get-url and -f 'ba[ext=m4a]' to get the direct best audio link
      // 'ba' means 'best audio'
      const { stdout } = await execPromise(
        `yt-dlp-exec -f "ba[ext=m4a]/ba" --get-url "${url}"`
      );
      audioUrl = stdout.trim().split('\n')[0]; // Get the first line
      
      if (!audioUrl.startsWith('http')) {
        throw new Error('Could not get a valid audio URL.');
      }
    } catch (dlpError: any) {
      console.error('yt-dlp error:', dlpError);
      return NextResponse.json(
        { error: 'Failed to get audio from URL', details: dlpError.message },
        { status: 500 }
      );
    }

    // 4. Start AssemblyAI transcription with a webhook
    const webhookUrl = `${baseUrl}/api/webhook?jobId=${jobId}`;

    await assembly.transcripts.submit({
      audio_url: audioUrl,
      webhook_url: webhookUrl,
    });

    // 5. Return the pending job ID to the frontend
    return NextResponse.json(
      { status: 'pending', jobId: jobId },
      { status: 202 } // 202 Accepted
    );
  } catch (error: any) {
    console.error('Error in start-job:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}