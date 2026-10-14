export class A2UIParser {
    static DSL_REGEX = /([A-Za-z0-9_]+)\[(.*?)\]/g;
    static PROP_REGEX = /([A-Za-z0-9_]+)\s*=\s*(?:"([^"]*)"|(-?\d+(?:\.\d+)?)|([A-Za-z0-9_]+))/g;
    /**
     * Parses compact A2UI DSL string into typed A2UIv091Node array.
     * Example: OrderSummaryCard[orderId="ord_8801", totalUsd=339.97, status="DELIVERED"]
     */
    static parseDsl(dslText) {
        const nodes = [];
        let match;
        A2UIParser.DSL_REGEX.lastIndex = 0;
        while ((match = A2UIParser.DSL_REGEX.exec(dslText)) !== null) {
            const type = match[1];
            const propsString = match[2];
            const props = {};
            let propMatch;
            A2UIParser.PROP_REGEX.lastIndex = 0;
            while ((propMatch = A2UIParser.PROP_REGEX.exec(propsString)) !== null) {
                const key = propMatch[1];
                const stringVal = propMatch[2];
                const numVal = propMatch[3];
                const bareVal = propMatch[4];
                if (stringVal !== undefined) {
                    props[key] = stringVal;
                }
                else if (numVal !== undefined) {
                    props[key] = parseFloat(numVal);
                }
                else if (bareVal === 'true') {
                    props[key] = true;
                }
                else if (bareVal === 'false') {
                    props[key] = false;
                }
                else {
                    props[key] = bareVal;
                }
            }
            nodes.push({ version: '0.9.1', type, props });
        }
        return nodes;
    }
    /**
     * Validates and parses raw JSON AST payload conforming to A2UI v0.9.1 baseline.
     */
    static parseJsonAst(jsonString) {
        try {
            const parsed = JSON.parse(jsonString);
            if (Array.isArray(parsed)) {
                return parsed
                    .filter((item) => item && typeof item.type === 'string' && typeof item.props === 'object')
                    .map((item) => ({ version: '0.9.1', type: item.type, props: item.props, id: item.id }));
            }
            if (parsed && typeof parsed.type === 'string' && typeof parsed.props === 'object') {
                return [{ version: '0.9.1', type: parsed.type, props: parsed.props, id: parsed.id }];
            }
            return [];
        }
        catch {
            return [];
        }
    }
}
