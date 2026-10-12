const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const { createCanvas, GlobalFonts } = require(process.env.CANVAS_MODULE || '@napi-rs/canvas');

// Render the existing game runtime offscreen; this is edited demo footage, not a live voice session.
const ROOT = path.resolve(__dirname, '../..');
const OUT = path.join(ROOT, 'media');
fs.mkdirSync(OUT, { recursive: true });
if (process.env.DEMO_FONT) GlobalFonts.registerFromPath(process.env.DEMO_FONT, 'DemoChinese');
const W = 1280, H = 720, FPS = 30, DURATION = 32;
const film = createCanvas(W, H), c = film.getContext('2d');
const gameCanvas = createCanvas(1100, 700);
const nodes = new Map();
const noop = () => {};
let currentTime = 0;
const timers = [];
const crashes = [];
let previousCrashes = 0;
function node(id) {
  if (!nodes.has(id)) nodes.set(id, {
    value: id === 'difficultySelect' ? '0.08' : id === 'demoSpeed' ? '1' : '',
    textContent: '', innerHTML: '', hidden: false, classList: { add: noop, remove: noop },
    setAttribute: noop, addEventListener: noop, appendChild: noop, focus: noop,
    querySelector: () => ({ textContent: '', remove: noop }),
    getContext: () => gameCanvas.getContext('2d'),
  });
  return nodes.get(id);
}
const deterministicMath = Object.create(Math);
let randomSeed = 20261012;
deterministicMath.random = () => { randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0; return randomSeed / 4294967296; };
const sandbox = {
  console, Math: deterministicMath, performance: { now: () => currentTime * 1000 },
  location: { hostname: 'localhost' }, navigator: { userAgent: 'Product film render' },
  document: { body: { dataset: {} }, getElementById: node, querySelector: node,
    querySelectorAll: () => [], createElement: () => node('log-entry'), addEventListener: noop },
  window: { innerWidth: 1280, devicePixelRatio: 1, addEventListener: noop,
    setTimeout: (callback, delay) => { const token = { at: currentTime + delay / 1000, callback }; timers.push(token); return token; },
    clearTimeout: token => { if (token) token.cancelled = true; } },
  requestAnimationFrame: noop,
};
vm.createContext(sandbox);
let source = fs.readFileSync(path.join(ROOT, 'game.js'), 'utf8');
source = source.replaceAll("'Noto Sans SC'", "'DemoChinese'");
source = source.replace('snapshot: debugSnapshot,', 'snapshot: debugSnapshot,\n    filmTick: now => { updateDemo(now); updateEffects(1/30); drawScene(); },');
vm.runInContext(source, sandbox);
const engine = sandbox.window.__AI_DRIVE_DEBUG__;
engine.navigate('demo');

