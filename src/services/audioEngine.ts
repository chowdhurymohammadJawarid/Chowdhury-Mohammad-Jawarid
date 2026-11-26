import { ActivationSettings, VoiceSettings } from '../types/ultron';

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

export class UltronAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private currentAudioSource: AudioBufferSourceNode | null = null;

  // Mic & Three-clap state
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micBandpass: BiquadFilterNode | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private clapRafId = 0;
  private noiseFloor = 0.015;
  private lastClapTime = 0;
  private clapTimestamps: number[] = [];
  private wasAboveThreshold = false;

  // Speech Recognition
  private recognition: SpeechRecognitionLike | null = null;
  private recognitionRunning = false;
  private shouldKeepListening = false;
  private awakeUntil = 0;

  // MediaRecorder fallback
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];

  private outputFreqData = new Uint8Array(64);
  private micTimeData = new Float32Array(1024);

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.85;
      this.outputAnalyser = this.ctx.createAnalyser();
      this.outputAnalyser.fftSize = 128;
      this.masterGain.connect(this.outputAnalyser);
      this.outputAnalyser.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public setMasterVolume(volume: number): void {
    const ctx = this.ensureContext();
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(Math.max(0, Math.min(1, volume)), ctx.currentTime, 0.03);
    }
  }

  public playChime(type: 'activate' | 'confirm' | 'alert' | 'halt'): void {
    try {
      const ctx = this.ensureContext();
      if (!this.masterGain) return;
      const now = ctx.currentTime;

      const freqs =
        type === 'activate'
          ? [523.25, 783.99, 1046.5]
          : type === 'confirm'
          ? [659.25, 880]
          : type === 'halt'
          ? [320, 210]
          : [440, 349.23];

      freqs.forEach((f, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type === 'halt' ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(f, now + idx * 0.065);
        gain.gain.setValueAtTime(0.0001, now + idx * 0.065);
        gain.gain.exponentialRampToValueAtTime(0.14, now + idx * 0.065 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.065 + 0.24);
        osc.connect(gain);
        gain.connect(this.masterGain!);
        osc.start(now + idx * 0.065);
        osc.stop(now + idx * 0.065 + 0.26);
      });
    } catch {
      // AudioContext blocked prior to user gesture
    }
  }

  public getOutputLevel(): number {
    if (!this.outputAnalyser) return 0;
    this.outputAnalyser.getByteFrequencyData(this.outputFreqData);
    let sum = 0;
    for (let i = 0; i < this.outputFreqData.length; i++) {
      sum += this.outputFreqData[i];
    }
    return Math.min(1, sum / (this.outputFreqData.length * 140));
  }

  public getOutputSpectrum(targetBars: number = 24): number[] {
    if (!this.outputAnalyser) return new Array(targetBars).fill(0.05);
    this.outputAnalyser.getByteFrequencyData(this.outputFreqData);
    const result: number[] = [];
    const step = Math.max(1, Math.floor(this.outputFreqData.length / targetBars));
    for (let i = 0; i < targetBars; i++) {
      const val = this.outputFreqData[Math.min(this.outputFreqData.length - 1, i * step)] / 255;
      result.push(Math.max(0.06, val));
    }
    return result;
  }

  public stopSpeech(): void {
    if (this.currentAudioSource) {
      try {
        this.currentAudioSource.stop();
      } catch {
        // already stopped
      }
      this.currentAudioSource = null;
    }
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  public getBrowserFemaleVoices(): SpeechSynthesisVoice[] {
    if (!('speechSynthesis' in window)) return [];
    const all = window.speechSynthesis.getVoices();
    const femaleHints = /female|zira|aria|jenny|samantha|victoria|karen|moira|tessa|fiona|google uk english female|google us english/i;
    const filtered = all.filter((v) => femaleHints.test(v.name));
    return filtered.length > 0 ? filtered : all;
  }

  public async speak(
    text: string,
    settings: VoiceSettings,
    onStart?: () => void,
    onEnd?: () => void
  ): Promise<void> {
    this.stopSpeech();
    this.setMasterVolume(settings.volume);

    if (settings.engine === 'gemini') {
      try {
        const res = await fetch('/api/ai/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            voice: settings.geminiVoice,
            tone: settings.tone,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { base64Wav: string };
          if (data.base64Wav) {
            await this.playBase64Wav(data.base64Wav, settings.rate, onStart, onEnd);
            return;
          }
        }
      } catch {
        // Fallback to browser female voice cleanly
      }
    }

    this.speakBrowser(text, settings, onStart, onEnd);
  }

  private async playBase64Wav(
    base64Wav: string,
    rate: number,
    onStart?: () => void,
    onEnd?: () => void
  ): Promise<void> {
    const ctx = this.ensureContext();
    const binary = atob(base64Wav);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const audioBuffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = Math.max(0.75, Math.min(1.4, rate));
    if (this.masterGain) {
      source.connect(this.masterGain);
    } else {
      source.connect(ctx.destination);
    }
    this.currentAudioSource = source;
    onStart?.();
    source.onended = () => {
      if (this.currentAudioSource === source) {
        this.currentAudioSource = null;
      }
      onEnd?.();
    };
    source.start(0);
  }

  private speakBrowser(
    text: string,
    settings: VoiceSettings,
    onStart?: () => void,
    onEnd?: () => void
  ): void {
    if (!('speechSynthesis' in window)) {
      onStart?.();
      setTimeout(() => onEnd?.(), Math.min(3500, text.length * 45));
      return;
    }

    const utter = new SpeechSynthesisUtterance(text);
    const voices = this.getBrowserFemaleVoices();
    const chosen =
      voices.find((v) => v.voiceURI === settings.browserVoiceUri) || voices[0];
    if (chosen) {
      utter.voice = chosen;
    }
    utter.pitch = settings.pitch;
    utter.rate = settings.rate;
    utter.volume = settings.volume;

    utter.onstart = () => onStart?.();
    utter.onend = () => onEnd?.();
    utter.onerror = () => onEnd?.();
    window.speechSynthesis.speak(utter);
  }

  public async startMicrophoneMonitor(
    getSettings: () => ActivationSettings,
    callbacks: {
      onTelemetry: (data: { inputLevel: number; noiseFloor: number; clapCount: number }) => void;
      onThreeClaps: () => void;
      onError: (msg: string) => void;
    }
  ): Promise<boolean> {
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        callbacks.onError('Microphone capture is unavailable in this browser.');
        return false;
      }
      const ctx = this.ensureContext();
      if (!this.micStream) {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: false,
          },
        });
      }

      if (!this.micSource) {
        this.micSource = ctx.createMediaStreamSource(this.micStream);
        this.micBandpass = ctx.createBiquadFilter();
        this.micBandpass.type = 'bandpass';
        this.micBandpass.frequency.value = 1900;
        this.micBandpass.Q.value = 1.1;

        this.micAnalyser = ctx.createAnalyser();
        this.micAnalyser.fftSize = 1024;

        this.micSource.connect(this.micBandpass);
        this.micBandpass.connect(this.micAnalyser);
      }

      if (this.clapRafId) cancelAnimationFrame(this.clapRafId);

      const tick = () => {
        const cfg = getSettings();
        if (!this.micAnalyser || cfg.micMuted) {
          callbacks.onTelemetry({ inputLevel: 0, noiseFloor: this.noiseFloor, clapCount: 0 });
          this.clapRafId = requestAnimationFrame(tick);
          return;
        }

        this.micAnalyser.getFloatTimeDomainData(this.micTimeData);
        let peak = 0;
        let sumSq = 0;
        for (let i = 0; i < this.micTimeData.length; i++) {
          const v = Math.abs(this.micTimeData[i]);
          if (v > peak) peak = v;
          sumSq += v * v;
        }
        const rms = Math.sqrt(sumSq / this.micTimeData.length);
        const now = performance.now();

        // Expire stale claps (> 950ms since last clap)
        if (this.clapTimestamps.length > 0 && now - this.clapTimestamps[this.clapTimestamps.length - 1] > 950) {
          this.clapTimestamps = [];
        }

        if (cfg.clapEnabled) {
          const threshold = Math.max(
            cfg.noiseFilterThreshold,
            this.noiseFloor * (4.2 - cfg.clapSensitivity * 0.7)
          );

          const isSharpTransient = peak > threshold && peak > rms * 2.1;

          if (isSharpTransient && !this.wasAboveThreshold) {
            if (now - this.lastClapTime > 150) {
              this.lastClapTime = now;
              this.clapTimestamps.push(now);
              if (this.clapTimestamps.length >= 3) {
                const first = this.clapTimestamps[this.clapTimestamps.length - 3];
                const third = this.clapTimestamps[this.clapTimestamps.length - 1];
                const span = third - first;
                if (span >= 320 && span <= 2100) {
                  this.clapTimestamps = [];
                  this.playChime('activate');
                  callbacks.onThreeClaps();
                } else {
                  this.clapTimestamps = [third];
                }
              }
            }
          }
          this.wasAboveThreshold = isSharpTransient;
        }

        // Slowly adapt noise floor only when not peaking
        if (rms < this.noiseFloor * 2.5) {
          this.noiseFloor = this.noiseFloor * 0.96 + rms * 0.04;
        }

        callbacks.onTelemetry({
          inputLevel: Math.min(1, peak * 2.2),
          noiseFloor: this.noiseFloor,
          clapCount: this.clapTimestamps.length,
        });

        this.clapRafId = requestAnimationFrame(tick);
      };

      this.clapRafId = requestAnimationFrame(tick);
      return true;
    } catch (err) {
      callbacks.onError(err instanceof Error ? err.message : 'Microphone permission denied.');
      return false;
    }
  }

  public stopMicrophoneMonitor(): void {
    if (this.clapRafId) {
      cancelAnimationFrame(this.clapRafId);
      this.clapRafId = 0;
    }
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    this.micSource = null;
    this.micBandpass = null;
    this.micAnalyser = null;
  }

  public supportsSpeechRecognition(): boolean {
    return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  public startWakeWordListener(
    getSettings: () => ActivationSettings,
    callbacks: {
      onWakeWord: (phrase: string) => void;
      onCommandTranscript: (transcript: string) => void;
      onInterim: (text: string) => void;
      onStatusChange: (active: boolean) => void;
    }
  ): void {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      callbacks.onStatusChange(false);
      return;
    }

    this.shouldKeepListening = true;
    if (this.recognitionRunning) return;

    const rec = new SpeechRec();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    this.recognition = rec;

    rec.onresult = (event) => {
      const cfg = getSettings();
      if (cfg.micMuted) return;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const raw = res[0]?.transcript?.trim() || '';
        if (!raw) continue;

        if (!res.isFinal) {
          callbacks.onInterim(raw);
          continue;
        }

        const lower = raw.toLowerCase();
        const matchedWake = cfg.wakePhrases.find((p) => lower.includes(p.toLowerCase()));

        if (cfg.wakeWordEnabled && matchedWake) {
          this.playChime('activate');
          this.awakeUntil = Date.now() + 12000;
          callbacks.onWakeWord(matchedWake);

          // Check if user already spoke a full command right after the wake phrase
          const stripped = raw
            .replace(new RegExp(`^.*?\\b${matchedWake.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[,:\\s]*`, 'i'), '')
            .trim();
          if (stripped.length > 2) {
            callbacks.onCommandTranscript(stripped);
            this.awakeUntil = 0;
          }
        } else if (Date.now() < this.awakeUntil || !cfg.wakeWordEnabled) {
          this.awakeUntil = 0;
          callbacks.onCommandTranscript(raw);
        }
      }
    };

    rec.onerror = () => {
      this.recognitionRunning = false;
      callbacks.onStatusChange(false);
    };

    rec.onend = () => {
      this.recognitionRunning = false;
      if (this.shouldKeepListening && !getSettings().micMuted) {
        setTimeout(() => {
          if (this.shouldKeepListening && !this.recognitionRunning) {
            try {
              rec.start();
              this.recognitionRunning = true;
              callbacks.onStatusChange(true);
            } catch {
              callbacks.onStatusChange(false);
            }
          }
        }, 350);
      } else {
        callbacks.onStatusChange(false);
      }
    };

    try {
      rec.start();
      this.recognitionRunning = true;
      callbacks.onStatusChange(true);
    } catch {
      this.recognitionRunning = false;
      callbacks.onStatusChange(false);
    }
  }

  public triggerManualListenWindow(): void {
    this.awakeUntil = Date.now() + 14000;
    this.playChime('activate');
  }

  public stopWakeWordListener(): void {
    this.shouldKeepListening = false;
    if (this.recognition && this.recognitionRunning) {
      try {
        this.recognition.stop();
      } catch {
        // ignore
      }
    }
    this.recognitionRunning = false;
  }

  public async recordFallbackCommandClip(durationMs: number = 4500): Promise<string> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Microphone unavailable.');
    }
    const stream = this.micStream || (await navigator.mediaDevices.getUserMedia({ audio: true }));
    this.recordedChunks = [];
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
    const recorder = new MediaRecorder(stream, { mimeType });
    this.mediaRecorder = recorder;

    return new Promise((resolve, reject) => {
      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) this.recordedChunks.push(ev.data);
      };
      recorder.onerror = () => reject(new Error('Audio recording failed.'));
      recorder.onstop = async () => {
        try {
          const blob = new Blob(this.recordedChunks, { type: mimeType });
          const buf = await blob.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let binary = '';
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          const res = await fetch('/api/ai/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: base64, mimeType }),
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Transcription failed' }));
            reject(new Error(err.error || 'Transcription failed'));
            return;
          }
          const data = (await res.json()) as { transcript: string };
          resolve(data.transcript || '');
        } catch (err) {
          reject(err);
        }
      };

      recorder.start();
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, durationMs);
    });
  }

  public dispose(): void {
    this.stopSpeech();
    this.stopWakeWordListener();
    this.stopMicrophoneMonitor();
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
    }
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}
