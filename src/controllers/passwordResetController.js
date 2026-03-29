import { findUserByEmail } from "../services/user/userService.js";
import { resetUserPassword } from "../services/user/passwordResetService.js";
import {
  createOTP,
  findOTP,
  deleteOTP,
  getLastOTP,
} from "../services/user/otpService.js";
import { sendOTPEmail } from "../utils/emailService.js";

// Basic RFC-5322-inspired email regex for quick format validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/users/forgot-password
 * Body: { email }
 *
 * Sends OTP to user email (or optionally phone) for password reset.
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "email is required" });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: "Please provide a valid email address" });
    }

    const user = await findUserByEmail(email);
    const identifier = email;

    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If that account exists, an OTP has been sent.",
      });
    }

    const lastOTP = await getLastOTP(identifier);
    if (lastOTP) {
      const diff = Date.now() - new Date(lastOTP.created_at).getTime();
      if (diff < 20000) {
        return res.status(429).json({ error: "Wait 20 seconds before requesting new OTP" });
      }
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    await createOTP(identifier, otp);

    await sendOTPEmail(email, otp);

    return res.status(200).json({
      success: true,
      message: "If that account exists, an OTP has been sent.",
      identifier,
    });
  } catch (error) {
    console.error("forgotPassword error:", error);
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/users/reset-password
 * Body: { email, otp, newPassword }
 */
const resetPassword = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: "email, otp and newPassword are required" });
    }

    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: "Please provide a valid email address" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const identifier = email;

    const otpRecord = await findOTP(identifier, otp);
    if (!otpRecord) {
      return res.status(400).json({ error: "Invalid or expired OTP" });
    }

    await deleteOTP(otpRecord.id);

    const user = await findUserByEmail(email);
    if (!user) {
      return res.status(400).json({ error: "User not found" });
    }

    await resetUserPassword(user.user_id, newPassword);

    res.status(200).json({ success: true, message: "Password has been reset successfully" });
  } catch (error) {
    console.error("resetPassword error:", error);
    res.status(500).json({ error: error.message });
  }
};

export { forgotPassword, resetPassword };