function rounded(x, y, w, h, r, fill, stroke) {
  c.beginPath(); c.roundRect(x, y, w, h, r);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
}
function text(s, x, y, size = 24, color = '#2f4540', weight = 500, align = 'left') {
  c.font = `${weight} ${size}px DemoChinese, sans-serif`; c.fillStyle = color; c.textAlign = align;
  c.fillText(s, x, y);
}
function chip(s, x, y, w, color = '#eef4e9') {
  rounded(x, y, w, 38, 19, color); text(s, x + w / 2, y + 25, 16, '#48685a', 500, 'center');
}
function robot(x, y, scale = 1) {
  c.save(); c.translate(x, y); c.scale(scale, scale);
  rounded(-70, -43, 140, 102, 29, '#9ecbb9'); rounded(-66,-48,132,98,28,'#d4eadc','#a1c7b2');
  rounded(-48,-25,96,44,14,'#f5fcf7'); rounded(-5,-72,10,25,5,'#85afa0');
  c.fillStyle='#f0c978'; c.beginPath(); c.arc(0,-77,12,0,Math.PI*2); c.fill();
  rounded(-25,-15,12,24,6,'#547e72'); rounded(13,-15,12,24,6,'#547e72');
  c.strokeStyle='#547e72'; c.lineWidth=4; c.beginPath(); c.arc(0,27,12,.1,Math.PI-.1); c.stroke();
  c.restore();
}
function background() {
  c.fillStyle='#f6f3eb'; c.fillRect(0,0,W,H);
  c.fillStyle='#edf1e5'; c.beginPath(); c.ellipse(1150,10,530,500,0,0,Math.PI*2); c.fill();
  c.fillStyle='#efe7db'; c.beginPath(); c.ellipse(-100,820,570,230,0,0,Math.PI*2); c.fill();
  for(let x=0;x<W;x+=28) for(let y=0;y<H;y+=28) { c.fillStyle='#74827709'; c.fillRect(x,y,1,1); }
  text('AI DRIVING SCHOOL', 60, 48, 16, '#5c7764', 700);
  text('PRODUCT OVERVIEW  /  2026', 1220, 48, 13, '#7c8679', 500, 'right');
  c.strokeStyle='#dce2d6'; c.beginPath(); c.moveTo(60,66); c.lineTo(1220,66); c.stroke();
}
function gameplayWindow(x=444,y=116,w=776,h=493) {
  rounded(x+5,y+10,w,h,24,'#aec3ad33');
  c.save(); c.beginPath(); c.roundRect(x,y,w,h,24); c.clip(); c.drawImage(gameCanvas,x,y,w,h); c.restore();
  rounded(x,y,w,h,24,null,'#bfceb5');
  rounded(x+18,y+16,124,26,13,'#fff9eee6'); text('SCRIPTED DEMO',x+80,y+34,11,'#6b775b',700,'center');
}
function subtitle(s) {
  rounded(60,633,1160,51,16,'#fffdf6','#deded0'); text(s,640,667,23,'#3f554a',500,'center');
}
const filmChapters = [
  { end:3, marker:'01 / THE IDEA', lines:['AI 驾校'], sub:'一个嘴硬 AI 的停车挑战' },
  { end:8, marker:'02 / THE INTERACTION', lines:['你发出指令，','AI 负责执行。'], sub:'语音指挥 · 文字备用' },
  { end:13, marker:'03 / THE PERSONALITY', lines:['AI 很自信。','墙有不同意见。'], sub:'沟通有反馈，失误有笑点。' },
  { end:19, marker:'04 / THE COMEDY', lines:['再倒一点？','预算要多一点。'], sub:'过度自信，也是一种游戏机制。' },
  { end:25, marker:'05 / THE CHALLENGE', lines:['看反馈，','改指令。'], sub:'观察角度，回正，刹停。' },
  { end:28, marker:'06 / THE PAYOFF', lines:['完整入库。','这一局，你赢了。'], sub:'完成目标，继续挑战。' },
  { end:32, marker:'07 / TRY IT', lines:['现在，','轮到你发话。'], sub:'手机浏览器 · 无需注册' },
];
function gameTimeAt(t) {
  if(t<3) return 0;
  if(t<8) return t-3;
  if(t<13) return 5+(t-8);
  if(t<19) return 15+(t-13);
  if(t<25) return 36+(t-19);
  if(t<28) return 44+(t-25)*.35;
  return 45.1;
}
function render(t, index) {
  const target = gameTimeAt(t);
  while(currentTime + 1/FPS <= target+.0001) {
    currentTime += 1/FPS;
    for (const timer of timers) if(!timer.cancelled && !timer.done && timer.at<=currentTime) { timer.done=true; timer.callback(); }
    engine.filmTick(currentTime*1000);
  }
  if (engine.snapshot().game.crashes > previousCrashes) {
    previousCrashes = engine.snapshot().game.crashes; crashes.push({ time:t, crash:previousCrashes });
  }
  background();
  const chapter = filmChapters.find(ch=>t<ch.end) || filmChapters.at(-1);
  text(chapter.marker,60,123,13,'#8b977b',700);
  if(t<3 || t>=28) {
    const closing = t>=28;
    text(closing?'现在，轮到你发话。':'AI 驾校',60,277,closing?66:91,'#2d4c40',700);
    text(closing?'手机浏览器打开，即刻开练。':'一个嘴硬 AI 的停车挑战',64,339,31,'#71816d',500);
    chip('语音或文字',64,393,134); chip('无需注册',211,393,114,'#faeacb'); chip('2.5D 停车场',338,393,151,'#eee6f4');
    robot(961,323,1.65);
    chip('AI 学员 · 小满',874,472,178);
    if(closing) { text('elliezhangy.github.io/ai-driving-school',64,523,25,'#456e58',500); }
    else text('你坐副驾驶，用指令完成一次停车。',64,509,25,'#73806d');
    subtitle(closing?'AI 驾校 · 用指令互动，用反馈调整。':'一款关于沟通、判断与意外的浏览器小游戏。');
  } else {
    chapter.lines.forEach((s,i)=>text(s,60,258+i*68,46,'#2d4c40',700));
    text(chapter.sub,60,434,21,'#78836e');
    if(t<8) { chip('指令 → 回应 → 动作',60,484,259); chip('“挂倒挡，慢慢倒”',60,535,243,'#faeacb'); }
    else if(t<19) { chip('两次事故 · 一次奇迹',60,488,254,'#faeacb'); }
    else { chip('完整入库 + 停稳',60,488,234); }
    gameplayWindow();
    const speech = node('speechBubble').textContent;
    const narration = t<8?'不用拖方向盘。只要把你的判断说清楚。':t<25?`AI 学员：${speech}`:'停进车位只是开始。下一局，看看你的指挥水平。';
    subtitle(narration.length>44?narration.slice(0,43)+'…':narration);
  }
  c.fillStyle='#88ab8c'; c.fillRect(60,701,1160*Math.min(1,t/DURATION),3);
  text(`${String(Math.floor(t)).padStart(2,'0')} / 32`,1220,702,11,'#929a86',500,'right');
  // Short editorial dip fades give scene changes breathing room.
  const bounds=[0,3,8,13,19,25,28,32];
  let alpha=0;
  for(const b of bounds) { const distance=Math.abs(t-b); if(distance<.16) alpha=Math.max(alpha,.65*(1-distance/.16)); }
  if(t<.4) alpha=Math.max(alpha,1-t/.4);
  if(t>31.6) alpha=Math.max(alpha,(t-31.6)/.4);
  if(alpha>0) { c.fillStyle=`rgba(246,243,235,${alpha})`; c.fillRect(0,0,W,H); }
  if([60,210,342,537,675,792,888].includes(index)) fs.writeFileSync(path.join(OUT,`review-${index}.png`),film.toBuffer('image/png'));
  if(index===60) fs.writeFileSync(path.join(OUT,'product-demo-poster.jpg'),film.toBuffer('image/jpeg'));
}
(async()=>{
  const ffmpeg=process.env.FFMPEG || 'ffmpeg';
  const processVideo=spawn(ffmpeg,['-y','-loglevel','error','-f','rawvideo','-pixel_format','rgba','-video_size',`${W}x${H}`,'-framerate',`${FPS}`,'-i','pipe:0','-an','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',path.join(OUT,'product-demo-silent.mp4')],{stdio:['pipe','inherit','inherit']});
  for(let i=0;i<FPS*DURATION;i++) {
    render(i/FPS,i);
    const pixels=Buffer.from(c.getImageData(0,0,W,H).data.buffer);
    if(!processVideo.stdin.write(pixels)) await once(processVideo.stdin,'drain');
    if(i%240===0) process.stdout.write(`Rendered ${i/FPS}s\n`);
  }
  processVideo.stdin.end();
  const [code]=await once(processVideo,'exit');
  if(code!==0) throw new Error(`Video encode failed: ${code}`);
  fs.writeFileSync(path.join(OUT,'impact-times.json'),JSON.stringify(crashes,null,2));
  console.log('Finished 32-second product film',crashes);
})();
