///<reference path="types.ts" />

import express from "express";

import { getBankTransfersByUserId } from "./database-mongo";
import { ensureAuthenticated } from "./helpers";
const router = express.Router();

// Routes

//GET /bankTransfers (scoped-user)
router.get("/", ensureAuthenticated, async (req, res) => {
  /* istanbul ignore next */
  const transfers = await getBankTransfersByUserId(req.user?.id!);

  res.status(200);
  res.json({ transfers });
});

export default router;
