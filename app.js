/* ============================================================
   APP.JS — Main Application Controller v3.1
   Avatar · Voice · Multi-Model · Emotion Detection
   Responsive Mobile · Voice Assistant
   ============================================================ */

class App {
    constructor() {
        this.network = new AgentNetwork();
        this.pipeline = new Pipeline(this.network);
        this.avatar = null;
        this.voice = new VoiceSystem();
        this.viz = null;
        this.animFrameId = null;
        this.lastTime = 0;
        this.activeModel = 'claude-sonnet-4-5';
        this.isMobile = window.innerWidth <= 768;
        this.activePanel = 'chat'; // chat, viz, agents

        // DOM Refs
        this.dom = {
            bootOverlay: document.getElementById('boot-overlay'),
            bootStatus: document.getElementById('boot-status'),
            bootProgress: document.getElementById('boot-progress-bar'),
            bootAgents: document.getElementById('boot-agents'),
            app: document.getElementById('app'),
            canvas: document.getElementById('network-canvas'),
            avatarCanvas: document.getElementById('avatar-canvas'),
            avatarMoodLabel: document.getElementById('avatar-mood-label'),
            chatMessages: document.getElementById('chat-messages'),
            chatInput: document.getElementById('chat-input'),
            sendBtn: document.getElementById('send-btn'),
            voiceBtn: document.getElementById('voice-btn'),
            voiceBtnIcon: document.getElementById('voice-btn-icon'),
            voiceOverlay: document.getElementById('voice-overlay'),
            voiceTranscript: document.getElementById('voice-transcript'),
            voiceCancel: document.getElementById('voice-cancel'),
            voiceToggle: document.getElementById('btn-voice-toggle'),
            voiceIconLabel: document.getElementById('voice-icon-label'),
            modelSelect: document.getElementById('model-select'),
            agentList: document.getElementById('agent-list'),
            layerFilter: document.getElementById('layer-filter'),
            healthFill: document.getElementById('health-fill'),
            healthValue: document.getElementById('health-value'),
            taskCount: document.getElementById('task-count'),
            agentDetail: document.getElementById('agent-detail'),
            detailHeader: document.getElementById('detail-header'),
            detailBody: document.getElementById('detail-body'),
            detailClose: document.getElementById('detail-close'),
            vizInfo: document.getElementById('viz-info'),
            // Status bar
            sbActive: document.getElementById('sb-active'),
            sbFatigued: document.getElementById('sb-fatigued'),
            sbInfected: document.getElementById('sb-infected'),
            sbResting: document.getElementById('sb-resting'),
            sbMood: document.getElementById('sb-mood'),
            sbModel: document.getElementById('sb-model'),
            sbMemory: document.getElementById('sb-memory'),
            sbConfidence: document.getElementById('sb-confidence'),
            sbVoice: document.getElementById('sb-voice'),
            // Mobile elements
            mobileNav: document.getElementById('mobile-bottom-nav'),
            voiceFab: document.getElementById('voice-assistant-fab'),
            modelDrawer: document.getElementById('mobile-model-drawer'),
            drawerBackdrop: document.getElementById('drawer-backdrop'),
            assistantIndicator: document.getElementById('assistant-indicator'),
            assistantSettings: document.getElementById('assistant-settings'),
        };

        this._runBootSequence();
    }

    async _runBootSequence() {
        const statusEl = this.dom.bootStatus;
        const progressEl = this.dom.bootProgress;
        const agentsEl = this.dom.bootAgents;

        const stages = [
            { text: 'Initializing Neural Core v3.0...', progress: 5 },
            { text: 'Loading agent definitions...', progress: 12 },
            { text: 'Building neural connections...', progress: 25 },
            { text: 'Calibrating 4D topology...', progress: 35 },
            { text: 'Initializing Avatar system...', progress: 42 },
            { text: 'Loading Voice I/O...', progress: 48 },
            { text: 'Initializing Layer 0 — INPUT agents...', progress: 55 },
            { text: 'Initializing Layer 1 — PROCESS agents...', progress: 65 },
            { text: 'Initializing Layer 2 — MASTER agents...', progress: 72 },
            { text: 'Initializing Layer 3 — REASON agents...', progress: 80 },
            { text: 'Initializing Layer 4 — OUTPUT agents...', progress: 88 },
            { text: 'Running self-diagnostics...', progress: 93 },
            { text: 'Configuring model: Claude 3.5 Sonnet...', progress: 97 },
            { text: 'All systems nominal. Going online...', progress: 100 },
        ];

        for (let i = 0; i < stages.length; i++) {
            statusEl.textContent = stages[i].text;
            progressEl.style.width = stages[i].progress + '%';

            // Show agent names as they load
            if (i >= 6 && i <= 10) {
                const layerIdx = i - 6;
                const layerAgents = this.network.getAgentsByLayer(layerIdx);
                layerAgents.forEach((agent, j) => {
                    setTimeout(() => {
                        const line = document.createElement('div');
                        line.className = 'agent-line';
                        line.style.animationDelay = (j * 0.05) + 's';
                        line.innerHTML = `<span style="color:${agent.color}">✓</span> ${agent.icon} ${agent.name} <span style="color:${LAYER_COLORS[layerIdx]}">[${LAYER_NAMES[layerIdx]}]</span> <span style="color:var(--text-dim); font-size:9px">${agent.personality}</span>`;
                        agentsEl.appendChild(line);
                    }, j * 80);
                });
            }

            await this._delay(250 + Math.random() * 150);
        }

        await this._delay(600);

        // Fade out boot and show app
        this.dom.bootOverlay.classList.add('fade-out');
        await this._delay(800);
        this.dom.bootOverlay.style.display = 'none';
        this.dom.app.classList.remove('hidden');

        this._initApp();
    }

