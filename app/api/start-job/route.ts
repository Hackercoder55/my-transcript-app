// app/api/start-job/route.ts

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
    return 'https://my-transcript-app.vercel.app';
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

    // --- YouTube Path: fast/captions available ---
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(url);
        const transcriptText = transcript.map((t: any) => t.text).join(' ');
        return NextResponse.json({ status: 'completed', text: transcriptText }, { status: 200 });
      } catch (youtubeError) {
        console.warn('YouTube transcript failed, will use AssemblyAI.', youtubeError);
        // Fall through to slow path
      }
    }

    // --- Instagram/failed YouTube: slow path via yt-dlp and AssemblyAI ---
    const jobId = `job${Date.now()}`;
    await kv.set(jobId, { status: 'pending' });

    let audioUrl: string = '';

    try {
      const output: any = await ytdlp(url, {
        format: 'ba/bestaudio',
        getUrl: true,
      });

      // Extract audio URL from yt-dlp-exec output
      // The output is an object (YtResponse), not a string
      if (output && typeof (output as any).stdout === 'string') {
        // Most common: output.stdout contains the URL
        audioUrl = (output as any).stdout.trim().split('\n')[0];
      } else if (output && typeof (output as any).url === 'string') {
        // Fallback: direct url property
        audioUrl = (output as any).url;
      } else if (output && Array.isArray((output as any).formats) && (output as any).formats.length > 0) {
        // Fallback: formats array
        audioUrl = (output as any).formats[0].url;
      } else if (typeof output === 'string') {
        // Last resort: output is already a string
        audioUrl = output.trim().split('\n')[0];
      }

      // Validate the extracted URL
      if (!audioUrl || !audioUrl.startsWith('http')) {
        throw new Error('Could not extract a valid audio URL from yt-dlp.');
      }

      console.log('Extracted audio URL:', audioUrl);
    } catch (dlpError: any) {
      console.error('yt-dlp error:', dlpError);
      return NextResponse.json(
        { error: 'Failed to get audio from URL', details: dlpError.message },
        { status: 500 }
      );
    }

    // Submit to AssemblyAI for transcription
    const webhookUrl = `${baseUrl}/api/webhook?jobId=${jobId}`;
    
    try {
      await assembly.transcripts.create({
        audio_url: audioUrl,
        webhook_url: webhookUrl,
      });
    } catch (assemblyError: any) {
      console.error('AssemblyAI submission error:', assemblyError);
      return NextResponse.json(
        { error: 'Failed to submit to AssemblyAI', details: assemblyError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ status: 'pending', jobId }, { status: 202 });
  } catch (error: any) {
    console.error('Error in start-job:', error);
    return NextResponse.json(
      { error: 'Internal Server Error', details: error.message },
      { status: 500 }
    );
  }
}