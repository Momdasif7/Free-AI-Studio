import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
  Square, History, Wand2, Mic2, Maximize2, Minimize2, 
  Zap, Upload, Plus, X, Trash2, Volume2, Save, Download,
  Settings, Play, RefreshCw, Layers, Check, Copy, Share2
} from 'lucide-react';
import { GoogleGenAI, Modality } from "@google/genai";

// --- Types & Interfaces ---

interface VoiceOption {
  voice: SpeechSynthesisVoice | null;
  name: string;
  lang: string;
  isCloned?: boolean;
}

interface HistoryItem {
  id: string;
  text: string;
  timestamp: number;
  voiceName: string;
}

interface ClonedVoice {
  id: string;
  name: string;
  sampleBase64: string;
  mimeType: string;
}

// --- Audio Utilities ---

function decodeBase64(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  // Assuming raw PCM 16-bit for Gemini audio output
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

// --- Sub-Components ---

const Visualizer: React.FC<{ isPlaying: boolean }> = ({ isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let bars = Array.from({ length: 12 }, () => Math.random() * 8 + 2);

    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const barWidth = canvas.width / bars.length - 2;
      
      bars.forEach((h, i) => {
        const targetH = isPlaying ? Math.random() * 18 + 4 : 2;
        bars[i] += (targetH - bars[i]) * 0.15;
        
        ctx.fillStyle = isPlaying ? '#6366f1' : '#cbd5e1';
        ctx.beginPath();
        ctx.roundRect(i * (barWidth + 2), (canvas.height - bars[i]) / 2, barWidth, bars[i], 1.5);
        ctx.fill();
      });

      animationId = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animationId);
  }, [isPlaying]);

  return <canvas ref={canvasRef} width={50} height={20} className="opacity-70" />;
};

const CloneVoiceModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onSave: (voice: ClonedVoice) => void;
}> = ({ isOpen, onClose, onSave }) => {
  const [name, setName] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!name || !audioFile) return;
    setIsProcessing(true);

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      onSave({
        id: crypto.randomUUID(),
        name,
        sampleBase64: base64,
        mimeType: audioFile.type
      });
      setIsProcessing(false);
      setName('');
      setAudioFile(null);
      onClose();
    };
    reader.readAsDataURL(audioFile);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Mic2 className="text-indigo-600" size={24} />
            Voice Identity Clone
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><X size={20} /></button>
        </div>
        
        <div className="space-y-5">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Voice Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Digital Persona"
              className="w-full h-12 px-4 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 ring-indigo-500/20 outline-none font-medium transition-all"
            />
          </div>

          <div className="relative group">
            <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">Audio Sample (MP3/WAV)</label>
            <div className={`h-32 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all ${audioFile ? 'border-indigo-400 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-400'}`}>
              <input 
                type="file" 
                accept="audio/*" 
                onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              {audioFile ? (
                <div className="text-center">
                  <Check className="text-indigo-600 mx-auto mb-1" size={24} />
                  <p className="text-sm font-bold text-indigo-700">{audioFile.name}</p>
                </div>
              ) : (
                <div className="text-center">
                  <Upload className="text-slate-300 group-hover:text-indigo-400 mx-auto mb-1" size={32} />
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Click to upload voice sample</p>
                </div>
              )}
            </div>
          </div>

          <button 
            onClick={handleSubmit}
            disabled={!name || !audioFile || isProcessing}
            className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-black shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
          >
            {isProcessing ? <RefreshCw className="animate-spin" size={18} /> : <Zap size={18} />}
            {isProcessing ? 'CALIBRATING...' : 'CREATE AI PROFILE'}
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Main App Component ---

