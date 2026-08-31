import assert from "node:assert/strict";
import { filterInputListOptions, InputListOption } from "../renderer/components/input-list/input-list-options";

const options: InputListOption[] = [
  { value: "54", label: "Brasil", detail: "Country · BRA · objectId 54", searchText: "NationName_54 BRA 54" },
  { value: "14", label: "Inglaterra", detail: "Country · ENG · objectId 14", searchText: "NationName_14 ENG 14" },
  { value: "70", label: "UEFA", detail: "Confederation · UEFA · objectId 70", searchText: "European FA UEFA 70" }
];

assert.equal(filterInputListOptions(options, ""), options);
assert.deepEqual(filterInputListOptions(options, "uefa").map((option) => option.value), ["70"]);
assert.deepEqual(filterInputListOptions(options, "54").map((option) => option.value), ["54"]);
assert.deepEqual(filterInputListOptions(options, "nationname_14").map((option) => option.value), ["14"]);
assert.deepEqual(filterInputListOptions(options, "brasil").map((option) => option.value), ["54"]);

console.log("InputList searchable option tests passed.");
