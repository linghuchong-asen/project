<template>
  <Teleport to="body">
    <canvas ref="canvasEl" class="fluid-bg"></canvas>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'

/* ─────────────── Shaders（完全参照参考代码，去掉 text_texture） ─────────────── */

const VERT = `
precision highp float;
attribute vec2 a_position;
varying vec2 vUv;
varying vec2 vL, vR, vT, vB;
uniform vec2 u_texel;

void main() {
  vUv = .5 * (a_position + 1.);
  vL = vUv - vec2(u_texel.x, 0.);
  vR = vUv + vec2(u_texel.x, 0.);
  vT = vUv + vec2(0., u_texel.y);
  vB = vUv - vec2(0., u_texel.y);
  gl_Position = vec4(a_position, 0., 1.);
}
`

const ADVECTION = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D u_velocity_texture;
uniform sampler2D u_input_texture;
uniform vec2 u_texel;
uniform float u_dt;

vec4 bilerp(sampler2D sam, vec2 uv, vec2 tsize) {
  vec2 st = uv / tsize - 0.5;
  vec2 iuv = floor(st);
  vec2 fuv = fract(st);
  vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
  vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
  vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
  vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
  return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
}

void main() {
  vec2 coord = vUv - u_dt * bilerp(u_velocity_texture, vUv, u_texel).xy * u_texel;
  gl_FragColor = .96 * bilerp(u_input_texture, coord, u_texel);
  gl_FragColor.a = 1.;
}
`

const DIVERGENCE = `
precision highp float;
precision highp sampler2D;
varying highp vec2 vUv, vL, vR, vT, vB;
uniform sampler2D u_velocity_texture;

void main() {
  float L = texture2D(u_velocity_texture, vL).x;
  float R = texture2D(u_velocity_texture, vR).x;
  float T = texture2D(u_velocity_texture, vT).y;
  float B = texture2D(u_velocity_texture, vB).y;
  float div = .6 * (R - L + T - B);
  gl_FragColor = vec4(div, 0., 0., 1.);
}
`

const PRESSURE = `
precision highp float;
precision highp sampler2D;
varying highp vec2 vUv, vL, vR, vT, vB;
uniform sampler2D u_pressure_texture;
uniform sampler2D u_divergence_texture;

