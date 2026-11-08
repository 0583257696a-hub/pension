import init from "./0001_init";

/** Ordered list of migrations. Add new files here; never edit an applied one. */
export const migrations: Array<{ name: string; sql: string }> = [
  { name: "0001_init", sql: init },
];
