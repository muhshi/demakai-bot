import { getDB } from "./db.js";

/**
 * Session management functions
 * Accessible dari main app dan scripts
 */

export async function getSession(userId) {
  const db = getDB();
  return await db.getSession(userId);
}

export async function setSession(userId, data) {
  const db = getDB();
  return await db.createOrUpdateSession(userId, data);
}

export async function incrementMessageCount(userId) {
  const db = getDB();
  return await db.incrementMessageCount(userId);
}

export async function setMode(userId, mode, query = null) {
  const db = getDB();
  return await db.setMode(userId, mode, query);
}

export async function resetMode(userId) {
  const db = getDB();
  return await db.resetMode(userId);
}

export async function getActiveUsersCount(hours = 24) {
  const db = getDB();
  return await db.getActiveUsersCount(hours);
}

export async function cleanupOldSessions(daysInactive = 90) {
  const db = getDB();
  return await db.cleanupOldSessions(daysInactive);
}

export async function cleanupOldHistories(hoursInactive = 24) {
  const db = getDB();
  return await db.cleanupOldHistories(hoursInactive);
}
