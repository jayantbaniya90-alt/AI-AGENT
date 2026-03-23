/* ============================================================
   VOICE.JS — Voice I/O System v3.1
   Speech Recognition + Speech Synthesis + Always-On Assistant
   Like Alexa/Siri — say "Hey Neural" to activate
   ============================================================ */

const VOICE_MOOD_PARAMS = {
    happy:    { rate: 1.0,  pitch: 1.1,  desc: 'Warm, natural' },
    curious:  { rate: 1.0,  pitch: 1.05, desc: 'Slightly rising at end' },
    excited:  { rate: 1.15, pitch: 1.2,  desc: 'Fast, enthusiastic' },
    bored:    { rate: 0.85, pitch: 0.9,  desc: 'Slow, flat' },
    stressed: { rate: 0.95, pitch: 1.15, desc: 'Slightly higher pitch' },
    tired:    { rate: 0.8,  pitch: 0.85, desc: 'Low and slow' },
    angry:    { rate: 0.95, pitch: 0.8,  desc: 'Firm, low' },
};

// Voice commands the network recognizes
const VOICE_COMMANDS = [
    { pattern: /^inject task\s+(.+)/i,        action: 'inject_task' },
    { pattern: /^trigger virus/i,              action: 'trigger_virus' },
    { pattern: /^cure virus/i,                 action: 'cure_virus' },
    { pattern: /^black hole\s+(on|off)/i,      action: 'blackhole' },
    { pattern: /^dream mode/i,                 action: 'dream_mode' },
    { pattern: /^rewind/i,                     action: 'rewind' },
    { pattern: /^add wormhole/i,               action: 'wormhole' },
    { pattern: /^breed\s+(.+)\s+(?:and|with)\s+(.+)/i, action: 'breed' },
    { pattern: /^reset network/i,              action: 'reset_network' },
    { pattern: /^switch to\s+(.+)/i,           action: 'switch_model' },
    { pattern: /^voice\s+(on|off)/i,           action: 'toggle_voice' },
    { pattern: /^network status/i,             action: 'network_status' },
    { pattern: /^stop listening/i,             action: 'stop_assistant' },
    { pattern: /^assistant off/i,              action: 'stop_assistant' },
];

// Wake words — what activates the assistant
const WAKE_WORDS = [
    /hey neural/i,
    /hey network/i,
    /ok neural/i,
    /hello network/i,
    /neural network/i,
];

class VoiceSystem {
    constructor() {
        this.recognition = null;
        this.synthesis = window.speechSynthesis || null;
        this.isListening = false;
        this.voiceOutputEnabled = true;
        this.isSpeaking = false;
        this.currentMood = 'happy';
        this.autoSend = true;
        this.lang = 'en-US';
        this.supported = {
            input: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
            output: !!window.speechSynthesis,
        };

        // Always-on assistant mode
        this.assistantMode = false;
        this.assistantRecognition = null;
        this.isAwake = false;
        this.awakeTimeout = null;
        this.awakeTimeoutMs = 10000; // Go back to sleep after 10s of no input

        this._onResult = null;
        this._onInterim = null;
        this._onError = null;
        this._onEnd = null;
        this._onWake = null;
        this._onSleep = null;

        if (this.supported.input) {
            this._initRecognition();
        }
    }

