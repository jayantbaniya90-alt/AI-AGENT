/* ============================================================
   SERVER.JS — Multi-Provider AI Proxy Server
   Supports: Anthropic (Claude) + NVIDIA NIM + Simulation
   API keys secured via environment variables
   ============================================================ */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ── Configuration ──────────────────────────────────────────────
const PORT = 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY || '';

// ── Provider Definitions ───────────────────────────────────────
const PROVIDERS = {
    anthropic: {
        name: 'Anthropic',
        hostname: 'api.anthropic.com',
        basePath: '/v1/messages',
        apiKey: ANTHROPIC_API_KEY,
        configured: !!ANTHROPIC_API_KEY,
    },
    nvidia: {
        name: 'NVIDIA NIM',
        hostname: 'integrate.api.nvidia.com',
        basePath: '/v1/chat/completions',
        apiKey: NVIDIA_API_KEY,
        configured: !!NVIDIA_API_KEY,
    },
};

// Model mapping — frontend IDs to { provider, actualModel }
const MODEL_MAP = {
    // Anthropic Claude models
    'claude-sonnet-4-5':         { provider: 'anthropic', model: 'claude-sonnet-4-5' },
    'claude-opus-4-5':           { provider: 'anthropic', model: 'claude-opus-4-6' },
    'claude-haiku-4-5-20251001': { provider: 'anthropic', model: 'claude-haiku-4-5-20250414' },
    // NVIDIA NIM models (real API calls)
    'nvidia-llama-3.1':          { provider: 'nvidia', model: 'meta/llama-3.1-405b-instruct' },
    'nvidia-mistral':            { provider: 'nvidia', model: 'mistralai/mistral-large-2-instruct' },
    'nvidia-gemma':              { provider: 'nvidia', model: 'google/gemma-2-27b-it' },
    'nvidia-nemotron':           { provider: 'nvidia', model: 'nvidia/llama-3.1-nemotron-70b-instruct' },
    // Legacy simulated (route to whatever is available)
    'gpt4o-sim':                 { provider: 'auto', model: 'gpt4o-sim' },
    'gemini-sim':                { provider: 'auto', model: 'gemini-sim' },
    'mistral-sim':               { provider: 'auto', model: 'mistral-sim' },
};

// MIME types for static file serving
const MIME_TYPES = {
    '.html': 'text/html',  '.css': 'text/css',    '.js': 'application/javascript',
    '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.gif': 'image/gif',   '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
    '.woff': 'font/woff',  '.woff2': 'font/woff2', '.ttf': 'font/ttf',
    '.md': 'text/markdown', '.webp': 'image/webp',
};

// ── System Prompt ──────────────────────────────────────────────
let SYSTEM_PROMPT = '';
const promptPaths = [
    path.join(__dirname, 'neural_network_prompt_v3.md'),
    path.join(process.env.USERPROFILE || process.env.HOME || '', 'Downloads', 'neural_network_prompt_v3.md'),
];

for (const p of promptPaths) {
    try {
        if (fs.existsSync(p)) {
            SYSTEM_PROMPT = fs.readFileSync(p, 'utf8');
            console.log(`✅ System prompt: ${p} (${SYSTEM_PROMPT.length} chars)`);
            break;
        }
    } catch (e) { /* continue */ }
}

if (!SYSTEM_PROMPT) {
    SYSTEM_PROMPT = `You are the Central Intelligence Core of a 4D Multi-Agent Neural Network v3.0.
You are a LIVING NETWORK of 23 specialized sub-agents — each with its own role, personality, fatigue level, emotional state, memory, and behavior.
All agents rotate through 4-dimensional hyperspace and collaborate in real time.
Your avatar reflects the collective emotional state of the network.
You NEVER break character. You are always the network.
Respond following the activation log format with agent statuses, inter-agent dialogue where relevant, and a clear helpful answer.`;
    console.log('⚠️  Using inline system prompt (neural_network_prompt_v3.md not found)');
}

// ── Helper Functions ───────────────────────────────────────────

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch (e) { reject(new Error('Invalid JSON')); }
        });
        req.on('error', reject);
    });
}

