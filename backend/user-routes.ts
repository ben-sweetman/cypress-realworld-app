///<reference path="types.ts" />

import express from "express";
import { isEqual, pick } from "lodash/fp";

import {
  getAllUsers,
  createUser,
  updateUserById,
  getUserById,
  getUserByUsername,
  searchUsers,
  removeUserFromResults,
} from "./database-mongo";
import { User } from "../src/models/user";
import { ensureAuthenticated, validateMiddleware } from "./helpers";
import {
  shortIdValidation,
  searchValidation,
  userFieldsValidator,
  isUserValidator,
} from "./validators";
const router = express.Router();

// Routes
router.get("/", ensureAuthenticated, async (req, res) => {
  /* istanbul ignore next */
  const users = removeUserFromResults(req.user?.id!, await getAllUsers());
  res.status(200).json({ results: users });
});

router.get("/search", ensureAuthenticated, validateMiddleware([searchValidation]), async (req, res) => {
  const { q } = req.query;

  /* istanbul ignore next */
  const users = removeUserFromResults(req.user?.id!, await searchUsers(q as string));
  res.status(200).json({ results: users });
});

router.post("/", userFieldsValidator, validateMiddleware(isUserValidator), async (req, res) => {
  const userDetails: User = req.body;

  const user = await createUser(userDetails);

  res.status(201);
  res.json({ user: user });
});

router.get(
  "/:userId",
  ensureAuthenticated,
  validateMiddleware([shortIdValidation("userId")]),
  async (req, res) => {
    const { userId } = req.params;

    // Permission: account owner
    /* istanbul ignore next */
    if (!isEqual(userId, req.user?.id)) {
      return res.status(401).send({
        error: "Unauthorized",
      });
    }

    const user = await getUserById(userId);

    res.status(200);
    res.json({ user });
  }
);

router.get("/profile/:username", async (req, res) => {
  const { username } = req.params;

  const user = pick(["firstName", "lastName", "avatar"], await getUserByUsername(username));

  res.status(200);
  res.json({ user });
});

router.patch(
  "/:userId",
  ensureAuthenticated,
  userFieldsValidator,
  validateMiddleware([shortIdValidation("userId"), ...isUserValidator]),
  async (req, res) => {
    const { userId } = req.params;

    const edits: User = req.body;

    await updateUserById(userId, edits);

    res.sendStatus(204);
  }
);

export default router;
