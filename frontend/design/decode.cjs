const fs = require('node:fs');
const zlib = require('node:zlib');
const { decodeBinarySchema, compileSchema } = require('./tools/node_modules/kiwi-schema');
const data = fs.readFileSync(__dirname + '/source/canvas.fig');
let offset = 12;
const chunks = [];
while (offset + 4 <= data.length) {
  const length = data.readUInt32LE(offset); offset += 4;
  const bytes = data.subarray(offset, offset + length); offset += length;
  chunks.push(bytes.readUInt32LE(0) === 0xfd2fb528 ? zlib.zstdDecompressSync(bytes) : zlib.inflateRawSync(bytes));
}
const schema = decodeBinarySchema(chunks[0]);
const message = compileSchema(schema).decodeMessage(chunks[1]);
fs.writeFileSync(__dirname + '/decoded.json', JSON.stringify(message));
console.log(Object.keys(message));
console.log('nodes', message.nodeChanges?.length);
console.log(JSON.stringify(message.nodeChanges?.slice(0, 5), null, 2));
