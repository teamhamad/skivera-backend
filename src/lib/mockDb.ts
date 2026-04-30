import { randomUUID } from "node:crypto";

export type MockUser = {
  userId: string;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: number;
};

type StoredNeuralProfile = {
  userId: string;
  profile: unknown;
  updatedAt: number;
};

const usersByEmail = new Map<string, MockUser>();
const neuralProfileByUserId = new Map<string, StoredNeuralProfile>();
const vaultByUserId = new Map<string, unknown[]>();

export const mockDb = {
  createUser(input: { email: string; passwordHash: string; name: string }) {
    const email = input.email.toLowerCase().trim();
    if (usersByEmail.has(email)) return null;
    const user: MockUser = {
      userId: randomUUID(),
      email,
      passwordHash: input.passwordHash,
      name: input.name,
      createdAt: Date.now(),
    };
    usersByEmail.set(email, user);
    return user;
  },
  getUserByEmail(email: string) {
    return usersByEmail.get(email.toLowerCase().trim()) ?? null;
  },
  saveNeuralProfile(userId: string, profile: unknown) {
    neuralProfileByUserId.set(userId, { userId, profile, updatedAt: Date.now() });
  },
  getNeuralProfile(userId: string) {
    return neuralProfileByUserId.get(userId)?.profile ?? null;
  },
  listVault(userId: string) {
    return vaultByUserId.get(userId) ?? [];
  },
  saveVaultItem(userId: string, item: { id: string }) {
    const current = vaultByUserId.get(userId) ?? [];
    if (current.some((entry: any) => entry.id === item.id)) return current;
    const next = [item, ...current];
    vaultByUserId.set(userId, next);
    return next;
  },
};

