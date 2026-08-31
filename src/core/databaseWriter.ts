import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import type { DataTable, DbProject, FieldDescriptor, LocalizationProject, TableDescriptor } from "../shared/types";

const databaseHeader = Buffer.from([0x44, 0x42, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00]);
const emptyCompressedStringOffset = -1;
const noCompressedStringBlockLength = 0xffffffff;
const tableHeaderSize = 36;

interface WritableField extends FieldDescriptor {
  shortName: string;
  bitOffset: number;
  depth: number;
  dbFieldType: number;
}

interface TableReference {
  shortName: string;
  offset: number;
  offsetPosition: number;
  tableStart: number;
  layout?: TableWriteLayout;
}

interface TableWriteLayout {
  name: string;
  tableStart: number;
  tableEnd: number;
  recordsCountOffset: number;
  validRecordsCountOffset: number;
  compressedStringLengthOffset: number;
  storedCompressedStringLength: number;
  compressedStringLength: number;
  recordsCount: number;
  validRecordsCount: number;
  recordSize: number;
  fields: WritableField[];
  recordsOffset: number;
  recordsCrcOffset: number;
  hasCompressedStrings: boolean;
}

interface WritableLayoutParse {
  databaseStart: number;
  databaseEnd: number;
  databaseSize: number;
  tablesStartOffset: number;
  directoryCrcOffset: number;
  tableRefs: TableReference[];
  layouts: TableWriteLayout[];
  warnings: string[];
}

interface SaveDatabaseResult {
  filePath: string;
  backupPath?: string;
  warnings: string[];
  tablesWritten: number;
}

interface HuffmanCodec {
  tree: Buffer;
  codes: Array<number[] | undefined>;
  raw: boolean;
}

function readShortName(buffer: Buffer, offset: number): string {
  return buffer.subarray(offset, offset + 4).toString("latin1");
}

function roundUp(value: number, alignment: number): number {
  return (value + alignment - 1) & ~(alignment - 1);
}

function normalizeCompressedStringLength(length: number): number {
  return length === noCompressedStringBlockLength ? 0 : length;
}

function computeDbCrc(bytes: Buffer): number {
  let crc = -1;
  for (const byte of bytes) {
    crc = (crc ^ (byte << 24)) | 0;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = ((crc << 1) ^ (crc < 0 ? 0x04c11db7 : 0)) | 0;
    }
  }
  return crc >>> 0;
}

function descriptorMaps(descriptors: TableDescriptor[]): Map<string, TableDescriptor> {
  const byShortName = new Map<string, TableDescriptor>();
  for (const descriptor of descriptors) {
    if (descriptor.shortName) {
      byShortName.set(descriptor.shortName, descriptor);
    }
  }
  return byShortName;
}

function kindFromDbFieldType(dbFieldType: number, xmlField?: FieldDescriptor): FieldDescriptor["kind"] {
  switch (dbFieldType) {
    case 0:
      return "string";
    case 3:
      return "integer";
    case 4:
      return "float";
    case 13:
      return "shortCompressedString";
    case 14:
      return "longCompressedString";
    default:
      return xmlField?.kind ?? "unknown";
  }
}

