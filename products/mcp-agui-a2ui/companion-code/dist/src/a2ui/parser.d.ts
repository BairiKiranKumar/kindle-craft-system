import { A2UIv091Node } from '../types/protocol.js';
export declare class A2UIParser {
    private static DSL_REGEX;
    private static PROP_REGEX;
    /**
     * Parses compact A2UI DSL string into typed A2UIv091Node array.
     * Example: OrderSummaryCard[orderId="ord_8801", totalUsd=339.97, status="DELIVERED"]
     */
    static parseDsl(dslText: string): A2UIv091Node[];
    /**
     * Validates and parses raw JSON AST payload conforming to A2UI v0.9.1 baseline.
     */
    static parseJsonAst(jsonString: string): A2UIv091Node[];
}
