/* ============================================================
   AVATAR.JS — 4D Living Avatar System v3.0
   Mood-responsive face with eyes, brows, mouth, and halo
   ============================================================ */

const AVATAR_MOOD_MAP = {
    happy:    { eyes: 'wide',       brows: 'raised',  mouth: 'smile',    haloColor: '#00E5AA', haloLabel: 'teal' },
    curious:  { eyes: 'widened',    brows: 'oneUp',   mouth: 'slight',   haloColor: '#5B9CF6', haloLabel: 'blue' },
    excited:  { eyes: 'large',      brows: 'high',    mouth: 'bigSmile', haloColor: '#FBBF24', haloLabel: 'gold' },
    bored:    { eyes: 'halfClosed', brows: 'flat',     mouth: 'flat',     haloColor: '#888888', haloLabel: 'gray' },
    stressed: { eyes: 'tense',      brows: 'furrowed', mouth: 'frown',    haloColor: '#FB7185', haloLabel: 'pink' },
    tired:    { eyes: 'nearlyClosed', brows: 'drooping', mouth: 'smallFrown', haloColor: '#9966cc', haloLabel: 'purple' },
    angry:    { eyes: 'narrowed',   brows: 'vShape',   mouth: 'deepFrown', haloColor: '#FF4444', haloLabel: 'red' },
};

class Avatar {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.mood = 'happy';
        this.targetMood = 'happy';
        this.energy = 1;
        this.virus = 0;
        this.time = 0;

        // Smooth interpolation targets
        this.eyeOpenness = 1;      // 0 = closed, 1 = full open
        this.browHeight = 0;       // -1 = furrowed, 0 = neutral, 1 = raised
        this.browAsymmetry = 0;    // 0 = symmetric, 1 = one brow raised
        this.mouthCurve = 0.5;     // 0 = frown, 0.5 = flat, 1 = big smile
        this.mouthOpen = 0;        // 0 = closed, 1 = open
        this.haloColor = '#00E5AA';
        this.haloAlpha = 0.8;
        this.pulsePhase = 0;

        // Neural ring particles
        this.ringParticles = [];
        for (let i = 0; i < 24; i++) {
            this.ringParticles.push({
                angle: (i / 24) * Math.PI * 2,
                radius: 0.85 + Math.random() * 0.15,
                speed: 0.3 + Math.random() * 0.5,
                size: 1 + Math.random() * 2,
                alpha: 0.3 + Math.random() * 0.7,
            });
        }

