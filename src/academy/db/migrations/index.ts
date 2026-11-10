import init from "./0001_init";
import structure from "./0002_academy_structure";

/** Ordered list of migrations. Add new files here; never edit an applied one. */
export const migrations: Array<{ name: string; sql: string }> = [
  { name: "0001_init", sql: init },
  { name: "0002_academy_structure", sql: structure },
];
