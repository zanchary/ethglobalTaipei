"use client";

import { useState } from "react";
import Webcam from "react-webcam";

export default function Page() {
  const [cameraActive, setCameraActive] = useState(false);

  const handleOpenCamera = () => {
    setCameraActive(true);
  };


  return (
    <div className="flex items-center w-full justify-center flex-col h-[100dvh] bg-black safe-area-inset">
      {!cameraActive && (
        <button
          onClick={handleOpenCamera}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Open
        </button>
      )}
      {cameraActive && (
        <div className="w-48 h-48">
          <Webcam videoConstraints={{ facingMode: { exact: "environment" } }} className="w-full max-w-md" muted />
        </div>
      )}
    </div>
  );
}