    _initApp() {
        // Init visualization
        this.viz = new NetworkVisualizer(this.dom.canvas, this.network);

        // Init avatar
        if (this.dom.avatarCanvas) {
            this.avatar = new Avatar(this.dom.avatarCanvas);
            this.avatar.setMood('happy');
        }

        // Init voice callbacks
        this._initVoice();

        // Build agent list
        this._buildAgentList();

        // Bind events
        this._bindEvents();

        // Init mobile
        this._initMobile();

        // Start render loop
        this._startLoop();

        // Draw mini network in header
        this._drawMiniNetwork();

        // Initial UI update
        this.updateUI();

        // Listen for resize
        window.addEventListener('resize', () => {
            this.isMobile = window.innerWidth <= 768;
            this._updateMobilePanels();
        });
    }

    _initVoice() {
        this.voice.onResult((transcript) => {
            // Hide overlay
            this.dom.voiceOverlay.classList.add('hidden');
            this.dom.voiceBtn.classList.remove('listening');

            // Check for voice commands
            const command = this.voice.parseVoiceCommand(transcript);
            if (command) {
                this._handleVoiceCommand(command);
            } else {
                // Treat as regular input
                this.dom.chatInput.value = transcript;
                this._sendMessage();
            }
        });

        this.voice.onInterim((transcript) => {
            this.dom.voiceTranscript.textContent = transcript;
        });

        this.voice.onEnd(() => {
            this.dom.voiceOverlay.classList.add('hidden');
            this.dom.voiceBtn.classList.remove('listening');
            if (this.dom.voiceFab) this.dom.voiceFab.classList.remove('listening');
        });

        this.voice.onError((error) => {
            this.dom.voiceTranscript.textContent = `Error: ${error}`;
            setTimeout(() => {
                this.dom.voiceOverlay.classList.add('hidden');
                this.dom.voiceBtn.classList.remove('listening');
                if (this.dom.voiceFab) this.dom.voiceFab.classList.remove('listening');
            }, 1500);
        });

        // Assistant callbacks
        this.voice.onWake(() => {
            if (this.dom.assistantIndicator) this.dom.assistantIndicator.classList.add('active');
            if (this.dom.voiceFab) {
                this.dom.voiceFab.classList.add('assistant-on');
                this.dom.voiceFab.textContent = '🗣️';
            }
            this._addSystemBanner('🎤 Assistant AWAKE — listening for your command...');
        });

        this.voice.onSleep(() => {
            if (this.dom.assistantIndicator) this.dom.assistantIndicator.classList.remove('active');
            if (this.dom.voiceFab) {
                this.dom.voiceFab.classList.remove('assistant-on');
                this.dom.voiceFab.textContent = '🎤';
            }
        });
    }

