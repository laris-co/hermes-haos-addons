// Thin re-export so the rest of this package reads like paperclip's own
// in-tree adapters. The real types live in @paperclipai/adapter-utils.
export type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterSessionCodec,
  ServerAdapterModule,
} from "@paperclipai/adapter-utils";