function parseWritableLayouts(dbBuffer: Buffer, descriptors: TableDescriptor[]): WritableLayoutParse {
  const databaseStart = dbBuffer.indexOf(databaseHeader);
  if (databaseStart < 0) {
    throw new Error("Raw PC FIFA database header was not found.");
  }
  if (databaseStart + 24 > dbBuffer.length) {
    throw new Error("Database header is truncated.");
  }

  const warnings: string[] = [];
  const databaseSize = dbBuffer.readUInt32LE(databaseStart + 8);
  const databaseEnd = databaseStart + databaseSize;
  if (databaseSize < 24 || databaseEnd > dbBuffer.length) {
    throw new Error("Database size header is invalid.");
  }

  const tableCount = dbBuffer.readUInt32LE(databaseStart + 16);
  let cursor = databaseStart + 24;
  const tableRefs: TableReference[] = [];
  for (let index = 0; index < tableCount; index += 1) {
    if (cursor + 8 > databaseEnd) {
      throw new Error("Database table directory is truncated.");
    }
    tableRefs.push({
      shortName: readShortName(dbBuffer, cursor),
      offset: dbBuffer.readUInt32LE(cursor + 4),
      offsetPosition: cursor + 4,
      tableStart: 0
    });
    cursor += 8;
  }

  const directoryCrcOffset = cursor;
  if (directoryCrcOffset + 4 > databaseEnd) {
    throw new Error("Database table directory CRC is truncated.");
  }
  const tablesStartOffset = directoryCrcOffset + 4;
  for (const tableRef of tableRefs) {
    tableRef.tableStart = tablesStartOffset + tableRef.offset;
  }

  const tableStarts = tableRefs
    .map((tableRef) => tableRef.tableStart)
    .filter((offset) => offset >= tablesStartOffset && offset < databaseEnd)
    .sort((left, right) => left - right);
  const nextTableStart = (tableStart: number): number => tableStarts.find((offset) => offset > tableStart) ?? databaseEnd;
  const descriptorsByShortName = descriptorMaps(descriptors);
  const layouts: TableWriteLayout[] = [];

  for (const tableRef of tableRefs) {
    const descriptor = descriptorsByShortName.get(tableRef.shortName);
    const tableStart = tableRef.tableStart;
    const tableEnd = nextTableStart(tableStart);
    const tableName = descriptor?.name ?? tableRef.shortName;
    if (tableStart < tablesStartOffset || tableStart + tableHeaderSize > tableEnd || tableEnd > databaseEnd) {
      warnings.push(`${tableName}: table boundaries are invalid; its bytes will be preserved unchanged.`);
      continue;
    }

    const recordSize = dbBuffer.readUInt32LE(tableStart + 4);
    const compressedStringLengthOffset = tableStart + 12;
    const storedCompressedStringLength = dbBuffer.readUInt32LE(compressedStringLengthOffset);
    const compressedStringLength = normalizeCompressedStringLength(storedCompressedStringLength);
    const recordsCountOffset = tableStart + 16;
    const recordsCount = dbBuffer.readUInt16LE(recordsCountOffset);
    const validRecordsCountOffset = tableStart + 18;
    const validRecordsCount = dbBuffer.readUInt16LE(validRecordsCountOffset);
    const fieldsCount = dbBuffer.readUInt8(tableStart + 24);
    let fieldCursor = tableStart + tableHeaderSize;
    const xmlFieldsByShortName = new Map(
      (descriptor?.fields ?? []).filter((field) => field.shortName).map((field) => [field.shortName as string, field])
    );
    const fields: WritableField[] = [];

    for (let fieldIndex = 0; fieldIndex < fieldsCount; fieldIndex += 1) {
      if (fieldCursor + 16 > tableEnd) {
        warnings.push(`${tableName}: field directory is truncated; its bytes will be preserved unchanged.`);
        fields.length = 0;
        break;
      }
      const dbFieldType = dbBuffer.readUInt32LE(fieldCursor);
      const bitOffset = dbBuffer.readUInt32LE(fieldCursor + 4);
      const shortName = readShortName(dbBuffer, fieldCursor + 8);
      const depth = dbBuffer.readUInt32LE(fieldCursor + 12);
      const xmlField = xmlFieldsByShortName.get(shortName);
      fields.push({
        name: xmlField?.name ?? shortName,
        shortName,
        kind: kindFromDbFieldType(dbFieldType, xmlField),
        rangeLow: xmlField?.rangeLow ?? 0,
        rangeHigh: xmlField?.rangeHigh ?? -1,
        depth,
        bitOffset,
        dbFieldType,
        raw: xmlField?.raw
      });
      fieldCursor += 16;
    }

    if (fields.length !== fieldsCount) {
      continue;
    }
    fields.sort((left, right) => left.bitOffset - right.bitOffset);
    const recordsOffset = fieldCursor;
    const paddedCompressedLength = compressedStringLength > 0 ? roundUp(compressedStringLength, 8) : 0;
    const recordsCrcOffset = recordsOffset + recordsCount * recordSize + paddedCompressedLength;
    if (recordsCrcOffset + 4 > tableEnd) {
      warnings.push(`${tableName}: records or compressed strings exceed the table boundary; its bytes will be preserved unchanged.`);
      continue;
    }

    const layout: TableWriteLayout = {
      name: tableName,
      tableStart,
      tableEnd,
      recordsCountOffset,
      validRecordsCountOffset,
      compressedStringLengthOffset,
      storedCompressedStringLength,
      compressedStringLength,
      recordsCount,
      validRecordsCount,
      recordSize,
      fields,
      recordsOffset,
      recordsCrcOffset,
      hasCompressedStrings: fields.some(isCompressedStringField)
    };
    tableRef.layout = layout;
    layouts.push(layout);
    if (!descriptor) {
      warnings.push(`Unknown DB table shortname ${tableRef.shortName}; its data was preserved.`);
    }
  }

  return {
    databaseStart,
    databaseEnd,
    databaseSize,
    tablesStartOffset,
    directoryCrcOffset,
    tableRefs,
    layouts,
    warnings
  };
}

