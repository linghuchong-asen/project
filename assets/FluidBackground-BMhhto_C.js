import{C as e,E as t,I as n,N as r,P as i,T as a,V as o,j as s}from"./app-BIjqbl_i.js";import{t as c}from"./plugin-vue_export-helper-BDNMzG2s.js";var l=`
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
`,u=`
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
`,d=`
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
`,f=`
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
`,p=`
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
`,m=`
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
`,h=`
precision highp float;
precision highp sampler2D;
varying vec2 vUv;
uniform sampler2D u_output_texture;

void main() {
  vec3 C = texture2D(u_output_texture, vUv).rgb;
  gl_FragColor = vec4(vec3(1.) - C, 1.);
}
`,g=c(s({__name:`FluidBackground`,setup(s){let c=o(null),g=o(!1),_=null,v=0,y=null,b,x,S,C,w,T,E,D,O,k,A={x:0,y:0,dx:0,dy:0,moved:!1},j=!0,M=!0,N={r:1,g:0,b:.5},P=.004,F=1920,I=1080;function L(){let e=c.value;if(e){if(_=e.getContext(`webgl`,{alpha:!1,premultipliedAlpha:!1})||e.getContext(`experimental-webgl`,{alpha:!1,premultipliedAlpha:!1}),!_){console.warn(`WebGL not supported`);return}_.getExtension(`OES_texture_float`),y=R(l,_.VERTEX_SHADER),y&&(b=z(m),x=z(d),S=z(f),C=z(p),w=z(u),T=z(h),_.bindBuffer(_.ARRAY_BUFFER,_.createBuffer()),_.bufferData(_.ARRAY_BUFFER,new Float32Array([-1,-1,-1,1,1,1,1,-1]),_.STATIC_DRAW),_.bindBuffer(_.ELEMENT_ARRAY_BUFFER,_.createBuffer()),_.bufferData(_.ELEMENT_ARRAY_BUFFER,new Uint16Array([0,1,2,0,2,3]),_.STATIC_DRAW),_.vertexAttribPointer(0,2,_.FLOAT,!1,0,0),_.enableVertexAttribArray(0),H())}}function R(e,t){if(!_)return null;let n=_.createShader(t);return n?(_.shaderSource(n,e),_.compileShader(n),_.getShaderParameter(n,_.COMPILE_STATUS)?n:(console.error(`Shader compile error:`,_.getShaderInfoLog(n)),_.deleteShader(n),null)):null}function z(e){if(!_||!y)throw Error(`WebGL not initialized`);let t=R(e,_.FRAGMENT_SHADER);if(!t)throw Error(`Fragment shader compile failed`);let n=_.createProgram();_.attachShader(n,y),_.attachShader(n,t),_.linkProgram(n),_.getProgramParameter(n,_.LINK_STATUS)||console.error(`Program link error:`,_.getProgramInfoLog(n));let r={},i=_.getProgramParameter(n,_.ACTIVE_UNIFORMS);for(let e=0;e<i;e++){let t=_.getActiveUniform(n,e);t&&(r[t.name]=_.getUniformLocation(n,t.name))}return{program:n,uniforms:r}}function B(e,t){if(!_)throw Error(`WebGL not initialized`);_.activeTexture(_.TEXTURE0);let n=_.createTexture();if(!n)throw Error(`Failed to create WebGL texture`);_.bindTexture(_.TEXTURE_2D,n),_.texParameteri(_.TEXTURE_2D,_.TEXTURE_MIN_FILTER,_.NEAREST),_.texParameteri(_.TEXTURE_2D,_.TEXTURE_MAG_FILTER,_.NEAREST),_.texParameteri(_.TEXTURE_2D,_.TEXTURE_WRAP_S,_.CLAMP_TO_EDGE),_.texParameteri(_.TEXTURE_2D,_.TEXTURE_WRAP_T,_.CLAMP_TO_EDGE),_.texImage2D(_.TEXTURE_2D,0,_.RGBA,e,t,0,_.RGBA,_.FLOAT,null);let r=_.createFramebuffer();if(!r)throw Error(`Failed to create WebGL framebuffer`);if(_.bindFramebuffer(_.FRAMEBUFFER,r),_.framebufferTexture2D(_.FRAMEBUFFER,_.COLOR_ATTACHMENT0,_.TEXTURE_2D,n,0),_.checkFramebufferStatus(_.FRAMEBUFFER)!==_.FRAMEBUFFER_COMPLETE){console.warn(`FLOAT FBO incomplete, falling back to UNSIGNED_BYTE`),_.texImage2D(_.TEXTURE_2D,0,_.RGBA,e,t,0,_.RGBA,_.UNSIGNED_BYTE,null);let n=_.checkFramebufferStatus(_.FRAMEBUFFER);n!==_.FRAMEBUFFER_COMPLETE&&console.error(`FBO still incomplete:`,n,`w=`,e,`h=`,t)}return _.viewport(0,0,e,t),_.clear(_.COLOR_BUFFER_BIT),{fbo:r,width:e,height:t,attach(e){return _?(_.activeTexture(_.TEXTURE0+e),_.bindTexture(_.TEXTURE_2D,n),e):e}}}function V(e,t){let n=B(e,t),r=B(e,t);return{width:e,height:t,texelSizeX:1/e,texelSizeY:1/t,read(){return n},write(){return r},swap(){let e=n;n=r,r=e}}}function H(e,t){let n=Math.floor(.5*(e||F)),r=Math.floor(.5*(t||I));E=V(n,r),D=V(n,r),O=B(n,r),k=V(n,r)}function U(e){_&&(e==null?(_.viewport(0,0,_.drawingBufferWidth,_.drawingBufferHeight),_.bindFramebuffer(_.FRAMEBUFFER,null)):(_.viewport(0,0,e.width,e.height),_.bindFramebuffer(_.FRAMEBUFFER,e.fbo)),_.drawElements(_.TRIANGLES,6,_.UNSIGNED_SHORT,0))}function W(e){if(v=requestAnimationFrame(W),!_||!M)return;let t=1/60;e&&j&&K((.5-.45*Math.sin(.003*e-2))*F,(.5+.1*Math.sin(.0025*e)+.1*Math.cos(.002*e))*I),A.moved&&(j||(A.moved=!1),_.useProgram(b.program),_.uniform1i(b.uniforms.u_input_texture,D.read().attach(1)),_.uniform1f(b.uniforms.u_ratio,F/I),_.uniform2f(b.uniforms.u_point,A.x/F,1-A.y/I),_.uniform3f(b.uniforms.u_point_value,A.dx,-A.dy,1),_.uniform1f(b.uniforms.u_point_size,P),U(D.write()),D.swap(),_.uniform1i(b.uniforms.u_input_texture,E.read().attach(1)),_.uniform3f(b.uniforms.u_point_value,1-N.r,1-N.g,1-N.b),U(E.write()),E.swap()),_.useProgram(x.program),_.uniform2f(x.uniforms.u_texel,D.texelSizeX,D.texelSizeY),_.uniform1i(x.uniforms.u_velocity_texture,D.read().attach(1)),U(O),_.useProgram(S.program),_.uniform2f(S.uniforms.u_texel,D.texelSizeX,D.texelSizeY),_.uniform1i(S.uniforms.u_divergence_texture,O.attach(1));for(let e=0;e<10;e++)_.uniform1i(S.uniforms.u_pressure_texture,k.read().attach(2)),U(k.write()),k.swap();_.useProgram(C.program),_.uniform2f(C.uniforms.u_texel,D.texelSizeX,D.texelSizeY),_.uniform1i(C.uniforms.u_pressure_texture,k.read().attach(1)),_.uniform1i(C.uniforms.u_velocity_texture,D.read().attach(2)),U(D.write()),D.swap(),_.useProgram(w.program),_.uniform2f(w.uniforms.u_texel,D.texelSizeX,D.texelSizeY),_.uniform1i(w.uniforms.u_velocity_texture,D.read().attach(1)),_.uniform1i(w.uniforms.u_input_texture,D.read().attach(1)),_.uniform1f(w.uniforms.u_dt,t),U(D.write()),D.swap(),_.useProgram(w.program),_.uniform2f(w.uniforms.u_texel,E.texelSizeX,E.texelSizeY),_.uniform1i(w.uniforms.u_velocity_texture,D.read().attach(1)),_.uniform1i(w.uniforms.u_input_texture,E.read().attach(2)),_.uniform1f(w.uniforms.u_dt,t),U(E.write()),E.swap(),_.useProgram(T.program),_.uniform1i(T.uniforms.u_output_texture,E.read().attach(1)),_.viewport(0,0,_.drawingBufferWidth,_.drawingBufferHeight),_.bindFramebuffer(_.FRAMEBUFFER,null),_.drawElements(_.TRIANGLES,6,_.UNSIGNED_SHORT,0)}function G(){let e=c.value;!e||!_||(F=window.innerWidth||1920,I=window.innerHeight||1080,e.width=F,e.height=I,P=.8/I,_.viewport(0,0,F,I),H(F,I))}function K(e,t){A.moved=!0,A.dx=5*(e-A.x),A.dy=5*(t-A.y),A.x=e,A.y=t}function q(e){j=!1,K(e.clientX,e.clientY)}function J(e){e.preventDefault(),j=!1,K(e.targetTouches[0].clientX,e.targetTouches[0].clientY)}function Y(){M=document.visibilityState!==`hidden`}return i(()=>{g.value=!0,document.body.classList.add(`has-fluid-bg`),L(),G(),A.x=(window.innerWidth||1920)/2,A.y=(window.innerHeight||1080)/2,window.addEventListener(`resize`,G),document.addEventListener(`mousemove`,q),document.addEventListener(`touchmove`,J,{passive:!1}),document.addEventListener(`visibilitychange`,Y),v=requestAnimationFrame(W)}),r(()=>{cancelAnimationFrame(v),window.removeEventListener(`resize`,G),document.removeEventListener(`mousemove`,q),document.removeEventListener(`touchmove`,J),document.removeEventListener(`visibilitychange`,Y),document.body.classList.remove(`has-fluid-bg`)}),(r,i)=>(n(),t(e,{to:`body`,disabled:!g.value},[a(`canvas`,{ref_key:`canvasEl`,ref:c,class:`fluid-bg`},null,512)],8,[`disabled`]))}}),[[`__scopeId`,`data-v-fa6e83e7`]]);export{g as default};