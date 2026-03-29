import { findUserByEmail, findUserByPhone } from "../services/user/userService.js";

import {
  createOTP,
  findOTP,
  getLastOTP,
  deleteOTP
} from "../services/user/otpService.js";

import { sendOTPEmail } from "../utils/emailService.js";
import generateToken from "../services/generateTokenService.js";


// SEND OTP
export const sendOTP = async (req, res) => {
  try {
    const { email, phone } = req.body;

    if (!email && !phone) {
      return res.status(400).json({
        error: "Email or phone required"
      });
    }

    const identifier = email || phone;

    // RESEND LIMIT
    const lastOTP = await getLastOTP(identifier);

    if (lastOTP) {
      const diff = Date.now() - new Date(lastOTP.created_at).getTime();

      if (diff < 20000) {
        return res.status(429).json({
          error: "Wait 20 seconds before requesting new OTP"
        });
      }
    }

    // GENERATE OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // SAVE OTP
    await createOTP(identifier, otp);

    // SEND EMAIL
    if (email) await sendOTPEmail(email, otp);

    // SEND SMS
    if (phone) await sendOTPSMS(phone, otp);

    return res.json({
      success: true,
      message: "OTP sent successfully"
    });

  } catch (error) {
    console.error('sendOTP error:', error);
    return res.status(500).json({ error: "Failed to send OTP", details: error?.message || String(error) });
  }
};


// VERIFY OTP
export const verifyOTP = async (req, res) => {
  try {
    const { email, phone, otp } = req.body;

    const identifier = email || phone;

    if (!identifier || !otp) {
      return res.status(400).json({
        error: "Email/phone and OTP required"
      });
    }

    // CHECK OTP
    const record = await findOTP(identifier, otp);

    if (!record) {
      return res.status(400).json({
        error: "Invalid or expired OTP"
      });
    }

    // DELETE OTP (IMPORTANT FIX)
    await deleteOTP(record.id);

    // FIND USER
    let user = null;
    if (email) {
      user = await findUserByEmail(email);
    } else if (phone) {
      user = await findUserByPhone(phone);
    }

    if (!user) {
      return res.status(404).json({
        error: "User not found"
      });
    }

    // GENERATE TOKEN
    const token = generateToken(user.user_id);

    return res.json({
      success: true,
      message: "OTP verified successfully",
      token,
      user: {
        id: user.user_id,
        email: user.email,
        phone: user.phone,
        name: user.full_name
      }
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: "Verification failed"
    });
  }
};