void main() {
  float L = texture2D(u_pressure_texture, vL).x;
  float R = texture2D(u_pressure_texture, vR).x;
  float T = texture2D(u_pressure_texture, vT).x;
  float B = texture2D(u_pressure_texture, vB).x;
  float C = texture2D(u_pressure_texture, vUv).x;
  float divergence = texture2D(u_divergence_texture, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  gl_FragColor = vec4(pressure, 0., 0., 1.);
}
`

const GRADIENT_SUBTRACT = `
precision highp float;
precision highp sampler2D;
varying highp vec2 vUv, vL, vR, vT, vB;
uniform sampler2D u_pressure_texture;
uniform sampler2D u_velocity_texture;

void main() {
  float L = texture2D(u_pressure_texture, vL).x;
  float R = texture2D(u_pressure_texture, vR).x;
  float T = texture2D(u_pressure_texture, vT).x;
  float B = texture2D(u_pressure_texture, vB).x;
  vec2 velocity = texture2D(u_velocity_texture, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  gl_FragColor = vec4(velocity, 0., 1.);
}
`

const SPLAT = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D u_input_texture;
uniform float u_ratio;
uniform vec3 u_point_value;
uniform vec2 u_point;
uniform float u_point_size;

void main() {
  vec2 p = vUv - u_point.xy;
  p.x *= u_ratio;
  vec3 splat = pow(2., -dot(p, p) / u_point_size) * u_point_value;
  vec3 base = texture2D(u_input_texture, vUv).xyz;
  gl_FragColor = vec4(base + splat, 1.);
}
`

// 浅色背景：白色底，输出 1 - C（参考代码一致）
const OUTPUT = `
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D u_output_texture;

void main() {
  vec3 C = texture2D(u_output_texture, vUv).rgb;
  gl_FragColor = vec4(vec3(1.) - C, 1.);
}
`

/* ─────────────── 组件逻辑 ─────────────── */

const canvasEl = ref<HTMLCanvasElement | null>(null)

let gl: WebGLRenderingContext | null = null
let rafId = 0
let vertexShader: WebGLShader | null = null

interface Prog {
  program: WebGLProgram
  uniforms: Record<string, WebGLUniformLocation | null>
}

let splatProgram: Prog
let divergenceProgram: Prog
let pressureProgram: Prog
let gradientSubtractProgram: Prog
let advectionProgram: Prog
let outputShaderProgram: Prog

interface FBO {
  fbo: WebGLFramebuffer
  width: number
  height: number
  attach(id: number): number
}

interface DoubleFBO {
  width: number
  height: number
  texelSizeX: number
  texelSizeY: number
  read(): FBO
  write(): FBO
  swap(): void
}

let outputColor: DoubleFBO
let velocity: DoubleFBO
let divergenceFBO: FBO
let pressure: DoubleFBO

// 参考代码默认颜色：{r: 1, g: 0, b: 0.5} 粉红色
const pointer = { x: 0, y: 0, dx: 0, dy: 0, moved: false }
let isPreview = true
let isVisible = true

// 流体颜色（与参考代码一致：粉红色）
const fluidColor = { r: 1.0, g: 0.0, b: 0.5 }
let pointerSize = 0.004

// canvas 实际宽高（与 window.innerWidth/innerHeight 一致）
let canvasW = 1920
let canvasH = 1080

function init() {
  const canvas = canvasEl.value
  if (!canvas) return

  gl = canvas.getContext('webgl', { alpha: false, premultipliedAlpha: false }) ||
       canvas.getContext('experimental-webgl', { alpha: false, premultipliedAlpha: false })
  if (!gl) {
    console.warn('WebGL not supported')
    return
  }

  gl.getExtension('OES_texture_float')

  vertexShader = createShader(VERT, gl.VERTEX_SHADER)
  if (!vertexShader) return

  splatProgram = createProgram(SPLAT)
  divergenceProgram = createProgram(DIVERGENCE)
  pressureProgram = createProgram(PRESSURE)
  gradientSubtractProgram = createProgram(GRADIENT_SUBTRACT)
  advectionProgram = createProgram(ADVECTION)
  outputShaderProgram = createProgram(OUTPUT)

  // 全屏 quad
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]),
    gl.STATIC_DRAW
  )
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer())
  gl.bufferData(
    gl.ELEMENT_ARRAY_BUFFER,
    new Uint16Array([0, 1, 2, 0, 2, 3]),
    gl.STATIC_DRAW
  )
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  gl.enableVertexAttribArray(0)

  initFBOs()
}

function createShader(source: string, type: number): WebGLShader | null {
  if (!gl) return null
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile error:', gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
    return null
  }
  return shader
}

function createProgram(fragSource: string): Prog {
  if (!gl || !vertexShader) {
    throw new Error('WebGL not initialized')
  }
  const frag = createShader(fragSource, gl.FRAGMENT_SHADER)
  if (!frag) throw new Error('Fragment shader compile failed')

  const program = gl.createProgram()!
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, frag)
  gl.linkProgram(program)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program))
  }

  const uniforms: Record<string, WebGLUniformLocation | null> = {}
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS)
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i)
    if (info) {
      uniforms[info.name] = gl.getUniformLocation(program, info.name)
    }
  }

  return { program, uniforms }
}

