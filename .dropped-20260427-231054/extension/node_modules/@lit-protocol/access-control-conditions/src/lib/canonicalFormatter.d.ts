import { type OperatorAcc } from '@lit-protocol/access-control-conditions-schemas';
import { AccessControlConditions, AccsCOSMOSParams, AccsDefaultParams, AccsEVMParams, AccsParams, AccsSOLV2Params, ConditionItem, EvmContractConditions, JsonSigningResourceId, UnifiedAccessControlConditions } from '@lit-protocol/types';
/**
 *
 * Canonical Unified Access Control Condition Formatter
 *
 * @param { UnifiedAccessControlConditions | ConditionItem } cond
 * @returns { any[] | OperatorAcc | any }
 */
export declare const canonicalUnifiedAccessControlConditionFormatter: (cond: AccsParams | OperatorAcc | UnifiedAccessControlConditions) => OperatorAcc | any;
/**
*
* (SOLANA) Canonical Solana RPC Condition Formatter
*
* need to return in the exact format below:
* but make sure we don't include the optional fields:
 ---
  #[derive(Debug, Serialize, Deserialize, Clone)]
  #[serde(rename_all = "camelCase")]
  pub struct SolRpcCondition {
      pub method: String,
      pub params: Vec<serde_json::Value>,
      pub pda_params: Option<Vec<serde_json::Value>>,
      pub pda_interface: Option<SolPdaInterface>,
      pub chain: String,
      pub return_value_test: JsonReturnValueTestV2,
  }

  #[derive(Debug, Serialize, Deserialize, Clone)]
  #[serde(rename_all = "camelCase")]
  pub struct SolPdaInterface {
      pub offset: u64,
      pub fields: serde_json::Value,
  }
  ---
*
* @param { object } cond
* @param { boolean } requireV2Conditions
*
* @returns { any[] | OperatorAcc | AccsSOLV2Params | any }
*/
export declare const canonicalSolRpcConditionFormatter: (cond: ConditionItem | ConditionItem[], requireV2Conditions?: boolean) => any[] | OperatorAcc | ConditionItem | AccsSOLV2Params | any;
/**
*
* (DEFAULT) Canonical Access Control Condition Formatter
*
* need to return in the exact format below:
 ---
  pub struct JsonAccessControlCondition {
    pub contract_address: String,
    pub chain: String,
    pub standard_contract_type: String,
    pub method: String,
    pub parameters: Vec<String>,
    pub return_value_test: JsonReturnValueTest,
  }
  ---
*
* @param { AccsDefaultParams | OperatorAcc | AccessControlConditions } cond
*
* @returns { any[] | OperatorAcc | AccsDefaultParams | any }
*/
export declare const canonicalAccessControlConditionFormatter: (cond: AccsDefaultParams | OperatorAcc | AccessControlConditions) => any[] | OperatorAcc | AccsDefaultParams | any;
/**
*
* (EVM) Canonical EVM Contract Condition Formatter
*
*  need to return in the exact format below:
  ---
  pub struct JsonAccessControlCondition {
      pub contract_address: String,
      pub chain: String,
      pub standard_contract_type: String,
      pub method: String,
      pub parameters: Vec<String>,
      pub return_value_test: JsonReturnValueTest,
  }
  ---
*
* @param { AccsEVMParams | OperatorAcc | EvmContractConditions } cond
*
* @returns
*/
export declare const canonicalEVMContractConditionFormatter: (cond: AccsEVMParams | OperatorAcc | EvmContractConditions) => any[] | OperatorAcc | AccsEVMParams | any;
/**
*
* (COSMOS) Canonical Condition Formmater for Cosmos
*
* need to return in the exact format below:
 ---
  pub struct CosmosCondition {
      pub path: String,
      pub chain: String,
      pub return_value_test: JsonReturnValueTestV2,
  }
 ---
*
*
* @param { ConditionItem } cond
* @returns
*/
export declare const canonicalCosmosConditionFormatter: (cond: ConditionItem | ConditionItem[]) => any[] | OperatorAcc | AccsCOSMOSParams | any;
/**
 *
 * Canonical ResourceId Formatter returning JSON signing resource id
 *
 * @param { JsonSigningResourceId } resId
 *
 * @returns { JsonSigningResourceId }
 *
 */
export declare const canonicalResourceIdFormatter: (resId: JsonSigningResourceId) => JsonSigningResourceId;
