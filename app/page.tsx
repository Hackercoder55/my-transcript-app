// This file is: app/page.tsx
'use client';

import { useState, useEffect } from 'react';

// This defines the different states our app can be in
type Status = 'idle' | 'loading' | 'pending' | 'completed' | 'error';

export default function HomePage() {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [transcript, setTranscript] = useState('');
  const [jobId, setJobId] = useState('');
  const [error, setError] = useState('');

  // This effect runs *only* when the status becomes 'pending'
  useEffect(() => {
    // If we're not in a pending state, do nothing
    if (status !== 'pending' || !jobId) return;

    // Set up an interval to poll (check) for the job status every 3 seconds
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/check-status?jobId=${jobId}`);
        const data = await res.json();

        if (data.status === 'completed') {
          setStatus('completed');
          setTranscript(data.text);
          setJobId(''); // Clear the job ID
          clearInterval(interval); // Stop polling
        } else if (data.status === 'error') {
          setStatus('error');
          setError(data.error || 'Transcription failed');
          setJobId('');
          clearInterval(interval);
        }
        // If status is still 'pending', the interval will just run again
      } catch (err) {
        console.error('Error checking status:', err);
        setStatus('error');
        setError('Error checking status');
        clearInterval(interval);
      }
    }, 3000); // Poll every 3 seconds

    // Cleanup function: If the component unmounts, clear the interval
    return () => clearInterval(interval);
  }, [status, jobId]); // Only re-run if status or jobId changes

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setTranscript('');
    setStatus('loading');

    try {
      const res = await fetch('/api/start-job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to start job');
      }

      // --- Smart Response Handling ---

      if (data.status === 'completed') {
        // This was a fast YouTube job!
        setStatus('completed');
        setTranscript(data.text);
      } else if (data.status === 'pending') {
        // This is a slow Instagram/AssemblyAI job
        setStatus('pending');
        setJobId(data.jobId);
      } else {
        throw new Error('Unexpected response from server');
      }
    } catch (err: any) {
      setError(err.message);
      setStatus('error');
    }
  };

  // Helper function to show the right message
  const getStatusMessage = () => {
    switch (status) {
      case 'loading':
        return 'Starting job...';
      case 'pending':
        return 'Transcription in progress... this may take a minute.';
      case 'completed':
        return 'Transcription complete!';
      case 'error':
        return `Error: ${error}`;
      default:
        return '';
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-8 sm:p-24 bg-gray-900 text-white">
      <div className="w-full max-w-2xl">
        <h1 className="text-4xl font-bold text-center mb-8">
          Video Transcript Generator
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Enter YouTube or Instagram URL"
            className="w-full p-4 rounded-lg bg-gray-700 text-white placeholder-gray-400 border border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={status === 'loading' || status === 'pending'}
          />
          <button
            type="submit"
            className="w-full p-4 bg-blue-600 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:bg-gray-500"
            disabled={status === 'loading' || status === 'pending'}
          >
            {status === 'loading' || status === 'pending'
              ? 'Processing...'
              : 'Generate Transcript'}
          </button>
        </form>

        {/* --- This section shows the status messages and spinner --- */}
        {(status === 'loading' ||
          status === 'pending' ||
          status === 'error') && (
          <div className="mt-8 text-center text-lg">
            <p>{getStatusMessage()}</p>
            {(status === 'loading' || status === 'pending') && (
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mt-4"></div>
            )}
          </div>
        )}

        {/* --- This section shows the final transcript --- */}
        {status === 'completed' && transcript && (
          <div className="mt-8">
            <h2 className="text-2xl font-semibold mb-4">Transcript:</h2>
            <pre className="w-full p-6 bg-gray-800 rounded-lg whitespace-pre-wrap font-mono text-sm leading-relaxed overflow-x-auto">
              {transcript}
            </pre>
            <button
              onClick={() => navigator.clipboard.writeText(transcript)}
              className="mt-4 p-2 bg-gray-600 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Copy to Clipboard
            </button>
          </div>
        )}
      </div>
    </main>
  );
}