import { User } from "../models/user.modal.js";
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
        const hashedPassword = await bcryptjs.hash(password, 10);
        const newUser = await User.create({
            fullname,
            email,
            password: hashedPassword,
            role: "Editor"
        });

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
        const token = jwt.sign({ userId: user._id }, process.env.TOKEN_SECRET, { expiresIn: '1d' });

        return res.status(200).cookie("token", token, {
            httpOnly: true,
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000
        }).json({
            message: `Welcome back ${user.fullname}`,
            success: true,
            token: token,
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

export const changePassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    const userId = req.user.id;  // comes from secureRoute middleware

    if (!newPassword) {
      return res.status(400).json({ message: "New password required." });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await User.findByIdAndUpdate(userId, { password: hashedPassword });

    res.status(200).json({
      message: "Password updated successfully.",
    });

  } catch (error) {
    res.status(500).json({
      message: "Server error while changing password.",
    });
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