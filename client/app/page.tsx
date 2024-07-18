"use client";
import React, {  useEffect, useRef, useState } from "react";
import axios from "axios";
import Link from "next/link";
import videojs from "video.js";
import VideoJS from "./components/videoPlayerComponents";

export default function Home() {
  const [fileName, setFileName] = useState([]);
  const [currentFile, setCurrentFile] = useState("");
  async function fetchFiles() {
    try {
      const { data } = await axios.get("http://localhost:5000/links");
      setFileName(data);
    } catch (error) {
      console.error("Error fetching files:", error);
    }
  }

  useEffect(() => {
    fetchFiles();
  }, []);

  const playerRef = useRef(null);

  const videoJsOptions = {
    autoplay: true,
    controls: true,
    responsive: true,
    fluid: true,
    sources: [{
      src: `https://finaloutputforstream.s3.ap-south-1.amazonaws.com/ForStreaming/${currentFile}/masterNode.m3u8`,
    }]
  };

  const handlePlayerReady = (player:any) => {
    playerRef.current = player;

    // You can handle player events here, for example:
    player.on('waiting', () => {
      videojs.log('player is waiting');
    });

    player.on('dispose', () => {
      videojs.log('player will dispose');
    });
  };




  return (
    <div>
      <nav className="flex justify-between items-center bg-gray-800 p-4 text-white">
        <div>Aman</div>
        <div>
          <Link href="/uploads" className="text-white hover:text-gray-300">
            Uploads
          </Link>
        </div>
      </nav>

      <div className="container mx-auto mt-4">
        {fileName.length > 0 ? (
          <div>
            {fileName.map((val: any) => (
              <div key={val._id}>
                <div
                  onClick={() => setCurrentFile(val.link)}
                  className="cursor-pointer"
                >
                  {val.link}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div>No files available</div>
        )}
      </div>
      <div className="relative w-[90%] max-w-6xl mx-auto my-8 rounded-xl overflow-hidden">
      <VideoJS options={videoJsOptions} onReady={handlePlayerReady} />
      </div>
    </div>
  );
}
