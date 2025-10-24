import { useEffect, useRef } from "react";
import { Processor } from "./processor";
function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const processedVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    const processedVideo = processedVideoRef.current;
    const canvas = canvasRef.current;
    if (!video || !processedVideo || !canvas) return;

    navigator.mediaDevices
      .getUserMedia({ video: true })
      .then(async (stream) => {
        video.srcObject = stream;
        await video.play();

        const processor = new Processor();
        const processedMediaStream = await processor.init(video, canvas);

        if (processedMediaStream) {
          processedVideo.srcObject = processedMediaStream;
          processedVideo.play();
        }
      })
      .catch((err) => console.error(err));
  }, []);

  return (
    <>
      <video ref={videoRef}></video>
      <video ref={processedVideoRef}></video>
      <canvas width={640} height={480} ref={canvasRef} />
    </>
  );
}

export default App;
//
