export class ServiceError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fieldErrors?: Record<string, string>;

  constructor(
    message: string,
    status: number,
    code: string,
    fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "ServiceError";
    this.status = status;
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function inUseError(name: string, count: number, noun: string): ServiceError {
  const rows = count === 1 ? "1 expense" : `${count} expenses`;
  return new ServiceError(
    `${name} is on ${rows}, so it can't be deleted. Archive it, or move those expenses to another ${noun} first.`,
    409,
    "in_use",
  );
}

export function fieldError(
  field: string,
  message: string,
  status = 400,
  code = "invalid",
): ServiceError {
  return new ServiceError(message, status, code, { [field]: message });
}
