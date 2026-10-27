// Draw the grid in one GPU call; individual Canvas paths stall large windows.
const vertexSource = `#version 300 es
precision highp float;
in vec2 center;
uniform vec2 resolution;
uniform vec4 pools;
uniform int poolCount;
uniform float intensity;
uniform vec2 focus;
uniform vec2 sizeRange;
uniform float poolRadius;
uniform float cellSize;
uniform sampler2D artwork;
out vec3 dotColor;
out float radius;
out float pointSize;
void main() {
  float warm = max(0.0, 1.0 - distance(center, pools.xy) / poolRadius);
  float cool = poolCount > 1 ? max(0.0, 1.0 - distance(center, pools.zw) / poolRadius) : 0.0;
  float activation = max(warm, cool);
  float animatedSize = mix(sizeRange.x, sizeRange.y, activation);
  radius = cellSize * 0.48 * mix(animatedSize, focus.y, focus.x);
  vec3 sampled = texelFetch(artwork, ivec2(center), 0).rgb * 255.0;
  float poolPower = intensity * (1.0 - focus.x);
  dotColor = clamp((sampled * (1.0 + activation * poolPower * 0.7) + vec3(10.0)
    + poolPower * vec3(warm * 38.0, warm * 19.0 + cool * 14.0, cool * 40.0)) / 255.0, 0.0, 1.0);
  pointSize = radius < 1.0 ? 2.0 : ceil(radius * 2.0 + 2.0);
  gl_PointSize = pointSize;
  gl_Position = vec4(center.x / resolution.x * 2.0 - 1.0, 1.0 - center.y / resolution.y * 2.0, 0.0, 1.0);
}`;
const fragmentSource = `#version 300 es
precision highp float;
in vec3 dotColor;
in float radius;
in float pointSize;
out vec4 color;
void main() {
  float d = length((gl_PointCoord - 0.5) * pointSize);
  float coverage = radius < 1.0 ? 3.14159265359 * radius * radius / 4.0
    : 1.0 - smoothstep(radius - 0.5, radius + 0.5, d);
  color = vec4(dotColor, coverage);
}`;

export function createWovenLightGpu() {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2", {
    antialias: false,
    depth: false,
    stencil: false,
  });
  if (!gl) return null;
  const vertex = gl.createShader(gl.VERTEX_SHADER)!;
  const fragment = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(vertex, vertexSource);
  gl.shaderSource(fragment, fragmentSource);
  gl.compileShader(vertex);
  gl.compileShader(fragment);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return null;
  }
  const buffer = gl.createBuffer()!;
  const texture = gl.createTexture()!;
  const center = gl.getAttribLocation(program, "center");
  const uniform = Object.fromEntries(
    [
      "resolution",
      "pools",
      "poolCount",
      "intensity",
      "focus",
      "sizeRange",
      "poolRadius",
      "cellSize",
      "artwork",
    ].map((name) => [name, gl.getUniformLocation(program, name)]),
  );
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(center);
  gl.vertexAttribPointer(center, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(uniform.artwork, 0);
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(
    gl.SRC_ALPHA,
    gl.ONE_MINUS_SRC_ALPHA,
    gl.ONE,
    gl.ONE_MINUS_SRC_ALPHA,
  );
  let uploaded: Uint8ClampedArray | null = null;
  let count = 0;
  return {
    paint(
      ctx: CanvasRenderingContext2D,
      pixels: Uint8ClampedArray,
      pools: { x: number; y: number }[],
      power: number,
      columns: number,
      raster: { width: number; height: number },
      focus: number,
      focusedSize: number,
      poolRadiusScale: number,
      sizes: { minimum: number; maximum: number },
    ) {
      if (gl.isContextLost()) return false;
      const { width, height } = raster;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
        const step = width / columns;
        const positions: number[] = [];
        for (let y = step / 2; y <= height - step / 2; y += step)
          for (let x = step / 2; x <= width - step / 2; x += step)
            positions.push(x, y);
        count = positions.length / 2;
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array(positions),
          gl.STATIC_DRAW,
        );
        gl.uniform2f(uniform.resolution, width, height);
        gl.uniform1f(uniform.cellSize, step);
        gl.uniform1f(
          uniform.poolRadius,
          Math.min(width * 0.34, height * 0.85) * poolRadiusScale,
        );
        uploaded = null;
      }
      if (uploaded !== pixels) {
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          width,
          height,
          0,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          pixels,
        );
        uploaded = pixels;
      }
      gl.uniform4f(
        uniform.pools,
        pools[0].x * width,
        pools[0].y * height,
        (pools[1]?.x ?? 0) * width,
        (pools[1]?.y ?? 0) * height,
      );
      gl.uniform1i(uniform.poolCount, pools.length);
      gl.uniform1f(uniform.intensity, power);
      gl.uniform2f(uniform.focus, focus, focusedSize);
      gl.uniform2f(uniform.sizeRange, sizes.minimum, sizes.maximum);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, count);
      // Filter once into the display-sized canvas. Upscaling this result into
      // another large canvas only to shrink it again wastes a full-frame copy.
      // Explicit high-quality filtering still prevents subpixel grid bands.
      ctx.imageSmoothingQuality = "high";
      ctx.globalCompositeOperation = "copy";
      ctx.drawImage(canvas, 0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.globalCompositeOperation = "source-over";
      return true;
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteTexture(texture);
      gl.deleteProgram(program);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    },
  };
}
