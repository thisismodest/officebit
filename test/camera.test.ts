import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Camera } from '../src/render/camera.ts';

const camera = (viewW = 800, viewH = 600, worldW = 512, worldH = 320, pixelRatio = 1) => {
  const c = new Camera();
  c.pixelRatio = pixelRatio;
  c.resize(viewW, viewH);
  c.setWorld(worldW, worldH);
  return c;
};
const settle = (c: Camera) => c.update(10_000);
const close = (a: number, b: number) => Math.abs(a - b) < 1e-6;

test('starts a notch closer than fit, centred on the world', () => {
  const c = camera();
  assert.equal(c.zoom, 2); // fit is 1.56 → floor + 1
  assert.equal(c.x + c.width / 2, 256);
  assert.equal(c.y + c.height / 2, 160);
});

test('zoom eases in, keeping the point under the cursor fixed throughout', () => {
  const c = camera();
  const before = c.toWorld(600, 400);
  c.zoomAt(c.zoom + 1, 600, 400);
  c.update(16);
  assert.ok(c.scale > 2 && c.scale < 3, `mid-ease scale ${c.scale}`);
  const mid = c.toWorld(600, 400);
  assert.ok(close(before.x, mid.x) && close(before.y, mid.y));
  settle(c);
  assert.equal(c.scale, 3);
  const after = c.toWorld(600, 400);
  assert.ok(close(before.x, after.x) && close(before.y, after.y));
});

test('zoom lands on whole device pixels, within bounds', () => {
  const c = camera();
  c.zoomAt(2.6);
  assert.equal(c.zoom, 3);
  c.zoomAt(99);
  assert.equal(c.zoom, 8);
  c.zoomAt(-5);
  assert.equal(c.zoom, 0.5);
});

test('zoom steps: an overview at 0.5×, then whole steps', () => {
  const c = camera();
  c.zoomAt(1);
  c.zoomBy(-1);
  assert.equal(c.zoom, 0.5);
  c.zoomBy(-1);
  assert.equal(c.zoom, 0.5);
  c.zoomBy(1);
  assert.equal(c.zoom, 1);
  c.zoomBy(1);
  assert.equal(c.zoom, 2);
});

test('on high-DPI screens zoom steps in halves', () => {
  const c = camera(800, 600, 512, 320, 2);
  c.zoomBy(1);
  assert.equal(c.zoom, 2.5);
  c.zoomAt(2.7);
  assert.equal(c.zoom, 2.5);
});

test('the world drags nearly off screen, always leaving a strip to grab', () => {
  const c = camera();
  c.zoomAt(4);
  settle(c);
  const strip = 64 / 4;
  c.panBy(100000, 100000);
  assert.equal(c.x + c.width, strip, 'the right edge of the view shows a strip of the world');
  assert.equal(c.y + c.height, strip);
  c.panBy(-100000, -100000);
  assert.equal(c.x, 512 - strip);
  assert.equal(c.y, 320 - strip);
});

test('a world smaller than the view starts centred and can be dragged about', () => {
  const c = camera(2000, 2000);
  c.zoomAt(1);
  settle(c);
  assert.equal(c.x, (512 - c.width) / 2);
  c.panBy(100000, 0);
  assert.equal(c.x + c.width, 64);
});

test('glideTo eases towards its target', () => {
  const c = camera();
  c.zoomAt(4);
  settle(c);
  const start = c.x;
  c.glideTo(400, 200, 16);
  const target = 400 - c.width / 2;
  assert.ok(c.x > start && c.x < target);
  for (let i = 0; i < 200; i++) c.glideTo(400, 200, 16);
  assert.ok(Math.abs(c.x - target) < 0.01);
});

test('toView inverts toWorld', () => {
  const c = camera();
  const w = c.toWorld(123, 45);
  const v = c.toView(w.x, w.y);
  assert.ok(close(v.x, 123) && close(v.y, 45));
});

test('while following, zoom stays centred on them rather than the cursor', () => {
  const c = camera();
  c.zoomAt(3);
  settle(c);
  c.following = 'someone';
  const centre = () => [c.x + c.width / 2, c.y + c.height / 2];
  const before = centre();
  c.zoomAt(5, 10, 10);
  c.update(16);
  assert.deepEqual(centre().map(Math.round), before.map(Math.round), 'mid-ease');
  settle(c);
  assert.deepEqual(centre().map(Math.round), before.map(Math.round), 'settled');
});

test('visiting somewhere small zooms in to fill about three quarters of the view; big places keep your zoom', () => {
  const c = camera(800, 600, 2048, 2048);
  c.zoomAt(1);
  settle(c);
  // A home, 224×160: at 1× it's under a third of the view.
  c.setWorld(224, 160, true);
  assert.equal(c.zoom, 2, 'the biggest whole step that stays within three quarters');
  // Back to the town: far bigger than the view, so it's back to the zoom you chose.
  c.setWorld(2048, 2048, true);
  assert.equal(c.zoom, 1);
  // Zoom by hand, and that's the new choice. Somewhere already filling more than half is left alone.
  c.zoomAt(2);
  c.setWorld(640, 400, true);
  assert.equal(c.zoom, 2);
});

test('a flick carries on and slows to a stop; a new press stops it dead', () => {
  const c = camera(800, 600, 4096, 4096);
  c.zoomAt(2);
  settle(c);
  const start = c.x;
  c.flingAt(1, 0); // dragging right at 1 px/ms moves the view left
  c.update(16);
  const afterOne = start - c.x;
  assert.ok(afterOne > 0, 'still moving after letting go');
  for (let i = 0; i < 200; i++) c.update(16);
  assert.equal(c.flinging, false, 'and comes to rest');
  const glided = start - c.x;
  assert.ok(glided > 100 && glided < 250, `glided ${glided} world px`);
  c.flingAt(1, 0);
  c.stopFling();
  const x = c.x;
  c.update(16);
  assert.equal(c.x, x);
});