    _handleVoiceCommand(command) {
        const banner = document.createElement('div');
        banner.className = 'mode-banner wormhole';
        let handled = true;

        switch (command.action) {
            case 'trigger_virus':
                this._triggerVirus();
                banner.textContent = '🎤 Voice command: trigger virus';
                break;
            case 'cure_virus':
                this.network.agents.forEach(a => a.cure());
                banner.textContent = '🎤 Voice command: cure virus — all agents cured';
                break;
            case 'blackhole':
                this._toggleBlackHole();
                return; // Already adds its own banner
            case 'dream_mode':
                this._toggleDreamMode();
                return;
            case 'rewind':
                this._timeRewind();
                return;
            case 'wormhole':
                this._triggerWormhole();
                return;
            case 'reset_network':
                this.network.timeRewind();
                this._buildAgentList();
                this.updateUI();
                banner.textContent = '🎤 Voice command: reset network — full reinitialization complete';
                break;
            case 'switch_model':
                const modelName = command.args[0]?.toLowerCase() || '';
                const modelId = Object.keys(AI_MODELS).find(k =>
                    AI_MODELS[k].label.toLowerCase().includes(modelName)
                );
                if (modelId) {
                    this.dom.modelSelect.value = modelId;
                    this._switchModel(modelId);
                    banner.textContent = `🎤 Voice command: switch to ${AI_MODELS[modelId].label}`;
                } else {
                    banner.textContent = `🎤 Voice command: model "${command.args[0]}" not found`;
                }
                break;
            case 'toggle_voice':
                const on = command.args[0]?.toLowerCase() === 'on';
                this.voice.voiceOutputEnabled = on;
                this._updateVoiceUI();
                banner.textContent = `🎤 Voice command: voice ${on ? 'ON' : 'OFF'}`;
                break;
            case 'network_status':
                // Trigger full status report as if typed
                this.pipeline.processTask('network status report', this.dom.chatMessages);
                return;
            case 'inject_task':
                this.pipeline.processTask(command.args[0], this.dom.chatMessages);
                return;
            case 'breed':
                const a1 = command.args[0]?.trim();
                const a2 = command.args[1]?.trim();
                if (a1 && a2) {
                    const hybrid = this.network.breed(a1, a2);
                    if (hybrid) {
                        banner.textContent = `🎤 Breed: ${hybrid.name} created from ${hybrid.hybridParent}`;
                    } else {
                        banner.textContent = `🎤 Breed failed: incompatible agents "${a1}" and "${a2}"`;
                    }
                }
                break;
            default:
                handled = false;
        }

        if (handled) {
            this.dom.chatMessages.appendChild(banner);
            this._scrollChat();
        }
    }

