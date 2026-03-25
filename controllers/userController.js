import { User } from "../models/user.modal.js";
import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";

export const Register = async (req, res) => {
    try {
        const { fullname, email, password, confirmPassword, organizationId } = req.body;
        if (!fullname || !email || !password || !confirmPassword || !organizationId) {
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
            role: "Editor",
            organizationId
        });

        const token = jwt.sign({ userId: newUser._id }, process.env.TOKEN_SECRET, { expiresIn: '1d' });

        return res.status(201).json({
            message: "Account created successfully",
            success: true,
            token,
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

        return res.status(200).json({
            message: `Welcome back ${user.fullname}`,
            success: true,
            token,
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
        const userId = req.user._id; // comes from secureRoute middleware

        if (!newPassword) {
            return res.status(400).json({ message: "New password required.", success: false });
        }

        const hashedPassword = await bcryptjs.hash(newPassword, 10);

        await User.findByIdAndUpdate(userId, { password: hashedPassword });

        res.status(200).json({
            message: "Password updated successfully.",
            success: true
        });

    } catch (error) {
        console.log(error);
        res.status(500).json({
            message: "Server error while changing password.",
            success: false
        });
    }
};

export const logout = (req, res) => {
    try {
        // With localStorage-based auth, logout is handled on the client side
        // This endpoint just confirms the logout action
        return res.status(200).json({
            message: "Logged out successfully",
            success: true
        });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: "Logout failed", success: false });
    }
};

export const getAllUsersForAdmin = async (req, res) => {
    try {
        // tenant isolation: only return users in the same org
        const users = await User.find({ organizationId: req.user.organizationId })
            .select("-password")
            .lean();
        return res.json({ success: true, users });
    } catch (err) {
        console.error("getAllUsersForAdmin:", err);
        return res.status(500).json({ success: false, message: "Server error" });
    }
};

export const updateUserRole = async (req, res) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;
      const allowed = ["Viewer", "Editor", "Admin"];
      if (!allowed.includes(role)) {
        return res.status(400).json({ success: false, message: "Invalid role" });
      }
      const targetUser = await User.findById(userId);
      if (!targetUser) {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      // tenant isolation
      if (String(targetUser.organizationId) !== String(req.user.organizationId)) {
        return res.status(403).json({ success: false, message: "Forbidden" });
      }
      // Safety: prevent demoting the last active Admin in tenant
      const isDemotingAdminToNonAdmin =
        targetUser.role === "Admin" && role !== "Admin";
      if (isDemotingAdminToNonAdmin) {
        const remainingAdmins = await User.countDocuments({
          organizationId: req.user.organizationId,
          role: "Admin",
          isActive: true,
          _id: { $ne: targetUser._id },
        });
        if (remainingAdmins === 0) {
          return res.status(400).json({
            success: false,
            message: "Cannot demote the last active Admin in this tenant",
          });
        }
      }
      targetUser.role = role;
      await targetUser.save();
      return res.json({
        success: true,
        user: {
          _id: targetUser._id,
          fullname: targetUser.fullname,
          email: targetUser.email,
          role: targetUser.role,
          organizationId: targetUser.organizationId,
          isActive: targetUser.isActive,
        },
      });
    } catch (err) {
      console.error("updateUserRole:", err);
      return res.status(500).json({ success: false, message: "Server error" });
    }
  };