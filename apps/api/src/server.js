import mongoose from "mongoose";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { store } from "./services/store.js";

async function bootstrap() {
  if (env.mongodbUri) {
    try {
      await mongoose.connect(env.mongodbUri, {
        serverSelectionTimeoutMS: 1500
      });
      console.log("MongoDB connected.");
    } catch (error) {
      console.warn("MongoDB unavailable, continuing with in-memory demo store.");
    }
  }

  await store.ensureUsersSeeded();

  const app = createApp();
  app.listen(env.apiPort, "0.0.0.0", () => {
    console.log(`MediRelay API listening on 0.0.0.0:${env.apiPort}`);
  });
}

bootstrap();
