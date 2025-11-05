// This file is app/api/start-job/route.ts
import { NextResponse } from 'next/server';
import kv from '@vercel/kv';
import { YoutubeTranscript } from 'youtube-transcript';
import { AssemblyAI } from 'assemblyai';
import ytdlp from 'yt-dlp-exec';

// Initialize AssemblyAI client
const assembly = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY!,
});

// Helper to get Vercel's public URL
const getBaseUrl = () => {
  if (process.env.VERCEL_URL) {
    return 'https://my-transcript-app.vercel.app'; // Replace with your actual project name
  }
  return 'http://localhost:3000';
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
        const transcriptText = transcript.map((t: any) => t.text).join(' ');
        return NextResponse.json({ status: 'completed', text: transcriptText }, { status: 200 });
      } catch (youtubeError) {
        console.warn('YouTube transcript failed, falling back to AssemblyAI');
        // Fall through to Path 2
      }
    }

    // --- Path 2: Instagram / Failed YouTube (Slow & Paid) ---
    const jobId = `job${Date.now()}`;
    await kv.set(jobId, { status: 'pending' });

    let audioUrl: string;
    try {
      const output = await ytdlp(url, {
        format: 'ba/bestaudio',
        getUrl: true,
      });

      // THIS IS THE FIX - access stdout property
      audioUrl = (output as any).stdout.trim().split('\n')[0];
      
      if (!audioUrl.startsWith('http')) {
        throw new Error('Could not get a valid audio URL from yt-dlp.');
      }
    } catch (dlpError: any) {
      console.error('yt-dlp error:', dlpError);
      return NextResponse.json(
        { error: 'Failed to get audio from URL', details: dlpError.message },
        { status: 500 }
      );
    }

    const webhookUrl = `${baseUrl}/api/webhook?jobId=${jobId}`;
    await assembly.transcripts.submit({
      audio_url: audioUrl,
      webhook_url: webhookUrl,
    });

    return NextResponse.json({ status: 'pending', jobId }, { status: 202 });
  } catch (error: any) {
    console.error('Error in start-job:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}