    _bindEvents() {
        // Send message
        this.dom.sendBtn.addEventListener('click', () => this._sendMessage());
        this.dom.chatInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this._sendMessage();
            }
        });

        // Auto-resize textarea
        this.dom.chatInput.addEventListener('input', () => {
            this.dom.chatInput.style.height = 'auto';
            this.dom.chatInput.style.height = Math.min(120, this.dom.chatInput.scrollHeight) + 'px';
        });

        // Voice input button
        if (this.dom.voiceBtn) {
            this.dom.voiceBtn.addEventListener('click', () => this._toggleVoiceInput());
        }

        // Voice cancel
        if (this.dom.voiceCancel) {
            this.dom.voiceCancel.addEventListener('click', () => {
                this.voice.stopListening();
                this.dom.voiceOverlay.classList.add('hidden');
                this.dom.voiceBtn.classList.remove('listening');
            });
        }

        // Voice output toggle
        if (this.dom.voiceToggle) {
            this.dom.voiceToggle.addEventListener('click', () => {
                this.voice.toggleOutput();
                this._updateVoiceUI();
            });
        }

        // Model selector
        if (this.dom.modelSelect) {
            this.dom.modelSelect.addEventListener('change', (e) => {
                this._switchModel(e.target.value);
            });
        }

        // Layer filter
        this.dom.layerFilter.addEventListener('change', () => this._buildAgentList());

        // View mode buttons
        document.querySelectorAll('[data-view]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('[data-view]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.viz.setView(btn.dataset.view);
            });
        });

        // Mode buttons
        document.getElementById('btn-dream').addEventListener('click', () => this._toggleDreamMode());
        document.getElementById('btn-blackhole').addEventListener('click', () => this._toggleBlackHole());
        document.getElementById('btn-breed').addEventListener('click', () => this._triggerBreed());
        document.getElementById('btn-rewind').addEventListener('click', () => this._timeRewind());
        document.getElementById('btn-wormhole').addEventListener('click', () => this._triggerWormhole());

        // Virus trigger button
        const virusBtn = document.getElementById('btn-virus');
        if (virusBtn) {
            virusBtn.addEventListener('click', () => this._triggerVirus());
        }

        // Agent detail close
        this.dom.detailClose.addEventListener('click', () => {
            this.dom.agentDetail.classList.add('hidden');
        });

        // Tab buttons
        document.getElementById('tab-pipeline').addEventListener('click', () => {
            document.getElementById('tab-pipeline').classList.add('active');
            document.getElementById('tab-dialogue').classList.remove('active');
            this.dom.chatMessages.classList.remove('view-dialogue');
            this.dom.chatMessages.classList.add('view-pipeline');
            this._scrollChat();
        });
        document.getElementById('tab-dialogue').addEventListener('click', () => {
            document.getElementById('tab-dialogue').classList.add('active');
            document.getElementById('tab-pipeline').classList.remove('active');
            this.dom.chatMessages.classList.remove('view-pipeline');
            this.dom.chatMessages.classList.add('view-dialogue');
            this._scrollChat();
        });
    }

    _toggleVoiceInput() {
        if (!this.voice.supported.input) {
            this._addSystemBanner('⚠️ Voice API unavailable in this browser — text only');
            return;
        }

        if (this.voice.isListening) {
            this.voice.stopListening();
            this.dom.voiceOverlay.classList.add('hidden');
            this.dom.voiceBtn.classList.remove('listening');
        } else {
            this.dom.voiceTranscript.textContent = 'Speak your command...';
            this.dom.voiceOverlay.classList.remove('hidden');
            this.dom.voiceBtn.classList.add('listening');
            this.voice.startListening();
        }
    }

    _switchModel(modelId) {
        this.activeModel = modelId;
        this.pipeline.setModel(modelId);
        const model = AI_MODELS[modelId];
        if (!model) return;

        const banner = document.createElement('div');
        banner.className = 'mode-banner wormhole';
        banner.textContent = `🧠 Switching reasoning core → ${model.label} · ${model.style} · recalibrating...`;
        this.dom.chatMessages.appendChild(banner);
        this._scrollChat();
        this.updateUI();
    }

    _updateVoiceUI() {
        const on = this.voice.voiceOutputEnabled;
        if (this.dom.voiceIconLabel) {
            this.dom.voiceIconLabel.textContent = on ? '🔊' : '🔇';
        }
        if (this.dom.voiceToggle) {
            this.dom.voiceToggle.classList.toggle('active', on);
        }
        if (this.dom.sbVoice) {
            this.dom.sbVoice.textContent = on ? '🔊 Voice: ON' : '🔇 Voice: OFF';
        }
    }

    _sendMessage() {
        const input = this.dom.chatInput.value.trim();
        if (!input) return;
        this.dom.chatInput.value = '';
        this.dom.chatInput.style.height = 'auto';

        // On mobile, switch to chat panel
        if (this.isMobile && this.activePanel !== 'chat') {
            this._switchMobilePanel('chat');
        }

        this.pipeline.processTask(input, this.dom.chatMessages);
    }

    _addSystemBanner(text) {
        const banner = document.createElement('div');
        banner.className = 'mode-banner wormhole';
        banner.textContent = text;
        this.dom.chatMessages.appendChild(banner);
        this._scrollChat();
    }

    _buildAgentList() {
        const filter = this.dom.layerFilter.value;
        const container = this.dom.agentList;
        container.innerHTML = '';

        let agents = this.network.agents;
        if (filter !== 'all') {
            agents = agents.filter(a => a.layer === parseInt(filter));
        }

        agents.forEach(agent => {
            const card = document.createElement('div');
            card.className = 'agent-card';
            if (agent.active) card.classList.add('active');
            if (agent.resting) card.classList.add('resting');
            if (agent.virus > 0.2) card.classList.add('infected');
            card.style.setProperty('--agent-color', agent.color);
            card.style.setProperty('--agent-color-rgb',
                this._hexToRgb(agent.color));

            card.innerHTML = `
                <div class="agent-dot ${agent.active ? 'pulsing' : ''}" style="background:${agent.color}"></div>
                <div class="agent-info">
                    <div class="agent-name-label">
                        ${agent.icon} ${agent.name}
                        <span class="agent-layer-badge" style="color:${agent.color}">L${agent.layer}</span>
                        ${agent.isHybrid ? '<span style="color:#FBBF24">★</span>' : ''}
                    </div>
                    <div class="agent-role">${agent.personality} · ${agent.role}</div>
                </div>
                <div class="agent-meters">
                    <div class="agent-meter">
                        <span class="meter-label">E</span>
                        <div class="meter-track">
                            <div class="meter-fill energy" style="width:${agent.energyPct}%"></div>
                        </div>
                    </div>
                    <div class="agent-meter">
                        <span class="meter-label">F</span>
                        <div class="meter-track">
                            <div class="meter-fill fatigue ${agent.fatigue > 0.6 ? 'high' : ''}" style="width:${agent.fatiguePct}%"></div>
                        </div>
                    </div>
                    ${agent.virus > 0.05 ? `
                    <div class="agent-meter">
                        <span class="meter-label">V</span>
                        <div class="meter-track">
                            <div class="meter-fill virus" style="width:${agent.virusPct}%"></div>
                        </div>
                    </div>` : ''}
                </div>
                <div class="agent-mood">${agent.moodData.emoji}</div>
            `;

            card.addEventListener('click', () => this.showAgentDetail(agent));
            container.appendChild(card);
        });
    }

    showAgentDetail(agent) {
        this.dom.detailHeader.innerHTML = `
            <div class="detail-icon">${agent.icon}</div>
            <div class="detail-name" style="color:${agent.color}">${agent.name}</div>
            <div class="detail-layer">LAYER ${agent.layer} — ${agent.layerName}</div>
        `;

        this.dom.detailBody.innerHTML = `
            <div class="detail-stat">
                <span class="detail-stat-label">Role</span>
                <span class="detail-stat-value" style="font-size:10px; max-width:160px; text-align:right">${agent.role}</span>
            </div>
            <div class="detail-stat">
                <span class="detail-stat-label">Personality</span>
                <span class="detail-stat-value" style="color:var(--color-output)">${agent.personality}</span>
            </div>
            <div class="detail-stat">
                <span class="detail-stat-label">Mood</span>
                <span class="detail-stat-value">${agent.moodData.emoji} ${agent.mood}</span>
            </div>
            <div class="detail-stat">
                <span class="detail-stat-label">Energy</span>
                <span class="detail-stat-value" style="color:${agent.energy > 0.5 ? 'var(--color-input)' : 'var(--warning)'}">⚡ ${agent.energyPct}%</span>
            </div>
            <div class="detail-stat">
                <span class="detail-stat-label">Stamina</span>
                <span class="detail-stat-value" style="color:${agent.fatigue > 0.6 ? 'var(--danger)' : 'var(--text-secondary)'}">💪 ${100 - agent.fatiguePct}%</span>
            </div>
            <div class="detail-stat">
                <span class="detail-stat-label">Virus</span>
                <span class="detail-stat-value" style="color:${agent.virus > 0.1 ? 'var(--danger)' : 'var(--text-dim)'}">${agent.virus > 0.1 ? '🦠 ' : ''}${agent.virusPct}%</span>
            </div>
            <div class="detail-stat">
                <span class="detail-stat-label">Tasks Done</span>
                <span class="detail-stat-value">${agent.tasksCompleted}</span>
            </div>
            <div class="detail-stat">
                <span class="detail-stat-label">Status</span>
                <span class="detail-stat-value">${agent.resting ? '💤 Resting' : agent.active ? '⚡ Active' : '⏳ Idle'}</span>
            </div>
            ${agent.isHybrid ? `
            <div class="detail-stat">
                <span class="detail-stat-label">Hybrid</span>
                <span class="detail-stat-value" style="color:var(--color-output)">★ ${agent.hybridParent} (${agent.hybridTurnsLeft} turns left)</span>
            </div>` : ''}
            <div class="detail-stat" style="border:none">
                <span class="detail-stat-label">Voice Tone</span>
                <span class="detail-stat-value" style="font-size:9px; color:var(--text-dim)">${agent.moodData.voiceTone || 'Adaptive'}</span>
            </div>
        `;

        this.dom.agentDetail.classList.remove('hidden');
    }

    // Special Modes
    _toggleDreamMode() {
        const active = this.network.toggleDreamMode();
        document.getElementById('btn-dream').classList.toggle('active', active);

        const banner = document.createElement('div');
        banner.className = 'mode-banner dream';
        banner.textContent = active
            ? '💭 Dream Mode ACTIVATED — Agents will process background hypotheses and consolidate memory'
            : '💭 Dream Mode DEACTIVATED — Returning to standard operation';
        this.dom.chatMessages.appendChild(banner);
        this._scrollChat();
    }

    _toggleBlackHole() {
        const active = this.network.toggleBlackHole();
        document.getElementById('btn-blackhole').classList.toggle('active', active);

        if (active) {
            const vignette = document.createElement('div');
            vignette.className = 'blackhole-vignette';
            vignette.id = 'blackhole-vignette';
            document.body.appendChild(vignette);
        } else {
            const v = document.getElementById('blackhole-vignette');
            if (v) v.remove();
        }

        const banner = document.createElement('div');
        banner.className = 'mode-banner blackhole';
        banner.textContent = active
            ? '⚫ BLACK HOLE MODE ACTIVATED — All tasks routed through Orchestrator only'
            : '⚫ Black Hole Mode deactivated — Normal routing restored';
        this.dom.chatMessages.appendChild(banner);
        this._scrollChat();
    }

    _triggerBreed() {
        const layer1 = Math.floor(Math.random() * 5);
        let layer2;
        do { layer2 = Math.floor(Math.random() * 5); } while (layer2 === layer1);

        const agents1 = this.network.getAgentsByLayer(layer1);
        const agents2 = this.network.getAgentsByLayer(layer2);
        const a1 = agents1[Math.floor(Math.random() * agents1.length)];
        const a2 = agents2[Math.floor(Math.random() * agents2.length)];

        const hybrid = this.network.breed(a1.name, a2.name);

        const banner = document.createElement('div');
        banner.className = 'mode-banner breed';
        if (hybrid) {
            banner.textContent = `🧬 ${hybrid.name} ONLINE — hybrid of ${hybrid.hybridParent} — boosted for 10 turns (+30% output quality)`;
        } else {
            banner.textContent = '🧬 Breed failed — incompatible agent types';
        }
        this.dom.chatMessages.appendChild(banner);
        this._scrollChat();
        this._buildAgentList();
    }

    _timeRewind() {
        this.network.timeRewind();
        document.getElementById('btn-blackhole').classList.remove('active');
        const v = document.getElementById('blackhole-vignette');
        if (v) v.remove();

        const banner = document.createElement('div');
        banner.className = 'mode-banner wormhole';
        banner.textContent = '⏮ Snapshot restored · fatigue: reset · virus: cleared · moods: balanced';
        this.dom.chatMessages.appendChild(banner);
        this._scrollChat();
        this._buildAgentList();
        this.updateUI();
    }

    _triggerWormhole() {
        if (this.viz) this.viz.triggerWormhole();

        const flash = document.createElement('div');
        flash.className = 'wormhole-effect';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 1000);

        const banner = document.createElement('div');
        banner.className = 'mode-banner wormhole';
        banner.textContent = '🌀 Wormhole activated — Cross-layer shortcut ready for next simple task';
        this.dom.chatMessages.appendChild(banner);
        this._scrollChat();
    }

    _triggerVirus() {
        // Infect 2-4 random agents
        const count = 2 + Math.floor(Math.random() * 3);
        const shuffled = [...this.network.agents].sort(() => Math.random() - 0.5);
        const infected = [];
        for (let i = 0; i < count && i < shuffled.length; i++) {
            shuffled[i].infect(0.3 + Math.random() * 0.3);
            infected.push(shuffled[i].name);
        }

        const banner = document.createElement('div');
        banner.className = 'mode-banner blackhole';
        banner.textContent = `🦠 Virus deployed — ${infected.join(', ')} infected · output reliability may degrade`;
        this.dom.chatMessages.appendChild(banner);
        this._scrollChat();
        this._buildAgentList();

        // Update avatar
        if (this.avatar) {
            this.avatar.setVirus(0.5);
            this.avatar.setMood('stressed');
        }
    }

    // Main Loop
    _startLoop() {
        const loop = (timestamp) => {
            const dt = Math.min((timestamp - this.lastTime) / 1000, 0.05);
            this.lastTime = timestamp;

            // Update network
            const dreamInsight = this.network.update(dt);
            if (dreamInsight) {
                this._showDreamInsight(dreamInsight);
            }

            // Update avatar
            if (this.avatar) {
                const dominant = this.network.getDominantMood();
                this.avatar.setMood(dominant.mood);
                this.avatar.setEnergy(
                    this.network.agents.reduce((s, a) => s + a.energy, 0) / this.network.agents.length
                );
                const avgVirus = this.network.agents.reduce((s, a) => s + a.virus, 0) / this.network.agents.length;
                this.avatar.setVirus(avgVirus);
                this.avatar.update(dt);
                this.avatar.draw();

                // Update label
                if (this.dom.avatarMoodLabel) {
                    const map = AVATAR_MOOD_MAP[dominant.mood] || AVATAR_MOOD_MAP.happy;
                    this.dom.avatarMoodLabel.textContent = `${dominant.data.emoji} ${dominant.mood} · ${map.haloLabel} halo · ${Math.round(this.avatar.energy * 100)}% energy`;
                }
            }

            // Update visualization
            if (this.viz) {
                this.viz.update(dt);
                this.viz.draw();
            }

            // Periodic UI update (every 2 seconds)
            if (Math.floor(timestamp / 2000) !== Math.floor((timestamp - dt * 1000) / 2000)) {
                this.updateUI();
                this._buildAgentList();
            }

            this.animFrameId = requestAnimationFrame(loop);
        };
        this.animFrameId = requestAnimationFrame(loop);
    }

    _showDreamInsight(insight) {
        const msg = document.createElement('div');
        msg.className = 'system-message';
        msg.innerHTML = `
            <div class="msg-icon">💭</div>
            <div class="msg-content">
                <div class="msg-header">DREAM MODE — ${insight.agent.toUpperCase()}</div>
                <pre class="msg-pre" style="color: var(--color-process)">${insight.insight}</pre>
            </div>
        `;
        this.dom.chatMessages.appendChild(msg);
        this._scrollChat();
    }

    updateUI() {
        const net = this.network;

        // Health
        const health = net.getNetworkHealth();
        this.dom.healthFill.style.width = health + '%';
        this.dom.healthValue.textContent = health + '%';
        this.dom.healthFill.className = 'health-fill' +
            (health < 40 ? ' danger' : health < 70 ? ' warning' : '');
        this.dom.healthValue.style.color =
            health < 40 ? 'var(--danger)' : health < 70 ? 'var(--warning)' : 'var(--color-input)';

        // Task count
        this.dom.taskCount.textContent = net.taskCount;

        // Status bar
        this.dom.sbActive.innerHTML = `Active: <strong>${net.getActiveAgents().length}</strong>`;
        this.dom.sbFatigued.innerHTML = `Fatigued: <strong>${net.getFatiguedAgents().length}</strong>`;
        this.dom.sbInfected.innerHTML = `Infected: <strong>${net.getInfectedAgents().length}</strong>`;
        this.dom.sbResting.innerHTML = `Resting: <strong>${net.getRestingAgents().length}</strong>`;
        const dominant = net.getDominantMood();
        this.dom.sbMood.textContent = `Dominant: ${dominant.data.emoji} ${dominant.mood}`;

        // Model
        if (this.dom.sbModel) {
            const model = AI_MODELS[this.activeModel];
            this.dom.sbModel.textContent = `Model: ${model ? model.label : 'Simulation'}`;
        }

        this.dom.sbMemory.innerHTML = `Memory: <strong>${net.memoryFacts.length}</strong> facts`;
        this.dom.sbConfidence.innerHTML = `Confidence: <strong>${net.getConfidence()}%</strong>`;

        // Network status text
        const statusText = document.getElementById('network-status-text');
        if (statusText) {
            statusText.textContent = `${net.agents.length} agents • ${net.taskCount} tasks • ${health}% health`;
        }
    }

    _drawMiniNetwork() {
        const canvas = document.getElementById('mini-network');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const w = 40, h = 40;

        const draw = () => {
            ctx.clearRect(0, 0, w, h);
            const t = Date.now() / 1000;

            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2 + t * 0.5;
                const r = 12 + Math.sin(t + i) * 3;
                const x = w / 2 + Math.cos(angle) * r;
                const y = h / 2 + Math.sin(angle) * r;
                const size = 2 + Math.sin(t * 2 + i) * 0.8;

                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI * 2);
                ctx.fillStyle = LAYER_COLORS[i % 5];
                ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(w / 2, h / 2, 3 + Math.sin(t * 3) * 0.5, 0, Math.PI * 2);
            const coreGrad = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 4);
            coreGrad.addColorStop(0, '#A78BFA');
            coreGrad.addColorStop(1, '#A78BFA00');
            ctx.fillStyle = coreGrad;
            ctx.fill();

            requestAnimationFrame(draw);
        };
        draw();
    }

    _scrollChat() {
        requestAnimationFrame(() => {
            this.dom.chatMessages.scrollTop = this.dom.chatMessages.scrollHeight;
        });
    }

    _hexToRgb(hex) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `${r}, ${g}, ${b}`;
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ── MOBILE SYSTEM ──────────────────────────────────────────

    _initMobile() {
        // ALWAYS bind mobile event listeners — CSS controls visibility,
        // JS just needs to respond when the user interacts.

        // Bottom nav buttons — always bind
        const navBtns = document.querySelectorAll('.mobile-nav-btn');
        navBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const panel = btn.dataset.panel;
                if (panel === 'model') {
                    this._openModelDrawer();
                    return;
                }
                this._switchMobilePanel(panel);
            });
        });

        // Voice FAB — always bind
        if (this.dom.voiceFab) {
            let pressTimer;
            this.dom.voiceFab.addEventListener('click', () => {
                this._toggleVoiceInput();
            });

            // Long press → open settings
            this.dom.voiceFab.addEventListener('touchstart', (e) => {
                pressTimer = setTimeout(() => {
                    e.preventDefault();
                    this._openAssistantSettings();
                }, 600);
            }, { passive: false });

            this.dom.voiceFab.addEventListener('touchend', () => {
                clearTimeout(pressTimer);
            });

            this.dom.voiceFab.addEventListener('touchmove', () => {
                clearTimeout(pressTimer);
            });
        }

        // Model drawer — always bind
        if (this.dom.drawerBackdrop) {
            this.dom.drawerBackdrop.addEventListener('click', () => this._closeModelDrawer());
        }

        const modelOptions = document.querySelectorAll('.model-option');
        modelOptions.forEach(opt => {
            opt.addEventListener('click', () => {
                const modelId = opt.dataset.model;
                // Update selection UI
                modelOptions.forEach(o => o.classList.remove('selected'));
                opt.classList.add('selected');
                // Switch model
                if (this.dom.modelSelect) this.dom.modelSelect.value = modelId;
                this._switchModel(modelId);
                // Close drawer
                setTimeout(() => this._closeModelDrawer(), 300);
            });
        });

        // Assistant settings — always bind
        const settingsClose = document.getElementById('assistant-settings-close');
        if (settingsClose) {
            settingsClose.addEventListener('click', () => {
                this.dom.assistantSettings.classList.remove('open');
            });
        }

        const toggleAlwaysOn = document.getElementById('toggle-always-on');
        if (toggleAlwaysOn) {
            toggleAlwaysOn.addEventListener('change', () => {
                if (toggleAlwaysOn.checked) {
                    this.voice.startAssistant();
                    if (this.dom.voiceFab) {
                        this.dom.voiceFab.classList.add('assistant-on');
                    }
                    this._addSystemBanner('🎤 Always-On Assistant ACTIVATED — Say "Hey Neural" to activate');
                } else {
                    this.voice.stopAssistant();
                    if (this.dom.voiceFab) {
                        this.dom.voiceFab.classList.remove('assistant-on');
                        this.dom.voiceFab.textContent = '🎤';
                    }
                    this._addSystemBanner('🎤 Always-On Assistant DEACTIVATED');
                }
            });
        }

        const toggleVoiceOutput = document.getElementById('toggle-voice-output');
        if (toggleVoiceOutput) {
            toggleVoiceOutput.addEventListener('change', () => {
                this.voice.voiceOutputEnabled = toggleVoiceOutput.checked;
                this._updateVoiceUI();
            });
        }

        const toggleAutoSend = document.getElementById('toggle-auto-send');
        if (toggleAutoSend) {
            toggleAutoSend.addEventListener('change', () => {
                this.voice.autoSend = toggleAutoSend.checked;
            });
        }

        const langSelect = document.getElementById('voice-lang-select');
        if (langSelect) {
            langSelect.addEventListener('change', () => {
                this.voice.setLanguage(langSelect.value);
            });
        }

        // Now apply initial state based on screen size
        if (this.isMobile) {
            this._switchMobilePanel('chat');
        } else {
            // Desktop: make sure all panels visible
            document.querySelectorAll('.panel').forEach(p => {
                p.classList.remove('mobile-hidden', 'mobile-active');
            });
        }
    }

    _switchMobilePanel(panelName) {
        this.activePanel = panelName;
        const panels = {
            chat: document.getElementById('panel-chat'),
            viz: document.getElementById('panel-viz'),
            agents: document.getElementById('panel-agents'),
        };

        // Hide all panels
        Object.values(panels).forEach(p => {
            if (p) {
                p.classList.add('mobile-hidden');
                p.classList.remove('mobile-active');
            }
        });

        // Show target panel
        const target = panels[panelName];
        if (target) {
            target.classList.remove('mobile-hidden');
            target.classList.add('mobile-active');
        }

        // Update nav buttons
        document.querySelectorAll('.mobile-nav-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.panel === panelName);
        });

        // Resize canvas if switching to viz
        if (panelName === 'viz' && this.viz) {
            requestAnimationFrame(() => this.viz.resize());
        }
    }

    _updateMobilePanels() {
        if (this.isMobile) {
            this._switchMobilePanel(this.activePanel);
        } else {
            // Desktop: remove mobile classes
            document.querySelectorAll('.panel').forEach(p => {
                p.classList.remove('mobile-hidden', 'mobile-active');
            });
        }
    }

    _openModelDrawer() {
        if (this.dom.modelDrawer) this.dom.modelDrawer.classList.add('open');
        if (this.dom.drawerBackdrop) this.dom.drawerBackdrop.classList.add('open');
    }

    _closeModelDrawer() {
        if (this.dom.modelDrawer) this.dom.modelDrawer.classList.remove('open');
        if (this.dom.drawerBackdrop) this.dom.drawerBackdrop.classList.remove('open');
    }

    _openAssistantSettings() {
        if (this.dom.assistantSettings) {
            this.dom.assistantSettings.classList.add('open');
            // Sync toggle states
            const toggleAlwaysOn = document.getElementById('toggle-always-on');
            const toggleVoiceOutput = document.getElementById('toggle-voice-output');
            const toggleAutoSend = document.getElementById('toggle-auto-send');
            if (toggleAlwaysOn) toggleAlwaysOn.checked = this.voice.assistantMode;
            if (toggleVoiceOutput) toggleVoiceOutput.checked = this.voice.voiceOutputEnabled;
            if (toggleAutoSend) toggleAutoSend.checked = this.voice.autoSend;
        }
    }
}

// ============================================================
// LAUNCH
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});
