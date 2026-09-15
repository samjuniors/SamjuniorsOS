const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

// Test the actual TypeScript modules without adding another runtime dependency.
require.extensions['.ts'] = (module, filename) => {
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  module._compile(output.outputText, filename);
};

const { SHAPE_SIZE, perimeter, shapePort, splitPerimeter, pointAt, projectToPath } = require('../../src/lib/shape-geometry.ts');
const { EXECUTION, fillEnvelope } = require('../../src/lib/execution-tokens.ts');
const { portPoints, edgeControl, edgePath } = require('../../src/lib/ports.ts');
const { FxEngine } = require('../../src/lib/fx-engine.ts');
const { runWorkflow } = require('../../src/lib/workflow-runner.ts');

const near = (a, b, tolerance = .08) => assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < tolerance, `${JSON.stringify(a)} must match ${JSON.stringify(b)}`);
const makeEngine = () => {
  const arcs = [];
  const ctx = new Proxy({}, { get: (_target, key) => key === 'arc' ? (...args) => arcs.push(args) : () => {}, set: () => true });
  const engine = new FxEngine({ getContext: () => ctx, width: 1, height: 1 });
  engine.resize(600, 300);
  return { engine, arcs };
};

for (const shape of Object.keys(SHAPE_SIZE)) {
  test(`${shape}: both fronts stay on the same outline and meet at the output`, () => {
    const center = { x: 150, y: 150 };
    const border = perimeter(shape, center);
    const input = shapePort(shape, center, 'left');
    const output = shapePort(shape, center, 'right');
    const [a, b] = splitPerimeter(border, input, output);
    near(pointAt(a, 0), input); near(pointAt(b, 0), input);
    near(pointAt(a, 1), output); near(pointAt(b, 1), output);
    assert.ok(a.length > 1 && b.length > 1);
    assert.ok(Math.abs(a.length + b.length - border.length) < 1);
    for (const path of [a, b]) for (const p of path.points) near(p, projectToPath(border, p).point);
    assert.ok(pointAt(a, .5).y < center.y || pointAt(b, .5).y < center.y);
    assert.ok(pointAt(a, .5).y > center.y || pointAt(b, .5).y > center.y);
  });
}

test('offset circle ports and wide-node borders stay geometrically seated', () => {
  const a = { x: 20, y: 70, shape: 'circle' }, b = { x: 65, y: 20, shape: 'wide' };
  const g = portPoints(a, b, 900, 500, { sourceSide: 'top', targetSide: 'bottom', targetOffset: -24 });
  near(g.d0, projectToPath(perimeter(a.shape, { x: 180, y: 350 }), g.d0).point);
  near(g.d1, { x: 585 - 24, y: 100 + 32 });
  assert.ok(edgePath(g).startsWith(`M ${g.d0.x} ${g.d0.y}`));
  assert.ok(edgePath(g).endsWith(`${g.d1.x} ${g.d1.y}`));
  const [out, into] = edgeControl(g);
  assert.ok(out.y < g.d0.y && into.y > g.d1.y);
});

test('fill then drain reveals neutral material rather than a permanent color', () => {
  const t = EXECUTION.node;
  assert.equal(fillEnvelope(0, t).head, 0);
  assert.equal(fillEnvelope(t.pre + t.fill / 2, t).head, .5);
  assert.equal(fillEnvelope(t.pre + t.fill / 2, t).tail, 0);
  const halfwayEmpty = fillEnvelope(t.pre + t.fill + t.hold + t.drain / 2, t);
  assert.equal(halfwayEmpty.head, 1); assert.equal(halfwayEmpty.tail, .5);
  const done = fillEnvelope(t.pre + t.fill + t.hold + t.drain, t);
  assert.deepEqual(done, { phase: 'settled', head: 1, tail: 1, heat: 0 });
});

test('node output fires once, only when both fronts have filled; then it settles', () => {
  const { engine } = makeEngine();
  let filled = 0, settled = 0;
  engine.igniteNode({ id: 'n', shape: 'wide', center: { x: 150, y: 100 }, onFill: () => filled++, onSettled: () => settled++ });
  engine.advance(EXECUTION.node.pre + EXECUTION.node.fill - 1);
  assert.equal(filled, 0);
  engine.advance(1); assert.equal(filled, 1);
  assert.equal(engine.getSnapshot()[0].head, 1);
  engine.advance(EXECUTION.node.hold + EXECUTION.node.drain);
  assert.equal(settled, 1); assert.equal(engine.getSnapshot().length, 0);
  engine.advance(5000); assert.equal(filled, 1);
});

