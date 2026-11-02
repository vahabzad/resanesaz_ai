export class EditorialError extends Error {
  constructor(message: string, public status = 409, public code?: string) { super(message); }
}
