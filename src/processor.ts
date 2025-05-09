import {
  FilesetResolver,
  ImageSegmenter,
  ImageSegmenterResult,
  MPMask,
} from "@mediapipe/tasks-vision";
import { createCopyTextureToCanvas } from "./shader.utils";

const FRAME_RATE = 30;
const BLUR_RADIUS = 10;

// https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm/vision_wasm_internal.js
// https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm/vision_wasm_internal.js
const createImageSegmenter = async (canvas: OffscreenCanvas) => {
  const vision = await FilesetResolver.forVisionTasks(
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm"
  );

  return ImageSegmenter.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter_landscape/float16/latest/selfie_segmenter_landscape.tflite",
      delegate: "GPU",
    },
    canvas,
    runningMode: "VIDEO",
    outputConfidenceMasks: true,
  });
};

export class Processor {
  imageSegmenter: ImageSegmenter | null = null;

  element: HTMLVideoElement | null = null;

  gl: WebGL2RenderingContext | null = null;

  streamCanvas?: HTMLCanvasElement;
  canvasCtx: CanvasRenderingContext2D | null = null;

  tasksCanvas = new OffscreenCanvas(640, 480);

  vertexShader: WebGLShader | null = null;
  fragmentShader: WebGLShader | null = null;

  program: WebGLProgram | null = null;

  frameBuffer: WebGLFramebuffer | null = null;

  lastWebcamTime = -1;

  toImageBitmap?: (mask: MPMask) => Promise<ImageBitmap>;

  constructor() {
    this.callback = this.callback.bind(this);
    this.process = this.process.bind(this);
  }

  async init(element: HTMLVideoElement, canvas: HTMLCanvasElement) {
    this.streamCanvas = canvas;
    this.canvasCtx = this.streamCanvas.getContext("2d");
    this.element = element;

    this.imageSegmenter = await createImageSegmenter(this.tasksCanvas);
    this.toImageBitmap = createCopyTextureToCanvas(this.tasksCanvas);

    setInterval(() => {
      this.process();
    }, 1000 / FRAME_RATE);

    return this.streamCanvas.captureStream(FRAME_RATE);
  }

  async process() {
    if (!this.imageSegmenter || !this.element) {
      return;
    }

    const now = performance.now();
    const image = await createImageBitmap(this.element);
    this.imageSegmenter.segmentForVideo(this.element, now, (result) =>
      this.callback(result, image)
    );
  }

  async callback(result: ImageSegmenterResult, image: ImageBitmap) {
    const mask = result.confidenceMasks?.[0];

    if (!mask || !this.toImageBitmap || !this.canvasCtx || !this.element)
      return;

    const maskImage = await this.toImageBitmap(mask);

    this.canvasCtx.save();
    this.canvasCtx.fillStyle = "white";
    this.canvasCtx.clearRect(
      0,
      0,
      this.element.videoWidth,
      this.element.videoHeight
    );

    this.canvasCtx.drawImage(
      maskImage,
      0,
      0,
      this.element.videoWidth,
      this.element.videoHeight
    );

    this.canvasCtx.globalCompositeOperation = "source-in";
    this.canvasCtx.drawImage(
      image,
      0,
      0,
      this.element.videoWidth,
      this.element.videoHeight
    );
    this.canvasCtx.filter = `blur(${BLUR_RADIUS}px)`;

    this.canvasCtx.globalCompositeOperation = "destination-atop";
    this.canvasCtx.drawImage(
      image,
      0,
      0,
      this.element.videoWidth,
      this.element.videoHeight
    );
    this.canvasCtx.restore();
  }
}
