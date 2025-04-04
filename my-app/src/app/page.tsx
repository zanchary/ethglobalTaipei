"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Webcam from "react-webcam";
import jsQR from "jsqr";
import { Button } from "@/components/ui/button";

export default function Page() {
  const [cameraActive, setCameraActive] = useState(false);
  const [qrValue, setQrValue] = useState<string | null>(null);
  const webcamRef = useRef<Webcam>(null);
  const clearQrTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handleOpenCamera = () => {
    setCameraActive(true);
  };

  const captureAndScan = useCallback(() => {
    if (webcamRef.current) {
      const screenshot = webcamRef.current.getScreenshot();
      if (!screenshot) return;
      const image = new Image();
      image.src = screenshot;
      image.onload = () => {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = image.width;
        canvas.height = image.height;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        const imageData = context.getImageData(
          0,
          0,
          canvas.width,
          canvas.height
        );
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code) {
          setQrValue(code.data);
          if (clearQrTimerRef.current) {
            clearTimeout(clearQrTimerRef.current);
          }
          clearQrTimerRef.current = setTimeout(() => {
            setQrValue(null);
          }, 5000);
        }
      };
    }
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (cameraActive) {
      interval = setInterval(captureAndScan, 1000);
    }
    return () => clearInterval(interval);
  }, [cameraActive, captureAndScan]);

  return (
    <div className="flex items-center w-full justify-center flex-col h-[100dvh] bg-white text-black safe-area-inset">
      {!cameraActive && <Button onClick={handleOpenCamera}>Open</Button>}
      {cameraActive && (
        <div className="w-48 h-48 flex flex-col items-center">
          <Webcam
            ref={webcamRef}
            videoConstraints={{ facingMode: { exact: "environment" } }}
            className="w-full max-w-md"
            muted
          />
          {qrValue && (
            <div className="mt-2 p-2 bg-white text-black rounded">
              <strong>QR Code Value:</strong> {qrValue}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
