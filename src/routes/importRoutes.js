import { Router } from "express";
import { getUserImports, getImportById } from "../controllers/importController.js";

const router = Router();

router.get("/user/:userID", getUserImports);
router.get("/:importID", getImportById);

export default router;
