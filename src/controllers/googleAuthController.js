import { OAuth2Client } from "google-auth-library";
import { createGoogleUser, findUserByEmail, findUserByGoogleId } from "../services/user/userService.js";
import generateToken from "../services/generateTokenService.js";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * POST /api/users/auth/google
 * Body: { idToken: "<Firebase or Google credential idToken>" }
 *
 * Verifies the Google ID token, then either creates a new user or logs
 * in an existing one, returning a JWT for subsequent protected requests.
 */
const googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: "idToken is required" });
    }

    // Verify the Google ID token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { sub: googleId, email, name } = payload;

    // Check if user already exists by google_id
    let user = await findUserByGoogleId(googleId);

    if (!user) {
      // Also check if the email exists (edge case: user registered via email before)
      const existing = await findUserByEmail(email);
      if (existing) {
        return res.status(409).json({
          error: "An account with this email already exists. Please log in with email/password.",
        });
      }

      // Create a new user using Google credentials (no password)
      user = await createGoogleUser(name, email, googleId);
    }

    const token = generateToken(user.user_id);

    res.json({
      success: true,
      message: "Google authentication successful",
      token,
      user: {
        id: user.user_id,
        name: user.full_name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error("Google auth error:", error.message);
    res.status(401).json({ error: "Google authentication failed: " + error.message });
  }
};

export { googleAuth };