function parseInteger(value: string, context: string): bigint {
  const normalized = value.trim();
  if (!/^-?\d+$/.test(normalized)) {
    throw new Error(`${context}: invalid integer value "${value}".`);
  }
  return BigInt(normalized);
}

function writeUnsignedBitsLE(record: Buffer, bitOffset: number, depth: number, value: bigint, context: string): void {
  if (depth <= 0 || bitOffset < 0 || bitOffset + depth > record.length * 8) {
    throw new Error(`${context}: field is outside the record buffer.`);
  }
  if (value < 0n || value >= (1n << BigInt(depth))) {
    throw new Error(`${context}: value does not fit in ${depth} bits.`);
  }

  for (let bit = 0; bit < depth; bit += 1) {
    const targetBit = bitOffset + bit;
    const mask = 1 << (targetBit & 7);
    const byteIndex = targetBit >> 3;
    if (((value >> BigInt(bit)) & 1n) === 1n) {
      record[byteIndex] |= mask;
    } else {
      record[byteIndex] &= ~mask;
    }
  }
}

function encodeFixedString(value: string, byteLength: number): Buffer {
  const output = Buffer.alloc(byteLength);
  Buffer.from(value, "utf8").subarray(0, byteLength).copy(output);
  return output;
}

function writeDbField(record: Buffer, field: WritableField, value: string, context: string): void {
  switch (field.dbFieldType) {
    case 0: {
      const byteOffset = field.bitOffset >> 3;
      const byteLength = Math.floor(field.depth / 8);
      if (byteOffset + byteLength > record.length) {
        throw new Error(`${context}: string field is outside the record buffer.`);
      }
      encodeFixedString(value, byteLength).copy(record, byteOffset);
      return;
    }
    case 3: {
      const raw = parseInteger(value, context) - BigInt(field.rangeLow);
      writeUnsignedBitsLE(record, field.bitOffset, field.depth, raw, context);
      return;
    }
    case 4: {
      const byteOffset = field.bitOffset >> 3;
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        throw new Error(`${context}: invalid float value "${value}".`);
      }
      if (byteOffset + 4 > record.length) {
        throw new Error(`${context}: float field is outside the record buffer.`);
      }
      record.writeFloatLE(numeric, byteOffset);
      return;
    }
    case 13:
    case 14:
      throw new Error(`${context}: compressed string must be written through its table codec.`);
    default: {
      const raw = parseInteger(value, context);
      writeUnsignedBitsLE(record, field.bitOffset, field.depth, raw, context);
    }
  }
}

function isCompressedStringField(field: WritableField): boolean {
  return field.dbFieldType === 13 || field.dbFieldType === 14;
}

function compressedStringBytes(value: string, longString: boolean, context: string): Buffer {
  const bytes = Buffer.from(value, "utf8");
  const maximum = longString ? 0xffff : 0xff;
  if (bytes.length > maximum) {
    throw new Error(`${context}: compressed string is longer than ${maximum} bytes.`);
  }
  return bytes;
}

