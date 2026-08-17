import { fail } from "../errors.mjs";

export class ByteReader {
  constructor(input, source = "<memory>") {
    this.bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
    this.source = source;
    this.offset = 0;
  }

  ensure(length) {
    if (!Number.isSafeInteger(length) || length < 0 || this.offset + length > this.bytes.length) {
      fail("MARSHAL_INVALID", `Unexpected end of Ruby Marshal data at ${this.source}:${this.offset}`);
    }
  }

  byte() {
    this.ensure(1);
    return this.bytes[this.offset++];
  }

  take(length) {
    this.ensure(length);
    const value = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  fixnum() {
    const encoded = this.byte();
    const signed = encoded >= 128 ? encoded - 256 : encoded;
    if (signed === 0) return 0;
    if (signed > 4) return signed - 5;
    if (signed < -4) return signed + 5;
    const length = Math.abs(signed);
    this.ensure(length);
    let value = signed > 0 ? 0 : -1;
    for (let index = 0; index < length; index += 1) {
      const shift = BigInt(index * 8);
      const mask = 0xffn << shift;
      value = Number((BigInt(value) & ~mask) | (BigInt(this.byte()) << shift));
    }
    return value;
  }

  sizedBytes() {
    const length = this.fixnum();
    if (length < 0) fail("MARSHAL_INVALID", `Negative byte-string length at ${this.source}:${this.offset}`);
    return this.take(length);
  }
}
