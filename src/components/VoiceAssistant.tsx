import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mic, Loader2, Volume2, X, AlertCircle } from 'lucide-react';
import { GoogleGenAI, Modality } from "@google/genai";
import { Job, Transaction } from '../types';
import { format } from 'date-fns';

interface VoiceAssistantProps {
  jobs: Job[];
  transactions: Transaction[];
}

export default function VoiceAssistant({ jobs, transactions }: VoiceAssistantProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  // Initialize Gemini
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  const stopSpeaking = useCallback(() => {
    if (audioSourceRef.current) {
      audioSourceRef.current.stop();
      audioSourceRef.current = null;
    }
    setIsSpeaking(false);
    setStatus(null);
  }, []);

  const startRecording = async () => {
    try {
      stopSpeaking();
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        processVoiceQuery(audioBlob);
        // Stop all tracks to release the microphone
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setStatus('Listening...');
    } catch (err) {
      console.error('Error accessing microphone:', err);
      setError('Microphone access denied');
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setStatus('Processing...');
    }
  };

  const processVoiceQuery = async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      // Convert blob to base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        
        // Prepare context data for Gemini
        const contextData = {
          currentDate: format(new Date(), 'yyyy-MM-dd EEEE'),
          jobs: jobs.map(j => ({
            title: j.title,
            date: j.date,
            time: j.startTime,
            category: j.category,
            completed: j.isCompleted,
            earning: j.hasEarning ? j.earningAmount : 0
          })),
          transactions: transactions.map(t => ({
            title: t.title,
            amount: t.amount,
            type: t.type,
            date: t.date
          }))
        };

        const prompt = `
          You are a helpful voice assistant for a job tracker app. 
          The user is asking a question about their data.
          Current Date: ${contextData.currentDate}
          Data Context: ${JSON.stringify(contextData)}
          
          Instructions:
          1. Answer the user's question accurately based on the provided data.
          2. If they ask in Kannada, answer in Kannada. If in English, answer in English.
          3. Keep the answer concise and natural for voice response.
          4. If they ask about "next job", find the earliest upcoming job from today onwards.
          5. If they ask about earnings, sum up the earnings for the requested period.
        `;

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: [
            { text: prompt },
            { inlineData: { data: base64Audio, mimeType: 'audio/webm' } }
          ]
        });

        const answerText = response.text;
        if (answerText) {
          setStatus('Speaking...');
          await speakResponse(answerText);
        } else {
          setStatus(null);
        }
      };
    } catch (err) {
      console.error('Error processing voice query:', err);
      setError('Failed to process voice');
      setStatus(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const speakResponse = async (text: string) => {
    try {
      setIsSpeaking(true);
      const ttsResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' } // Natural sounding voice
            }
          }
        }
      });

      const audioData = ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (audioData) {
        const audioBuffer = Buffer.from(audioData, 'base64');
        
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        
        const decodedBuffer = await audioContextRef.current.decodeAudioData(audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength));
        const source = audioContextRef.current.createBufferSource();
        source.buffer = decodedBuffer;
        source.connect(audioContextRef.current.destination);
        source.onended = () => {
          setIsSpeaking(false);
          setStatus(null);
        };
        audioSourceRef.current = source;
        source.start(0);
      }
    } catch (err) {
      console.error('Error speaking response:', err);
      // Fallback to text display if TTS fails
      setStatus(text);
      setTimeout(() => setStatus(null), 5000);
      setIsSpeaking(false);
    }
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    longPressTimerRef.current = setTimeout(() => {
      startRecording();
    }, 200); // Short delay to distinguish from tap
  };

  const handleMouseUp = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    if (isRecording) {
      stopRecording();
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-3">
      {/* Status Bubble */}
      <AnimatePresence>
        {(status || error) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            className={`px-4 py-2 rounded-2xl shadow-xl border flex items-center gap-2 max-w-[250px] ${
              error ? 'bg-red-50 border-red-200 text-red-600' : 'bg-white border-stone-100 text-stone-800'
            }`}
          >
            {isProcessing ? (
              <Loader2 className="w-4 h-4 animate-spin text-orange-500" />
            ) : isSpeaking ? (
              <Volume2 className="w-4 h-4 text-green-500 animate-pulse" />
            ) : error ? (
              <AlertCircle className="w-4 h-4" />
            ) : null}
            <span className="text-xs font-bold truncate">{error || status}</span>
            {(error || isSpeaking) && (
              <button onClick={() => { setError(null); stopSpeaking(); }} className="ml-1 p-0.5 hover:bg-stone-100 rounded-full">
                <X className="w-3 h-3" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mic Button */}
      <motion.button
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchEnd={handleMouseUp}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        className={`w-16 h-16 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 relative ${
          isRecording 
            ? 'bg-red-500 text-white ring-8 ring-red-100' 
            : isProcessing 
              ? 'bg-orange-500 text-white' 
              : 'bg-stone-900 text-white hover:bg-black'
        }`}
      >
        {isRecording && (
          <motion.div
            initial={{ scale: 1 }}
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ repeat: Infinity, duration: 1 }}
            className="absolute inset-0 rounded-full bg-red-500 opacity-20"
          />
        )}
        {isProcessing ? (
          <Loader2 className="w-8 h-8 animate-spin" />
        ) : (
          <Mic className={`w-8 h-8 ${isRecording ? 'animate-pulse' : ''}`} />
        )}
      </motion.button>
      
      {/* Tooltip hint */}
      {!isRecording && !isProcessing && !isSpeaking && !status && (
        <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 bg-white/80 px-2 py-1 rounded-full shadow-sm border border-stone-100">
          Hold to ask
        </span>
      )}
    </div>
  );
}
