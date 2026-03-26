/**
 * Justin's Status Avatar — ported from known.life avatar system
 * Fixed identity: steel blue, dot eyes, arched brows
 * Emotion states driven by system status
 */

// ── Fixed Identity ──────────────────────────────────────────────────

const STEEL_BLUE = {
  light: { bg: '#4682B4', fg: '#FFFFFF' },
  dark:  { bg: '#2C5F8A', fg: '#E8EEF4' },
};

const DEAD_PALETTE = {
  light: { bg: '#7A8A96', fg: '#C0C8D0' },
  dark:  { bg: '#3A4248', fg: '#8A9098' },
};

const TRAITS = {
  eyeShape: 'dot',
  brows: 'arched',
  eyeSpacing: 12,
  eyeSize: 1.0,
  eyeY: 0,
};

// ── Animation Math ──────────────────────────────────────────────────

function noise(t, seed) {
  return (
    Math.sin(t * 1.0 + seed) * 0.5 +
    Math.sin(t * 2.3 + seed * 1.7) * 0.3 +
    Math.sin(t * 4.1 + seed * 0.3) * 0.2
  );
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function xorshift(seed) {
  let s = seed | 1;
  return () => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// ── Emotion States ──────────────────────────────────────────────────

const REST_STATE = {
  gazeX: 0, gazeY: 0, lidClose: 0, browRaise: 0,
  browTilt: 0, squint: 0, breathY: 0,
};

/**
 * System status → emotion mapping
 * @param {string} status - 'active'|'idle'|'sleeping'|'deep_sleep'|'dead'|'working'|'error'
 * @param {number} elapsed - ms since animation start
 * @param {number} t - seconds since animation start
 * @param {function} rng - seeded random
 */
function getEmotionParams(status) {
  switch (status) {
    case 'active':
      return {
        breathSpeed: 4, restlessness: 0.8, blinkRate: 3.5,
        gazeSpeed: 0.7, expressiveness: 0.6, squintBase: 0,
        browBase: 0, browTiltBase: 0, lidBase: 0,
        eventFrequency: 0.7,
      };
    case 'idle':
      return {
        breathSpeed: 5.5, restlessness: 0.3, blinkRate: 4.5,
        gazeSpeed: 0.3, expressiveness: 0.3, squintBase: 0,
        browBase: -0.1, browTiltBase: 0, lidBase: 0.05,
        eventFrequency: 0.3,
      };
    case 'sleeping':
      return {
        breathSpeed: 7, restlessness: 0, blinkRate: 0,
        gazeSpeed: 0, expressiveness: 0, squintBase: 0,
        browBase: -0.2, browTiltBase: 0, lidBase: 1.0,
        eventFrequency: 0, sleeping: true,
      };
    case 'deep_sleep':
      return {
        breathSpeed: 8, restlessness: 0, blinkRate: 0,
        gazeSpeed: 0, expressiveness: 0, squintBase: 0,
        browBase: -0.1, browTiltBase: 0, lidBase: 1.0,
        eventFrequency: 0, sleeping: true, deep: true,
      };
    case 'dead':
      return { dead: true };
    case 'working':
      return {
        breathSpeed: 3.5, restlessness: 0.5, blinkRate: 3.0,
        gazeSpeed: 0.9, expressiveness: 0.4, squintBase: 0.15,
        browBase: -0.15, browTiltBase: 0, lidBase: 0,
        eventFrequency: 0.2,
      };
    case 'error':
      return {
        breathSpeed: 3, restlessness: 0.6, blinkRate: 2.5,
        gazeSpeed: 0.5, expressiveness: 0.5, squintBase: 0.05,
        browBase: 0.1, browTiltBase: 0.3, lidBase: 0,
        eventFrequency: 0.4,
      };
    default:
      return getEmotionParams('active');
  }
}

// ── Avatar Animator ─────────────────────────────────────────────────

class AvatarAnimator {
  constructor(svgElement, options = {}) {
    this.svg = svgElement;
    this.status = options.status || 'active';
    this.targetStatus = this.status;
    this.transitionProgress = 1;
    this.seed = 42;
    this.rng = xorshift(this.seed);
    this.startTime = performance.now();
    this.lastFrame = 0;
    this.currentState = { ...REST_STATE };
    this.prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    // Animation sub-states
    this.blink = {
      nextBlink: this.rng() * 3500,
      blinkPhase: 0,
      isDouble: false,
      doublePhase: 0,
    };
    this.gaze = {
      targetX: 0, targetY: 0, currentX: 0, currentY: 0,
      nextShift: this.rng() * 1500, holdUntil: 0,
    };
    this.expr = {
      targetBrow: 0, targetSquint: 0, targetBrowTilt: 0,
      currentBrow: 0, currentSquint: 0, currentBrowTilt: 0,
      nextChange: 2000 + this.rng() * 4000,
    };
    this.event = {
      active: false, type: '', startTime: 0, duration: 0,
      nextEvent: 5000 + this.rng() * 10000,
    };
    this.sleepTwitch = {
      nextTwitch: 5000 + this.rng() * 12000,
      gx: 0, gy: 0, brow: 0, squint: 0,
    };

    // Sleeping Z's
    this.zParticles = [];

    // Listen for scheme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      this.isDark = e.matches;
      this._updatePalette();
    });

    this._buildSVG();

    if (!this.prefersReducedMotion) {
      this._startLoop();
    } else {
      this._renderStatic();
    }
  }

  setStatus(newStatus) {
    if (newStatus === this.status && this.transitionProgress >= 1) return;
    this.targetStatus = newStatus;
    this.transitionProgress = 0;
    if (newStatus === 'dead' || this.status === 'dead') {
      this._updatePalette();
    }
    this.status = newStatus;
  }

  _getPalette() {
    if (this.status === 'dead' || this.targetStatus === 'dead') {
      return this.isDark ? DEAD_PALETTE.dark : DEAD_PALETTE.light;
    }
    return this.isDark ? STEEL_BLUE.dark : STEEL_BLUE.light;
  }

  _updatePalette() {
    const pal = this._getPalette();
    if (this.bgCircle) this.bgCircle.setAttribute('fill', pal.bg);
  }

  _buildSVG() {
    const svg = this.svg;
    svg.setAttribute('viewBox', '0 0 64 64');
    svg.innerHTML = '';

    const pal = this._getPalette();

    // Background rect (fills entire SVG, CSS handles corner rounding)
    this.bgCircle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    this.bgCircle.setAttribute('x', '0');
    this.bgCircle.setAttribute('y', '0');
    this.bgCircle.setAttribute('width', '64');
    this.bgCircle.setAttribute('height', '64');
    this.bgCircle.setAttribute('fill', pal.bg);
    svg.appendChild(this.bgCircle);

    // Face group (for breathing transform)
    this.faceGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(this.faceGroup);

    // Eyes container
    this.leftEyeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.rightEyeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    this.faceGroup.appendChild(this.leftEyeGroup);
    this.faceGroup.appendChild(this.rightEyeGroup);

    // Brows
    this.leftBrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.rightBrow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.leftBrow.setAttribute('fill', 'none');
    this.leftBrow.setAttribute('stroke-width', '1.3');
    this.leftBrow.setAttribute('stroke-linecap', 'round');
    this.leftBrow.setAttribute('opacity', '0.65');
    this.rightBrow.setAttribute('fill', 'none');
    this.rightBrow.setAttribute('stroke-width', '1.3');
    this.rightBrow.setAttribute('stroke-linecap', 'round');
    this.rightBrow.setAttribute('opacity', '0.65');
    this.faceGroup.appendChild(this.leftBrow);
    this.faceGroup.appendChild(this.rightBrow);

    // Z's container (outside face group so they don't breathe)
    this.zGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    svg.appendChild(this.zGroup);
  }

  _renderEyes(state, fg) {
    const centerX = 32;
    const centerY = 30 + TRAITS.eyeY;
    const leftX = centerX - TRAITS.eyeSpacing;
    const rightX = centerX + TRAITS.eyeSpacing;
    const size = TRAITS.eyeSize;

    const gazeX = state.gazeX * 2.5;
    const gazeY = state.gazeY * 2;
    const lidScale = 1 - state.lidClose;
    const squintScale = 1 - state.squint * 0.4;
    const yScale = Math.max(lidScale * squintScale, 0.05);

    // Check if dead (X eyes)
    if (this.status === 'dead') {
      this._renderXEyes(leftX, rightX, centerY, size, fg);
      return;
    }

    // If nearly fully closed, render as lines
    if (yScale < 0.1) {
      this._renderClosedEyes(leftX, rightX, centerY, size, fg);
      return;
    }

    // Dot eyes — amplified gaze for visible "looking around"
    const r = 2.2 * yScale;
    this.leftEyeGroup.innerHTML = '';
    this.rightEyeGroup.innerHTML = '';

    const gazeAmplify = 1.8; // Make gaze movement more visible
    const leftEye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    leftEye.setAttribute('r', String(r));
    leftEye.setAttribute('fill', fg);
    leftEye.setAttribute('cx', String(gazeX * gazeAmplify));
    leftEye.setAttribute('cy', String(gazeY * gazeAmplify * yScale));
    this.leftEyeGroup.setAttribute('transform', `translate(${leftX},${centerY}) scale(${size})`);
    this.leftEyeGroup.appendChild(leftEye);

    const rightEye = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    rightEye.setAttribute('r', String(r));
    rightEye.setAttribute('fill', fg);
    rightEye.setAttribute('cx', String(gazeX * gazeAmplify));
    rightEye.setAttribute('cy', String(gazeY * gazeAmplify * yScale));
    this.rightEyeGroup.setAttribute('transform', `translate(${rightX},${centerY}) scale(${size})`);
    this.rightEyeGroup.appendChild(rightEye);
  }

  _renderClosedEyes(leftX, rightX, centerY, size, fg) {
    this.leftEyeGroup.innerHTML = '';
    this.rightEyeGroup.innerHTML = '';

    for (const [group, x] of [[this.leftEyeGroup, leftX], [this.rightEyeGroup, rightX]]) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', String(x - 3.5 * size));
      line.setAttribute('y1', String(centerY));
      line.setAttribute('x2', String(x + 3.5 * size));
      line.setAttribute('y2', String(centerY));
      line.setAttribute('stroke', fg);
      line.setAttribute('stroke-width', '1.8');
      line.setAttribute('stroke-linecap', 'round');
      group.setAttribute('transform', '');
      group.appendChild(line);
    }
  }

  _renderXEyes(leftX, rightX, centerY, size, fg) {
    this.leftEyeGroup.innerHTML = '';
    this.rightEyeGroup.innerHTML = '';

    const r = 3 * size;
    for (const [group, x] of [[this.leftEyeGroup, leftX], [this.rightEyeGroup, rightX]]) {
      group.setAttribute('transform', '');
      const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l1.setAttribute('x1', String(x - r)); l1.setAttribute('y1', String(centerY - r));
      l1.setAttribute('x2', String(x + r)); l1.setAttribute('y2', String(centerY + r));
      l1.setAttribute('stroke', fg); l1.setAttribute('stroke-width', '1.8');
      l1.setAttribute('stroke-linecap', 'round');
      group.appendChild(l1);
      const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      l2.setAttribute('x1', String(x + r)); l2.setAttribute('y1', String(centerY - r));
      l2.setAttribute('x2', String(x - r)); l2.setAttribute('y2', String(centerY + r));
      l2.setAttribute('stroke', fg); l2.setAttribute('stroke-width', '1.8');
      l2.setAttribute('stroke-linecap', 'round');
      group.appendChild(l2);
    }
  }

  _renderBrows(state, fg) {
    if (this.status === 'dead') {
      this.leftBrow.setAttribute('d', '');
      this.rightBrow.setAttribute('d', '');
      return;
    }

    const centerX = 32;
    const centerY = 30 + TRAITS.eyeY;
    const leftX = centerX - TRAITS.eyeSpacing;
    const rightX = centerX + TRAITS.eyeSpacing;
    const size = TRAITS.eyeSize;
    const browY = centerY - 8;

    const tiltOffset = (state.browTilt || 0);
    const raise = state.browRaise * 2.5;

    // Arched brows
    const lRaise = raise + tiltOffset * 2.5;
    const rRaise = raise - tiltOffset * 2.5;

    this.leftBrow.setAttribute('stroke', fg);
    this.leftBrow.setAttribute('d',
      `M${leftX - 4 * size} ${browY + 1 - lRaise} Q${leftX} ${browY - 3 - lRaise} ${leftX + 4 * size} ${browY + 1 - lRaise}`
    );
    this.rightBrow.setAttribute('stroke', fg);
    this.rightBrow.setAttribute('d',
      `M${rightX - 4 * size} ${browY + 1 - rRaise} Q${rightX} ${browY - 3 - rRaise} ${rightX + 4 * size} ${browY + 1 - rRaise}`
    );
  }

  _renderZs(elapsed) {
    const params = getEmotionParams(this.status);
    if (!params.sleeping) {
      this.zGroup.innerHTML = '';
      this.zParticles = [];
      return;
    }

    // Spawn new Z every ~2s
    if (this.zParticles.length === 0 || elapsed - this.zParticles[this.zParticles.length - 1].spawn > 2000) {
      this.zParticles.push({
        spawn: elapsed,
        x: 44 + (Math.random() - 0.5) * 4,
        size: 0.6 + Math.random() * 0.4,
      });
    }

    // Remove old
    this.zParticles = this.zParticles.filter(z => elapsed - z.spawn < 4000);

    this.zGroup.innerHTML = '';
    for (const z of this.zParticles) {
      const age = (elapsed - z.spawn) / 4000;
      const y = 20 - age * 20;
      const opacity = age < 0.2 ? age * 5 : age > 0.7 ? (1 - age) / 0.3 : 1;
      const scale = z.size * (0.5 + age * 0.5);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', String(z.x + age * 6));
      text.setAttribute('y', String(y));
      text.setAttribute('font-size', String(6 * scale));
      text.setAttribute('font-weight', '700');
      text.setAttribute('font-family', 'system-ui, sans-serif');
      text.setAttribute('fill', this._getPalette().fg);
      text.setAttribute('opacity', String(opacity * 0.7));
      text.textContent = 'z';
      this.zGroup.appendChild(text);
    }
  }

  _tick(now) {
    const elapsed = now - this.startTime;
    const t = elapsed / 1000;
    const params = getEmotionParams(this.status);

    if (params.dead) {
      this._updatePalette();
      const fg = this._getPalette().fg;
      this.faceGroup.setAttribute('transform', '');
      this._renderEyes(REST_STATE, fg);
      this._renderBrows(REST_STATE, fg);
      this._renderZs(elapsed);
      return;
    }

    // Sleeping animation
    if (params.sleeping) {
      const st = this.sleepTwitch;
      if (!params.deep && elapsed > st.nextTwitch) {
        st.gx = (this.rng() - 0.5) * 0.3;
        st.gy = (this.rng() - 0.5) * 0.2;
        if (this.rng() < 0.3) {
          st.brow = (this.rng() - 0.5) * 0.25;
          st.squint = this.rng() * 0.15;
        }
        st.nextTwitch = elapsed + 4000 + this.rng() * 12000;
      }
      st.gx *= 0.94; st.gy *= 0.94;
      st.brow *= 0.96; st.squint *= 0.96;

      const sighBoost = Math.sin(t / 29 * Math.PI * 2) > 0.88 ? 0.4 : 0;
      const breathY = Math.sin(t / params.breathSpeed * Math.PI * 2) * (1.0 + sighBoost);

      this.currentState = {
        gazeX: st.gx, gazeY: st.gy,
        lidClose: 1 - Math.abs(st.gx) * 0.12,
        browRaise: st.brow, browTilt: 0,
        squint: Math.max(0, st.squint), breathY,
      };
    } else {
      // Active animation
      this._tickActive(elapsed, t, params);
    }

    // Smooth transition
    if (this.transitionProgress < 1) {
      this.transitionProgress = Math.min(1, this.transitionProgress + 0.02);
    }

    const fg = this._getPalette().fg;

    // Body animation: breathing + subtle bounce/sway when active
    let bodyX = 0;
    let bodyY = this.currentState.breathY;
    const ep = getEmotionParams(this.status);
    if (!ep.dead && !ep.sleeping) {
      // Subtle lateral sway
      bodyX = Math.sin(t * 0.4) * 0.3 * (ep.restlessness || 0);
      // Occasional micro-hop
      const hopPhase = Math.sin(t * 1.7) * Math.sin(t * 0.3);
      if (hopPhase > 0.85) {
        bodyY += -0.4 * (hopPhase - 0.85) * 6.67 * (ep.restlessness || 0);
      }
    }
    this.faceGroup.setAttribute('transform', `translate(${bodyX},${bodyY})`);
    this._renderEyes(this.currentState, fg);
    this._renderBrows(this.currentState, fg);
    this._renderZs(elapsed);
  }

  _tickActive(elapsed, t, params) {
    // Breathing
    const breathY = Math.sin(t / params.breathSpeed * Math.PI * 2) * 0.8;

    // Gaze
    if (elapsed > this.gaze.nextShift && elapsed > this.gaze.holdUntil) {
      const r = this.rng();
      if (r < 0.3) {
        this.gaze.targetX = (this.rng() - 0.5) * 1.6 * params.restlessness;
        this.gaze.targetY = (this.rng() - 0.5) * 1.0 * params.restlessness;
        this.gaze.holdUntil = elapsed + 400 + this.rng() * 1500;
      } else if (r < 0.5) {
        this.gaze.targetX = (this.rng() - 0.5) * 0.3;
        this.gaze.targetY = (this.rng() - 0.5) * 0.2;
        this.gaze.holdUntil = elapsed + 800 + this.rng() * 2000;
      } else {
        this.gaze.targetX += (this.rng() - 0.5) * 0.4 * params.restlessness;
        this.gaze.targetY += (this.rng() - 0.5) * 0.3 * params.restlessness;
        this.gaze.targetX = Math.max(-0.9, Math.min(0.9, this.gaze.targetX));
        this.gaze.targetY = Math.max(-0.7, Math.min(0.7, this.gaze.targetY));
        this.gaze.holdUntil = elapsed + 300 + this.rng() * 800;
      }
      this.gaze.nextShift = this.gaze.holdUntil + this.rng() * 600;
    }

    const gazeEase = 0.04 + params.gazeSpeed * 0.06;
    this.gaze.currentX = lerp(this.gaze.currentX, this.gaze.targetX, gazeEase);
    this.gaze.currentY = lerp(this.gaze.currentY, this.gaze.targetY, gazeEase);

    const saccadeX = noise(t * 8, this.seed) * 0.06 * params.restlessness;
    const saccadeY = noise(t * 7.3, this.seed + 100) * 0.04 * params.restlessness;

    const gazeX = this.gaze.currentX + saccadeX;
    const gazeY = this.gaze.currentY + saccadeY - breathY * 0.12;

    // Blinking
    let lidClose = params.lidBase;
    if (params.blinkRate > 0) {
      if (this.blink.blinkPhase > 0) {
        this.blink.blinkPhase += (1/30) * 12;
        if (this.blink.blinkPhase < 1) {
          lidClose = Math.max(lidClose, smoothstep(this.blink.blinkPhase));
        } else if (this.blink.blinkPhase < 1.3) {
          lidClose = 1;
        } else if (this.blink.blinkPhase < 2.3) {
          lidClose = Math.max(lidClose, 1 - smoothstep(this.blink.blinkPhase - 1.3));
        } else {
          if (this.blink.isDouble && this.blink.doublePhase === 0) {
            this.blink.doublePhase = 1;
            this.blink.blinkPhase = 0.2;
          } else {
            this.blink.blinkPhase = 0;
            this.blink.isDouble = false;
            this.blink.doublePhase = 0;
            const baseInterval = params.blinkRate * 1000;
            this.blink.nextBlink = elapsed + baseInterval + (this.rng() - 0.5) * baseInterval * 0.6;
          }
        }
      } else if (elapsed > this.blink.nextBlink) {
        this.blink.blinkPhase = 0.01;
        this.blink.isDouble = this.rng() < 0.2;
        this.blink.doublePhase = 0;
      }
    }

    // Expressions
    if (elapsed > this.expr.nextChange) {
      const r = this.rng();
      const e = params.expressiveness;
      if (r < 0.2) {
        this.expr.targetBrow = 0; this.expr.targetSquint = 0; this.expr.targetBrowTilt = 0;
      } else if (r < 0.4) {
        this.expr.targetBrow = (0.25 + this.rng() * 0.5) * e;
        this.expr.targetSquint = this.rng() * 0.12;
      } else if (r < 0.6) {
        this.expr.targetBrow = -(0.1 + this.rng() * 0.2) * e;
        this.expr.targetSquint = (0.2 + this.rng() * 0.35) * e;
      } else if (r < 0.8) {
        this.expr.targetBrowTilt = (0.3 + this.rng() * 0.45) * e * (this.rng() < 0.5 ? 1 : -1);
        this.expr.targetBrow = this.rng() * 0.15 * e;
      } else {
        this.expr.targetBrow = (0.2 + this.rng() * 0.35) * e;
        this.expr.targetSquint = (0.05 + this.rng() * 0.15) * e;
        this.expr.targetBrowTilt = this.rng() * 0.15 * e;
      }
      this.expr.nextChange = elapsed + 1500 + this.rng() * 4000;
    }

    const exprEase = 0.025 + params.expressiveness * 0.025;
    this.expr.currentBrow = lerp(this.expr.currentBrow, this.expr.targetBrow + params.browBase, exprEase);
    this.expr.currentSquint = lerp(this.expr.currentSquint, this.expr.targetSquint + params.squintBase, exprEase);
    this.expr.currentBrowTilt = lerp(this.expr.currentBrowTilt, this.expr.targetBrowTilt + params.browTiltBase, exprEase);

    // Micro-events
    let eventLid = 0, eventBrow = 0, eventSquint = 0, eventBrowTilt = 0;
    if (this.event.active) {
      const ep = (elapsed - this.event.startTime) / this.event.duration;
      if (ep >= 1) {
        this.event.active = false;
        this.event.nextEvent = elapsed + 5000 + this.rng() * 12000;
      } else {
        const intensity = Math.sin(ep * Math.PI);
        switch (this.event.type) {
          case 'surprise': eventBrow = intensity * 1.0; break;
          case 'amused': eventBrow = intensity * 0.5; eventSquint = intensity * 0.3; break;
          case 'ponder': eventBrow = -intensity * 0.35; eventBrowTilt = intensity * 0.45; break;
          case 'focus': eventSquint = intensity * 0.2; eventBrow = -intensity * 0.15; break;
        }
      }
    } else if (elapsed > this.event.nextEvent && params.eventFrequency > 0) {
      if (this.rng() < params.eventFrequency) {
        this.event.active = true;
        this.event.startTime = elapsed;
        const r = this.rng();
        if (r < 0.3) { this.event.type = 'surprise'; this.event.duration = 600 + this.rng() * 500; }
        else if (r < 0.55) { this.event.type = 'amused'; this.event.duration = 800 + this.rng() * 1200; }
        else if (r < 0.8) { this.event.type = 'ponder'; this.event.duration = 1200 + this.rng() * 1000; }
        else { this.event.type = 'focus'; this.event.duration = 1000 + this.rng() * 800; }
      }
      this.event.nextEvent = elapsed + 3000 + this.rng() * 8000;
    }

    this.currentState = {
      gazeX, gazeY,
      lidClose: Math.max(0, Math.min(1, lidClose + eventLid)),
      browRaise: this.expr.currentBrow + eventBrow,
      browTilt: this.expr.currentBrowTilt + eventBrowTilt,
      squint: Math.max(0, this.expr.currentSquint + eventSquint),
      breathY,
    };
  }

  _startLoop() {
    const loop = (now) => {
      if (now - this.lastFrame >= 32) { // ~30fps
        this.lastFrame = now;
        this._tick(now);
      }
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  _renderStatic() {
    const fg = this._getPalette().fg;
    this.faceGroup.setAttribute('transform', '');
    this._renderEyes(REST_STATE, fg);
    this._renderBrows(REST_STATE, fg);
  }

  destroy() {
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }
}

// Export for use
window.AvatarAnimator = AvatarAnimator;
