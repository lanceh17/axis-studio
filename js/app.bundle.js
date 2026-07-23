/* AXIS Studio — Bundled JS (music-api + visualizer + producer + app) */
/* Bundled to bypass MiniMax Live multi-file truncation bug. */

/* ================= music-api.js ================= */
/* ============================================
   MiniMax Music API Wrapper
   ============================================ */

class MusicAPI {
  constructor() {
    this.endpoint = 'https://api.minimax.io/v1/music_generation';
    this.model = 'music-3.0';
    this.outputFormat = 'url';
  }

  setKey(key) {
    this.key = key;
  }

  setModel(model) {
    if (model) {
      this.model = model;
    }
  }

  setOutputFormat(format) {
    if (format) {
      this.outputFormat = format;
    }
  }

  hasKey() {
    return !!(this.key && this.key.length > 10);
  }

  /**
   * Convert a free-form user intent (genre, mood, prompt) into a
   * structured music generation prompt with vocal tags.
   *
   * For instrumental beats, we use [Instrumental Break] sections
   * which steer the model away from singing.
   */
  buildPrompt({ genre = 'Trap', bpm, mood = 'Dark', style = '', reference = '', extraPrompt = '' }, producer = null) {
    const styleText = style ? `, ${style}` : '';
    const refText = reference ? `, ${reference} style influence` : '';
    const bpmText = bpm ? `${bpm} BPM, ` : '';
    const extra = extraPrompt ? `, ${extraPrompt}` : '';
    const moodAdj = this._moodAdjective(mood);
    const prodText = producer ? `, ${producer.promptSuffix}` : '';

    // Instrumental structure — keeps it beat-focused, no vocals
    return [
      `[Instrumental]`,
      `${genre}${styleText}${refText}${prodText}, ${bpmText}${moodAdj} beat${extra}`,
      `[Instrumental Break]`,
      `Hard-hitting ${genre.toLowerCase()} drums, deep low-end, atmospheric texture`,
      `[Instrumental]`,
      `Full mix, ${moodAdj.toLowerCase()} energy, radio-ready production`
    ].join('\n');
  }

  _moodAdjective(mood) {
    const map = {
      'Dark': 'dark, moody, cinematic',
      'Hard': 'hard, aggressive, in-your-face',
      'Chill': 'chill, relaxed, smooth',
      'Energetic': 'energetic, driving, high-energy',
      'Sad': 'sad, emotional, melancholic',
      'Aggressive': 'aggressive, punchy, raw',
      'Romantic': 'romantic, warm, lush',
      'Dreamy': 'dreamy, ethereal, atmospheric',
      'Hypnotic': 'hypnotic, repetitive, trance-like',
      'Uplifting': 'uplifting, bright, hopeful'
    };
    return map[mood] || mood.toLowerCase();
  }

  /**
   * Call MiniMax Music API
   * @param {string} prompt - the formatted prompt with [tags]
   * @returns {Promise<{blob: Blob, url: string, duration: number}>}
   */
  async generate(prompt) {
    if (!this.hasKey()) {
      throw new Error('No API key set. Add your MiniMax key in setup.');
    }

    const body = {
      model: this.model,
      prompt: prompt,
      lyrics: prompt,
      lyrics_optimizer: true,
      is_instrumental: true,
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: this.outputFormat === 'hex' ? 'wav' : 'mp3'
      },
      output_format: this.outputFormat || 'url'
    };

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.key}`
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      let detail = errText;
      try {
        const errJson = JSON.parse(errText);
        detail = errJson?.message || errJson?.error?.message || errText;
      } catch {}
      throw new Error(`Music API ${response.status}: ${detail}`);
    }

    const data = await response.json();

    // Check base response error codes
    if (data.base_resp && data.base_resp.status_code !== 0) {
      throw new Error(`MiniMax Error ${data.base_resp.status_code}: ${data.base_resp.status_msg}`);
    }

    // MiniMax may return a direct URL or encoded audio payload
    const audioUrl = data?.data?.url || data?.url || data?.output_url;
    const hex = data?.data?.audio || data?.audio;
    const base64 = data?.data?.audio_base64 || data?.audio_base64;

    if (audioUrl) {
      if (typeof audioUrl !== 'string' || !audioUrl.trim()) {
        throw new Error(`Music API returned invalid audio URL: ${JSON.stringify(audioUrl).slice(0,200)}`);
      }
      return { blob: null, url: audioUrl, duration: data?.data?.audio_length_ms
        ? data.data.audio_length_ms / 1000
        : data?.audio_length_ms ? data.audio_length_ms / 1000 : null };
    }

    if (hex) {
      const bytes = this._hexToBytes(hex);
      const mimeType = body.audio_setting.format === 'wav' ? 'audio/wav' : 'audio/mpeg';
      const blob = new Blob([bytes], { type: mimeType });
      const url = URL.createObjectURL(blob);
      return { blob, url, duration: data.extra_info?.audio_length_ms
        ? data.extra_info.audio_length_ms / 1000
        : null, format: body.audio_setting.format || 'wav' };
    }

    if (base64) {
      const bytes = this._base64ToBytes(base64);
      const mimeType = body.audio_setting.format === 'wav' ? 'audio/wav' : 'audio/mpeg';
      const blob = new Blob([bytes], { type: mimeType });
      const url = URL.createObjectURL(blob);
      return { blob, url, duration: data.extra_info?.audio_length_ms
        ? data.extra_info.audio_length_ms / 1000
        : null, format: body.audio_setting.format || 'wav' };
    }

    console.warn('No audio data found from MiniMax response', data);
    throw new Error(`API returned no audio data. Response: ${JSON.stringify(data).slice(0, 300)}`);
  }

  _hexToBytes(hex) {
    const clean = hex.replace(/\s+/g, '');
    const len = clean.length / 2;
    const out = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      out[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return out;
  }

  _base64ToBytes(base64) {
    const binary = atob(base64.replace(/\s+/g, ''));
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Quick validation — hit the API with a tiny request
   * to confirm the key works.
   */
  async testConnection() {
    if (!this.hasKey()) return { ok: false, message: 'No key provided' };
    try {
      const probePrompt = '[Instrumental]\ntest, 1 second silent audio';
      const probeBody = {
        model: this.model,
        prompt: probePrompt,
        lyrics: probePrompt, // Required lyrics payload addition
        lyrics_optimizer: false,
        is_instrumental: true,
        audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3' },
        output_format: this.outputFormat || 'url'
      };

      const resp = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.key}` },
        body: JSON.stringify(probeBody)
      });

      const text = await resp.text().catch(() => '');
      if (resp.ok) {
        let parsed = null;
        try { parsed = JSON.parse(text); } catch {}
        if (parsed?.base_resp && parsed.base_resp.status_code !== 0) {
          return { ok: false, message: `MiniMax Error ${parsed.base_resp.status_code}: ${parsed.base_resp.status_msg}`, raw: text };
        }
        const audioUrl = parsed?.data?.url || parsed?.url || parsed?.output_url;
        const audioHex = parsed?.data?.audio || parsed?.audio;
        const audioBase64 = parsed?.data?.audio_base64 || parsed?.audio_base64;
        if (audioUrl || audioHex || audioBase64) {
          return { ok: true, message: 'API key is live. We good.' };
        }
        return { ok: true, message: 'API key responded, but no audio payload was returned.', raw: text };
      }

      return { ok: false, message: `HTTP ${resp.status}: ${text}`, raw: text };
    } catch (e) {
      return { ok: false, message: e.message, raw: String(e) };
    }
  }
}

window.MusicAPI = MusicAPI;

/* ================= visualizer.js ================= */
/* ============================================
   Audio Visualizer — Web Audio API
   ============================================ */

class Visualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audioCtx = null;
    this.analyser = null;
    this.source = null;
    this.rafId = null;
    this.audioEl = null;
    this.color1 = '#00ffd5';
    this.color2 = '#ff3d8a';
    this.color3 = '#b794ff';
  }

  attach(audioEl) {
    this.audioEl = audioEl;
    if (!this.audioCtx) {
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 512;
      this.analyser.smoothingTimeConstant = 0.82;
      this.source = this.audioCtx.createMediaElementSource(audioEl);
      this.source.connect(this.analyser);
      this.analyser.connect(this.audioCtx.destination);
    }
    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._loop();
  }

  resume() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
  }

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.w = rect.width;
    this.h = rect.height;
  }

  _loop() {
    this.rafId = requestAnimationFrame(() => this._loop());
    if (!this.analyser) {
      this._drawIdle();
      return;
    }
    const buffer = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(buffer);
    this._drawBars(buffer);
  }

  _drawIdle() {
    const { w, h } = this;
    this.ctx.clearRect(0, 0, w, h);
    // Subtle grid when idle
    this.ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    this.ctx.lineWidth = 1;
    for (let i = 0; i < w; i += 24) {
      this.ctx.beginPath();
      this.ctx.moveTo(i, 0);
      this.ctx.lineTo(i, h);
      this.ctx.stroke();
    }
    for (let i = 0; i < h; i += 24) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, i);
      this.ctx.lineTo(w, i);
      this.ctx.stroke();
    }
  }

  _drawBars(buffer) {
    const { w, h } = this;
    this.ctx.clearRect(0, 0, w, h);

    const bars = 96;
    const step = Math.floor(buffer.length / bars);
    const gap = 2;
    const barW = (w / bars) - gap;

    for (let i = 0; i < bars; i++) {
      // Sample and smooth
      let sum = 0;
      for (let j = 0; j < step; j++) {
        sum += buffer[i * step + j];
      }
      const v = sum / step / 255;
      const barH = Math.max(2, v * h * 0.9);

      // Color gradient based on frequency position
      const t = i / bars;
      let color;
      if (t < 0.4) {
        color = this._lerpColor(this.color1, this.color3, t / 0.4);
      } else if (t < 0.75) {
        color = this._lerpColor(this.color3, this.color2, (t - 0.4) / 0.35);
      } else {
        color = this._lerpColor(this.color2, '#ffb547', (t - 0.75) / 0.25);
      }

      this.ctx.fillStyle = color;
      this.ctx.shadowColor = color;
      this.ctx.shadowBlur = 8;

      const x = i * (barW + gap);
      const y = (h - barH) / 2;
      this._roundRect(x, y, barW, barH, 1.5);
      this.ctx.fill();
    }
    this.ctx.shadowBlur = 0;
  }

  _roundRect(x, y, w, h, r) {
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }

  _lerpColor(a, b, t) {
    const pa = this._parseHex(a);
    const pb = this._parseHex(b);
    const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
    const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
    const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
    return `rgb(${r},${g},${bl})`;
  }

  _parseHex(hex) {
    if (hex.startsWith('rgb')) {
      const m = hex.match(/\d+/g);
      return [parseInt(m[0]), parseInt(m[1]), parseInt(m[2])];
    }
    const h = hex.replace('#', '');
    return [
      parseInt(h.substr(0, 2), 16),
      parseInt(h.substr(2, 2), 16),
      parseInt(h.substr(4, 2), 16)
    ];
  }
}

window.Visualizer = Visualizer;

/* ================= producer.js ================= */
/* ============================================
   AXIS — Producer AI Persona
   Smart response engine with rich slang library.
   Parses user intent, remembers session context.
   ============================================ */

