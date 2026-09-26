import "dotenv/config"; 
import express from "express";
import cors from "cors";


import {clerkMiddleware} from "@clerk/express";
import { clerkWebhookHandler } from "./webhooks/clerk";
import { getEnv } from "./lib/env";

const env = getEnv();
const app = express();

const rawJson = express.raw({ type: "application/json", limit: "1mb" });

//Note - dont parse the webhook event data, it needs to be in its raw format
app.post("/webhooks/clerk", rawJson, (req, res) => {
  void clerkWebhookHandler(req, res);
})

app.use(express.json());
app.use(cors());
app.use(clerkMiddleware());


app.listen(env.PORT, () => {
  console.log(`Server is running on port ${env.PORT}`);
});