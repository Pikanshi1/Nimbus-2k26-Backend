import prisma from "../../config/prisma.js";
import bcrypt from "bcrypt";

const createUser = async (name, email, hashedPassword) => {
  return prisma.user.create({
    data: { full_name: name, email, password: hashedPassword },
    select: { user_id: true, full_name: true, email: true },
  });
};

const findUserByEmail = async (email) => {
  return prisma.user.findUnique({ where: { email } });
};

const findUserByGoogleId = async (googleId) => {
  return prisma.user.findUnique({ where: { google_id: googleId } });
};

const createGoogleUser = async (name, email, googleId) => {
  return prisma.user.create({
    data: { full_name: name, email, google_id: googleId },
  });
};

const findUserById = async (userId) => {
  return prisma.user.findUnique({
    where: { user_id: userId },
    select: { user_id: true, full_name: true, email: true, virtual_balance: true, created_at: true },
  });
};

const updateUser = async (userId, { name }) => {
  return prisma.user.update({
    where: { user_id: userId },
    data: { full_name: name },
    select: { user_id: true, full_name: true, email: true, virtual_balance: true },
  });
};

const updateUserBalance = async (userId, money) => {
  return prisma.user.update({
    where: { user_id: userId },
    data: { virtual_balance: money },
    select: { user_id: true, full_name: true, email: true, virtual_balance: true },
  });
};

export {
  createUser,
  findUserByEmail,
  findUserByGoogleId,
  createGoogleUser,
  findUserById,
  updateUser,
  updateUserBalance,
};