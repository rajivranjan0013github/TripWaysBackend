import { Router } from "express";
import { getUser, updateUser, deleteUser } from "../controllers/userController.js";

const router = Router();

router.get("/:userID", getUser);
router.post("/:userID", updateUser);
router.delete("/:userID", deleteUser);

export default router;
