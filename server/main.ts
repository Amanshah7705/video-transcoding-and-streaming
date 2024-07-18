import express from "express";
import cors from "cors";
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import bodyParser from "body-parser";
import { v4 as uuidv4 } from "uuid";
import { Queue, Worker } from "bullmq";
import mongoose from "mongoose";

const app = express();
app.use(bodyParser.json());
app.use(
  cors({
    origin: "*",
    credentials: true,
  })
);
const tranfsterFileToFfmpqg = new Queue("tranfsterFile", {
  connection: {
    host: "localhost",
    port: 6379,
  },
});
async function connectDb() {
  await mongoose.connect(
    "mongoUrl"
  );
}
connectDb();
const linkSchema = new mongoose.Schema({
  link: {
    type: String,
  },
});
const linkModel = mongoose.model("linkSchema", linkSchema);
const dbWorker = new Worker(
  "dataBaseAndEmail",
  async (job) => {
    const linkData = `${job.data}`;
    const newLink = await linkModel.create({
      link: linkData,
    });
    await newLink.save();
  },
  {
    connection: {
      host: "localhost",
      port: 6379,
    },
  }
);
const s3Client = new S3Client({
  region: "XXXXXXXXX",
  credentials: {
    accessKeyId: "XXXXXXXXX",
    secretAccessKey: "XXXXXXXXX",
  },
});
app.post("/start-multipart-upload", async (req, res) => {
  const { contentType } = req.body;
  const fileName = uuidv4();
  const params = {
    Bucket: "XXXXXXXXX",
    Key: `clientUpload/${fileName}`,
    ContentType: contentType,
  };

  try {
    const command = new CreateMultipartUploadCommand(params);
    const multipart = await s3Client.send(command);
    res.json({ uploadId: multipart.UploadId, fileName: fileName });
  } catch (error) {
    console.error("Error starting multipart upload:", error);
    return res.status(500).json({ error: "Error starting multipart upload" });
  }
});

app.post("/generate-presigned-url", async (req, res) => {
  const { fileName, uploadId, partNumbers } = req.body;
  const totalParts = Array.from({ length: partNumbers }, (_, i) => i + 1);
  try {
    let presignedUrls: any[] = [];

    for (let i = 0; i < totalParts.length; i += 10) {
      const batch = totalParts.slice(i, i + 10);

      const batchPromises = batch.map(async (partNumber) => {
        const params = {
          Bucket: "XXXXXXXXX",
          Key: `clientUpload/${fileName}`,
          PartNumber: partNumber,
          UploadId: uploadId,
        };

        const res = await getSignedUrl(s3Client, new UploadPartCommand(params));
        return { partNumber, res };
      });

      const batchUrls = await Promise.all(batchPromises);

      presignedUrls = presignedUrls.concat(batchUrls);
    }
    presignedUrls.sort((x: any, y: any) => x.PartNumber - y.PartNumber);
    res.json({ presignedUrls });
  } catch (error) {
    console.error("Error generating presigned URLs:", error);
    return res.status(500).json({ error: "Error generating presigned URLs" });
  }
});

app.post("/complete-multipart-upload", async (req, res) => {
  const { fileName, uploadId, parts } = req.body;
  parts.sort((x: any, y: any) => x.PartNumber - y.PartNumber);
  const params = {
    Bucket: "XXXXXXXXX",
    Key: `clientUpload/${fileName}`,
    UploadId: uploadId,
    MultipartUpload: {
      Parts: parts.map((part: any) => ({
        ETag: part.etag,
        PartNumber: part.PartNumber,
      })),
    },
  };

  try {
    const command = new CompleteMultipartUploadCommand(params);
    const data = await s3Client.send(command);
    tranfsterFileToFfmpqg.add("data-trafter", fileName, {
      removeOnComplete: true,
      removeOnFail: true,
    });
    res.status(200).json({ fileData: data });
  } catch (error) {
    console.error("Error completing multipart upload:", error);
    return res.status(500).json({ error: "Error completing multipart upload" });
  }
});

app.get("/links", async (req, res) => {
  const data= await linkModel.find();
  res.status(200).json(data)
});

app.listen(5000, () => console.log("App is running"));