function readExistingHuffmanCodec(dbBuffer: Buffer, layout: TableWriteLayout): HuffmanCodec | undefined {
  if (!layout.hasCompressedStrings || layout.recordsCount === 0 || layout.compressedStringLength <= 0) {
    return undefined;
  }

  const blockOffset = layout.recordsOffset + layout.recordsCount * layout.recordSize;
  const blockEnd = blockOffset + layout.compressedStringLength;
  if (blockEnd > layout.tableEnd) {
    return undefined;
  }

  let treeSize = Number.MAX_SAFE_INTEGER;
  for (let rowIndex = 0; rowIndex < layout.recordsCount; rowIndex += 1) {
    const recordOffset = layout.recordsOffset + rowIndex * layout.recordSize;
    const record = dbBuffer.subarray(recordOffset, recordOffset + layout.recordSize);
    for (const field of layout.fields.filter(isCompressedStringField)) {
      const byteOffset = field.bitOffset >> 3;
      if (byteOffset + 4 > record.length) {
        continue;
      }
      const stringOffset = record.readInt32LE(byteOffset);
      if (stringOffset >= 0 && stringOffset < treeSize) {
        treeSize = stringOffset;
      }
    }
  }

  if (treeSize === Number.MAX_SAFE_INTEGER || treeSize > layout.compressedStringLength || treeSize % 4 !== 0) {
    return undefined;
  }
  if (treeSize === 0) {
    return { tree: Buffer.alloc(0), codes: [], raw: true };
  }

  const tree = Buffer.from(dbBuffer.subarray(blockOffset, blockOffset + treeSize));
  const nodeCount = tree.length / 4;
  const codes: Array<number[] | undefined> = [];
  const visiting = new Set<number>();
  const visit = (nodeIndex: number, prefix: number[]): boolean => {
    if (nodeIndex < 0 || nodeIndex >= nodeCount || visiting.has(nodeIndex)) {
      return false;
    }
    visiting.add(nodeIndex);
    for (let direction = 0; direction < 2; direction += 1) {
      const offset = nodeIndex * 4 + direction * 2;
      const childIndex = tree[offset];
      const code = [...prefix, direction];
      if (childIndex === 0) {
        const byte = tree[offset + 1];
        const existing = codes[byte];
        if (existing && existing.join("") !== code.join("")) {
          return false;
        }
        codes[byte] = code;
      } else if (!visit(childIndex, code)) {
        return false;
      }
    }
    visiting.delete(nodeIndex);
    return true;
  };

  return visit(0, []) ? { tree, codes, raw: false } : undefined;
}

function encodeCompressedString(
  bytes: Buffer,
  longString: boolean,
  codec: HuffmanCodec,
  context: string,
  substitutedBytes: Set<number>
): Buffer {
  const prefixLength = longString ? 2 : 1;
  if (codec.raw) {
    const output = Buffer.alloc(prefixLength + bytes.length);
    if (longString) {
      output.writeUInt16BE(bytes.length, 0);
    } else {
      output.writeUInt8(bytes.length, 0);
    }
    bytes.copy(output, prefixLength);
    return output;
  }

  const codes: number[][] = [];
  let bitLength = 0;
  for (const byte of bytes) {
    const code = codec.codes[byte] ?? codec.codes[0x20];
    if (!code) {
      throw new Error(`${context}: byte ${byte} is missing from the Huffman tree and no space fallback exists.`);
    }
    if (!codec.codes[byte]) {
      substitutedBytes.add(byte);
    }
    codes.push(code);
    bitLength += code.length;
  }

  // FifaLibrary always emits one final Huffman byte, including at an exact byte boundary.
  const output = Buffer.alloc(prefixLength + Math.floor(bitLength / 8) + 1);
  if (longString) {
    output.writeUInt16BE(bytes.length, 0);
  } else {
    output.writeUInt8(bytes.length, 0);
  }
  let bitIndex = 0;
  for (const code of codes) {
    for (const bit of code) {
      if (bit === 1) {
        output[prefixLength + (bitIndex >> 3)] |= 1 << (7 - (bitIndex & 7));
      }
      bitIndex += 1;
    }
  }
  return output;
}

function writeCompressedStringOffset(record: Buffer, field: WritableField, offset: number, context: string): void {
  const byteOffset = field.bitOffset >> 3;
  if (byteOffset + 4 > record.length) {
    throw new Error(`${context}: compressed string offset is outside the record buffer.`);
  }
  record.writeInt32LE(offset, byteOffset);
}

function updateTableCrcs(tableBuffer: Buffer, recordsCrcOffset: number): void {
  if (tableBuffer.length < tableHeaderSize || recordsCrcOffset + 4 > tableBuffer.length) {
    throw new Error("Cannot update CRCs for a truncated table.");
  }
  tableBuffer.writeUInt32LE(computeDbCrc(tableBuffer.subarray(0, 32)), 32);
  tableBuffer.writeUInt32LE(computeDbCrc(tableBuffer.subarray(tableHeaderSize, recordsCrcOffset)), recordsCrcOffset);
}

