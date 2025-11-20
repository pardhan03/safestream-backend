import { User } from "../models/userModel.js";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";

export const Register = async (req, res) => {
    try {
        const { fullname, email, password, confirmPassword } = req.body;
        if (!fullname || !email || !password || !confirmPassword) {
            return res.status(400).json({ message: "All fields are required", success: false });
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ message: "Passwords do not match", success: false });
        }
        const user = await User.findOne({ email });
        if (user) {
            return res.status(400).json({ message: "Email already exists", success: false });
        }
        // 3. Hash Password
        const hashedPassword = await bcryptjs.hash(password, 10);
        // 4. Create User
        const newUser = await User.create({
            fullname,
            email,
            password: hashedPassword,
            role: "Editor"
        });

        // 5. Generate Token (Auto-login after register)
        const token = jwt.sign({ userId: newUser._id }, process.env.TOKEN_SECRET, { expiresIn: '1d' });

        return res.status(201).cookie("token", token, {
            httpOnly: true,
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 1 day
        }).json({
            message: "Account created successfully",
            success: true,
            user: {
                _id: newUser._id,
                fullname: newUser.fullname,
                email: newUser.email,
                role: newUser.role
            }
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Server Error", success: false });
    }
};

export const Login = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "All fields are required", success: false });
        }
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ message: "Incorrect email or password", success: false });
        }
        const isMatch = await bcryptjs.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Incorrect email or password", success: false });
        }
        // 4. Generate Token
        const token = jwt.sign({ userId: user._id }, process.env.TOKEN_SECRET, { expiresIn: '1d' });

        // 5. Send Cookie
        return res.status(200).cookie("token", token, {
            httpOnly: true,
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 
        }).json({
            message: `Welcome back ${user.fullname}`,
            success: true,
            token: token, // Sending token in body too, just in case frontend needs it for localstorage
            user: {
                _id: user._id,
                fullname: user.fullname,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Server Error", success: false });
    }
};

export const logout = (req, res) => {
    try {
        return res.status(200).cookie("token", "", { maxAge: 0 }).json({
            message: "Logged out successfully",
            success: true
        });
    } catch (error) {
        console.log(error);
    }
};