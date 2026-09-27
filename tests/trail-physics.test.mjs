import test from 'node:test';
import assert from 'node:assert/strict';
import { TrailPhysics } from '../src/trail-physics.ts';

const start = { x: 10, y: 20, width: 2, height: 20 };

test('four corners stretch into a trailing shape and settle at the new caret', () => {
  const physics = new TrailPhysics({ durationMs: 125, strength: 1 });
  physics.snap(start);
  assert.equal(physics.move({ ...start, x: 110 }), true);
  physics.tick(1000);
  assert.equal(physics.tick(1016), true);
  const [leftTop, rightTop] = physics.getPolygon();
  assert.ok(leftTop && rightTop);
  assert.ok(rightTop.x > leftTop.x + start.width, 'leading corner should be ahead of trailing corner');

  let active = true;
  for (let time = 1032; time < 2000 && active; time += 16) active = physics.tick(time);
  assert.equal(active, false);
  const settled = physics.getPolygon();
  assert.ok(Math.abs(settled[0].x - 110) < 0.5);
  assert.ok(Math.abs(settled[1].x - 112) < 0.5);

  // A later keystroke should animate even after a long idle pause.
  physics.move({ ...start, x: 130 });
  assert.equal(physics.tick(5000), true);
  assert.equal(physics.tick(5016), true);
});

test('snap and long frame gaps prevent trails from crossing view changes', () => {
  const physics = new TrailPhysics();
  physics.snap(start);
  physics.move({ ...start, x: 200 });
  physics.tick(1000);
  assert.equal(physics.tick(1300), false);
  assert.deepEqual(physics.getPolygon()[0], { x: 200, y: 20 });

  physics.snap({ ...start, x: 400 });
  assert.equal(physics.isMoving, false);
  assert.deepEqual(physics.getPolygon()[0], { x: 400, y: 20 });
});

test('changing animation settings remains bounded', () => {
  const physics = new TrailPhysics();
  physics.setOptions({ durationMs: 10000, strength: -10 });
  physics.snap(start);
  physics.move({ ...start, x: 40 });
  physics.tick(1000);
  for (let time = 1016; time < 2000 && physics.isMoving; time += 16) physics.tick(time);
  assert.equal(physics.isMoving, false);
});
