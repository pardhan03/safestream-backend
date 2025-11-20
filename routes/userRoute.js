import express from "express";
import { Login, Register, changePassword, logout } from "../controllers/userController.js";
import secureRoute from "../middlewares/secureRoute.js";

const router = express.Router();

router.route("/register").post(Register);
router.route("/login").post(Login);
router.route("/logout").post(logout);
router.put("/change-password", secureRoute, changePassword);


router.get("/me", secureRoute, (req, res) => {
  res.json({ user: req.user });
});


export default router;