function createFBO(w: number, h: number): FBO {
  if (!gl) throw new Error('WebGL not initialized')

  gl.activeTexture(gl.TEXTURE0)
  const texture = gl.createTexture()
  if (!texture) throw new Error('Failed to create WebGL texture')
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

  // 尝试 FLOAT 纹理，失败则回退到 UNSIGNED_BYTE
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.FLOAT, null)

  const fbo = gl.createFramebuffer()
  if (!fbo) throw new Error('Failed to create WebGL framebuffer')
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    console.warn('FLOAT FBO incomplete, falling back to UNSIGNED_BYTE')
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    const status2 = gl.checkFramebufferStatus(gl.FRAMEBUFFER)
    if (status2 !== gl.FRAMEBUFFER_COMPLETE) {
      console.error('FBO still incomplete:', status2, 'w=', w, 'h=', h)
    }
  }

  gl.viewport(0, 0, w, h)
  gl.clear(gl.COLOR_BUFFER_BIT)

  return {
    fbo,
    width: w,
    height: h,
    attach(id: number) {
      if (!gl) return id
      gl.activeTexture(gl.TEXTURE0 + id)
      gl.bindTexture(gl.TEXTURE_2D, texture)
      return id
    },
  }
}

function createDoubleFBO(w: number, h: number): DoubleFBO {
  let readFBO = createFBO(w, h)
  let writeFBO = createFBO(w, h)
  return {
    width: w,
    height: h,
    texelSizeX: 1.0 / w,
    texelSizeY: 1.0 / h,
    read() {
      return readFBO
    },
    write() {
      return writeFBO
    },
    swap() {
      const tmp = readFBO
      readFBO = writeFBO
      writeFBO = tmp
    },
  }
}

function initFBOs(w?: number, h?: number) {
  const sizeW = Math.floor(0.5 * (w || canvasW))
  const sizeH = Math.floor(0.5 * (h || canvasH))
  outputColor = createDoubleFBO(sizeW, sizeH)
  velocity = createDoubleFBO(sizeW, sizeH)
  divergenceFBO = createFBO(sizeW, sizeH)
  pressure = createDoubleFBO(sizeW, sizeH)
}

function blit(target: FBO | null) {
  if (!gl) return
  if (target == null) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  } else {
    gl.viewport(0, 0, target.width, target.height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo)
  }
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0)
}

function render(t: number) {
  rafId = requestAnimationFrame(render)
  if (!gl || !isVisible) return

  const dt = 1 / 60

  // 自动预览动画（和参考代码完全一致：首次鼠标移动后永久关闭）
  if (t && isPreview) {
    updateMousePosition(
      (.5 - .45 * Math.sin(.003 * t - 2)) * canvasW,
      (.5 + .1 * Math.sin(.0025 * t) + .1 * Math.cos(.002 * t)) * canvasH
    )
  }

  if (pointer.moved) {
    if (!isPreview) pointer.moved = false

    // 注入速度（和参考代码一致：dx=5*delta）
    gl.useProgram(splatProgram.program)
    gl.uniform1i(splatProgram.uniforms.u_input_texture, velocity.read().attach(1))
    gl.uniform1f(splatProgram.uniforms.u_ratio, canvasW / canvasH)
    gl.uniform2f(
      splatProgram.uniforms.u_point,
      pointer.x / canvasW,
      1 - pointer.y / canvasH
    )
    gl.uniform3f(splatProgram.uniforms.u_point_value, pointer.dx, -pointer.dy, 1)
    gl.uniform1f(splatProgram.uniforms.u_point_size, pointerSize)
    blit(velocity.write())
    velocity.swap()

    // 注入颜色密度（反色注入：1 - color，和参考代码一致）
    gl.uniform1i(splatProgram.uniforms.u_input_texture, outputColor.read().attach(1))
    gl.uniform3f(
      splatProgram.uniforms.u_point_value,
      1. - fluidColor.r,
      1. - fluidColor.g,
      1. - fluidColor.b
    )
    blit(outputColor.write())
    outputColor.swap()
  }

  // Divergence
  gl.useProgram(divergenceProgram.program)
  gl.uniform2f(divergenceProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY)
  gl.uniform1i(divergenceProgram.uniforms.u_velocity_texture, velocity.read().attach(1))
  blit(divergenceFBO)

  // Pressure (Jacobi 迭代 10 次)
  gl.useProgram(pressureProgram.program)
  gl.uniform2f(pressureProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY)
  gl.uniform1i(pressureProgram.uniforms.u_divergence_texture, divergenceFBO.attach(1))
  for (let i = 0; i < 10; i++) {
    gl.uniform1i(pressureProgram.uniforms.u_pressure_texture, pressure.read().attach(2))
    blit(pressure.write())
    pressure.swap()
  }

  // Gradient subtract
  gl.useProgram(gradientSubtractProgram.program)
  gl.uniform2f(gradientSubtractProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY)
  gl.uniform1i(gradientSubtractProgram.uniforms.u_pressure_texture, pressure.read().attach(1))
  gl.uniform1i(gradientSubtractProgram.uniforms.u_velocity_texture, velocity.read().attach(2))
  blit(velocity.write())
  velocity.swap()

  // Advect velocity
  gl.useProgram(advectionProgram.program)
  gl.uniform2f(advectionProgram.uniforms.u_texel, velocity.texelSizeX, velocity.texelSizeY)
  gl.uniform1i(advectionProgram.uniforms.u_velocity_texture, velocity.read().attach(1))
  gl.uniform1i(advectionProgram.uniforms.u_input_texture, velocity.read().attach(1))
  gl.uniform1f(advectionProgram.uniforms.u_dt, dt)
  blit(velocity.write())
  velocity.swap()

  // Advect color
  gl.useProgram(advectionProgram.program)
  gl.uniform2f(advectionProgram.uniforms.u_texel, outputColor.texelSizeX, outputColor.texelSizeY)
  gl.uniform1i(advectionProgram.uniforms.u_velocity_texture, velocity.read().attach(1))
  gl.uniform1i(advectionProgram.uniforms.u_input_texture, outputColor.read().attach(2))
  gl.uniform1f(advectionProgram.uniforms.u_dt, dt)
  blit(outputColor.write())
  outputColor.swap()

  // Display
  gl.useProgram(outputShaderProgram.program)
  gl.uniform1i(outputShaderProgram.uniforms.u_output_texture, outputColor.read().attach(1))
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight)
  gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0)
}

