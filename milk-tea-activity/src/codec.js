'use strict';
const path = require('node:path');
const protobuf = require('protobufjs');
const root = new protobuf.Root().loadSync(path.join(__dirname, '../proto/activity.proto'), { keepCase: true });
root.resolveAll();
const prefix = 'gamepb.activitypb.';
function encode(type, value) {
  const messageType = root.lookupType(prefix + type);
  const message = messageType.fromObject(value);
  const error = messageType.verify(message);
  if (error) throw new Error(error);
  return Buffer.from(messageType.encode(message).finish());
}
function decode(type, bytes) {
  const messageType = root.lookupType(prefix + type);
  return messageType.toObject(messageType.decode(bytes), { longs: String, bytes: String, arrays: true, objects: true });
}
module.exports = { encode, decode };
