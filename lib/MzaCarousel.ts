/**
 * Vanilla 3D carousel engine used by the home page hero.
 *
 * The component that renders the markup owns the lifecycle: instantiate once,
 * call destroy() on cleanup. All event listeners are bound to an AbortSignal so
 * unmounting (or a slide refresh) cannot leave listeners or RAF loops behind.
 */

export type MzaBreakpoint = {
  mq: string;
  gap?: number;
  peek?: number;
  rotateY?: number;
  zDepth?: number;
  scaleDrop?: number;
  blurMax?: number;
  activeLeftBias?: number;
};

export type MzaCarouselOptions = {
  gap: number;
  peek: number;
  rotateY: number;
  zDepth: number;
  scaleDrop: number;
  blurMax: number;
  activeLeftBias: number;
  interval: number;
  transitionMs: number;
  keyboard: boolean;
  breakpoints: MzaBreakpoint[];
};

type MzaState = {
  index: number;
  pos: number;
  width: number;
  height: number;
  gap: number;
  dragging: boolean;
  pointerId: number | null;
  x0: number;
  v: number;
  t0: number;
  animating: boolean;
  hovering: boolean;
  focusWithin: boolean;
  startTime: number;
  pausedAt: number;
  rafId: number;
};

type MediaListener = {
  mql: MediaQueryList;
  handler: () => void;
  legacy: boolean;
};

const DEFAULTS: MzaCarouselOptions = {
  gap: 28,
  peek: 0.15,
  rotateY: 34,
  zDepth: 150,
  scaleDrop: 0.09,
  blurMax: 2.0,
  activeLeftBias: 0.12,
  interval: 4500,
  transitionMs: 900,
  keyboard: true,
  breakpoints: [
    {
      mq: "(max-width: 1200px)",
      gap: 24,
      peek: 0.12,
      rotateY: 28,
      zDepth: 120,
      scaleDrop: 0.08,
      activeLeftBias: 0.1
    },
    {
      mq: "(max-width: 1000px)",
      gap: 18,
      peek: 0.09,
      rotateY: 22,
      zDepth: 90,
      scaleDrop: 0.07,
      activeLeftBias: 0.09
    },
    {
      mq: "(max-width: 768px)",
      gap: 14,
      peek: 0.06,
      rotateY: 16,
      zDepth: 70,
      scaleDrop: 0.06,
      activeLeftBias: 0.08
    },
    {
      mq: "(max-width: 560px)",
      gap: 12,
      peek: 0.05,
      rotateY: 12,
      zDepth: 60,
      scaleDrop: 0.05,
      activeLeftBias: 0.07
    }
  ]
};

export class MzaCarousel {
  readonly root: HTMLElement;
  readonly viewport: HTMLElement;
  readonly track: HTMLElement;
  readonly slides: HTMLElement[];
  readonly prevBtn: HTMLElement;
  readonly nextBtn: HTMLElement;
  readonly pagination: HTMLElement;
  readonly progressBar: HTMLElement;
  readonly opts: MzaCarouselOptions;
  readonly state: MzaState;

  private readonly isFF: boolean;
  private readonly baseOpts: MzaCarouselOptions;
  private readonly reduceMq: MediaQueryList;
  private readonly mediaListeners: MediaListener[] = [];
  private readonly abort = new AbortController();
  private reduceMotion = false;
  private dots: HTMLButtonElement[] = [];
  private ro: ResizeObserver | null = null;
  private slideW = 0;
  private lastActive = -1;
  private goToRafId = 0;
  private reducedHandler: () => void;

  constructor(root: HTMLElement, opts: Partial<MzaCarouselOptions> = {}) {
    this.root = root;
    this.viewport = this._qs(".mzaCarousel-viewport");
    this.track = this._qs(".mzaCarousel-track");
    this.slides = Array.from(root.querySelectorAll<HTMLElement>(".mzaCarousel-slide"));
    this.prevBtn = this._qs(".mzaCarousel-prev");
    this.nextBtn = this._qs(".mzaCarousel-next");
    this.pagination = this._qs(".mzaCarousel-pagination");
    this.progressBar = this._qs(".mzaCarousel-progressBar");
    this.isFF = typeof window !== "undefined" && "InstallTrigger" in window;

    this.opts = { ...DEFAULTS, ...opts };
    if (this.isFF) {
      this.opts.rotateY = 10;
      this.opts.zDepth = 0;
      this.opts.blurMax = 0;
    }
    this.baseOpts = { ...this.opts };

    this.state = {
      index: 0,
      pos: 0,
      width: 0,
      height: 0,
      gap: 28,
      dragging: false,
      pointerId: null,
      x0: 0,
      v: 0,
      t0: 0,
      animating: false,
      hovering: false,
      focusWithin: false,
      startTime: 0,
      pausedAt: 0,
      rafId: 0
    };

    this.reduceMq = window.matchMedia("(prefers-reduced-motion: reduce)");
    this.reduceMotion = this.reduceMq.matches;
    this.reducedHandler = () => {
      this.reduceMotion = this.reduceMq.matches;
      this._applyBreakpoints();
    };

    this._init();
  }