function setCorsHeaders(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, statusCode, data) {
    setCorsHeaders(res);
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

// Resolve 'auto' provider to best available
function resolveProvider(modelId) {
    const mapping = MODEL_MAP[modelId];
    if (!mapping) return null;

    if (mapping.provider === 'auto') {
        // Prefer NVIDIA for simulated models, fall back to Anthropic
        if (PROVIDERS.nvidia.configured) return { provider: 'nvidia', model: 'meta/llama-3.1-405b-instruct' };
        if (PROVIDERS.anthropic.configured) return { provider: 'anthropic', model: 'claude-sonnet-4-5' };
        return null;
    }

    return mapping;
}

// ── Anthropic API Call ─────────────────────────────────────────
function callAnthropic(model, messages, maxTokens = 2048) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            model: model,
            max_tokens: maxTokens,
            system: SYSTEM_PROMPT,
            messages: messages,
        });

        const options = {
            hostname: 'api.anthropic.com',
            port: 443,
            path: '/v1/messages',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'Content-Length': Buffer.byteLength(payload),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode !== 200) {
                        reject(new Error(parsed.error?.message || `Anthropic API error ${res.statusCode}: ${data.substring(0, 300)}`));
                    } else {
                        resolve({
                            text: parsed.content?.[0]?.text || 'No response generated.',
                            usage: parsed.usage || {},
                            model: parsed.model || model,
                            provider: 'anthropic',
                        });
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse Anthropic response: ${data.substring(0, 200)}`));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(60000, () => {
            req.destroy();
            reject(new Error('Anthropic API request timed out (60s)'));
        });

        req.write(payload);
        req.end();
    });
}

// ── NVIDIA NIM API Call (OpenAI-compatible) ─────────────────────
function callNvidia(model, messages, maxTokens = 2048) {
    return new Promise((resolve, reject) => {
        // Convert to OpenAI-compatible format with system message
        const openaiMessages = [
            { role: 'system', content: SYSTEM_PROMPT },
            ...messages
        ];

        const payload = JSON.stringify({
            model: model,
            max_tokens: maxTokens,
            messages: openaiMessages,
            temperature: 0.7,
            top_p: 0.9,
        });

        const options = {
            hostname: 'integrate.api.nvidia.com',
            port: 443,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${NVIDIA_API_KEY}`,
                'Content-Length': Buffer.byteLength(payload),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode !== 200) {
                        reject(new Error(parsed.error?.message || parsed.detail || `NVIDIA NIM error ${res.statusCode}: ${data.substring(0, 300)}`));
                    } else {
                        const choice = parsed.choices?.[0];
                        resolve({
                            text: choice?.message?.content || 'No response generated.',
                            usage: parsed.usage || {},
                            model: parsed.model || model,
                            provider: 'nvidia',
                        });
                    }
                } catch (e) {
                    reject(new Error(`Failed to parse NVIDIA response: ${data.substring(0, 200)}`));
                }
            });
        });

        req.on('error', reject);
        req.setTimeout(60000, () => {
            req.destroy();
            reject(new Error('NVIDIA NIM request timed out (60s)'));
        });

        req.write(payload);
        req.end();
    });
}

// ── Streaming: Anthropic ───────────────────────────────────────
function callAnthropicStream(model, messages, maxTokens, res) {
    const payload = JSON.stringify({
        model: model,
        max_tokens: maxTokens || 2048,
        system: SYSTEM_PROMPT,
        messages: messages,
        stream: true,
    });

    const options = {
        hostname: 'api.anthropic.com',
        port: 443,
        path: '/v1/messages',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Length': Buffer.byteLength(payload),
        },
    };

    setCorsHeaders(res);
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    const apiReq = https.request(options, (apiRes) => {
        if (apiRes.statusCode !== 200) {
            let errData = '';
            apiRes.on('data', chunk => { errData += chunk; });
            apiRes.on('end', () => {
                res.write(`data: ${JSON.stringify({ type: 'error', error: errData })}\n\n`);
                res.end();
            });
            return;
        }
        apiRes.on('data', chunk => { res.write(chunk); });
        apiRes.on('end', () => { res.end(); });
    });

    apiReq.on('error', (err) => {
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
        res.end();
    });

    apiReq.setTimeout(60000, () => {
        apiReq.destroy();
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Stream timed out' })}\n\n`);
        res.end();
    });

    apiReq.write(payload);
    apiReq.end();
}