function normalizeUnchangedTable(dbBuffer: Buffer, layout: TableWriteLayout): Buffer {
  const localRecordsCrcOffset = layout.recordsCrcOffset - layout.tableStart;
  const outputLength = localRecordsCrcOffset + 4;
  const output = Buffer.from(dbBuffer.subarray(layout.tableStart, layout.tableStart + outputLength));
  if (layout.recordsCount === 0 && layout.hasCompressedStrings) {
    output.writeUInt32LE(noCompressedStringBlockLength, layout.compressedStringLengthOffset - layout.tableStart);
  }
  updateTableCrcs(output, localRecordsCrcOffset);
  return output;
}

function buildChangedTable(dbBuffer: Buffer, layout: TableWriteLayout, table: DataTable, warnings: string[]): Buffer {
  if (table.rows.length > 0xffff) {
    throw new Error(`${layout.name}: DB table row count exceeds the 16-bit record counter.`);
  }

  const header = Buffer.from(dbBuffer.subarray(layout.tableStart, layout.recordsOffset));
  header.writeUInt16LE(table.rows.length, layout.recordsCountOffset - layout.tableStart);
  header.writeUInt16LE(table.rows.length, layout.validRecordsCountOffset - layout.tableStart);
  const records: Buffer[] = [];
  const compressedParts: Buffer[] = [];
  const substitutedBytes = new Set<number>();
  let compressedLength = 0;
  let codec: HuffmanCodec | undefined;

  if (layout.hasCompressedStrings && table.rows.length > 0) {
    codec = readExistingHuffmanCodec(dbBuffer, layout);
    if (!codec) {
      throw new Error(`${layout.name}: the original Huffman tree could not be read.`);
    }
    compressedParts.push(codec.tree);
    compressedLength = codec.tree.length;
  }

  for (let rowIndex = 0; rowIndex < table.rows.length; rowIndex += 1) {
    const record = Buffer.alloc(layout.recordSize);
    const row = table.rows[rowIndex];
    for (let columnIndex = 0; columnIndex < layout.fields.length; columnIndex += 1) {
      const field = layout.fields[columnIndex];
      const value = row[columnIndex] ?? "";
      const context = `${layout.name} row ${rowIndex + 1}, ${field.name}`;
      if (!isCompressedStringField(field)) {
        writeDbField(record, field, value, context);
        continue;
      }
      if (value.length === 0) {
        writeCompressedStringOffset(record, field, emptyCompressedStringOffset, context);
        continue;
      }
      if (!codec) {
        throw new Error(`${layout.name}: compressed strings cannot be written without a Huffman tree.`);
      }
      const bytes = compressedStringBytes(value, field.dbFieldType === 14, context);
      writeCompressedStringOffset(record, field, compressedLength, context);
      const encoded = encodeCompressedString(bytes, field.dbFieldType === 14, codec, context, substitutedBytes);
      compressedParts.push(encoded);
      compressedLength += encoded.length;
    }
    records.push(record);
  }

  const storedCompressedLength = layout.hasCompressedStrings
    ? table.rows.length === 0 ? noCompressedStringBlockLength : compressedLength
    : 0;
  header.writeUInt32LE(storedCompressedLength, layout.compressedStringLengthOffset - layout.tableStart);
  header.writeUInt32LE(computeDbCrc(header.subarray(0, 32)), 32);

  const paddingLength = compressedLength > 0 ? roundUp(compressedLength, 8) - compressedLength : 0;
  const body = Buffer.concat([
    header.subarray(tableHeaderSize),
    ...records,
    ...compressedParts,
    Buffer.alloc(paddingLength)
  ]);
  const recordsCrc = Buffer.alloc(4);
  recordsCrc.writeUInt32LE(computeDbCrc(body), 0);
  if (substitutedBytes.size > 0) {
    warnings.push(`${layout.name}: ${substitutedBytes.size} UTF-8 byte value(s) absent from the original Huffman tree were saved as spaces, matching DB Master.`);
  }
  return Buffer.concat([header, ...records, ...compressedParts, Buffer.alloc(paddingLength), recordsCrc]);
}