function resize() {
  const canvas = canvasEl.value
  if (!canvas || !gl) return
  canvasW = window.innerWidth || 1920
  canvasH = window.innerHeight || 1080
  canvas.width = canvasW
  canvas.height = canvasH
  pointerSize = 0.8 / canvasH
  gl.viewport(0, 0, canvasW, canvasH)
  initFBOs(canvasW, canvasH)
}

function updateMousePosition(eX: number, eY: number) {
  pointer.moved = true
  pointer.dx = 5 * (eX - pointer.x)
  pointer.dy = 5 * (eY - pointer.y)
  pointer.x = eX
  pointer.y = eY
}

function onMouseMove(e: MouseEvent) {
  // 首次鼠标移动后永久关闭自动预览（和参考代码一致）
  isPreview = false
  updateMousePosition(e.clientX, e.clientY)
}

function onTouchMove(e: TouchEvent) {
  e.preventDefault()
  isPreview = false
  updateMousePosition(e.targetTouches[0].clientX, e.targetTouches[0].clientY)
}

function onVisibilityChange() {
  isVisible = document.visibilityState !== 'hidden'
}

onMounted(() => {
  // 标记 body，用于 CSS 透明化主题背景
  document.body.classList.add('has-fluid-bg')

  init()
  resize()

  // 初始化 pointer 到屏幕中心
  pointer.x = (window.innerWidth || 1920) / 2
  pointer.y = (window.innerHeight || 1080) / 2

  window.addEventListener('resize', resize)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('touchmove', onTouchMove, { passive: false })
  document.addEventListener('visibilitychange', onVisibilityChange)
  rafId = requestAnimationFrame(render)
})

onBeforeUnmount(() => {
  cancelAnimationFrame(rafId)
  window.removeEventListener('resize', resize)
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('touchmove', onTouchMove)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  document.body.classList.remove('has-fluid-bg')
})
</script>

<style scoped>
.fluid-bg {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  height: 100% !important;
  z-index: -1 !important;
  pointer-events: none !important;
  display: block !important;
}
</style>
