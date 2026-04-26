import { getRuntime } from "./runtime.js";

const ns = getRuntime().orpcClient;

export default ns;

export const AsyncIteratorClass = ns.AsyncIteratorClass;
export const COMMON_ORPC_ERROR_DEFS = ns.COMMON_ORPC_ERROR_DEFS;
export const DynamicLink = ns.DynamicLink;
export const ErrorEvent = ns.ErrorEvent;
export const EventPublisher = ns.EventPublisher;
export const ORPCError = ns.ORPCError;
export const ORPC_CLIENT_PACKAGE_NAME = ns.ORPC_CLIENT_PACKAGE_NAME;
export const ORPC_CLIENT_PACKAGE_VERSION = ns.ORPC_CLIENT_PACKAGE_VERSION;
export const consumeEventIterator = ns.consumeEventIterator;
export const createORPCClient = ns.createORPCClient;
export const createORPCErrorFromJson = ns.createORPCErrorFromJson;
export const createSafeClient = ns.createSafeClient;
export const eventIteratorToStream = ns.eventIteratorToStream;
export const eventIteratorToUnproxiedDataStream =
  ns.eventIteratorToUnproxiedDataStream;
export const fallbackORPCErrorMessage = ns.fallbackORPCErrorMessage;
export const fallbackORPCErrorStatus = ns.fallbackORPCErrorStatus;
export const getEventMeta = ns.getEventMeta;
export const isDefinedError = ns.isDefinedError;
export const isORPCErrorJson = ns.isORPCErrorJson;
export const isORPCErrorStatus = ns.isORPCErrorStatus;
export const mapEventIterator = ns.mapEventIterator;
export const onError = ns.onError;
export const onFinish = ns.onFinish;
export const onStart = ns.onStart;
export const onSuccess = ns.onSuccess;
export const resolveFriendlyClientOptions = ns.resolveFriendlyClientOptions;
export const safe = ns.safe;
export const streamToEventIterator = ns.streamToEventIterator;
export const toORPCError = ns.toORPCError;
export const withEventMeta = ns.withEventMeta;
