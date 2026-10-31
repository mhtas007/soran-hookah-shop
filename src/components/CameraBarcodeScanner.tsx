import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, RefreshCw, Zap, AlertCircle } from 'lucide-react';

interface CameraBarcodeScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (barcode: string) => void;
  title?: string;
}

export const CameraBarcodeScanner: React.FC<CameraBarcodeScannerProps> = ({
  isOpen,
  onClose,
  onScan,
  title = 'سکانکردنی بارکۆد بە کامێرا'
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchOn, setTorchOn] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, facingMode]);

  const startCamera = async () => {
    stopCamera();
    setErrorMsg(null);
    setHasPermission(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('کامێرا لەسەر ئەم وێبگەڕە پشتگیری ناکرێت.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: facingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        await videoRef.current.play();
        setHasPermission(true);
        setIsScanning(true);
        startScanningLoop();
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setHasPermission(false);
      setErrorMsg(err.message || 'نەتوانرا دەستگەیشتن بە کامێرا پەیدا بکرێت. تکایە مۆڵەتی کامێرا بدە.');
    }
  };

  const stopCamera = () => {
    setIsScanning(false);
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const toggleTorch = async () => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const capabilities: any = track.getCapabilities?.() || {};
      if (capabilities.torch) {
        const nextTorch = !torchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextTorch }]
        });
        setTorchOn(nextTorch);
      } else {
        alert('فللاش لەسەر ئەم کامێرایە بەردەست نییە');
      }
    } catch (e) {
      console.warn('Torch toggle not supported', e);
    }
  };

  const playSuccessBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5 note
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);

      if (navigator.vibrate) {
        navigator.vibrate(80);
      }
    } catch (e) {
      // Audio context might be restricted before user gesture
    }
  };

  const startScanningLoop = () => {
    // Check if BarcodeDetector is available natively in browser
    const BarcodeDetectorClass = (window as any).BarcodeDetector;
    let detector: any = null;

    if (BarcodeDetectorClass) {
      try {
        detector = new BarcodeDetectorClass({
          formats: ['code_128', 'code_39', 'ean_13', 'ean_8', 'qr_code', 'upc_a', 'upc_e']
        });
      } catch (e) {
        console.warn('BarcodeDetector init error:', e);
      }
    }

    const scanFrame = async () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        animFrameRef.current = requestAnimationFrame(scanFrame);
        return;
      }

      if (detector) {
        try {
          const barcodes = await detector.detect(videoRef.current);
          if (barcodes && barcodes.length > 0) {
            const raw = barcodes[0].rawValue;
            if (raw) {
              playSuccessBeep();
              onScan(raw);
              onClose();
              return;
            }
          }
        } catch (e) {
          // Frame detection error, continue
        }
      }

      animFrameRef.current = requestAnimationFrame(scanFrame);
    };

    animFrameRef.current = requestAnimationFrame(scanFrame);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      playSuccessBeep();
      onScan(manualCode.trim());
      setManualCode('');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md z-[200] flex items-center justify-center p-4 animate-in select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col text-white">
        
        {/* Header */}
        <div className="px-5 py-4 bg-slate-950/60 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">{title}</h3>
              <p className="text-[10px] text-slate-400">کامێرا ڕێکبخە لەسەر بارکۆد یان وەسڵ</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setFacingMode(prev => prev === 'environment' ? 'user' : 'environment')}
              className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
              title="گۆڕینی کامێرا (پێشەوە / دواوە)"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            <button
              onClick={toggleTorch}
              className={`p-2 rounded-xl transition-colors ${torchOn ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700'}`}
              title="داگیرساندنی فلاش"
            >
              <Zap className="w-4 h-4" />
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video Viewport Area */}
        <div className="relative w-full aspect-[4/3] bg-black overflow-hidden flex items-center justify-center">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            playsInline
            muted
          />

          {/* Scanner Overlay UI */}
          {hasPermission && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6">
              
              {/* Target Scan Box */}
              <div className="relative w-64 h-40 border-2 border-cyan-500/40 rounded-2xl overflow-hidden backdrop-brightness-110 shadow-[0_0_50px_rgba(6,182,212,0.15)]">
                
                {/* Laser scan line */}
                <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_8px_#22d3ee] animate-pulse top-1/2 -translate-y-1/2"></div>
                
                {/* 4 Corner Markers */}
                <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-cyan-400"></div>
                <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-cyan-400"></div>
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-cyan-400"></div>
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-cyan-400"></div>
              </div>

              <span className="text-[11px] font-bold text-cyan-200 mt-3 bg-slate-950/70 px-3 py-1 rounded-full border border-cyan-500/20 backdrop-blur-sm">
                بارکۆد لە ناو چوارگۆشەکە دابنێ
              </span>
            </div>
          )}

          {/* Error / Permission Denied */}
          {hasPermission === false && (
            <div className="absolute inset-0 p-6 flex flex-col items-center justify-center text-center bg-slate-950/90 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30">
                <AlertCircle className="w-6 h-6" />
              </div>
              <p className="text-xs text-rose-300 font-bold max-w-xs">{errorMsg}</p>
              <button
                onClick={startCamera}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all border border-slate-700"
              >
                دووبارە هەوڵبدەرەوە
              </button>
            </div>
          )}
        </div>

        {/* Manual Barcode Input Fallback */}
        <div className="p-4 bg-slate-950 border-t border-slate-800">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={manualCode}
                onChange={e => setManualCode(e.target.value)}
                placeholder="یان ژمارەی بارکۆد / وەسڵ لێرە بنووسە..."
                className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-500 text-white px-3 py-2.5 rounded-xl text-xs font-mono outline-none"
                dir="ltr"
              />
            </div>
            <button
              type="submit"
              disabled={!manualCode.trim()}
              className="bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white px-4 py-2.5 rounded-xl text-xs font-black transition-all"
            >
              لێدان
            </button>
          </form>
        </div>

      </div>
    </div>
  );
};