        this._resize();
        window.addEventListener('resize', () => this._resize());
    }

    _resize() {
        const rect = this.canvas.parentElement.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        const size = Math.min(rect.width, rect.height);
        this.canvas.width = size * dpr;
        this.canvas.height = size * dpr;
        this.canvas.style.width = size + 'px';
        this.canvas.style.height = size + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.size = size;
        this.cx = size / 2;
        this.cy = size / 2;
    }

    setMood(mood) {
        this.targetMood = mood;
        this.mood = mood;
        const map = AVATAR_MOOD_MAP[mood] || AVATAR_MOOD_MAP.happy;
        this.haloColor = map.haloColor;

        // Set targets based on mood
        switch (mood) {
            case 'happy':
                this.eyeOpenness = 0.9; this.browHeight = 0.2; this.browAsymmetry = 0;
                this.mouthCurve = 0.8; this.mouthOpen = 0.1; break;
            case 'curious':
                this.eyeOpenness = 0.85; this.browHeight = 0.3; this.browAsymmetry = 0.6;
                this.mouthCurve = 0.6; this.mouthOpen = 0; break;
            case 'excited':
                this.eyeOpenness = 1; this.browHeight = 0.5; this.browAsymmetry = 0;
                this.mouthCurve = 1; this.mouthOpen = 0.3; break;
            case 'bored':
                this.eyeOpenness = 0.4; this.browHeight = -0.1; this.browAsymmetry = 0;
                this.mouthCurve = 0.45; this.mouthOpen = 0; break;
            case 'stressed':
                this.eyeOpenness = 0.7; this.browHeight = -0.4; this.browAsymmetry = 0.1;
                this.mouthCurve = 0.3; this.mouthOpen = 0; break;
            case 'tired':
                this.eyeOpenness = 0.2; this.browHeight = -0.3; this.browAsymmetry = 0;
                this.mouthCurve = 0.35; this.mouthOpen = 0; break;
            case 'angry':
                this.eyeOpenness = 0.5; this.browHeight = -0.5; this.browAsymmetry = 0;
                this.mouthCurve = 0.15; this.mouthOpen = 0; break;
        }
    }

    setEnergy(e) { this.energy = e; }
    setVirus(v) { this.virus = v; }

    getStatusLine() {
        const map = AVATAR_MOOD_MAP[this.mood] || AVATAR_MOOD_MAP.happy;
        const moodEmoji = MOODS[this.mood]?.emoji || '😊';
        let line = `[Avatar: ${moodEmoji} ${this.mood} · ${map.haloLabel} halo`;
        if (this.eyeOpenness > 0.8) line += ' · bright eyes';
        else if (this.eyeOpenness > 0.5) line += ' · eyes open';
        else if (this.eyeOpenness > 0.3) line += ' · half-closed eyes';
        else line += ' · nearly closed eyes';
        if (this.mouthCurve > 0.7) line += ' · wide smile';
        else if (this.mouthCurve > 0.5) line += ' · slight smile';
        else if (this.mouthCurve < 0.3) line += ' · frown';
        if (this.virus > 0.2) line += ` · 🦠 ${Math.round(this.virus * 100)}% infected`;
        line += ']';
        return line;
    }

    update(dt) {
        this.time += dt;
        this.pulsePhase += dt * 2;

        // Update ring particles
        this.ringParticles.forEach(p => {
            p.angle += dt * p.speed;
        });
    }

    draw() {
        const ctx = this.ctx;
        const cx = this.cx;
        const cy = this.cy;
        const r = this.size * 0.35; // face radius
        ctx.clearRect(0, 0, this.size, this.size);

        // === OUTER HALO / NEURAL RINGS ===
        this._drawHalo(ctx, cx, cy, r);

        // === FACE BASE ===
        this._drawFace(ctx, cx, cy, r);

        // === EYES ===
        this._drawEyes(ctx, cx, cy, r);

        // === EYEBROWS ===
        this._drawBrows(ctx, cx, cy, r);

        // === MOUTH ===
        this._drawMouth(ctx, cx, cy, r);

        // === VIRUS OVERLAY ===
        if (this.virus > 0.1) {
            this._drawVirusOverlay(ctx, cx, cy, r);
        }

        // === FATIGUE OVERLAY ===
        if (this.energy < 0.4) {
            ctx.beginPath();
            ctx.arc(cx, cy, r + 10, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(0,0,0,${(1 - this.energy) * 0.4})`;
            ctx.fill();
        }
    }

    _drawHalo(ctx, cx, cy, r) {
        const haloR = r + 20;
        const pulse = 0.7 + Math.sin(this.pulsePhase) * 0.3;

        // Outer glow
        const glow = ctx.createRadialGradient(cx, cy, r, cx, cy, haloR + 15);
        glow.addColorStop(0, this.haloColor + '30');
        glow.addColorStop(0.5, this.haloColor + Math.round(pulse * 40).toString(16).padStart(2, '0'));
        glow.addColorStop(1, this.haloColor + '00');
        ctx.beginPath();
        ctx.arc(cx, cy, haloR + 15, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();

        // Neural ring
        ctx.save();
        ctx.translate(cx, cy);
        this.ringParticles.forEach(p => {
            const pr = haloR * p.radius;
            const px = Math.cos(p.angle) * pr;
            const py = Math.sin(p.angle) * pr;
            ctx.beginPath();
            ctx.arc(px, py, p.size, 0, Math.PI * 2);
            ctx.fillStyle = this.haloColor + Math.round(p.alpha * pulse * 200).toString(16).padStart(2, '0');
            ctx.fill();
        });

        // Ring lines
        ctx.beginPath();
        ctx.arc(0, 0, haloR, 0, Math.PI * 2);
        ctx.strokeStyle = this.haloColor + '25';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(0, 0, haloR - 8, 0, Math.PI * 2);
        ctx.strokeStyle = this.haloColor + '15';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.restore();
    }

    _drawFace(ctx, cx, cy, r) {
        // Face gradient
        const faceGrad = ctx.createRadialGradient(cx, cy - r * 0.1, 0, cx, cy, r);
        faceGrad.addColorStop(0, '#2a2a3e');
        faceGrad.addColorStop(0.7, '#1a1a2e');
        faceGrad.addColorStop(1, '#111122');
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = faceGrad;
        ctx.fill();

        // Subtle border
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = this.haloColor + '30';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    _drawEyes(ctx, cx, cy, r) {
        const eyeSpacing = r * 0.35;
        const eyeY = cy - r * 0.1;
        const eyeW = r * 0.2;
        const eyeH = r * 0.12 * this.eyeOpenness;

        // Micro-animation: slight darting for stressed
        let dartX = 0;
        if (this.mood === 'stressed') {
            dartX = Math.sin(this.time * 5) * 2;
        }

        [cx - eyeSpacing, cx + eyeSpacing].forEach((ex, i) => {
            // Eye white (dark)
            ctx.beginPath();
            ctx.ellipse(ex + dartX, eyeY, eyeW, Math.max(1, eyeH), 0, 0, Math.PI * 2);
            ctx.fillStyle = '#e0e0f0';
            ctx.fill();

            // Iris
            if (eyeH > 2) {
                const irisR = Math.min(eyeH * 0.7, eyeW * 0.5);
                ctx.beginPath();
                ctx.arc(ex + dartX, eyeY, irisR, 0, Math.PI * 2);
                ctx.fillStyle = this.haloColor;
                ctx.fill();

                // Pupil
                ctx.beginPath();
                ctx.arc(ex + dartX, eyeY, irisR * 0.45, 0, Math.PI * 2);
                ctx.fillStyle = '#0a0a15';
                ctx.fill();

                // Eye highlight
                ctx.beginPath();
                ctx.arc(ex + dartX - irisR * 0.2, eyeY - irisR * 0.25, irisR * 0.2, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255,255,255,0.7)';
                ctx.fill();
            }

            // Glow for excited mood
            if (this.mood === 'excited') {
                const eyeGlow = ctx.createRadialGradient(ex, eyeY, 0, ex, eyeY, eyeW * 2);
                eyeGlow.addColorStop(0, this.haloColor + '30');
                eyeGlow.addColorStop(1, this.haloColor + '00');
                ctx.beginPath();
                ctx.arc(ex, eyeY, eyeW * 2, 0, Math.PI * 2);
                ctx.fillStyle = eyeGlow;
                ctx.fill();
            }
        });
    }

    _drawBrows(ctx, cx, cy, r) {
        const eyeSpacing = r * 0.35;
        const browY = cy - r * 0.25;
        const browW = r * 0.22;

        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#a0a0c0';

        // Left brow
        const leftBrowOffset = -this.browHeight * 8;
        const leftAsym = this.browAsymmetry > 0 ? -this.browAsymmetry * 5 : 0;
        ctx.beginPath();
        ctx.moveTo(cx - eyeSpacing - browW, browY + leftBrowOffset + leftAsym + 3);
        if (this.browHeight < -0.3) {
            // V-shape furrowed
            ctx.lineTo(cx - eyeSpacing, browY + leftBrowOffset - 4);
            ctx.lineTo(cx - eyeSpacing + browW * 0.5, browY + leftBrowOffset + 2);
        } else {
            ctx.quadraticCurveTo(cx - eyeSpacing, browY + leftBrowOffset - 4, cx - eyeSpacing + browW, browY + leftBrowOffset + 3 + leftAsym);
        }
        ctx.stroke();

        // Right brow
        const rightAsym = this.browAsymmetry > 0 ? -this.browAsymmetry * 10 : 0;
        ctx.beginPath();
        ctx.moveTo(cx + eyeSpacing - browW, browY + leftBrowOffset + 3 + rightAsym);
        if (this.browHeight < -0.3) {
            ctx.lineTo(cx + eyeSpacing, browY + leftBrowOffset - 4);
            ctx.lineTo(cx + eyeSpacing + browW * 0.5, browY + leftBrowOffset + 2);
        } else {
            ctx.quadraticCurveTo(cx + eyeSpacing, browY + leftBrowOffset - 4 + rightAsym, cx + eyeSpacing + browW, browY + leftBrowOffset + 3);
        }
        ctx.stroke();
    }

    _drawMouth(ctx, cx, cy, r) {
        const mouthY = cy + r * 0.3;
        const mouthW = r * 0.3;
        const curveAmount = (this.mouthCurve - 0.5) * 20; // negative = frown, positive = smile

        ctx.lineWidth = 2.5;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#c0c0d8';

        ctx.beginPath();
        ctx.moveTo(cx - mouthW, mouthY);
        ctx.quadraticCurveTo(cx, mouthY + curveAmount, cx + mouthW, mouthY);
        ctx.stroke();

        // Open mouth for excited/big smile
        if (this.mouthOpen > 0.1 && this.mouthCurve > 0.6) {
            ctx.beginPath();
            ctx.ellipse(cx, mouthY + curveAmount * 0.3, mouthW * 0.6, this.mouthOpen * 8, 0, 0, Math.PI);
            ctx.fillStyle = '#1a0a20';
            ctx.fill();
        }
    }

    _drawVirusOverlay(ctx, cx, cy, r) {
        // Red tint overlay
        ctx.beginPath();
        ctx.arc(cx, cy, r + 5, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(239, 68, 68, ${this.virus * 0.15})`;
        ctx.fill();

        // Virus badge
        const badgeX = cx + r * 0.6;
        const badgeY = cy - r * 0.6;
        ctx.font = `${12 + this.virus * 8}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(239, 68, 68, ${0.5 + this.virus * 0.5})`;
        ctx.fillText('🦠', badgeX, badgeY);

        // Glitch lines
        if (this.virus > 0.4) {
            for (let i = 0; i < 3; i++) {
                const y = cy - r + Math.random() * r * 2;
                const w = 5 + Math.random() * 30;
                ctx.fillStyle = `rgba(239, 68, 68, ${0.1 + Math.random() * 0.2})`;
                ctx.fillRect(cx - r + Math.random() * r, y, w, 1);
            }
        }
    }
}

window.Avatar = Avatar;
window.AVATAR_MOOD_MAP = AVATAR_MOOD_MAP;
