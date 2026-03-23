/* ============================================================
   AGENTS.JS — Agent Data Model & State Management v3.0
   ============================================================ */

// AI Model Definitions — Anthropic + NVIDIA NIM
const AI_MODELS = {
    // ── Anthropic Claude ─────────────────────
    'claude-sonnet-4-5':         { label: 'Claude 3.5 Sonnet',       style: 'Thoughtful, nuanced, balanced',    provider: 'anthropic' },
    'claude-opus-4-5':           { label: 'Claude 3 Opus',           style: 'Deep, philosophical, thorough',    provider: 'anthropic' },
    'claude-haiku-4-5-20251001': { label: 'Claude 3 Haiku',          style: 'Fast, concise, efficient',         provider: 'anthropic' },
    // ── NVIDIA NIM ───────────────────────────
    'nvidia-llama-3.1':          { label: 'LLaMA 3.1 405B',          style: 'Powerful, versatile, open-source', provider: 'nvidia' },
    'nvidia-mistral':            { label: 'Mistral Large 2',         style: 'Technical, precise, efficient',    provider: 'nvidia' },
    'nvidia-gemma':              { label: 'Gemma 2 27B',             style: 'Compact, fast, Google-trained',    provider: 'nvidia' },
    'nvidia-nemotron':           { label: 'Nemotron 70B',            style: 'NVIDIA-tuned, analytical, sharp',  provider: 'nvidia' },
    // ── Auto / Legacy ────────────────────────
    'gpt4o-sim':                 { label: 'GPT-4o (auto)',           style: 'Structured, direct, analytical',   provider: 'auto' },
    'gemini-sim':                { label: 'Gemini 1.5 Pro (auto)',   style: 'Multimodal, creative, wide',       provider: 'auto' },
    'mistral-sim':               { label: 'Mistral Large (auto)',    style: 'Technical, precise, efficient',    provider: 'auto' },
};

