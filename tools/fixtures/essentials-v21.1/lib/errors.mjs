export class ImportFailure extends Error {
  constructor(category, message, details = []) {
    super(message);
    this.name = "ImportFailure";
    this.category = category;
    this.details = details;
  }
}

export function fail(category, message, details) {
  throw new ImportFailure(category, message, details);
}
