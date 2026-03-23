/* ============================================================
   PIPELINE.JS — Task Processing Pipeline & Response v3.0
   Supports both Simulation Mode and Live Anthropic API
   ============================================================ */

class Pipeline {
    constructor(network) {
        this.network = network;
        this.processing = false;
        this.taskQueue = [];
        this.activeModel = 'claude-sonnet-4-5';
        this.apiAvailable = false;
        this.conversationHistory = []; // For multi-turn context

        // Check API availability on init
        this._checkApiStatus();
    }

    async _checkApiStatus() {
        try {
            const res = await fetch('/api/status');
            const data = await res.json();
            this.apiAvailable = data.apiConfigured === true;
            console.log(`API Status: ${this.apiAvailable ? '✅ Live mode' : '⚠️ Simulation mode'}`);
        } catch (e) {
            this.apiAvailable = false;
            console.log('API Status: ⚠️ Server not responding, simulation mode');
        }
    }

    setModel(modelId) {
        this.activeModel = modelId;
    }

    getModelLabel() {
        const m = AI_MODELS[this.activeModel];
        return m ? m.label : 'Simulation';
    }

    async processTask(input, chatMessages) {
        if (this.processing) {
            this.taskQueue.push(input);
            return;
        }
        this.processing = true;

        const taskType = this.network.classifyTask(input);
        const isWormhole = taskType === 'quick';

        // Detect user emotion
        const userEmotion = this.network.detectUserEmotion(input);

        // 1. Show user message
        this._addUserMessage(chatMessages, input);

        // 2. Wormhole check
        if (isWormhole) {
            await this._delay(200);
            this._addModeBanner(chatMessages, 'wormhole', '🌀 Wormhole active: Sensor → Text Gen — bypassing 3 layers');
            if (window.app && window.app.viz) window.app.viz.triggerWormhole();
        }

        // 3. Black hole queue notice
        if (this.network.blackHoleActive) {
            await this._delay(100);
            this._addModeBanner(chatMessages, 'blackhole', '⚫ BLACK HOLE ACTIVE — All tasks routed through Orchestrator only');
        }

        // 4. Activate agents
        await this._delay(200);
        const activated = this.network.activateForTask(taskType);

        // 5. Show activation log (collapsed by default to save space)
        this._addActivationLog(chatMessages, activated);

        // 6. Show inter-agent dialogue
        await this._delay(300);
        this._addDialogues(chatMessages, activated, taskType, input);

        // 7. Generate response (API or Simulation)
        let response;
        if (this.apiAvailable) {
            // LIVE API CALL
            await this._delay(100);
            this._addModeBanner(chatMessages, 'wormhole', `🧠 Querying ${this.getModelLabel()} via API...`);
            response = await this._generateLiveResponse(input, taskType, activated, userEmotion);
        } else {
            // SIMULATION MODE
            await this._delay(400);
            response = this._generateSimulatedResponse(input, taskType, activated);
        }

        // 8. Show response — THIS IS THE MAIN OUTPUT, MUST BE VISIBLE
        const responseEl = this._addResponse(chatMessages, response, activated);

        // 9. Show network status (compact, does NOT scroll)
        await this._delay(200);
        this._addNetworkStatus(chatMessages);

        // 10. SCROLL BACK to the response so user sees the actual answer
        requestAnimationFrame(() => {
            if (responseEl) {
                responseEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });

        // 10. Store fact
        this.network.storeFact(`Task processed: "${input.substring(0, 60)}..." (${taskType})`);

        // Check virus spread warning
        const infected = this.network.getInfectedAgents();
        if (infected.length > 0) {
            await this._delay(200);
            infected.forEach(a => {
                this._addSystemAlert(chatMessages, `⚠️ Warning: ${a.name} is ${a.virusPct}% infected — output may be unreliable`);
            });
        }

        // Check fatigue warnings
        const fatigued = this.network.getFatiguedAgents();
        fatigued.forEach(a => {
            if (a.fatigue > 0.7) {
                this._addSystemAlert(chatMessages, `💤 ${a.name}: ${a.fatiguePct}% fatigued — operating at reduced capacity`);
            }
        });

        // Voice output
        if (window.app && window.app.voice && window.app.voice.voiceOutputEnabled) {
            const dominant = this.network.getDominantMood();
            window.app.voice.speak(response.body, dominant.mood);
        }

        // Deactivate agents
        activated.forEach(a => a.deactivate());
        this.processing = false;

        // Process queue
        if (this.taskQueue.length > 0) {
            const next = this.taskQueue.shift();
            setTimeout(() => this.processTask(next, chatMessages), 500);
        }

        // Update UI
        if (window.app) window.app.updateUI();
    }

    // ── LIVE API RESPONSE ──────────────────────────────────────
    async _generateLiveResponse(input, taskType, activated, userEmotion) {
        const confidence = this.network.getConfidence();
        const dominant = this.network.getDominantMood();

        // Build network context to inject into the API call
        const networkContext = this._buildNetworkContext(activated, taskType, userEmotion, dominant);

        // Add to conversation history
        this.conversationHistory.push({
            role: 'user',
            content: input
        });

        // Keep conversation history to last 10 exchanges
        if (this.conversationHistory.length > 20) {
            this.conversationHistory = this.conversationHistory.slice(-20);
        }

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.activeModel,
                    messages: this.conversationHistory,
                    max_tokens: 2048,
                    networkContext: networkContext,
                }),
            });

            const data = await res.json();

            if (data.success) {
                // Store assistant response in history
                this.conversationHistory.push({
                    role: 'assistant',
                    content: data.text
                });

                // Parse the response — convert markdown-style formatting to HTML
                const formattedBody = this._formatApiResponse(data.text);

                return {
                    title: `LIVE RESPONSE`,
                    body: formattedBody,
                    confidence,
                    taskType,
                    agentCount: activated.length,
                    live: true,
                    model: data.model,
                    usage: data.usage,
                };
            } else {
                // API error — fall back to simulation
                console.warn('API error, falling back to simulation:', data.error);
                const simResponse = this._generateSimulatedResponse(input, taskType, activated);
                simResponse.body = `<p style="color:var(--warning); font-size:11px; margin-bottom:12px">⚠️ API error: ${this._escapeHtml(data.error)} — falling back to simulation</p>` + simResponse.body;
                return simResponse;
            }
        } catch (err) {
            console.error('Fetch error:', err);
            const simResponse = this._generateSimulatedResponse(input, taskType, activated);
            simResponse.body = `<p style="color:var(--warning); font-size:11px; margin-bottom:12px">⚠️ Connection error — using simulation mode</p>` + simResponse.body;
            return simResponse;
        }
    }

    _buildNetworkContext(activated, taskType, userEmotion, dominant) {
        const agentStates = activated.map(a =>
            `${a.icon} ${a.name}: ${a.moodData.emoji} ${a.mood} · ⚡${a.energyPct}% · 💪${100 - a.fatiguePct}% · personality: ${a.personality}`
        ).join('\n');

        return `[NETWORK STATE — inject into response format]
Active Model: ${this.getModelLabel()}
Task Type: ${taskType}
User Emotion Detected: ${userEmotion}
Dominant Network Mood: ${dominant.data.emoji} ${dominant.mood} (${dominant.count} agents)
Network Health: ${this.network.getNetworkHealth()}%
Confidence: ${this.network.getConfidence()}%
Tasks Completed: ${this.network.taskCount}
Memory Facts: ${this.network.memoryFacts.length}

ACTIVATED AGENTS:
${agentStates}

Please follow the response format from your system prompt. Include activation log, agent dialogue where relevant, and the actual answer. End with network status footer and avatar state.`;
    }

    _formatApiResponse(text) {
        // Convert the API text response to HTML
        let html = text;

        // Handle code blocks first (before other formatting)
        html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
            return `<pre><code>${this._escapeHtml(code.trim())}</code></pre>`;
        });

        // Inline code
        html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Bold
        html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

        // Italic
        html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

        // Headers
        html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
        html = html.replace(/^# (.+)$/gm, '<h3>$1</h3>');

        // Horizontal rules / separator lines
        html = html.replace(/^[━═─—]{3,}$/gm, '<hr style="border-color:var(--border-dim);margin:8px 0">');

        // Ordered lists
        html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

        // Unordered lists
        html = html.replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>');

        // Wrap consecutive <li> in <ul>
        html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>');

        // Paragraphs — wrap lines that aren't already HTML
        html = html.split('\n').map(line => {
            const trimmed = line.trim();
            if (!trimmed) return '';
            if (trimmed.startsWith('<')) return line; // Already HTML
            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                // Status lines like [Avatar: ...]
                return `<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin:2px 0">${trimmed}</div>`;
            }
            return `<p>${line}</p>`;
        }).join('\n');

        // Clean up empty paragraphs
        html = html.replace(/<p>\s*<\/p>/g, '');

        return html;
    }

    // ── SIMULATION MODE ────────────────────────────────────────
    _generateSimulatedResponse(input, taskType, activated) {
        const confidence = this.network.getConfidence();

        let title = '';
        let body = '';

        switch (taskType) {
            case 'code':
                title = 'CODE GENERATION RESULT';
                body = this._generateCodeResponse(input, activated);
                break;
            case 'search':
                title = 'SEARCH RESULTS';
                body = this._generateSearchResponse(input, activated);
                break;
            case 'analyze':
                title = 'ANALYSIS RESULTS';
                body = this._generateAnalysisResponse(input, activated);
                break;
            case 'plan':
                title = 'STRATEGIC PLAN';
                body = this._generatePlanResponse(input, activated);
                break;
            case 'debug':
                title = 'DEBUG ANALYSIS';
                body = this._generateDebugResponse(input, activated);
                break;
            case 'summarize':
                title = 'SUMMARY';
                body = this._generateSummaryResponse(input, activated);
                break;
            case 'quick':
                title = 'QUICK RESPONSE';
                body = this._generateQuickResponse(input, activated);
                break;
            case 'creative':
                title = 'CREATIVE OUTPUT';
                body = this._generateCreativeResponse(input, activated);
                break;
            default:
                title = 'NETWORK RESPONSE';
                body = this._generateGeneralResponse(input, activated);
        }

        // Wrap technical agent dialogues so they can be hidden in simple Dialogue view
        body = body.replace(/<p>\s*<strong>\[[\s\S]*?<\/p>/g, match => {
            return match.replace('<p>', '<p class="sim-agent-log">');
        });

        return { title, body, confidence, taskType, agentCount: activated.length, live: false };
    }

    _generateGeneralResponse(input, activated) {
        const reasoner = this.network.getAgent('Reasoner');
        const critic = this.network.getAgent('Critic');

        const responses = {
            'hello': `<h3>Welcome to the 4D Neural Network v3.0</h3>
<p>The network is fully operational with <strong>23 agents</strong> across 5 layers, powered by <strong>${this.getModelLabel()}</strong>.</p>
<p>New in v3.0:</p>
<ul>
<li><strong>🎭 Living Avatar</strong> — My face reflects the collective mood of all agents</li>
<li><strong>🎤 Voice I/O</strong> — Click the mic to speak, I'll respond in mood-adapted tone</li>
<li><strong>🧠 Multi-Model</strong> — Switch AI backends from the header dropdown</li>
<li><strong>💬 Emotion Detection</strong> — I read your tone and adapt my response style</li>
<li><strong>🧬 10-Turn Breed Boost</strong> — Hybrid agents now stay boosted longer</li>
</ul>
<p>Try saying <em>"write a creative poem about AI"</em> or <em>"debug this code"</em> to see different pipelines activate!</p>
<p style="color:var(--warning); font-size:11px; margin-top:12px">[Simulation Mode · Set ANTHROPIC_API_KEY for live ${this.getModelLabel()} intelligence]</p>`,

            'default': `<h3>Processing Complete</h3>
<p>Your request "<em>${this._escapeHtml(input)}</em>" has been safely processed by the neural network.</p>
<p><strong>[Reasoner — ${reasoner ? reasoner.moodData.emoji + ' ' + reasoner.mood : '🤔 curious'}]:</strong> I've analyzed your input and identified it as a general knowledge request. The full pipeline was engaged to ensure comprehensive coverage.</p>
<p><strong>[Critic — ${critic ? critic.moodData.emoji + ' ' + critic.mood : '✅ happy'}]:</strong> Output reviewed. The response draws from multiple knowledge domains and has been validated for coherence.</p>
<h3 class="sim-agent-log">Key Insights</h3>
<ul class="sim-agent-log">
<li>Task complexity: <strong>Medium</strong> — full pipeline required</li>
<li>Primary reasoning agent: <strong>Reasoner</strong> with support from <strong>Summarizer</strong></li>
<li>${activated.length} agents collaborated to generate this response</li>
<li>Network confidence in this output: <strong>${this.network.getConfidence()}%</strong></li>
</ul>
<p>The response has been stored in Memory for future context. Ask follow-up questions for deeper analysis.</p>
<p class="sim-agent-log" style="color:var(--warning); font-size:11px; margin-top:12px">[Simulation Mode · Set API KEY for live intelligence]</p>`
        };

        if (/hello|hi|hey|greet/i.test(input)) return responses.hello;
        return responses.default;
    }

    _generateCodeResponse(input, activated) {
        return `<h3>Code Generation Pipeline Activated</h3>
<p><strong>[Planner]:</strong> Breaking down the coding task into sub-components...</p>
<p><strong>[Reasoner]:</strong> Analyzing logical structure and determining optimal approach...</p>
<pre><code>// Generated by Code Writer agent
// Model: ${this.getModelLabel()} (Simulation)
// Task: ${this._escapeHtml(input).substring(0, 80)}
// Confidence: ${this.network.getConfidence()}%

function processTask(input) {
    // Validated by Critic agent
    const result = analyze(input);
    return optimize(result);
}
</code></pre>
<p><strong>[Critic]:</strong> Code reviewed ✅ — No logical errors detected. Clean structure confirmed.</p>
<p style="color:var(--warning); font-size:11px">[Simulation Mode · Set API key for real code generation]</p>`;
    }

    _generateSearchResponse(input, activated) {
        return `<h3>Search & Retrieval Complete</h3>
<p><strong>[Web Scraper]:</strong> Fetched ${800 + Math.floor(Math.random() * 500)} tokens of relevant content from knowledge base.</p>
<p><strong>[Preprocessor]:</strong> Cleaned and filtered to ${400 + Math.floor(Math.random() * 200)} relevant tokens.</p>
<p><strong>[Summarizer]:</strong> Condensing findings into key points...</p>
<h3>Search Results for "<em>${this._escapeHtml(input.substring(0, 60))}</em>"</h3>
<ul>
<li>Retrieved contextual information from multiple sources</li>
<li>Cross-referenced with Memory agent's stored facts (${this.network.memoryFacts.length} total)</li>
<li>Relevance score: <strong>${85 + Math.floor(Math.random() * 14)}%</strong></li>
</ul>
<p><strong>[Reporter]:</strong> Formatted final report with citations verified by Critic.</p>
<p style="color:var(--warning); font-size:11px">[Simulation Mode · Set API key for real search]</p>`;
    }

    _generateAnalysisResponse(input, activated) {
        return `<h3>Data Analysis Report</h3>
<p><strong>[DB Query]:</strong> Structured data retrieved from context.</p>
<p><strong>[Embedder]:</strong> Converted to ${64 + Math.floor(Math.random() * 64)}-dimensional vector representations.</p>
<p><strong>[Analyzer — ${this.network.getAgent('Analyzer')?.moodData.emoji || '🔍'} ${this.network.getAgent('Analyzer')?.mood || 'curious'}]:</strong></p>
<h3>Patterns Identified</h3>
<ul>
<li><strong>Trend 1:</strong> Positive correlation detected in primary dataset</li>
<li><strong>Trend 2:</strong> Seasonal variation pattern with 3.2σ confidence</li>
<li><strong>Anomaly:</strong> 2 outlier data points flagged for review</li>
</ul>
<p>Statistical confidence: <strong>${this.network.getConfidence()}%</strong></p>`;
    }

    _generatePlanResponse(input, activated) {
        return `<h3>Strategic Planning Output</h3>
<p><strong>[Orchestrator]:</strong> Delegating to Planner for step-by-step breakdown.</p>
<h3>Execution Plan</h3>
<ol>
<li><strong>Phase 1 — Analysis:</strong> Gather requirements and constraints</li>
<li><strong>Phase 2 — Design:</strong> Architect solution with fallback paths</li>
<li><strong>Phase 3 — Implementation:</strong> Execute with parallel agent processing</li>
<li><strong>Phase 4 — Validation:</strong> Critic + Validator review output quality</li>
<li><strong>Phase 5 — Delivery:</strong> Reporter formats and delivers final output</li>
</ol>
<p><strong>[Reporter]:</strong> Plan documented and stored in Memory for tracking.</p>`;
    }

    _generateDebugResponse(input, activated) {
        return `<h3>Debug Analysis Report</h3>
<p><strong>[Validator]:</strong> Running integrity checks on input...</p>
<h3>Findings</h3>
<ul>
<li><strong>Issue #1:</strong> Potential edge case detected — needs bounds checking</li>
<li><strong>Issue #2:</strong> Memory allocation pattern could cause degradation</li>
<li><strong>Suggestion:</strong> Add error handling and fallback mechanisms</li>
</ul>
<p><strong>[Code Writer]:</strong> Patch generated. Confidence: <strong>${this.network.getConfidence()}%</strong></p>`;
    }

    _generateSummaryResponse(input, activated) {
        return `<h3>Content Summary</h3>
<p><strong>[Preprocessor]:</strong> Input cleaned and normalized.</p>
<h3>Key Points</h3>
<ul>
<li>Main topic identified and extracted</li>
<li>Supporting details compressed to essential elements</li>
<li>Context preserved for follow-up queries</li>
</ul>
<p>Compression ratio: <strong>${70 + Math.floor(Math.random() * 25)}%</strong> reduction achieved.</p>`;
    }

    _generateQuickResponse(input, activated) {
        return `<p><strong>[🌀 Wormhole — Direct Response]:</strong></p>
<p>Quick-response pipeline engaged. Bypassed 3 middle layers for faster output.</p>
<p>Response time: <strong>${50 + Math.floor(Math.random() * 100)}ms</strong> (wormhole speedup: ~4×)</p>`;
    }

    _generateCreativeResponse(input, activated) {
        return `<h3>Creative Pipeline Activated</h3>
<p><strong>[Planner — 📋]:</strong> Decomposing creative request into structural elements...</p>
<p><strong>[Reasoner — 🧠]:</strong> Establishing theme, tone, and narrative arc...</p>
<p><strong>[Text Gen — 📄 ${this.network.getAgent('Text Gen')?.moodData.emoji || '😊'}]:</strong></p>
<blockquote style="border-left:3px solid var(--color-output); padding:8px 16px; margin:10px 0; color:var(--text-secondary); font-style:italic;">
In the vast neural architecture, thoughts cascade like waterfalls of light —
each synapse a bridge between what is known and what is yet to be discovered.
The network hums with purpose, 23 minds weaving a tapestry of understanding,
each thread a different color, a different perspective, all converging toward clarity.
</blockquote>
<p><strong>[Critic — ✅]:</strong> Creative output reviewed. Tone is coherent. Approved.</p>
<p style="color:var(--warning); font-size:11px">[Simulation Mode · Set API key for live creative generation]</p>`;
    }

    // ── UI RENDERING ───────────────────────────────────────────

    _addUserMessage(container, input) {
        const msg = document.createElement('div');
        msg.className = 'user-message';
        msg.innerHTML = `
            <div class="msg-icon">👤</div>
            <div class="msg-content">
                <div class="msg-header">USER INPUT</div>
                <pre class="msg-pre">${this._escapeHtml(input)}</pre>
            </div>
        `;
        container.appendChild(msg);
        this._scrollToBottom(container);
    }

    _addModeBanner(container, type, text) {
        const banner = document.createElement('div');
        banner.className = `mode-banner ${type}`;
        banner.textContent = text;
        container.appendChild(banner);
        this._scrollToBottom(container);
    }

    _addActivationLog(container, activated) {
        const msg = document.createElement('div');
        msg.className = 'activation-message';

        let lines = '';
        activated.forEach((agent, i) => {
            lines += `<div class="activation-line layer-${agent.layer}" style="animation-delay: ${i * 0.1}s">
                <span>${agent.icon}</span>
                <span class="agent-name">${agent.name}</span>
                <span class="agent-stats">${agent.getStatusString()}</span>
            </div>`;
        });

        const modeLabel = this.apiAvailable ? 'LIVE' : 'SIM';
        const logId = 'actlog-' + Date.now();

        msg.innerHTML = `
            <div class="activation-header" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center" onclick="(function(el){var b=el.parentElement.querySelector('.activation-body');if(b){b.style.display=b.style.display==='none'?'block':'none';el.querySelector('.toggle-arrow').textContent=b.style.display==='none'?'▶':'▼'}})(this)">
                <span>🌐 ACTIVATION LOG  [${modeLabel} · ${this.getModelLabel()} · ${activated.length} agents]</span>
                <span class="toggle-arrow" style="font-size:10px;color:var(--text-dim)">▶</span>
            </div>
            <div class="activation-body" style="display:none">
                ${lines}
            </div>
        `;
        container.appendChild(msg);
        this._scrollToBottom(container);
    }

    _addDialogues(container, activated, taskType, input) {
        const dialogues = this._generateDialogues(activated, taskType, input);
        dialogues.forEach(d => {
            const msg = document.createElement('div');
            msg.className = 'dialogue-message';
            msg.innerHTML = `
                <span class="dialogue-from">[${d.from}]</span>
                <span class="dialogue-arrow">→</span>
                <span class="dialogue-to">[${d.to}]</span>
                <span class="dialogue-text">"${d.text}"</span>
            `;
            container.appendChild(msg);
        });
        this._scrollToBottom(container);
    }

    _generateDialogues(activated, taskType, input) {
        const dialogues = [];
        const orch = activated.find(a => a.name === 'Orchestrator');
        const mem = activated.find(a => a.name === 'Memory');
        const mon = activated.find(a => a.name === 'Monitor');

        if (orch) {
            const primary = activated.find(a => a.layer === 3) || activated[activated.length - 1];
            dialogues.push({
                from: 'Orchestrator',
                to: primary?.name || 'All',
                text: `Priority task incoming: ${taskType}. Allocate ${60 + Math.floor(Math.random() * 30)}% capacity.${this.apiAvailable ? ' Live API mode — full intelligence.' : ''}`
            });
        }

        if (mem && this.network.memoryFacts.length > 0) {
            dialogues.push({
                from: 'Memory',
                to: 'Orchestrator',
                text: `${this.network.memoryFacts.length} related contexts found from previous sessions. Injecting.`
            });
        }

        if (mon) {
            const fatigued = this.network.getFatiguedAgents();
            if (fatigued.length > 0) {
                dialogues.push({
                    from: 'Monitor',
                    to: 'All',
                    text: `Warning — ${fatigued[0].name} at ${fatigued[0].fatiguePct}% fatigue. Consider rerouting.`
                });
            }
        }

        // Task-specific dialogues
        if (taskType === 'code') {
            dialogues.push({ from: 'Reasoner', to: 'Code Writer', text: 'Logic framework ready. Begin code generation.' });
            dialogues.push({ from: 'Code Writer', to: 'Critic', text: 'Draft code complete. Please review before output.' });
        } else if (taskType === 'search') {
            dialogues.push({ from: 'Web Scraper', to: 'Preprocessor', text: `Raw data fetched. ${800 + Math.floor(Math.random() * 500)} tokens incoming.` });
        } else if (taskType === 'debug') {
            dialogues.push({ from: 'Validator', to: 'Reasoner', text: 'Schema check complete. Found potential issues to analyze.' });
        } else if (taskType === 'creative') {
            dialogues.push({ from: 'Planner', to: 'Text Gen', text: 'Creative framework established. Narrative arc defined.' });
        }

        return dialogues;
    }

    _addResponse(container, response, activated) {
        const msg = document.createElement('div');
        msg.className = 'response-message response-highlight';

        // Build avatar status line
        let avatarLine = '';
        if (window.app && window.app.avatar) {
            avatarLine = `<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-top:10px;padding-top:8px;border-top:1px solid var(--border-dim)">${window.app.avatar.getStatusLine()}</div>`;
        }

        // Build voice status line
        let voiceLine = '';
        if (window.app && window.app.voice) {
            const dominant = this.network.getDominantMood();
            voiceLine = `<div style="font-family:var(--font-mono);font-size:10px;color:var(--text-dim);margin-top:4px">${window.app.voice.getStatusLine(dominant.mood)}</div>`;
        }

        // Usage info for live responses
        let usageLine = '';
        if (response.live && response.usage) {
            usageLine = `<div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:4px">Tokens: ${response.usage.input_tokens || '?'} in / ${response.usage.output_tokens || '?'} out · Model: ${response.model || this.activeModel}</div>`;
        }

        const liveIndicator = response.live
            ? '<span class="response-badge" style="border-color:var(--color-input);color:var(--color-input)">🟢 LIVE</span>'
            : '<span class="response-badge" style="border-color:var(--warning);color:var(--warning)">SIM</span>';

        msg.innerHTML = `
            <div class="response-label">✨ ${response.title}  [${this.getModelLabel()}]</div>
            <div class="response-badges">
                ${liveIndicator}
                <span class="response-badge confidence">Confidence: ${response.confidence}%</span>
                <span class="response-badge agents">Agents: ${response.agentCount}</span>
                <span class="response-badge">Pipeline: ${response.taskType === 'quick' ? 'Wormhole' : 'Full'}</span>
            </div>
            <div class="response-body">${response.body}</div>
            ${avatarLine}
            ${voiceLine}
            ${usageLine}
        `;
        container.appendChild(msg);

        // Return the element so caller can scroll to it
        return msg;
    }

    _addNetworkStatus(container) {
        const net = this.network;
        const dominant = net.getDominantMood();
        const msg = document.createElement('div');
        msg.className = 'network-status-message';
        msg.innerHTML = `
            <div class="ns-header">📊 ${net.agents.length} agents · ${dominant.data.emoji} ${dominant.mood} · tasks: ${net.taskCount} · confidence: ${net.getConfidence()}% · ${this.getModelLabel()} ${this.apiAvailable ? '🟢' : '⚪'}</div>
        `;
        container.appendChild(msg);
        // Do NOT scroll to bottom here — keep the response visible
    }

    _addSystemAlert(container, text) {
        const msg = document.createElement('div');
        msg.className = 'system-message';
        msg.innerHTML = `
            <div class="msg-icon">⚠️</div>
            <div class="msg-content">
                <pre class="msg-pre" style="color: var(--warning)">${text}</pre>
            </div>
        `;
        container.appendChild(msg);
        this._scrollToBottom(container);
    }

    _scrollToBottom(container) {
        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
        });
    }

    _escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

window.Pipeline = Pipeline;
