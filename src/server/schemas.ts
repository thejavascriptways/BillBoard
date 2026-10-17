import { z } from "zod";

export const expenseBodySchema = z.object({
  expenseDate: z.string(),
  propertyId: z.string().min(1),
  categoryId: z.string().min(1),
  payee: z.string(),
  amount: z.union([z.string(), z.number()]),
  paymentMethodId: z.string().min(1),
  notes: z.string().nullable().optional(),
});

export const propertyCreateSchema = z.object({
  name: z.string(),
  address: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const propertyPatchSchema = z
  .object({
    name: z.string().optional(),
    address: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "Nothing to change.",
  });

export const categoryCreateSchema = z.object({
  name: z.string(),
});

export const categoryPatchSchema = z
  .object({
    name: z.string().optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "Nothing to change.",
  });

export const paymentMethodCreateSchema = z.object({
  nickname: z.string(),
  last4: z.string().nullable().optional(),
});

export const paymentMethodPatchSchema = z
  .object({
    nickname: z.string().optional(),
    last4: z.string().nullable().optional(),
    archived: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((item) => item !== undefined), {
    message: "Nothing to change.",
  });

export const reorderSchema = z.object({
  ids: z.array(z.string().min(1)),
});

export const reassignSchema = z.object({
  toId: z.string().min(1),
});

export const loginBodySchema = z.object({
  password: z.string(),
});
