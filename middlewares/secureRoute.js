import jwt from "jsonwebtoken";
import { User } from "../models/user.modal.js";

const secureRoute = async (req, res, next) => {
    try {
        let token = null;

        // 1. Check Authorization header (primary method - from localStorage)
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.split(" ")[1];
        }

        // 2. Check query parameter (fallback for video streaming - HTML video can't send headers)
        if (!token && req.query.token) {
            token = req.query.token;
        }

        if (!token) {
            return res.status(401).json({ error: "No token, authorization denied" });
        }

        const decoded = jwt.verify(token, process.env.TOKEN_SECRET);
        if (!decoded) {
            return res.status(401).json({ error: "Invalid Token" });
        }

        const user = await User.findById(decoded.userId).select("-password");
        if (!user) {
            return res.status(401).json({ error: "User does not exist" });
        }

        req.user = user;
        next();

    } catch (error) {
        console.log("Error in secureRoute: ", error.message);
        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({ error: "Invalid token" });
        }
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({ error: "Token expired" });
        }
        res.status(500).json({ error: "Internal server error" });
    }
};

export default secureRoute;
