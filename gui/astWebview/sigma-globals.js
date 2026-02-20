/**
 * Webview bundle entry point.
 * esbuild bundles this into a single IIFE that exposes Sigma, Graph, and
 * layout helpers on `window` so the inline webview script can use them.
 */
import Graph from 'graphology';
import Sigma from 'sigma';
import { circular, random } from 'graphology-layout';
import forceAtlas2 from 'graphology-layout-forceatlas2';
import { createNodePiechartProgram } from '@sigma/node-piechart';
import { EdgeProgram } from 'sigma/rendering';
import { floatColor } from 'sigma/utils';

// ---------------------------------------------------------------------------
// Custom EdgeGradientProgram — gradient from sourceColor to targetColor
// Fork of sigma's EdgeRectangleProgram with per-vertex color blending.
// Uses a_positionCoef (0=source, 1=target) to mix the two colors in the
// vertex shader so WebGL interpolates across the quad automatically.
// ---------------------------------------------------------------------------

const GRADIENT_VERTEX_SHADER = /* glsl */ `
attribute vec4 a_id;
attribute vec4 a_sourceColor;
attribute vec4 a_targetColor;
attribute vec2 a_normal;
attribute float a_normalCoef;
attribute vec2 a_positionStart;
attribute vec2 a_positionEnd;
attribute float a_positionCoef;

uniform mat3 u_matrix;
uniform float u_sizeRatio;
uniform float u_zoomRatio;
uniform float u_pixelRatio;
uniform float u_correctionRatio;
uniform float u_minEdgeThickness;
uniform float u_feather;

varying vec4 v_color;
varying vec2 v_normal;
varying float v_thickness;
varying float v_feather;

const float bias = 255.0 / 254.0;

void main() {
  float minThickness = u_minEdgeThickness;

  vec2 normal = a_normal * a_normalCoef;
  vec2 position = a_positionStart * (1.0 - a_positionCoef) + a_positionEnd * a_positionCoef;

  float normalLength = length(normal);
  vec2 unitNormal = normal / normalLength;

  float pixelsThickness = max(normalLength, minThickness * u_sizeRatio);
  float webGLThickness = pixelsThickness * u_correctionRatio / u_sizeRatio;

  gl_Position = vec4((u_matrix * vec3(position + unitNormal * webGLThickness, 1)).xy, 0, 1);

  v_thickness = webGLThickness / u_zoomRatio;
  v_normal = unitNormal;
  v_feather = u_feather * u_correctionRatio / u_zoomRatio / u_pixelRatio * 2.0;

  #ifdef PICKING_MODE
  v_color = a_id;
  #else
  v_color = mix(a_sourceColor, a_targetColor, a_positionCoef);
  #endif

  v_color.a *= bias;
}
`;

const GRADIENT_FRAGMENT_SHADER = /* glsl */ `
precision mediump float;

varying vec4 v_color;
varying vec2 v_normal;
varying float v_thickness;
varying float v_feather;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

void main(void) {
  #ifdef PICKING_MODE
  gl_FragColor = v_color;
  #else
  float dist = length(v_normal) * v_thickness;
  float t = smoothstep(v_thickness - v_feather, v_thickness, dist);
  gl_FragColor = mix(v_color, transparent, t);
  #endif
}
`;

const { UNSIGNED_BYTE, FLOAT } = WebGLRenderingContext;
const GRADIENT_UNIFORMS = [
  'u_matrix', 'u_zoomRatio', 'u_sizeRatio', 'u_correctionRatio',
  'u_pixelRatio', 'u_feather', 'u_minEdgeThickness',
];

class EdgeGradientProgram extends EdgeProgram {
  getDefinition() {
    return {
      VERTICES: 6,
      VERTEX_SHADER_SOURCE: GRADIENT_VERTEX_SHADER,
      FRAGMENT_SHADER_SOURCE: GRADIENT_FRAGMENT_SHADER,
      METHOD: WebGLRenderingContext.TRIANGLES,
      UNIFORMS: GRADIENT_UNIFORMS,
      ATTRIBUTES: [
        { name: 'a_positionStart', size: 2, type: FLOAT },
        { name: 'a_positionEnd', size: 2, type: FLOAT },
        { name: 'a_normal', size: 2, type: FLOAT },
        { name: 'a_sourceColor', size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: 'a_targetColor', size: 4, type: UNSIGNED_BYTE, normalized: true },
        { name: 'a_id', size: 4, type: UNSIGNED_BYTE, normalized: true },
      ],
      CONSTANT_ATTRIBUTES: [
        { name: 'a_positionCoef', size: 1, type: FLOAT },
        { name: 'a_normalCoef', size: 1, type: FLOAT },
      ],
      CONSTANT_DATA: [
        [0, 1], [0, -1], [1, 1],
        [1, 1], [0, -1], [1, -1],
      ],
    };
  }

  processVisibleItem(edgeIndex, startIndex, sourceData, targetData, data) {
    const thickness = data.size || 1;
    const x1 = sourceData.x;
    const y1 = sourceData.y;
    const x2 = targetData.x;
    const y2 = targetData.y;
    const srcColor = floatColor(data.sourceColor || data.color);
    const tgtColor = floatColor(data.targetColor || data.color);

    const dx = x2 - x1;
    const dy = y2 - y1;
    let len = dx * dx + dy * dy;
    let n1 = 0;
    let n2 = 0;
    if (len) {
      len = 1 / Math.sqrt(len);
      n1 = -dy * len * thickness;
      n2 = dx * len * thickness;
    }

    const array = this.array;
    array[startIndex++] = x1;
    array[startIndex++] = y1;
    array[startIndex++] = x2;
    array[startIndex++] = y2;
    array[startIndex++] = n1;
    array[startIndex++] = n2;
    array[startIndex++] = srcColor;
    array[startIndex++] = tgtColor;
    array[startIndex++] = edgeIndex;
  }

  setUniforms(params, { gl, uniformLocations }) {
    const {
      u_matrix, u_zoomRatio, u_feather, u_pixelRatio,
      u_correctionRatio, u_sizeRatio, u_minEdgeThickness,
    } = uniformLocations;
    gl.uniformMatrix3fv(u_matrix, false, params.matrix);
    gl.uniform1f(u_zoomRatio, params.zoomRatio);
    gl.uniform1f(u_sizeRatio, params.sizeRatio);
    gl.uniform1f(u_correctionRatio, params.correctionRatio);
    gl.uniform1f(u_pixelRatio, params.pixelRatio);
    gl.uniform1f(u_feather, params.antiAliasingFeather);
    gl.uniform1f(u_minEdgeThickness, params.minEdgeThickness);
  }
}

// ---------------------------------------------------------------------------
// Exports to window
// ---------------------------------------------------------------------------
window.Graph = Graph;
window.Sigma = Sigma;
window.graphLayouts = { circular, random };
window.forceAtlas2 = forceAtlas2;
window.createNodePiechartProgram = createNodePiechartProgram;
window.EdgeGradientProgram = EdgeGradientProgram;
