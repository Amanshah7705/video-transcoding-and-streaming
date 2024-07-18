"use client";

import React, { useState } from "react";
import axios from "axios";

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files[0]) {
      setFile(files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setIsUploading(true);

      const response = await axios.post(
        "http://localhost:5000/start-multipart-upload",
        {
          contentType: file.type,
        }
      );

      const { uploadId, fileName } = response.data;

      const totalSize = file.size;
      const chunkSize = 10000000;
      const numChunks = Math.ceil(totalSize / chunkSize);

      const presignedUrlsResponse = await axios.post(
        "http://localhost:5000/generate-presigned-url",
        {
          fileName: fileName,
          uploadId,
          partNumbers: numChunks,
        }
      );

      const presignedUrls = presignedUrlsResponse.data.presignedUrls;

      const parts: any[] = [];
      const uploadPromises = presignedUrls.map(
        async (presignedUrl: any, i: number) => {
          const start = i * chunkSize;
          const end = Math.min(start + chunkSize, totalSize);
          const chunk = file.slice(start, end);

          return axios
            .put(presignedUrl.res, chunk, {
              headers: {
                "Content-Type": file.type,
              },
            })
            .then((response) => {
              parts.push({
                etag: response.headers.etag,
                PartNumber: i + 1,
              });
            });
        }
      );

      await Promise.all(uploadPromises);
      const completeUploadResponse = await axios.post(
        "http://localhost:5000/complete-multipart-upload",
        {
          fileName: fileName,
          uploadId,
          parts,
        }
      );
      setFile(null);
      if (completeUploadResponse.status === 200) {
        alert("File uploaded successfully.");
      } else {
        alert("Upload failed.");
      }
    } catch (error) {
      console.error("Error during upload:", error);
      alert("Upload failed.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="bg-black min-w-screen min-h-screen flex items-center justify-center">
      <div className=" w-96 mt-10 p-6 border-2 border-white shadow-lg rounded-lg">
        <h1 className="text-2xl font-bold mb-4 text-white text-center">
          Multipart Upload
        </h1>
        <div className="flex items-center justify-center w-full">
          <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:bg-gray-700 dark:hover:bg-gray-600 dark:border-gray-600 dark:hover:border-gray-500 hover:bg-gray-100">
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <svg
                className="w-8 h-8 mb-4 text-gray-500 dark:text-gray-400"
                aria-hidden="true"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 20 16"
              >
                <path
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"
                />
              </svg>
              <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="font-semibold">Click to upload</span> or drag
                and drop
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Video</p>
            </div>
            <input
              id="dropzone-file"
              type="file"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        </div>
        {file ? <div className="text-white">{file.name}</div> : <div></div>}
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={handleUpload}
            disabled={isUploading}
            className="text-white bg-gradient-to-br from-pink-500 to-orange-400 hover:bg-gradient-to-bl focus:ring-4 focus:outline-none focus:ring-pink-200 dark:focus:ring-pink-800 font-medium rounded-lg text-sm px-5 py-2.5 text-center mt-4"
          >
            Pink to Orange
          </button>
        </div>
      </div>
    </div>
  );
}
