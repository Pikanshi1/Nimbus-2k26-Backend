import prisma from "../../config/prisma.js";

// CREATE OTP
export const createOTP = async (identifier, otp) => {
  return prisma.otpCode.create({
    data: {
      identifier,
      otp,
      expires_at: new Date(Date.now() + 5 * 60 * 1000)
    }
  });
};

// FIND VALID OTP
export const findOTP = async (identifier, otp) => {
  return prisma.otpCode.findFirst({
    where: {
      identifier,
      otp,
      expires_at: {
        gt: new Date()
      }
    }
  });
};

// DELETE OTP
export const deleteOTP = async (id) => {
  return prisma.otpCode.delete({
    where: { id }
  });
};

// RESEND LIMIT
export const getLastOTP = async (identifier) => {
  return prisma.otpCode.findFirst({
    where: { identifier },
    orderBy: { created_at: "desc" }
  });
};