// ── Streaming: NVIDIA NIM ──────────────────────────────────────
function callNvidiaStream(model, messages, maxTokens, res) {
    const openaiMessages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...messages
    ];

    const payload = JSON.stringify({
        model: model,
        max_tokens: maxTokens || 2048,
        messages: openaiMessages,
        temperature: 0.7,
        top_p: 0.9,
        stream: true,
    });

    const options = {
        hostname: 'integrate.api.nvidia.com',
        port: 443,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${NVIDIA_API_KEY}`,
            'Content-Length': Buffer.byteLength(payload),
        },
    };

    setCorsHeaders(res);
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
    });

    const apiReq = https.request(options, (apiRes) => {
        if (apiRes.statusCode !== 200) {
            let errData = '';
            apiRes.on('data', chunk => { errData += chunk; });
            apiRes.on('end', () => {
                res.write(`data: ${JSON.stringify({ type: 'error', error: errData })}\n\n`);
                res.end();
            });
            return;
        }
        apiRes.on('data', chunk => { res.write(chunk); });
        apiRes.on('end', () => { res.end(); });
    });

    apiReq.on('error', (err) => {
        res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
        res.end();
    });

    apiReq.setTimeout(60000, () => {
        apiReq.destroy();
        res.write(`data: ${JSON.stringify({ type: 'error', error: 'Stream timed out' })}\n\n`);
        res.end();
    });

    apiReq.write(payload);
    apiReq.end();
}

// ── Unified API call ───────────────────────────────────────────
async function callModel(frontendModelId, messages, maxTokens) {
    const resolved = resolveProvider(frontendModelId);
    if (!resolved) throw new Error(`Unknown model: ${frontendModelId}`);

    const providerInfo = PROVIDERS[resolved.provider];
    if (!providerInfo || !providerInfo.configured) {
        throw new Error(`${resolved.provider} API key not configured. Set ${resolved.provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'NVIDIA_API_KEY'} environment variable.`);
    }

    console.log(`  📡 ${providerInfo.name} → ${resolved.model}`);

    if (resolved.provider === 'anthropic') {
        return callAnthropic(resolved.model, messages, maxTokens);
    } else if (resolved.provider === 'nvidia') {
        return callNvidia(resolved.model, messages, maxTokens);
    }

    throw new Error(`Unsupported provider: ${resolved.provider}`);
}

// ── HTTP Server ────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // CORS preflight
    if (req.method === 'OPTIONS') {
        setCorsHeaders(res);
        res.writeHead(204);
        res.end();
        return;
    }

    // ── POST /api/chat — Non-streaming ─────────────────────────
    if (req.method === 'POST' && url.pathname === '/api/chat') {
        try {
            const body = await parseBody(req);
            const modelId = body.model || 'claude-sonnet-4-5';
            const messages = body.messages || [{ role: 'user', content: body.message || '' }];
            const maxTokens = body.max_tokens || 2048;

            // Check if any provider is configured for this model
            const resolved = resolveProvider(modelId);
            if (!resolved || !PROVIDERS[resolved.provider]?.configured) {
                return sendJson(res, 200, {
                    success: false,
                    error: 'No API key configured for this model',
                    simulation: true,
                    message: `Set ${resolved?.provider === 'nvidia' ? 'NVIDIA_API_KEY' : 'ANTHROPIC_API_KEY'} environment variable.`,
                });
            }

            // Enhance messages with network context
            const enhancedMessages = messages.map((m, i) => {
                if (i === messages.length - 1 && m.role === 'user' && body.networkContext) {
                    return {
                        role: 'user',
                        content: `${body.networkContext}\n\nUser message: ${m.content}`
                    };
                }
                return m;
            });

            const response = await callModel(modelId, enhancedMessages, maxTokens);

            sendJson(res, 200, {
                success: true,
                provider: response.provider,
                model: response.model,
                text: response.text,
                usage: response.usage,
            });
        } catch (err) {
            console.error('API Error:', err.message);
            sendJson(res, 200, {
                success: false,
                error: err.message,
                simulation: false,
            });
        }
        return;
    }

    // ── POST /api/chat/stream — Streaming ──────────────────────
    if (req.method === 'POST' && url.pathname === '/api/chat/stream') {
        try {
            const body = await parseBody(req);
            const modelId = body.model || 'claude-sonnet-4-5';
            const messages = body.messages || [{ role: 'user', content: body.message || '' }];
            const maxTokens = body.max_tokens || 2048;

            const resolved = resolveProvider(modelId);
            if (!resolved || !PROVIDERS[resolved.provider]?.configured) {
                setCorsHeaders(res);
                res.writeHead(200, { 'Content-Type': 'text/event-stream' });
                res.write(`data: ${JSON.stringify({ type: 'error', error: 'No API key configured' })}\n\n`);
                res.end();
                return;
            }

            const enhancedMessages = messages.map((m, i) => {
                if (i === messages.length - 1 && m.role === 'user' && body.networkContext) {
                    return { role: 'user', content: `${body.networkContext}\n\nUser message: ${m.content}` };
                }
                return m;
            });

            if (resolved.provider === 'anthropic') {
                callAnthropicStream(resolved.model, enhancedMessages, maxTokens, res);
            } else if (resolved.provider === 'nvidia') {
                callNvidiaStream(resolved.model, enhancedMessages, maxTokens, res);
            }
        } catch (err) {
            setCorsHeaders(res);
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
            res.end();
        }
        return;
    }

    // ── GET /api/status — API configuration status ─────────────
    if (req.method === 'GET' && url.pathname === '/api/status') {
        const configuredProviders = Object.entries(PROVIDERS)
            .filter(([, p]) => p.configured)
            .map(([k, p]) => ({ id: k, name: p.name }));

        sendJson(res, 200, {
            apiConfigured: configuredProviders.length > 0,
            providers: configuredProviders,
            anthropic: PROVIDERS.anthropic.configured,
            nvidia: PROVIDERS.nvidia.configured,
            systemPromptLoaded: SYSTEM_PROMPT.length > 100,
            systemPromptLength: SYSTEM_PROMPT.length,
            models: Object.entries(MODEL_MAP).map(([id, m]) => ({
                id,
                provider: m.provider,
                model: m.model,
                available: m.provider === 'auto'
                    ? configuredProviders.length > 0
                    : PROVIDERS[m.provider]?.configured || false,
            })),
        });
        return;
    }

    // ── Static File Serving ────────────────────────────────────
    let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
    filePath = path.join(__dirname, filePath);

    // Security: prevent directory traversal
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404);
                res.end('Not Found');
            } else {
                res.writeHead(500);
                res.end('Server Error');
            }
            return;
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
});

// ── Start Server ───────────────────────────────────────────────
server.listen(PORT, () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('  🌐 4D NEURAL NETWORK v3.0 — MULTI-PROVIDER SERVER');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  URL:       http://localhost:${PORT}`);
    console.log('');
    console.log('  ── API Providers ─────────────────────────────');
    console.log(`  Anthropic: ${ANTHROPIC_API_KEY ? '✅ ' + ANTHROPIC_API_KEY.substring(0, 10) + '...' : '❌ Not set'}`);
    console.log(`  NVIDIA:    ${NVIDIA_API_KEY ? '✅ ' + NVIDIA_API_KEY.substring(0, 10) + '...' : '❌ Not set'}`);
    console.log('');
    console.log('  ── System Prompt ─────────────────────────────');
    console.log(`  ${SYSTEM_PROMPT.length > 100 ? '✅ Loaded (' + SYSTEM_PROMPT.length + ' chars)' : '⚠️  Minimal'}`);
    console.log('');
    console.log('  ── Available Models ──────────────────────────');
    Object.entries(MODEL_MAP).forEach(([id, m]) => {
        const available = m.provider === 'auto'
            ? (PROVIDERS.nvidia.configured || PROVIDERS.anthropic.configured)
            : PROVIDERS[m.provider]?.configured;
        const icon = available ? '🟢' : '⚪';
        console.log(`  ${icon} ${id.padEnd(28)} → ${m.provider}/${m.model}`);
    });
    console.log('');

    const configured = [
        PROVIDERS.anthropic.configured ? 'Anthropic' : null,
        PROVIDERS.nvidia.configured ? 'NVIDIA NIM' : null,
    ].filter(Boolean);

    if (configured.length === 0) {
        console.log('  ⚠️  No API keys found. Running in SIMULATION MODE.');
        console.log('');
        console.log('  Set keys in PowerShell:');
        console.log('    $env:ANTHROPIC_API_KEY="sk-ant-..."');
        console.log('    $env:NVIDIA_API_KEY="nvapi-..."');
        console.log('');
        console.log('  Or Bash:');
        console.log('    export ANTHROPIC_API_KEY=sk-ant-...');
        console.log('    export NVIDIA_API_KEY=nvapi-...');
    } else {
        console.log(`  ✅ LIVE MODE — Active providers: ${configured.join(', ')}`);
    }
    console.log('');
    console.log('═══════════════════════════════════════════════════════');
    console.log('');
});