export default function App() {
  const [text, setText] = useState('');
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [clonedVoices, setClonedVoices] = useState<ClonedVoice[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [rate, setRate] = useState(1);
  const [pitch, setPitch] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [status, setStatus] = useState('Ready');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);

  const synthRef = useRef<SpeechSynthesis | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis;
      const loadVoices = () => {
        const availableVoices = window.speechSynthesis.getVoices();
        const filtered = availableVoices
          .map(v => ({ voice: v, name: v.name, lang: v.lang }))
          .sort((a, b) => a.name.localeCompare(b.name));
        
        setVoices(filtered);
        if (filtered.length > 0 && !selectedVoice) {
          const preferred = filtered.find(v => v.lang.startsWith('en-US')) || filtered[0];
          setSelectedVoice(preferred.name);
        }
      };
      
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    const savedHistory = localStorage.getItem('voice_studio_v2_history');
    if (savedHistory) setHistory(JSON.parse(savedHistory));
    const savedClones = localStorage.getItem('voice_studio_v2_clones');
    if (savedClones) setClonedVoices(JSON.parse(savedClones));
  }, []);

  const handleStop = useCallback(() => {
    if (synthRef.current) synthRef.current.cancel();
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.stop(); } catch (e) {}
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
    setStatus('Ready');
  }, []);

  const addToHistory = (txt: string, voice: string) => {
    const newItem: HistoryItem = {
      id: Math.random().toString(36).substring(7),
      text: txt,
      voiceName: voice,
      timestamp: Date.now()
    };
    const updated = [newItem, ...history.slice(0, 19)];
    setHistory(updated);
    localStorage.setItem('voice_studio_v2_history', JSON.stringify(updated));
  };

  const handleGenerate = async () => {
    if (!text.trim()) return;
    handleStop();

    const clone = clonedVoices.find(v => v.name === selectedVoice);
    
    if (clone) {
      setStatus('AI Synthesizing...');
      setIsPlaying(true);
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-native-audio-preview-12-2025',
          contents: {
            parts: [
              { inlineData: { data: clone.sampleBase64, mimeType: clone.mimeType } },
              { text: `Synthesize this text using the provided voice identity exactly. Output raw audio only: "${text}"` }
            ]
          },
          config: { responseModalities: [Modality.AUDIO] }
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
          if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
          }
          const ctx = audioContextRef.current;
          if (ctx.state === 'suspended') await ctx.resume();
          
          const audioData = decodeBase64(base64Audio);
          const buffer = await decodeAudioData(audioData, ctx, 24000, 1);
          
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.onended = () => {
            setIsPlaying(false);
            setStatus('Complete');
          };
          source.start();
          sourceNodeRef.current = source;
          addToHistory(text, `Clone: ${clone.name}`);
        }
      } catch (err) {
        console.error('AI Synthesis error:', err);
        setStatus('Engine Error');
        setIsPlaying(false);
      }
      return;
    }

    if (!synthRef.current) return;
    const utterance = new SpeechSynthesisUtterance(text);
    const targetVoice = voices.find(v => v.name === selectedVoice)?.voice;
    if (targetVoice) utterance.voice = targetVoice;
    utterance.rate = rate;
    utterance.pitch = pitch;

    utterance.onstart = () => {
      setIsPlaying(true);
      setStatus('Speaking...');
      addToHistory(text, selectedVoice);
    };
    utterance.onend = () => {
      setIsPlaying(false);
      setStatus('Complete');
    };
    utterance.onerror = () => {
      setStatus('Error');
      setIsPlaying(false);
    };

    synthRef.current.speak(utterance);
  };

  const allVoiceOptions = useMemo(() => {
    const combined = [...voices];
    clonedVoices.forEach(cv => {
      combined.unshift({ voice: null, name: cv.name, lang: 'Digital Clone', isCloned: true });
    });
    return combined;
  }, [voices, clonedVoices]);

  return (
    <div className={`min-h-screen flex flex-col transition-all duration-500 ${isFocusMode ? 'bg-slate-950' : 'bg-slate-50'}`}>
      
      {/* Navbar */}
      <nav className={`h-16 px-6 flex items-center justify-between glass sticky top-0 z-50 transition-all ${isFocusMode ? 'opacity-0 -translate-y-full pointer-events-none' : 'opacity-100'}`}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
            <Layers size={18} />
          </div>
          <h1 className="text-sm font-black tracking-tight uppercase text-slate-800">Voice Studio <span className="text-indigo-600">AI</span></h1>
        </div>
        
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsCloneModalOpen(true)}
            className="px-3 py-1.5 bg-white border border-indigo-100 text-indigo-600 rounded-lg text-[11px] font-black flex items-center gap-1.5 hover:bg-indigo-50 transition-all shadow-sm"
          >
            <Plus size={14} /> CLONE VOICE
          </button>
          <button onClick={() => setIsSidebarOpen(true)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <History size={18} />
          </button>
        </div>
      </nav>

      {/* Main Container */}
      <main className="flex-grow max-w-5xl w-full mx-auto p-6 md:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Editor Area */}
        <div className="lg:col-span-8 space-y-6">
          <div className={`bg-white border rounded-[2rem] shadow-pro overflow-hidden transition-all duration-500 ${isFocusMode ? 'border-slate-800 bg-slate-900 ring-4 ring-indigo-500/10' : 'border-slate-100'}`}>
            <div className="p-4 border-b flex items-center justify-between border-slate-50">
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${isPlaying ? 'bg-indigo-500 animate-pulse' : 'bg-slate-200'}`}></div>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{status}</span>
              </div>
              <div className="flex items-center gap-3">
                <Visualizer isPlaying={isPlaying} />
                <button 
                  onClick={() => setIsFocusMode(!isFocusMode)}
                  className="p-2 hover:bg-slate-50 rounded-lg text-slate-400"
                >
                  {isFocusMode ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                </button>
              </div>
            </div>
            
            <textarea 
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste text or type a script..."
              className={`w-full h-80 p-8 text-lg font-medium resize-none border-none focus:ring-0 outline-none placeholder:text-slate-200 transition-colors ${isFocusMode ? 'bg-slate-900 text-slate-100' : 'text-slate-800'}`}
            />

            <div className="p-6 border-t border-slate-50 bg-slate-50/30 flex items-center gap-4">
              <button 
                onClick={handleGenerate}
                disabled={!text.trim() || isPlaying}
                className="flex-grow h-14 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl font-black text-xs shadow-lg shadow-indigo-100 transition-all active:scale-[0.98] flex items-center justify-center gap-2 tracking-widest"
              >
                {isPlaying ? <RefreshCw className="animate-spin" size={16} /> : <Play fill="currentColor" size={16} />}
                {isPlaying ? 'ENGINE ACTIVE...' : 'GENERATE AUDIO'}
              </button>
              <button 
                onClick={handleStop}
                className="w-14 h-14 border border-slate-200 rounded-2xl flex items-center justify-center text-slate-300 hover:bg-white hover:text-red-500 transition-all active:scale-95"
              >
                <Square size={20} fill="currentColor" />
              </button>
            </div>
          </div>
        </div>

        {/* Control Panel */}
        <div className={`lg:col-span-4 space-y-4 transition-all duration-500 ${isFocusMode ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-100'}`}>
          <div className="bg-white p-6 border border-slate-100 rounded-3xl shadow-pro space-y-6">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <Settings size={12} /> Configuration
            </h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Voice Profile</label>
                <select 
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  className="w-full h-11 px-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-[11px] outline-none focus:ring-2 ring-indigo-500/10 cursor-pointer transition-all"
                >
                  {allVoiceOptions.map(v => (
                    <option key={v.name} value={v.name}>{v.isCloned ? '✨ Clone: ' : ''}{v.name}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Speed</label>
                  <span className="text-[10px] font-black text-indigo-600">{rate.toFixed(1)}x</span>
                </div>
                <input 
                  type="range" 
                  min="0.5" max="2" step="0.1" 
                  value={rate} 
                  onChange={(e) => setRate(parseFloat(e.target.value))}
                  className="w-full h-1.5 appearance-none bg-slate-100 rounded-lg cursor-pointer accent-indigo-600" 
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[10px] font-black text-slate-400 uppercase">Pitch</label>
                  <span className="text-[10px] font-black text-indigo-600">{pitch.toFixed(1)}</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="2" step="0.1" 
                  value={pitch} 
                  onChange={(e) => setPitch(parseFloat(e.target.value))}
                  className="w-full h-1.5 appearance-none bg-slate-100 rounded-lg cursor-pointer accent-indigo-600" 
                />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 p-6 rounded-3xl text-white shadow-xl shadow-indigo-100 relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform">
              <Wand2 size={96} />
            </div>
            <h4 className="font-black text-sm mb-1 flex items-center gap-2">
              <Zap size={14} className="text-yellow-400" /> Neural Engine
            </h4>
            <p className="text-[10px] leading-relaxed opacity-70 font-medium">
              Native browser voices provide unlimited free generation. Cloned voices use advanced Gemini-2.5-Flash for high-fidelity mirroring.
            </p>
          </div>
        </div>
      </main>

      {/* History Drawer */}
      <div className={`fixed inset-y-0 right-0 w-80 bg-white shadow-2xl z-[150] transition-transform duration-300 border-l border-slate-100 ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="h-full flex flex-col p-6">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2 uppercase tracking-tight">
              <History size={16} className="text-indigo-600" /> Script Archive
            </h3>
            <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-slate-50 rounded-lg"><X size={18} /></button>
          </div>
          <div className="flex-grow overflow-y-auto space-y-3">
            {history.length === 0 ? (
              <p className="text-center py-20 text-[10px] font-bold text-slate-300 uppercase">Vault empty</p>
            ) : (
              history.map((item) => (
                <div 
                  key={item.id} 
                  className="group p-4 rounded-2xl border border-slate-50 hover:border-indigo-100 hover:bg-indigo-50/20 transition-all cursor-pointer relative"
                  onClick={() => { setText(item.text); setSelectedVoice(item.voiceName); setIsSidebarOpen(false); }}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] font-bold text-slate-300 uppercase">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </span>
                    <button 
                      onClick={(e) => { e.stopPropagation(); setHistory(prev => prev.filter(h => h.id !== item.id)); }}
                      className="text-slate-200 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                  <p className="text-[11px] font-bold text-slate-700 line-clamp-2">{item.text}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <CloneVoiceModal 
        isOpen={isCloneModalOpen} 
        onClose={() => setIsCloneModalOpen(false)} 
        onSave={(v) => {
          setClonedVoices(prev => [v, ...prev]);
          setSelectedVoice(v.name);
          setStatus('Voice Ready');
        }}
      />
    </div>
  );
}