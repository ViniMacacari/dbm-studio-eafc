import { BitReader } from "./bitBuffer";
import type { DataTable, FieldDescriptor, TableDescriptor } from "../shared/types";

const databaseHeader = Buffer.from([0x44, 0x42, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00]);
const noCompressedStringBlockLength = 0xffffffff;

function columnsFromDescriptor(table: TableDescriptor): string[] {
  return table.fields.map((field) => field.name);
}

function supportedDepth(field: FieldDescriptor): number | undefined {
  if (field.kind === "float") {
    return 32;
  }
  if (field.depth !== undefined && field.depth > 0) {
    return field.depth;
  }
  return undefined;
}

function hasReadableShape(table: TableDescriptor): boolean {
  if (table.offset === undefined || table.recordCount === undefined) {
    return false;
  }
  return table.fields.every((field) => supportedDepth(field) !== undefined);
}

function decodeFixedString(bytes: Buffer): string {
  const end = bytes.indexOf(0);
  const value = end >= 0 ? bytes.subarray(0, end) : bytes;
  return value.toString("utf8");
}

interface HuffmanTree {
  child: number[][];
  leaf: number[][];
}

interface CompressedStringContext {
  buffer: Buffer;
  baseOffset: number;
  length: number;
  tree: HuffmanTree;
}

function readField(reader: BitReader, field: FieldDescriptor): string {
  if (field.kind === "float") {
    return String(reader.readFloatLE());
  }

  const depth = supportedDepth(field);
  if (depth === undefined) {
    return "";
  }

  if (field.kind === "string" && depth % 8 === 0) {
    return decodeFixedString(reader.readBytes(depth / 8));
  }

  const raw = reader.readBitsLE(depth);
  const value = field.kind === "integer" ? raw + field.rangeLow : raw;
  return String(value);
}

export function makeEmptyTable(descriptor: TableDescriptor): DataTable {
  return {
    name: descriptor.name,
    columns: columnsFromDescriptor(descriptor),
    fields: descriptor.fields,
    rows: []
  };
}

function readUnsignedBitsLE(record: Buffer, bitOffset: number, depth: number): number {
  return Number(readUnsignedBitsLEBigInt(record, bitOffset, depth));
}

function readUnsignedBitsLEBigInt(record: Buffer, bitOffset: number, depth: number): bigint {
  let value = 0n;
  for (let bit = 0; bit < depth; bit += 1) {
    const sourceBit = bitOffset + bit;
    const byte = record[sourceBit >> 3] ?? 0;
    if (((byte >> (sourceBit & 7)) & 1) === 1) {
      value |= 1n << BigInt(bit);
    }
  }
  return value;
}

function readHuffmanTree(buffer: Buffer, offset: number, nodeCount: number): HuffmanTree {
  const child: number[][] = [];
  const leaf: number[][] = [];
  for (let index = 0; index < nodeCount; index += 1) {
    const nodeOffset = offset + index * 4;
    child.push([buffer[nodeOffset] ?? 0, buffer[nodeOffset + 2] ?? 0]);
    leaf.push([buffer[nodeOffset + 1] ?? 0, buffer[nodeOffset + 3] ?? 0]);
  }
  return { child, leaf };
}

function readHuffmanString(buffer: Buffer, offset: number, outputLength: number, tree: HuffmanTree): string {
  if (outputLength <= 0) {
    return "";
  }

  if (tree.child.length === 0) {
    return decodeFixedString(buffer.subarray(offset, offset + outputLength));
  }

  const output = Buffer.alloc(outputLength);
  let outputIndex = 0;
  let nodeIndex = 0;
  let cursor = offset;

  while (outputIndex < outputLength && cursor < buffer.length) {
    const byte = buffer[cursor];
    cursor += 1;
    for (let bit = 7; bit >= 0; bit -= 1) {
      const direction = (byte >> bit) & 1;
      const childIndex = tree.child[nodeIndex]?.[direction] ?? 0;
      if (childIndex === 0) {
        output[outputIndex] = tree.leaf[nodeIndex]?.[direction] ?? 0;
        outputIndex += 1;
        nodeIndex = 0;
        if (outputIndex === outputLength) {
          break;
        }
      } else {
        nodeIndex = childIndex;
      }
    }
  }

  return decodeFixedString(output);
}