test('a pipe remains filled on arrival, drains from its input, then fully clears', () => {
  const { engine } = makeEngine(); let arrived = 0, drained = 0;
  engine.launchComet({ from: { x: 50, y: 50 }, to: { x: 350, y: 120 }, onArrive: () => arrived++, onDrained: () => drained++ });
  engine.advance(EXECUTION.edge.fill); assert.equal(arrived, 1);
  assert.equal(engine.getSnapshot()[0].tail, 0);
  engine.advance(EXECUTION.edge.hold + EXECUTION.edge.drain / 2);
  assert.equal(engine.getSnapshot()[0].tail, .5);
  engine.advance(EXECUTION.edge.drain / 2); assert.equal(drained, 1);
  assert.deepEqual(engine.getSnapshot(), []);
});

test('comets wait for node output, and destination ignition waits for arrival', () => {
  const { engine } = makeEngine();
  const a = { id: 'a', x: 20, y: 50, shape: 'rounded' }, b = { id: 'b', x: 70, y: 50, shape: 'wide' };
  const nodes = [a, b].map(n => ({ ...n, center: { x: n.x * 6, y: n.y * 3 } }));
  const edges = [{ id: 'ab', from: 'a', to: 'b', kind: 'orange', geometry: portPoints(a, b, 600, 300) }];
  runWorkflow(engine, nodes, edges);
  engine.advance(300);
  engine.advance(EXECUTION.node.pre + EXECUTION.node.fill - 1);
  assert.equal(engine.getSnapshot().filter(e => e.kind === 'edge').length, 0);
  engine.advance(1);
  assert.equal(engine.getSnapshot().filter(e => e.id === 'edge:ab').length, 1);
  engine.advance(EXECUTION.edge.fill - 1);
  assert.equal(engine.getSnapshot().some(e => e.id === 'node:b'), false);
  engine.advance(1);
  assert.equal(engine.getSnapshot().some(e => e.id === 'node:b'), true);
});

test('no impact circles or independent orbit are ever drawn', () => {
  const { engine, arcs } = makeEngine();
  engine.igniteNode({ shape: 'rounded', center: { x: 150, y: 100 } });
  for (let i = 0; i < 100; i++) engine.stepOnce(40);
  assert.ok(arcs.length > 0, 'the engine draws real sparks and contact points');
  assert.ok(arcs.every(args => args[2] <= 2.5), 'only tiny sparks/contacts, never a large radius ring');
});

test('reset cancels pending callbacks and drained effects', () => {
  const { engine } = makeEngine(); let called = 0;
  engine.igniteNode({ shape: 'rounded', center: { x: 150, y: 100 }, onFill: () => called++ });
  engine.schedule(100, () => called++);
  engine.clearTransient(); engine.advance(10000);
  assert.equal(called, 0); assert.deepEqual(engine.getSnapshot(), []);
});

test('invalid cyclic workflows are rejected instead of hanging', () => {
  const { engine } = makeEngine();
  const a = { id: 'a', x: 20, y: 50, shape: 'rounded' }, b = { id: 'b', x: 70, y: 50, shape: 'rounded' };
  const nodes = [a, b].map(n => ({ ...n, center: { x: n.x * 6, y: n.y * 3 } }));
  const edges = [{ id: 'ab', from: 'a', to: 'b', kind: 'orange', geometry: portPoints(a, b, 600, 300) }, { id: 'ba', from: 'b', to: 'a', kind: 'orange', geometry: portPoints(b, a, 600, 300) }];
  assert.throws(() => runWorkflow(engine, nodes, edges), /acyclic/);
});

test('reduced motion suppresses moving particles while preserving completion events', () => {
  const { engine, arcs } = makeEngine(); let filled = 0;
  engine.setReducedMotion(true);
  engine.igniteNode({ shape: 'rounded', center: { x: 150, y: 100 }, onFill: () => filled++ });
  engine.stepOnce(EXECUTION.node.pre + EXECUTION.node.fill);
  assert.equal(filled, 1); assert.equal(arcs.length, 0);
});