  private _qs<T extends Element>(selector: string): T {
    const el = this.root.querySelector<T>(selector);
    if (!el) throw new Error(`MzaCarousel: missing ${selector}`);
    return el;
  }

  private _init() {
    this._setupDots();
    this._bind();
    this._preloadImages();
    this._measure();
    this.goTo(0, false);
    this._startCycle();
    this._loop();
  }

  /** Stop every loop/listener. Safe to call more than once. */
  destroy() {
    this.abort.abort();
    cancelAnimationFrame(this.state.rafId);
    if (this.goToRafId) cancelAnimationFrame(this.goToRafId);
    this.goToRafId = 0;
    this.ro?.disconnect();
    this.ro = null;
    for (const { mql, handler, legacy } of this.mediaListeners) {
      if (legacy) mql.removeListener(handler);
      else mql.removeEventListener("change", handler);
    }
    this.mediaListeners.length = 0;
    this.reduceMq.removeEventListener("change", this.reducedHandler);
    this.pagination.innerHTML = "";
    this.dots = [];
  }

  private _preloadImages() {
    this.slides.forEach(sl => {
      const card = sl.querySelector<HTMLElement>(".mzaCard");
      if (!card) return;
      const bg = getComputedStyle(card).getPropertyValue("--mzaCard-bg");
      const match = /url\((?:'|")?([^'")]+)(?:'|")?\)/.exec(bg);
      if (match?.[1]) {
        const img = new Image();
        img.src = match[1];
      }
    });
  }

