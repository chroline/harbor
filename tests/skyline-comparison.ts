// Frozen-frame visual comparison against the pre-optimization GPU renderer.
import { createWovenLightGpu } from "./fixtures/woven-light-gpu-before";
import {
  drawWovenLight,
  lightPools,
  WOVEN_LIGHT,
} from "../src/lib/woven-light";
import night from "../src/assets/artwork/sf/night.webp";
import day from "../src/assets/artwork/sf/day.webp";
const before = document.querySelector<HTMLCanvasElement>("#old")!;
const after = document.querySelector<HTMLCanvasElement>("#new")!;
const image = document.querySelector("img")!;
const raster = document.createElement("canvas");
raster.width = before.width = WOVEN_LIGHT.rasterWidth;
raster.height = before.height = Math.round((668 / 1016) * raster.width);
after.width = Math.round(1016 * devicePixelRatio);
after.height = Math.round(668 * devicePixelRatio);
const oldCtx = before.getContext("2d")!;
const ctx = after.getContext("2d")!;
const sampler = raster.getContext("2d", { willReadFrequently: true })!;
const legacy = createWovenLightGpu()!;
let pixels: Uint8ClampedArray;
function paint() {
  const time = Number(
    document.querySelector<HTMLSelectElement>("#time")!.value,
  );
  oldCtx.clearRect(0, 0, before.width, before.height);
  legacy.paint(
    oldCtx,
    pixels,
    lightPools(time),
    WOVEN_LIGHT.intensity,
    WOVEN_LIGHT.columns,
  );
  drawWovenLight(ctx, pixels, time, WOVEN_LIGHT.intensity, raster);
  const reference = document.createElement("canvas");
  reference.width = after.width;
  reference.height = after.height;
  const referenceCtx = reference.getContext("2d")!;
  referenceCtx.drawImage(before, 0, 0, reference.width, reference.height);
  const a = referenceCtx.getImageData(
    0,
    0,
    reference.width,
    reference.height,
  ).data;
  const b = ctx.getImageData(0, 0, after.width, after.height).data;
  // Premultiplied RGB differences avoid counting invisible transparent RGB.
  let error = 0;
  let square = 0;
  for (let i = 0; i < a.length; i += 4)
    for (let c = 0; c < 3; c++) {
      const delta = (a[i + c] * a[i + 3]) / 255 - (b[i + c] * b[i + 3]) / 255;
      error += Math.abs(delta);
      square += delta * delta;
    }
  const samples = (a.length / 4) * 3;
  document.querySelector("#result")!.textContent = JSON.stringify(
    {
      time,
      meanAbsoluteRgbDifference: error / samples,
      rmsRgbDifference: Math.sqrt(square / samples),
      scale: "0–255",
      dots: 400,
    },
    null,
    2,
  );
}
image.onload = () => {
  const scale = Math.max(
    raster.width / image.naturalWidth,
    raster.height / image.naturalHeight,
  );
  const width = raster.width / scale,
    height = raster.height / scale;
  sampler.drawImage(
    image,
    (image.naturalWidth - width) / 2,
    (image.naturalHeight - height) / 2,
    width,
    height,
    0,
    0,
    raster.width,
    raster.height,
  );
  pixels = sampler.getImageData(0, 0, raster.width, raster.height).data;
  paint();
};
document.querySelector<HTMLSelectElement>("#scene")!.onchange = (event) => {
  const light = (event.target as HTMLSelectElement).value === "day";
  document.querySelector("main")!.style.background = light
    ? "#f5f5ed"
    : "#202020";
  image.src = light ? day : night;
};
document.querySelector<HTMLSelectElement>("#time")!.onchange = paint;
document.querySelector<HTMLButtonElement>("#before")!.onclick = () => {
  before.style.visibility = "visible";
  after.style.visibility = "hidden";
  document.querySelector("#view")!.textContent = "Before";
};
document.querySelector<HTMLButtonElement>("#after")!.onclick = () => {
  before.style.visibility = "hidden";
  after.style.visibility = "visible";
  document.querySelector("#view")!.textContent = "Optimized";
};
image.src = night;
