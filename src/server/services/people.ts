import type { Person } from "@prisma/client";

import { prisma } from "@/server/db";
import { ServiceError } from "@/server/errors";
import { getHousehold } from "@/server/services/household";
import { cleanOptional, cleanRequired } from "@/server/text";

export type PersonDTO = {
  id: string;
  name: string;
  notes: string | null;
  archived: boolean;
};

function toDTO(person: Person): PersonDTO {
  return { id: person.id, name: person.name, notes: person.notes, archived: person.archivedAt != null };
}

export async function listPeople(): Promise<PersonDTO[]> {
  const household = await getHousehold();
  const rows = await prisma.person.findMany({
    where: { householdId: household.id },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toDTO);
}

export async function createPerson(input: { name: string; notes?: string | null }): Promise<PersonDTO> {
  const household = await getHousehold();
  const name = cleanRequired("name", input.name, "name", 60);
  const duplicate = await prisma.person.findFirst({
    where: { householdId: household.id, name: { equals: name, mode: "insensitive" } },
  });
  if (duplicate) throw new ServiceError("That person is already on the list.", 409, "conflict");
  const max = await prisma.person.aggregate({ where: { householdId: household.id }, _max: { sortOrder: true } });
  const created = await prisma.person.create({
    data: {
      householdId: household.id,
      name,
      notes: cleanOptional("notes", input.notes, 200),
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  return toDTO(created);
}

export async function updatePerson(id: string, input: { name?: string; notes?: string | null; archived?: boolean }): Promise<PersonDTO> {
  const household = await getHousehold();
  const existing = await prisma.person.findFirst({ where: { id, householdId: household.id } });
  if (!existing) throw new ServiceError("Person not found.", 404, "not_found");
  const name = input.name === undefined ? existing.name : cleanRequired("name", input.name, "name", 60);
  let archivedAt = existing.archivedAt;
  if (input.archived === true) archivedAt = existing.archivedAt ?? new Date();
  if (input.archived === false) archivedAt = null;
  const updated = await prisma.person.update({
    where: { id },
    data: { name, notes: input.notes === undefined ? existing.notes : cleanOptional("notes", input.notes, 200), archivedAt },
  });
  return toDTO(updated);
}

export async function deletePerson(id: string): Promise<void> {
  const household = await getHousehold();
  const existing = await prisma.person.findFirst({ where: { id, householdId: household.id } });
  if (!existing) throw new ServiceError("Person not found.", 404, "not_found");
  const [bills, cards] = await Promise.all([
    prisma.bill.count({ where: { personId: id } }),
    prisma.creditCard.count({ where: { cardholderId: id } }),
  ]);
  if (bills + cards > 0) throw new ServiceError("That person is on a bill or card. Archive them instead.", 409, "in_use");
  await prisma.person.delete({ where: { id } });
}