  private _setupDots() {
    this.pagination.innerHTML = "";
    this.dots = this.slides.map((_, i) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mzaCarousel-dot";
      button.setAttribute("role", "tab");
      button.setAttribute("aria-label", `Go to slide ${i + 1}`);
      button.addEventListener("click", () => this.goTo(i));
      this.pagination.appendChild(button);
      return button;
    });
  }

  private _bind() {
    const signal = this.abort.signal;

    this.prevBtn.addEventListener("click", () => this.prev(), { signal });
    this.nextBtn.addEventListener("click", () => this.next(), { signal });

    if (this.opts.keyboard) {
      this.root.addEventListener("keydown", event => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          this.prev();
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          this.next();
        }
        if (event.key === "Home") {
          event.preventDefault();
          this.goTo(0);
        }
        if (event.key === "End") {
          event.preventDefault();
          this.goTo(this.n - 1);
        }
      }, { signal });
    }

    this.viewport.addEventListener("pointerdown", e => this._onDragStart(e), { signal });
    this.viewport.addEventListener("pointermove", e => this._onDragMove(e), { signal });
    this.viewport.addEventListener("pointerup", e => this._onDragEnd(e), { signal });
    this.viewport.addEventListener("pointercancel", e => this._onDragEnd(e), { signal });
    this.viewport.addEventListener("pointermove", e => this._onTilt(e), { signal });

    this.root.addEventListener("mouseenter", () => {
      this.state.hovering = true;
      this._pause();
    }, { signal });
    this.root.addEventListener("mouseleave", () => {
      this.state.hovering = false;
      this._resume();
    }, { signal });
    this.root.addEventListener("focusin", () => {
      this.state.focusWithin = true;
      this._pause();
    }, { signal });
    this.root.addEventListener("focusout", event => {
      if (this.root.contains(event.relatedTarget as Node | null)) return;
      this.state.focusWithin = false;
      this._resume();
    }, { signal });

    if (typeof ResizeObserver !== "undefined") {
      this.ro = new ResizeObserver(() => this._measure());
      this.ro.observe(this.viewport);
    } else {
      window.addEventListener("resize", () => this._measure(), { signal });
    }

    this.opts.breakpoints.forEach(bp => {
      const mql = window.matchMedia(bp.mq);
      const handler = () => this._applyBreakpoints();
      if (mql.addEventListener) mql.addEventListener("change", handler);
      else mql.addListener(handler);
      this.mediaListeners.push({ mql, handler, legacy: !mql.addEventListener });
    });
    this.reduceMq.addEventListener("change", this.reducedHandler);
    this._applyBreakpoints();

    window.addEventListener("orientationchange", () => {
      window.setTimeout(() => this._measure(), 250);
    }, { signal });
  }

  /** Rebuild effective options from the base, then apply every matching query. */
  private _applyBreakpoints() {
    Object.assign(this.opts, this.baseOpts);
    for (const bp of this.opts.breakpoints) {
      if (!window.matchMedia(bp.mq).matches) continue;
      Object.keys(bp).forEach(key => {
        if (key !== "mq") (this.opts as unknown as Record<string, number>)[key] = bp[key as keyof MzaBreakpoint] as number;
      });
    }
    if (this.reduceMotion) {
      this.opts.rotateY = 0;
      this.opts.zDepth = 0;
      this.opts.scaleDrop = 0;
      this.opts.blurMax = 0;
      this.opts.activeLeftBias = 0;
    }
    this._measure();
    this._render();
  }

  private _measure() {
    const viewRect = this.viewport.getBoundingClientRect();
    const rootRect = this.root.getBoundingClientRect();
    const pagRect = this.pagination.getBoundingClientRect();
    const bottomGap = Math.max(12, Math.round(rootRect.bottom - pagRect.bottom));
    const pagSpace = pagRect.height + bottomGap;
    const availH = viewRect.height - pagSpace;
    const cardH = Math.max(320, Math.min(640, Math.round(availH)));

    this.state.width = viewRect.width;
    this.state.height = viewRect.height;
    this.state.gap = this.opts.gap;
    this.slideW = Math.min(880, this.state.width * (1 - this.opts.peek * 2));

    this.root.style.setProperty("--mzaPagH", `${pagSpace}px`);
    this.root.style.setProperty("--mzaCardH", `${cardH}px`);
    this.root.style.setProperty("--mzaSlideW", `${this.slideW}px`);
  }

  private _onTilt(e: PointerEvent) {
    if (this.reduceMotion) return;
    const rect = this.viewport.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width - 0.5;
    const my = (e.clientY - rect.top) / rect.height - 0.5;
    this.root.style.setProperty("--mzaTiltX", (my * -6).toFixed(3));
    this.root.style.setProperty("--mzaTiltY", (mx * 6).toFixed(3));
  }

  private _pause() {
    if (!this.state.pausedAt) this.state.pausedAt = performance.now();
  }

  private _resume() {
    if (this.state.hovering || this.state.focusWithin || this.state.dragging) return;
    if (this.state.pausedAt) {
      this.state.startTime += performance.now() - this.state.pausedAt;
      this.state.pausedAt = 0;
    }
  }

  private _onDragStart(e: PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    if (this.goToRafId) {
      cancelAnimationFrame(this.goToRafId);
      this.goToRafId = 0;
      this.state.animating = false;
    }
    this.state.dragging = true;
    this.state.pointerId = e.pointerId;
    this.viewport.setPointerCapture(e.pointerId);
    this.state.x0 = e.clientX;
    this.state.t0 = performance.now();
    this.state.v = 0;
    this._pause();
  }

  private _onDragMove(e: PointerEvent) {
    if (!this.state.dragging || e.pointerId !== this.state.pointerId) return;
    const dx = e.clientX - this.state.x0;
    const dt = Math.max(16, performance.now() - this.state.t0);
    this.state.v = dx / dt;
    const slideSpan = this.slideW + this.state.gap;
    this.state.pos = this._mod(this.state.index - dx / slideSpan, this.n);
    this._render();
  }

  private _onDragEnd(e: PointerEvent) {
    if (!this.state.dragging || (e && e.pointerId !== this.state.pointerId)) return;
    this.state.dragging = false;
    try {
      if (this.state.pointerId != null) {
        this.viewport.releasePointerCapture(this.state.pointerId);
      }
    } catch {
      /* pointer capture may already be gone */
    }
    this.state.pointerId = null;
    this._resume();

    const velocity = this.state.v;
    const threshold = 0.18;
    const flick = Math.abs(velocity) > threshold ? Math.sign(velocity) * 0.5 : 0;
    const target = Math.round(this.state.pos - flick);
    this.goTo(this._mod(target, this.n));
  }

  private _startCycle() {
    this.state.startTime = performance.now();
    this._renderProgress(0);
  }

  private _loop() {
    const step = (t: number) => {
      const canAdvance = !this.state.dragging
        && !this.state.hovering
        && !this.state.focusWithin
        && !this.state.animating
        && !this.reduceMotion;
      if (canAdvance) {
        const elapsed = t - this.state.startTime;
        const p = Math.min(1, Math.max(0, elapsed / this.opts.interval));
        this._renderProgress(p);
        if (elapsed >= this.opts.interval) this.next();
      }
      this.state.rafId = requestAnimationFrame(step);
    };
    this.state.rafId = requestAnimationFrame(step);
  }

  private _renderProgress(p: number) {
    this.progressBar.style.transform = `scaleX(${p})`;
  }

  prev() {
    this.goTo(this._mod(this.state.index - 1, this.n));
  }

  next() {
    this.goTo(this._mod(this.state.index + 1, this.n));
  }

  goTo(i: number, animate = true) {
    if (this.goToRafId) cancelAnimationFrame(this.goToRafId);
    const start = this.state.pos || this.state.index;
    const end = this._nearest(start, i);
    const duration = animate && !this.reduceMotion ? this.opts.transitionMs : 0;
    const startedAt = performance.now();
    const ease = (x: number) => 1 - Math.pow(1 - x, 4);

    this.state.animating = duration > 0;
    const step = (now: number) => {
      const t = duration > 0 ? Math.min(1, (now - startedAt) / duration) : 1;
      const p = duration > 0 ? ease(t) : 1;
      this.state.pos = start + (end - start) * p;
      this._render();
      if (t < 1) {
        this.goToRafId = requestAnimationFrame(step);
      } else {
        this.goToRafId = 0;
        this._afterSnap();
      }
    };
    this.goToRafId = requestAnimationFrame(step);
  }

  private _afterSnap() {
    this.state.index = this._mod(Math.round(this.state.pos), this.n);
    this.state.pos = this.state.index;
    this.state.animating = false;
    this._render();
    this._startCycle();
  }

  private _nearest(from: number, target: number) {
    let d = target - Math.round(from);
    if (d > this.n / 2) d -= this.n;
    if (d < -this.n / 2) d += this.n;
    return Math.round(from) + d;
  }

  private get n() {
    return this.slides.length;
  }

  private _mod(i: number, n: number) {
    return ((i % n) + n) % n;
  }

  private _render() {
    if (!this.n) return;
    const span = this.slideW + this.state.gap;
    const tiltX = parseFloat(this.root.style.getPropertyValue("--mzaTiltX") || "0");
    const tiltY = parseFloat(this.root.style.getPropertyValue("--mzaTiltY") || "0");

    for (let i = 0; i < this.n; i++) {
      let d = i - this.state.pos;
      if (d > this.n / 2) d -= this.n;
      if (d < -this.n / 2) d += this.n;

      const weight = Math.max(0, 1 - Math.abs(d) * 2);
      const biasActive = -this.slideW * this.opts.activeLeftBias * weight;
      const tx = d * span + biasActive;
      const depth = -Math.abs(d) * this.opts.zDepth;
      const rot = -d * this.opts.rotateY;
      const scale = 1 - Math.min(Math.abs(d) * this.opts.scaleDrop, 0.42);
      const blur = Math.min(Math.abs(d) * this.opts.blurMax, this.opts.blurMax);
      const z = Math.round(1000 - Math.abs(d) * 10);
      const slide = this.slides[i];

      if (this.isFF) {
        slide.style.transform = `translate(${tx}px,-50%) scale(${scale})`;
        slide.style.filter = "none";
      } else {
        slide.style.transform = `translate3d(${tx}px,-50%,${depth}px) rotateY(${rot}deg) scale(${scale})`;
        slide.style.filter = `blur(${blur.toFixed(2)}px)`;
      }
      slide.style.zIndex = String(z);

      const card = slide.querySelector<HTMLElement>(".mzaCard");
      if (card) {
        const parBase = Math.max(-1, Math.min(1, -d));
        const parX = parBase * 48 + tiltY * 2.0;
        const parY = tiltX * -1.5;
        const bgX = parBase * -64 + tiltY * -2.4;
        card.style.setProperty("--mzaParX", `${parX.toFixed(2)}px`);
        card.style.setProperty("--mzaParY", `${parY.toFixed(2)}px`);
        card.style.setProperty("--mzaParBgX", `${bgX.toFixed(2)}px`);
        card.style.setProperty("--mzaParBgY", `${(parY * 0.35).toFixed(2)}px`);
      }
    }

    const active = this._mod(Math.round(this.state.pos), this.n);
    if (active !== this.lastActive) {
      this.slides.forEach((slide, i) => {
        const isActive = i === active;
        slide.dataset.state = isActive ? "active" : "rest";
        slide.inert = !isActive;
        slide.setAttribute("aria-hidden", isActive ? "false" : "true");
      });
      this.dots.forEach((dot, i) => {
        dot.setAttribute("aria-selected", i === active ? "true" : "false");
      });
      this.lastActive = active;
    }
  }
}
