import { getRuntime } from "./runtime.js";

const ns = getRuntime().orpcTanstackQuery;

export default ns;

export const OPERATION_CONTEXT_SYMBOL = ns.OPERATION_CONTEXT_SYMBOL;
export const TANSTACK_QUERY_OPERATION_CONTEXT_SYMBOL =
  ns.TANSTACK_QUERY_OPERATION_CONTEXT_SYMBOL;
export const createGeneralUtils = ns.createGeneralUtils;
export const createProcedureUtils = ns.createProcedureUtils;
export const createRouterUtils = ns.createRouterUtils;
export const createTanstackQueryUtils = ns.createTanstackQueryUtils;
export const generateOperationKey = ns.generateOperationKey;
