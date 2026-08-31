import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readDatabaseWithDescriptor } from "../core/databaseReader";
import { saveDatabaseProject } from "../core/databaseWriter";
import type { DbProject, TableDescriptor } from "../shared/types";

const descriptor: TableDescriptor = {
  name: "test_table",
  shortName: "test",
  fields: [{
    name: "value",
    shortName: "valu",
    kind: "integer",
    rangeLow: 0,
    rangeHigh: 255,
    depth: 8
  }]
};

function crcDb11(bytes: Buffer): number {
  let crc = -1;
  for (const byte of bytes) {
    crc = (crc ^ (byte << 24)) | 0;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = ((crc << 1) ^ (crc < 0 ? 0x04c11db7 : 0)) | 0;
    }
  }
  return crc >>> 0;
}

function makeFixture(): Buffer {
  const header = Buffer.alloc(36);
  Buffer.from([0x44, 0x42, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00]).copy(header);
  header.writeUInt32LE(1, 16);
  header.write("test", 24, "latin1");
  header.writeUInt32LE(0, 28);

  const table = Buffer.alloc(58);
  table.writeUInt32LE(1, 4);
  table.writeUInt32LE(8, 8);
  table.writeUInt32LE(0, 12);
  table.writeUInt16LE(2, 16);
  table.writeUInt16LE(1, 18);
  table.writeUInt8(1, 24);
  table.writeUInt32LE(3, 36);
  table.writeUInt32LE(0, 40);
  table.write("valu", 44, "latin1");
  table.writeUInt32LE(8, 48);
  table[52] = 5;
  table[53] = 6;
  table.writeUInt32LE(crcDb11(table.subarray(0, 32)), 32);
  table.writeUInt32LE(crcDb11(table.subarray(36, 54)), 54);

  const database = Buffer.concat([header, table]);
  database.writeUInt32LE(database.length, 8);
  database.writeUInt32LE(crcDb11(database.subarray(0, 20)), 20);
  database.writeUInt32LE(crcDb11(database.subarray(24, 32)), 32);
  return database;
}

function assertStoredCrc(buffer: Buffer, start: number, end: number, storedAt: number): void {
  assert.equal(buffer.readUInt32LE(storedAt), crcDb11(buffer.subarray(start, end)));
}

const fixture = makeFixture();
const initialRead = readDatabaseWithDescriptor(fixture, [descriptor]);
assert.equal(initialRead.mode, "descriptor");
assert.deepEqual(initialRead.tables[0].rows, [["5"], ["6"]], "reader must retain records beyond validRecordsCount like DB Master");

const temporaryFolder = mkdtempSync(join(tmpdir(), "dbm-studio-database-io-"));
const databasePath = join(temporaryFolder, "fixture.db");
try {
  writeFileSync(databasePath, fixture);
  const table = initialRead.tables[0];
  table.rows = [["7"], ["8"], ["9"]];
  table.changed = true;
  const project: DbProject = {
    title: "fixture.db",
    sourceKind: "database",
    dbPath: databasePath,
    descriptors: [descriptor],
    tables: [table],
    warnings: [],
    binaryReadMode: "descriptor",
    databaseWritable: true
  };

  const result = saveDatabaseProject(project);
  assert.equal(result.tablesWritten, 1);
  assert.deepEqual(readFileSync(`${databasePath}.bak`), fixture);

  const saved = readFileSync(databasePath);
  assert.equal(saved.readUInt32LE(8), saved.length);
  assertStoredCrc(saved, 0, 20, 20);
  assertStoredCrc(saved, 24, 32, 32);
  const tableStart = 36;
  assert.equal(saved.readUInt16LE(tableStart + 16), 3);
  assert.equal(saved.readUInt16LE(tableStart + 18), 3);
  assertStoredCrc(saved, tableStart, tableStart + 32, tableStart + 32);
  const recordsCrcOffset = tableStart + 36 + 16 + 3;
  assertStoredCrc(saved, tableStart + 36, recordsCrcOffset, recordsCrcOffset);

  const savedRead = readDatabaseWithDescriptor(saved, [descriptor]);
  assert.deepEqual(savedRead.tables[0].rows, [["7"], ["8"], ["9"]]);
  console.log("databaseIO.test.ts: all tests passed");
} finally {
  rmSync(temporaryFolder, { recursive: true, force: true });
}
