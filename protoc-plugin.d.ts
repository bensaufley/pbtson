
module 'protoc-plugin' {
  import { FileDescriptorProto } from 'google-protobuf/google/protobuf/descriptor_pb';

  const CodeGeneratorRequest: (stdin: NodeJS.ReadStream) => Promise<void>;
  const CodeGeneratorResponse: (stdout: NodeJS.WriteStream) => (files: CodeGeneratorFile[]) => void;
  const CodeGeneratorResponseError: (stdout: NodeJS.WriteStream) => (err: Error) => void;
  const findCommentByPath: (path: object[], locationList: object[]) => string;

  type ProtoMethod = 'get' | 'post' | 'put' | 'patch' | 'pb_delete';

  export interface CodeGeneratorFile {
    name: string;
    content: string;
  }

  export type Proto = FileDescriptorProto.AsObject & { pb_package: string };

  export type SimplePluginCallback = (protos: Proto[]) => CodeGeneratorFile[] | Promise<CodeGeneratorFile[]>;

  const simplePlugin: (cb: SimplePluginCallback) => Promise<void>;

  simplePlugin.CodeGeneratorRequest = CodeGeneratorRequest;
  simplePlugin.CodeGeneratorResponse = CodeGeneratorResponse;
  simplePlugin.CodeGeneratorResponseError = CodeGeneratorResponseError;
  simplePlugin.findCommentByPath = findCommentByPath;

  export = simplePlugin;
}
