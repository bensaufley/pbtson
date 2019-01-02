// @ts-check
// eslint-disable-next-line
/// <reference types="./protoc-plugin" />

const protocPlugin = require('protoc-plugin');

// eslint-disable-next-line
/** @type {{[key: string]: import('google-protobuf/google/protobuf/descriptor_pb').FieldDescriptorProto.Type }} */
const ProtoFieldTypes = {
  TYPE_DOUBLE: 1,
  TYPE_FLOAT: 2,
  TYPE_INT64: 3,
  TYPE_UINT64: 4,
  TYPE_INT32: 5,
  TYPE_FIXED64: 6,
  TYPE_FIXED32: 7,
  TYPE_BOOL: 8,
  TYPE_STRING: 9,
  TYPE_GROUP: 10, // Not in proto3
  TYPE_MESSAGE: 11,
  TYPE_BYTES: 12,
  TYPE_UINT32: 13,
  TYPE_ENUM: 14,
  TYPE_SFIXED32: 15,
  TYPE_SFIXED64: 16,
  TYPE_SINT32: 17,
  TYPE_SINT64: 18,
};

module.exports = () => protocPlugin((protos) => {
  const files = [];

  const referencedMessages = new Set();
  const referencedEnums = new Set();
  const messages = new Map();
  const enums = new Map();

  protos.forEach((proto) => {
    /** @param {string} typeName */
    const createNamespaced = (typeName) => (
      typeName.replace(new RegExp(`^.(?:${proto.pb_package}.)?`), '').replace(/\./g, '_')
    );

    /**
     * @param {string} namespace
     * @param {import('google-protobuf/google/protobuf/descriptor_pb').EnumDescriptorProto.AsObject} enumType
     */
    const createEnum = (namespace, enumType) => {
      const enumName = `${namespace ? `${namespace}_` : ''}${enumType.name}`;
      const content = `export const enum ${enumName} {
  ${enumType.valueList.map(({ name, number }) => `${name} = ${number},`).join('\n  ')}
}`;
      enums.set(enumName, content);
    };

    /**
     *  @param {string} namespace
     *  @param {import('google-protobuf/google/protobuf/descriptor_pb').DescriptorProto.AsObject} messageType
     * */
    const createMessage = (namespace, messageType) => {
      const messageName = `${namespace ? `${namespace}_` : ''}${messageType.name}`;
      const content = `export interface ${messageName} {
  ${messageType.fieldList.map(({ name, type, typeName }) => {
    switch (type) {
      case ProtoFieldTypes.TYPE_DOUBLE:
      case ProtoFieldTypes.TYPE_FLOAT:
      case ProtoFieldTypes.TYPE_INT32:
      case ProtoFieldTypes.TYPE_INT64:
      case ProtoFieldTypes.TYPE_UINT32:
      case ProtoFieldTypes.TYPE_UINT64:
      case ProtoFieldTypes.TYPE_FIXED32:
      case ProtoFieldTypes.TYPE_FIXED64:
      case ProtoFieldTypes.TYPE_SFIXED32:
      case ProtoFieldTypes.TYPE_SFIXED64:
      case ProtoFieldTypes.TYPE_SINT32:
      case ProtoFieldTypes.TYPE_SINT64:
        return `${name}: number;`;
      case ProtoFieldTypes.TYPE_BOOL:
        return `${name}: boolean;`;
      case ProtoFieldTypes.TYPE_STRING:
      case ProtoFieldTypes.TYPE_BYTES:
        return `${name}: string;`;
      case ProtoFieldTypes.TYPE_MESSAGE: {
        const tn = createNamespaced(typeName);
        referencedMessages.add(tn);
        return `${name}: ${tn};`;
      }
      case ProtoFieldTypes.TYPE_ENUM: {
        const tn = createNamespaced(typeName);
        referencedEnums.add(tn);
        return `${name}: ${tn};`;
      }
      default:
        throw new Error(`Unknown field type ${type}/${typeName}`);
    }
  }).join('\n  ')}
}`;
      messages.set(messageName, content);
      messageType.enumTypeList.forEach((enumType) => {
        createEnum(messageName, enumType);
      });
      messageType.nestedTypeList.forEach((submessageType) => {
        createMessage(messageName, submessageType);
      });
    };

    if (proto.syntax !== 'proto3') {
      throw new Error(`Only proto3 supported. Found ${proto.syntax} in ${proto.name}`);
    }

    proto.messageTypeList.forEach((messageType) => {
      createMessage('', messageType);
    });
    proto.enumTypeList.forEach((enumType) => {
      createEnum('', enumType);
    });

    const missingEnums = new Set();
    const missingMessages = new Set();

    referencedEnums.forEach((enumName) => {
      if (!enums.has(enumName)) missingEnums.add(enumName);
    });

    referencedMessages.forEach((messageName) => {
      if (!messages.has(messageName)) missingMessages.add(messageName);
    });

    const errors = [];
    if (missingEnums.size > 0) {
      errors.push(`missing enums: ${[...missingEnums].join(', ')}`);
    }
    if (missingMessages.size > 0) {
      errors.push(`missing messages: ${[...missingMessages].join(', ')}`);
    }

    if (errors.length) {
      throw new Error(`Error outputting file:\n  ${errors.join('\n  ')}`);
    }

    const content = [...enums.values(), ...messages.values()].join('\n\n');

    files.push({
      content,
      name: `${proto.pb_package}_pb.d.ts`,
    });
  });

  return files;
});