    _initRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = this.lang;

        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            if (interimTranscript && this._onInterim) {
                this._onInterim(interimTranscript);
            }
            if (finalTranscript && this._onResult) {
                this._onResult(finalTranscript.trim());
            }
        };

        this.recognition.onerror = (event) => {
            console.warn('Speech recognition error:', event.error);
            this.isListening = false;
            if (this._onError) this._onError(event.error);
        };

        this.recognition.onend = () => {
            this.isListening = false;
            if (this._onEnd) this._onEnd();
        };
    }

    // Set callbacks
    onResult(cb) { this._onResult = cb; }
    onInterim(cb) { this._onInterim = cb; }
    onError(cb) { this._onError = cb; }
    onEnd(cb) { this._onEnd = cb; }
    onWake(cb) { this._onWake = cb; }
    onSleep(cb) { this._onSleep = cb; }

    setLanguage(lang) {
        this.lang = lang;
        if (this.recognition) {
            this.recognition.lang = lang;
        }
        if (this.assistantRecognition) {
            this.assistantRecognition.lang = lang;
        }
    }

    startListening() {
        if (!this.supported.input || this.isListening) return false;
        try {
            this.recognition.lang = this.lang;
            this.recognition.start();
            this.isListening = true;
            return true;
        } catch (e) {
            console.warn('Could not start listening:', e);
            return false;
        }
    }

    stopListening() {
        if (!this.isListening) return;
        try {
            this.recognition.stop();
        } catch (e) { /* ignore */ }
        this.isListening = false;
    }

    // ── Always-On Assistant Mode ──────────────────────────────

    startAssistant() {
        if (!this.supported.input) {
            console.warn('Speech recognition not supported');
            return false;
        }

        this.assistantMode = true;
        this._startBackgroundListening();
        console.log('🎤 Voice assistant: ALWAYS-ON — Say "Hey Neural" to activate');
        return true;
    }

    stopAssistant() {
        this.assistantMode = false;
        this.isAwake = false;
        clearTimeout(this.awakeTimeout);

        if (this.assistantRecognition) {
            try {
                this.assistantRecognition.stop();
            } catch (e) { /* ignore */ }
        }

        if (this._onSleep) this._onSleep();
        console.log('🎤 Voice assistant: OFF');
    }

    _startBackgroundListening() {
        if (!this.assistantMode) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.assistantRecognition = new SpeechRecognition();
        this.assistantRecognition.continuous = true;
        this.assistantRecognition.interimResults = true;
        this.assistantRecognition.lang = this.lang;

        this.assistantRecognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }

            const textToCheck = (finalTranscript || interimTranscript).toLowerCase().trim();

            if (!this.isAwake) {
                // Check for wake word
                for (const wakePattern of WAKE_WORDS) {
                    if (wakePattern.test(textToCheck)) {
                        this._wakeUp();
                        // Play a wake sound via TTS
                        this.speak('Yes?', 'curious');
                        return;
                    }
                }
            } else {
                // We're awake — process the input
                if (interimTranscript && this._onInterim) {
                    this._onInterim(interimTranscript);
                }

                if (finalTranscript) {
                    // Strip the wake word from the beginning if present
                    let cleanedInput = finalTranscript.trim();
                    for (const wakePattern of WAKE_WORDS) {
                        cleanedInput = cleanedInput.replace(wakePattern, '').trim();
                    }

                    if (cleanedInput.length > 1) {
                        // Reset awake timeout
                        this._resetAwakeTimeout();

                        if (this._onResult) {
                            this._onResult(cleanedInput);
                        }
                    }
                }
            }
        };

        this.assistantRecognition.onerror = (event) => {
            if (event.error === 'no-speech' || event.error === 'aborted') {
                // Normal — restart listening
                if (this.assistantMode) {
                    setTimeout(() => this._restartBackgroundListening(), 300);
                }
                return;
            }
            console.warn('Assistant recognition error:', event.error);
        };

        this.assistantRecognition.onend = () => {
            // Always restart if in assistant mode
            if (this.assistantMode) {
                setTimeout(() => this._restartBackgroundListening(), 300);
            }
        };

        try {
            this.assistantRecognition.start();
        } catch (e) {
            console.warn('Could not start assistant recognition:', e);
            // Retry
            setTimeout(() => this._restartBackgroundListening(), 1000);
        }
    }

    _restartBackgroundListening() {
        if (!this.assistantMode) return;
        try {
            if (this.assistantRecognition) {
                this.assistantRecognition.stop();
            }
        } catch (e) { /* ignore */ }

        setTimeout(() => {
            if (this.assistantMode) {
                this._startBackgroundListening();
            }
        }, 200);
    }

    _wakeUp() {
        this.isAwake = true;
        if (this._onWake) this._onWake();
        this._resetAwakeTimeout();
        console.log('🎤 Assistant AWAKE — listening for command');
    }

    _resetAwakeTimeout() {
        clearTimeout(this.awakeTimeout);
        this.awakeTimeout = setTimeout(() => {
            this.isAwake = false;
            if (this._onSleep) this._onSleep();
            console.log('🎤 Assistant: going back to sleep (idle timeout)');
        }, this.awakeTimeoutMs);
    }

    // Check if input is a voice command
    parseVoiceCommand(input) {
        for (const cmd of VOICE_COMMANDS) {
            const match = input.match(cmd.pattern);
            if (match) {
                return { action: cmd.action, args: match.slice(1) };
            }
        }
        return null;
    }

    // Speak text with mood-adapted parameters
    speak(text, mood = 'happy') {
        if (!this.supported.output || !this.voiceOutputEnabled) return;
        this.currentMood = mood;

        // Cancel current speech
        this.synthesis.cancel();

        // Clean text for speech (remove markdown, emojis, brackets)
        const cleanText = this._cleanForSpeech(text);
        if (!cleanText || cleanText.length < 2) return;

        // Limit to 500 chars
        const truncated = cleanText.substring(0, 500);

        const utterance = new SpeechSynthesisUtterance(truncated);
        const params = VOICE_MOOD_PARAMS[mood] || VOICE_MOOD_PARAMS.happy;
        utterance.rate = params.rate;
        utterance.pitch = params.pitch;
        utterance.volume = 0.9;
        utterance.lang = this.lang;

        // Try to get a good voice
        const voices = this.synthesis.getVoices();
        const langPrefix = this.lang.split('-')[0];
        const preferredVoice = voices.find(v =>
            v.lang.startsWith(langPrefix) && (v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Samantha'))
        ) || voices.find(v => v.lang.startsWith(langPrefix))
          || voices.find(v => v.lang.startsWith('en'));
        if (preferredVoice) utterance.voice = preferredVoice;

        utterance.onstart = () => { this.isSpeaking = true; };
        utterance.onend = () => { this.isSpeaking = false; };
        utterance.onerror = () => { this.isSpeaking = false; };

        this.synthesis.speak(utterance);
    }

    stopSpeaking() {
        if (this.synthesis) this.synthesis.cancel();
        this.isSpeaking = false;
    }

    toggleOutput() {
        this.voiceOutputEnabled = !this.voiceOutputEnabled;
        if (!this.voiceOutputEnabled) this.stopSpeaking();
        return this.voiceOutputEnabled;
    }

    getStatusLine(mood) {
        if (!this.voiceOutputEnabled) return '[🔇 Voice output: OFF]';
        const params = VOICE_MOOD_PARAMS[mood] || VOICE_MOOD_PARAMS.happy;
        let line = `[🔊 Voice: speaking at ${params.rate}× rate in ${mood} tone]`;
        if (this.assistantMode) {
            line += ` [🎤 Assistant: ${this.isAwake ? 'AWAKE' : 'listening for wake word'}]`;
        }
        return line;
    }

    _cleanForSpeech(text) {
        return text
            .replace(/<[^>]*>/g, '')           // HTML tags
            .replace(/\[.*?\]/g, '')           // [bracketed text]
            .replace(/━+/g, '')                // line separators
            .replace(/[📥🔧🧠📝✅📄⚡📊🌐💭★⚫🌀⏮🎤🔊🦠💤⚠️👤📋🔍💻🚀📡📂🔌🗄️✂️🧬📐👁️]/g, '') // Emojis
            .replace(/\*\*/g, '')              // Bold markers
            .replace(/```[\s\S]*?```/g, '')    // Code blocks
            .replace(/`[^`]*`/g, '')           // Inline code
            .replace(/#{1,6}\s*/g, '')         // Headings
            .replace(/\n{2,}/g, '. ')          // Multiple newlines
            .replace(/\n/g, ' ')               // Newlines
            .replace(/\s{2,}/g, ' ')           // Multiple spaces
            .trim();
    }
}

window.VoiceSystem = VoiceSystem;
window.VOICE_MOOD_PARAMS = VOICE_MOOD_PARAMS;
