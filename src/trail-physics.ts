// Adapted from the four-corner spring model in 30d98f9b2/Neovide-Cursor.
// Copyright (c) 2025 LengineerC. See LICENSE.

export interface Point {
  x: number;
  y: number;
}

export interface CursorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TrailPhysicsOptions {
  durationMs: number;
  strength: number;
}

const RELATIVE_CORNERS: readonly Point[] = [
  { x: -0.5, y: -0.5 },
  { x: 0.5, y: -0.5 },
  { x: 0.5, y: 0.5 },
  { x: -0.5, y: 0.5 },
];

// Original Neovide-Cursor motion profile. Keep the internal tuning in one place.
const MOTION_PROFILE = {
  shortMoveColumns: 8,
  shortDurationMs: 50,
  rankFactors: [1, 0.9, 0.5, 0.3],
  leadingAlignment: 0.5,
  leadingDurationSeconds: 0.02,
  resetThresholdSeconds: 0.075,
  maxTrailDistanceFactor: 100,
} as const;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

function normalize(point: Point): Point {
  const length = Math.hypot(point.x, point.y);
  return length === 0 ? { x: 0, y: 0 } : { x: point.x / length, y: point.y / length };
}

class DampedSpring {
  position = 0;
  velocity = 0;
  animationLength = 0.125;

  reset(): void {
    this.position = 0;
    this.velocity = 0;
  }

  update(dt: number): void {
    if (this.animationLength <= dt || Math.abs(this.position) < 0.001) {
      this.reset();
      return;
    }
    const omega = 4 / this.animationLength;
    const a = this.position;
    const b = this.position * omega + this.velocity;
    const decay = Math.exp(-omega * dt);
    this.position = (a + b * dt) * decay;
    this.velocity = decay * (-a * omega - b * dt * omega + b);
  }
}

class Corner {
  readonly relative: Point;
  readonly xSpring = new DampedSpring();
  readonly ySpring = new DampedSpring();
  point: Point = { x: 0, y: 0 };
  private previousDestination: Point = { x: 0, y: 0 };

  constructor(relative: Point) {
    this.relative = relative;
  }

  destination(rect: CursorRect): Point {
    return {
      x: rect.x + (this.relative.x + 0.5) * rect.width,
      y: rect.y + (this.relative.y + 0.5) * rect.height,
    };
  }

  snap(rect: CursorRect): void {
    this.point = this.destination(rect);
    this.previousDestination = { ...this.point };
    this.xSpring.reset();
    this.ySpring.reset();
  }

  move(rect: CursorRect, movement: Point, rank: number, options: TrailPhysicsOptions): void {
    const destination = this.destination(rect);
    const direction = normalize(movement);
    const cornerDirection = normalize(this.relative);
    const alignment = direction.x * cornerDirection.x + direction.y * cornerDirection.y;
    const isShortMove = Math.abs(movement.x / Math.max(rect.width, 1)) <= MOTION_PROFILE.shortMoveColumns && Math.abs(movement.y) < 0.001;
    const baseTime = isShortMove ? Math.min(options.durationMs, MOTION_PROFILE.shortDurationMs) : options.durationMs;
    const factor = MOTION_PROFILE.rankFactors[rank] ?? 1;
    const length = alignment > MOTION_PROFILE.leadingAlignment
      ? MOTION_PROFILE.leadingDurationSeconds
      : (baseTime / 1000) * factor * options.strength;

    this.xSpring.animationLength = length;
    this.ySpring.animationLength = length;
    if (length > MOTION_PROFILE.resetThresholdSeconds) {
      this.xSpring.reset();
      this.ySpring.reset();
    }
    this.xSpring.position = destination.x - this.point.x;
    this.ySpring.position = destination.y - this.point.y;
    this.previousDestination = destination;
  }

  update(rect: CursorRect, dt: number): boolean {
    const destination = this.destination(rect);
    if (destination.x !== this.previousDestination.x || destination.y !== this.previousDestination.y) {
      this.xSpring.position = destination.x - this.point.x;
      this.ySpring.position = destination.y - this.point.y;
      this.previousDestination = destination;
    }
    this.xSpring.update(dt);
    this.ySpring.update(dt);
    const maxDistance = Math.max(rect.width, rect.height) * MOTION_PROFILE.maxTrailDistanceFactor;
    this.xSpring.position = clamp(this.xSpring.position, -maxDistance, maxDistance);
    this.ySpring.position = clamp(this.ySpring.position, -maxDistance, maxDistance);
    this.point = {
      x: destination.x - this.xSpring.position,
      y: destination.y - this.ySpring.position,
    };
    return Math.abs(this.xSpring.position) > 0.5 || Math.abs(this.ySpring.position) > 0.5;
  }
}

export class TrailPhysics {
  private readonly corners = RELATIVE_CORNERS.map((relative) => new Corner(relative));
  private target: CursorRect | null = null;
  private previousTime = 0;
  private moving = false;
  private options: TrailPhysicsOptions;

  constructor(options: TrailPhysicsOptions = { durationMs: 125, strength: 1 }) {
    this.options = options;
  }

  setOptions(options: TrailPhysicsOptions): void {
    this.options = {
      durationMs: clamp(options.durationMs, 60, 250),
      strength: clamp(options.strength, 0.5, 2),
    };
  }

  snap(rect: CursorRect): void {
    this.target = { ...rect };
    for (const corner of this.corners) corner.snap(rect);
    this.previousTime = 0;
    this.moving = false;
  }

  move(rect: CursorRect): boolean {
    const old = this.target;
    if (!old) {
      this.snap(rect);
      return false;
    }
    if (old.x === rect.x && old.y === rect.y && old.width === rect.width && old.height === rect.height) return false;

    if (!this.moving) this.previousTime = 0;

    const movement = { x: rect.x - old.x, y: rect.y - old.y };
    const direction = normalize(movement);
    const ranked = this.corners
      .map((corner, index) => ({ index, alignment: direction.x * normalize(corner.relative).x + direction.y * normalize(corner.relative).y }))
      .sort((a, b) => a.alignment - b.alignment);
    for (let rank = 0; rank < ranked.length; rank++) {
      const index = ranked[rank]?.index;
      if (index !== undefined) this.corners[index]?.move(rect, movement, rank, this.options);
    }
    this.target = { ...rect };
    this.moving = true;
    return true;
  }

  tick(now: number): boolean {
    if (!this.target || !this.moving) return false;
    if (this.previousTime !== 0 && now - this.previousTime > 250) {
      this.snap(this.target);
      return false;
    }
    const dt = this.previousTime === 0 ? 0 : Math.min((now - this.previousTime) / 1000, 1 / 30);
    this.previousTime = now;
    let moving = false;
    for (const corner of this.corners) {
      if (corner.update(this.target, dt)) moving = true;
    }
    this.moving = moving;
    return this.moving;
  }

  getPolygon(): readonly Point[] {
    return this.corners.map((corner) => ({ ...corner.point }));
  }

  get isMoving(): boolean {
    return this.moving;
  }
}
