import { FilesetResolver, ImageSegmenter, ImageSegmenterResult, MPMask } from "@mediapipe/tasks-vision"
import { useEffect, useRef } from "react"

const FRAME_RATE = 30
const BLUR_RADIUS = 10

const createShaderProgram = (gl: WebGL2RenderingContext) => {
  const vs = `
    attribute vec2 position;
    varying vec2 texCoords;
  
    void main() {
      texCoords = (position + 1.0) / 2.0;
      texCoords.y = 1.0 - texCoords.y;
      gl_Position = vec4(position, 0, 1.0);
    }
  `

  const fs = `
    precision highp float;
    varying vec2 texCoords;
    uniform sampler2D textureSampler;

    void main() {
        float a = texture2D(textureSampler, texCoords).r;

        // Apply step function to thicken the texture

        gl_FragColor = vec4(a, a, a, a);
    }
  `
  const vertexShader = gl.createShader(gl.VERTEX_SHADER)
  if (!vertexShader) {
    throw Error('can not create vertex shader')
  }
  gl.shaderSource(vertexShader, vs)
  gl.compileShader(vertexShader)

  // Create our fragment shader
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)
  if (!fragmentShader) {
    throw Error('can not create fragment shader')
  }
  gl.shaderSource(fragmentShader, fs)
  gl.compileShader(fragmentShader)

  // Create our program
  const program = gl.createProgram()
  if (!program) {
    throw Error('can not create program')
  }
  gl.attachShader(program, vertexShader)
  gl.attachShader(program, fragmentShader)
  gl.linkProgram(program)

  return {
    vertexShader,
    fragmentShader,
    shaderProgram: program,
    attribLocations: {
      position: gl.getAttribLocation(program, 'position')
    },
    uniformLocations: {
      textureSampler: gl.getUniformLocation(program, 'textureSampler')
    }
  }
}
const createVertexBuffer = (gl: WebGL2RenderingContext) => {
  if (!gl) {
    return null
  }
  const vertexBuffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, -1, 1, 1, 1, -1, -1, 1, 1, 1, -1]),
    gl.STATIC_DRAW
  )
  return vertexBuffer
}

function createCopyTextureToCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas
) {
  const gl = canvas.getContext('webgl2')
  if (!gl) {
    return undefined
  }
  const {
    shaderProgram,
    attribLocations: { position: positionLocation },
    uniformLocations: { textureSampler: textureLocation }
  } = createShaderProgram(gl)
  const vertexBuffer = createVertexBuffer(gl)

  return (mask: MPMask) => {
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(1.0, 1.0, 1.0, 1.0)
    gl.useProgram(shaderProgram)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const texture = mask.getAsWebGLTexture()
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer)
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0)
    gl.enableVertexAttribArray(positionLocation)

    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(textureLocation, 0)

    gl.drawArrays(gl.TRIANGLES, 0, 6)

    return createImageBitmap(canvas)
  }
}

// https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm/vision_wasm_internal.js
// https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm/vision_wasm_internal.js
const createImageSegmenter = async (canvas: HTMLCanvasElement | OffscreenCanvas) => {
  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm'
  )

  return ImageSegmenter.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite',
      delegate: 'GPU',
    },
    canvas,
    runningMode: 'VIDEO',
    outputConfidenceMasks: true,
  })
}

class Processor {
  imageSegmenter: ImageSegmenter | null = null

  element: HTMLVideoElement | null = null

  gl: WebGL2RenderingContext | null = null

  streamCanvas?: HTMLCanvasElement
  canvasCtx: CanvasRenderingContext2D | null = null

  vertexShader: WebGLShader | null = null
  fragmentShader: WebGLShader | null = null

  program: WebGLProgram | null = null

  frameBuffer: WebGLFramebuffer | null = null

  lastWebcamTime = -1;

  toImageBitmap?: (mask: MPMask) => Promise<ImageBitmap>

  constructor() {
    this.callback = this.callback.bind(this)
    this.process = this.process.bind(this)
  }

  async init(element:  HTMLVideoElement, canvas: HTMLCanvasElement) {
    this.streamCanvas = canvas
    this.canvasCtx = this.streamCanvas.getContext('2d')
    this.element = element

    const tasksCanvas = new OffscreenCanvas(canvas.width, canvas.height)

    this.imageSegmenter = await createImageSegmenter(tasksCanvas)
    this.toImageBitmap = createCopyTextureToCanvas(tasksCanvas)
  

    setInterval(() => {
      this.process()
    }, 1000 / FRAME_RATE)

    return this.streamCanvas.captureStream(FRAME_RATE)
  }

  async process() {
    if (!this.imageSegmenter || !this.element) {
      return
    }

    const now = performance.now()
    const image = await createImageBitmap(this.element)
    await this.imageSegmenter.segmentForVideo(this.element, now, (result) => this.callback(result, image))
  }

  async callback(result: ImageSegmenterResult, image: ImageBitmap) {
    const mask = result.confidenceMasks?.[0]

    if (!mask || !this.toImageBitmap || !this.canvasCtx || !this.element) return

    const maskImage = await this.toImageBitmap(mask)

    this.canvasCtx.save()
    this.canvasCtx.fillStyle = 'white'
    this.canvasCtx.clearRect(0, 0, this.element.videoWidth, this.element.videoHeight)

    this.canvasCtx.drawImage(maskImage, 0, 0, this.element.videoWidth, this.element.videoHeight)

    this.canvasCtx.globalCompositeOperation = 'source-in'
    this.canvasCtx.drawImage(image, 0, 0, this.element.videoWidth, this.element.videoHeight)
    this.canvasCtx.filter = `blur(${BLUR_RADIUS}px)`
    
    this.canvasCtx.globalCompositeOperation = 'destination-atop'
    this.canvasCtx.drawImage(image, 0, 0, this.element.videoWidth, this.element.videoHeight)
    this.canvasCtx.restore()
  }
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const processedVideoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const video = videoRef.current
    const processedVideo = processedVideoRef.current
    const canvas = canvasRef.current
    if (!video || !processedVideo || !canvas) return

    navigator.mediaDevices.getUserMedia({ video: true })
      .then(async (stream) => {
        video.srcObject = stream
        await video.play()

        const processor = new Processor()
        const output = await processor.init(video, canvas)

        if (output) {
          processedVideo.srcObject = output
          processedVideo.play()
        }
      })
      .catch((err) => console.error(err))
  }, [])

  return (
    <>
      <video ref={videoRef}></video>
      <video ref={processedVideoRef}></video>
      <canvas width={640} height={480} ref={canvasRef} />
    </>
  )
}

export default App
// 