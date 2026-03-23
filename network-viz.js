/* ============================================================
   NETWORK-VIZ.JS — 4D Network Visualization (Canvas)
   ============================================================ */

class NetworkVisualizer {
    constructor(canvas, network) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.network = network;
        this.width = 0;
        this.height = 0;
        this.time = 0;
        this.viewMode = '4d'; // '4d', 'layers', 'flow'
        this.hoveredAgent = null;
        this.selectedAgent = null;
        this.particles = [];
        this.flowParticles = [];
        this.wormholeEffect = 0;
        this.blackholeEffect = 0;

        // 4D rotation angles
        this.rotXY = 0;
        this.rotXZ = 0;
        this.rotXW = 0;
        this.rotYZ = 0;
        this.mouseX = 0;
        this.mouseY = 0;
        this.isMouseOver = false;

        this._initPositions();
        this._initParticles();
        this._bindEvents();
        this._resize();
    }

    _initPositions() {
        const agents = this.network.agents;
        agents.forEach((agent, i) => {
            const layerAgents = agents.filter(a => a.layer === agent.layer);
            const indexInLayer = layerAgents.indexOf(agent);
            const totalInLayer = layerAgents.length;

            // Arrange in layered rings in 4D space
            const layerRadius = 1.5 + agent.layer * 0.8;
            const angle = (indexInLayer / totalInLayer) * Math.PI * 2 + agent.layer * 0.3;
            const layerZ = (agent.layer - 2) * 1.2;

            agent.x = Math.cos(angle) * layerRadius;
            agent.y = Math.sin(angle) * layerRadius;
            agent.z = layerZ;
            agent.w = Math.sin(angle * 2 + agent.layer) * 0.8; // 4th dimension
        });
    }

    _initParticles() {
        // Background particles
        for (let i = 0; i < 80; i++) {
            this.particles.push({
                x: Math.random() * 2 - 1,
                y: Math.random() * 2 - 1,
                z: Math.random() * 2 - 1,
                size: 0.5 + Math.random() * 1.5,
                speed: 0.002 + Math.random() * 0.005,
                alpha: 0.1 + Math.random() * 0.3,
                color: LAYER_COLORS[Math.floor(Math.random() * 5)],
            });
        }
    }

    _bindEvents() {
        this.canvas.addEventListener('mousemove', e => {
            const rect = this.canvas.getBoundingClientRect();
            this.mouseX = (e.clientX - rect.left) / rect.width * 2 - 1;
            this.mouseY = (e.clientY - rect.top) / rect.height * 2 - 1;
            this.isMouseOver = true;
            this._checkHover(e.clientX - rect.left, e.clientY - rect.top);
        });

        this.canvas.addEventListener('mouseleave', () => {
            this.isMouseOver = false;
            this.hoveredAgent = null;
        });

        this.canvas.addEventListener('click', e => {
            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            this._checkClick(mx, my);
        });

        window.addEventListener('resize', () => this._resize());
    }

    _resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.width = rect.width;
        this.height = rect.height - 50; // Account for header
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.canvas.style.width = this.width + 'px';
        this.canvas.style.height = this.height + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    _checkHover(mx, my) {
        this.hoveredAgent = null;
        for (const agent of this.network.agents) {
            const dx = mx - agent.screenX;
            const dy = my - agent.screenY;
            if (dx * dx + dy * dy < (agent.screenRadius + 5) * (agent.screenRadius + 5)) {
                this.hoveredAgent = agent;
                this.canvas.style.cursor = 'pointer';
                return;
            }
        }
        this.canvas.style.cursor = 'crosshair';
    }

    _checkClick(mx, my) {
        for (const agent of this.network.agents) {
            const dx = mx - agent.screenX;
            const dy = my - agent.screenY;
            if (dx * dx + dy * dy < (agent.screenRadius + 8) * (agent.screenRadius + 8)) {
                this.selectedAgent = agent;
                if (window.app) window.app.showAgentDetail(agent);
                return;
            }
        }
        this.selectedAgent = null;
    }

    setView(mode) {
        this.viewMode = mode;
    }

    triggerWormhole() {
        this.wormholeEffect = 1;
    }

    // 4D → 3D → 2D projection
    _project(x, y, z, w) {
        // Rotate in 4D
        let nx, ny, nz, nw;

        // XW rotation (4th dimension rotation)
        nx = x * Math.cos(this.rotXW) - w * Math.sin(this.rotXW);
        nw = x * Math.sin(this.rotXW) + w * Math.cos(this.rotXW);
        x = nx; w = nw;

        // XZ rotation
        nx = x * Math.cos(this.rotXZ) - z * Math.sin(this.rotXZ);
        nz = x * Math.sin(this.rotXZ) + z * Math.cos(this.rotXZ);
        x = nx; z = nz;

        // XY rotation
        nx = x * Math.cos(this.rotXY) - y * Math.sin(this.rotXY);
        ny = x * Math.sin(this.rotXY) + y * Math.cos(this.rotXY);
        x = nx; y = ny;

        // Perspective projection from 4D to 2D
        const d4 = 4; // 4D perspective distance
        const d3 = 5; // 3D perspective distance
        const scale4 = d4 / (d4 - w);
        const px = x * scale4;
        const py = y * scale4;
        const pz = z * scale4;

        const scale3 = d3 / (d3 - pz);
        const sx = px * scale3;
        const sy = py * scale3;

        return {
            x: this.width / 2 + sx * this.width * 0.12,
            y: this.height / 2 + sy * this.height * 0.12,
            scale: scale3 * scale4,
            depth: pz,
        };
    }

    update(dt) {
        this.time += dt;

        // Auto-rotate
        const rotSpeed = 0.15;
        this.rotXW += dt * rotSpeed * 0.3;
        this.rotXZ += dt * rotSpeed * 0.5;

        // Mouse-influenced rotation
        if (this.isMouseOver) {
            this.rotXY += this.mouseX * dt * 0.5;
            this.rotYZ += this.mouseY * dt * 0.3;
        } else {
            this.rotXY += dt * rotSpeed * 0.2;
        }

        // Update agent positions with gentle oscillation
        this.network.agents.forEach(agent => {
            const osc = Math.sin(this.time * 0.5 + agent.id * 0.7) * 0.15;
            const baseX = agent.x + osc;
            const baseY = agent.y + Math.cos(this.time * 0.3 + agent.id * 1.1) * 0.1;

            // Black hole effect — pull toward center
            if (this.network.blackHoleActive) {
                const pull = 0.3;
                agent.targetX = agent.x * (1 - pull);
                agent.targetY = agent.y * (1 - pull);
                agent.targetZ = agent.z * (1 - pull);
            }

            const proj = this._project(baseX, baseY, agent.z, agent.w);
            agent.screenX = proj.x;
            agent.screenY = proj.y;
            agent.screenRadius = Math.max(4, Math.min(14, 7 * proj.scale));
        });

        // Update particles
        this.particles.forEach(p => {
            p.y += p.speed;
            if (p.y > 1.5) p.y = -1.5;
        });

        // Wormhole effect decay
        if (this.wormholeEffect > 0) {
            this.wormholeEffect -= dt * 0.8;
        }

        // Flow particles
        if (this.viewMode === 'flow' || this.network.getActiveAgents().length > 0) {
            this._updateFlowParticles(dt);
        }
    }

    _updateFlowParticles(dt) {
        // Spawn flow particles along connections
        if (Math.random() < 0.3) {
            const conn = this.network.connections[Math.floor(Math.random() * this.network.connections.length)];
            const from = this.network.agents[conn.from];
            const to = this.network.agents[conn.to];
            if (from.active || to.active || this.viewMode === 'flow') {
                this.flowParticles.push({
                    fromId: conn.from,
                    toId: conn.to,
                    t: 0,
                    speed: 0.5 + Math.random() * 1.5,
                    color: from.color,
                    size: 1.5 + Math.random() * 2,
                });
            }
        }

        // Update flow particles
        for (let i = this.flowParticles.length - 1; i >= 0; i--) {
            const fp = this.flowParticles[i];
            fp.t += dt * fp.speed;
            if (fp.t > 1) {
                this.flowParticles.splice(i, 1);
            }
        }

        // Cap particles
        if (this.flowParticles.length > 200) {
            this.flowParticles.splice(0, this.flowParticles.length - 200);
        }
    }

    draw() {
        const ctx = this.ctx;
        ctx.clearRect(0, 0, this.width, this.height);

        // Background
        const bgGrad = ctx.createRadialGradient(
            this.width / 2, this.height / 2, 0,
            this.width / 2, this.height / 2, this.width * 0.6
        );
        bgGrad.addColorStop(0, 'rgba(20, 20, 35, 0.5)');
        bgGrad.addColorStop(1, 'rgba(10, 10, 15, 0)');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, this.width, this.height);

        // Background particles
        this.particles.forEach(p => {
            const proj = this._project(p.x, p.y, p.z, 0);
            ctx.beginPath();
            ctx.arc(proj.x, proj.y, p.size * proj.scale * 0.5, 0, Math.PI * 2);
            ctx.fillStyle = p.color + Math.round(p.alpha * 60).toString(16).padStart(2, '0');
            ctx.fill();
        });

        // Sort agents by depth for proper rendering
        const sortedAgents = [...this.network.agents].sort((a, b) => {
            const pa = this._project(a.x, a.y, a.z, a.w);
            const pb = this._project(b.x, b.y, b.z, b.w);
            return pa.depth - pb.depth;
        });

        // Draw connections
        ctx.lineWidth = 0.5;
        this.network.connections.forEach(conn => {
            const from = this.network.agents[conn.from];
            const to = this.network.agents[conn.to];
            const isActive = from.active && to.active;

            ctx.beginPath();
            ctx.moveTo(from.screenX, from.screenY);
            ctx.lineTo(to.screenX, to.screenY);

            if (isActive) {
                ctx.strokeStyle = from.color + '60';
                ctx.lineWidth = 1.5;
            } else {
                ctx.strokeStyle = 'rgba(255,255,255,0.04)';
                ctx.lineWidth = 0.5;
            }
            ctx.stroke();
        });

        // Draw flow particles
        this.flowParticles.forEach(fp => {
            const from = this.network.agents[fp.fromId];
            const to = this.network.agents[fp.toId];
            const x = from.screenX + (to.screenX - from.screenX) * fp.t;
            const y = from.screenY + (to.screenY - from.screenY) * fp.t;
            const alpha = Math.sin(fp.t * Math.PI);

            ctx.beginPath();
            ctx.arc(x, y, fp.size, 0, Math.PI * 2);
            ctx.fillStyle = fp.color + Math.round(alpha * 200).toString(16).padStart(2, '0');
            ctx.fill();
        });

        // Draw agents
        sortedAgents.forEach(agent => {
            this._drawAgent(ctx, agent);
        });

        // Wormhole visual
        if (this.wormholeEffect > 0) {
            this._drawWormhole(ctx);
        }

        // Black hole visual
        if (this.network.blackHoleActive) {
            this._drawBlackHole(ctx);
        }

        // Tooltip for hovered agent
        if (this.hoveredAgent) {
            this._drawTooltip(ctx, this.hoveredAgent);
        }
    }

    _drawAgent(ctx, agent) {
        const x = agent.screenX;
        const y = agent.screenY;
        const r = agent.screenRadius;

        // Glow
        if (agent.active) {
            const glowSize = r * 4;
            const glow = ctx.createRadialGradient(x, y, r, x, y, glowSize);
            glow.addColorStop(0, agent.color + '40');
            glow.addColorStop(1, agent.color + '00');
            ctx.beginPath();
            ctx.arc(x, y, glowSize, 0, Math.PI * 2);
            ctx.fillStyle = glow;
            ctx.fill();
        }

        // Virus ring
        if (agent.virus > 0.1) {
            ctx.beginPath();
            ctx.arc(x, y, r + 4, 0, Math.PI * 2 * agent.virus);
            ctx.strokeStyle = '#ef4444' + Math.round(agent.virus * 200).toString(16).padStart(2, '0');
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // Main circle
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);

        if (agent.resting) {
            ctx.fillStyle = 'rgba(60, 60, 80, 0.5)';
        } else if (agent.isHybrid) {
            const hybGrad = ctx.createRadialGradient(x, y, 0, x, y, r);
            hybGrad.addColorStop(0, '#FBBF24');
            hybGrad.addColorStop(1, agent.color);
            ctx.fillStyle = hybGrad;
        } else {
            ctx.fillStyle = agent.color;
        }
        ctx.fill();

        // Inner highlight
        ctx.beginPath();
        ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.4, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fill();

        // Fatigue indicator (dimming)
        if (agent.fatigue > 0.5) {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0,0,0,${agent.fatigue * 0.5})`;
            ctx.fill();
        }

        // Pulse ring for active agents
        if (agent.active) {
            const pulseR = r + 3 + Math.sin(this.time * 4) * 3;
            ctx.beginPath();
            ctx.arc(x, y, pulseR, 0, Math.PI * 2);
            ctx.strokeStyle = agent.color + '80';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        // Hybrid star
        if (agent.isHybrid) {
            ctx.font = `${r}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText('★', x, y + 1);
        }

        // Agent label (only when close enough / hovered / selected)
        if (agent === this.hoveredAgent || agent === this.selectedAgent || agent.screenRadius > 9) {
            ctx.font = '10px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = agent.color;
            ctx.fillText(agent.name, x, y + r + 6);
        }
    }

    _drawWormhole(ctx) {
        const cx = this.width / 2;
        const cy = this.height / 2;
        const alpha = this.wormholeEffect;

        for (let i = 0; i < 3; i++) {
            const r = 30 + i * 40 + Math.sin(this.time * 3 + i) * 10;
            ctx.beginPath();
            ctx.arc(cx, cy, r * alpha, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(167, 139, 250, ${alpha * 0.3 / (i + 1)})`;
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    }

    _drawBlackHole(ctx) {
        const cx = this.width / 2;
        const cy = this.height / 2;

        // Black hole center
        const bhGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 60);
        bhGrad.addColorStop(0, 'rgba(0, 0, 0, 0.8)');
        bhGrad.addColorStop(0.5, 'rgba(239, 68, 68, 0.1)');
        bhGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.beginPath();
        ctx.arc(cx, cy, 60, 0, Math.PI * 2);
        ctx.fillStyle = bhGrad;
        ctx.fill();

        // Accretion disk
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(this.time * 0.5);
        ctx.beginPath();
        ctx.ellipse(0, 0, 70, 20, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(251, 113, 133, 0.3)';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();
    }

    _drawTooltip(ctx, agent) {
        const x = agent.screenX;
        const y = agent.screenY - agent.screenRadius - 50;
        const text = `${agent.icon} ${agent.name} | ${agent.moodData.emoji} ${agent.mood} | E:${agent.energyPct}% F:${agent.fatiguePct}%`;

        ctx.font = '10px "JetBrains Mono", monospace';
        const metrics = ctx.measureText(text);
        const tw = metrics.width + 16;
        const th = 24;
        const tx = Math.max(4, Math.min(this.width - tw - 4, x - tw / 2));
        const ty = Math.max(4, y);

        // Background
        ctx.fillStyle = 'rgba(22, 22, 31, 0.95)';
        ctx.beginPath();
        ctx.roundRect(tx, ty, tw, th, 4);
        ctx.fill();
        ctx.strokeStyle = agent.color + '60';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Text
        ctx.fillStyle = '#e0e0e8';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, tx + 8, ty + th / 2);
    }
}

window.NetworkVisualizer = NetworkVisualizer;
