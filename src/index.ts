import {
  CodeGeneratorRequest, CodeGeneratorResponse,
} from 'google-protobuf/google/protobuf/compiler/plugin_pb';
import {
  DescriptorProto, EnumDescriptorProto, FieldDescriptorProto,
} from 'google-protobuf/google/protobuf/descriptor_pb';

import streamToPromise = require('stream-to-promise');

interface CodeGeneratorFile {
  name?: string;
  content?: string;
  insertion_point?: string;
}

const CodeGenReq = (input = process.stdin) => streamToPromise(input).then(
  (buffer) => CodeGeneratorRequest.deserializeBinary(new Uint8Array(buffer)),
);

const CodGenRes = (output = process.stdout) => (files: CodeGeneratorFile[]) => {
  const out = new CodeGeneratorResponse();
  files.forEach((f) => {
    const file = new CodeGeneratorResponse.File();
    if (f.name) file.setName(f.name);
    if (f.content) file.setContent(f.content);
    if (f.insertion_point) file.setInsertionPoint(f.insertion_point);
    out.addFile(file);
  });
  output.write(Buffer.from(out.serializeBinary()));
};

export default async (
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout,
  errstream: NodeJS.WriteStream = process.stderr,
) => {
  try {
    const req = (await CodeGenReq(input)).toObject();
    const protos = req.protoFileList.filter((p) => req.fileToGenerateList.indexOf(p.name!) !== -1);

    const files: CodeGeneratorFile[] = [];

    const referencedMessages = new Set();
    const referencedEnums = new Set();
    const messages = new Map();
    const enums = new Map();

    protos.forEach((proto) => {
      const createNamespaced = (typeName: string) => (
        typeName.replace(new RegExp(`^.(?:${(proto as any).pb_package}.)?`), '').replace(/\./g, '_')
      );

      const createEnum = (namespace: string, enumType: EnumDescriptorProto.AsObject) => {
        const enumName = `${namespace ? `${namespace}_` : ''}${enumType.name}`;
        const content = `export const enum ${enumName} {
  ${enumType.valueList.map(({ name, number }) => `${name} = ${number},`).join('\n  ')}
}`;
        enums.set(enumName, content);
      };

      const createMessage = (namespace: string, messageType: DescriptorProto.AsObject) => {
        const messageName = `${namespace ? `${namespace}_` : ''}${messageType.name}`;
        const content = `export interface ${messageName} {
  ${messageType.fieldList.map(({ name, type, typeName }) => {
          switch (type) {
            case FieldDescriptorProto.Type.TYPE_DOUBLE:
            case FieldDescriptorProto.Type.TYPE_FLOAT:
            case FieldDescriptorProto.Type.TYPE_INT32:
            case FieldDescriptorProto.Type.TYPE_INT64:
            case FieldDescriptorProto.Type.TYPE_UINT32:
            case FieldDescriptorProto.Type.TYPE_UINT64:
            case FieldDescriptorProto.Type.TYPE_FIXED32:
            case FieldDescriptorProto.Type.TYPE_FIXED64:
            case FieldDescriptorProto.Type.TYPE_SFIXED32:
            case FieldDescriptorProto.Type.TYPE_SFIXED64:
            case FieldDescriptorProto.Type.TYPE_SINT32:
            case FieldDescriptorProto.Type.TYPE_SINT64:
              return `${name}: number;`;
            case FieldDescriptorProto.Type.TYPE_BOOL:
              return `${name}: boolean;`;
            case FieldDescriptorProto.Type.TYPE_STRING:
            case FieldDescriptorProto.Type.TYPE_BYTES:
              return `${name}: string;`;
            case FieldDescriptorProto.Type.TYPE_MESSAGE: {
              const tn = createNamespaced(typeName!);
              referencedMessages.add(tn);
              return `${name}: ${tn};`;
            }
            case FieldDescriptorProto.Type.TYPE_ENUM: {
              const tn = createNamespaced(typeName!);
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
        name: `${(proto as any).pb_package}_pb.d.ts`,
      });
    });

    await CodGenRes(output)(files);
  } catch (err) {
    const out = new CodeGeneratorResponse();
    out.setError(err.toString());
    output.write(Buffer.from(out.serializeBinary()));
  }
};
