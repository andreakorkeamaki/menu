import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 12;

export const PasswordSetupSchema = z.object({
  password: z.string()
    .min(PASSWORD_MIN_LENGTH)
    .max(128)
    .regex(/[a-z]/)
    .regex(/[A-Z]/)
    .regex(/[0-9]/),
  password_confirmation: z.string(),
  mode: z.enum(["invite", "recovery"]).default("recovery"),
}).refine((value) => value.password === value.password_confirmation, {
  path: ["password_confirmation"],
  message: "Le password non coincidono",
});