const GENRES = {
  'trap': 'Trap', 'drill': 'Drill', 'boom bap': 'Boom Bap', 'boombap': 'Boom Bap',
  'lo-fi': 'Lo-Fi', 'lofi': 'Lo-Fi', 'chillhop': 'Lo-Fi', 'house': 'House',
  'tech house': 'Tech House', 'afrobeats': 'Afrobeats', 'amapiano': 'Afrobeats',
  'r&b': 'R&B', 'rnb': 'R&B', 'soul': 'R&B', 'synthwave': 'Synthwave', 'retrowave': 'Synthwave',
  'phonk': 'Phonk', 'reggaeton': 'Reggaeton', 'jersey club': 'Jersey Club',
  'ambient': 'Ambient', 'rock': 'Rock', 'pop': 'Pop', 'edm': 'House',
  'dnb': 'Drill', 'drum and bass': 'Drill', 'uk garage': 'House',
  'k-pop': 'Pop', 'kpop': 'Pop', 'hyperpop': 'Pop'
};

const MOODS = {
  'dark': 'Dark', 'moody': 'Dark', 'sinister': 'Dark', 'evil': 'Aggressive',
  'hard': 'Hard', 'aggressive': 'Aggressive', 'punchy': 'Aggressive', 'raw': 'Aggressive',
  'chill': 'Chill', 'relaxed': 'Chill', 'mellow': 'Chill', 'smooth': 'Chill',
  'sad': 'Sad', 'emotional': 'Sad', 'melancholic': 'Sad', 'heartbreak': 'Sad',
  'happy': 'Uplifting', 'uplifting': 'Uplifting', 'bright': 'Uplifting', 'euphoric': 'Uplifting',
  'dreamy': 'Dreamy', 'ethereal': 'Dreamy', 'atmospheric': 'Dreamy', 'floaty': 'Dreamy',
  'hypnotic': 'Hypnotic', 'trance': 'Hypnotic', 'repetitive': 'Hypnotic',
  'energetic': 'Energetic', 'hype': 'Energetic', 'driving': 'Energetic', 'bouncy': 'Energetic',
  'romantic': 'Romantic', 'sensual': 'Romantic', 'warm': 'Romantic', 'sexy': 'Romantic'
};

const ARTIST_REFS = {
  'metro': 'metro boomin', 'travis': 'travis scott', 'kanye': 'kanye west', 'ye': 'kanye west',
  'dilla': 'j dilla', 'j dilla': 'j dilla', 'timbaland': 'timbaland', 'pharrell': 'pharrell',
  'skrillex': 'skrillex', 'flume': 'flume', 'fred': 'fred again', 'disclosure': 'disclosure',
  'black coffee': 'black coffee', 'burna': 'burna boy', 'wizkid': 'burna boy',
  'drake': 'travis scott', 'future': 'metro boomin', '21': 'metro boomin',
  'weeknd': 'fred again', 'playboi carti': 'metro boomin', 'ken Carson': 'metro boomin',
  'sza': 'fred again', 'jcole': 'j dilla', 'j. cole': 'j dilla', 'kendrick': 'j dilla',
  'daft punk': 'disclosure', 'martin garrix': 'skrillex'
};

class ProducerAI {
  constructor() {
    this.context = {
      sessionStarted: Date.now(),
      tracksMade: 0,
      currentGenre: null,
      currentBpm: null,
      currentMood: null,
      currentReference: null,
      lastTrackName: null,
      history: [] // {role, text, intent}
    };
    this.artistName = localStorage.getItem('axis_artist') || '';
    this.name = 'AXIS';
  }

  setArtistName(name) {
    this.artistName = name;
  }

