import nodemailer from "nodemailer";

/**
 * Creates and returns a reusable Nodemailer transporter.
 * Uses Gmail SMTP by default — set EMAIL_USER and EMAIL_PASS in .env.
 * For other providers, change the `service` or `host`/`port` config.
 */
const createTransporter = () => {
  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS, // Use an App Password if 2FA is enabled
    },
  });
};

/**
 * Sends a password reset email to the given address.
 * @param {string} toEmail - Recipient email address.
 * @param {string} resetToken - The plain reset token to include in the email.
 */
const sendPasswordResetEmail = async (toEmail, resetToken) => {
  const transporter = createTransporter();

  const resetLink = `${process.env.FRONTEND_URL || "http://localhost:3000"}/reset-password?token=${resetToken}`;

  const mailOptions = {
    from: `"Nimbus 2k26" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Password Reset Request — Nimbus 2k26",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #333;">Password Reset Request</h2>
        <p>Hi there,</p>
        <p>We received a request to reset the password for your <strong>Nimbus 2k26</strong> account.</p>
        <p>Click the button below to set a new password. This link is valid for <strong>15 minutes</strong>.</p>
        <a href="${resetLink}" style="display: inline-block; margin: 16px 0; padding: 12px 24px; background-color: #4f46e5; color: #fff; text-decoration: none; border-radius: 6px; font-size: 16px;">
          Reset Password
        </a>
        <p>Or copy and paste this link into your browser:</p>
        <p style="word-break: break-all; color: #555;">${resetLink}</p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 24px 0;" />
        <p style="font-size: 13px; color: #999;">If you did not request a password reset, please ignore this email. Your password will remain unchanged.</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

export { sendPasswordResetEmail };
