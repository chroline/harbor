// Opt-in development probe. Measures animation paints, not just empty RAF callbacks.
const panel = document.createElement("aside");
panel.style.cssText =
  "position:fixed;z-index:99999;right:16px;top:55px;padding:12px;background:#181818;color:#fff;border:1px solid #666;border-radius:8px;font:12px monospace;max-width:450px";
panel.innerHTML =
  '<button type="button">Measure animation (10 seconds)</button><pre role="status">Ready</pre>';
document.body.append(panel);
const output = panel.querySelector("pre")!;
const button = panel.querySelector("button")!;
let measuring = false;
let start = 0;
let frames: number[] = [];
let submissions: number[] = [];
let vsyncs: number[] = [];

function record(canvas: HTMLCanvasElement, before: number) {
  if (!measuring || !canvas.classList.contains("skyline-pixels")) return;
  frames.push(performance.now());
  submissions.push(performance.now() - before);
}
const drawImage = CanvasRenderingContext2D.prototype.drawImage;
CanvasRenderingContext2D.prototype.drawImage = function (
  image: CanvasImageSource,
  ...coordinates: number[]
) {
  const before = performance.now();
  Reflect.apply(drawImage, this, [image, ...coordinates]);
  record(this.canvas, before);
};
const drawArrays = WebGL2RenderingContext.prototype.drawArrays;
WebGL2RenderingContext.prototype.drawArrays = function (
  ...args: Parameters<typeof drawArrays>
) {
  const before = performance.now();
  drawArrays.apply(this, args);
  record(this.canvas as HTMLCanvasElement, before);
};
function summary(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    median: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
  };
}
function tick(now: number) {
  if (!measuring) return;
  vsyncs.push(now);
  if (now - start < 10_000) {
    requestAnimationFrame(tick);
    return;
  }
  measuring = false;
  const canvas = document.querySelector<HTMLCanvasElement>(".skyline-pixels")!;
  const bounds = canvas.getBoundingClientRect();
  const intervals = frames.slice(1).map((time, i) => time - frames[i]);
  output.textContent = JSON.stringify(
    {
      animationFps: ((frames.length - 1) * 1000) / (frames.at(-1)! - frames[0]),
      refreshFps: ((vsyncs.length - 1) * 1000) / (vsyncs.at(-1)! - vsyncs[0]),
      frames: frames.length,
      frameIntervalMs: summary(intervals),
      submissionMs: summary(submissions),
      cssSize: [bounds.width, bounds.height],
      backingSize: [canvas.width, canvas.height],
      dpr: devicePixelRatio,
    },
    null,
    2,
  );
  button.disabled = false;
}
button.onclick = () => {
  frames = [];
  submissions = [];
  vsyncs = [];
  output.textContent = "Measuring…";
  button.disabled = true;
  measuring = true;
  start = performance.now();
  requestAnimationFrame(tick);
};

export {};
