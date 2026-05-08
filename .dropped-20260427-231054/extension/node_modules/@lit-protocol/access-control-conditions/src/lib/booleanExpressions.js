"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isTokenOperator = isTokenOperator;
exports.isValidBooleanExpression = isValidBooleanExpression;
const access_control_conditions_schemas_1 = require("@lit-protocol/access-control-conditions-schemas");
function isTokenOperator(token) {
    return access_control_conditions_schemas_1.OperatorAccSchema.safeParse(token).success;
}
function isValidBooleanExpression(expression) {
    const STATES = {
        START: 'start',
        CONDITION: 'condition',
        OPERATOR: 'operator',
    };
    let currentState = STATES.START;
    for (const token of expression) {
        switch (currentState) {
            case STATES.START:
            case STATES.OPERATOR:
                if (isTokenOperator(token)) {
                    return false;
                }
                // Nested conditions expression
                if (Array.isArray(token) && !isValidBooleanExpression(token)) {
                    return false;
                }
                currentState = STATES.CONDITION;
                break;
            default:
                if (!isTokenOperator(token)) {
                    return false;
                }
                currentState = STATES.OPERATOR;
        }
    }
    return currentState === STATES.CONDITION;
}
//# sourceMappingURL=booleanExpressions.js.map