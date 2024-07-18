import {
    GetObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
  } from "@aws-sdk/client-s3";
  import fs from "fs";
  import { Readable } from "stream";
  import path from "path";
  import express from "express";
  import { exec } from "child_process";
  import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
  import axios from "axios";
  import { Worker,Queue } from "bullmq";
  const tenMB = 1024 * 1024 * 10;
  const app = express();
  const s3Client = new S3Client({
    region: "XXXXXXXXX",
    credentials: {
      accessKeyId: "XXXXXXXXX",
      secretAccessKey: "XXXXXXXXX",
    },
  });
  const dataBaseAndEmailQueue = new Queue("dataBaseAndEmail",{
    connection:{
      host:"localhost",
      port:6379
    }
  })
  app.use("/static", express.static(path.join(__dirname, "final")));
  app.use("/static", express.static(path.join(__dirname, "s3BucketUpload")));
  async function processFffmpeg(
    inputPath: any,
    outputPath: any,
    resolution: any
  ) {
    return new Promise((resolve, reject) => {
      const ffmpegCommand = `ffmpeg -i ${inputPath} \
        -codec:v libx264 \
        -preset slow \
        -crf 20 \
        -vf "scale=-2:${resolution}" \
        -codec:a aac \
        -b:a 128k \
        -hls_time 10 \
        -hls_playlist_type vod \
        -hls_segment_filename "${outputPath}/${resolution}-segment%03d.ts" \
        -start_number 0 \
        "${outputPath}/${resolution}.m3u8"`;
  
      exec(ffmpegCommand, (error, stdout, stderr) => {
        if (error) {
          console.log(`exec error: ${error}`);
          reject(error);
        } else {
          if (stderr) {
            console.log(`exec stderr: ${stderr}`);
          }
          resolve(null);
        }
      });
    });
  }
  
  async function downloadChunk(value: string) {
    if (!fs.existsSync("./uploads")) {
      fs.mkdirSync("./uploads");
    }
    if (!fs.existsSync(`./s3BucketUpload/${value}`)) {
      fs.mkdirSync(`./s3BucketUpload/${value}`, { recursive: true });
    }
    if (!fs.existsSync(`./final/${value}`)) {
      fs.mkdirSync(`./final/${value}`, { recursive: true });
    }
    const resolutions = [360, 480, 720, 1080, 2160];
    const outputPath = `./s3BucketUpload/${value}`;
    const getLengthCommand = new HeadObjectCommand({
      Bucket: "XXXXXXXXX",
      Key: `clientUpload/${value}`,
    });
    const partsDownloaded: any[] = [];
    const { ContentLength } = await s3Client.send(getLengthCommand);
    if (ContentLength) {
      const parts = Math.ceil(ContentLength / tenMB);
      for (let i = 0; i < parts; i++) {
        const startByte = i * tenMB;
        const endByte = Math.min((i + 1) * tenMB - 1, ContentLength - 1);
        const byteRange = `bytes=${startByte}-${endByte}`;
        const partFileName = `${i}`;
        const partPath = path.join(outputPath, partFileName);
        const getData = await s3Client.send(
          new GetObjectCommand({
            Bucket: "XXXXXXXXX",
            Key: `clientUpload/${value}`,
            Range: byteRange,
          })
        );
        if (getData.ContentRange) {
          const writeStream = fs.createWriteStream(partPath);
          await new Promise((resolve, reject) => {
            if (getData.Body instanceof Readable) {
              getData.Body.pipe(writeStream)
                .on("error", reject)
                .on("finish", () => {
                  writeStream.close();
                  resolve(null);
                });
            } else {
              reject(new Error("Body is not a readable stream"));
            }
          });
          partsDownloaded.push(i);
        }
      }
      const finalWriteStream = fs.createWriteStream(`${outputPath}/${value}`);
      for (let i of partsDownloaded) {
        const pathmatch = path.join(outputPath, `${i}`);
        const data = fs.readFileSync(pathmatch);
        finalWriteStream.write(data);
      }
      finalWriteStream.end();
      for (let i of partsDownloaded) {
        const pathmatch = path.join(outputPath, `${i}`);
        fs.unlinkSync(pathmatch);
      }
  
      const promises = resolutions.map(async (res) => {
        await processFffmpeg(`${outputPath}/${value}`, `./final/${value}`, res);
      });
      await Promise.all(promises);
  
      fs.copyFileSync(`./masterNode.m3u8`, `./final/${value}/masterNode.m3u8`);
      const files = fs.readdirSync(`./final/${value}`);
      for (let i = 0; i < files.length; i += 10) {
        const batchFiles = files.slice(i, i + 10);
  
        const uploadPromises = batchFiles.map(async (file) => {
          const command = {
            Bucket: "finaloutputforstream",
            Key: `ForStreaming/${value}/${file}`,
          };
  
          const urlforData = await getSignedUrl(
            s3Client,
            new PutObjectCommand(command)
          );
  
          const fileData = fs.readFileSync(`./final/${value}/${file}`);
          await axios.put(urlforData, fileData);
        });
  
        await Promise.all(uploadPromises);
      }
      fs.rmSync(`./final/${value}`, { recursive: true });
      fs.rmSync(`./s3BucketUpload/${value}`, { recursive: true });
      await dataBaseAndEmailQueue.add("dataQueue",value,{
        removeOnComplete:true,
        removeOnFail:true,
      })
    }
    return;
  }
  const worker = new Worker(
    "tranfsterFile",
    async (job) => {
      await downloadChunk(job.data);
    },
    {
      connection: {
        host: "localhost",
        port: 6379,
      },
    }
  );
  
  async function main() {
    worker;
  }
  app.listen(8000, () => console.log("app is running"));
  main();
  