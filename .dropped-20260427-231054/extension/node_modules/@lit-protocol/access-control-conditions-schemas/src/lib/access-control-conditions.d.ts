import { z } from 'zod';
import { type AtomAcc } from './AtomAcc';
import { type EvmBasicAcc } from './EvmBasicAcc';
import { type EvmContractAcc } from './EvmContractAcc';
import { type OperatorAcc } from './OperatorAcc';
import { type SolAcc } from './SolAcc';
export type AtomCondition = AtomAcc | OperatorAcc | AtomCondition[];
export type EvmBasicCondition = EvmBasicAcc | OperatorAcc | EvmBasicCondition[];
export type EvmContractCondition = EvmContractAcc | OperatorAcc | EvmContractCondition[];
export type SolRpcCondition = SolAcc | OperatorAcc | SolRpcCondition[];
export type ConditionItem = AtomAcc | EvmBasicAcc | EvmContractAcc | SolAcc | OperatorAcc;
export type UnifiedAccessControlCondition = ConditionItem | UnifiedAccessControlCondition[];
export declare const AtomConditionsSchema: z.ZodType<AtomCondition[]>;
export declare const EvmBasicConditionsSchema: z.ZodType<EvmBasicCondition[]>;
export declare const EvmContractConditionsSchema: z.ZodType<EvmContractCondition[]>;
export declare const SolRpcConditionsSchema: z.ZodType<SolRpcCondition[]>;
export declare const UnifiedConditionsSchema: z.ZodType<UnifiedAccessControlCondition[]>;
export declare const MultipleAccessControlConditionsSchema: z.ZodObject<{
    accessControlConditions: z.ZodOptional<z.ZodType<EvmBasicCondition[], z.ZodTypeDef, EvmBasicCondition[]>>;
    evmContractConditions: z.ZodOptional<z.ZodType<EvmContractCondition[], z.ZodTypeDef, EvmContractCondition[]>>;
    solRpcConditions: z.ZodOptional<z.ZodType<SolRpcCondition[], z.ZodTypeDef, SolRpcCondition[]>>;
    unifiedAccessControlConditions: z.ZodOptional<z.ZodType<UnifiedAccessControlCondition[], z.ZodTypeDef, UnifiedAccessControlCondition[]>>;
}, "strip", z.ZodTypeAny, {
    accessControlConditions?: EvmBasicCondition[] | undefined;
    evmContractConditions?: EvmContractCondition[] | undefined;
    solRpcConditions?: SolRpcCondition[] | undefined;
    unifiedAccessControlConditions?: UnifiedAccessControlCondition[] | undefined;
}, {
    accessControlConditions?: EvmBasicCondition[] | undefined;
    evmContractConditions?: EvmContractCondition[] | undefined;
    solRpcConditions?: SolRpcCondition[] | undefined;
    unifiedAccessControlConditions?: UnifiedAccessControlCondition[] | undefined;
}>;
export type MultipleAccessControlConditions = z.infer<typeof MultipleAccessControlConditionsSchema>;
