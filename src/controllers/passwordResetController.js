import { findUserByEmail } from "../services/user/userService.js";
import {
  createPasswordResetToken,
  findUserByResetToken,
  resetUserPassword,
} from "../services/user/passwordResetService.js";

/**
 * POST /api/users/forgot-password
 * Body: { email }
 *
 * Generates a reset token and returns it in the response.
 * NOTE: In production, send this token via email/SMS instead of returning it in the response.
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const user = await findUserByEmail(email);

    // Always respond with 200 to prevent email enumeration attacks
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If that email is registered, a reset token has been sent.",
      });
    }

    const token = await createPasswordResetToken(user.user_id);

    // TODO: Replace this with email delivery (e.g., via SendGrid / Nodemailer)
    res.status(200).json({
      success: true,
      message: "Password reset token generated. Deliver this token to the user securely.",
      resetToken: token, // REMOVE THIS IN PRODUCTION — send via email instead
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/**
 * POST /api/users/reset-password
 * Body: { token, newPassword }
 */
const resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ error: "token and newPassword are required" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const user = await findUserByResetToken(token);

    if (!user) {
      return res.status(400).json({ error: "Invalid or expired reset token" });
    }

    await resetUserPassword(user.user_id, newPassword);

    res.status(200).json({ success: true, message: "Password has been reset successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export { forgotPassword, resetPassword };