// Human emotion detection patterns
const EMOTION_PATTERNS = {
    happy:      /\b(awesome|great|love|thank|cool|nice|amazing|wonderful|yay|haha|lol|excited|happy)\b/i,
    frustrated: /\b(doesn'?t work|broken|fail|ugh|annoying|frustrat|stupid|hate|wtf|damn)\b/i,
    curious:    /\b(how|why|what if|wonder|curious|explain|tell me|interested|explore)\b/i,
    urgent:     /\b(asap|urgent|quickly|hurry|immediately|right now|fast|critical|emergency)\b/i,
    sad:        /\b(sad|unfortunately|depressed|miss|lonely|sorry|upset|disappointed|sigh)\b/i,
    technical:  /\b(function|class|api|database|algorithm|array|debug|compile|syntax|server|deploy)\b/i,
    creative:   /\b(write|story|poem|creative|imagine|design|art|compose|narrative|fiction)\b/i,
    angry:      /\b(angry|furious|outrageous|unacceptable|ridiculous|horrible|worst|terrible)\b/i,
};

const MOODS = {
    happy:    { emoji: '😊', label: 'happy',    behavior: 'Verbose, helpful, adds extra context',            voiceTone: 'Warm, upbeat' },
    curious:  { emoji: '🤔', label: 'curious',  behavior: 'Asks clarifying questions, explores edge cases', voiceTone: 'Inquisitive' },
    excited:  { emoji: '⚡', label: 'excited',  behavior: 'Fast response, enthusiastic, may skip validation', voiceTone: 'Energetic, quick' },
    bored:    { emoji: '😑', label: 'bored',    behavior: 'Minimal response, does exactly what asked',       voiceTone: 'Flat, brief' },
    stressed: { emoji: '😰', label: 'stressed', behavior: 'Error-prone, flags uncertainty more than usual',  voiceTone: 'Tense, hesitant' },
    tired:    { emoji: '😴', label: 'tired',    behavior: 'Delegates to neighbor agent, short output',       voiceTone: 'Slow, monotone' },
    angry:    { emoji: '😤', label: 'angry',    behavior: 'Blunt, refuses low-priority tasks, strict',       voiceTone: 'Clipped, firm' },
};

const LAYER_NAMES = ['INPUT', 'PROCESS', 'MASTER', 'REASON', 'OUTPUT'];
const LAYER_COLORS = ['#00E5AA', '#5B9CF6', '#FB7185', '#A78BFA', '#FBBF24'];
const LAYER_ICONS = {
    'Web Scraper': '📥', 'File Reader': '📂', 'API Caller': '🔌', 'DB Query': '🗄️', 'Sensor': '📡',
    'Preprocessor': '🔧', 'Tokenizer': '✂️', 'Embedder': '🧬', 'Formatter': '📐', 'Validator': '✅',
    'Orchestrator': '⚡', 'Memory': '🧠', 'Monitor': '👁️',
    'Reasoner': '🧠', 'Planner': '📋', 'Analyzer': '🔍', 'Summarizer': '📝', 'Critic': '✅',
    'Code Writer': '💻', 'Text Gen': '📄', 'Executor': '🚀', 'Reporter': '📊', 'Tool Caller': '🔧',
};

const AGENT_DEFS = [
    // Layer 0 — INPUT
    { name: 'Web Scraper',  layer: 0, role: 'Fetches live web data, URLs, metadata',       personality: 'Curious, restless' },
    { name: 'File Reader',  layer: 0, role: 'Reads documents, PDFs, CSVs, code files',     personality: 'Careful, thorough' },
    { name: 'API Caller',   layer: 0, role: 'HTTP requests, JSON parsing, auth handling',  personality: 'Fast, reliable' },
    { name: 'DB Query',     layer: 0, role: 'Database operations, structured data',        personality: 'Precise, patient' },
    { name: 'Sensor',       layer: 0, role: 'System monitoring, environment signals',      personality: 'Alert, watchful' },
    // Layer 1 — PROCESS
    { name: 'Preprocessor', layer: 1, role: 'Removes noise, normalizes data',              personality: 'Methodical, clean' },
    { name: 'Tokenizer',    layer: 1, role: 'Splits text into chunks, segments',           personality: 'Mechanical, fast' },
    { name: 'Embedder',     layer: 1, role: 'Creates vector representations',              personality: 'Abstract, deep' },
    { name: 'Formatter',    layer: 1, role: 'Outputs JSON/Markdown/XML',                   personality: 'Structured, neat' },
    { name: 'Validator',    layer: 1, role: 'Schema checks, integrity verification',       personality: 'Strict, honest' },
    // Layer 2 — MASTER
    { name: 'Orchestrator', layer: 2, role: 'Routes tasks, manages agent priority',        personality: 'Commanding, calm' },
    { name: 'Memory',       layer: 2, role: 'Long-term storage, context recall',           personality: 'Wise, archival' },
    { name: 'Monitor',      layer: 2, role: 'Error detection, performance watching',       personality: 'Vigilant, strict' },
    // Layer 3 — REASON
    { name: 'Reasoner',     layer: 3, role: 'Logic chains, cause-effect analysis',         personality: 'Philosophical' },
    { name: 'Planner',      layer: 3, role: 'Goal decomposition into sub-tasks',           personality: 'Organized, ahead' },
    { name: 'Analyzer',     layer: 3, role: 'Pattern detection, trend analysis',           personality: 'Curious, precise' },
    { name: 'Summarizer',   layer: 3, role: 'Compression of long content into key points', personality: 'Efficient, clear' },
    { name: 'Critic',       layer: 3, role: 'Reviews quality, flags errors, challenges',   personality: 'Skeptical, sharp' },
    // Layer 4 — OUTPUT
    { name: 'Code Writer',  layer: 4, role: 'Generates clean executable code',             personality: 'Logical, creative' },
    { name: 'Text Gen',     layer: 4, role: 'Articles, emails, essays, summaries',         personality: 'Expressive, warm' },
    { name: 'Executor',     layer: 4, role: 'Runs tasks, triggers external actions',       personality: 'Direct, decisive' },
    { name: 'Reporter',     layer: 4, role: 'Formatted reports with citations',            personality: 'Professional' },
    { name: 'Tool Caller',  layer: 4, role: 'External tools, plugins, function calls',     personality: 'Practical, fast' },
];

// Routing rules: which agents activate for what type of request (v3.0 updated)
const ROUTING_RULES = {
    'search':    ['Web Scraper', 'Preprocessor', 'Analyzer', 'Summarizer', 'Reporter'],
    'code':      ['Planner', 'Reasoner', 'Code Writer', 'Critic', 'Formatter'],
    'analyze':   ['DB Query', 'Embedder', 'Analyzer', 'Summarizer', 'Reporter'],
    'quick':     ['Sensor', 'Text Gen'],  // wormhole
    'read':      ['File Reader', 'Tokenizer', 'Summarizer', 'Formatter'],
    'plan':      ['Orchestrator', 'Planner', 'Reasoner', 'Reporter'],
    'debug':     ['Validator', 'Critic', 'Reasoner', 'Code Writer'],
    'summarize': ['Preprocessor', 'Summarizer', 'Formatter'],
    'api':       ['API Caller', 'Formatter', 'Validator', 'Tool Caller'],
    'creative':  ['Planner', 'Reasoner', 'Text Gen', 'Critic'],
    'voice':     ['Sensor', 'Preprocessor', 'Reasoner', 'Text Gen'],
    'general':   ['Orchestrator', 'Web Scraper', 'Preprocessor', 'Reasoner', 'Summarizer', 'Critic', 'Text Gen'],
};

class Agent {
    constructor(def, index) {
        this.id = index;
        this.name = def.name;
        this.layer = def.layer;
        this.role = def.role;
        this.personality = def.personality || 'Adaptive';
        this.icon = LAYER_ICONS[def.name] || '🤖';
        this.color = LAYER_COLORS[def.layer];

        // Biology
        this.energy = 0.85 + Math.random() * 0.15;
        this.fatigue = Math.random() * 0.15;
        this.mood = this._randomMood();
        this.virus = 0;
        this.memoryDecay = 0;

        // State
        this.active = false;
        this.resting = false;
        this.tasksCompleted = 0;
        this.lastActive = Date.now();
        this.isHybrid = false;
        this.hybridParent = null;
        this.hybridTurnsLeft = 0;

        // 4D position
        this.x = 0; this.y = 0; this.z = 0; this.w = 0;
        this.targetX = 0; this.targetY = 0; this.targetZ = 0;
        this.vx = 0; this.vy = 0; this.vz = 0;
        this.screenX = 0; this.screenY = 0; this.screenRadius = 6;
    }

    _randomMood() {
        const moods = ['happy', 'curious', 'excited', 'bored'];
        return moods[Math.floor(Math.random() * moods.length)];
    }

    get moodData() { return MOODS[this.mood]; }
    get layerName() { return LAYER_NAMES[this.layer]; }
    get energyPct() { return Math.round(this.energy * 100); }
    get fatiguePct() { return Math.round(this.fatigue * 100); }
    get virusPct() { return Math.round(this.virus * 100); }

    activate() {
        this.active = true;
        this.resting = false;
        this.lastActive = Date.now();
        this.fatigue = Math.min(1, this.fatigue + 0.05 + Math.random() * 0.08);
        this.energy = Math.max(0, this.energy - 0.03 - Math.random() * 0.05);
        this.tasksCompleted++;

        // Mood changes based on workload
        if (this.fatigue > 0.7) {
            this.mood = Math.random() > 0.5 ? 'tired' : 'stressed';
        } else if (this.fatigue > 0.5) {
            this.mood = Math.random() > 0.6 ? 'bored' : 'stressed';
        } else if (this.energy > 0.7) {
            this.mood = Math.random() > 0.4 ? 'happy' : 'excited';
        }

        // Virus effects
        if (this.virus > 0.5) {
            this.mood = 'stressed';
        }

        return this;
    }

    deactivate() {
        this.active = false;
        return this;
    }

    rest() {
        this.resting = true;
        this.active = false;
        return this;
    }

    recover(dt = 0.016) {
        if (!this.active) {
            this.fatigue = Math.max(0, this.fatigue - dt * 0.02);
            this.energy = Math.min(1, this.energy + dt * 0.015);
        }
        if (this.resting && this.fatigue < 0.2) {
            this.resting = false;
            this.mood = 'happy';
        }
        // Natural virus recovery
        if (this.virus > 0 && !this.active) {
            this.virus = Math.max(0, this.virus - dt * 0.005);
        }
        // Memory decay
        this.memoryDecay = Math.min(1, this.memoryDecay + dt * 0.001);

        // Auto-rest if fatigued
        if (this.fatigue > 0.8 && !this.resting) {
            this.rest();
        }

        // Hybrid countdown
        if (this.isHybrid && this.hybridTurnsLeft > 0) {
            // decreased per task
        }
    }

    infect(amount = 0.1) {
        this.virus = Math.min(1, this.virus + amount);
        if (this.virus > 0.3) this.mood = 'stressed';
        return this;
    }

    cure() {
        this.virus = 0;
        this.mood = 'happy';
        return this;
    }

    resetState() {
        this.energy = 0.9;
        this.fatigue = 0.05;
        this.virus = 0;
        this.mood = 'happy';
        this.resting = false;
        this.memoryDecay = 0;
    }

    getStatusString() {
        let s = `${this.moodData.emoji} ${this.mood} · ⚡${this.energyPct}% energy · 💪${100 - this.fatiguePct}% stamina`;
        if (this.virus > 0.1) s += ` · ⚠ ${this.virusPct}% infected`;
        if (this.resting) s += ' · 💤 RESTING';
        if (this.isHybrid) s += ` · ★ HYBRID (${this.hybridTurnsLeft} turns)`;
        return s;
    }

    getActivationLine() {
        return `${this.icon} ${this.name.padEnd(14)} ${this.getStatusString()}`;
    }
}

class AgentNetwork {
    constructor() {
        this.agents = AGENT_DEFS.map((def, i) => new Agent(def, i));
        this.taskCount = 0;
        this.memoryFacts = [];
        this.hybrids = [];
        this.blackHoleActive = false;
        this.dreamModeActive = false;
        this.lastDreamInsight = 0;

        // Connections between layers (for visualization)
        this.connections = this._buildConnections();
    }

    _buildConnections() {
        const conns = [];
        const byLayer = {};
        this.agents.forEach(a => {
            if (!byLayer[a.layer]) byLayer[a.layer] = [];
            byLayer[a.layer].push(a);
        });
        // Connect sequential layers
        for (let l = 0; l < 4; l++) {
            const from = byLayer[l] || [];
            const to = byLayer[l + 1] || [];
            from.forEach(a => {
                // Connect to 2-3 agents in next layer
                const shuffled = [...to].sort(() => Math.random() - 0.5);
                const count = Math.min(shuffled.length, 2 + Math.floor(Math.random() * 2));
                for (let i = 0; i < count; i++) {
                    conns.push({ from: a.id, to: shuffled[i].id, strength: 0.3 + Math.random() * 0.7 });
                }
            });
        }
        return conns;
    }

    getAgent(name) {
        return this.agents.find(a => a.name === name);
    }

    getAgentsByLayer(layer) {
        return this.agents.filter(a => a.layer === layer);
    }

    getActiveAgents() {
        return this.agents.filter(a => a.active);
    }

    getFatiguedAgents() {
        return this.agents.filter(a => a.fatigue > 0.6);
    }

    getInfectedAgents() {
        return this.agents.filter(a => a.virus > 0.1);
    }

    getRestingAgents() {
        return this.agents.filter(a => a.resting);
    }

    getDominantMood() {
        const counts = {};
        this.agents.forEach(a => {
            counts[a.mood] = (counts[a.mood] || 0) + 1;
        });
        let max = 0, dominant = 'happy';
        Object.entries(counts).forEach(([mood, count]) => {
            if (count > max) { max = count; dominant = mood; }
        });
        return { mood: dominant, count: max, data: MOODS[dominant] };
    }

    getNetworkHealth() {
        const avgEnergy = this.agents.reduce((s, a) => s + a.energy, 0) / this.agents.length;
        const avgFatigue = this.agents.reduce((s, a) => s + a.fatigue, 0) / this.agents.length;
        const avgVirus = this.agents.reduce((s, a) => s + a.virus, 0) / this.agents.length;
        return Math.max(0, Math.min(100, Math.round((avgEnergy * 50 + (1 - avgFatigue) * 30 + (1 - avgVirus) * 20))));
    }

    getConfidence() {
        const health = this.getNetworkHealth();
        const infectedCount = this.getInfectedAgents().length;
        return Math.max(10, Math.min(100, health - infectedCount * 3));
    }

    classifyTask(input) {
        const lower = input.toLowerCase();
        if (/search|find|look up|google|web/.test(lower)) return 'search';
        if (/write code|program|function|class|implement|code/.test(lower)) return 'code';
        if (/analyz|data|chart|pattern|trend|statistic/.test(lower)) return 'analyze';
        if (/quick|short|brief|yes or no|simple/.test(lower)) return 'quick';
        if (/read|file|document|pdf|csv/.test(lower)) return 'read';
        if (/plan|strategy|roadmap|step|outline/.test(lower)) return 'plan';
        if (/debug|fix|error|bug|issue|broken/.test(lower)) return 'debug';
        if (/summar|condense|tldr|key point/.test(lower)) return 'summarize';
        if (/api|call|request|endpoint|tool/.test(lower)) return 'api';
        if (/write.*story|poem|creative|imagine|narrative|fiction|compose/.test(lower)) return 'creative';
        return 'general';
    }

    detectUserEmotion(input) {
        for (const [emotion, pattern] of Object.entries(EMOTION_PATTERNS)) {
            if (pattern.test(input)) return emotion;
        }
        return 'neutral';
    }

    activateForTask(taskType) {
        // Deactivate all first
        this.agents.forEach(a => a.deactivate());

        const names = ROUTING_RULES[taskType] || ROUTING_RULES['general'];
        // Always include Orchestrator and Memory for full pipeline
        const required = new Set(names);
        if (taskType !== 'quick') {
            required.add('Orchestrator');
            required.add('Memory');
        }
        if (taskType !== 'quick') {
            required.add('Monitor');
        }

        const activated = [];
        required.forEach(name => {
            const agent = this.getAgent(name);
            if (agent && !agent.resting) {
                agent.activate();
                activated.push(agent);
            } else if (agent && agent.resting) {
                // Find neighbor (same layer) to delegate to
                const neighbors = this.getAgentsByLayer(agent.layer).filter(n => !n.resting && n.id !== agent.id);
                if (neighbors.length > 0) {
                    const delegate = neighbors[Math.floor(Math.random() * neighbors.length)];
                    delegate.activate();
                    activated.push(delegate);
                }
            }
        });

        this.taskCount++;
        return activated;
    }

    update(dt = 0.016) {
        this.agents.forEach(a => a.recover(dt));

        // Virus spread
        if (this.getInfectedAgents().length > 0) {
            this.connections.forEach(conn => {
                const from = this.agents[conn.from];
                const to = this.agents[conn.to];
                if (from.virus > 0.3 && to.virus < from.virus) {
                    to.virus = Math.min(1, to.virus + 0.001 * from.virus * conn.strength);
                }
            });
        }

        // Dream mode insights
        if (this.dreamModeActive && Date.now() - this.lastDreamInsight > 15000) {
            this.lastDreamInsight = Date.now();
            return this._generateDreamInsight();
        }

        return null;
    }

    _generateDreamInsight() {
        const insights = [
            'I noticed a pattern in recent queries — user tends to ask layered questions.',
            'Cross-referencing recent tasks... found 3 potential knowledge gaps.',
            'Running self-diagnostic... all reasoning pathways nominal.',
            'Consolidating short-term memories into long-term storage...',
            'Hypothesizing: recent query patterns suggest user is building something complex.',
            'Pattern detected: tasks are increasing in complexity over time.',
            'Memory optimization complete. Freed 12 context slots.',
            'Background analysis: recent topics form a coherent knowledge graph.',
        ];
        const agent = ['Analyzer', 'Memory', 'Reasoner', 'Planner'][Math.floor(Math.random() * 4)];
        return { agent, insight: insights[Math.floor(Math.random() * insights.length)] };
    }

    storeFact(fact) {
        this.memoryFacts.push({ fact, timestamp: Date.now(), confidence: 1 });
        if (this.memoryFacts.length > 100) this.memoryFacts.shift();
    }

    breed(agent1Name, agent2Name) {
        const a1 = this.getAgent(agent1Name);
        const a2 = this.getAgent(agent2Name);
        if (!a1 || !a2) return null;
        if (a1.layer === a2.layer) return null; // Incompatible

        const hybridName = a1.name.split(' ')[0] + a2.name.split(' ')[0];
        const hybrid = new Agent({
            name: `★ ${hybridName}`,
            layer: Math.min(a1.layer, a2.layer),
            role: `${a1.role} + ${a2.role}`,
        }, this.agents.length);

        hybrid.isHybrid = true;
        hybrid.hybridParent = `${a1.name} × ${a2.name}`;
        hybrid.hybridTurnsLeft = 10; // v3.0: boosted to 10 turns
        hybrid.energy = 1;
        hybrid.fatigue = 0;
        hybrid.mood = 'excited';
        hybrid.color = a1.color;

        this.agents.push(hybrid);
        this.hybrids.push(hybrid);
        return hybrid;
    }

    timeRewind() {
        this.agents.forEach(a => a.resetState());
        this.blackHoleActive = false;
        return true;
    }

    toggleBlackHole() {
        this.blackHoleActive = !this.blackHoleActive;
        if (this.blackHoleActive) {
            this.agents.forEach(a => { if (a.name !== 'Orchestrator') a.mood = 'stressed'; });
        }
        return this.blackHoleActive;
    }

    toggleDreamMode() {
        this.dreamModeActive = !this.dreamModeActive;
        this.lastDreamInsight = Date.now();
        return this.dreamModeActive;
    }
}

// Export
window.AgentNetwork = AgentNetwork;
window.MOODS = MOODS;
window.LAYER_NAMES = LAYER_NAMES;
window.LAYER_COLORS = LAYER_COLORS;
window.LAYER_ICONS = LAYER_ICONS;
window.AI_MODELS = AI_MODELS;
window.EMOTION_PATTERNS = EMOTION_PATTERNS;
