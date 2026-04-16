import { Pick } from "./picks";

export interface User {
  id: string;
  phone: string; // Used for Mobile Money
  password: string;
  unlockedPickIds: string[]; // Reference to Pick.id
}

// Mock User Data
export const MOCK_USER: User = {
  id: "u1",
  phone: "676828121",
  password: "1234",
  unlockedPickIds: ["1", "3"], // Currently unlocked picks
};