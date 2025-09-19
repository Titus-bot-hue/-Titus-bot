import express from "express";
import dotenv from "dotenv";
import { startBot } from "./botManager.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🤖 Titus-Bot Bot is running!");
});

app.listen(PORT, () => {
  console.log(`🌍 Server running at http://localhost:${PORT}`);
  startBot();
});