function serializeDatabase(
  original: Buffer,
  parsed: WritableLayoutParse,
  changedTables: DataTable[],
  warnings: string[]
): Buffer {
  const changedByName = new Map(changedTables.map((table) => [table.name, table]));
  const writtenNames = new Set<string>();
  const tableBuffers: Buffer[] = [];

  for (const tableRef of parsed.tableRefs) {
    const layout = tableRef.layout;
    if (!layout) {
      const nextStart = parsed.tableRefs
        .map((candidate) => candidate.tableStart)
        .filter((start) => start > tableRef.tableStart)
        .sort((left, right) => left - right)[0] ?? parsed.databaseEnd;
      tableBuffers.push(Buffer.from(original.subarray(tableRef.tableStart, nextStart)));
      continue;
    }
    const changedTable = changedByName.get(layout.name);
    if (changedTable) {
      tableBuffers.push(buildChangedTable(original, layout, changedTable, warnings));
      writtenNames.add(layout.name);
    } else {
      tableBuffers.push(normalizeUnchangedTable(original, layout));
    }
  }

  const missing = [...changedByName.keys()].filter((name) => !writtenNames.has(name));
  if (missing.length > 0) {
    throw new Error(`Changed DB table layout was not found: ${missing.join(", ")}.`);
  }

  const headerAndDirectory = Buffer.from(original.subarray(parsed.databaseStart, parsed.tablesStartOffset));
  let databaseSize = headerAndDirectory.length;
  for (const tableBuffer of tableBuffers) {
    databaseSize += tableBuffer.length;
  }
  if (databaseSize > 0xffffffff) {
    throw new Error("Serialized database exceeds the 32-bit size limit.");
  }
  headerAndDirectory.writeUInt32LE(databaseSize, 8);

  const tablesStartRelative = parsed.tablesStartOffset - parsed.databaseStart;
  let tableOffset = 0;
  for (let index = 0; index < parsed.tableRefs.length; index += 1) {
    const offsetPosition = parsed.tableRefs[index].offsetPosition - parsed.databaseStart;
    headerAndDirectory.writeUInt32LE(tableOffset, offsetPosition);
    tableOffset += tableBuffers[index].length;
  }

  headerAndDirectory.writeUInt32LE(computeDbCrc(headerAndDirectory.subarray(0, 20)), 20);
  const directoryCrcRelative = parsed.directoryCrcOffset - parsed.databaseStart;
  headerAndDirectory.writeUInt32LE(
    computeDbCrc(headerAndDirectory.subarray(24, directoryCrcRelative)),
    directoryCrcRelative
  );
  if (headerAndDirectory.length !== tablesStartRelative) {
    throw new Error("Database table directory length changed unexpectedly.");
  }

  const database = Buffer.concat([headerAndDirectory, ...tableBuffers]);
  if (database.length !== databaseSize) {
    throw new Error("Serialized database size does not match its header.");
  }
  return Buffer.concat([
    original.subarray(0, parsed.databaseStart),
    database,
    original.subarray(parsed.databaseEnd)
  ]);
}

type WritableDatabaseProject = DbProject | LocalizationProject;

function saveSingleDatabaseProject(project: WritableDatabaseProject): SaveDatabaseResult {
  if (project.sourceKind !== "database" || !project.dbPath) {
    throw new Error("Open a DB/XML pair before saving a .db file.");
  }

  const original = readFileSync(project.dbPath);
  const parsed = parseWritableLayouts(original, project.descriptors);
  const warnings = [...parsed.warnings];
  const changedTables = project.tables.filter((table) => table.changed);
  if (changedTables.length === 0) {
    return {
      filePath: project.dbPath,
      warnings,
      tablesWritten: 0
    };
  }

  const output = serializeDatabase(original, parsed, changedTables, warnings);
  const backupPath = `${project.dbPath}.bak`;
  copyFileSync(project.dbPath, backupPath);
  writeFileSync(project.dbPath, output);
  return {
    filePath: project.dbPath,
    backupPath,
    warnings,
    tablesWritten: changedTables.length
  };
}

export function saveDatabaseProject(project: DbProject): SaveDatabaseResult {
  const mainResult = saveSingleDatabaseProject(project);
  if (!project.localization) {
    return mainResult;
  }

  const localizationResult = saveSingleDatabaseProject(project.localization);
  return {
    filePath: mainResult.filePath,
    backupPath: mainResult.backupPath,
    warnings: [
      ...mainResult.warnings,
      ...localizationResult.warnings.map((warning) => `Localization: ${warning}`)
    ],
    tablesWritten: mainResult.tablesWritten + localizationResult.tablesWritten
  };
}
