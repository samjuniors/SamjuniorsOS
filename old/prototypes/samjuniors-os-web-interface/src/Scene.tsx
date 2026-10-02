import { useEffect, useRef } from 'react';

export const agentDefs = [
  { name: 'SOPHIA', fullName: 'Sophia Vance', role: 'Chief Operating Officer & Master Orchestrator', department: 'Executive Operations & Orchestration Mesh', clearance: 'LEVEL 5 CONSTITUTIONAL', tier: 'Active (v1)', isV1Active: true, color: '#a855f7', task: 'Decomposing founder directive into 9-Step DAG', short: 'COO', x: 24, y: 28 },
  { name: 'THORNE', fullName: 'Dr. Aris Thorne', role: 'Lead Market & Intelligence Researcher', department: 'Market Intelligence & Deep Tech Recon', clearance: 'LEVEL 4 STRATEGIC INTEL', tier: 'Active (v1)', isV1Active: true, color: '#fbbf24', task: 'Synthesizing competitive benchmark memos', short: 'Research', x: 75, y: 24 },
  { name: 'MAYA', fullName: 'Maya Lin', role: 'Principal Product Manager', department: 'Product Strategy & User Experience', clearance: 'LEVEL 4 PRODUCT ARCHITECTURE', tier: 'Deferred (v1)', isV1Active: false, color: '#f43f5e', task: 'PRD authoring & backlog grooming (governed standby)', short: 'Product', x: 87, y: 56 },
  { name: 'JULIAN', fullName: 'Julian Cruz', role: 'Chief Financial Analyst', department: 'Capital, Treasury & Unit Economics', clearance: 'LEVEL 5 FINANCIAL SOVEREIGNTY', tier: 'Deferred (v1)', isV1Active: false, color: '#34d399', task: 'Margin floor & unit economics modeling (governed standby)', short: 'Finance', x: 65, y: 84 },
  { name: 'ELENA', fullName: 'Elena Rostova', role: 'Legal, Governance & Compliance', department: 'Governance & Regulatory Oversight', clearance: 'LEVEL 5 GOVERNANCE', tier: 'Planned (Target-state)', isV1Active: false, color: '#81caaa', task: 'Constitutional side-effect audit (planned architecture)', short: 'Governance', x: 31, y: 81 },
  { name: 'MARCUS', fullName: 'Marcus Vance', role: 'Systems & Autonomous Infrastructure', department: 'Execution Runtime & Sandboxing', clearance: 'LEVEL 4 INFRASTRUCTURE', tier: 'Planned (Target-state)', isV1Active: false, color: '#8acbde', task: 'Deterministic runtime sandboxing (planned architecture)', short: 'Systems', x: 11, y: 56 },
];
export default function Scene({ paused, reduced, quality, burst, reset, theme = 'solar' }: { paused: boolean; reduced: boolean; quality: string; burst: number; reset: number; theme?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef({ paused, reduced, quality, burst, theme });
  const view = useRef({ yaw: 0, pitch: 0, zoom: 1 });
  useEffect(() => { state.current = { paused, reduced, quality, burst, theme }; }, [paused, reduced, quality, burst, theme]);
  useEffect(() => { view.current = { yaw: 0, pitch: 0, zoom: 1 }; }, [reset]);
  useEffect(() => {
    const canvas = ref.current!; const ctx = canvas.getContext('2d')!;
    let w = 0, h = 0, frame = 0, time = 0, last = 0;
    let drag: { x: number; y: number } | null = null;
    let seed = 46;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const stars = Array.from({ length: 170 }, () => ({ x: random(), y: random(), r: random(), a: random() }));
    const points = Array.from({ length: 13000 }, (_, i) => ({ t: random() * Math.PI * 2, a: random() * Math.PI * 2, r: Math.sqrt(random()), strand: i % 6, bright: random(), size: random() }));
    const relays = Array.from({ length: 42 }, () => ({ x: .06 + random() * .88, y: .09 + random() * .84, size: random() }));
    const resize = () => { w = canvas.clientWidth; h = canvas.clientHeight; const dpr = Math.min(devicePixelRatio, 2); canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    const down = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); canvas.style.cursor = 'grabbing'; };
    const move = (e: PointerEvent) => { if (!drag) return; view.current.yaw += (e.clientX - drag.x) * .005; view.current.pitch += (e.clientY - drag.y) * .005; drag = { x: e.clientX, y: e.clientY }; };
    const up = () => { drag = null; canvas.style.cursor = 'grab'; };
    const wheel = (e: WheelEvent) => { e.preventDefault(); view.current.zoom = Math.max(.65, Math.min(1.6, view.current.zoom - e.deltaY * .0006)); };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up); canvas.addEventListener('wheel', wheel, { passive: false });
    const render = (now: number) => {
      const dt = Math.min((now - last) / 1000, .04); last = now;
      if (!state.current.paused && !state.current.reduced) time += dt;
      ctx.clearRect(0, 0, w, h);
      const isLuna = state.current.theme === 'luna';
      const cx = w / 2, cy = h * .5, size = Math.min(w * .235, h * .31) * view.current.zoom;
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 2.3);
      if (isLuna) {
        glow.addColorStop(0, 'rgba(124,214,255,.11)');
        glow.addColorStop(.5, 'rgba(95,232,200,.03)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
      } else {
        glow.addColorStop(0, 'rgba(125,101,63,.09)');
        glow.addColorStop(.5, 'rgba(70,97,117,.025)');
        glow.addColorStop(1, 'rgba(0,0,0,0)');
      }
      ctx.fillStyle = glow; ctx.fillRect(0,0,w,h);
      stars.forEach(s => { ctx.fillStyle = isLuna ? `rgba(180,225,255,${s.a * .42})` : `rgba(174,196,209,${s.a * .38})`; ctx.fillRect(s.x * w,s.y * h,s.r + .3,s.r + .3); });
      ctx.lineWidth = .65;
      for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(cx,cy); ctx.rotate([-.29,.32,1.05][i]); ctx.strokeStyle = isLuna ? `rgba(124,214,255,${i === 2 ? .08 : .17})` : `rgba(126,158,175,${i === 2 ? .07 : .15})`; ctx.setLineDash(i === 2 ? [2,6] : []); ctx.beginPath(); ctx.ellipse(0,0,Math.min(w * .43,h * .52),Math.min(w * .2,h * .29),0,0,Math.PI*2); ctx.stroke(); ctx.restore(); }
      relays.forEach((p,i) => { const x = p.x*w, y = p.y*h; ctx.strokeStyle = isLuna ? 'rgba(124,214,255,.12)' : 'rgba(139,171,186,.10)'; if (i%3 !== 0) { const q = relays[(i+1)%relays.length]; if(Math.hypot((p.x-q.x)*w,(p.y-q.y)*h)<w*.34){ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(q.x*w,q.y*h);ctx.stroke();}} ctx.strokeStyle = isLuna ? 'rgba(124,214,255,.38)' : 'rgba(158,193,207,.32)'; ctx.beginPath();ctx.arc(x,y,p.size>.78?3.4:1.15,0,Math.PI*2);ctx.stroke(); if (p.size > .9) {ctx.beginPath();ctx.arc(x,y,7,0,Math.PI*2);ctx.stroke();} });
      agentDefs.forEach(a => { ctx.strokeStyle = a.color+'18'; ctx.setLineDash([2,5]);ctx.beginPath();ctx.moveTo(a.x*w/100,a.y*h/100);ctx.lineTo(cx,cy);ctx.stroke(); });ctx.setLineDash([]);
      const rot = view.current.yaw + time * .026; const tilt = 0 + view.current.pitch;
      const count = state.current.quality === 'low' ? 5500 : points.length;
      for (let i=0; i<count; i++) {
        const p=points[i], t=p.t + time*.023;
        const knot = (v:number) => { const r=2+Math.cos(3*v); return [r*Math.cos(2*v),r*Math.sin(2*v),Math.sin(3*v)]; };
        const base=knot(t), next=knot(t+.003);
        let tx=next[0]-base[0],ty=next[1]-base[1],tz=next[2]-base[2];const len=Math.hypot(tx,ty,tz);tx/=len;ty/=len;tz/=len;
        const nl=Math.hypot(tx,ty);const nx=-ty/nl,ny=tx/nl;
        const bx=-tz*ny,by=tz*nx,bz=tx*ny-ty*nx;
        const a=p.a+p.strand*Math.PI/3+t*8; const r=.105*p.r;
        let x=base[0]+r*(Math.cos(a)*nx+Math.sin(a)*bx), y=base[1]+r*(Math.cos(a)*ny+Math.sin(a)*by), z=base[2]+r*Math.sin(a)*bz;
        const xx=x*Math.cos(rot)-y*Math.sin(rot);y=x*Math.sin(rot)+y*Math.cos(rot);x=xx;
        const yy=y*Math.cos(tilt)-z*Math.sin(tilt);z=y*Math.sin(tilt)+z*Math.cos(tilt);y=yy;
        const perspective=1+z*.06; const px=cx+x*size*.34*perspective,py=cy+y*size*.34*perspective;
        const alpha=(.25+p.bright*.64)*(1+z*.2);
        if (isLuna) {
          ctx.fillStyle = p.strand === 0 || p.strand === 3
            ? `rgba(124,214,255,${alpha})`
            : p.strand === 1 || p.strand === 4
            ? `rgba(95,232,200,${alpha * .85})`
            : `rgba(240,180,92,${alpha * .75})`;
        } else {
          ctx.fillStyle = p.strand === 0 || p.strand === 3
            ? `rgba(158,207,226,${alpha*.7})`
            : `rgba(239,${190+Math.floor(p.bright*48)},${126+Math.floor(p.bright*96)},${alpha})`;
        }
        const s=p.bright>.985?1.9:.5+p.size*.7;ctx.fillRect(px,py,s,s);
        if(p.bright>.995){ctx.fillStyle=isLuna ? 'rgba(124,214,255,.08)' : 'rgba(244,214,165,.06)';ctx.beginPath();ctx.arc(px,py,5,0,Math.PI*2);ctx.fill();}
      }
      if(state.current.burst && Date.now()-state.current.burst<1800){const t=(Date.now()-state.current.burst)/1800;ctx.strokeStyle=isLuna ? `rgba(124,214,255,${(1-t)*.6})` : `rgba(214,184,120,${(1-t)*.5})`;ctx.lineWidth=1;ctx.beginPath();ctx.arc(cx,cy,size*(.4+t*2),0,Math.PI*2);ctx.stroke();}
      frame=requestAnimationFrame(render);
    }; frame=requestAnimationFrame(render);
    return () => { cancelAnimationFrame(frame);observer.disconnect();canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('wheel',wheel); };
  }, []);
  return <canvas ref={ref} className="scene-canvas" aria-label="SamJuniors Core interactive particle visualization. Drag to orbit and scroll to zoom. AI employees available as interactive nodes." />;
}
