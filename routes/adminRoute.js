import express from "express";
import secureRoute from "../middlewares/secureRoute.js";
import { permit } from "../middlewares/permit.js";
import { getAllUsersForAdmin, updateUserRole } from "../controllers/userController.js";


const router = express.Router();

router.get("/users", secureRoute, permit("Admin"), getAllUsersForAdmin);
router.patch("/users/:userId/role", secureRoute, permit("Admin"), updateUserRole);

export default router;