function readShortName(buffer: Buffer, offset: number): string {
  return buffer.subarray(offset, offset + 4).toString("latin1");
}

function normalizeCompressedStringLength(length: number): number {
  return length === noCompressedStringBlockLength ? 0 : length;
}

function descriptorMaps(descriptors: TableDescriptor[]): {
  byShortName: Map<string, TableDescriptor>;
  byName: Map<string, TableDescriptor>;
} {
  const byShortName = new Map<string, TableDescriptor>();
  const byName = new Map<string, TableDescriptor>();
  for (const descriptor of descriptors) {
    byName.set(descriptor.name, descriptor);
    if (descriptor.shortName) {
      byShortName.set(descriptor.shortName, descriptor);
    }
  }
  return { byShortName, byName };
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

function readCompressedString(
  record: Buffer,
  field: FieldDescriptor,
  context: CompressedStringContext | undefined,
  longString: boolean
): string {
  const bitOffset = field.bitOffset ?? 0;
  const byteOffset = bitOffset >> 3;
  if (byteOffset + 4 > record.length) {
    return "";
  }

  const compressedOffset = record.readInt32LE(byteOffset);
  if (!context || compressedOffset < 0) {
    return compressedOffset < 0 ? "" : String(compressedOffset);
  }

  const stringOffset = context.baseOffset + compressedOffset;
  const stringLimit = context.baseOffset + context.length;
  if (stringOffset < context.baseOffset || stringOffset >= stringLimit || stringOffset >= context.buffer.length) {
    return "";
  }

  if (longString) {
    if (stringOffset + 2 > stringLimit || stringOffset + 2 > context.buffer.length) {
      return "";
    }
    const outputLength = context.buffer.readUInt16BE(stringOffset);
    return readHuffmanString(context.buffer, stringOffset + 2, outputLength, context.tree);
  }

  if (stringOffset + 1 > stringLimit || stringOffset + 1 > context.buffer.length) {
    return "";
  }
  const outputLength = context.buffer.readUInt8(stringOffset);
  return readHuffmanString(context.buffer, stringOffset + 1, outputLength, context.tree);
}

function readDbField(record: Buffer, field: FieldDescriptor, compressedContext?: CompressedStringContext): string {
  const bitOffset = field.bitOffset ?? 0;
  const depth = field.depth ?? 0;

  switch (field.dbFieldType) {
    case 0: {
      const byteOffset = bitOffset >> 3;
      const byteLength = Math.ceil(depth / 8);
      return decodeFixedString(record.subarray(byteOffset, byteOffset + byteLength));
    }
    case 3: {
      const raw = readUnsignedBitsLE(record, bitOffset, depth);
      return String(raw + field.rangeLow);
    }
    case 4: {
      const byteOffset = bitOffset >> 3;
      if (byteOffset + 4 > record.length) {
        return "";
      }
      return String(record.readFloatLE(byteOffset));
    }
    case 13:
      return readCompressedString(record, field, compressedContext, false);
    case 14:
      return readCompressedString(record, field, compressedContext, true);
    default: {
      if (depth <= 0) {
        return "";
      }
      return String(readUnsignedBitsLE(record, bitOffset, depth));
    }
  }
}

function buildCompressedStringContext(
  database: Buffer,
  records: Buffer[],
  fields: FieldDescriptor[],
  compressedBaseOffset: number,
  compressedStringLength: number,
  tableName: string,
  warnings: string[]
): CompressedStringContext | undefined {
  const compressedFields = fields.filter((field) => field.dbFieldType === 13 || field.dbFieldType === 14);
  if (compressedFields.length === 0 || compressedStringLength <= 0) {
    return undefined;
  }

  let huffmanTreeSize = Number.MAX_SAFE_INTEGER;
  for (const record of records) {
    for (const field of compressedFields) {
      const byteOffset = (field.bitOffset ?? 0) >> 3;
      if (byteOffset + 4 > record.length) {
        continue;
      }
      const compressedOffset = record.readInt32LE(byteOffset);
      if (compressedOffset >= 0 && compressedOffset < huffmanTreeSize) {
        huffmanTreeSize = compressedOffset;
      }
    }
  }

  if (huffmanTreeSize === Number.MAX_SAFE_INTEGER) {
    huffmanTreeSize = 0;
  }

  if (compressedBaseOffset < 0 || compressedBaseOffset >= database.length) {
    warnings.push(`${tableName}: compressed string block is outside the database buffer.`);
    return undefined;
  }

  const readableLength = Math.min(compressedStringLength, database.length - compressedBaseOffset);
  if (readableLength < compressedStringLength) {
    warnings.push(`${tableName}: compressed string block is truncated.`);
  }

  const nodeCount = Math.floor(huffmanTreeSize / 4);
  if (compressedBaseOffset + nodeCount * 4 > database.length) {
    warnings.push(`${tableName}: Huffman tree is outside the database buffer.`);
    return undefined;
  }

  return {
    buffer: database,
    baseOffset: compressedBaseOffset,
    length: readableLength,
    tree: readHuffmanTree(database, compressedBaseOffset, nodeCount)
  };
}

function readFifaDatabaseByInternalLayout(dbBuffer: Buffer, descriptors: TableDescriptor[]): {
  tables: DataTable[];
  warnings: string[];
  mode: "descriptor" | "best-effort";
} | undefined {
  const headerOffset = dbBuffer.indexOf(databaseHeader);
  if (headerOffset < 0) {
    return undefined;
  }

  const warnings: string[] = [];
  const { byShortName } = descriptorMaps(descriptors);
  const databaseStart = headerOffset;
  const sizeOffset = databaseStart + databaseHeader.length;
  if (sizeOffset + 4 > dbBuffer.length) {
    throw new Error("Database header is truncated.");
  }

  const dbSize = dbBuffer.readUInt32LE(sizeOffset);
  const databaseEnd = databaseStart + dbSize;
  const database = databaseEnd <= dbBuffer.length ? dbBuffer.subarray(databaseStart, databaseEnd) : dbBuffer.subarray(databaseStart);

  let cursor = databaseHeader.length;
  const declaredSize = database.readUInt32LE(cursor);
  cursor += 4;
  if (declaredSize > database.length) {
    warnings.push(`Database size header says ${declaredSize} bytes, but the selected file has ${database.length} readable bytes.`);
  }

  cursor += 4;
  const tableCount = database.readUInt32LE(cursor);
  cursor += 4;
  cursor += 4;

  const tableRefs: Array<{ shortName: string; offset: number }> = [];
  for (let index = 0; index < tableCount; index += 1) {
    if (cursor + 8 > database.length) {
      warnings.push("Table directory ended earlier than expected.");
      break;
    }
    tableRefs.push({
      shortName: readShortName(database, cursor),
      offset: database.readUInt32LE(cursor + 4)
    });
    cursor += 8;
  }

  cursor += 4;
  const tablesStartOffset = cursor;
  const parsedTables = new Map<string, DataTable>();

  for (const tableRef of tableRefs) {
    const descriptor = byShortName.get(tableRef.shortName);
    if (!descriptor) {
      warnings.push(`Unknown DB table shortname ${tableRef.shortName}.`);
      continue;
    }

    let tableCursor = tablesStartOffset + tableRef.offset;
    if (tableCursor + 32 > database.length) {
      warnings.push(`${descriptor.name}: table header is outside the database buffer.`);
      parsedTables.set(descriptor.name, makeEmptyTable(descriptor));
      continue;
    }

    tableCursor += 4;
    const recordSize = database.readUInt32LE(tableCursor);
    tableCursor += 4;
    tableCursor += 4;
    const compressedStringLength = normalizeCompressedStringLength(database.readUInt32LE(tableCursor));
    tableCursor += 4;
    const recordsCount = database.readUInt16LE(tableCursor);
    tableCursor += 2;
    tableCursor += 2;
    tableCursor += 4;
    const fieldsCount = database.readUInt8(tableCursor);
    tableCursor += 1;
    tableCursor += 11;

    const xmlFieldsByShortName = new Map(descriptor.fields.filter((field) => field.shortName).map((field) => [field.shortName as string, field]));
    const dbFields: FieldDescriptor[] = [];

    for (let fieldIndex = 0; fieldIndex < fieldsCount; fieldIndex += 1) {
      if (tableCursor + 16 > database.length) {
        warnings.push(`${descriptor.name}: field directory ended earlier than expected.`);
        break;
      }
      const dbFieldType = database.readUInt32LE(tableCursor);
      const bitOffset = database.readUInt32LE(tableCursor + 4);
      const shortName = readShortName(database, tableCursor + 8);
      const depth = database.readUInt32LE(tableCursor + 12);
      tableCursor += 16;

      const xmlField = xmlFieldsByShortName.get(shortName);
      dbFields.push({
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
    }

    dbFields.sort((left, right) => (left.bitOffset ?? 0) - (right.bitOffset ?? 0));

    const recordsOffset = tableCursor;
    const records: Buffer[] = [];
    for (let rowIndex = 0; rowIndex < recordsCount; rowIndex += 1) {
      const recordOffset = recordsOffset + rowIndex * recordSize;
      if (recordOffset + recordSize > database.length) {
        warnings.push(`${descriptor.name}: record ${rowIndex + 1} is outside the database buffer.`);
        break;
      }
      records.push(database.subarray(recordOffset, recordOffset + recordSize));
    }

    const compressedContext = buildCompressedStringContext(
      database,
      records,
      dbFields,
      recordsOffset + recordsCount * recordSize,
      compressedStringLength,
      descriptor.name,
      warnings
    );

    const rows: string[][] = [];
    for (const record of records) {
      rows.push(dbFields.map((field) => readDbField(record, field, compressedContext)));
    }

    parsedTables.set(descriptor.name, {
      name: descriptor.name,
      columns: dbFields.map((field) => field.name),
      fields: dbFields,
      rows
    });
  }

  const tables = descriptors.map((descriptor) => {
    const table = parsedTables.get(descriptor.name);
    return table ?? makeEmptyTable(descriptor);
  });

  const parsedCount = parsedTables.size;
  return {
    tables,
    warnings,
    mode: parsedCount === descriptors.length ? "descriptor" : "best-effort"
  };
}

export function readDatabaseWithDescriptor(dbBuffer: Buffer, descriptors: TableDescriptor[]): {
  tables: DataTable[];
  warnings: string[];
  mode: "none" | "descriptor" | "best-effort";
} {
  const internalLayout = readFifaDatabaseByInternalLayout(dbBuffer, descriptors);
  if (internalLayout) {
    return internalLayout;
  }

  const warnings: string[] = dbBuffer.indexOf(databaseHeader) < 0
    ? ["Raw FIFA database header was not found. The selected .db may still be compressed or may not be a FIFA DB file."]
    : [];
  const tables: DataTable[] = [];
  let readableTables = 0;

  for (const descriptor of descriptors) {
    if (!hasReadableShape(descriptor)) {
      const table = makeEmptyTable(descriptor);
      table.warning = "Missing offset, record count, or bit depth information in XML descriptor.";
      tables.push(table);
      warnings.push(`${descriptor.name}: descriptor does not contain enough binary layout information to read rows.`);
      continue;
    }

    const rows: string[][] = [];
    const reader = new BitReader(dbBuffer, descriptor.offset);
    try {
      for (let rowIndex = 0; rowIndex < (descriptor.recordCount ?? 0); rowIndex += 1) {
        const row = descriptor.fields.map((field) => readField(reader, field));
        rows.push(row);
      }
      readableTables += 1;
      tables.push({
        name: descriptor.name,
        columns: columnsFromDescriptor(descriptor),
        fields: descriptor.fields,
        rows
      });
    } catch (error) {
      const table = makeEmptyTable(descriptor);
      table.warning = error instanceof Error ? error.message : String(error);
      tables.push(table);
      warnings.push(`${descriptor.name}: ${table.warning}`);
    }
  }

  if (descriptors.length > 0 && readableTables === 0) {
    warnings.push("The XML was parsed, but no table had enough binary layout data for direct DB reading.");
  }

  return {
    tables,
    warnings,
    mode: readableTables === 0 ? "none" : readableTables === descriptors.length ? "descriptor" : "best-effort"
  };
}