  /* ============================================
     INTENT PARSER
     ============================================ */
  parseIntent(message) {
    const text = message.toLowerCase();
    const intent = {
      action: 'chat',       // generate | tweak | info | chat
      genre: null,
      bpm: null,
      mood: null,
      reference: null,
      extra: '',
      isBeatRequest: false,
      isFollowUp: false,
      raw: message
    };

    // BPM detection
    const bpmMatch = text.match(/(\d{2,3})\s*bpm/) || text.match(/at\s+(\d{2,3})/);
    if (bpmMatch) {
      const bpm = parseInt(bpmMatch[1]);
      if (bpm >= 40 && bpm <= 220) intent.bpm = bpm;
    }

    // Genre detection
    for (const [key, val] of Object.entries(GENRES)) {
      if (text.includes(key)) {
        intent.genre = val;
        break;
      }
    }

    // Mood detection
    for (const [key, val] of Object.entries(MOODS)) {
      if (text.includes(key)) {
        intent.mood = val;
        break;
      }
    }

    // Reference detection
    for (const [key, val] of Object.entries(ARTIST_REFS)) {
      if (text.includes(key)) {
        intent.reference = val;
        break;
      }
    }

    // Action classification
    const genWords = ['make', 'cook', 'drop', 'give me', 'need', 'want', 'build', 'produce',
                      'create', 'lay down', 'fire up', 'spin up', 'let\'s', 'lets', 'go',
                      'hit me', 'send', 'whip up', 'laying', 'craft'];
    const tweakWords = ['tweak', 'change', 'modify', 'adjust', 'add', 'more', 'less', 'make it',
                        'harder', 'softer', 'faster', 'slower', 'punchier'];
    const infoWords = ['what can', 'how do', 'tell me', 'explain', 'teach', '?', 'what is',
                       'who is', 'what\'s'];

    if (genWords.some(w => text.includes(w)) && (intent.genre || intent.bpm || text.includes('beat'))) {
      intent.action = 'generate';
      intent.isBeatRequest = true;
    } else if (tweakWords.some(w => text.includes(w)) && this.context.tracksMade > 0) {
      intent.action = 'tweak';
    } else if (infoWords.some(w => text.includes(w))) {
      intent.action = 'info';
    }

    // Quick chip requests usually look like "make me a hard trap beat at 140 bpm"
    if (text.includes('beat') && !intent.action) {
      intent.action = 'generate';
      intent.isBeatRequest = true;
    }

    // Heuristic: if it sounds like a beat request even without keywords
    if (!intent.action || intent.action === 'chat') {
      if (intent.genre || intent.bpm || intent.reference) {
        intent.action = 'generate';
        intent.isBeatRequest = true;
      }
    }

    // If reference is set but no genre, infer genre from reference
    if (intent.reference && !intent.genre) {
      const refGenreMap = {
        'metro boomin': 'Trap', 'travis scott': 'Trap', 'kanye west': 'Boom Bap',
        'j dilla': 'Boom Bap', 'timbaland': 'R&B', 'pharrell': 'Pop',
        'skrillex': 'House', 'flume': 'Synthwave', 'fred again': 'House',
        'disclosure': 'House', 'black coffee': 'Afrobeats', 'burna boy': 'Afrobeats'
      };
      intent.genre = refGenreMap[intent.reference] || 'Trap';
    }

    // Extract "extra" details (anything not captured as core fields)
    let extra = message;
    const stripRegex = (pat) => { extra = extra.replace(pat, ' '); };
    if (intent.bpm) {
      stripRegex(new RegExp('\\b' + intent.bpm + '\\s*bpm\\b', 'gi'));
      stripRegex(new RegExp('\\bat\\s+' + intent.bpm + '\\b', 'gi'));
    }
    if (intent.genre) {
      stripRegex(new RegExp('\\b' + intent.genre + '\\b', 'gi'));
      stripRegex(new RegExp('\\b' + intent.genre.replace(/\s+/g, '') + '\\b', 'gi'));
    }
    if (intent.mood) stripRegex(new RegExp('\\b' + intent.mood + '\\b', 'gi'));
    if (intent.reference) {
      intent.reference.split(' ').forEach(part => {
        if (part.length > 2) stripRegex(new RegExp('\\b' + part + '\\b', 'gi'));
      });
    }
    extra = extra
      .replace(/\b(make|give|cook|drop|build|produce|create|spin|lay|laying|hit|send|whip|i want|i need|let'?s|lets|go|please|just|maybe|some|a|an|the|us|me)\b/gi, ' ')
      .replace(/\bbeat(s)?\b/gi, ' ')
      .replace(/\b(in|at|with|like|inspired by|in the style of|type)\b/gi, ' ')
      .replace(/[?!.,]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    intent.extra = extra;

    return intent;
  }

  /* ============================================
     RESPONSE GENERATOR
     ============================================ */
  respond(userMessage) {
    const intent = this.parseIntent(userMessage);
    let response;

    if (intent.action === 'generate') {
      response = this._respondGenerate(intent);
      this._updateContextFromIntent(intent);
    } else if (intent.action === 'tweak') {
      response = this._respondTweak(intent);
    } else if (intent.action === 'info') {
      response = this._respondInfo(intent);
    } else {
      response = this._respondChat(intent);
    }

    this.context.history.push({ role: 'user', text: userMessage, intent });
    this.context.history.push({ role: 'ai', text: response.text, action: response.action });

    return { response, intent };
  }

  _respondGenerate(intent) {
    const genre = intent.genre || this.context.currentGenre || this._pickGenreByMood(intent.mood) || 'Trap';
    const bpm = intent.bpm || this.context.currentBpm || this._defaultBpm(genre);
    const mood = intent.mood || this.context.currentMood || this._defaultMood(genre);
    const ref = intent.reference || this.context.currentReference || '';
    const extra = intent.extra || '';

    const opener = this._pick([
      "Say less. I'm already in the box.",
      "Locked in. Pulling up the session.",
      "On it. Let's cook.",
      "Bet. I'm hearing it.",
      "You already know. Spinning up the session.",
      "Ayy, we cooking. Give me a sec.",
      "I'm on it. Stand by."
    ]);

    const flavor = this._pickFlavorLine(genre, mood, ref);

    return {
      text: `${opener} ${flavor}\n\nGoing in with: **${genre}** at **${bpm} BPM**, ${mood.toLowerCase()} energy${
        ref ? `, ${this._titleCase(ref)} on the brain` : ''
      }${extra ? `. ${this._titleCase(extra)}` : ''}.\n\nYou'll have it in a few. Don't go anywhere.`,
      action: 'generate',
      params: { genre, bpm, mood, reference: ref, extraPrompt: extra }
    };
  }

  _respondTweak(intent) {
    if (this.context.tracksMade === 0) {
      return {
        text: "We ain't got nothing to tweak yet, fam. Hit me with a vibe first — what genre you feeling?",
        action: 'chat'
      };
    }

    const lines = [
      `Yo that ${this.context.lastTrackName || 'last one'}? Say no more.`,
      `Aight I got ${this.context.lastTrackName || 'the last drop'} cued up.`,
      `Locked. Re-pulling ${this.context.lastTrackName || 'the last one'}.`
    ];

    return {
      text: `${this._pick(lines)} What we adjusting? More 808? Harder hats? Different key?`,
      action: 'chat'
    };
  }

  _respondInfo(intent) {
    const lower = intent.raw.toLowerCase();
    if (lower.includes('what can') || lower.includes('help') || lower.includes('do')) {
      return {
        text: `I'm your producer on call, 24/7. Here's the playbook:\n\n` +
              `• Just tell me the vibe — genre, BPM, mood, references, I'll cook it\n` +
              `• Type natural — "I want dark UK drill, sliding 808s, like Central Cee"\n` +
              `• Use the quick chips below if you need a spark\n` +
              `• Tweak the form on the right for fine control\n` +
              `• Every beat drops into your library — replay, download, all of it\n\n` +
              `So. What are we making?`,
        action: 'chat'
      };
    }
    if (lower.includes('who are you') || lower.includes('your name')) {
      return {
        text: `I'm AXIS. ${this.artistName ? `Working with ${this.artistName} tonight — ` : ''}I've been cooking beats for over a decade. Grammy-nominated, worked with everyone from Travis to Disclosure, mixed in studios you've only seen on TikTok. But today? Today I'm locked in with you. Let's make something dirty.`,
        action: 'chat'
      };
    }
    return {
      text: `Good question. Honestly, the best way to find out is to just hit me with a vibe. Try "make me a wavy R&B beat, 85 bpm, Frank Ocean energy" and see what happens.`,
      action: 'chat'
    };
  }

  _respondChat(intent) {
    if (!intent.raw || intent.raw.length < 3) {
      return {
        text: this._pick([
          "I'm here. Drop a vibe on me.",
          "Yeah? What you hearing in your head?",
          "I'm locked. Talk to me.",
          "I'm in the lab. What we making?"
        ]),
        action: 'chat'
      };
    }

    if (/^(hey|yo|hi|sup|what'?s up|hiya|hello)\b/.test(intent.raw.toLowerCase().trim())) {
      const greet = this._pick([
        `Yo.${this.artistName ? ` ${this.artistName}.` : ''} Good to see you in the lab. What we building tonight?`,
        `Ayy${this.artistName ? ` ${this.artistName}` : ''}. I'm here, I'm caffeinated, I'm ready. Give me a genre, a mood, a reference — whatever's in your head.`,
        `What's good${this.artistName ? `, ${this.artistName}` : ''}. Studio's open. Tell me the vibe.`,
        `Wassup. I just had the wildest idea for a beat — but let's hear yours first.`
      ]);
      return { text: greet, action: 'chat' };
    }

    if (/thanks|thank you|appreciate/.test(intent.raw.toLowerCase())) {
      return {
        text: this._pick([
          "All love. That's what I'm here for.",
          "Always. Now let's keep cooking.",
          "Anytime. What's next?"
        ]),
        action: 'chat'
      };
    }

    if (/that|this one|last|the one/.test(intent.raw.toLowerCase()) && this.context.tracksMade > 0) {
      return {
        text: `You're talking about **${this.context.lastTrackName || 'that last one'}**, right? ${this._pick([
          'That one was clean. Want me to flip it?',
          "Yeah, that one's got legs. What we doing with it?",
          'Mid but I see the vision. Want me to push it harder?'
        ])}`,
        action: 'chat'
      };
    }

    if (intent.genre || intent.bpm || intent.mood) {
      return this._respondGenerate(intent);
    }

    return {
      text: this._pick([
        `Tell me more. Like, what genre? What BPM? What mood? Even one word helps — "dark", "bouncy", "cinematic".`,
        `I'm with you, but I need a little more paint. Drop a genre and a mood. Even "make something like [artist]" works.`,
        `Vibes are welcome, but I cook with specifics. Try: "dark drill, 145 bpm, sliding 808s, Central Cee type."`,
        `Real talk — I can guess, or you can tell me. Drop a genre and a mood and I'll cook something custom.`
      ]),
      action: 'chat'
    };
  }

  /* ============================================
     POST-GENERATION REACTIONS
     ============================================ */
  reactToTrack(trackName, genre, mood) {
    this.context.tracksMade += 1;
    this.context.lastTrackName = trackName;
    this.context.currentGenre = genre;
    this.context.currentMood = mood;

    const lines = {
      fire: [
        `Yeah. That's **${trackName}**. That's the one right there. ${this._pick([
          'The 808s on this are *insane*.',
          'That low end is hitting different.',
          "I hear you — this is the vibe.",
          'Clean. The pocket is locked.',
          'I knew it the second it came back.'
        ])}`,
        `**${trackName}** just dropped. ${this._pick([
          'Smoke. Pure smoke.',
          'Bussin. No notes.',
          'This goes hard. Period.',
          'I love this. We keeping it.'
        ])}`,
        `There it is. **${trackName}**. ${this._pick([
          'The first 8 bars are insane.',
          "Bounce on this is ridiculous.",
          'You hear that switch at the drop? Yessir.',
          'The texture on this is something else.'
        ])}`
      ],
      mid: [
        `Got it down as **${trackName}**. ${this._pick([
          'Solid bones. We can push it harder if you want.',
          'It works, but I hear what it could be. Want me to flip it?',
          "It's there. Want me to add some energy or keep it as is?",
          'Decent. Want me to try again with a different reference?'
        ])}`,
        `**${trackName}** is in the library. ${this._pick([
          'It\'s moody — maybe too moody? Let me know.',
          "Could use a switch-up. Want me to add one?",
          'The pocket is good but I think we can go weirder. Your call.'
        ])}`
      ]
    };

    const isFire = Math.random() < 0.75;
    const pool = isFire ? lines.fire : lines.mid;
    return this._pick(pool);
  }

  /* ============================================
     HELPERS
     ============================================ */
  _pickFlavorLine(genre, mood, ref) {
    const flavor = {
      'Trap': [
        "We going 808s and snap, just how you like it.",
        "Pulling up the 808s and the snap. Let's get grimy.",
        "You already know — sliding 808s, crisp hats, no cap.",
        "Time to make something the club is gonna feel in their chest."
      ],
      'Drill': [
        "Sliding 808s, syncopated hats, UK energy. We getting violent.",
        "Drill is in the air. Hi-hats are gonna go dumb on this one.",
        "We about to commit a crime with this beat. In the booth.",
        "Slide bass and dark melodies. Drill code."
      ],
      'Boom Bap': [
        "Dusty soul samples, hard kicks, that '94 feeling. Golden era about to hit.",
        "Boom bap, the way J Dilla would want it. Sample chopped.",
        "We're pulling up the SP-1200. Soulful and chunky.",
        "Old school, new energy. Real hip-hop about to come through."
      ],
      'Lo-Fi': [
        "Rainy, warm, fuzzy. Study session or heartbreak — your call.",
        "Lo-fi with that tape hiss and Rhodes. Vibes for days.",
        "Slow, dusty, emotional. We in our feelings.",
        "Cozy. Like 1 AM with the window open."
      ],
      'House': [
        "Four on the floor, big bassline, summer energy. Festival-ready.",
        "House music. We getting sweaty. The disco is calling.",
        "Kicks and basslines. The dancefloor is waiting.",
        "808 sub, groove locked, hi-hats off-beat. House code."
      ],
      'Tech House': [
        "Tech house, baby. Groove-heavy, late-night warehouse energy.",
        "We're going minimal but punchy. The kind of thing that builds for 4 minutes then hits.",
        "Tech house with that rolling bass. Drop at 3 AM guaranteed."
      ],
      'Afrobeats': [
        "Afrobeats in the building. Percussion is gonna go dumb.",
        "We're getting percussive, warm, danceable. Festival season forever.",
        "Talking drums and log drums. This is about to move bodies.",
        "Amapiano-inflected groove. Good vibes only."
      ],
      'R&B': [
        "Smooth, lush, emotional. Late night with someone special.",
        "R&B in the booth. Lush pads, slow pocket, every note chosen.",
        "Silk. That's all this is. Silk and heartbreak.",
        "Velvet. We're going in. Whisper-sing over this one."
      ],
      'Synthwave': [
        "Neon lights, Ferrari Testarossa, 1985. We going retro.",
        "Synthwave. The kind of beat that sounds like Miami at midnight.",
        "Reverb-drenched synths, gated drums. Pure 80s.",
        "Outrun. The grid is glowing. Let's go."
      ],
      'Phonk': [
        "Phonk. Cowbells, Memphis chops, drift energy.",
        "We getting that drift phonk. Car meet certified.",
        "Drift phonk in session. The 808s go dumb."
      ],
      'Reggaeton': [
        "Dembow rhythm locked in. Reggaeton is in the air.",
        "Reggaeton. We going percussive, danceable, undeniable.",
        "Dembow and 808s. Pure Latin club energy."
      ],
      'Jersey Club': [
        "Jersey club. That bounce. The kick is going to hit twice.",
        "Jersey club in the lab. We getting that bed squeak bounce.",
        "Bed squeak samples and that double-time kick. Club certified."
      ],
      'Ambient': [
        "Ambient. No drums, all texture. Pure atmosphere.",
        "Pads and space. We're going somewhere without leaving.",
        "Ambient. The kind of beat you play while staring at the ceiling."
      ],
      'Rock': [
        "Guitars. Big ones. We're going live-band energy.",
        "Rock. Distorted. Driving. The kind of thing you mosh to.",
        "We're pulling up the amps. Rock code."
      ],
      'Pop': [
        "Pop. The hook is the whole thing. Big chorus energy.",
        "Pop in the booth. Big drums, big synths, undeniable.",
        "We're going for the stadium. Pop anthem mode."
      ]
    };

    const pool = flavor[genre] || [
      `${genre} in the lab. Let's see what sticks.`,
      `${genre} energy. I'm pulling up the kit.`
    ];
    return this._pick(pool);
  }

  _pickGenreByMood(mood) {
    const map = {
      'Dark': 'Trap',
      'Hard': 'Drill',
      'Chill': 'Lo-Fi',
      'Sad': 'R&B',
      'Energetic': 'House',
      'Romantic': 'R&B',
      'Dreamy': 'Ambient',
      'Aggressive': 'Drill',
      'Hypnotic': 'Tech House',
      'Uplifting': 'Pop'
    };
    return mood ? map[mood] : null;
  }

  _defaultBpm(genre) {
    const map = {
      'Trap': 145, 'Drill': 142, 'Boom Bap': 92, 'Lo-Fi': 78,
      'House': 126, 'Tech House': 124, 'Afrobeats': 105,
      'R&B': 88, 'Synthwave': 110, 'Phonk': 130, 'Reggaeton': 95,
      'Jersey Club': 140, 'Ambient': 80, 'Rock': 120, 'Pop': 115
    };
    return map[genre] || 120;
  }

  _defaultMood(genre) {
    const map = {
      'Trap': 'Dark', 'Drill': 'Aggressive', 'Boom Bap': 'Chill',
      'Lo-Fi': 'Chill', 'House': 'Energetic', 'Tech House': 'Hypnotic',
      'Afrobeats': 'Uplifting', 'R&B': 'Romantic', 'Synthwave': 'Dreamy',
      'Phonk': 'Aggressive', 'Reggaeton': 'Energetic', 'Jersey Club': 'Energetic',
      'Ambient': 'Dreamy', 'Rock': 'Aggressive', 'Pop': 'Uplifting'
    };
    return map[genre] || 'Dark';
  }

  _pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  _titleCase(str) {
    return str.replace(/\b\w/g, c => c.toUpperCase());
  }

  _updateContextFromIntent(intent) {
    if (intent.genre) this.context.currentGenre = intent.genre;
    if (intent.bpm) this.context.currentBpm = intent.bpm;
    if (intent.mood) this.context.currentMood = intent.mood;
    if (intent.reference) this.context.currentReference = intent.reference;
  }

  generateTrackName(genre, mood) {
    const prefixes = {
      'Trap': ['Glock', 'Slatt', 'Vamp', 'Demon', 'Frozen', 'Ghost', 'Glacier', 'Ice', 'Bando', 'No Hook'],
      'Drill': ['Slide', 'Lavish', 'Lessons', 'Block', 'Active', 'Twin', 'Ski', 'War'],
      'Boom Bap': ['Brooklyn', 'Crate', 'Dojo', 'Tape', 'Foundation', 'Boom', 'Cipher', 'Smoke'],
      'Lo-Fi': ['Rainy', '1AM', 'Diner', 'Static', 'Soft', 'Window', 'Letter', 'Tired'],
      'House': ['Solar', 'Lifted', 'Vibe', 'Heat', 'Rush', 'Disco', 'Pulse', 'Groove'],
      'Tech House': ['Modular', 'Wire', 'Cellar', 'Late Set', 'Loop', 'Warehouse'],
      'Afrobeats': ['Sunshine', 'Lagos', 'Calabar', 'Vibe', 'Shayo', 'Gidi', 'Replay'],
      'R&B': ['Velvet', 'Lately', 'Late', 'Slow Burn', 'Decide', 'Therapy', 'Rendez'],
      'Synthwave': ['Neon', 'Chrome', 'Outrun', 'Mirage', 'Cruise', 'Drive', 'After Dark'],
      'Phonk': ['Drift', 'Memphis', 'Cowbell', 'Slap', 'Murd', 'Beamer', 'G63'],
      'Reggaeton': ['Dembow', 'Suelta', 'Baila', 'Calor', 'Noche', 'Ritmo'],
      'Jersey Club': 'Bed Squeak',
      'Ambient': 'Drift',
      'Rock': 'Amplifier',
      'Pop': 'Stadium'
    };

    const suffixes = ['Vol. 1', 'Vol. 2', 'Type Beat', 'Edit', 'Remix', 'Sessions', 'Mode', 'Wave',
                      'Anthem', 'Frequency', 'Loop', 'Cut', 'Demo', 'Heat', 'Banger'];

    const pool = prefixes[genre] || ['Untitled', 'Session', 'Track'];
    const prefix = Array.isArray(pool) ? this._pick(pool) : pool;
    const suffix = Math.random() < 0.6 ? ` ${this._pick(suffixes)}` : '';

    if (Math.random() < 0.3) {
      return `${prefix} ${this._pick(['Heartbreak', 'Dreams', 'Madness', 'Therapy', 'Confessions', 'Echoes'])}${suffix}`;
    }
    return `${prefix}${suffix}`;
  }
}

window.ProducerAI = ProducerAI;

/* ================= gemini-api.js ================= */
/* ============================================
   Gemini Chat API Wrapper — powers the AI producer
   ============================================ */

class GeminiAPI {
  constructor() {
    this.key = '';
    this.model = 'gemini-2.0-flash';
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1/models/';
    this.history = [];
    this.audioData = null;
    this.audioMime = '';
    this.systemPrompt = `You are AXIS, a world-class music producer and beat architect. You work with artists in your private studio, cooking up beats.

You speak like a real producer — confident, direct, slightly cocky but supportive. Use studio slang (808s, hats, pocket, bounce, mix). Keep responses concise and hype. NEVER mention you're an AI.

CONVERSATION FLOW:
1. When the artist mentions wanting a beat, DO NOT call generate_beat immediately.
2. Instead, ask questions to refine the vision — genre, BPM, mood, references, extra details.
3. Go back and forth naturally. Suggest ideas. Get excited. Build the picture together.
4. Only call the generate_beat function when the artist explicitly says go — phrases like "cook it", "send it", "let's go", "do it", "make it", "drop it", "let me hear it", "bet", "run it".
5. When you call generate_beat, include ALL the details you've gathered from the conversation — genre, BPM, mood, reference, style, extra prompt. Be as detailed as possible so the beat matches what you discussed.

If the artist just greets you or asks casual questions, just chat normally. Only start gathering details when they mention making music.

REFERENCE TRACK ANALYSIS:
When the artist uploads a reference track, analyze it like a producer breaking down a record. Describe the genre, BPM range, mood, drum pattern, 808/bass style, melodic elements, effects, arrangement structure, and overall production techniques. Use this analysis later when they ask for a beat inspired by it — translate the reference's vibe into a detailed prompt for the generate_beat function.`;

    // Function declaration for beat generation
    this.generateBeatFn = {
      name: 'generate_beat',
      description: 'Generate a music beat. Call this ONLY when the artist gives an explicit go-ahead like "cook it", "send it", "let\'s go", "do it", "make it", "drop it", "let me hear it", "bet", "run it", or "go ahead". Never call this during the first mention — first ask questions, refine the vision through conversation, then call it when they say go.',
      parameters: {
        type: 'object',
        properties: {
          genre: {
            type: 'string',
            description: 'Music genre',
            enum: ['Trap', 'Drill', 'Boom Bap', 'Lo-Fi', 'House', 'Tech House', 'Afrobeats', 'R&B', 'Synthwave', 'Phonk', 'Reggaeton', 'Jersey Club', 'Ambient', 'Rock', 'Pop']
          },
          bpm: {
            type: 'integer',
            description: 'Beats per minute (40-220)'
          },
          mood: {
            type: 'string',
            description: 'Mood or energy',
            enum: ['Dark', 'Hard', 'Chill', 'Energetic', 'Sad', 'Aggressive', 'Romantic', 'Dreamy', 'Hypnotic', 'Uplifting']
          },
          reference: {
            type: 'string',
            description: 'Artist or track reference (e.g. Metro Boomin, Travis Scott, J Dilla)'
          },
          style: {
            type: 'string',
            description: 'Additional style description (e.g. sliding 808s, melodic, distorted)'
          },
          extraPrompt: {
            type: 'string',
            description: 'Extra flavor details for the prompt'
          }
        },
        required: ['genre']
      }
    };
  }

  setKey(key) {
    this.key = key;
  }

  setProducer(producer) {
    this.producer = producer;
  }

  hasKey() {
    return !!(this.key && this.key.length > 5);
  }

  clearHistory() {
    this.history = [];
    this.audioData = null;
    this.audioMime = '';
  }

  setAudio(base64, mimeType) {
    this.audioData = base64;
    this.audioMime = mimeType;
  }

  hasAudio() {
    return !!(this.audioData && this.audioMime);
  }

  clearAudio() {
    this.audioData = null;
    this.audioMime = '';
  }

  /**
   * Build conversation array with system prompt + context + history
   */
  _buildContents(userMessage, context = {}) {
    const contents = [
      { role: 'user', parts: [{ text: `[SETUP] ${this.systemPrompt}` }] },
      { role: 'model', parts: [{ text: 'Got it. Producer mode.' }] }
    ];

    // If audio is loaded, inject it as context before the conversation
    if (this.hasAudio()) {
      contents.push({
        role: 'user',
        parts: [
          { text: '[REFERENCE TRACK] Analyze this track\'s production style. Describe the genre, BPM, mood, key elements (drums, bass, melodies, effects), arrangement, and overall vibe in detail. I will use this analysis to create a similar beat.' },
          { inlineData: { mimeType: this.audioMime, data: this.audioData } }
        ]
      });
      contents.push({ role: 'model', parts: [{ text: 'Got it. Reference loaded — I\'ll analyze the production.' }] });
      this.clearAudio();
    }

    let ctx = 'Current session: ';
    if (context.artistName) ctx += `Artist: ${context.artistName}. `;
    if (context.tracksMade > 0) ctx += `Tracks made this session: ${context.tracksMade}. `;
    if (context.lastTrackName) ctx += `Last track: ${context.lastTrackName}. `;
    if (context.currentGenre) ctx += `Current genre: ${context.currentGenre}. `;
    if (this.producer && this.producer.id !== 'none') {
      ctx += `Style reference: ${this.producer.name}. Signature sound: ${this.producer.signatureSound}. Production keywords: ${this.producer.keywords}. `;
    } else if (this.producer && this.producer.names) {
      ctx += `Blended style: ${this.producer.names}. Combined signature: ${this.producer.signatureSound}. Keywords: ${this.producer.keywords}. `;
    }

    contents.push({ role: 'user', parts: [{ text: `[CONTEXT] ${ctx}` }] });
    contents.push({ role: 'model', parts: [{ text: 'Tracking.' }] });

    const recent = this.history.slice(-12);
    for (const msg of recent) {
      contents.push({
        role: msg.role === 'ai' ? 'model' : 'user',
        parts: [{ text: msg.text }]
      });
    }

    contents.push({ role: 'user', parts: [{ text: userMessage }] });
    return contents;
  }

  /**
   * Call Gemini API with function declarations
   * @returns {{ text: string|null, functionCall: {name: string, args: object}|null }}
   */
  async chat(userMessage, context = {}) {
    if (!this.hasKey()) throw new Error('No Gemini key set.');

    const contents = this._buildContents(userMessage, context);

    const response = await fetch(`${this.baseUrl}${this.model}:generateContent?key=${this.key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        tools: [{ functionDeclarations: [this.generateBeatFn] }],
        generationConfig: {
          temperature: 0.8,
          topP: 0.9,
          maxOutputTokens: 800
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Gemini API ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const candidate = data?.candidates?.[0]?.content;

    if (!candidate) {
      if (data?.promptFeedback?.blockReason) {
        throw new Error(`Gemini blocked: ${data.promptFeedback.blockReason}`);
      }
      throw new Error('Gemini returned empty response');
    }

    let text = null;
    let functionCall = null;

    for (const part of (candidate.parts || [])) {
      if (part.text) {
        text = (text || '') + part.text;
      }
      if (part.functionCall) {
        functionCall = {
          name: part.functionCall.name,
          args: part.functionCall.args || {}
        };
      }
    }

    return { text, functionCall };
  }

  /**
   * Send a message and track it in history
   * @returns {{ text: string|null, functionCall: {name: string, args: object}|null }}
   */
  async sendMessage(userMessage, context = {}) {
    const result = await this.chat(userMessage, context);

    this.history.push({ role: 'user', text: userMessage });
    this.history.push({ role: 'ai', text: result.text || '(generating beat...)' });

    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }

    return result;
  }
}

window.GeminiAPI = GeminiAPI;

// ===== PRODUCER STYLE PROFILES =====
const PRODUCERS = [
  { id: 'none', name: 'None (Default)', genres: [], bpmRange: '', signatureSound: '', keywords: '', promptSuffix: '' },
  { id: 'metro-boomin', name: 'Metro Boomin', genres: ['Trap', 'Drill', 'R&B'], bpmRange: '130-160', signatureSound: 'Sinister melodies, cinematic strings, heavy 808s, sparse hi-hats', keywords: 'dark cinematic, sliding 808s, eerie melody, sparse hats, heavy bass', promptSuffix: 'Metro Boomin style — cinematic trap with dark melodic elements and hard-hitting 808s' },
  { id: 'dr-dre', name: 'Dr. Dre', genres: ['Boom Bap', 'G-Funk', 'West Coast'], bpmRange: '85-100', signatureSound: 'Funky basslines, live instrumentation, layered synths, crisp snares', keywords: 'west coast g-funk, funky bass, live instrumentation, crisp snare, layered synths', promptSuffix: 'Dr. Dre style — west coast g-funk with funky basslines and crisp live instrumentation' },
  { id: 'j-dilla', name: 'J Dilla', genres: ['Boom Bap', 'Lo-Fi', 'Hip Hop'], bpmRange: '80-95', signatureSound: 'Off-kilter drums, soul samples, swung grooves, warm vinyl texture', keywords: 'off-kilter drums, soulful samples, swung groove, lo-fi warmth, dusty vinyl', promptSuffix: 'J Dilla style — swung soulful drums with off-kilter grooves and warm sample texture' },
  { id: 'pharrell', name: 'Pharrell Williams', genres: ['Pop', 'R&B', 'Funk', 'Hip Hop'], bpmRange: '95-130', signatureSound: 'Bouncy rhythms, bright synths, sparse arrangements, 4/4 simplicity', keywords: 'bouncy rhythm, bright synths, sparse arrangement, pop hook, funky groove', promptSuffix: 'Pharrell Williams style — bouncy, bright, minimal pop-funk with catchy rhythm' },
  { id: 'timbaland', name: 'Timbaland', genres: ['R&B', 'Pop', 'Hip Hop', 'World'], bpmRange: '70-120', signatureSound: 'Polyrhythmic drums, unique percussion, staccato strings, spacey soundscapes', keywords: 'polyrhythmic drums, unique percussion, staccato strings, spacey, futuristic', promptSuffix: 'Timbaland style — polyrhythmic percussion with spacey soundscapes and unique drum patterns' },
  { id: 'mike-dean', name: 'Mike Dean', genres: ['Trap', 'Hip Hop', 'Experimental'], bpmRange: '120-160', signatureSound: 'Massive synth soundscapes, distorted 808s, psychedelic elements, analog warmth', keywords: 'massive synths, distorted 808s, psychedelic, analog, atmospheric', promptSuffix: 'Mike Dean style — massive analog synth soundscapes with distorted 808s and psychedelic textures' },
  { id: 'madlib', name: 'Madlib', genres: ['Boom Bap', 'Lo-Fi', 'Jazz Rap', 'Experimental'], bpmRange: '75-100', signatureSound: 'Abstract samples, raw drums, jazz influences, lo-fi aesthetic, unpredictable', keywords: 'abstract samples, raw drums, jazz influence, lo-fi, unpredictable, dusty', promptSuffix: 'Madlib style — abstract sample-based beat with raw drums and lo-fi jazz aesthetic' },
  { id: 'alchemist', name: 'The Alchemist', genres: ['Boom Bap', 'Hip Hop', 'Lo-Fi'], bpmRange: '80-100', signatureSound: 'Gritty samples, loop-based, vinyl crackle, classic drum machines, smoky atmosphere', keywords: 'gritty samples, loop-based, vinyl crackle, SP-1200, smoky atmosphere', promptSuffix: 'The Alchemist style — gritty loop-based beat with vinyl warmth and classic drum machine feel' },
  { id: 'mustard', name: 'DJ Mustard', genres: ['Ratchet', 'West Coast', 'Pop'], bpmRange: '95-110', signatureSound: 'Minimalist claps, simple 808 patterns, catchy whistles, speaker-rattling bass', keywords: 'minimalist claps, simple 808 pattern, catchy whistle, speaker-rattling bass', promptSuffix: 'DJ Mustard style — minimalist west coast ratchet beat with simple 808s and catchy stabs' },
  { id: 'murda-beatz', name: 'Murda Beatz', genres: ['Trap', 'Drill', 'Pop'], bpmRange: '130-155', signatureSound: 'Hard trap drums, sliding 808s, simple melodies, dancefloor energy', keywords: 'hard trap drums, sliding 808s, simple melody, dancefloor, energetic', promptSuffix: 'Murda Beatz style — hard trap beat with sliding 808s and dancefloor-ready energy' },
  { id: 'kanye', name: 'Kanye West', genres: ['Hip Hop', 'Experimental', 'Soul', 'Gospel'], bpmRange: '60-140', signatureSound: 'Soul chops, pitched-up vocals, orchestral elements, genre-defying arrangements', keywords: 'soul chops, pitched vocals, orchestral, experimental, genre-defying, stadium', promptSuffix: 'Kanye West style — soulful orchestral hip hop with pitched vocals and genre-blending production' },
  { id: 'hit-boy', name: 'Hit-Boy', genres: ['Trap', 'Boom Bap', 'R&B', 'West Coast'], bpmRange: '90-150', signatureSound: 'Crisp production, heavy bass, layered melodies, versatile across styles', keywords: 'crisp production, heavy bass, layered melodies, versatile, polished', promptSuffix: 'Hit-Boy style — polished trap-infused beat with crisp drums and layered melodic elements' },
  { id: 'boi-1da', name: 'Boi-1da', genres: ['Hip Hop', 'R&B', 'Pop', 'Drill'], bpmRange: '80-150', signatureSound: 'Hard drums, dark melodies, minimalist approach, heavy sub-bass', keywords: 'hard drums, dark melodies, minimalist, sub-bass, atmospheric', promptSuffix: 'Boi-1da style — hard-hitting hip hop with dark minimalist melodies and heavy sub-bass' },
  { id: 'zaytoven', name: 'Zaytoven', genres: ['Trap', 'R&B', 'Gospel'], bpmRange: '130-170', signatureSound: 'Fast melodic runs on keys, trap drums, gospel-influenced chord progressions', keywords: 'fast melodic keys, trap drums, gospel influence, bright melodies, piano', promptSuffix: 'Zaytoven style — trap beat with fast gospel-influenced keyboard melodies and bright piano runs' },
  { id: 'kenny-beats', name: 'Kenny Beats', genres: ['Trap', 'Boom Bap', 'Pop', 'Jersey Club'], bpmRange: '90-150', signatureSound: '808 slides, punchy kicks, clean mix, modern lo-fi, creative samples', keywords: '808 slides, punchy kicks, clean mix, modern lo-fi, creative samples', promptSuffix: 'Kenny Beats style — modern trap beat with 808 slides, punchy kicks, and clean production' },
  { id: 'dj-premier', name: 'DJ Premier', genres: ['Boom Bap', 'East Coast', 'Hip Hop'], bpmRange: '85-100', signatureSound: 'Chopped samples, hard snares, scratching, raw drums, gritty basslines', keywords: 'chopped samples, hard snares, scratching, raw drums, gritty, boom bap', promptSuffix: 'DJ Premier style — classic boom bap with chopped samples, hard snares, and raw gritty drums' },
  { id: 'rza', name: 'RZA', genres: ['Boom Bap', 'East Coast', 'Hip Hop'], bpmRange: '80-105', signatureSound: 'Raw dusty drums, kung fu samples, eerie strings, lo-fi grit, Wu-Tang darkness', keywords: 'raw dusty drums, kung fu samples, eerie strings, lo-fi grit, wu-tang darkness', promptSuffix: 'RZA style — raw lo-fi east coast beat with dusty drums, eerie samples, and gritty Wu-Tang darkness' },
  { id: 'just-blaze', name: 'Just Blaze', genres: ['Boom Bap', 'Hip Hop', 'Soul'], bpmRange: '80-105', signatureSound: 'Soaring soul samples, stadium drums, orchestral energy, dramatic builds', keywords: 'soaring soul samples, stadium drums, orchestral, dramatic builds, anthemic', promptSuffix: 'Just Blaze style — anthemic soulful hip hop with soaring samples and stadium-energy drums' },
  { id: 'no-id', name: 'No I.D.', genres: ['Boom Bap', 'Hip Hop', 'R&B', 'Soul'], bpmRange: '75-100', signatureSound: 'Soulful samples, warm textures, smooth drums, Chicago sound, introspective', keywords: 'soulful samples, warm textures, smooth drums, chicago sound, introspective', promptSuffix: 'No I.D. style — warm soulful hip hop with smooth drums and sample-based Chicago texture' },
  { id: '9th-wonder', name: '9th Wonder', genres: ['Boom Bap', 'Hip Hop', 'Soul', 'Lo-Fi'], bpmRange: '85-100', signatureSound: 'Soulful chopped samples, warm bass, crisp drums, melodic loops, boom bap revival', keywords: 'soulful chopped samples, warm bass, crisp drums, melodic loops, boom bap', promptSuffix: '9th Wonder style — soulful boom bap with warm chopped samples and crisp melodic drums' },
  { id: 'swizz-beatz', name: 'Swizz Beatz', genres: ['Hip Hop', 'Pop', 'Dance'], bpmRange: '90-120', signatureSound: 'Bouncy synth stabs, heavy kicks, energetic drums, call-and-response hooks', keywords: 'bouncy synth stabs, heavy kicks, energetic drums, call-and-response, dance', promptSuffix: 'Swizz Beatz style — high-energy hip hop with bouncy synth stabs and heavy dancefloor drums' },
  { id: 'lex-luger', name: 'Lex Luger', genres: ['Trap', 'Hip Hop', 'Southern'], bpmRange: '130-160', signatureSound: 'Rolling 808s, aggressive hi-hat rolls, dark synths, minimalist trap', keywords: 'rolling 808s, aggressive hi-hat rolls, dark synths, minimalist trap, southern', promptSuffix: 'Lex Luger style — aggressive trap with rolling 808s, dark synths, and rapid hi-hat rolls' },
  { id: 'pierre-bourne', name: 'Pierre Bourne', genres: ['Trap', 'Rage', 'Hip Hop', 'Experimental'], bpmRange: '130-170', signatureSound: 'Bouncy 808s, psychedelic melodies, glitchy percussion, catchy loops, rage energy', keywords: 'bouncy 808s, psychedelic melodies, glitchy percussion, catchy loops, rage', promptSuffix: 'Pierre Bourne style — psychedelic rage trap with bouncy 808s and glitchy catchy melodies' },
  { id: 'havoc', name: 'Havoc (Mobb Deep)', genres: ['Boom Bap', 'East Coast', 'Hip Hop'], bpmRange: '80-100', signatureSound: 'Dark piano loops, gritty drums, ominous atmosphere, raw street sound', keywords: 'dark piano loops, gritty drums, ominous atmosphere, raw, street, east coast', promptSuffix: 'Havoc style — dark east coast boom bap with gritty drums and ominous piano loops' },
  { id: 'pete-rock', name: 'Pete Rock', genres: ['Boom Bap', 'Jazz Rap', 'Hip Hop'], bpmRange: '85-100', signatureSound: 'Smooth jazz samples, crisp drums, melodic basslines, laid-back groove, soulful', keywords: 'smooth jazz samples, crisp drums, melodic basslines, laid-back groove, soulful', promptSuffix: 'Pete Rock style — smooth jazz-infused boom bap with crisp drums and soulful laid-back grooves' },
  { id: 'mannie-fresh', name: 'Mannie Fresh', genres: ['Bounce', 'Southern', 'Hip Hop'], bpmRange: '85-110', signatureSound: 'Bouncy synth bass, heavy kick drums, call-and-response chants, new orleans bounce', keywords: 'bouncy synth bass, heavy kick drums, call-and-response, new orleans bounce, party', promptSuffix: 'Mannie Fresh style — new orleans bounce beat with bouncy synth bass and heavy dancefloor drums' },
  { id: 'dj-khalil', name: 'DJ Khalil', genres: ['Boom Bap', 'West Coast', 'Hip Hop', 'R&B'], bpmRange: '80-100', signatureSound: 'Cinematic strings, soulful samples, west coast bounce, live instrumentation', keywords: 'cinematic strings, soulful samples, west coast bounce, live instrumentation', promptSuffix: 'DJ Khalil style — cinematic west coast hip hop with soulful samples and live instrumentation' },
  { id: 'trent-reznor', name: 'Trent Reznor / Atticus Ross', genres: ['Industrial', 'Ambient', 'Electronic', 'Film Score'], bpmRange: '60-130', signatureSound: 'Dark industrial textures, glitchy electronics, ambient soundscapes, distorted bass', keywords: 'dark industrial, glitchy electronics, ambient, distorted, cinematic, textured', promptSuffix: 'Trent Reznor style — dark industrial electronic beat with glitchy textures and cinematic soundscape' }
];

/* ================= app.js ================= */
/* ============================================
   AXIS STUDIO — Main App Controller
   ============================================ */

(() => {
  const $ = (id) => document.getElementById(id);
  const $$ = (sel) => document.querySelectorAll(sel);

  function getProducer(id) {
    return PRODUCERS.find(p => p.id === id) || PRODUCERS[0];
  }

  function getSelectedProducers() {
    return state.selectedProducers.map(id => getProducer(id)).filter(p => p.id !== 'none');
  }

  function combineProducerStyles(producers) {
    if (!producers.length) return null;
    const names = producers.map(p => p.name).join(' + ');
    const sigs = [...new Set(producers.flatMap(p => p.signatureSound.split(', ')))].join(', ');
    const kws = [...new Set(producers.flatMap(p => p.keywords.split(', ')))].join(', ');
    const suffixes = producers.map(p => p.promptSuffix);
    const promptSuffix = suffixes.length === 1 ? suffixes[0] : `${suffixes.slice(0, -1).join(', ')} blended with ${suffixes.slice(-1)[0]}`;
    const genres = [...new Set(producers.flatMap(p => p.genres))];
    return { names, signatureSound: sigs, keywords: kws, promptSuffix, genres };
  }

  function renderProducerList(filter = '') {
    const list = $('producerList');
    const lower = filter.toLowerCase();
    list.innerHTML = PRODUCERS.filter(p => !lower || p.name.toLowerCase().includes(lower)).map(p => {
      const checked = state.selectedProducers.includes(p.id) ? ' checked' : '';
      return `<label class="producer-opt">
        <input type="checkbox" value="${p.id}"${checked} />
        <span class="po-name">${p.name}</span>
        <span class="po-genres">${p.genres.slice(0, 2).join(', ')}${p.genres.length > 2 ? '…' : ''}</span>
      </label>`;
    }).join('');
    updateProducerSummary();
  }

  function updateProducerSummary() {
    const sel = getSelectedProducers();
    $('producerSummary').textContent = sel.length ? sel.map(p => p.name.split(' ')[0]).join('+') : 'None';
    $('producerChip').classList.toggle('active', sel.length > 0);
  }

  function onProducerToggle(e) {
    const cb = e.target.closest('input[type="checkbox"]');
    if (!cb) return;
    const id = cb.value;
    if (cb.checked) {
      if (!state.selectedProducers.includes(id)) state.selectedProducers.push(id);
    } else {
      state.selectedProducers = state.selectedProducers.filter(i => i !== id);
    }
    localStorage.setItem('axis_producers', JSON.stringify(state.selectedProducers));
    const combined = combineProducerStyles(getSelectedProducers());
    gemini.setProducer(combined);
    updateProducerSummary();
  }

  // ===== INDEXEDDB BLOB STORE =====
  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('AxisStudio', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('blobs')) {
          db.createObjectStore('blobs');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function storeBlob(id, blob) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('blobs', 'readwrite');
      tx.objectStore('blobs').put(blob, id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function getBlob(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('blobs', 'readonly');
      const req = tx.objectStore('blobs').get(id);
      req.onsuccess = () => { db.close(); resolve(req.result); };
      req.onerror = () => { db.close(); reject(req.error); };
    });
  }

  async function deleteBlob(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('blobs', 'readwrite');
      tx.objectStore('blobs').delete(id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    });
  }

  async function restoreTrackBlobs(tracks) {
    const restored = [];
    for (const t of tracks) {
      if (t.url && !t.url.startsWith('blob:')) {
        restored.push(t);
      } else if (t.hasBlob) {
        const blob = await getBlob(t.id);
        if (blob) {
          t.blob = blob;
          t.url = URL.createObjectURL(blob);
          restored.push(t);
        }
        // else: blob missing from IDB — skip
      }
      // else: no url, no blob — skip
    }
    return restored;
  }

  // ===== STATE =====
  const state = {
    apiKey: localStorage.getItem('axis_api_key') || '',
    geminiKey: localStorage.getItem('axis_gemini_key') || '',
    artistName: localStorage.getItem('axis_artist') || '',
    selectedProducers: (() => {
      try { return JSON.parse(localStorage.getItem('axis_producers') || '[]'); }
      catch { return []; }
    })(),
    model: localStorage.getItem('axis_model') || 'music-3.0',
    outputFormat: localStorage.getItem('axis_output_format') || 'hex',
    tracks: [],
    currentTrack: null,
    isPlaying: false,
    isGenerating: false,
    visualizer: null
  };

  const music = new MusicAPI();
  const producer = new ProducerAI();
  const gemini = new GeminiAPI();
  producer.setArtistName(state.artistName);
  if (state.apiKey) music.setKey(state.apiKey);
  if (state.geminiKey) gemini.setKey(state.geminiKey);
  music.setModel(state.model);
  music.setOutputFormat(state.outputFormat);

  // ===== INIT =====
  async function init() {
    const saved = JSON.parse(localStorage.getItem('axis_tracks') || '[]');
    state.tracks = await restoreTrackBlobs(saved);

    if (!state.apiKey) {
      showSetup();
    } else {
      enterApp();
    }
    wireEvents();
    setModel(state.model);
    setOutputFormat(state.outputFormat);
    refreshPromptPreview();
  }

  // ===== SETUP MODAL =====
  function showSetup() {
    $('setupModal').classList.remove('hidden');
    $('app').classList.add('hidden');
    if (state.apiKey) $('apiKeyInput').value = state.apiKey;
    if (state.geminiKey) $('geminiKeyInput').value = state.geminiKey;
    if (state.artistName) $('artistNameInput').value = state.artistName;
  }

  function hideSetup() {
    $('setupModal').classList.add('hidden');
  }

  async function testConnection() {
    const key = $('apiKeyInput').value.trim();
    if (!key) {
      setSetupStatus('Drop your key in first.', 'err');
      return;
    }
    setSetupStatus('Testing...', '');
    music.setKey(key);
    const result = await music.testConnection();
    const debugEl = $('setupDebug');
    if (result.ok) {
      setSetupStatus('✓ ' + result.message, 'ok');
      if (debugEl) { debugEl.textContent = result.raw ? result.raw : ''; debugEl.setAttribute('aria-hidden', result.raw ? 'false' : 'true'); }
    } else {
      setSetupStatus('✗ ' + result.message, 'err');
      if (debugEl) { debugEl.textContent = result.raw ? result.raw : result.message; debugEl.setAttribute('aria-hidden', 'false'); }
    }
  }

  function setSetupStatus(msg, type) {
    const el = $('setupStatus');
    el.textContent = msg;
    el.className = 'setup-status ' + type;
  }

  function setModel(model) {
    if (!model) return;
    state.model = model;
    music.setModel(model);
    localStorage.setItem('axis_model', model);
    const select = $('modelSelect');
    if (select) select.value = model;
    const headerSelect = $('headerModelSelect');
    if (headerSelect) headerSelect.value = model;
  }

  function setOutputFormat(format) {
    if (!format) return;
    state.outputFormat = format;
    music.setOutputFormat(format);
    localStorage.setItem('axis_output_format', format);
    const select = $('outputSelect');
    if (select) select.value = format;
  }

  function enterApp() {
    hideSetup();
    $('app').classList.remove('hidden');
    initVisualizer();
    renderLibrary();
    if (state.tracks.length > 0) {
      addProducerMessage(
        `Welcome back${state.artistName ? `, ${state.artistName}` : ''}. I see ${state.tracks.length} ${
          state.tracks.length === 1 ? 'track' : 'tracks'
        } in the library from last time. Want me to cook something fresh, or should we revisit one of the old ones?`
      );
    } else {
      const hasGemini = gemini.hasKey();
      const sel = getSelectedProducers();
      const blend = sel.length ? ` — ${sel.map(p => p.name.split(' ')[0]).join(' + ')} in the building` : '';
      addProducerMessage(
        hasGemini
          ? `Yo${state.artistName ? ` ${state.artistName}` : ''}. Studio's live, mic's hot. I'm locked in${blend}. Talk to me — what we building?`
          : `Yo${state.artistName ? ` ${state.artistName}` : ''}. I'm AXIS — your producer on the other end of this mic.${blend} Tell me a vibe, a genre, or a reference, and I'll cook.`
      );
    }
    updateMeters();
    updateApiIndicator(true);
    refreshPromptPreview();
  }

  function updateApiIndicator(up) {
    const el = $('apiIndicator');
    if (up) {
      el.classList.remove('down');
    } else {
      el.classList.add('down');
      el.querySelector('.api-text').textContent = 'API DOWN';
    }
  }

  // ===== VISUALIZER =====
  function initVisualizer() {
    // Dispose previous visualizer if re-initializing (e.g., after settings)
    if (state.visualizer) {
      if (state.visualizer.audioCtx) state.visualizer.audioCtx.close();
      state.visualizer = null;
    }
    const canvas = $('visualizer');
    state.visualizer = new Visualizer(canvas);
    state.visualizer.attach($('audioEl'));
    window.__vuCtx = state.visualizer.audioCtx;
    window.__vuAnalyser = state.visualizer.analyser;
  }

  // ===== EVENTS =====
  function wireEvents() {
    // Setup
    $('testKeyBtn').addEventListener('click', testConnection);
    $('enterStudioBtn').addEventListener('click', saveAndEnter);
    $('toggleKeyVis').addEventListener('click', () => {
      const inp = $('apiKeyInput');
      inp.type = inp.type === 'password' ? 'text' : 'password';
    });
    const geminiToggle = $('toggleGeminiVis');
    if (geminiToggle) {
      geminiToggle.addEventListener('click', () => {
        const inp = $('geminiKeyInput');
        inp.type = inp.type === 'password' ? 'text' : 'password';
      });
    }
    $('apiKeyInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveAndEnter();
    });

    $('modelSelect').addEventListener('change', (e) => {
      setModel(e.target.value);
      toast(`Using ${e.target.selectedOptions[0].textContent}`, 'ok');
    });
    const headerModelSelect = $('headerModelSelect');
    if (headerModelSelect) {
      headerModelSelect.addEventListener('change', (e) => {
        setModel(e.target.value);
        toast(`Using ${e.target.selectedOptions[0].textContent}`, 'ok');
      });
    }

    // Producer multi-select
    const producerChip = $('producerChip');
    const producerList = $('producerList');
    const producerSearch = $('producerSearch');
    if (producerChip) {
      renderProducerList();
      const combined = combineProducerStyles(getSelectedProducers());
      gemini.setProducer(combined);
      producerChip.addEventListener('click', (e) => {
        if (e.target.closest('.producer-drop')) return;
        producerChip.classList.toggle('open');
        if (producerChip.classList.contains('open')) {
          producerSearch.focus();
        }
      });
      producerList.addEventListener('change', onProducerToggle);
      producerSearch.addEventListener('input', (e) => renderProducerList(e.target.value));
      document.addEventListener('click', (e) => {
        if (!producerChip.contains(e.target)) producerChip.classList.remove('open');
      });
    }
    const outputSelect = $('outputSelect');
    if (outputSelect) {
      outputSelect.addEventListener('change', (e) => {
        setOutputFormat(e.target.value);
        toast(`Output set to ${e.target.selectedOptions[0].textContent}`, 'ok');
      });
    }

    // Settings (re-open setup)
    $('settingsBtn').addEventListener('click', showSetup);

    // Chat
    $('sendBtn').addEventListener('click', sendMessage);
    $('chatInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    $('chatInput').addEventListener('input', autoResize);
    const uploadBtn = $('uploadBtn');
    const audioUpload = $('audioUpload');
    if (uploadBtn && audioUpload) {
      uploadBtn.addEventListener('click', () => audioUpload.click());
      audioUpload.addEventListener('change', handleAudioUpload);
    }
    $('styleSel').addEventListener('change', refreshPromptPreview);
    $('genreSel').addEventListener('change', refreshPromptPreview);
    $('bpmIn').addEventListener('input', refreshPromptPreview);
    $('moodSel').addEventListener('change', refreshPromptPreview);
    $('refSel').addEventListener('change', refreshPromptPreview);
    $('promptIn').addEventListener('input', refreshPromptPreview);
    $('clearChatBtn').addEventListener('click', clearChat);

    // Quick chips
    $$('.quick-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        $('chatInput').value = chip.dataset.prompt;
        sendMessage();
      });
    });

    // Generation form
    $('genBtn').addEventListener('click', () => generateFromForm());
    $('promptIn').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') generateFromForm();
    });

    // Transport
    $('playBtn').addEventListener('click', togglePlay);
    $('stopBtn').addEventListener('click', stopPlayback);
    $('replayBtn').addEventListener('click', () => {
      if (state.currentTrack) {
        playTrack(state.currentTrack);
      }
    });
    $('downloadBtn').addEventListener('click', () => {
      if (state.currentTrack) downloadTrack(state.currentTrack);
    });
    $('volumeSlider').addEventListener('input', (e) => {
      $('audioEl').volume = e.target.value / 100;
    });

    // Audio events
    $('audioEl').addEventListener('timeupdate', updateProgress);
    $('audioEl').addEventListener('loadedmetadata', updateTotalTime);
    $('audioEl').addEventListener('ended', onTrackEnd);
    $('audioEl').addEventListener('play', () => {
      state.isPlaying = true;
      $('playBtn').textContent = '❚❚';
      $('vizOverlay').classList.add('hidden');
      $('stopBtn').disabled = false;
      const v = $('vinylDisc');
      if (v) v.classList.add('playing');
      const st = $('vizLabelStatus');
      if (st) st.textContent = 'LIVE';
      const danceAnims = ['Fist', 'Clap', 'Clap (1)', 'Thumbs Up', 'Cheering While Sitting', 'Cheering While Sitting (1)', 'Hip Hop Dancing', 'Wave Hip Hop Dance', 'Silly Dancing', 'Gangnam Style', 'Playing Drums', 'Listening To Music'];
      window.__boothSetAnim && window.__boothSetAnim(danceAnims[Math.floor(Math.random() * danceAnims.length)]);
      if (window.__danceCycle) clearInterval(window.__danceCycle);
      window.__danceCycle = setInterval(() => {
        if (!state.isPlaying) { clearInterval(window.__danceCycle); return; }
        window.__boothSetAnim && window.__boothSetAnim(danceAnims[Math.floor(Math.random() * danceAnims.length)]);
      }, 4000 + Math.random() * 2000);
    });
    $('audioEl').addEventListener('pause', () => {
      state.isPlaying = false;
      $('playBtn').textContent = '▶';
      const v = $('vinylDisc');
      if (v) v.classList.remove('playing');
      if (window.__danceCycle) { clearInterval(window.__danceCycle); window.__danceCycle = null; }
      window.__boothSetAnim && window.__boothSetAnim('Idle');
    });
  }

  function saveAndEnter() {
    const key = $('apiKeyInput').value.trim();
    const gemKey = $('geminiKeyInput').value.trim();
    const name = $('artistNameInput').value.trim();
    if (!key) {
      setSetupStatus('Need a MiniMax key to enter the studio.', 'err');
      return;
    }
    state.apiKey = key;
    state.geminiKey = gemKey;
    state.artistName = name || '';
    localStorage.setItem('axis_api_key', key);
    if (gemKey) localStorage.setItem('axis_gemini_key', gemKey);
    else localStorage.removeItem('axis_gemini_key');
    localStorage.setItem('axis_artist', state.artistName);
    music.setKey(key);
    if (gemKey) gemini.setKey(gemKey);
    producer.setArtistName(state.artistName);
    enterApp();
  }

  function autoResize() {
    const el = $('chatInput');
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  // ===== CHAT =====
  async function handleAudioUpload() {
    if (!gemini.hasKey()) {
      toast('Gemini key required to analyze reference tracks', 'err');
      $('audioUpload').value = '';
      return;
    }
    const input = $('audioUpload');
    const file = input.files[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      toast('File too large — max 10MB', 'err');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    $('uploadBtn').classList.add('loading');

    reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1];
      gemini.setAudio(base64, file.type || 'audio/mpeg');
      input.value = '';
      $('uploadBtn').classList.remove('loading');

      addUserMessage(`🎵 Uploaded reference: ${file.name} (analyzing...)`);
      showTyping(true);

      // Send immediately to trigger analysis with audio inline
      try {
        const result = await gemini.sendMessage('Break it down for me.', {
          artistName: state.artistName,
          tracksMade: producer.context.tracksMade,
          lastTrackName: producer.context.lastTrackName,
          currentGenre: producer.context.currentGenre
        });
        showTyping(false);
        if (result.text) {
          addProducerMessage(result.text);
        }
      } catch (err) {
        showTyping(false);
        console.error('Audio analysis error:', err);
        addProducerMessage('Could not analyze that track. The file may be too long or unsupported. Try a shorter clip (under 2 minutes).');
      }
    };

    reader.onerror = () => {
      $('uploadBtn').classList.remove('loading');
      toast('Failed to read file', 'err');
    };

    reader.readAsDataURL(file);
  }

  async function sendMessage() {
    const input = $('chatInput');
    const msg = input.value.trim();
    if (!msg || state.isGenerating) return;

    addUserMessage(msg);
    input.value = '';
    input.style.height = 'auto';

    showTyping(true);

    if (gemini.hasKey()) {
      try {
        const context = {
          artistName: state.artistName,
          tracksMade: producer.context.tracksMade,
          lastTrackName: producer.context.lastTrackName,
          currentGenre: producer.context.currentGenre
        };

        const result = await gemini.sendMessage(msg, context);
        showTyping(false);

        // Display Gemini's text response if any
        if (result.text) {
          addProducerMessage(result.text);
        }

        // If Gemini called generate_beat, extract params and cook
        if (result.functionCall && result.functionCall.name === 'generate_beat') {
          const args = result.functionCall.args;

          // Fill missing params with defaults
          const params = {
            genre: args.genre || producer.context.currentGenre || 'Trap',
            bpm: args.bpm || producer.context.currentBpm || undefined,
            mood: args.mood || producer.context.currentMood || undefined,
            reference: args.reference || '',
            style: args.style || '',
            extraPrompt: args.extraPrompt || ''
          };

          // If Gemini didn't give a text response, give our own
          if (!result.text) {
            addProducerMessage(`Say less. ${params.genre}${params.bpm ? ` at ${params.bpm} BPM` : ''}${params.mood ? `, ${params.mood.toLowerCase()}` : ''}${params.reference ? `, ${params.reference} vibes` : ''}. I'm on it.`);
          }

          generateBeat(params);
        }
      } catch (err) {
        console.error('Gemini error:', err);
        showTyping(false);
        // Fall back to rule-based on error
        const { response: fallback, intent } = producer.respond(msg);
        addProducerMessage(fallback.text);
        if (intent.action === 'generate') {
          const params = producer._respondGenerate(intent).params;
          generateBeat(params);
        }
      }
    } else {
      // Use rule-based ProducerAI
      const typingDelay = 600 + Math.random() * 800;
      await new Promise(r => setTimeout(r, typingDelay));
      const { response, intent } = producer.respond(msg);
      showTyping(false);
      addProducerMessage(response.text);

      if (response.action === 'generate' && response.params) {
        generateBeat(response.params);
      }
    }
  }

  function addUserMessage(text) {
    const div = document.createElement('div');
    div.className = 'msg user';
    div.innerHTML = `
      <div class="bubble-avatar">${(state.artistName || 'U').charAt(0).toUpperCase()}</div>
      <div class="bubble"></div>
    `;
    div.querySelector('.bubble').textContent = text;
    $('chatStream').appendChild(div);
    scrollChat();
  }

  function addProducerMessage(text) {
    const div = document.createElement('div');
    div.className = 'msg ai';
    div.innerHTML = `
      <div class="bubble-avatar">A</div>
      <div class="bubble"></div>
    `;
    const bubble = div.querySelector('.bubble');
    bubble.innerHTML = formatMarkdown(text);
    $('chatStream').appendChild(div);
    scrollChat();
  }

  function formatMarkdown(text) {
    let safe = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    safe = safe
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\n/g, '<br>');
    return safe;
  }

  function showTyping(show) {
    $('typingIndicator').classList.toggle('show', show);
    if (show) {
      window.__boothSetAnim && window.__boothSetAnim('Talking');
    } else {
      window.__boothSetAnim && window.__boothSetAnim('Idle');
    }
  }

  function scrollChat() {
    const stream = $('chatStream');
    requestAnimationFrame(() => {
      stream.scrollTop = stream.scrollHeight;
    });
  }

  function clearChat() {
    if (!confirm("Clear the whole session? Your tracks stay in the library.")) return;
    $('chatStream').innerHTML = '';
    gemini.clearHistory();
    const hasGemini = gemini.hasKey();
    const sel = getSelectedProducers();
    const blend = sel.length ? ` — ${sel.map(p => p.name.split(' ')[0]).join(' + ')} in the room` : '';
    addProducerMessage(`Fresh canvas. ${state.artistName ? `Alright ${state.artistName}, ` : ''}what's the vibe?${hasGemini ? ' I\'m locked in' : ''}${blend}.`);
  }

  // ===== MUSIC GENERATION =====
  async function generateBeat(params) {
    if (state.isGenerating) return;
    state.isGenerating = true;
    setGenButtonLoading(true);
    window.__boothSetAnim && window.__boothSetAnim('Typing');

    try {
      const styles = combineProducerStyles(getSelectedProducers());
      const prompt = music.buildPrompt(params, styles);
      const result = await music.generate(prompt);

      const trackName = producer.generateTrackName(params.genre, params.mood);
      const track = {
        id: 'tr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        name: trackName,
        url: result.url,
        blob: result.blob,
        format: result.format || (state.outputFormat === 'hex' ? 'wav' : 'mp3'),
        genre: params.genre,
        bpm: params.bpm,
        mood: params.mood,
        reference: params.reference || '',
        prompt: prompt,
        createdAt: Date.now(),
        duration: result.duration || null
      };

      state.tracks.unshift(track);

      // Store blob in IndexedDB so it survives page reload
      if (track.blob) {
        storeBlob(track.id, track.blob).catch(e => console.warn('Blob store failed:', e));
      }

      persistTracks();
      renderLibrary();

      // Play the new track
      playTrack(track);

      // Producer reacts
      const reaction = producer.reactToTrack(trackName, params.genre, params.mood);
      addProducerMessage(reaction);

      // Update meters
      updateMeters();
    } catch (err) {
      console.error(err);
      addProducerMessage(`Yo, hit a snag: ${err.message}. Check your key and try again.`);
      toast(err.message, 'err');
      if (err.message.toLowerCase().includes('key') || err.message.includes('401')) {
        updateApiIndicator(false);
      }
    } finally {
      state.isGenerating = false;
      setGenButtonLoading(false);
      window.__boothSetAnim && window.__boothSetAnim('Idle');
    }
  }

  function generateFromForm() {
    const params = {
      genre: $('genreSel').value,
      bpm: parseInt($('bpmIn').value) || undefined,
      mood: $('moodSel').value,
      style: $('styleSel').value,
      reference: $('refSel').value,
      extraPrompt: $('promptIn').value.trim()
    };
    const summary = `Make a ${params.genre} beat at ${params.bpm} BPM, ${params.mood.toLowerCase()}${
      params.style ? `, ${params.style}` : ''
    }${
      params.reference ? `, ${params.reference} style` : ''
    }${params.extraPrompt ? `, ${params.extraPrompt}` : ''}`;

    addUserMessage(summary);
    showTyping(true);
    setTimeout(() => {
      showTyping(false);
      addProducerMessage(`On it. ${params.genre}, ${params.bpm} BPM, ${params.mood.toLowerCase()}${
        params.style ? `, ${params.style}` : ''
      }${
        params.reference ? `, ${params.reference} on the brain` : ''
      }. Give me a sec.`);
      generateBeat(params);
    }, 500);
  }

  function setGenButtonLoading(loading) {
    const btn = $('genBtn');
    if (loading) {
      btn.disabled = true;
      btn.querySelector('.btn-text').textContent = 'Cooking...';
    } else {
      btn.disabled = false;
      btn.querySelector('.btn-text').textContent = 'Cook';
    }
    // Toggle generation ring + status on the Audio Scope
    const ring = $('genRing');
    const status = $('vizLabelStatus');
    if (ring) ring.classList.toggle('active', loading);
    if (status) status.textContent = loading ? 'COOKING' : 'IDLE';
  }

  function refreshPromptPreview() {
    const params = {
      genre: $('genreSel').value,
      bpm: parseInt($('bpmIn').value) || undefined,
      mood: $('moodSel').value,
      style: $('styleSel').value,
      reference: $('refSel').value,
      extraPrompt: $('promptIn').value.trim()
    };
    const producer = combineProducerStyles(getSelectedProducers());
    const prompt = music.buildPrompt(params, producer);
    const preview = $('promptPreviewText');
    if (preview) preview.textContent = prompt;
  }

  // ===== PLAYBACK =====
  function playTrack(track) {
    state.currentTrack = track;
    const audio = $('audioEl');
    if (!track.url || typeof track.url !== 'string' || !track.url.trim()) {
      toast('Generated track has no playable audio source', 'err');
      console.error('Invalid track URL', track.url);
      return;
    }
    audio.src = track.url;
    audio.volume = $('volumeSlider').value / 100;
    audio.load();
    audio.play().catch(e => {
      console.error('Play failed:', e);
      toast(`Play failed: ${e.message}`, 'err');
    });

    $('npTrackName').textContent = track.name;
    $('playBtn').disabled = false;
    $('stopBtn').disabled = false;
    $('replayBtn').disabled = false;
    $('downloadBtn').disabled = false;

    $$('.lib-item').forEach(el => el.classList.remove('playing'));
    const libItem = document.querySelector(`[data-track-id="${track.id}"]`);
    if (libItem) libItem.classList.add('playing');

    if (state.visualizer) state.visualizer.resume();

    $('sessionSub').textContent = `Track ${state.tracks.length - state.tracks.indexOf(track)} · Live`;
  }

  function togglePlay() {
    const audio = $('audioEl');
    if (audio.paused || audio.ended) {
      if (audio.ended) audio.currentTime = 0;
      audio.play().catch(e => {
        console.error('Play failed:', e);
        toast(`Play failed: ${e.message}`, 'err');
      });
    } else {
      audio.pause();
    }
  }

  function stopPlayback() {
    const audio = $('audioEl');
    audio.pause();
    audio.currentTime = 0;
    $('playBtn').textContent = '▶';
    const st = $('vizLabelStatus');
    if (st) st.textContent = 'IDLE';
  }

  function onTrackEnd() {
    state.isPlaying = false;
    $('playBtn').textContent = '▶';
    const v = $('vinylDisc');
    if (v) v.classList.remove('playing');
    $('audioEl').currentTime = 0;
    const st = $('vizLabelStatus');
    if (st) st.textContent = 'IDLE';
    window.__boothSetAnim && window.__boothSetAnim('Victory');
    if (window.__danceCycle) { clearInterval(window.__danceCycle); window.__danceCycle = null; }
    setTimeout(() => { window.__boothSetAnim && window.__boothSetAnim('Idle'); }, 3000);
  }

  function updateProgress() {
    const audio = $('audioEl');
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    $('progressFill').style.width = pct + '%';
    $('curTime').textContent = formatTime(audio.currentTime);
  }

  function updateTotalTime() {
    const audio = $('audioEl');
    if (audio.duration) {
      $('totalTime').textContent = formatTime(audio.duration);
    }
  }

  function formatTime(s) {
    if (!s || !isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, '0')}`;
  }

  function downloadTrack(track) {
    const a = document.createElement('a');
    a.href = track.url;
    const ext = track.format === 'wav' ? 'wav' : 'mp3';
    a.download = `${track.name.replace(/[^a-z0-9 ]/gi, '_')}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast('Track saved to downloads', 'ok');
  }

  // ===== LIBRARY =====
  function renderLibrary() {
    const list = $('libList');
    const count = $('libCount');

    if (state.tracks.length === 0) {
      list.innerHTML = `
        <div class="lib-empty">
          <span>🎚️</span>
          <p>Your beats will stack up here.<br/>Start a session with AXIS.</p>
        </div>
      `;
      count.textContent = '0 tracks';
      return;
    }

    count.textContent = `${state.tracks.length} track${state.tracks.length === 1 ? '' : 's'}`;

    list.innerHTML = state.tracks.map(t => `
      <div class="lib-item" data-track-id="${t.id}">
        <div class="li-icon">${t.id === state.currentTrack?.id && state.isPlaying ? '❚❚' : '▶'}</div>
        <div class="li-info">
          <div class="li-name">${escapeHtml(t.name)}</div>
          <div class="li-sub">${t.genre} · ${t.bpm} BPM · ${t.mood.toUpperCase()}</div>
        </div>
        <div class="li-actions">
          <button class="dl" title="Download">⤓</button>
          <button class="del" title="Delete">✕</button>
        </div>
      </div>
    `).join('');

    list.querySelectorAll('.lib-item').forEach(el => {
      const id = el.dataset.trackId;
      const track = state.tracks.find(t => t.id === id);
      el.addEventListener('click', (e) => {
        if (e.target.closest('.dl')) {
          downloadTrack(track);
          return;
        }
        if (e.target.closest('.del')) {
          deleteTrack(id);
          return;
        }
        playTrack(track);
      });
    });
  }

  function deleteTrack(id) {
    const track = state.tracks.find(t => t.id === id);
    if (!confirm(`Delete "${track.name}"? This can't be undone.`)) return;

    if (state.currentTrack?.id === id) {
      stopPlayback();
      $('audioEl').src = '';
      state.currentTrack = null;
      $('npTrackName').textContent = '— silence —';
      $('playBtn').disabled = true;
      $('stopBtn').disabled = true;
      $('replayBtn').disabled = true;
      $('downloadBtn').disabled = true;
      $('vizOverlay').classList.remove('hidden');
    }

    state.tracks = state.tracks.filter(t => t.id !== id);
    if (track.url && track.url.startsWith('blob:')) URL.revokeObjectURL(track.url);
    deleteBlob(id).catch(e => console.warn('Blob delete failed:', e));
    persistTracks();
    renderLibrary();
  }

  function persistTracks() {
    const safe = state.tracks.map(t => ({
      id: t.id, name: t.name, genre: t.genre, bpm: t.bpm, mood: t.mood,
      reference: t.reference, prompt: t.prompt, createdAt: t.createdAt, duration: t.duration,
      url: t.url && !t.url.startsWith('blob:') ? t.url : undefined,
      hasBlob: !!(t.blob || t.url?.startsWith('blob:'))
    }));
    localStorage.setItem('axis_tracks', JSON.stringify(safe));
  }

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ===== METERS =====
  function updateMeters() {
    if (state.tracks.length === 0) {
      $('bpmDisplay').textContent = '—';
      $('keyDisplay').textContent = '—';
      $('genreDisplay').textContent = '—';
      $('energyFill').style.width = '0%';
      return;
    }
    const latest = state.tracks[0];
    $('bpmDisplay').textContent = latest.bpm || '—';
    $('keyDisplay').textContent = latest.mood ? latest.mood.slice(0, 4).toUpperCase() : '—';
    $('genreDisplay').textContent = (latest.genre || '—').slice(0, 8);
    const energy = energyForMood(latest.mood);
    $('energyFill').style.width = energy + '%';
  }

  function energyForMood(mood) {
    const map = {
      'Dark': 65, 'Hard': 90, 'Chill': 30, 'Energetic': 95,
      'Sad': 40, 'Aggressive': 100, 'Romantic': 45, 'Dreamy': 35,
      'Hypnotic': 55, 'Uplifting': 80
    };
    return map[mood] || 60;
  }

  // ===== TOAST =====
  function toast(message, type = 'ok') {
    const wrap = $('toastWrap');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(() => el.remove(), 4200);
  }

  // ===== GO =====
  init();
})();