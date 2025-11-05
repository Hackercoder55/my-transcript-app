// app/api/start-job/route.ts

import { NextResponse } from 'next/server';
import kv from '@vercel/kv';
import { YoutubeTranscript } from 'youtube-transcript';
import { AssemblyAI } from 'assemblyai';
import ytdlp from 'yt-dlp-exec';

const assembly = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY!,
});

const getBaseUrl = () => process.env.VERCEL_URL
  ? 'https://my-transcript-app.vercel.app'
  : 'http://localhost:3000';

export async function POST(request: Request) {
  try {
    const { url } = await request.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const baseUrl = getBaseUrl();

    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      try {
        const transcript = await YoutubeTranscript.fetchTranscript(url);
        const transcriptText = transcript.map((t: any) => t.text).join(' ');
        return NextResponse.json({ status: 'completed', text: transcriptText }, { status: 200 });
      } catch (youtubeError) {
        console.warn('YouTube transcript failed, will use AssemblyAI.', youtubeError);
      }
    }

    const jobId = `job${Date.now()}`;
    await kv.set(jobId, { status: 'pending' });

    let audioUrl: string = '';
    try {
      const output: any = await ytdlp(url, {
        format: 'ba/bestaudio',
        getUrl: true,
      });

      if (output && typeof output.stdout === 'string') {
        audioUrl = output.stdout.trim().split('\n')[0];
      } else if (output && typeof output.url === 'string') {
        audioUrl = output.url;
      } else if (output && Array.isArray(output.formats) && output.formats.length > 0 && output.formats[0].url) {
        audioUrl = output.formats[0].url;
      } else if (typeof output === 'string') {
        audioUrl = (output as string).trim().split('\n')[0];
      }

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
    await assembly.transcripts.create({
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
