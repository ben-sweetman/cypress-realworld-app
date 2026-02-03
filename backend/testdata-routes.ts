///<reference path="types.ts" />

import express from "express";
import { getAllForEntity, seedDatabase } from "./database-mongo";
import { validateMiddleware } from "./helpers";
import { isValidEntityValidator } from "./validators";
import { DbSchema } from "../src/models/db-schema";
const router = express.Router();

// Routes

//POST /testData/seed
router.post("/seed", async (req, res) => {
  await seedDatabase();
  res.sendStatus(200);
});

//GET /testData/:entity
router.get("/:entity", validateMiddleware([...isValidEntityValidator]), async (req, res) => {
  const { entity } = req.params;
  const results = await getAllForEntity(entity as keyof DbSchema);

  res.status(200);
  res.json({ results });
});

export default router;
