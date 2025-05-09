import {
  FilesetResolver,
  ImageSegmenter,
  ImageSegmenterResult,
  MPMask,
} from "@mediapipe/tasks-vision";
import { useEffect, useRef } from "react";

const FRAME_RATE = 30;
const BLUR_RADIUS = 10;

const createShaderProgram = (gl: WebGL2RenderingContext) => {
  const vs = `
    attribute vec2 position;
    varying vec2 texCoords;
  
    void main() {
      texCoords = (position + 1.0) / 2.0;
      texCoords.y = 1.0 - texCoords.y;
      gl_Position = vec4(position, 0, 1.0);
    }
  `;

  const fs = `
    precision highp float;
    varying vec2 texCoords;
    uniform sampler2D textureSampler;

    void main() {
        float a = texture2D(textureSampler, texCoords).r;

        // Apply step function to thicken the texture
        // a = step(0.5, a);

        gl_FragColor = vec4(a, a, a, a);
    }
  `;
  const vertexShader = gl.createShader(gl.VERTEX_SHADER);
  if (!vertexShader) {
    throw Error("can not create vertex shader");
  }
  gl.shaderSource(vertexShader, vs);
  gl.compileShader(vertexShader);

  // Create our fragment shader
  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
  if (!fragmentShader) {
    throw Error("can not create fragment shader");
  }
  gl.shaderSource(fragmentShader, fs);
  gl.compileShader(fragmentShader);

  // Create our program
  const program = gl.createProgram();
  if (!program) {
    throw Error("can not create program");
  }
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  return {
    vertexShader,
    fragmentShader,
    shaderProgram: program,
    attribLocations: {
      position: gl.getAttribLocation(program, "position"),
    },
    uniformLocations: {
      textureSampler: gl.getUniformLocation(program, "textureSampler"),
    },
  };
};
const createVertexBuffer = (gl: WebGL2RenderingContext) => {
  if (!gl) {
    return null;
  }
  const vertexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, -1, 1, 1, 1, -1, -1, 1, 1, 1, -1]),
    gl.STATIC_DRAW
  );
  return vertexBuffer;
};

function createCopyTextureToCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas
) {
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    return undefined;
  }
  const {
    shaderProgram,
    attribLocations: { position: positionLocation },
    uniformLocations: { textureSampler: textureLocation },
  } = createShaderProgram(gl);
  const vertexBuffer = createVertexBuffer(gl);

  return (mask: MPMask) => {
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(1.0, 1.0, 1.0, 1.0);
    gl.useProgram(shaderProgram);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const texture = mask.getAsWebGLTexture();
    gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(positionLocation);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(textureLocation, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    return createImageBitmap(canvas);
  };
}

// https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm/vision_wasm_internal.js
// https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm/vision_wasm_internal.js
const createImageSegmenter = async (
  canvas: HTMLCanvasElement | OffscreenCanvas
) => {
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

class Processor {
  async init(track: MediaStreamVideoTrack) {
    console.log(track);
    const tasksCanvas = new OffscreenCanvas(1, 1);

    const imageSegmenter = await createImageSegmenter(tasksCanvas);
    const toImageBitmap = createCopyTextureToCanvas(tasksCanvas);

    const trackProcessor = new MediaStreamTrackProcessor({ track });
    const trackGenerator = new MediaStreamTrackGenerator({ kind: "video" });

    const canvas = new OffscreenCanvas(1, 1);
    const ctx = canvas.getContext("2d");

    const transformer = new TransformStream({
      async transform(frame: VideoFrame, controller) {
        const timestamp = frame.timestamp;
        const now = performance.now();
        const result = imageSegmenter.segmentForVideo(frame, now);
        const mask = result.confidenceMasks?.[0];

        if (!mask || !toImageBitmap || !ctx || !canvas) {
          frame.close();
          return;
        }

        const width = frame.displayWidth;
        const height = frame.displayHeight;

        canvas.width = width;
        canvas.height = height;

        const maskImage = await toImageBitmap(mask);

        ctx.save();
        ctx.clearRect(0, 0, width, height);

        ctx.drawImage(maskImage, 0, 0, width, height);

        ctx.globalCompositeOperation = "source-in";
        ctx.drawImage(frame, 0, 0, width, height);
        ctx.filter = `blur(${BLUR_RADIUS}px)`;

        ctx.globalCompositeOperation = "destination-atop";
        ctx.drawImage(frame, 0, 0, width, height);
        ctx.restore();

        frame.close();

        controller.enqueue(new VideoFrame(canvas, { timestamp }));
      },
    });

    trackProcessor.readable
      .pipeThrough(transformer)
      .pipeTo(trackGenerator.writable);
    return new MediaStream([trackGenerator]);
  }
}

function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const processedVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const processedVideo = processedVideoRef.current;
    if (!video || !processedVideo) return;

    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then(async (stream) => {
        video.srcObject = stream;
        await video.play();

        const processor = new Processor();
        const output = await processor.init(stream.getVideoTracks()[0]);

        console.log(output);

        processedVideo.srcObject = output;
        await processedVideo.play();
      })
      .catch((err) => console.error(err));
  }, []);

  return (
    <>
      <video ref={videoRef}></video>
      <video ref={processedVideoRef}></video>
    </>
  );
}

export default App;
//
